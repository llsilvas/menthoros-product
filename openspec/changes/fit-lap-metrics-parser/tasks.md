# Tasks: fit-lap-metrics-parser

> Trilha Fast — TDD por task, validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-lap-metrics-parser`.

## 1. Records e parser

- [ ] 1.1 Ampliar `FitLapData` com `subidaMetros` (Integer), `descidaMetros` (Integer),
      `potenciaMediaWatts` (Integer), `cadenciaMediaPpm` (Integer) — atualizar todos os call sites
      (testes constroem o record diretamente).
- [ ] 1.2 Ampliar `FitSessionData` com os mesmos 4 campos de sessão.
- [ ] 1.3 `FitParseServiceImpl` — listener de `LapMesg`: ler `getTotalAscent()`, `getTotalDescent()`,
      `getAvgPower()`, `getAvgRunningCadence()` + `getAvgFractionalCadence()` (converter para ppm
      de duas pernas: `(cadencia + fracional) * 2`, arredondado). Null-safe em todos.
- [ ] 1.4 `FitParseServiceImpl` — listener de `SessionMesg`: mesmos campos agregados.
- [ ] 1.5 Testes `FitParseServiceImplTest`: fixture/mesg com campos presentes, ausentes (null) e
      cadência com fracional (CA3, CA4). Validar: `./mvnw clean test`.

## 2. Persistência

- [ ] 2.1 `FitTreinoPersister.montarTreino()`: mapear os 4 campos do lap para `EtapaRealizada`
      (reusar critério de sanitização de cadência do `StravaActivityServiceImpl` — extrair helper
      comum se necessário, sem refatorar o service do Strava além disso).
- [ ] 2.2 Mapear os agregados de sessão para `TreinoRealizado` (`elevacaoGanhoMetros`,
      `elevacaoPerdaMetros`, `cadenciaMedia`, `potenciaMedia`).
- [ ] 2.3 Testes `FitTreinoPersisterTest`: lap/sessão com métricas → persistidas; sem métricas →
      null sem falha (CA1, CA2, CA4). Validar: `./mvnw clean test`.

## 3. Validação com arquivo real

- [ ] 3.1 Importar um .fit real de relógio Garmin com power/elevação num ambiente local e conferir
      os valores contra o CSV do Garmin Connect do mesmo treino (elevação por volta, potência média,
      cadência em ppm) — registrar divergências aqui.
- [ ] 3.2 Suíte completa verde: `./mvnw clean test`.
