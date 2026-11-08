# Tasks — add-activity-gps-trace

## 0. Gates do Full track

- [ ] 0.1 Rodar `product-reviewer` sobre o `proposal.md` e incorporar o veredito
- [x] 0.2 DoR: `spec-reviewer` (READY COM AJUSTES, incorporado) e pre-mortem Codex (ver "Riscos")
- [x] 0.3 Q1 e Q3 resolvidas; `design.md` escrito (D1–D6)

## 1. Parser FIT

- [ ] 1.1 Record `FitAmostraGps(long timestampSeg, double lat, double lng, @Nullable Integer fc)` em `dto/fit`; em `FitParseServiceImpl`, estender o `RecordMesgListener` para capturar `position_lat`/`position_long` (semicírculo → grau), descartando nulos e `0x7FFFFFFF`, com decimação on-line ≥ 5 m (`getDistance()` acumulada, fallback haversine) e teto `MAX_PONTOS_GPS = 20_000` que dobra o passo ao ser atingido
  verify: fixture outdoor retorna lista decimada; esteira retorna lista vazia; ponto inválido é pulado; fixture sintética com 100k pontos a 6 m nunca passa de 20k em memória e preserva os extremos
- [ ] 1.2 Ler `DeviceInfoMesg.getProductName()` (fallback `FileIdMesg.getProductName()`) e expor em `FitSessionData.deviceName`
  verify: fixture FR265 → `"Forerunner 265"`; fixture sem a mensagem → nulo
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Simplificação e codificação

- [ ] 2.1 `GpsTraceSimplifier` (`services/helper`): Douglas-Peucker com tolerância 10 m e teto 400 pontos (dobra a tolerância até caber); mantém primeiro e último ponto; `< 2` pontos → vazio
  verify: testes unitários de preservação de extremos, teto e lista vazia
- [ ] 2.2 `GpsTraceCodec`: codifica polyline (Google, precisão 5) + `tSeg` + `fc` no JSON `{v:1,n,polyline,tSeg,fc}`; decodifica para o teste de ida e volta
  verify: ida e volta com erro ≤ 1e-5 grau
- [ ] 2.3 Validar tolerância (Q2) com 3 `.fit` reais (parque, rua, trilha) em `src/test/resources/fit/`; registrar `pg_column_size` estimado no `design.md`
  verify: os 3 ficam ≤ 400 pontos e ≤ 8 KB; curvas de rua visíveis no SVG gerado pelo teste
- [ ] 2.4 Validação: `./mvnw clean test`

## 3. Persistência

- [ ] 3.1 Migration `V113__Add_gps_trace_to_treino_realizado.sql`: `ALTER TABLE tb_treino_realizado ADD COLUMN IF NOT EXISTS gps_trace JSONB NULL` (aditiva, sem backfill)
- [ ] 3.2 `TreinoRealizado.gpsTrace` com `@JdbcTypeCode(SqlTypes.JSON)` (padrão de `RaceProjectionSnapshot`)
- [ ] 3.3 `FitTreinoPersister`: grava `gpsTrace` (simplificado + codificado) e usa `FitSessionData.deviceName` como fallback de `deviceName` apenas quando o valor atual é nulo (precedência ping → `.fit`)
  verify: teste do persister — ping com nome prevalece; upload manual preenche; duplicata não sobrescreve
- [ ] 3.4 Validação: `./mvnw clean test`

## 4. Contrato

- [ ] 4.1 `GpsTraceOutputDto` (`v`, `n`, `polyline`, `tSeg`, `fc`, `deviceName`) e `GET /api/v1/atletas/me/realizados/{id}/trajeto` em `AtletaTreinoController`; `404` sem trajeto ou treino de outro atleta
  verify: `@WebMvcTest` — 200 com corpo; 404 para outro atleta do mesmo tenant; 404 para outro tenant (rodar o WebMvcTest isolado, ver memória `verify-local-vs-ci-webmvctest`)
- [ ] 4.2 `GET /api/v1/treinos-realizados/{id}/trajeto` em `TreinoRealizadoController` (coach), mesmo DTO, filtro de tenant existente
  verify: `@WebMvcTest` idem
- [ ] 4.3 `temTrajeto: boolean` no item de `GET /me/treinos` (derivado de `gps_trace IS NOT NULL`, sem carregar o JSON)
  verify: teste do mapper/DTO
- [ ] 4.4 OpenAPI atualizado; portar à mão para o cliente curado do front (`src/api`) — `AtletaTreinoService.getTrajeto`, campo `temTrajeto`
  verify: `npm run build` no front
- [ ] 4.5 Validação: `./mvnw clean test`

## 5. Fechamento

- [ ] 5.1 Teste de integração ponta a ponta: ingestão por upload de `.fit` outdoor → `gps_trace` gravado → endpoint do atleta devolve; esteira → `temTrajeto=false` e 404 no trajeto
- [ ] 5.2 Atualizar `openspec/specs/garmin-activity-ingestion/spec.md` (delta: trajeto e fallback do modelo)
- [ ] 5.3 Validação final: `./mvnw clean test`
