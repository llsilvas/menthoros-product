**Tamanho:** S · **Trilha:** Fast

# Proposal — fix-garmin-workout-update

Correções no push de treinos ao Garmin (Training API V2), achadas na revisão do código entregue
por `garmin-training-push` contra o PDF oficial (`Training API V2 2.0/Training_API V2 2.0.pdf`)
em 2026-11-04. Só backend, sem migration, sem mudança de contrato de API.

## Why

- **Re-aprovação quebrada.** O PUT `/training-api/workout/v2/{workoutId}` vai sem `ownerId`, que
  a Training API exige em update (§3.1: "not necessary for Creating workouts but is required for
  updates"). `GarminTrainingAdapter.enviar` reenvia o payload do create, montado por
  `GarminWorkoutPayloadMapper`, que não tem `ownerId` nem `workoutId`. Toda re-aprovação de treino
  já enviado tende a voltar 400 → `ERRO_VALIDACAO`, e o treinador vê o treino antigo no relógio do
  atleta. O `GarminTrainingPushIT` não pega porque o stub aceita qualquer PUT.
- **Bloqueia `garmin-reenvio-plano`.** O reenvio republica o push; treino com `workoutId` guardado
  passa pelo PUT e cairia no mesmo 400.
- **Pace de valor único vira faixa de largura zero.** Texto "4:30/km" gera `targetValueLow ==
  targetValueHigh`; o relógio alerta "fora do ritmo" a qualquer oscilação. O adapter do
  intervals.icu manda `value` nesse caso; o Garmin só aceita `targetValue` para zona (1–5), então
  aqui a saída é uma faixa com tolerância.
- **Faixa de FC literal não ordenada.** `IntervalsIcuFcAlvoResolver` cria `HrTarget(inicio, fim)`
  na ordem do texto; "150-140 bpm" vira Low > High. O pace já é normalizado com min/max.

## What Changes

- `GarminTrainingAdapter.enviar`: antes do PUT, `GarminClient.buscarWorkout` (já existe) e copia
  `ownerId` e `workoutId` da resposta para o payload. GET 404 segue o caminho atual de 404 no PUT
  (atleta apagou o workout → cria de novo). Custo: +1 chamada por re-aprovação.
- `GarminWorkoutPayloadMapper`: pace com `start == end` vira faixa `[valor + 5 s/km, valor − 5
  s/km]` convertida para m/s (Low = mais lento).
- `IntervalsIcuFcAlvoResolver`: `HrTarget(min(inicio, fim), max(inicio, fim))`. Vale para os dois
  canais — o resolver é compartilhado.
- `GarminTrainingPushIT`: o stub do PUT passa a exigir `ownerId` e `workoutId` no corpo.
- `GarminWorkoutPayloadMapper` (incluído em 2026-11-04 a pedido do founder): bloco cujo último
  filho é descanso (`intensity=REST`, trote sem meta) leva `skipLastRestStep: true` (Training API
  §3.1, `WorkoutRepeatStep`). Sem isso, depois do último tiro o atleta ainda faz o trote do bloco
  antes do desaquecimento.

**Não toca:** criação de workout/schedule, `removerOrfaos`, scheduler de retry, contrato REST,
schema.

## Critérios de aceite

- **CA1 — PUT com ownerId.** Given treino com `workoutId` guardado e GET do workout devolvendo
  `ownerId=12345`, When o plano é re-aprovado, Then o PUT sai com `ownerId=12345` e `workoutId`
  igual ao do path, e o treino fica `SINCRONIZADO`.
- **CA2 — Workout apagado no Garmin.** Given GET do workout responde 404, Then nenhum PUT é feito,
  o workout é criado de novo com schedule, e o `externalId` passa a ser o novo `workoutId`.
- **CA3 — Erro no GET.** Given GET responde 401/403/412/429/5xx, Then o status do treino segue o
  mesmo mapeamento do PUT hoje (`ERRO_AUTENTICACAO`, `ERRO_LIMITE_RATE`, `ERRO_TEMPORARIO`) e
  nenhum PUT é feito.
- **CA4 — Pace único.** Given etapa com ritmo "4:30/km", Then `targetType=PACE`,
  `targetValueLow = 1000/275` e `targetValueHigh = 1000/265` (m/s, 3 casas); faixa "4:30-4:40/km"
  continua sem tolerância extra.
- **CA5 — FC invertida.** Given texto "150-140 bpm", Then `HrTarget(140, 150)` e, no Garmin,
  `targetValueLow=140`, `targetValueHigh=150`.
- **CA6 — IT.** `GarminTrainingPushIT` falha se o PUT chegar sem `ownerId` ou com `workoutId`
  diferente do path.
- **CA7 — Pula o último descanso.** Given intervalado 6x(1 km + 2 min de trote sem meta) seguido de
  desaquecimento, Then o `WorkoutRepeatStep` sai com `skipLastRestStep: true`. Given bloco cujo
  último passo tem meta (recuperação por FC no fartlek), Then o campo não é enviado. Só etapa
  `RECUPERACAO` é pulada (`WorkoutStep.recovery`): passo sem meta que não é recuperação — tiro
  livre, km livre de alternado — nunca é cortado (achado do gate de QA, Codex, 2026-11-04).

## Métrica de sucesso

- Zero treinos em `ERRO_VALIDACAO` vindos de PUT do canal Garmin nas 2 semanas após o deploy
  (hoje: toda re-aprovação de treino já enviado é candidata).
- Re-aprovação do treinador chega ao relógio sem ação extra — o treinador não precisa apagar e
  reaprovar o plano para corrigir um treino.

## Open Questions & Assumptions

- **Assumido:** a resposta do GET `/training-api/workout/v2/{id}` traz `ownerId` (a doc mostra
  `ownerId` nos exemplos de workout e diz que o GET devolve "the retrieved workout in JSON").
  Validar no ambiente de testes antes do merge (task 3.1).
- **Assumido:** tolerância de ±5 s/km para pace único. Valor de produto, ajustável; alternativa
  seria ±2%. Confirmar com o founder.
- **Alternativa rejeitada:** persistir o `ownerId` da resposta do create — economiza a chamada,
  mas exige migration e não cobre os workouts já criados.
- **Não verificado:** a doc só diz que `skipLastRestStep` é ligado automaticamente em
  `LAP_SWIMMING`; não diz o default para `RUNNING` nem quais relógios respeitam o campo. Validar
  no device (task 3.1). Recuperação com meta de FC vai como `ACTIVE` e não é pulada — escolha
  consciente: o relógio só pula o que é descanso livre.
- **Não verificado:** se o 400 acontece mesmo em produção — nenhuma re-aprovação Garmin foi
  observada até hoje. O fix segue a doc; a task 3.1 confirma.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| +1 chamada por re-aprovação aperta a cota (100/min por app, 200/usuário/dia — Training API §2.3) | Re-aprovação é rara frente à criação; 429 cai no retry existente. Ver risco de cota em `garmin-reenvio-plano`. |
| **Fora do escopo:** workout órfão sem schedule quando o DELETE de limpeza em `criar` falha por 429/timeout — `removerOrfaos` só enxerga workouts via schedule, e cada retry cria outro | Registrado; change própria se aparecer lixo na biblioteca de atletas reais. |
| **Fora do escopo:** nenhum controle de rate limit no push (até 4 threads, só reage ao 429) | Registrado; aceito enquanto o volume for de assessorias fundadoras. |
| Mudança na ordenação de FC afeta também o intervals.icu | Efeito desejado: Low > High é inválido nos dois canais. |

## Dependências

- Deve entrar **antes** de `garmin-reenvio-plano` (ou no mesmo ciclo).

## Referências

- Training API V2 2.0, §2.3 (rate limit), §3.1 (`ownerId`), §3.5 (Update).
- ADR-0013 (re-aprovação faz PUT; alvo de FC em bpm e pace em m/s).
- Revisão de 2026-11-04 do push contra a doc (sessão de validação de `garmin-activity-ingestion`).
