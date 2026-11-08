# Tasks — add-activity-gps-trace

## 0. Gates do Full track

- [x] 0.1 `product-reviewer` → Refine; 4 ajustes incorporados (endpoint do coach cortado, Why, métrica, hipótese)
- [x] 0.2 DoR: `spec-reviewer` (READY COM AJUSTES, incorporado) e pre-mortem Codex (ver "Riscos")
- [x] 0.3 Q1 e Q3 resolvidas; `design.md` escrito (D1–D6)

## 1. Parser FIT

- [x] 1.1 Record `FitGpsSample(long timestampSeg, double lat, double lng, @Nullable Integer fc)` em `dto/fit` (nome em inglês, ADR-0007) e coletor `services/helper/GpsSampleCollector`; em `FitParseServiceImpl`, estender o `RecordMesgListener` para capturar `position_lat`/`position_long` (semicírculo → grau), descartando nulos e `0x7FFFFFFF`, com decimação on-line ≥ 5 m (`getDistance()` acumulada, fallback haversine) e teto `MAX_PONTOS_GPS = 20_000` que dobra o passo ao ser atingido
  verify: fixture outdoor retorna lista decimada; esteira retorna lista vazia; ponto inválido é pulado; fixture sintética com 100k pontos a 6 m nunca passa de 20k em memória e preserva os extremos
- [x] 1.2 Ler `DeviceInfoMesg.getProductName()` (fallback `FileIdMesg.getProductName()`) e expor em `FitSessionData.deviceName`
  verify: fixture FR265 → `"Forerunner 265"`; fixture sem a mensagem → nulo
- [x] 1.3 Validação: `./mvnw clean test`

## 2. Simplificação e codificação

- [x] 2.1 `GpsTraceSimplifier` (`services/helper`): Douglas-Peucker com tolerância 10 m e teto 400 pontos (dobra a tolerância até caber); mantém primeiro e último ponto; `< 2` pontos → vazio
  verify: testes unitários de preservação de extremos, teto e lista vazia
- [x] 2.2 `GpsTraceCodec` + record `GpsTracePayload` (`dto/fit`): codifica polyline (Google, precisão 5) + `tSeg` + `fc` no JSON `{v:1,n,polyline,tSeg,fc}`; decodifica para o teste de ida e volta
  verify: ida e volta com erro ≤ 1e-5 grau; bate com o exemplo de referência do Google
- [ ] 2.3 Validar tolerância (Q2) com 3 `.fit` reais (parque, rua, trilha) em `src/test/resources/fit/`; registrar `pg_column_size` estimado no `design.md`
  verify: os 3 ficam ≤ 400 pontos e ≤ 8 KB; curvas de rua visíveis no SVG gerado pelo teste
  **Parcial (2026-11-08):** só existe 1 fixture real (`corrida-15km-16laps.fit`, rua); ela cabe em 400 pontos e < 8 KB (teste `GpsTraceCodecTest.realFixtureFitsBudget`). Faltam parque e trilha — pedir 2 `.fit` reais ao founder; sem eles a tolerância de 10 m segue como premissa.
- [x] 2.4 Validação: `./mvnw clean test` — 6434 testes, 0 falhas, 1 erro flaky pré-existente fora do escopo (`IntervalsIcuClientImplTest.BuscarAtividade.sucessoRetornaActivity`: stub WireMock de 403 vazado de outro teste; passa isolado)

## 3. Persistência

- [x] 3.1 Migration `V113__Add_gps_trace_to_treino_realizado.sql`: `ALTER TABLE tb_treino_realizado ADD COLUMN IF NOT EXISTS gps_trace JSONB NULL` (aditiva, sem backfill)
- [x] 3.2 `TreinoRealizado.gpsTrace` (String JSON) com `@JdbcTypeCode(SqlTypes.JSON)` (padrão de `RaceProjectionSnapshot`)
- [x] 3.3 `FitTreinoPersister`: grava `gpsTrace` via `GpsTraceCodec.toJson` (simplifica + codifica + serializa) e usa `FitSessionData.deviceName` como fallback de `deviceName` (precedência ping → `.fit`, também na duplicata)
  verify: teste do persister — ping com nome prevalece; upload manual preenche; duplicata não sobrescreve
- [x] 3.4 Validação: `./mvnw clean test` — 6438 testes, 0 falhas, 0 erros

## 4. Contrato

- [x] 4.1 `GpsTraceOutputDto` (`v`, `n`, `polyline`, `tSeg`, `fc`, `deviceName`), `AtletaGpsTraceService` + impl e `GET /api/v1/atletas/me/realizados/{id}/trajeto` em `AtletaTreinoController`; `404` sem trajeto, outro atleta ou outro tenant (mesma resposta, sem revelar existência)
  verify: `@WebMvcTest` 200/404 + teste do service para os três casos de 404
- [x] 4.2 `temTrajeto: boolean` no item de `GET /me/treinos` (`@Mapping` expression sobre `gpsTrace != null`); construtor de compatibilidade no record para os 8 testes posicionais
  verify: `TreinoMapperGpsTraceTest`
- [x] 4.3 Cliente curado do front: `ManualTrainingService.getTrajeto` e tipos `GpsTrace` / `TreinoRealizadoDto.temTrajeto` em `src/types/TreinoManual.ts` (editado no checkout principal do front, em `develop`, sem commit — vai na change `athlete-share-cards`, que é quem consome)
  verify: `tsc -b --noEmit` sem erros
- [x] 4.4 Validação: `./mvnw clean test` — a 1ª rodada falhou com 4 erros em `AtletaWorkoutAnalysisControllerTest` (outro `@WebMvcTest` do mesmo controller sem o mock do `AtletaGpsTraceService`; caso da memória `verify-local-vs-ci-webmvctest`), corrigido e emendado em `2bf7a10`; 2ª rodada verde. Front `lint` + `build` verdes (lint só passou após remover o worktree vazio `coach-inbox-responsive-1368-18eb30` de outra sessão, que estava dentro de `apps/menthoros-front/.claude/worktrees/`)

## 5. Fechamento

- [x] 5.1 `GpsTraceIT` (failsafe, Testcontainers): upload de `.fit` outdoor → `gps_trace` gravado → endpoint 200 com 2–400 pontos; outro atleta do mesmo tenant → 404; esteira sintética sem posição → `gps_trace` nulo e 404
- [x] 5.2 `openspec/specs/garmin-activity-ingestion/spec.md`: requisito "Trajeto GPS do treino realizado" (6 cenários) e cenário "Modelo só no arquivo" na atribuição Garmin
- [ ] 5.3 Validação final: `./mvnw clean test`
