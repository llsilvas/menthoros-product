# Design — coach-editar-treino-aprovado

## Context

- **Edição hoje:** `TreinoPlanejadoServiceImpl.editarTreino` aplica um patch semântico (só campos não
  nulos) e chama `validarEstadoDoPlanoParaEdicao`, que exige `PlanoReviewStatus.AGUARDANDO_REVISAO`
  (`TreinoPlanejadoServiceImpl.java:262-265`). O front
  só mostra o lápis nesse status (`CurrentWeekPlan.tsx:193`), e o `TreinoEditDialog` já é usado pelo
  `CurrentWeekPlan` e pela `CoachPlanReviewPage`.
- **Envio ao relógio:** a aprovação publica `PlanoAprovadoEvent`. O `IntervalsIcuPushListener`
  (`@Async`, `AFTER_COMMIT`) escolhe o canal por `GarminConnectionService.conexaoDeCanal`, percorre
  os treinos do plano e chama `IntervalsIcuPushProcessor.processar(treinoId, tenantId, conexao)`.
  O claim (`claimNaTx`) recarrega o treino e grava `SINCRONIZANDO` **sem conferir o status anterior**;
  `@Version` só protege dois claims que leem a mesma versão ao mesmo tempo.
- **Identidade no canal difere por canal:** o intervals.icu acha o evento pelo id canônico quando
  falta o id guardado (`IntervalsIcuAdapter.java:71`); o Garmin **cria** workout e schedule quando o
  id guardado é nulo (`GarminTrainingAdapter.java:120`). Upsert sem duplicata só é garantido com
  `externalId` já gravado.
- **Estado de execução:** `TreinoPlanejado.statusTreino` (`TreinoExecucaoStatus`). O atleta pode
  marcar o treino de hoje como `PERDIDO` pelo `pularHoje` (`AtletaTreinoHojeServiceImpl.java:61`),
  então `PERDIDO` não é só dia passado.
- **"Hoje" do atleta:** `AtletaHojeResolver.hojeDe(atleta)` usa o fuso do atleta, com fallback
  `America/Sao_Paulo`. Os helpers `estaNoPassado()` de `TreinoPlanejado` usam o fuso da JVM e não
  servem aqui.
- **Retry:** o scheduler varre `AGUARDANDO_RETRY`, `ERRO_TEMPORARIO` e `ERRO_LIMITE_RATE`
  (`TreinoPlanejadoRepository.java:170`); não recupera `SINCRONIZANDO` nem `NAO_SINCRONIZADO`.
- **Já em `develop` por `garmin-reenvio-plano`** (backend mergeado no PR #213, `bac3833`, em
  2026-11-04; front no PR #188, aberto): `TreinoPlanejado.reiniciarSincronizacao(agora)` (volta a
  `AGUARDANDO_RETRY`, zera tentativas e erro, mantém `externalId`), `envioEmAndamento(agora)` com as
  janelas `JANELA_SINCRONIZANDO` (10 min) e `JANELA_AGUARDANDO_RETRY` (30 min), o perfil com
  `conexaoCanal` (`plataforma` + `ativo`, inclusive revogada) e o item de treino com
  `channelConnected`, `syncError` e `syncInProgress`. O PR #188 traz o `SyncStatusChip` neutro de
  canal. Esta change reusa tudo isso.

## Decisões

### D1 — Regra de editabilidade

Em plano `APROVADO`, o treino é editável quando **todas** valem:

1. `statusTreino` é `PENDENTE` (ou nulo). `REALIZADO`, `CONCLUIDO`, `PARCIAL`, `PERDIDO` (inclusive
   pulado hoje pelo atleta) → 422. Editar não reabre treino pulado.
2. `dataTreino` > `AtletaHojeResolver.hojeDe(atleta)`; ou `dataTreino` = hoje **e** o atleta sem
   relógio → senão 422. Com relógio, o treino de hoje pode já estar no aparelho e não há aviso ao
   atleta no v1 (decisão de produto 2026-11-03). "Com relógio" = existe `conexaoCanal`, **ativa ou
   revogada**: conexão que caiu não apaga o treino antigo do aparelho (achado do DoR 2026-11-04).
