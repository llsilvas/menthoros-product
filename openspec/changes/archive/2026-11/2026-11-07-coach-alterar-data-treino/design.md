# Design — coach-alterar-data-treino

## Context

`TreinoPlanejado` guarda `dataTreino` (`LocalDate`) e `diaSemana` (enum), os dois preenchidos na
geração e na adição manual (`TreinoPlanejadoServiceImpl.adicionarTreino`, que deriva o dia da
data e valida a semana). `editarTreino` aplica `TreinoPlanejadoPatchDto` campo a campo em
`aplicarPatch` e, em plano aprovado, passa por `PostApprovalEditCoordinator.checkBeforePatch` /
`applyAfterPatch` (snapshot antes/depois, regra de editabilidade, reinício da sincronização com o
relógio).

No front, `TreinoEditDialog` monta o patch só com o que mudou (`montarPatch`) e é usado por três
telas: `CoachPlanReviewPage` (revisão), `CurrentWeekPlan` (semana atual, plano aprovado) e
`planosDialog` (shell legado).

## Goals / Non-Goals

**Goals:** mover o treino dentro da semana do plano por PATCH, com as mesmas consequências de
descanso e cobertura que a adição e a exclusão já têm.

**Non-Goals:** outra semana, swap, date picker, mexer na disponibilidade do atleta.

## Decisions

### D1 — `dataTreino` no patch; `diaSemana` sempre derivado

O patch leva só `dataTreino`. `diaSemana` é derivado no service, como na adição — aceitar os dois
abriria incoerência (`dataTreino` numa terça com `diaSemana = QUA`).

### D2 — Validação da semana em ponto único

Extrair a checagem `[semanaInicio, semanaFim]` de `validarEstadoDoPlanoParaAdicao` para um
helper privado (`validarDataDentroDoPlano(plano, data)`) usado pela adição e pela edição. Mesma
mensagem, mesmo status.

### D3 — Plano aprovado: destino passa pela mesma política da origem

`checkBeforePatch` avalia a origem com `ApprovedWorkoutEditPolicy.avaliar(treino, hoje, hasWatch)`,
onde `hoje = atletaHojeResolver.hojeDe(atleta)` (fuso do atleta, não da JVM). O destino passa
pela **mesma política e o mesmo `hoje`**: data passada → `PAST_DAY`; hoje com relógio conectado →
`TODAY_ON_WATCH`. Dois motivos: simetria (o treinador não "esconde" treino no passado) e
idempotência — mover para hoje com relógio criaria um estado em que o PATCH repetido após
resposta perdida recebe 422 sem o treinador saber que já aplicou (pre-mortem Codex, achado 4).
Com o destino também bloqueado em hoje-com-relógio, repetir o PATCH só com a data já aplicada é
no-op e devolve 200 (o no-op compara o snapshot inteiro do treino, então vale para qualquer
patch sem mudança observável em plano aprovado, não só data igual) — **exceto na janela de push**: `checkBeforePatch` roda antes da
mutação e recusa `SINCRONIZANDO` com 409 (`PostApprovalEditCoordinator`, regra canônica). Depois
de um commit com resposta perdida o push já pode ter começado, então o retry pode receber 409. O
front não reenvia às cegas: em erro de transporte ou 409 ele recarrega o treino (GET); se a data
já é a nova, trata como aplicado; senão tenta de novo após a janela. Patch misto (data igual +
outro campo) segue o fluxo atual: `applyAfterPatch` marca a edição e reinicia a sincronização.

### D7 — Reenvio ao relógio: procurar o evento antigo na semana inteira

`IntervalsIcuAdapter.buscarIdPorExternalId` lista eventos **só na data agendada**
(`listarEventos(token, atleta, data, data)`). Se o primeiro POST criou o evento e a resposta se
perdeu (sem `eventId` gravado), o reenvio após mover procura na data nova, não acha e cria de
novo — treino nos dois dias, e a API não deduplica por `external_id`
(`IntervalsIcuClientImpl:62`). Decisão: quando não há `eventId` armazenado, buscar pelo
`externalId` em `[semanaInicio, semanaFim]` do plano antes de criar; achado → atualizar
(`atualizarOuRecriar`, que já move a data). Conferir o mesmo caminho no adapter Garmin.

