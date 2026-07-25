**Tamanho:** M · **Trilha:** Full

> Full porque toca o fluxo de geração do próximo plano (contrato de insumo do LLM) e introduz chamada LLM com gate de custo. Fatia 2 de 3 do `weekly-athlete-review` — **depende de `add-weekly-review-consolidation`** (Fatia 1). Backend + **front mínimo** (a renomeação de 2 campos do contrato, D13, exige PR coordenado no `menthoros-front`).

## Why

A Fatia 1 entrega a revisão determinística congelada — o **sinal estruturado** do que foi proposto ao coach (`recommendationType`, `adherenceStatus`, `dadosSuficientes`), mas **sem nenhuma narrativa**. Esta fatia adiciona a camada de IA — uma narrativa de foco por atleta (`nextWeekFocus`) — e **fecha o loop com a geração do próximo plano** e com o sinal de aprendizado (proposta da IA vs. edição do coach). Esse loop compõe com o sinal de revisão/aprovação de plano do coach (`PlanoReviewStatus`/`origemAprovacao`), que é o moat. É aqui que o custo/qualidade de LLM vive, isolado atrás de flag.

## What Changes

- `nextWeekFocus` gerado por **LLM atrás de flag**, recebendo o `recommendationType` congelado da Fatia 1 como **restrição** (não pode contrariar). Flag desligada ⇒ um **template determinístico** derivado do `recommendationType` (fallback desta fatia, não da F1)
- persistência de `nextWeekFocus` + `focusSource` (`LLM`|`TEMPLATE`, D12) como colunas aditivas na `tb_revisao_semanal`
- injeção da revisão como **insumo da geração do próximo plano**, restrita à **janela de validade** (semana imediatamente anterior + 7 dias de folga, D11)
- `consumedReviewOutcome` no **`PlanoSemanal`** (não na revisão, D9): `PENDING`|`NO_ADJUSTMENT`|`ADJUSTED`|`PLAN_REJECTED`|`NOT_CONSUMED`|`NO_COACH_IN_LOOP`, inferido **por heurística automática** — a revisão é 1:N com os planos que a consomem, e o desfecho é propriedade do plano que reagiu
- renomeação dos campos PT da `RevisaoSemanal` (`dadosSuficientes`→`sufficientData`, `percentualRealizacao`→`completionRate`) — padronização de idioma, PR coordenado com o front (D13)
- `RevisaoConsumidaEvent` — instrumentação do proxy de adoção
- coach-in-the-loop: revisão é insumo, nunca altera plano automaticamente, nunca exposta ao atleta

## Critérios de aceite

- **CA4 — Insumo da próxima prescrição.** DADO uma revisão **dentro da janela de validade** (semana imediatamente anterior + 7 dias, D11), QUANDO o próximo plano é gerado com a flag de injeção ligada, ENTÃO a geração consome `nextWeekFocus` e `recommendationType` como contexto e grava o vínculo `revisao_semanal_id` no plano; DADO uma revisão fora da janela, ENTÃO ela não é consumida (`NOT_CONSUMED`, sem chamada nem custo).
- **CA5 — Coach-in-the-loop.** DADO uma revisão, ENTÃO ela nunca altera o plano automaticamente sem ação do coach e nunca é exposta ao atleta.
- **CA8 — Sinal de aprendizado.** DADO um plano que consumiu uma revisão, QUANDO ele é aprovado pelo coach sem treino editado/adicionado, aprovado com treino editado/adicionado, rejeitado, ou auto-aprovado por `AUTO_CONFIANCA_ALTA`, ENTÃO o sistema registra em `PlanoSemanal.consumedReviewOutcome` respectivamente `NO_ADJUSTMENT`, `ADJUSTED`, `PLAN_REJECTED` ou `NO_COACH_IN_LOOP`; DADO um plano que não consumiu revisão, ENTÃO registra `NOT_CONSUMED` (heurística da D9 — sem superfície nova de UI).
- **CA-Fonte — Rastreabilidade do foco.** DADO uma revisão com `nextWeekFocus`, ENTÃO `focusSource` registra se ele veio do LLM ou do template, permitindo segmentar o sinal de aprendizado por regime (D12).
- **CA-LLM — Consistência e kill-switch.** DADO a flag da narrativa desligada, QUANDO a revisão é gerada, ENTÃO `nextWeekFocus` é o template determinístico (derivado do `recommendationType`), sem chamada LLM; DADO a flag ligada, ENTÃO a narrativa é consistente com o `recommendationType` (nunca sugere progressão quando o tipo é RECOVERY/MAINTAIN).

## Métrica de sucesso

