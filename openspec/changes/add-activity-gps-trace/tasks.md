# Tasks — add-activity-gps-trace

## 0. Gates do Full track

- [ ] 0.1 Rodar `product-reviewer` sobre o `proposal.md` e incorporar o veredito
- [ ] 0.2 Rodar o pre-mortem (`/codex:adversarial-review`) e incorporar em "Riscos e mitigações"
- [ ] 0.3 Decidir Q1 (formato), Q2 (tolerância) e Q3 (retenção do `.fit`) e escrever o `design.md`

## 1. Parser FIT

- [ ] 1.1 Em `FitParseServiceImpl`, estender o `RecordMesgListener` para capturar `position_lat`/`position_long` (semicírculo → grau) junto do `timestamp` e da FC; novo record `FitAmostraGps`
- [ ] 1.2 Ler o modelo do dispositivo (`DeviceInfoMesg`/`FileIdMesg`) e expor em `FitSessionData.deviceModel`
- [ ] 1.3 Teste unitário com `.fit` de fixture: coordenadas convertidas, modelo lido, arquivo sem GPS retorna lista vazia
- [ ] 1.4 Validação: `./mvnw clean test`

## 2. Simplificação

- [ ] 2.1 `GpsTraceSimplifier`: decimação por distância mínima + Douglas-Peucker com tolerância configurável e teto de pontos
- [ ] 2.2 Codificação para o formato decidido em Q1 (polyline + FC paralela)
- [ ] 2.3 Testes: preserva primeiro/último ponto, respeita teto, 60k pontos em < 200 ms
- [ ] 2.4 Validação: `./mvnw clean test`

## 3. Persistência e contrato

- [ ] 3.1 Migration `V113__Add_gps_trace_and_device_model_to_treino_realizado.sql`
- [ ] 3.2 Campos em `TreinoRealizado` e gravação em `FitTreinoPersister`
- [ ] 3.3 `gpsTrace` e `deviceModel` nos DTOs de `AtletaTreinoController` (lista e detalhe) e `TreinoRealizadoController`
- [ ] 3.4 Teste de integração: ingestão ponta a ponta grava e expõe; outro tenant recebe 404
- [ ] 3.5 Atualizar o OpenAPI e portar à mão para o cliente curado do front (`src/api`)
- [ ] 3.6 Validação: `./mvnw clean test`

## 4. Reprocessamento (condicional a Q3)

- [ ] 4.1 Se o `.fit` for retido: job administrativo que reprocessa treinos sem `gps_trace`
- [ ] 4.2 Se não for: registrar no `proposal.md` que treinos anteriores ficam sem trajeto
