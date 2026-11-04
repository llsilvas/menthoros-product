# Tasks — fix-garmin-workout-update

Backend (`apps/menthoros-backend`). Validação: `./mvnw clean test` por bloco; `./mvnw clean verify`
antes do PR (o `GarminTrainingPushIT` só roda no `verify`).

## 1. PUT com ownerId

- [x] 1.1 `GarminTrainingAdapter.enviar`: com `workoutId` guardado, `buscarWorkout` antes do PUT;
  copia `ownerId` e `workoutId` da resposta para uma cópia do payload; GET 404 → `criar` (mesmo
  caminho do 404 no PUT); demais erros do GET propagam como hoje. Testes unitários: CA1, CA2, CA3
  (parametrizado por 401/403/412/429/500), e `verify(client, never()).atualizarWorkout` nos
  caminhos de erro.
- [x] 1.2 `GarminTrainingPushIT`: stub do GET devolvendo workout com `ownerId`; stub do PUT com
  `matchingJsonPath("$.ownerId")` e `$.workoutId` igual ao path (CA6). `./mvnw clean verify`.

## 2. Alvos

- [x] 2.1 `GarminWorkoutPayloadMapper`: pace com `start == end` → faixa ±5 s/km (Low = mais
  lento); teste do valor exato em m/s para "4:30/km" e de que faixa explícita não ganha tolerância
  (CA4).
- [x] 2.2 `IntervalsIcuFcAlvoResolver`: `HrTarget(min, max)`; teste "150-140 bpm" → (140, 150) e
  teste do mapper Garmin com Low < High (CA5). `./mvnw clean test`.
- [x] 2.3 `GarminWorkoutPayloadMapper`: `skipLastRestStep: true` no `WorkoutRepeatStep` cujo último
  filho é `REST` (trote sem meta); bloco que termina em passo com meta não leva o campo (CA7).
  Testes no mapper e na simulação 6x1 km / fartlek.
- [x] 2.4 `GarminTreinoSimulacaoTest`: simulação ponta a ponta (treino planejado → conversor →
  payload) de rodagem, tempo run, longão progressivo, simulado, 6x1 km, 10x200 m, fartlek,
  ondulado, escolha de alvo e limite de 100 steps.

## 3. Validação real

- [ ] 3.1 No ambiente de testes, re-aprovar um plano de atleta Garmin conectado: confirmar que o GET
  traz `ownerId`, que o PUT volta 200 e que o treino atualizado aparece no relógio; conferir no
  device o alerta de pace com a faixa ±5 s/km e que, num intervalado, o relógio vai do último tiro
  direto ao desaquecimento (`skipLastRestStep`). Registrar resultado aqui.