3. Não está `SINCRONIZANDO` dentro de `JANELA_SINCRONIZANDO` → senão **409** "Envio ao relógio em
   andamento; tente em alguns segundos." (D2). `SINCRONIZANDO` mais antigo que a janela é claim preso
   e não bloqueia (R3). `AGUARDANDO_RETRY` **não** dá 409: o próximo claim recarrega o treino e envia
   o conteúdo novo, e a segunda edição seguida do treinador não pode travar. Por isso não se usa o
   `envioEmAndamento` inteiro, só o ramo `SINCRONIZANDO`.
4. O treino resultante do patch continua exportável ao relógio (D2) → senão 422.

`AGUARDANDO_REVISAO` segue como hoje; outros status → 422.

O perfil do atleta passa a expor, por treino, `editable` (boolean) calculado no backend com as
regras 1 e 2. O front usa esse campo para o lápis, sem refazer a conta de data no navegador (o
`semana.ts` usa o fuso local, que pode divergir do atleta). O backend continua sendo a autoridade no
PATCH.

### D2 — Reenvio por treino, decidido no PATCH

Em `editarTreino`, quando o plano é `APROVADO`:

1. **Exportabilidade do resultado completo:** depois de aplicar o patch e antes do commit, roda o
   `IntervalsIcuWorkoutConverter` sobre o treino resultante. Vazio (descanso, ou sem duração e sem
   distância prescritivas) → 422. Isso evita o caminho `NAO_EXPORTAVEL`, em que o processor reseta o
   vínculo local e o evento antigo fica no relógio, porque só o `removerOrfaos` do listener do plano
   o removeria.
2. **Intenção de envio resolvida no PATCH:** `GarminConnectionService.conexaoDeCanal(UUID atletaId,
   UUID tenantId)` (só conexão ativa).
   - Sem conexão ativa → não toca nos campos de sincronização (CA8). Na reconexão, nada é reenviado
     automaticamente; o treinador usa o reenvio de `garmin-reenvio-plano` ou edita de novo.
   - Com conexão → reusa `treino.reiniciarSincronizacao(agora)` (já em `develop`): status
     `AGUARDANDO_RETRY`, zera tentativas e erro, grava `agora` como última tentativa, **mantém
     `externalId`**. Vale com ou sem vínculo externo, para o scheduler recuperar o envio se o
     processo cair antes do listener. O JavaDoc do método, que hoje fala só de `ERRO_*`, passa a
     citar também a edição pós-aprovação. Sem método de domínio novo.
3. `editedAfterApprovalAt = Instant.now()` em qualquer caso.
4. Com conexão, publica `WorkoutEditedAfterApprovalEvent(treinoId, planoId, atletaId, tenantId)`
   dentro da transação; o `WorkoutEditedPushListener` (`@Async("intervalsIcuPushExecutor")`,
   `AFTER_COMMIT`) chama `pushProcessor.processar` só para esse treino. O canal é resolvido de novo
   no listener (como no `IntervalsIcuPushListener`), não carregado no evento: se a conexão caiu entre
   o commit e o listener, ele pula sem mutar e o scheduler não acha canal. Se o listener falhar ou
   não rodar, o scheduler pega o `AGUARDANDO_RETRY`.

