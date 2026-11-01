**Tamanho:** M · **Trilha:** Full

# Proposal — garmin-training-push

Segunda das três changes do canal Garmin direto (ADR-0013). Depende de `garmin-connection`
(credencial e `userId`). Entrega o **push do treino planejado ao relógio** pela Training API V2
do Garmin, pelo mesmo contrato `WorkoutChannel` que o intervals.icu usa hoje.

## Status

- ready-for-agent (2026-10-23): grilling concluído, ADR-0013 aceito, seams confirmadas, revisão
  ponytail aplicada (sem throttle, sem resolver à parte, sem migration). Bloqueada por
  `garmin-connection` em produção no ambiente de testes.

## Why

O plano aprovado pelo treinador precisa chegar ao relógio do atleta Garmin sem intermediário. Hoje
o caminho passa pelo intervals.icu, que não aceita alvo de FC em bpm absoluto (só `%lthr`), exige
um "nudge" para contornar o debounce do uploader e depende de uma conta extra. A Training API V2
aceita bpm absoluto, faixa de pace em m/s e agendamento por data — exatamente o que o modelo
canônico `StructuredWorkout` já expressa.

## What Changes

- Novo adapter do canal Garmin implementando `WorkoutChannel`: cria/atualiza/apaga workout e
  schedule por treino planejado; `tocarEvento` é no-op (não há uploader intermediário).
- **Um bean `WorkoutChannel` composto** que delega ao adapter da plataforma da conexão; os quatro
  chamadores atuais (`PlanoAprovadoEvent`, retry, exclusão de plano, processor) não mudam de
  contrato — passam a resolver a conexão de canal (Garmin ou intervals.icu) pela query criada em
  `garmin-connection`.
- Alvo de FC em **bpm absoluto** e pace como **faixa em m/s**; nunca zona. Some a leitura de LTHR
  para o canal Garmin.
- Idempotência: `TreinoPlanejado.externalId` guarda o `workoutId` do Garmin; o schedule é
  localizado por `workoutId` + data. Reconciliação de órfãos compara os schedules da janela com os
  `workoutId` dos treinos atuais; só workouts criados pelo Menthoros (`workoutProvider`) são
  tocados.
- Erros: 429 → `ERRO_LIMITE_RATE` (retry existente); 412 (sem `WORKOUT_IMPORT`) →
  `ERRO_AUTENTICACAO` sem retry, com mensagem "reautorize no Garmin"; 401 → renovação de token e
  uma nova tentativa, depois `ERRO_AUTENTICACAO`.
- Sem throttle de 100 req/min: o 429 já entra no retry scheduler. Lote de plano com mais de ~80
  atletas Garmin é o gatilho para revisitar.

## Capabilities

### New Capabilities
- `garmin-training-push`: entrega do treino planejado ao relógio Garmin do atleta — mapeamento do
  treino estruturado para workout + schedule, idempotência por `workoutId`, reconciliação após
  re-aprovação, remoção na exclusão do plano, tratamento de 412/429/401.

### Modified Capabilities
- (nenhuma: o push do intervals.icu não tem spec canônica; o contrato `WorkoutChannel` é
  implementação)

## Impact

- **Backend:** `GarminTrainingAdapter` (`WorkoutChannel`), `WorkoutChannelPorPlataforma`
  (`@Primary WorkoutChannel`), `GarminClient` ganha `criarWorkout`, `atualizarWorkout`,
  `deletarWorkout`, `criarSchedule`, `atualizarSchedule`, `deletarSchedule`,
  `listarSchedules(inicio, fim)`; `IntervalsIcuPushListener`, `IntervalsIcuRetrySchedulerImpl`,
  `IntervalsIcuPlanoDeletadoListener` e `IntervalsIcuPushProcessor` trocam
  `IntervalsIcuConnectionService.conexaoAtiva` por `conexaoDeCanal` e `PLATAFORMA` fixa por
  `conexao.getPlataforma()`; `WorkoutChannel.removerOrfaos` recebe também o conjunto de ids
  armazenados no canal. Sem migration.
