# Tasks — coach-editar-treino-aprovado

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (decisão do treinador que escreve no plano do atleta: fluxo crítico).

Plano refinado contra `develop` em 2026-11-04 (`/implement init`). O backend de `garmin-reenvio-plano`
já está em `develop` (PR #213): reusar `reiniciarSincronizacao`, `JANELA_SINCRONIZANDO`,
`conexaoCanal` e `CLAIM_PERDIDO` (D2, D6). Identificadores novos em inglês (D3). Paths relativos a
`src/main/java/br/com/menthoros/backend/` (backend) e `src/` (front).

Ordem: 0.1 antes de 1.4. 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10. A seção 2 só
começa com o backend desta change **e** o PR #188 do front em `develop`.

## 0. Validação antes de implementar

- [ ] 0.1 Garmin real (R1): workout já sincronizado no relógio, editado no Garmin Connect via API na
  mesma data. Registrar aqui o resultado, com data e modelo do relógio.
  verify: relógio mostra a versão nova depois de um sync manual, sem mexer no schedule → 1.8a fica
  cancelada; não mostra → 1.8a passa a valer e entra na ordem antes da 1.9.

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
- [ ] 1.4 `services/impl/TreinoPlanejadoServiceImpl.editarTreino` em plano `APROVADO`:
  `validarEstadoDoPlanoParaEdicao` (`:262`) aceita `APROVADO`; regra do 1.3 (422); 409 só com
  `SINCRONIZANDO` dentro de `JANELA_SINCRONIZANDO` (D1 regra 3, não `AGUARDANDO_RETRY`);
  exportabilidade do resultado via `IntervalsIcuWorkoutConverter` antes do commit (422); intenção de
  envio por `conexaoDeCanal(atletaId, tenantId)` (D2) com `reiniciarSincronizacao`;
  `editedAfterApprovalAt`; evento só com canal; `OptimisticLockingFailureException` vira 409.
  verify: testes de CA1, CA2, CA3, CA3a, CA3b, CA3c (inclui `SINCRONIZANDO` fora da janela → 200 e
  `AGUARDANDO_RETRY` → 200), CA4, CA5, CA8 e CA9 em `TreinoPlanejadoServiceImplTest`.
- [ ] 1.5 Registro da edição (D7): `editReason` opcional em `dto/input/TreinoPlanejadoPatchDto`;
  `snapshot_before` antes do patch e `snapshot_after` depois, gravados na mesma transação só em
  `APROVADO` e só após as validações; nenhum log com o JSON ou o motivo.
  verify: teste de CA11b (com motivo, sem motivo, revisão não grava, 409/422 não gravam, `tenant_id`
  gravado).
- [ ] 1.6 `dto/output/AtletaPerfilCoachOutputDto`: item de treino ganha `editedAfterApprovalAt` e
  `editable` (mesma política do 1.3); **sem** campo de canal novo (D6). No
  `CoachAthleteProfileServiceImpl`, reusar a consulta de `conexaoDeCanal` já feita para
  `channelConnected` (`:324`) e a `conexaoCanal` do perfil; nenhuma consulta por treino.
  verify: `CoachAthleteProfileServiceImplTest` com atleta Garmin, intervals.icu, revogado e sem
  conexão; contagem de chamadas ao `GarminConnectionService` não cresce com o número de treinos.
- [ ] 1.7 `services/impl/IntervalsIcuPushProcessor.claimNaTx`: treino `SINCRONIZANDO` dentro de
  `JANELA_SINCRONIZANDO` devolve `CLAIM_PERDIDO`, sem mutação; fora da janela, claim normal (D2).
  verify: teste unitário dos dois casos no `IntervalsIcuPushProcessorTest` e regressão verde de
  `IntervalsIcuPushProcessorTest`, `IntervalsIcuPushListener*Test` e
  `IntervalsIcuRetrySchedulerImpl*Test`.
- [ ] 1.8 `WorkoutEditedAfterApprovalEvent` + `WorkoutEditedPushListener` (`@Async("intervalsIcuPushExecutor")`,
  `AFTER_COMMIT`): resolve o canal de novo e chama `pushProcessor.processar` só para o treino; sem
  canal, pula sem mutar.
  verify: teste unitário com mocks (com canal chama `processar` uma vez; sem canal não chama).
- [ ] 1.8a **Condicional à 0.1:** recriar o schedule do Garmin no caminho de edição (só se o relógio
  não pegar a versão nova). Cancelar com a justificativa da 0.1 se não for preciso.
  verify: IT do `GarminTrainingPushIT` com o schedule recriado na mesma data.
- [ ] 1.9 IT (`@TransactionalEventListener` só dispara com transação, WireMock do canal):
  - plano aprovado com 4 treinos `SINCRONIZADO` → PATCH em 1 → só ele é empurrado, mesmo
    `externalId` (CA6); atleta Garmin e atleta intervals.icu (CA7);
  - atleta Garmin, treino sem `externalId`, push da aprovação e da edição concorrendo → um único
    `criarWorkout` com o conteúdo editado (CA8b).
  verify: IT verde no `./mvnw clean verify`; WireMock confere 1 chamada de update e 0 de create
  extra.
- [ ] 1.10 `@Operation` do PATCH: regra nova, `editReason`, os 422 e o 409.
  verify: `/v3/api-docs` local mostra `editReason` no schema do patch e as respostas 409/422.
- Validação da seção: `./mvnw clean verify` e os `@WebMvcTest` afetados isolados (ver memória sobre
  verify local x CI).

## 2. Frontend (detalhes visuais no D8 do `design.md`)

Pré-condição: PR #188 (`garmin-reenvio-plano`, front) e o backend desta change em `develop`. Criar o
worktree `.worktrees/front-coach-editar-treino-aprovado` só então, a partir de `origin/develop`.

- [ ] 2.1 Portar à mão para `src/types/AtletaPerfilCoach.ts` e `src/types/TreinoPlanejado.ts`:
  `editedAfterApprovalAt`, `editable` e `editReason` no patch. Canal vem do `conexaoCanal` que já
  existe.
  verify: `npm run build` sem erro de tipo.
- [ ] 2.2 `features/coach/components/TreinoEditDialog.tsx`: prop `aviso` (D4/D8) com caixa
  informativa por canal, motivo opcional (`aria-pressed`) e rótulo do botão; faixa de erro 409/422
  sem fechar (D5).
  verify: teste de componente dos três casos (Garmin, intervals.icu, sem canal), do motivo indo no
  patch, do erro e do dialog sem a prop igual a hoje (`TreinoEditDialog.test.tsx` atual verde).
- [ ] 2.3 `features/coach/components/CurrentWeekPlan.tsx`: cabeçalho da semana aprovada (D8); lápis
  guiado por `editable`; cadeado com rótulo para realizado, perdido e treino de hoje com relógio;
  passa o `aviso` ao dialog; snackbar após salvar.
  verify: teste de componente (CA10, CA11); `CurrentWeekPlan.reenvio.test.tsx` do #188 segue verde.
- [ ] 2.4 `features/coach/components/TreinoPlanejadoCard.tsx`: selo "Editado após aprovação" quando
  `editedAfterApprovalAt` existe (CA12).
  verify: teste do card com e sem o campo.
- [ ] 2.5 E2E Playwright (CA13): plano aprovado → editar treino pendente com motivo → salvar → selo
  no card; treino realizado sem lápis.
  verify: `npm run test:e2e` verde local.
- Validação da seção: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.