**Claim condicional (mudança no processor):** `claimNaTx` passa a **não reclamar** treino que já
está `SINCRONIZANDO` dentro de `JANELA_SINCRONIZANDO`, e devolve o `CLAIM_PERDIDO` que já existe ("outro
worker já reclamou o treino nesta janela — desistência silenciosa"), sem mutação. Nenhum valor novo
em `ProcessamentoResultado`; listener do plano e scheduler já tratam `CLAIM_PERDIDO`. Fora da
janela, o claim é retomado normalmente: recupera o treino preso (R3). Junto com a regra 3 do D1,
isso fecha os dois bloqueadores do pre-mortem:

- push da aprovação em andamento + edição → o PATCH recebe 409; nada de conteúdo A sobrescrevendo B
  no canal;
- edição antes do primeiro push da aprovação (Garmin sem `externalId`) → o PATCH grava B e
  `AGUARDANDO_RETRY`; o primeiro claim que chegar (aprovação, listener novo ou scheduler) recarrega o
  treino fresco e envia B; o segundo encontra `SINCRONIZANDO` e sai, ou encontra `SINCRONIZADO` com
  `externalId` e atualiza no lugar. Nenhum dos dois cria um segundo workout no Garmin.
- PATCH e claim lendo a mesma versão ao mesmo tempo → o `@Version` de `TreinoPlanejado` faz um dos
  dois falhar por lock otimista; nenhum sobrescreve o outro em silêncio. O PATCH que perde responde
  409 (mesma mensagem da regra 3).

**Por que não republicar `PlanoAprovadoEvent`:** reprocessaria a semana inteira, rodaria a
reconciliação de órfãos e o nudge anti-debounce por causa de um treino, e qualquer ouvinte futuro da
aprovação passaria a disparar a cada edição.

### D3 — Marca persistida `editedAfterApprovalAt`

Coluna `edited_after_approval_at TIMESTAMPTZ NULL` em `tb_treino_planejado` (migration `V109`; `V107`
e `V108` já estão em `develop`; sem backfill). Exposta no item de treino de
`AtletaPerfilCoachOutputDto`, junto com `editable` (D1).

**Nomes em inglês** (regra "Identifier Language" do `CLAUDE.md` do backend, ADR-0007), como os campos
que `garmin-reenvio-plano` já pôs no mesmo DTO (`channelConnected`, `syncInProgress`). Os campos
legados em português de `TreinoPlanejado` **não** são renomeados aqui: a regra pede normalizar o que
a change já modifica, e renomear a entidade inteira multiplicaria o escopo e o conflito com o PR #188.
Persistida porque o treinador volta à tela outro dia e precisa saber o que mudou depois de aprovar;
e é a base da métrica.

### D4 — Aviso no `TreinoEditDialog`

Prop nova opcional `aviso?: { canal: 'GARMIN' | 'INTERVALS_ICU' | null }`. Sem a prop, o dialog
fica como hoje (a Revisão não muda). Com a prop:

- caixa informativa (tokens `semantic.info`) com o título "Este treino faz parte de um plano já
  aprovado" e o texto por canal;
- motivo opcional de um toque (D7), botões de alternância com `aria-pressed`; vai no patch como
  `editReason`;
- rótulo do botão: "Salvar e reenviar" com canal, "Salvar" sem.

O alerta de "treino de hoje" do protótipo sai: esse treino não é editável com relógio (D1).

O texto **não promete** quando o relógio recebe a versão nova (R1).

### D5 — Feedback depois de salvar

`CurrentWeekPlan` já chama `onTreinoEditado`, que recarrega o perfil. Depois da recarga o card
mostra os valores novos, o selo e o chip conforme o status de sincronização. Sem polling
(non-goal). 409 e 422 mostram a mensagem do backend no dialog, sem fechar.

### D6 — Canal: reusa o que `garmin-reenvio-plano` entregou

**Revisado em 2026-11-04.** A versão anterior previa esta change criando um `canalConectado` enum no
perfil, com `garmin-reenvio-plano` reusando depois. A ordem se inverteu: o backend de
`garmin-reenvio-plano` foi mergeado antes (PR #213) e o perfil já expõe `conexaoCanal`
(`plataforma`: `GARMIN` | `INTERVALS_ICU`, `ativo`, `workoutImport`). Esta change **não cria campo de
canal**:

- o dialog cita o canal por `conexaoCanal.plataforma` quando `conexaoCanal.ativo`;
- "atleta com relógio" do D1 (treino de hoje) = `conexaoCanal` presente, ativo ou não;
- o backend calcula `editable` com a mesma consulta de `conexaoDeCanal` que o
  `CoachAthleteProfileServiceImpl` já faz para `channelConnected` (`:324`), sem consulta extra por
  treino.

O chip neutro de canal vem do PR #188 (front de `garmin-reenvio-plano`). O front desta change parte de
`develop` **depois** do merge do #188, que também mexe em `CurrentWeekPlan` e `SyncStatusChip`.

### D7 — Registro da edição pós-aprovação

Tabela `tb_planned_workout_post_approval_edit` (na mesma `V109`), entidade
`PlannedWorkoutPostApprovalEdit`, enum `WorkoutEditReason`:

| coluna | tipo |
|---|---|
| `id` | `UUID PK` |
| `tenant_id` | `UUID NOT NULL` (índice com `planned_workout_id`) |
| `planned_workout_id` | `UUID NOT NULL FK tb_treino_planejado ON DELETE CASCADE` |
| `weekly_plan_id` | `UUID NOT NULL` |
| `edited_by` | `VARCHAR NOT NULL` (subject do token, como os outros registros de autoria) |
| `edited_at` | `TIMESTAMPTZ NOT NULL` |
| `reason` | `VARCHAR NULL` (`PAIN_INJURY`, `SCHEDULE`, `LOAD`, `OTHER`) |
| `snapshot_before` / `snapshot_after` | `JSONB NOT NULL` (`TreinoPlanejadoOutputDto` serializado) |

Gravada no `editarTreino`, na mesma transação, só em plano `APROVADO` e só depois de todas as
validações (409/422 não gravam). `snapshot_before` é serializado antes de aplicar o patch. Só escrita
nesta change: sem endpoint de leitura, e fora do cálculo de taxa de aceitação de propostas da IA.
`ON DELETE CASCADE` porque excluir o plano exclui os treinos e o registro perde o sentido.

**Retenção (LGPD).** O registro vive o mesmo tempo que o treino, sem retenção própria: a cadeia
`tb_atleta` → `tb_treino_planejado` (`ON DELETE CASCADE`, `V1`) → este registro (`ON DELETE
CASCADE`) apaga os snapshots e o motivo quando o atleta é excluído. Nenhum log ou mensagem de erro
inclui o JSON ou o motivo. Prazo de retenção menor que a vida do treino fica fora; entra quando houver
leitura do registro.

### D8 — Detalhes de UI (do protótipo)

Fonte: https://claude.ai/artifact/Tg5fFzr1Sxq8EL2mkK8mQD, ajustado pelas decisões de 2026-11-03 (sem
alerta de treino de hoje; com motivo da edição). Tudo com tokens de `src/theme/tokens.ts`, nada de
hex no componente.

**Cabeçalho da semana (`CurrentWeekPlan`, plano aprovado):**
- título "Semana DD–DD mmm" + chip "Aprovado" (ícone check, borda e fundo `semantic.success` com
  alpha, texto `surface[200]`; lime nunca como estado) + "por você em DD/MM" em `surface[400]`;
- à direita, texto de apoio `surface[400]`: "Treinos pendentes podem ser editados. Realizados ficam
  travados."

**Card (`TreinoPlanejadoCard` via `actions`/`rodape`):**
- treino editável: `IconButton` lápis (`EditOutlined`, 18px, `surface[400]`, hover `primary[400]`),
  `aria-label="Editar treino de <dia>"`, área de toque 44px;
- realizado ou perdido: cadeado (`LockOutlined`, 16px, `surface[500]`) com `Tooltip` e `aria-label`
  "Treino realizado — não editável" (ou "Treino perdido — não editável");
- treino de hoje de atleta com relógio: o mesmo cadeado, com o rótulo "Treino de hoje já está no
  relógio";
- treino realizado mantém a borda tingida de `semantic.success` que o card já usa por `estado`;
- rodapé: o `SyncStatusChip` atual + selo "Editado após aprovação" (altura 22, raio 4, borda
  `overlayWhite[22]`, texto `surface[300]`, 11px, peso 600) quando `editedAfterApprovalAt` existe;
- o chip de sync não pode depender só da cor: texto claro (`surface[200]`) com um ponto colorido.
  O azul `semantic.info` como texto sobre `surface[800]` dá cerca de 4,4:1 e reprova.

**Dialog (`TreinoEditDialog` com `aviso`):**
- a caixa do aviso fica no topo do conteúdo, antes da tabela de zonas: borda
  `semantic.info` com alpha 0,55, fundo `semantic.info` com alpha 0,10, raio 8, padding 12×14;
  ícone info 18px; título 13px peso 600 "Este treino faz parte de um plano já aprovado"; texto
  13px/18px em `surface[300]`:
  - com canal: "O treino já está no <Garmin Connect | intervals.icu> de <Nome>. Ao salvar, a
    versão anterior é substituída no relógio.";
  - sem canal: "<Nome> não conectou relógio. A mudança aparece só no app." (sem pronome, para não
    supor gênero);
- o motivo vai logo abaixo de "Treino inteiro", antes da observação: rótulo "Motivo do ajuste
  (opcional)" e 4 botões de alternância (Dor/lesão, Agenda, Carga, Outro), altura 32, um selecionado
  por vez, `aria-pressed`, selecionado com borda `primary[500]` (seleção, uso permitido de lime);
- rodapé: "Cancelar" (ghost) + primário "Salvar e reenviar" (com canal) ou "Salvar"; o hint de
  total (km, min, min na zona) continua igual;
- 409/422: faixa `role="alert"` no topo do conteúdo com a mensagem do backend; o dialog não fecha e
  mantém as edições.

**Depois de salvar:** snackbar "Treino de <dia> atualizado." ou "Treino de <dia> atualizado.
Reenviando ao <canal>."; perfil recarrega (D5).

**Fora do protótipo, no real:** confirmação de descarte e aviso de remoção de
aquecimento/desaquecimento continuam como hoje no `TreinoEditDialog`.

## Riscos e mitigações

- **R1 — Garmin pode não entregar a revisão ao relógio** (hipótese do pre-mortem, não verificada). O
  adapter atualiza o workout, mas `garantirSchedule` não mexe no schedule quando já existe um na
  data (`GarminTrainingAdapter.java:151`). Mitigação: task 0.1 valida com Garmin real (workout
  sincronizado no relógio, editado na mesma data) **antes da task 1.4**. Se o relógio não pegar a
  versão nova, a task 1.8a (recriar o schedule no caminho de edição) passa a valer; até lá o dialog
  não promete prazo.
- **R2 — Atleta já sincronizou a versão antiga (treino de hoje).** Eliminado no v1: treino de hoje
  com relógio não é editável (D1). Custo aceito: o treinador não ajusta o treino do dia pelo app.
- **R3 — Claim preso em `SINCRONIZANDO`** (processo cai entre claim e marcação). A regra 3 do D1 e o
  claim condicional olham só `SINCRONIZANDO` dentro de `JANELA_SINCRONIZANDO` (10 min): passado esse
  tempo, o PATCH é aceito e o claim seguinte retoma o treino. A trava dura no máximo a janela, não
  "para sempre" (achado do DoR 2026-11-04). Varredura ativa de `SINCRONIZANDO` preso pelo scheduler
  segue como follow-up: sem ela, o treino preso só sai quando alguém o edita ou reenvia.
- **R4 — Edição em série gera rajada de pushes.** Aceito: upsert idempotente com `externalId` e
  volume baixo.
- **R5 — Conflito com `garmin-reenvio-plano`** em `CurrentWeekPlan` e no perfil. O backend dela já
  está em `develop`. Mitigação: D6; o front desta change só começa depois do merge do PR #188.
- **R6 — Dado pessoal no registro.** `snapshot_before`/`snapshot_after` e o motivo `PAIN_INJURY` são
  dado de saúde do atleta (LGPD). Mitigação: tabela com `tenant_id` e só escrita; apagada em cascata
  com o atleta (D7); nenhum log com o conteúdo do JSON ou o motivo.

## Rollback

Reverter o PR do backend restaura a trava em `AGUARDANDO_REVISAO` e o claim incondicional. A coluna
`edited_after_approval_at` e a tabela `tb_planned_workout_post_approval_edit` ficam (sem leitura).
Treinos já editados mantêm os valores novos, que são válidos. Reverter o PR do front só esconde o
lápis em plano aprovado.

## Ordem de entrega

1. Task 0.1 (validação Garmin real), antes da task 1.4 e antes de prometer qualquer coisa no texto
   do dialog.
2. Backend desta change, PR para `develop`.
3. Frontend, PR para `develop` depois do backend desta change **e** do PR #188 em `develop`.