- **Proxy de adoção:** ≥70% dos planos seguintes gerados **consumindo** a revisão (`RevisaoConsumidaEvent`; complemento de `NOT_CONSUMED`).
- **Sinal de aprendizado (moat):** taxa de `NO_ADJUSTMENT` vs. `ADJUSTED`/`PLAN_REJECTED`, **segmentada por `focusSource`** — registrada para compor com o sinal de revisão de plano do coach. `NOT_CONSUMED` e `NO_COACH_IN_LOOP` ficam fora do denominador: são ausência de julgamento, não julgamento negativo.
- **Leitura honesta do sinal:** é proxy de segunda ordem (mede edição do plano, não concordância com o foco) — usar agregado, nunca como decisão individual.

## Gate do founder (bloqueante antes do rollout — não bloqueia `/implement init`)

- **A1 — Custo LLM (agora com contrapartida de valor).** ~1 chamada/semana/atleta. Com `focusSource` (D12), o gate deixa de ser só custo: dá para comparar a taxa de `NO_ADJUSTMENT` entre os regimes `LLM` e `TEMPLATE` e ver se a narrativa por IA muda o comportamento do coach o bastante para justificar o gasto. Validar em canary o custo real por atleta/mês contra o envelope de R$1,10 via `CostTrackingAdvisor` (Micrometer, tags `model`+`route`; para custo por atleta estender tags — cardinalidade — ou persistir por chamada, precedente `SkillExecution`). **Critério de decisão se estourar:** (a) manter a flag desligada (fica no template determinístico); (b) reduzir cadência (quinzenal); (c) gerar só sob demanda quando o coach abrir. A narrativa nasce atrás de flag, então o custo é aferido sem travar o desenvolvimento.

## Open Questions & Assumptions

- **A2 — Gatilho (corrigido 2026-07-25).** `nextWeekFocus` é gerado **no encerramento da semana**, no mesmo ponto de extensão da Fatia 1 — que é `RevisaoSemanalListener.aoEncerrarSemana` → `RevisaoSemanalService.gerarNoEncerramento`, **não** o `EncerramentoSemanaService` (esse só publica o `SemanaEncerradaEvent`). A chamada LLM roda em `@Async` com executor dedicado, fora da thread do encerramento (D8). O desfecho (`consumedReviewOutcome`) é registrado depois, na aprovação/rejeição do próximo plano, no próprio plano.
- **Sequenciamento invertido com a F3 (assumido).** A Fatia 3 (`add-weekly-review-coach-card`) foi mergeada antes desta. O card **já renderiza `nextWeekFocus` quando presente** (`WeeklyReviewCard.tsx:81`), então a narrativa aparece sem trabalho de front adicional — o que falta é um **controle** para o coach declarar o desfecho. Por isso o `consumedReviewOutcome` é inferido por heurística (D9). Dar ao coach um controle explícito de desfecho (que substituiria a heurística) fica para uma fatia de frontend posterior, fora deste escopo.
- **Toque no front nesta fatia** limita-se à renomeação dos 2 campos do contrato (D13) — tipo, adapter e testes do card. Nenhuma superfície nova.
- Depende do `recommendationType` congelado e da `tb_revisao_semanal` da Fatia 1.

## Capabilities

### Modified Capabilities

- `weekly-athlete-review` (adiciona a narrativa `nextWeekFocus` + `focusSource`, o insumo no plano com janela de validade, e o `consumedReviewOutcome` no `PlanoSemanal`, sobre o sinal determinístico da Fatia 1)

## Impact

**Produto:** transforma o sinal determinístico da revisão em "insight" personalizado ao coach e fecha o loop de aprendizado.

**Backend:**
- geração de `nextWeekFocus` via infra LLM existente atrás de flag `menthoros.weekly-review.llm.enabled`, em `@Async` com executor dedicado (D8)
- migration **V72**: aditivas (`next_week_focus`, `focus_source` em `tb_revisao_semanal`; `revisao_semanal_id`, `consumed_review_outcome` em `tb_plano_semanal`) + renames (`dados_suficientes`→`sufficient_data`, `percentual_realizacao`→`completion_rate`)
- ponto de integração `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt`
- `RevisaoConsumidaEvent{tenant, atleta, semanaInicio, revisaoId, planoId}`
- checker determinístico de consistência da narrativa (D10)

**Frontend (`menthoros-front`, mínimo):** renomear `dadosSuficientes`/`percentualRealizacao` no tipo, no adapter e nos testes do card da F3 (18 referências). PR coordenado com o backend — há janela curta de campo `undefined` entre os dois merges (D13).

**Fora de escopo:** card no shell do coach (Fatia 3); métricas `.fit`; notificação ao atleta.
