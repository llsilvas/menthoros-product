# Design — season-plan-start-volume

## D1 — Volume de partida

`SeasonPlanServiceImpl.resolverVolume` hoje soma os km de `[segunda − 4 semanas, segunda − 1 dia]` e
divide por 4. Passa a buscar a janela de 8 semanas uma vez, calcular as duas médias em memória e
devolver a maior. Uma consulta só; `VOLUME_WINDOW_WEEKS` vira duas constantes (4 e 8). O fallback do
onboarding e o 422 não mudam.

Por que `max` e não só 8 semanas: atleta em subida (4 semanas acima da média de 8) não pode ser puxado
para baixo. Por que não mais que 8: volume de 3 meses atrás não representa a forma atual.

## D2 — Recálculo da v1

`SeasonPlanAdjustmentServiceImpl.recalculate` recusa hoje `baseSeasonPlanId == null`. Passa a aceitar
`PROPOSED` com `version == 1` e sem base. As outras guardas valem igual: soma das fases = semanas,
número de semanas batendo com a data da prova, semanas travadas (`SeasonWeekLock`) preservadas. Rascunho
de ajuste continua como hoje. ACTIVE continua 409.

## D3 — Front

`SeasonTabPanel`, estado PROPOSED v1: mostra `initialVolumeKm` (já está no `PlanoTreino`; conferir se o
`SeasonPlanResponseDto` expõe, senão expor) e um botão que abre o mesmo formulário de recálculo da
`CoachSeasonAdjustPage` (volume + semanas por fase). Sem tela nova.

## Riscos

- `max(4, 8)` superestima a partida de quem parou de vez há 3–4 semanas (lesão). Mitigação: o TSS da
  temporada vem do CTL, que já caiu, e o teto de rampa do enforcement (ADR-0014) corta a carga semanal;
  o treinador vê o volume de partida e recalcula.
- Recalcular a v1 depois de o atleta já ter semana travada: as travadas ficam, como no ajuste.
