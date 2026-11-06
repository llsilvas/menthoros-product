# Tasks — coach-alterar-data-treino

Backend primeiro (front novo contra backend antigo ignora a data em silêncio). Validação por
bloco: backend `./mvnw clean verify`; front `npm run lint && npm run build && npm run test:run`;
E2E onde indicado. Branches `feat/coach-alterar-data-treino` nos dois repos, em worktree.

## 1. Backend — contrato e regra (`apps/menthoros-backend`)

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
      verify: `./mvnw clean test -Dtest=PostApprovalEditCoordinatorTest`.
- [ ] 1.5 `IntervalsIcuAdapter.buscarIdPorExternalId`: sem `eventId` gravado, listar eventos em
      `[semanaInicio, semanaFim]` e casar pelo `externalId` (D7). Conferir o adapter Garmin no mesmo
      cenário. Teste CA6b: criado → resposta perdida → data muda → reenvio mantém um evento.
      verify: `./mvnw clean test -Dtest=IntervalsIcuAdapterTest`.
- [ ] 1.6 Suite completa `./mvnw clean verify`; `/qa` backend; PR backend → `develop`.

## 2. Frontend — dialog (`apps/menthoros-front`)

- [ ] 2.1 `types/PlanoReview.ts`: `TreinoPlanejadoPatch.dataTreino?: string` (ISO date).
      verify: `npm run build`.
- [ ] 2.2 `TreinoEditDialog`: prop `semana: { inicio; fim }` (obrigatória) e `diasDisponiveis?`
      (opcional); select dos sete dias no lugar do chip (D5), marcação "fora dos dias do atleta";
      `montarPatch` inclui `dataTreino` só se mudou (D6). Testes de componente: CA8 (seleciona e
      salva → patch com `dataTreino`; sem mudar → sem a chave), CA9 (marcação só com a prop).
      verify: `npx vitest run src/features/coach/components/TreinoEditDialog`.
- [ ] 2.3 Chamadores passam `semana` (e `diasDisponiveis` onde o atleta está em mãos):
      `CoachPlanReviewPage`, `CurrentWeekPlan`, `planosDialog`. `CurrentWeekPlan.toDialogTreino`
      deriva `dataTreino` de `semana.inicio + diaSemana` (D6) — teste: salvar outro campo sem mudar
      o dia não manda `dataTreino`. Após salvar, se a resposta vier com `dataTreino` diferente do
      enviado, mostrar erro (front novo × backend antigo); em erro de transporte, recarregar o
      treino antes de reenviar. verify: lint + build + testes das três telas.
- [ ] 2.4 E2E: `plan-review-edicao.spec.ts` (mover em revisão: PATCH leva `dataTreino`, card muda
      de coluna) e `editar-treino-aprovado.spec.ts` (mover em plano aprovado para dia futuro;
      422 do backend aparece no dialog). verify: `npx playwright test plan-review-edicao editar-treino-aprovado`.
- [ ] 2.5 Suite completa do front; `/qa` front; PR front → `develop` (só após o backend em `develop`).

## 3. Fechamento

- [ ] 3.1 Spec delta `coach-approved-plan-edit` promovida; tasks marcadas; `/done`.
