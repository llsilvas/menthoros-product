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

## D4 — Flag por registro de fonte

O `.fit` e o intervals.icu geram `externalId` diferentes (`FitTreinoPersister.buildExternalId`,
`IntervalsIcuActivityMapper`), e a dedup da ingestão é por fonte. O mesmo treino importado pelas duas
já vira dois registros hoje; consolidar é outra change. Cada registro carrega o flag da sua fonte.

Reenvio do mesmo `.fit` cai na duplicata (`resultado.inserted() == false`) e não toca o flag: o mesmo
arquivo traz o mesmo `subSport`, então não há o que complementar (diferente do `deviceName`, que vem
do ping).

## D5 — Compatibilidade dos records

`FitSessionData` e `TreinoRealizadoOutputDto` são records construídos posicionalmente em muitos
testes. `esteira` entra como último componente de `FitSessionData` e logo depois de `temTrajeto` no
DTO; a assinatura canônica atual vira construtor de compatibilidade com `esteira = false`, como
`add-activity-gps-trace` fez com `temTrajeto`. `FitSessionData` ganha `withEsteira(boolean)` para os
testes do persister.

## D6 — Migration

`V115__Add_esteira_to_treino_realizado.sql`, no padrão da V113:
`ALTER TABLE tb_treino_realizado ADD COLUMN IF NOT EXISTS esteira BOOLEAN NOT NULL DEFAULT false;`
Default constante no PostgreSQL 11+ não reescreve a tabela.
