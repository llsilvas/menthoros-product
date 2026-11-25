# Design — season-plan-start-volume

## D1 — Volume de partida: mediana de 8 semanas

`SeasonPlanServiceImpl.resolverVolume` hoje soma os km de `[segunda − 4 semanas, segunda − 1 dia]` e
divide por 4. Passa a buscar `[segunda − 8 semanas, segunda − 1 dia]` numa consulta só, agrupar por
semana (segunda a domingo, semanas sem treino = 0) e tirar a mediana (8 valores: média do 4º e 5º).
Mediana igual a 0 → fallback do onboarding → 422 sem ele, como hoje.

Por que mediana: ignora semana atípica nos dois sentidos (folga ou pico isolado), que é o que o treinador
faz de olho. Por que 8: volume de 3 meses atrás não representa a forma atual, e 4 é pouco para a
mediana ter efeito.

As 8 somas semanais saem do mesmo cálculo e vão para a resposta (D4).

## D2 — Longão de partida

Novo dado de entrada do `SeasonPlanner`: `L0` (nullable) = maior `distanciaKm` de treino com
`contaNaCarga` em `[segunda − 6 semanas, segunda − 1 dia]`. `SeasonPlanner.longao` passa a ser:

```
base = max(volume × 0,28, L0 × volume / volumePartida)   // só o primeiro termo se L0 nulo
longao = min(base, tetoLongao(distância)); descarga → × 0,75; RACE_WEEK → nulo
```

A proporção ao volume faz o longão seguir a mesma curva (rampa, descargas, polimento) sem regra nova.
O `SeasonPlanValidator` não muda: o alerta `LONG_RUN_SHARE` (30%) dispara quando o longão recente
pesa demais no volume, e isso é sinal útil ao treinador.

`L0` é persistido no `PlanoTreino` (coluna nova, nullable, migration aditiva) para o recálculo
reutilizar (A3) e para a resposta.

## D3 — Recálculo da v1

`SeasonPlanAdjustmentServiceImpl.recalculate` recusa hoje `baseSeasonPlanId == null`. Passa a aceitar
`PROPOSED` com `version == 1` e sem base. As outras guardas valem igual: soma das fases = semanas,
número de semanas batendo com a data da prova, semanas travadas (`SeasonWeekLock`) preservadas.
Rascunho de ajuste continua como hoje; ACTIVE continua 409. O recálculo usa o `L0` persistido.

## D4 — Resposta e front

`SeasonPlanResponseDto` ganha `initialVolumeKm`, `initialLongRunKm` e `volumeHistory` (lista de
`{weekStart, km}` das 8 semanas, calculada na leitura, não persistida). Campos aditivos.

`SeasonTabPanel`, estado PROPOSED v1: mostra os três e um botão que abre o mesmo formulário de
recálculo da `CoachSeasonAdjustPage` (volume + semanas por fase). Sem tela nova.

## Riscos

- Mediana superestima a partida de quem parou de vez há 3–4 semanas (lesão): 4 semanas zeradas de 8
  ainda dão mediana alta. Mitigação: o TSS vem do CTL, que já caiu; o teto de rampa do enforcement
  (ADR-0014) corta a carga semanal; o treinador vê as 8 semanas e recalcula.
- `L0` vindo de uma prova recente (ex.: meia maratona) puxa o longão para cima. Mitigação: o alerta de
  30% e o teto por distância; avaliar excluir treinos do tipo PROVA na implementação.
- Migration nova em `tb_plano_treino` (coluna nullable, sem backfill).
