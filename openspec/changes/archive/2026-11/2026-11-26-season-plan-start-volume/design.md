# Design — season-plan-start-volume

## D1 — Volume de partida: mediana de 8 semanas

`SeasonPlanServiceImpl.resolverVolume` hoje soma os km de `[segunda − 4 semanas, segunda − 1 dia]` e
divide por 4. Passa a buscar `[segunda − 8 semanas, segunda − 1 dia]` numa consulta só, agrupar por
semana (segunda a domingo, semana sem treino = 0) e tirar a mediana (média do 4º e 5º valores). Devolve
um record `StartVolume(km, source, history)`; mediana 0 → onboarding (`ONBOARDING`) → 422 sem ele.

## D2 — Longão de partida

`L0` = maior `distanciaKm` de treino com `contaNaCarga` e `tipoTreino != PROVA` em
`[segunda − 6 semanas, segunda − 1 dia]`, da mesma consulta de D1. `SeasonPlanner.plan` e
`planWithPhases` ganham o parâmetro `@Nullable BigDecimal startLongRunKm`; `longao(...)` passa a ser:

```
base  = L0 == null ? volume × 0,28 : max(volume × 0,28, L0 × volume / partida)
longao = min(base, volume × 0,50, tetoLongao(distância)); descarga → × 0,75; RACE_WEEK → nulo
```

A proporção ao volume faz o longão seguir a curva (rampa, descargas, polimento) sem regra nova. O
`SeasonPlanValidator` não muda (alerta de 30%); o texto do alerta na tela é que muda (front).

## D3 — Persistência (V122)

`tb_plano_treino`, colunas nulas, sem backfill:
- `initial_long_run_km NUMERIC(4,1)` — `L0` (ou o informado no recálculo).
- `proposed_volume_km NUMERIC(4,1)` — volume que o motor propôs; nunca muda depois da geração.
- `initial_volume_source VARCHAR(16)` com `CHECK IN ('MEDIAN','ONBOARDING','COACH')`.
- `initial_volume_history JSONB` — `[{"weekStart":"2026-09-28","km":29.2}, ...]`, 8 itens.

`SeasonPlanVersioning.criarRascunho` (cópia campo a campo, `SeasonPlanVersioning.java:80-95`) copia as
quatro. Persistir a evidência evita que a tela mostre uma janela diferente da usada (importações
retroativas, treinos novos).

## D4 — Recálculo da v1

`SeasonPlanAdjustmentServiceImpl.recalculate`:
- Guarda (`:167`): aceita rascunho (como hoje) **ou** `PROPOSED && version == 1 && baseSeasonPlanId == null`.
- Trava: regra única num helper novo, `SeasonWeekLock.forPlan(plano, weekStart, hoje, dataProva)`: na v1
  PROPOSED sem base, só `COMPLETED` trava; em todo o resto, a regra de hoje (`of`). Usado nos três
  lugares que hoje chamam `of` para uma temporada: `recalculate`, `updateWeek` e o
  `SeasonPlanResponseMapper` (`:94`, flag `locked` da semana). Assim tela, edição e recálculo concordam.
- `SeasonPlanRecalculateInputDto` ganha `startLongRunKm` opcional; nulo → o persistido. A rota não usa
  `@Valid` (`SeasonPlanController.java:180`): o service valida, como já faz com `startVolumeKm` em
  `validarRecalculo` — positivo, até 42,2, uma casa decimal; inválido → 422 com mensagem. Passa para
  `planWithPhases`.
- Semanas `COACH` preservadas por inteiro (já é assim em `:208`), inclusive `longRunKm`.
- Grava `initial_volume_km`, `initial_long_run_km` e `initial_volume_source = COACH`; não toca
  `proposed_volume_km` nem o histórico.
- `diff` e `discard` (`:228`, `:245`) inalterados: exclusivos do rascunho.
- Controller: `@ApiResponses` do `recalculate` atualizado (200 também para a v1; 409 "não é proposta v1
  nem ajuste em aberto").

## D5 — Resposta e front

`SeasonPlanResponseDto` ganha `initialLongRunKm`, `proposedVolumeKm`, `initialVolumeSource`,
`volumeHistory` (lido das colunas; nulos em temporada legada).

Front (`apps/menthoros-front`): tipos em `src/types/SeasonPlan.ts`; `SeasonTabPanel` no estado PROPOSED
v1 mostra os quatro e o botão "Ajustar volume e fases", que abre o `SeasonParametersForm` (componente
existente) num dialog, com o campo novo de longão; `useSeasonPlan` ganha `recalculate`. O texto fixo do
formulário ("Semanas concluídas, em andamento e a da prova não mudam", `SeasonParametersForm.tsx:39`)
passa a sair das semanas com `locked` da resposta, que já refletem a regra da v1. Texto do alerta
`LONG_RUN_SHARE` ajustado.

## Riscos

- Parada longa recente (lesão): a mediana ainda pode sair alta (ex.: 3 semanas zeradas de 8). O CTL não
  protege os km (volume proporcional à razão de TSS). Mitigação: as 8 semanas visíveis e o recálculo.
- Onboarding antigo como fallback: origem `ONBOARDING` visível na tela.
- `L0` de treino atípico longo que não é PROVA: teto de 50% do volume e alerta de 30%.
- Destravar a semana corrente na v1: seguro porque a v1 nunca aprovada não alimenta a geração semanal
  (`SeasonWeekContextResolver` lê só ACTIVE).
