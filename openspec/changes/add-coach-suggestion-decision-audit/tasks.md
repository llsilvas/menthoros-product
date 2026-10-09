# Tasks — add-coach-suggestion-decision-audit

Validação por bloco: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm test`.
Branch `feat/add-coach-suggestion-decision-audit` nos dois repos. Backend mergeia antes do front.
Sem pré-requisito de outra change (migration aditiva independente V100; ordem invertida por decisão
  do founder 2026-10-05 — decision-audit antes de edit-delta).

## 1. Backend — modelo

- [x] 1.1 Migration `V100__add_decision_audit_to_tb_sugestao_coach.sql` (design D3): colunas
  `reviewed_by` (uuid, nullable), `rejection_reason` (text, nullable). Sem alterar constraints.
  - verify: IT Testcontainers — colunas existem, defaults nulos corretos.
- [x] 1.2 Entidade `SugestaoCoach`: campos `reviewedBy` (UUID) e `rejectionReason` (String).
  - verify: `./mvnw clean compile`. BUILD SUCCESS.

## 2. Backend — serviço e endpoint

- [x] 2.0 `SugestaoCoachRepository.decidirSePendente(...)` (design D4, achado Codex): `@Modifying
  @Query` UPDATE condicionado a `status = 'PENDING'`, gravando status + reviewedAt + reviewedBy +
  rejectionReason atomicamente; `aprovar`/`rejeitar` usam o retorno (linhas afetadas) e lançam
  `DomainConflictException` (409) quando `0` — nunca sobrescrevem uma decisão concorrente.
  - verify: CA6 (duas decisões concorrentes — teste disputa a transição, só uma vence; a outra
    recebe 409 e não perde a auditoria da vencedora). Confirmado em
    `SugestaoCoachServiceImplTest.Aprovar/Rejeitar.decisaoConcorrenteLancaConflito`.
- [x] 2.1 `aprovar`/`rejeitar` gravam `reviewedBy` do security context (design D1). Resolução
  concreta (padrão de `UsuarioServiceImpl.getCurrentUser`): injetar `AuthenticatedPrincipalResolver`
  + `UsuarioRepository`, `sub = principalResolver.getCurrentSubject()`,
  `reviewedBy = usuarioRepository.findByKeycloakIdAndAssessoria_Id(sub, tenantId).orElseThrow(...).getId()`
  — NUNCA o `sub` (string do Keycloak) direto; `reviewedBy` é o `Usuario.id` interno. `aprovar`
  seta `rejectionReason = null`.
  - verify: CA1 (reviewedBy do token, não do corpo), CA4 (não forjável — aprovar não aceita corpo).
- [x] 2.2 `rejeitar(id, RejeitarSugestaoRequestDto?)` — record `RejeitarSugestaoRequestDto(String
  rejectionReason)` com `@Size(max = 500)`; grava `rejectionReason` quando presente.
  - verify: CA2 (motivo gravado), CA3 (sem corpo → null).
- [x] 2.3 `CoachSugestaoController.rejeitar` com `@RequestBody(required=false)`.
  - verify: `./mvnw clean test`. 4456 testes, 0 falhas.
- [x] 2.4 `SugestaoCoachOutputDto` ganha `reviewedBy` + `rejectionReason`; `SugestaoCoachMapper`
  ajustado.
  - verify: CA5 (payload com e sem decisão).

## 3. Frontend

- [x] 3.1 `SugestaoService.rejeitar(id, rejectionReason?)` envia corpo opcional;
  `types/SugestaoCoach.ts` ganha `reviewedBy` + `rejectionReason`.
  - verify: `npm run build`. Verde.
- [x] 3.2 Novo `RejeitarSugestaoModal` (local a `RecentSuggestionsPanel.tsx`, mesmo padrão do
  `RejeicaoModal` de `PlanoDetalhePanel.tsx`, mas com motivo opcional) substitui o `ConfirmDialog`
  genérico; textarea opcional de motivo (`maxLength={500}`). Quando `status !== 'PENDING'`, o
  dialog exibe "Decidido por" (`reviewedBy`) e, se `REJECTED` com motivo, a seção "Motivo da
  rejeição".
  - **Follow-up explícito (achado do frontend-reviewer no QA):** `reviewedBy` é exibido como UUID
    bruto — sem endpoint de resolução nome↔id no escopo desta change. Aceitável para v1 (seção de
    auditoria, não fluxo primário; sem risco de PII adicional — é id interno de técnico, não de
    atleta), mas perde valor de auditoria em assessorias com múltiplos técnicos sem resolver para
    nome. Requer endpoint novo (ex.: `GET /api/v1/coach/usuarios` ou embutir nome no DTO da
    sugestão) — fora de escopo aqui, abrir change dedicada se a UX exigir.
  - verify: `npm run lint && npm run build && npm run test:run`. Lint sem issues; build verde;
    230 arquivos / 1956 testes verdes (12 no `RecentSuggestionsPanel.test.tsx`, incluindo os 2
    novos de CA5 e os 2 de motivo opcional). Smoke visual não executado (sem `npm run dev` nesta
    sessão) — ver task 4.2.

## 4. Validação final

- [x] 4.1 `./mvnw clean verify` verde; `npm run lint && npm run build` verde.
  - verify: backend 204 IT + suite completa, 0 falhas (achou e corrigiu uma IT pré-existente,
    `SugestaoCoachRepositoryPendingAtletaIdsIT.aprovarZeraOSinal`, que chamava `aprovar()` sem JWT
    autenticado — ver commit `a8f9d69`). Frontend: lint sem issues, build verde, 1956 testes verdes.
- [~] 4.2 Smoke dev: aprovar/rejeitar e conferir `reviewedBy` + `rejectionReason` no banco e no
  dialog. **Ainda não executado** — subir o stack local completo (Postgres/Keycloak/backend/front
  via `menthoros-infra/docker-compose.yml`) é esforço fora do escopo desta retomada (rebase +
  validação de testes). A cobertura de IT (4.1, com `SecurityMockMvcRequestPostProcessors.jwt()`
  contra o filtro de segurança real) já exercita o mesmo caminho com DB e security context reais.
  Fica como débito não-bloqueante — abrir antes do merge se quiser dupla checagem visual.
- [x] 4.3 `tasks.md` atualizado (esta rodada): branches rebaseados em `develop` (backend 14
  commits atrás, front 26 — ambos rebase limpo, sem conflito) e suíte revalidada pós-rebase:
  backend `./mvnw clean verify` 4519 + 213 testes, 0 falhas; frontend `npm run lint && npm run
  build && npm run test:run` 2018/2018 testes, lint e build limpos.

## 5. QA gate (Full track: code-reviewer + security-reviewer, 2026-10-09)

- [x] 5.1 **`code-reviewer`**: sem bloqueadores. 2 achados Important corrigidos (ver design.md D5):
  `motivoRejeicao` → `rejectionReason` em todo o código e nesta própria spec (campo novo que
  nasceu em PT-BR, violando Identifier Language sem exceção registrada); e o guard de concorrência
  (D4) só estava provado por mock, não por uma corrida real contra o Postgres. Confirmou
  corretos (traçados linha a linha, não só por semelhança): não-forjabilidade de `reviewedBy`,
  migration estritamente aditiva, JavaDoc mandatório presente, sem SQL concatenado.
- [x] 5.2 **`security-reviewer`**: sem Critical/High. Confirmou (traçado, não assumido):
  `reviewedBy` genuinamente não-forjável (`aprovar` não aceita corpo; `rejeitar` só aceita
  `rejectionReason`, sem campo `reviewedBy` no DTO de entrada, então mesmo um JSON forjado é
  descartado pelo Jackson antes de chegar ao service); isolamento de tenant correto tanto na
  leitura (`findByIdAndTenantId`) quanto na escrita (`decidirSePendente` também filtra por
  `tenantId`); `rejectionReason` sem sanitização no backend, segurança contra XSS depende
  inteiramente do escape padrão do React no frontend (aceitável para v1, documentado para não
  presumir defesa em profundidade se o campo for consumido por outro renderer no futuro); nenhum
  side door para o guardrail coach-in-the-loop.
- [x] 5.3 `SugestaoCoachConcurrentDecisionIT` adicionada (achado 5.1/D5): duas threads reais via
  `TransactionTemplate`+`CountDownLatch` disputando `decidirSePendente` na mesma linha `PENDING`
  contra Postgres via Testcontainers — exatamente uma transição vence (soma das linhas afetadas
  == 1), a persistida bate com a vencedora. Estável em 3 execuções consecutivas.
  - verify: `./mvnw clean verify` pós-rename — 4519 + 214 testes, 0 falhas.
