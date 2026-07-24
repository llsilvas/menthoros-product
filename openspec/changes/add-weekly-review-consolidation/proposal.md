**Tamanho:** M · **Trilha:** Full

> Full porque introduz schema novo (tabela de revisão semanal) e expõe endpoint de leitura. Backend-only, **100% determinístico — sem LLM** (logo, sem o gate de custo A1). É a Fatia 1 de 3 do `weekly-athlete-review`; as fatias `add-weekly-review-llm-focus` (narrativa por IA + insumo no plano) e `add-weekly-review-coach-card` (leitura no shell do coach) dependem desta.

## Why

Fechar a semana de cada atleta (aderência, carga, fadiga, evolução) é a tarefa mais repetitiva do treinador e não escala manualmente. Esta fatia entrega o **núcleo determinístico** dessa consolidação e o expõe por um endpoint — a base sobre a qual a narrativa por IA (Fatia 2) e a leitura no shell do coach (Fatia 3) se apoiam. Determinístico primeiro: valor testável, custo zero de LLM, risco isolado.

Escopo v1 (decisão do founder, CPO review 2026-07-24): consolida sobre o **dado do log manual** já disponível (planejado/realizado, PMC/TSB), **sem** métricas de zona `.fit` e **sem** depender de `first-party-ingestion-architecture`.

## What Changes

- nova capability `weekly-athlete-review` (parte determinística)
- consolidação determinística por janela: aderência (planejado vs realizado), carga (TSS realizado vs planejado), fadiga (TSB final + delta), evolução
- `recommendationType` determinístico (RECOVERY|MAINTAIN|PROGRESS) a partir dos sinais consolidados
- `weekOverWeekDelta` — comparação com a revisão da semana anterior (Δaderência, ΔTSS, ΔTSB, transição de `recommendationType`)
- `confidence` (ALTA|BAIXA) rebaixada em semana com dados insuficientes
- `nextWeekFocus` **template determinístico** derivado do `recommendationType` (a narrativa por LLM entra na Fatia 2, substituindo o template)
- persistência por janela explícita (`semanaInicio`/`semanaFim`), idempotente
- endpoint `GET` read-only da revisão, **coach-only**, sob `TenantContext`

## Critérios de aceite

- **CA1 — Contrato mínimo.** DADO um atleta com treinos na semana, QUANDO a revisão é gerada para `[semanaInicio, semanaFim]`, ENTÃO o resultado contém `semanaInicio`, `semanaFim`, `adherenceSummary` (status + %), `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `recommendationType`, `weekOverWeekDelta`, `confidence` e `nextWeekFocus` (template não-vazio).
- **CA2 — Baixa aderência bloqueia progressão.** DADO TSS realizado <60% do planejado OU ≥1 treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) não realizado, QUANDO a revisão é gerada, ENTÃO `adherenceSummary.status = BAIXA` e `recommendationType ∈ {RECOVERY, MAINTAIN}` — nunca `PROGRESS`.
- **CA3 — Dados insuficientes.** DADO uma janela com <2 treinos realizados OU sem ponto de PMC/TSB válido, QUANDO a revisão é gerada, ENTÃO `confidence = BAIXA` e `recommendationType ≠ PROGRESS`.
- **CA6 — Janela idempotente.** DADO a mesma janela de um atleta, QUANDO a revisão é (re)gerada, ENTÃO ela é atualizada in-place — não duplica registro.
- **CA7 — Isolamento multi-tenant.** DADO revisões de tenants distintos, QUANDO geradas/consultadas, ENTÃO cada operação respeita o `TenantContext`; o endpoint de leitura é coach-only e não expõe ao atleta.
- **CA9 — Delta semana-a-semana.** DADO que existe revisão da semana anterior, QUANDO a corrente é gerada, ENTÃO `weekOverWeekDelta` traz Δaderência, ΔTSS, ΔTSB e a transição de `recommendationType`; sem anterior ⇒ `PRIMEIRA_SEMANA` (nulo, sem erro).

## Métrica de sucesso

- **Desta fatia (correção):** a revisão gerada é completa, determinística e reprodutível (mesma janela ⇒ mesmo resultado), e recuperável pelo endpoint read-only.
- **North Star (realizada com a Fatia 3):** mediana de minutos que o treinador gasta para fechar a semana de um atleta cai para ≤ 50% do baseline. Esta fatia é o pré-requisito de dado.

## Open Questions & Assumptions

- **A2 — Gatilho.** Revisão calculada **sob demanda** (idempotente por janela). Job automático fica pós-v1.
- **A3 — Criticidade de treino (ex-"treino-chave").** Confirmado no código: NÃO existe conceito nomeado; aderência é count/TSS-based (`MetricasAdesaoService`). Proxy de criticidade `TipoTreino.getFatorImpacto() ≥ 1.15` (existente). Ver Code Anchors (design.md).
- **Sem gate A1:** esta fatia não usa LLM, portanto não há gate de custo.

## Capabilities

### New Capabilities

- `weekly-athlete-review`

## Impact

**Produto:** entrega a base da revisão semanal; sozinha não é vista pelo coach (isso é a Fatia 3), mas destrava as outras duas.

**Backend:**
- nova entidade/tabela `tb_revisao_semanal` (migration aditiva), unicidade `(tenant, atleta, semanaInicio)`
- serviço de consolidação determinística + `recommendationType` + `weekOverWeekDelta`
- endpoint `GET` read-only coach-only sob `TenantContext`

**Fora de escopo desta fatia:** narrativa por LLM e insumo no plano (Fatia 2); card no shell do coach (Fatia 3); métricas `.fit`, notificação ao atleta, tendência multi-semana.
