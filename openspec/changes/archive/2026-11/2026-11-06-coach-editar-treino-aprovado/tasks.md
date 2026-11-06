# Tasks — coach-editar-treino-aprovado

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (decisão do treinador que escreve no plano do atleta: fluxo crítico).

Plano refinado contra `develop` em 2026-11-04 (`/implement init`). O backend de `garmin-reenvio-plano`
já está em `develop` (PR #213): reusar `reiniciarSincronizacao`, `JANELA_SINCRONIZANDO`,
`conexaoCanal` e `CLAIM_PERDIDO` (D2, D6). Identificadores novos em inglês (D3). Paths relativos a
`src/main/java/br/com/menthoros/backend/` (backend) e `src/` (front).

Ordem: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10. A seção 2 só
começa com o backend desta change **e** o PR #188 do front em `develop`.

## 0. Validação em produção (depois do deploy)

A integração Garmin só existe em produção (decisão 2026-11-04): a hipótese R1 não pode ser validada
antes do merge. A change entra sem recriar o schedule, e o dialog não promete prazo de entrega ao
relógio.

- [ ] 0.1 Garmin real (R1), **pós-deploy em produção**: editar um treino já sincronizado no relógio,
  na mesma data. Registrar aqui o resultado, com data e modelo do relógio.
  verify: relógio mostra a versão nova depois de um sync manual → R1 encerrado; não mostra → abrir
  change de follow-up para recriar o schedule no caminho de edição (era a 1.8a).
  **Adiada no arquivamento (2026-11-06):** depende de deploy em produção (develop → main #224/#200 em 2026-11-06) e de relógio real; resultado vai para `menthoros-infra/docs` ou abre change de follow-up (1.8a).

## 1. Backend (worktree `.worktrees/backend-coach-editar-treino-aprovado`)

- [x] 1.1 Migration `V109__add_post_approval_edit.sql`: coluna `edited_after_approval_at TIMESTAMPTZ
  NULL` em `tb_treino_planejado` (sem backfill) e tabela `tb_planned_workout_post_approval_edit` (D7,
  FK `ON DELETE CASCADE`, índice `(tenant_id, planned_workout_id)`); campo `editedAfterApprovalAt` em
  `entity/TreinoPlanejado`, entidade `PlannedWorkoutPostApprovalEdit`, enum `WorkoutEditReason`
  (`PAIN_INJURY`, `SCHEDULE`, `LOAD`, `OTHER`) e repositório.
  verify: `./mvnw clean verify` sobe o Flyway no Testcontainers sem erro; um teste de repositório
  grava e lê uma linha com JSONB e motivo nulo.
- [x] 1.2 Reuso de domínio: `TreinoPlanejado.reiniciarSincronizacao(agora)` (já em `develop`) serve à
  edição. Só atualizar o JavaDoc para citar a edição pós-aprovação; teste unitário cobrindo treino
  sem `externalId` (o caso de `ERRO_*` já tem teste em `TreinoPlanejadoTest`).
  verify: `TreinoPlanejadoTest` verde; nenhum método de domínio novo.
- [x] 1.3 Regra de editabilidade (D1, regras 1 e 2) num ponto único, ex.
  `services/helper/ApprovedWorkoutEditPolicy`: entra `TreinoPlanejado`, `hoje` de
  `AtletaHojeResolver.hojeDe(atleta)` e `temRelogio` (`conexaoCanal` presente, ativa ou revogada);
  sai editável ou o motivo da recusa.
  verify: teste parametrizado com `Clock` fixo: `PENDENTE` amanhã (ok), `REALIZADO`, `PERDIDO` de
  hoje, ontem, hoje com e sem relógio, hoje com conexão revogada (recusa), e a virada 23h30 São
  Paulo / 02h30 UTC (ok para amanhã SP).
- [x] 1.4 `services/impl/TreinoPlanejadoServiceImpl.editarTreino` em plano `APROVADO`:
  `validarEstadoDoPlanoParaEdicao` (`:262`) aceita `APROVADO`; regra do 1.3 (422); 409 só com
  `SINCRONIZANDO` dentro de `JANELA_SINCRONIZANDO` (D1 regra 3, não `AGUARDANDO_RETRY`);
  exportabilidade do resultado via `IntervalsIcuWorkoutConverter` antes do commit (422); intenção de
  envio por `conexaoDeCanal(atletaId, tenantId)` (D2) com `reiniciarSincronizacao`;
  `editedAfterApprovalAt`; evento só com canal; `OptimisticLockingFailureException` vira 409.
  verify: testes de CA1, CA2, CA3, CA3a, CA3b, CA3c (inclui `SINCRONIZANDO` fora da janela → 200 e
  `AGUARDANDO_RETRY` → 200), CA4, CA5, CA8 e CA9 em `TreinoPlanejadoServiceImplTest`.
- [x] 1.5 Registro da edição (D7): `editReason` opcional em `dto/input/TreinoPlanejadoPatchDto`;
  `snapshot_before` antes do patch e `snapshot_after` depois, gravados na mesma transação só em
  `APROVADO` e só após as validações; nenhum log com o JSON ou o motivo.
  verify: teste de CA11b (com motivo, sem motivo, revisão não grava, 409/422 não gravam, `tenant_id`
  gravado).
- [x] 1.6 `dto/output/AtletaPerfilCoachOutputDto`: item de treino ganha `editedAfterApprovalAt` e
  `editable` (mesma política do 1.3); **sem** campo de canal novo (D6). No
  `CoachAthleteProfileServiceImpl`, reusar a consulta de `conexaoDeCanal` já feita para
  `channelConnected` (`:324`) e a `conexaoCanal` do perfil; nenhuma consulta por treino.
  verify: `CoachAthleteProfileServiceImplTest` com atleta Garmin, intervals.icu, revogado e sem
  conexão; contagem de chamadas ao `GarminConnectionService` não cresce com o número de treinos.
- [x] 1.7 `services/impl/IntervalsIcuPushProcessor.claimNaTx`: treino `SINCRONIZANDO` dentro de
  `JANELA_SINCRONIZANDO` devolve `CLAIM_PERDIDO`, sem mutação; fora da janela, claim normal (D2).
  verify: teste unitário dos dois casos no `IntervalsIcuPushProcessorTest` e regressão verde de
  `IntervalsIcuPushProcessorTest`, `IntervalsIcuPushListener*Test` e
  `IntervalsIcuRetrySchedulerImpl*Test`.
- [x] 1.8 `WorkoutEditedAfterApprovalEvent` + `WorkoutEditedPushListener` (`@Async("intervalsIcuPushExecutor")`,
  `AFTER_COMMIT`): resolve o canal de novo e chama `pushProcessor.processar` só para o treino; sem
  canal, pula sem mutar.
  verify: teste unitário com mocks (com canal chama `processar` uma vez; sem canal não chama).
- [x] 1.9 IT (`@TransactionalEventListener` só dispara com transação, WireMock do canal):
  - plano aprovado com 4 treinos `SINCRONIZADO` → PATCH em 1 → só ele é empurrado, mesmo
    `externalId` (CA6); atleta Garmin e atleta intervals.icu (CA7);
  - atleta Garmin, treino sem `externalId`, push da aprovação e da edição concorrendo → um único
    `criarWorkout` com o conteúdo editado (CA8b).
  Entregue em `PostApprovalEditPushIT` (Garmin): CA6, CA8b e CA3c/CA11b ponta a ponta. CA7 no IT só
  pelo Garmin; a rota por canal é a do `conexaoDeCanal` + `WorkoutChannelPorPlataforma` já cobertos, e o
  listener novo não escolhe canal (resolve e repassa), coberto em `WorkoutEditedPushListenerTest`.
  verify: IT verde no `./mvnw clean verify`; WireMock confere 1 chamada de update e 0 de create
  extra.
- [x] 1.10 `@Operation` do PATCH: regra nova, `editReason`, os 422 e o 409.
  verify: `/v3/api-docs` local mostra `editReason` no schema do patch e as respostas 409/422.
- Validação da seção: `./mvnw clean verify` e os `@WebMvcTest` afetados isolados (ver memória sobre
  verify local x CI).

## 2. Frontend (detalhes visuais no D8 do `design.md`)

Pré-condição: PR #188 (`garmin-reenvio-plano`, front) e o backend desta change em `develop`. Criar o
worktree `.worktrees/front-coach-editar-treino-aprovado` só então, a partir de `origin/develop`.

- [x] 2.1 Portar à mão para `src/types/AtletaPerfilCoach.ts` e `src/types/TreinoPlanejado.ts`:
  `editedAfterApprovalAt`, `editable` e `editReason` no patch. Canal vem do `conexaoCanal` que já
  existe.
  verify: `npm run build` sem erro de tipo.
- [x] 2.2 `features/coach/components/TreinoEditDialog.tsx`: prop `aviso` (D4/D8) com caixa
  informativa por canal, motivo opcional (`aria-pressed`) e rótulo do botão; faixa de erro 409/422
  sem fechar (D5).
  verify: teste de componente dos três casos (Garmin, intervals.icu, sem canal), do motivo indo no
  patch, do erro e do dialog sem a prop igual a hoje (`TreinoEditDialog.test.tsx` atual verde).
- [x] 2.3 `features/coach/components/CurrentWeekPlan.tsx`: cabeçalho da semana aprovada (D8); lápis
  guiado por `editable`; cadeado com rótulo para realizado, perdido e treino de hoje com relógio;
  passa o `aviso` ao dialog; snackbar após salvar.
  verify: teste de componente (CA10, CA11); `CurrentWeekPlan.reenvio.test.tsx` do #188 segue verde.
- [x] 2.4 `features/coach/components/TreinoPlanejadoCard.tsx`: selo "Editado após aprovação" quando
  `editedAfterApprovalAt` existe (CA12).
  verify: teste do card com e sem o campo.
- [x] 2.5 E2E Playwright (CA13): plano aprovado → editar treino pendente com motivo → salvar → selo
  no card; treino realizado sem lápis.
  verify: `npm run test:e2e` verde local.
- Validação da seção: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 3. QA (2026-11-04)

Revisores: `code-reviewer`, `security-reviewer`, `frontend-reviewer`, `clean-code-reviewer`. Nenhum
Critical. Aplicado (backend `1d1b906`, `f4f7566`; front `6311892`):

- Rótulo do cadeado pelo motivo do backend: o perfil ganha `editRejection` (`NOT_PENDING`,
  `PAST_DAY`, `TODAY_ON_WATCH`); o front não deduz mais o dia pelo navegador (apontado por dois
  revisores).
- Perfil sem `editable` (backend antigo) fica sem lápis e sem cadeado.
- "Atleta com relógio" num ponto só (`PostApprovalEditCoordinator.hasWatch`), usado pelo PATCH e
  pelo perfil; `Clock` injetado no `IntervalsIcuPushProcessor`.
- Teste que trava a ordem: o registro grava o "depois" antes de reiniciar a sincronização.
- `excluirTreino` recusa plano `APROVADO` (422): a exclusão apagaria em cascata o registro da edição
  e deixaria o workout órfão no relógio (decisão do founder). O DELETE ganha `@RequireTenant` e
  `@Operation`.
- Front: `WatchChannel`/`NOME_CANAL` no adapter, erro anterior limpo ao salvar de novo, snackbar não
  fecha no clique fora.

Rejeitado após checar o código: `editable` em plano `REJEITADO` (o perfil só monta treinos em
`APROVADO` e `AGUARDANDO_REVISAO`).

Desvio do D8, registrado: o cabeçalho da semana aprovada tem o chip "Aprovado" e o texto de apoio,
sem "por você em DD/MM" (o perfil não traz quem aprovou nem quando) e sem o título "Semana DD–DD
mmm" (a seção já se chama "Plano da semana").

Adiados (Minor): etapas novas sem id no snapshot "depois"; duas consultas de canal por PATCH;
`editable` true em treino `SINCRONIZANDO` (o PATCH responde 409, transitório); `podeEditar` com três
estados no `CurrentWeekPlan`.
