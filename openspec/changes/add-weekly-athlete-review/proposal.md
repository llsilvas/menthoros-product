**Tamanho:** M · **Trilha:** Full

> Full porque introduz schema novo (tabela de revisão semanal) e toca o fluxo de geração do próximo plano (contrato de insumo do LLM). v1 é backend-only e usa apenas dado de log manual — sem métricas de zona derivadas de `.fit`.

## Why

A revisão semanal é uma das atividades mais repetitivas e mais importantes na rotina do treinador: fechar a semana de cada atleta (aderência, carga, fadiga, evolução) e decidir o foco da semana seguinte. Feita à mão, ela não escala — é o gargalo direto de "quantos atletas um treinador consegue atender bem". Consolidá-la automaticamente ataca a estrela-guia (tempo do treinador) e reforça o posicionamento de copiloto técnico.

Escopo desta change é a **v1 simplificada** (decisão do founder, CPO review 2026-07-24): consolida sobre o **dado do log manual** já disponível (treinos planejados/realizados, PMC/TSB, análises pós-treino quando existirem), **sem** depender de `first-party-ingestion-architecture` nem de métricas de zona `.fit`. O enriquecimento com dado `.fit` fica como upgrade posterior.

## What Changes

- nova capability `weekly-athlete-review`
- consolidação **determinística** da semana por atleta: aderência (planejado vs realizado, treinos-chave), carga (TSS realizado vs planejado), fadiga (TSB no fim da janela e delta), evolução
- `nextWeekFocus` — recomendação de foco da semana seguinte, gerada por IA (narrativa) sobre os sinais consolidados, entregue ao treinador **como insumo/sugestão** (coach-in-the-loop, nunca aplicada automaticamente ao plano nem exposta ao atleta)
- persistência da revisão por janela semanal explícita (`semanaInicio`/`semanaFim`), idempotente
- disponibilização da revisão mais recente como **insumo da geração do próximo plano**
- instrumentação da métrica de sucesso e do sinal de aprendizado (foco proposto mantido vs. editado/rejeitado)

## Critérios de aceite

- **CA1 — Contrato mínimo.** DADO um atleta com treinos na semana, QUANDO a revisão é gerada para `[semanaInicio, semanaFim]`, ENTÃO o resultado contém `semanaInicio`, `semanaFim`, `adherenceSummary` (% e treinos-chave realizados/planejados), `trainingLoadSummary` (TSS realizado vs planejado), `fatigueSummary` (TSB final + delta), `progressionSummary`, `nextWeekFocus` não-vazio e `confidence`.
- **CA2 — Baixa aderência bloqueia progressão.** DADO um atleta cujo TSS realizado na semana ficou <60% do TSS planejado OU que deixou sem realizar ≥1 treino de alta criticidade (proxy determinístico existente: `TipoTreino.getFatorImpacto() ≥ 1.15` — não há conceito nomeado de "treino-chave" no backend, ver Code Anchors no design), QUANDO a revisão é gerada, ENTÃO `adherenceSummary.status = BAIXA` e o campo determinístico `recommendationType ∈ {RECOVERY, MAINTAIN}` — nunca `PROGRESS`. (Testável sobre o campo estruturado, não sobre a narrativa; o `nextWeekFocus` recebe o `recommendationType` como restrição — ver design D4.)
- **CA3 — Dados insuficientes.** DADO uma janela com <2 treinos realizados OU sem ao menos 1 ponto de PMC/TSB válido, QUANDO a revisão é gerada, ENTÃO `confidence = BAIXA` e `recommendationType ≠ PROGRESS`.
- **CA4 — Insumo da próxima prescrição.** DADO uma revisão semanal mais recente do atleta, QUANDO o próximo plano semanal é gerado, ENTÃO a geração consome `nextWeekFocus` e `risks` da revisão como contexto (verificável: o insumo de geração inclui a revisão — ponto de integração documentado em design.md).
- **CA5 — Coach-in-the-loop.** DADO uma revisão gerada, ENTÃO ela é exposta ao treinador como insumo/sugestão e NUNCA aplicada automaticamente ao plano sem ação do coach, NUNCA exposta ao atleta.
- **CA6 — Janela idempotente.** DADO a mesma janela `[semanaInicio, semanaFim]` de um atleta, QUANDO a revisão é (re)gerada, ENTÃO ela é atualizada in-place — não duplica registro — e a janela é sempre explícita na consulta.
- **CA7 — Isolamento multi-tenant.** DADO revisões de tenants distintos, QUANDO consultadas/geradas, ENTÃO cada operação respeita o `TenantContext` — nenhuma revisão vaza entre tenants.
- **CA8 — Sinal de aprendizado.** DADO uma revisão cujo `nextWeekFocus` foi apresentado na geração do próximo plano, QUANDO o treinador mantém, edita ou descarta o foco, ENTÃO o sistema registra `focusOutcome ∈ {MANTIDO, EDITADO, DESCARTADO}` associado à revisão.

