## Why

Após o bootstrap inicial de histórico (90 dias) do change `strava-async-import`, ainda falta a operação diária: sincronizar o treino realizado no Strava e reconciliar com o treino planejado no Menthoros.

Sem essa reconciliação, treinador perde rastreabilidade entre o que foi prescrito e o que foi executado.

## What Changes

- Sincronização diária de `treino_realizado` no Strava para atletas conectados
- Regra de matching entre `treino_realizado` e `treino_planejado`
- Vínculo explícito entre realizado e planejado quando houver correspondência confiável
- Classificação de casos sem correspondência e ambíguos para revisão

## Scope Boundary

- `strava-async-import`: onboarding de atleta novo (importação histórica de 90 dias)
- `strava-activity-sync`: operação diária (reconciliação planejado x realizado)

## Impact

- Domínio: relacionamento entre `TreinoRealizado` e `TreinoPlanejado`
- Serviço: fluxo de sincronização incremental diária
- API/UI: status de reconciliação e pendências de revisão