### D4 — Efeitos colaterais reaproveitados

- Destino: `removerDescansoDoDia(plano, novoDia)` — o treinador prescreveu num dia que a IA
  marcou como descanso; é discordância explícita, igual à adição.
- Origem: `avisarSeDiaFicouSemPrescricao` hoje recebe o treino excluído; generalizar para receber
  `(plano, diaOrigem, treinoIdIgnorado)` e chamar com o dia antigo. Só log e contador, como na
  exclusão.
- Volume do plano não muda (a distância não mudou).

### D5 — Select de sete dias, sem date picker

O dialog recebe `semana: { inicio: string; fim: string }` (ISO) como prop nova, obrigatória.
Gera as sete datas e mostra `Seg 03/11`. `planosDialog` e `CurrentWeekPlan` já têm o plano em
mãos; `CoachPlanReviewPage` também. Sem `@mui/x-date-pickers`: dependência nova para sete opções.

Dia fora de `diasDisponiveis` do atleta: sufixo discreto no item ("· fora dos dias do atleta"),
só quando o dialog receber `diasDisponiveis` (prop opcional). Sem a prop, sem marcação.

### D6 — Patch só quando mudou; `CurrentWeekPlan` deriva a data original

`montarPatch` inclui `dataTreino` só se diferente da data original. Mantém o CA7 e evita
reiniciar sincronização à toa em plano aprovado.

`CurrentWeekPlan.toDialogTreino` monta o treino do dialog a partir de `TreinoPlanejadoResumoDto`,
que **não tem `dataTreino`** — só `diaSemana`. Sem tratar isso, o select abriria vazio ou o patch
mandaria data sempre. Decisão: `toDialogTreino` deriva `dataTreino` de `semana.inicio +
índice(diaSemana)` e o dialog compara com esse valor; a mesma função serve para hidratar o select.
Alternativa (ampliar o DTO resumido no backend) fica para quando outro consumidor precisar.

## Risks / Trade-offs

- **Front novo × backend antigo:** o PATCH com `dataTreino` seria aceito (200) e ignorado. Mitigado
  pela ordem de deploy (backend primeiro) e pelo front comparar a resposta: se `dataTreino` da
  resposta ≠ enviado, mostrar erro "não foi possível mover o treino" (barato, cobre a janela).
- **Snapshot do coordinator:** se o snapshot/diff não incluir a data, a edição "só de data" não
  marcaria `editadoPosAprovacao`. Conferir no `/implement init` e incluir a data no snapshot.
- **Resposta perdida após commit:** com D3 (destino nunca é hoje-com-relógio), repetir o PATCH é
  no-op e devolve 200; o front, em erro de transporte, recarrega o treino antes de reenviar.
- **Duplicata no relógio:** D7 cobre o intervals.icu (o evento carrega `externalId`). **Garmin
  não tem vínculo recuperável:** o único elo é o `workoutId` gravado localmente; se o workout foi
  criado e a persistência local se perdeu (`IntervalsIcuPushProcessor`, TX-B), o reenvio unitário
  (`WorkoutEditedPushListener`) cria outro workout, e o órfão só sai no próximo push do plano
  inteiro (`removerOrfaos` roda só no `IntervalsIcuPushListener`). É gap pré-existente de qualquer
  reenvio pós-edição, não desta change; mover a data só torna o órfão visível em outro dia.
  Decisão: fora de escopo; follow-up `garmin-reenvio-unitario-remover-orfaos` (rodar
  `removerOrfaos` na semana após o push unitário). Registrado em Open Questions.
- **Dois treinos no mesmo dia:** permitido hoje na adição; o dialog não avisa. Fora do escopo.

## Migration

Nenhuma: colunas existentes. Sem backfill.
