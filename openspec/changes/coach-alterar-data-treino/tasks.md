# Tasks — coach-alterar-data-treino

Backend primeiro (front novo contra backend antigo ignora a data em silêncio). Validação por
bloco: backend `./mvnw clean verify`; front `npm run lint && npm run build && npm run test:run`;
E2E onde indicado. Branches `feat/coach-alterar-data-treino` nos dois repos, em worktree.

## 1. Backend — contrato e regra (`apps/menthoros-backend`)

- [ ] 1.0 Baseline da métrica: nos logs do Railway (backend, últimas 4 semanas), contar sequências
      `Excluindo treino` → `adicionarTreino` no mesmo plano em < 2 min; registrar o número no
      proposal (Métrica de sucesso). verify: número anotado no proposal antes do PR do backend.
- [ ] 1.1 `TreinoPlanejadoPatchDto.dataTreino` (`LocalDate`, opcional, `@Schema` dizendo "dentro
      da semana do plano"). Teste de controller: PATCH com `dataTreino` desserializa; propriedade
      desconhecida continua ignorada. verify: `./mvnw clean test -Dtest=CoachTreinoControllerTest`.
- [ ] 1.2 Extrair `validarDataDentroDoPlano(plano, data)` da adição (D2) e usar nos dois caminhos.
      Teste: adição e edição fora da semana → `DomainRuleViolationException` com a mesma mensagem.
      verify: `./mvnw clean test -Dtest=TreinoPlanejadoServiceImplTest`.
- [ ] 1.3 `aplicarPatch`: quando `dataTreino` presente e diferente, grava data, deriva `diaSemana`,
      `removerDescansoDoDia(novoDia)`, `avisarSeDiaFicouSemPrescricao(diaOrigem)` (D4). Testes CA1,
      CA3 (atleta com `diasDisponiveis` restrito → 200), CA4, CA5, CA7, mesma data → nada muda.
      verify: `./mvnw clean test -Dtest=TreinoPlanejadoServiceImplTest`.
- [ ] 1.4 `PostApprovalEditCoordinator`: destino avaliado pela mesma `ApprovedWorkoutEditPolicy`
      com o `hoje` do `AtletaHojeResolver` (D3) antes da mutação; snapshot inclui a data, de modo
      que edição só de data conta como edição pós-aprovação e reinicia a sincronização. Testes CA6
      (passado; hoje com relógio; hoje sem relógio; futuro; só data marca edição; data igual não
      reinicia sincronização; servidor e atleta em dias diferentes).
      Mais CA7b: `SINCRONIZANDO` em andamento → 409 mesmo com data igual (regra canônica mantida).
      verify: `./mvnw clean test -Dtest=PostApprovalEditCoordinatorTest`.
- [ ] 1.5 `IntervalsIcuAdapter.buscarIdPorExternalId`: sem `eventId` gravado, listar eventos em
      `[semanaInicio, semanaFim]` e casar pelo `externalId` (D7). Teste CA6b: criado → resposta
      perdida → data muda → reenvio mantém um evento. Garmin: sem mudança
      (`garantirSchedule` já procura em ±14 dias); só teste de regressão no
      `GarminTrainingAdapterTest` com schedule em outra data da semana → `atualizarSchedule`, não
      `criarSchedule`. verify: `./mvnw clean test -Dtest='IntervalsIcuAdapterTest,GarminTrainingAdapterTest'`.
- [ ] 1.6 Suite completa e gate: `./mvnw clean verify` verde; `/qa` backend sem achado crítico;
      PR backend → `develop` com CI verde. verify: `gh pr checks` verde.

## 2. Frontend — dialog (`apps/menthoros-front`)

- [ ] 2.1 `types/PlanoReview.ts`: `TreinoPlanejadoPatch.dataTreino?: string` (ISO date).
      verify: `npm run build`.
- [ ] 2.2 `TreinoEditDialog`: prop `semana: { inicio; fim }` (obrigatória) e `diasDisponiveis?`
      (opcional); select dos sete dias no lugar do chip (D5), marcação "fora dos dias do atleta";
      `montarPatch` inclui `dataTreino` só se mudou (D6). Testes de componente: CA8 (seleciona e
      salva → patch com `dataTreino`; sem mudar → sem a chave), CA9 (marcação só com a prop).
      verify: `npx vitest run src/features/coach/components/TreinoEditDialog`.
- [ ] 2.3 `CoachPlanReviewPage` e `planosDialog` passam `semana` (e `diasDisponiveis` onde o
      atleta está em mãos). Teste: dialog abre com o dia atual selecionado.
      verify: `npx vitest run src/features/coach/pages/CoachPlanReviewPage src/components/features/planos`.
- [ ] 2.4 `CurrentWeekPlan.toDialogTreino` deriva `dataTreino` de `semana.inicio + diaSemana` (D6)
      e passa `semana`. Teste: salvar outro campo sem mudar o dia não manda `dataTreino`.
      verify: `npx vitest run src/features/coach/components/CurrentWeekPlan`.
- [ ] 2.5 Pós-salvar no hook de edição: resposta com `dataTreino` ≠ enviado → erro "não foi possível
      mover o treino" (front novo × backend antigo); erro de transporte ou 409 → recarregar o
      treino (GET) e, se a data já é a nova, tratar como aplicado sem reenviar (D3). Teste de hook
      para os três casos.
      verify: `npx vitest run src/features/coach/hooks`.
- [ ] 2.6 E2E: `plan-review-edicao.spec.ts` (mover em revisão: PATCH leva `dataTreino`, card muda
      de coluna) e `editar-treino-aprovado.spec.ts` (mover em plano aprovado para dia futuro;
      destino passado → 422 aparece no dialog). CA9 (marcação) e backend antigo ficam em teste de
      componente/hook: não há backend antigo no E2E. verify: `npx playwright test plan-review-edicao editar-treino-aprovado`.
- [ ] 2.7 Suite completa e gate: `npm run lint && npm run build && npm run test:run` verde; `/qa`
      front sem achado crítico; PR front → `develop` só após o backend em `develop`.
      verify: `gh pr checks` verde e PR do backend mergeado.

## 3. Fechamento

- [ ] 3.1 Spec delta `coach-approved-plan-edit` promovida; tasks marcadas; `/done`.
      verify: `openspec validate` verde e change em `changes/archive/YYYY-MM/`.
