# Design — add-activity-treadmill-flag

## D1 — Booleano, não enum de ambiente

Alternativa avaliada: `ambiente` com `OUTDOOR | ESTEIRA | PISTA | TRILHA`. Nenhuma tela usa pista ou
trilha, e `subSport` vem nulo em boa parte dos `.fit` outdoor, então o enum teria um valor
"desconhecido" que ninguém consome. O booleano responde à única pergunta do card.

`NOT NULL DEFAULT false`: treino antigo e fonte sem a informação contam como "não esteira". O custo do
erro é só o card Esteira não aparecer; os demais continuam.

## D2 — Evidência positiva

| Fonte | Campo | `true` quando |
|---|---|---|
| `.fit` (Garmin e upload) | `SessionMesg.getSubSport()` | `TREADMILL` |
| intervals.icu | `type` | `Treadmill` |
| Strava, manual, demais | — | nunca |

`INDOOR_RUNNING` fica de fora: a Garmin distingue pista coberta de esteira, e o selo "ESTEIRA" num
treino de pista é erro visível ao público do atleta. `VirtualRun` fica de fora por falta de
evidência (pode ser esteira inteligente ou não).

## D3 — Contrato

`esteira: boolean` em `TreinoRealizadoOutputDto`, no mesmo mapper que já calcula `temTrajeto`
(`TreinoMapper.java:269`). Sem endpoint novo. O cliente curado do front recebe o campo à mão.
