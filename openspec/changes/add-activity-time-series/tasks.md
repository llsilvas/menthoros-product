# Tasks — add-activity-time-series

## 0. Gates

- [x] 0.1 `product-reviewer` → Refine (2026-11-09): baldes fixos, série depois do card Esteira.
  Incorporado.
- [x] 0.2 Pre-mortem Codex → NOT READY (2026-11-09): distância, pausas, âncora, `INDOOR_RUNNING`.
  Incorporado (D2–D5; flag movido para `add-activity-treadmill-flag`).
- [ ] 0.3 **Gate de adoção** de `add-activity-treadmill-flag` aprovado (≥ 30% em 4 semanas)
- [ ] 0.4 DoR: `spec-reviewer` e Codex em `/implement init`

## 1. Série

- [ ] 1.1 Estender a amostra do `RecordMesgListener` com a distância acumulada (`getDistance()`);
  manter o teto `MAX_AMOSTRAS` e o comportamento de `amostrasExcedidas`
  verify: testes atuais do tempo em zonas continuam verdes
- [ ] 1.2 `services/helper/TimeSeriesBuilder` (D3, D4): baldes fixos, repartição de intervalos por
  tempo, lacuna acima de 10 s, cobertura mínima de 50%, âncora em `startTime`
  verify: CA1, CA2 (exemplo 1 s + 15 s), CA3 (pausa de 90 s), records antes do `startTime`
  descartados, distância regressiva conta zero
- [ ] 1.3 Calibração (D5) e `TimeSeriesCodec` + record `TimeSeriesPayload` (`dto/fit`)
  verify: CA4; `k` fora da faixa não calibra; ida e volta do JSON
- [ ] 1.4 Validar a premissa de D5 com 1 `.fit` real de esteira corrigida do pilot
  verify: pace médio da série a ±2 s/km do pace da sessão; sem arquivo, registrar como adiada
- [ ] 1.5 Migration `V<próxima livre>__Add_serie_temporal_to_treino_realizado.sql` (`JSONB NULL`, aditiva) e
  gravação no `FitTreinoPersister`
  verify: CA5 e CA7 (`pg_column_size` ≤ 8 KB na fixture de ultra)
- [ ] 1.6 Validação: `./mvnw clean verify`

## 2. Contrato

- [ ] 2.1 `temSerie` no `TreinoRealizadoOutputDto` via `TreinoMapper`
  verify: teste do mapper
- [ ] 2.2 `GET /api/v1/atletas/me/realizados/{id}/serie`
  verify: CA6 com teste de integração em banco real (dono 200; outro atleta, outro tenant e sem série
  404) e `@WebMvcTest` rodado isolado
- [ ] 2.3 Validação: `./mvnw clean verify`

## 3. Métrica

- [ ] 3.1 Confirmar os nomes da query de `design.md` e registrar a medição depois de 1 semana
