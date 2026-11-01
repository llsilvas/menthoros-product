# Design — garmin-training-push

## Context

Ver `proposal.md` e ADR-0013. Estado que molda o desenho:

- `WorkoutChannel` (`push`, `removerOrfaos`, `tocarEvento`) é o contrato; `IntervalsIcuAdapter` é
  o único implementador. `IntervalsIcuWorkoutConverter.converter(TreinoPlanejado)` produz o
  `StructuredWorkout` canônico (`WorkoutStep` com `durationSeconds`/`distanceMeters`, `reps` +
  `steps` para bloco, `IntensityTarget` selado: `PaceTarget(startSecsPerKm, endSecsPerKm)`,
  `HrTarget(startBpm, endBpm)`, `NoTarget`). Nada disso é específico do intervals.icu.
- `IntervalsIcuPushListener`, `IntervalsIcuPushProcessor`, `IntervalsIcuRetrySchedulerImpl` e
  `IntervalsIcuPlanoDeletadoListener` injetam `WorkoutChannel` (bean único) e chamam
  `IntervalsIcuConnectionService.conexaoAtiva` (só INTERVALS_ICU). O processor marca
  `treino.marcarComoSincronizado(PLATAFORMA)` com constante fixa e guarda
  `PushResult.eventId` (`Long`) em `TreinoPlanejado.externalId` (String).
- O listener monta `externalIdsAtuais` com `StructuredWorkout.externalIdCanonico(treinoId)`
  (`menthoros-<uuid>`) para `removerOrfaos`; o intervals.icu filtra eventos pelo prefixo.
- Garmin Training API V2: `POST workout` devolve `workoutId` (Long); `POST schedule
  {workoutId, date}` devolve `scheduleId`; `GET schedule?startDate&endDate` lista
  `{scheduleId, workoutId, date}`; `PUT/DELETE workout/{id}` e `schedule/{id}`. Campos do
  workout: `sport`, `workoutProvider` (≤ 20 chars), `workoutSourceId` (≤ 20), `segments[0].steps`
  com `WorkoutStep` (`durationType` TIME/DISTANCE/OPEN, `targetType` HEART_RATE/PACE/OPEN,
  `targetValueLow/High`) e `WorkoutRepeatStep` (`REPEAT_UNTIL_STEPS_CMPLT`, `repeatValue`,
  `steps`). Limites: 100 steps; 412 = permissão; 429 = cota.

## Goals / Non-Goals

**Goals:**
- Segundo adapter de `WorkoutChannel` sem tocar o primeiro nem o converter.
- Zero migration, zero coluna nova: `externalId` = `workoutId`.
- Os quatro chamadores mudam só a resolução da conexão e a plataforma gravada.

**Non-Goals:**
- Throttle preventivo de cota; abstração genérica de "provider"; intensidade WARMUP/COOLDOWN
  fiel; multisport; natação/ciclismo.

## Decisions

### D1: Bean composto `WorkoutChannelPorPlataforma` (`@Primary`)
`push`, `removerOrfaos` e `tocarEvento` delegam por `conexao.getPlataforma()` → `GarminTrainingAdapter`
ou `IntervalsIcuAdapter` (injetados por tipo concreto). Os chamadores continuam injetando
`WorkoutChannel`. Alternativa rejeitada: `WorkoutChannelResolver` injetado em cada chamador —
quatro edições a mais para o mesmo efeito.

### D2: Resolução da conexão de canal
`IntervalsIcuConnectionService.conexaoAtiva(atletaId, tenantId)` passa a devolver a conexão ativa
de canal (INTERVALS_ICU ou GARMIN) via a query `findActiveByAtletaIdAndPlataformaInAndTenantId`
criada em `garmin-connection` — mantendo nome e assinatura para não tocar os chamadores; o
JavaDoc explica. `IntervalsIcuPushProcessor` grava `conexao.getPlataforma().name()` em vez da
constante `PLATAFORMA`. Alternativa rejeitada: novo service `WorkoutChannelConnectionService` —
renomear quatro injeções sem ganho.