## Métrica de sucesso

- **Primária (rotina do treinador):** mediana de minutos que o treinador gasta para revisar/fechar a semana de um atleta cai para ≤ 50% do baseline (baseline a instrumentar no rollout).
- **Proxy instrumentável na v1** (enquanto não há telemetria de tempo): ≥70% dos planos da semana seguinte gerados **consumindo** a revisão como insumo (`nextWeekFocus` não descartado).
- **Sinal de aprendizado (moat):** taxa de `nextWeekFocus` mantido vs. editado/rejeitado pelo treinador ao gerar/aprovar o próximo plano — registrada via `focusOutcome` (CA8) para compor com o sinal do `WeekSuggestion`.

**Instrumentação concreta (v1):** o proxy "consome a revisão" é medido por um evento/log estruturado nomeado emitido pela geração de plano quando o `nextWeekFocus` entra no insumo (ex.: `RevisaoConsumidaEvent{ tenant, atleta, semanaInicio }`); a razão consumidas/geradas é derivada dele. Adoção não é inferida por presença de campo.

## Gate do founder (bloqueante antes do rollout — não bloqueia `/implement init`)

- **A1 — Custo LLM.** Só o `nextWeekFocus` (narrativa) usa LLM; a consolidação é determinística ⇒ ~1 chamada/semana/atleta. Validar em canary o custo real por atleta/mês contra o envelope de R$1,10 (pergunta aberta do CPO review). **Critério de decisão se estourar** (nesta ordem): (a) desligar a narrativa LLM via flag e manter `nextWeekFocus` template sobre o `recommendationType` determinístico; (b) reduzir cadência (quinzenal); (c) gerar só sob demanda quando o coach abrir a revisão. A implementação **pode começar** — a narrativa LLM nasce atrás de flag (design D8), então o custo é aferido em canary sem travar o desenvolvimento.

## Assumptions (decisões v1)

- **A2 — Gatilho.** Revisão calculada **sob demanda** (coach abre a revisão ou gera o próximo plano), idempotente por janela. Job automático de fechamento semanal fica pós-v1.
- **A3 — Criticidade de treino (ex-"treino-chave").** Confirmado no código: NÃO existe conceito nomeado de treino-chave; aderência é count/TSS-based (`MetricasAdesaoService`). v1 usa como proxy de criticidade o `TipoTreino.getFatorImpacto() ≥ 1.15` (existente), sem criar campo novo. Fontes em Code Anchors (design.md).
- **A4 — Histórico (ex-Q1).** v1 persiste só a janela corrente (idempotente); tendência semana-a-semana fica fora de escopo.
- **A5 — Superfície (ex-Q2).** v1 é backend-only (endpoint + consumo pela geração de plano); UI dedicada é fast-follow.

## Capabilities

### New Capabilities

- `weekly-athlete-review`

## Impact

**Produto:**
- reduz o esforço operacional mais repetitivo do treinador (fechar a semana)
- reforça a proposta de copiloto técnico e aumenta atletas atendidos por treinador
- alimenta o loop de aprendizado (foco proposto vs. editado) — compõe com o moat do `WeekSuggestion`

**Backend:**
- nova entidade/tabela de revisão semanal (migration aditiva) com janela explícita e unicidade por `(tenant, atleta, semanaInicio)`
- serviço de consolidação determinística + geração de `nextWeekFocus` via infra LLM existente
- ponto de integração com a geração do próximo plano (insumo)
- respeito ao `TenantContext` em geração e consulta

**Não-Backend (fora de escopo v1):** superfície visual dedicada no shell do coach, notificação ao atleta, métricas de zona/decoupling `.fit`.