- **Frontend:** nenhum. O `SyncStatusChip` e o texto de status já são neutros de marca
  (`watch-connection-guide`).
- **Não toca:** `IntervalsIcuAdapter`, `IntervalsIcuWorkoutConverter` (continua produzindo o
  `StructuredWorkout` para os dois canais), ingestão de realizado.

## Critérios de aceite

- **CA1 — Workout de corrida.** Given treino planejado com aquecimento (tempo, sem alvo), bloco
  6×(400 m pace 4:00–4:10 + 200 m sem objetivo) e desaquecimento, When o plano é aprovado para um
  atleta com conexão Garmin, Then o Garmin recebe `POST workout` com `sport=RUNNING`, `WorkoutStep`
  de `durationType=TIME`/`DISTANCE`, `WorkoutRepeatStep` com `REPEAT_UNTIL_STEPS_CMPLT=6`, pace
  como `targetType=PACE` com `targetValueLow=4.0` e `targetValueHigh=4.167` m/s, e `POST schedule`
  na data do treino; `externalId` do treino guarda o `workoutId` e o status fica `SINCRONIZADO`.
- **CA2 — FC absoluta.** Given etapa com alvo 140–150 bpm, Then o step vai com
  `targetType=HEART_RATE`, `targetValueLow=140`, `targetValueHigh=150`, sem consulta de LTHR.
- **CA3 — Re-aprovação.** Given treino já sincronizado (`externalId=workoutId`), When o plano é
  re-aprovado com o treino alterado, Then `PUT workout/{id}`; se a data mudou, o schedule é
  localizado por `workoutId` e atualizado; não há segundo workout.
- **CA4 — Órfãos.** Given schedule na semana apontando para workout do Menthoros cujo `workoutId`
  não está entre os treinos atuais, When a reconciliação roda, Then schedule e workout são
  apagados; workouts criados pelo atleta não são tocados.
- **CA5 — Exclusão do plano.** When o plano é excluído, Then schedule e workout de cada treino
  sincronizado são apagados; 404 é tratado como já apagado.
- **CA6 — 412.** Given Garmin responde 412, Then o treino fica `ERRO_AUTENTICACAO` com mensagem
  "Autorize o envio de treinos no Garmin Connect", sem retry.
- **CA7 — 429.** Given Garmin responde 429, Then o treino fica `ERRO_LIMITE_RATE` e o retry
  scheduler existente reenvia depois.
- **CA8 — 401.** Given Garmin responde 401, Then o token é renovado e a chamada repetida uma vez;
  falhando de novo, `ERRO_AUTENTICACAO`.
- **CA9 — Dois canais.** Given atleta A com Garmin e atleta B com intervals.icu no mesmo lote,
  When ambos os planos são aprovados, Then A vai pelo adapter Garmin e B pelo intervals.icu, e os
  testes do intervals.icu existentes continuam verdes.
- **CA10 — Sem conexão de canal.** Given atleta sem conexão ativa, Then nenhum push e o treino
  permanece `NAO_SINCRONIZADO`, como hoje.

## Métrica de sucesso

- ≥ 95 % dos treinos planejados de atletas Garmin em `SINCRONIZADO` até 10 min após a aprovação
  do plano, nas 4 primeiras semanas.
- Zero ocorrências de alvo de FC divergente do prescrito no relógio (classe do bug de 2026-10-01).

## Open Questions & Assumptions

- **Assumido:** o PDF tem o create em `/workoutportal/workout/v2` e o resto em
  `/training-api/workout/v2`; o spike no ambiente de testes confirma qual base vale (ajuste de
  constante, não de design).
- **Assumido:** `intensity` dos steps vai como `ACTIVE` em todos (o relógio não muda de
  comportamento por ela); `REST` só quando a etapa é "sem objetivo" dentro de um bloco.
  `shortcut: aquecimento/desaquecimento como ACTIVE; subir para WARMUP/COOLDOWN se um atleta
  reclamar da tela do relógio`.
- **Assumido:** limite de 100 steps por workout de um esporte só cobre qualquer treino gerado
  hoje; o adapter devolve `ERRO_VALIDACAO` se exceder.