### D3: `externalId` = `workoutId`; schedule localizado por data
`PushResult.eventId` (Long) continua sendo o id do canal; para o Garmin é o `workoutId`. O
`scheduleId` não é guardado: no update, o adapter lista os schedules do dia do treino (e, se a
data mudou, da janela do plano) e acha o do `workoutId`. Alternativa rejeitada: serializar
`garmin:<w>:<s>` no `externalId` — exigiria mudar `PushResult.eventId` para String e o
`parseEventId` do processor, tocando o caminho do intervals.icu.

### D4: Reconciliação por `workoutId` e marca de origem
`WorkoutChannel.removerOrfaos` ganha um quarto parâmetro `Set<String> idsArmazenadosAtuais` (os
`externalId` já gravados nos treinos atuais). O listener monta os dois conjuntos (uma linha a
mais). `IntervalsIcuAdapter` ignora o novo parâmetro. `GarminTrainingAdapter` lista os schedules da
janela, e para cada um cujo `workoutId` não está no conjunto, busca o workout e só apaga se
`workoutProvider == "Menthoros"`; depois apaga o schedule. Custo: 1 GET por schedule suspeito —
raro (só sobras). Alternativa rejeitada: marcar o treino no `description` do workout (visível
ao atleta).

### D5: Mapeamento `StructuredWorkout` → workout Garmin
- `sport=RUNNING`, `workoutName = namePrefix + name`, `description` truncada em 1024,
  `workoutProvider = workoutSourceId = "Menthoros"`, `isSessionTransitionEnabled=false`, um
  segmento.
- `WorkoutStep.simples`: `durationType` TIME (`durationValue` = segundos) se `durationSeconds`,
  DISTANCE (metros) se `distanceMeters`, senão OPEN. `intensity=ACTIVE`; dentro de bloco com
  `NoTarget` → `REST`.
- `PaceTarget` → `targetType=PACE`, `targetValueLow = 1000/endSecsPerKm`, `targetValueHigh =
  1000/startSecsPerKm` (3 casas); iguais quando pace único.
- `HrTarget` → `targetType=HEART_RATE`, `targetValueLow=startBpm`, `targetValueHigh=endBpm`.
- `NoTarget` → `targetType=OPEN`.
- `WorkoutStep.bloco` → `WorkoutRepeatStep{repeatType=REPEAT_UNTIL_STEPS_CMPLT, repeatValue=reps,
  steps}`. `stepOrder` sequencial global.
- Mais de 100 steps expandidos → `PushResult.erro(ERRO_VALIDACAO)` sem chamada.

### D6: Mapeamento de erro
401 → renovar via `GarminOAuthService.tokenValido` e repetir uma vez, depois `ERRO_AUTENTICACAO`;
403/412 → `ERRO_AUTENTICACAO` ("Autorize o envio de treinos no Garmin Connect"); 400 →
`ERRO_VALIDACAO`; 429 → `ERRO_LIMITE_RATE`; resto → `ERRO_TEMPORARIO`. O retry scheduler já trata
`ERRO_LIMITE_RATE`/`ERRO_TEMPORARIO` e ignora `ERRO_AUTENTICACAO`.

### D7: `tocarEvento` no-op
Sem uploader intermediário não há debounce. O listener continua chamando no último evento do
lote; o composto delega e o adapter Garmin não faz nada.

## Risks / Trade-offs

- [Lote grande gera rajada de 429] → retry scheduler absorve; `shortcut: sem throttle; se um lote
  passar de ~80 atletas Garmin, introduzir fila com 90 req/min`.
- [Base do create divergente no PDF (`/workoutportal` vs `/training-api`)] → constante única em
  `GarminProperties`; spike no ambiente de testes antes de fechar o adapter.
- [Schedule perdido se o Garmin apagar só o schedule] → update recria o schedule quando não acha
  pelo `workoutId`.
- [Workout do Menthoros editado pelo atleta no Garmin Connect] → PUT sobrescreve na re-aprovação;
  aceito — o plano é do treinador.

## Migration Plan

1. Deploy com `garmin-connection` já em produção; atletas sem conexão Garmin não são afetados.
2. Validar CA1–CA8 com relógio real no ambiente de testes (checar bpm e pace no visor).
3. Rollback: reverter o deploy; treinos com `externalId` numérico do Garmin ficam `SINCRONIZADO`
   e o canal intervals.icu continua como antes.

## Open Questions

- Se o Garmin devolver o workout com `stepId`s, o PUT pode exigir reenviá-los; confirmar no
  spike. Não muda spec nem tasks.
