# Tasks — garmin-training-push

Backend valida com `./mvnw clean verify`. Pré-requisito: `garmin-connection` mergeada.

## 1. Cliente Garmin — Training API

- [ ] 1.1 `GarminClient` ganha `criarWorkout(token, JsonNode)`, `atualizarWorkout(token, id,
  JsonNode)`, `deletarWorkout(token, id)`, `criarSchedule(token, workoutId, LocalDate)`,
  `atualizarSchedule(token, scheduleId, workoutId, LocalDate)`, `deletarSchedule(token, id)`,
  `listarSchedules(token, inicio, fim)`, `buscarWorkout(token, id)`; teste com
  `MockRestServiceServer` usando os JSON do PDF Training API V2 (criação, schedule, lista, 412,
  429).

## 2. Adapter e composição

- [ ] 2.1 `GarminTrainingAdapter implements WorkoutChannel`: `montarPayload(StructuredWorkout)`
  conforme D5 (TIME/DISTANCE/OPEN, PACE em m/s, HEART_RATE em bpm, REPEAT_UNTIL_STEPS_CMPLT,
  stepOrder global, limite 100 steps → `ERRO_VALIDACAO`); teste unitário puro do payload com o
  treino de CA1 e CA2 e com pace único.
- [ ] 2.2 `GarminTrainingAdapter.push`: sem `eventIdArmazenado` → `POST workout` + `POST schedule`;
  com id → `PUT workout` + schedule localizado por `workoutId` na data (recria se ausente, move se a
  data mudou); mapeamento de erro D6 com renovação em 401; `tocarEvento` no-op; testes no molde de
  `IntervalsIcuAdapterTest` (CA1–CA3, CA6–CA8).
- [ ] 2.3 `WorkoutChannel.removerOrfaos` ganha `Set<String> idsArmazenadosAtuais`;
  `IntervalsIcuAdapter` ignora; `GarminTrainingAdapter` apaga schedule + workout de
  `workoutProvider == "Menthoros"` fora do conjunto, 404 tolerado; testes (CA4).
- [ ] 2.4 `WorkoutChannelPorPlataforma` (`@Primary`, delega por `conexao.getPlataforma()`); teste
  unitário das três operações para GARMIN e INTERVALS_ICU; `./mvnw clean test` prova que o contexto
  sobe com dois adapters.

## 3. Chamadores

- [ ] 3.1 `IntervalsIcuConnectionService.conexaoAtiva` passa a usar
  `findActiveByAtletaIdAndPlataformaInAndTenantId` (INTERVALS_ICU, GARMIN); JavaDoc atualizado;
  testes existentes do service ajustados + caso GARMIN.
- [ ] 3.2 `IntervalsIcuPushProcessor` grava `conexao.getPlataforma().name()` no lugar de
  `PLATAFORMA`; `IntervalsIcuPushListener` monta `idsArmazenadosAtuais` e passa ao
  `removerOrfaos`; `IntervalsIcuPlanoDeletadoListener` apaga via canal da conexão (Garmin: schedule
  + workout); testes existentes verdes + cenário Garmin em cada um (CA5, CA9, CA10).
- [ ] 3.3 Mensagens de erro curadas por plataforma no `PushResult` (texto "Garmin Connect" vs
  "intervals.icu"); teste.

## 4. Integração

- [ ] 4.1 IT: `PlanoAprovadoEvent` com atleta Garmin (Garmin stubado) → treinos `SINCRONIZADO` com
  `externalId` numérico; re-aprovação com treino removido → DELETE do órfão; atleta intervals.icu
  no mesmo teste segue o fluxo antigo (CA1, CA3, CA4, CA9).
- [ ] 4.2 Spike documentado em `menthoros-infra/docs`: resultado do push num relógio real no
  ambiente de testes (base do create, bpm e pace no visor, 100 steps); `./mvnw clean verify`
  verde.

## Workflow follow-up

- Se o spike mostrar que o PUT exige `stepId`, ajustar o adapter na própria task 2.2 antes do
  merge.
