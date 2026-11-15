**Tamanho:** M · **Trilha:** Full

> **Ticket 9** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 5, 6, 7) e decisões
> vivem no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-weekly-context` (ticket 8).

## Why

A temporada passa a guiar a carga da semana: o `tssAlvo` aprovado vira o alvo, com as proteções de
segurança por cima e sem compensação de semana perdida. É aqui que a temporada deixa de ser só texto
no prompt.

## What Changes

Tasks do épico: **5.6–5.9, 5.11, 5.11a, 5.11b, 5.13–5.15, 10.4**.

- `LoadTargetResolver` usa o `tssAlvo` como baseline, sem step-back; `PlannerEngine` não reaplica taper
- Teto de rampa e cold-start continuam por cima; desvio e motivo no `WeekPlanSkeleton`
- `SessionCompositionResolver` recebe sessões-chave e longão da semana
- Compliance: `TSS_FORA_DA_FAIXA` centrado no `tssAlvo`; `LONGAO_DIVERGENTE_DO_MACRO` em km
  (`distanciaKm` no `GeneratedSessionSnapshot`); `LONGO_ACIMA_TETO` suspenso quando o longão segue o
  previsto
- Delta entre o alvo da temporada e o plano aprovado pelo treinador
- ADR: "temporada como teto, não piso" e precedência segurança > temporada > progressão

## Critérios de aceite

- **Dado** uma semana que pede 620 TSS com teto de rampa de 540, **quando** o plano é gerado, **então** o
  alvo resolvido é 540, o skeleton registra o desvio com o motivo e a semana da temporada não muda.
- **Dado** uma semana de taper, **quando** o plano é gerado, **então** o alvo é o `tssAlvo` da semana, sem
  segunda redução da `TaperStrategy`.
- **Dado** que a progressão reativa indicaria aumento, **quando** o alvo é resolvido, **então** fica no
  valor da temporada.
- **Dado** 40% do volume realizado na semana anterior, **quando** a seguinte é gerada, **então** o alvo
  continua o da temporada, sem acréscimo compensatório.
- **Dado** lesão ou pós-prova, **quando** o alvo é resolvido, **então** a redução atual se aplica sobre o
  baseline da temporada.
- **Dado** `planner-engine.enabled = true` e volume fora da banda, **quando** o plano é persistido,
  **então** nasce com revisão obrigatória e a violação registrada, sem 422.
- **Dado** `macrociclo.enforcement.enabled=false`, **então** nada muda em relação à S8.

## Métrica de sucesso

A primária do épico: queda relativa ≥ 20% na taxa de `consumedReviewOutcome = ADJUSTED` dos planos
semanais de atletas com temporada ativa.

## Bloqueado por

- `add-season-plan-weekly-context` (ticket 8).

## Dependências e rollout

- Só tem efeito com `planner-engine.enabled=true`.
- Flag: `macrociclo.enforcement.enabled=false`.
