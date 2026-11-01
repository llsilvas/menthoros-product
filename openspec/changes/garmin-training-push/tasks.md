# Tasks — garmin-training-push

Backend valida com `./mvnw clean verify`. Pré-requisito: `garmin-connection` mergeada.

## 1. Cliente Garmin — Training API

- [x] 1.1 `GarminClient` ganha `criarWorkout(token, JsonNode)`, `atualizarWorkout(token, id,
  JsonNode)`, `deletarWorkout(token, id)`, `criarSchedule(token, workoutId, LocalDate)`,
  `atualizarSchedule(token, scheduleId, workoutId, LocalDate)`, `deletarSchedule(token, id)`,
  `listarSchedules(token, inicio, fim)`, `buscarWorkout(token, id)`; teste com
  `MockRestServiceServer` usando os JSON do PDF Training API V2 (criação, schedule, lista, 412,
  429).

## 2. Adapter e composição

- [x] 2.1 `GarminWorkoutPayloadMapper.montar(StructuredWorkout)` (classe própria, sem estado; o
  `GarminTrainingAdapter` da 2.2 delega a ela, e só vira bean com o `@Primary` da 2.4)
  conforme D5 (TIME/DISTANCE/OPEN, PACE em m/s, HEART_RATE em bpm, REPEAT_UNTIL_STEPS_CMPLT,
  stepOrder global, limite 100 steps → `ERRO_VALIDACAO`); teste unitário puro do payload com o
  treino de CA1 e CA2 e com pace único.
- [x] 2.2 `GarminTrainingAdapter.push`: sem `eventIdArmazenado` → `POST workout` + `POST schedule`;
  com id → `PUT workout` + schedule localizado por `workoutId` na data (recria se ausente, move se a
  data mudou); mapeamento de erro D6 com renovação em 401; `tocarEvento` no-op; testes no molde de
  `IntervalsIcuAdapterTest` (CA1–CA3, CA6–CA8).
- [x] 2.3 `WorkoutChannel.removerOrfaos` ganha `Set<String> idsArmazenadosAtuais` (5º parâmetro: o
  método já tinha `externalIdsAtuais`); `IntervalsIcuAdapter` ignora; `GarminTrainingAdapter` apaga
  schedule + workout de `workoutProvider == "Menthoros"` fora do conjunto, 404 tolerado; testes (CA4).
  Os dois chamadores foram ajustados para compilar: `IntervalsIcuPushListener` já monta o conjunto
  (id novo do push, ou o `externalId` anterior em erro/claim perdido) e `PlanoDeletadoListener` passa
  `Set.of()`. Teste do conjunto montado pelo listener fica na 3.2.
- [x] 2.4 `WorkoutChannelPorPlataforma` (`@Primary`, delega por `conexao.getPlataforma()`); teste
  unitário das três operações para GARMIN e INTERVALS_ICU. O contexto com dois adapters foi provado
  em teste leve (`AnnotationConfigApplicationContext`); o `./mvnw clean verify` com Docker (contexto
  real da aplicação) fica para a validação final.

## 3. Chamadores

- [x] 3.1 Os três chamadores de canal (`IntervalsIcuPushListener`, `IntervalsIcuRetrySchedulerImpl`,
  `IntervalsIcuPlanoDeletadoListener`) passam a usar `GarminConnectionService.conexaoDeCanal` (já
  existente, INTERVALS_ICU ou GARMIN). **Desvio do D2:** `IntervalsIcuConnectionService.conexaoAtiva`
  NÃO mudou — ela tem outros 7 chamadores (ingestão de atividades, backfill de laps, melhor esforço,
  OAuth, persister, perfil do coach) que usam o token na API do intervals.icu, e uma conexão Garmin
  ali faria chamadas ao intervals.icu com credencial do Garmin. Testes dos chamadores ajustados.
- [x] 3.2 `IntervalsIcuPushProcessor` grava `conexao.getPlataforma().name()` no lugar de
  `PLATAFORMA` (teste CA5: conexão Garmin grava `["GARMIN"]` e o workoutId); `IntervalsIcuPushListener`
  monta `idsArmazenadosAtuais` (teste: id novo, id anterior em erro, sem id fora); o
  `IntervalsIcuPlanoDeletadoListener` já apaga via `WorkoutChannel`, que o composto roteia por
  plataforma, então não precisou de código novo (a parte Garmin é a `removerOrfaos` da 2.3).
- [x] 3.3 Mensagens persistidas por plataforma (`FonteDados.getLabel()`: "Garmin Connect" /
  "intervals.icu"): erro inesperado do processor (`treino.erroSincronizacao`) e falha de autenticação
  do listener (`conexao.lastSyncError`); testes nos dois. Os textos do adapter Garmin já eram
  próprios (2.2) e os motivos de FC são neutros. Logs internos continuam citando intervals.icu.

## 4. Integração

- [ ] 4.1 IT `GarminTrainingPushIT` escrito e compilando (aprovação com atleta Garmin → treinos
  `SINCRONIZADO` com `externalId` numérico e `exportadoPara=["GARMIN"]`; re-aprovação sem um treino →
  DELETE do schedule e do workout órfão, sem tocar o treino mantido; Garmin stubado por WireMock;
  CA1, CA3, CA4, CA9). **Ainda não executado:** o Docker (Testcontainers) estava desligado; marcar
  `[x]` depois de rodar `./mvnw verify`. O cenário do atleta intervals.icu no mesmo teste ficou de
  fora: o roteamento por plataforma é provado no `WorkoutChannelPorPlataformaTest`.
- [ ] 4.2 Spike documentado em `menthoros-infra/docs`: resultado do push num relógio real no
  ambiente de testes (base do create, bpm e pace no visor, 100 steps); `./mvnw clean verify`
  verde.

## Workflow follow-up

- Se o spike mostrar que o PUT exige `stepId`, ajustar o adapter na própria task 2.2 antes do
  merge.
