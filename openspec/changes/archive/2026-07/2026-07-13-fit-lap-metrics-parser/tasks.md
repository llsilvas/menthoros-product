# Tasks: fit-lap-metrics-parser

> Trilha Fast — TDD por task, validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-lap-metrics-parser`
> (criada de `develop` em `2ecd192`, já com o fix `velocidadeMedia`/`paceMedia` mergeado — PR #35).
>
> **Refinado no init (2026-07-12) contra o código real:**
> - Conversão de cadência acontece no PARSER (`(avgRunningCadence + avgFractionalCadence) * 2`,
>   arredondado) — `FitLapData.cadenciaMediaPpm` já chega em ppm de duas pernas.
> - Sanitização acontece no PERSISTER, espelhando a regra do Strava
>   (`StravaActivityServiceImpl.sanitizeCadence:558` — fora de 60–200 ppm → null). NÃO extrair
>   helper compartilhado do service do Strava (métodos privados; refactor cross-service fora do
>   escopo Fast) — replicar a regra com constante nomeada e teste próprio.
> - Testes do parser seguem o padrão round-trip real do `FitParseServiceImplTest` (`gerarFit` +
>   `FileEncoder`), sem mock de binário. Setters do SDK: `setTotalAscent`/`setTotalDescent`
>   (Integer, metros), `setAvgPower` (Integer, W), `setAvgRunningCadence` (Short, passos de uma
>   perna), `setAvgFractionalCadence` (Float).
> - Destinos de sessão confirmados: `TreinoRealizado.cadenciaMedia`/`potenciaMedia` (próprios) e
>   `elevacaoGanhoMetros`/`elevacaoPerdaMetros` (herdados de `TreinoBase:65-74`).

## 1. Records e parser

- [x] 1.1 Ampliar `FitLapData` com `subidaMetros` (Integer), `descidaMetros` (Integer),
      `potenciaMediaWatts` (Integer), `cadenciaMediaPpm` (Integer) — atualizar call sites
      (`FitParseServiceImpl`, `FitTreinoPersisterTest`, `FitParseServiceImplTest`).
      verify: `./mvnw clean compile` + testes existentes compilam com os novos campos.
- [x] 1.2 Ampliar `FitSessionData` com os mesmos 4 campos de sessão (mesmos call sites).
      verify: idem 1.1.
- [x] 1.3 `FitParseServiceImpl` — listener de `LapMesg`: ler `getTotalAscent()`, `getTotalDescent()`,
      `getAvgPower()`, `getAvgRunningCadence()` + `getAvgFractionalCadence()` → ppm de duas pernas,
      null-safe (getter null → campo null; cadência null → null, sem fabricar 0).
      verify: teste round-trip com lap completo passa (1.5).
- [x] 1.4 `FitParseServiceImpl` — listener de `SessionMesg`: mesmos campos agregados.
      verify: teste round-trip de sessão passa (1.5).
- [x] 1.5 Testes `FitParseServiceImplTest` (TDD — escrever antes de 1.3/1.4): lap/sessão com campos
      presentes; ausentes (null, CA4); cadência 82 + fracional 0.5 → 165 ppm (CA3).
      verify: `./mvnw clean test` verde.

## 2. Persistência

- [x] 2.1 `FitTreinoPersister.montarTreino()`: mapear os 4 campos do lap para `EtapaRealizada`
      (`elevacaoGanhoMetros`, `elevacaoPerdaMetros`, `potenciaMedia`, `cadenciaMedia`), com
      sanitização de cadência 60–200 ppm (constante nomeada; fora da faixa → null) — regra
      espelhada do Strava (CA5).
      verify: testes de 2.3 verdes.
- [x] 2.2 Mapear os agregados de sessão para `TreinoRealizado` (`elevacaoGanhoMetros`,
      `elevacaoPerdaMetros`, `cadenciaMedia`, `potenciaMedia`), mesma sanitização de cadência.
      verify: testes de 2.3 verdes.
- [x] 2.3 Testes `FitTreinoPersisterTest` (TDD — escrever antes de 2.1/2.2): lap/sessão com métricas
      → persistidas (CA1, CA2); sem métricas → null sem falha (CA4); cadência fora da faixa
      (59/201, BVA 60/200) → null.
      verify: `./mvnw clean test` verde.

## 3. Validação com arquivo real

- [x] 3.1 Importar um .fit real de relógio Garmin com power/elevação num ambiente local e conferir
      os valores contra o CSV do Garmin Connect do mesmo treino (elevação por volta, potência média,
      cadência em ppm) — registrar divergências aqui. Resolve a assumption de que `getAvgPower()`
      traz running power nativo.
      verify: valores por volta batem com o CSV (tolerância de arredondamento).
      **Resultado (2026-07-12, arquivo `23558283865_ACTIVITY.fit`, 16 laps):** ZERO divergências —
      sessão (15,00 km · FC 151/170 · subida 65 m · descida 57 m · potência 362 W · cadência 165 ppm)
      e todos os 16 laps idênticos ao CSV do Garmin Connect, incluindo o fracional de cadência
      (lap 1 = 161 ppm, lap 7 = 166 ppm). Assumption confirmada: `getAvgPower()` traz o running
      power nativo do relógio.
- [x] 3.2 Suíte completa verde.
      verify: `./mvnw clean test` — 0 falhas. **Resultado: 1315 testes, 0 falhas.**
