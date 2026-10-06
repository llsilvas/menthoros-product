# Tasks — add-coach-suggestion-decision-audit

Validação por bloco: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm test`.
Branch `feat/add-coach-suggestion-decision-audit` nos dois repos. Backend mergeia antes do front.
Sem pré-requisito de outra change (migration aditiva independente V100; ordem invertida por decisão
  do founder 2026-10-05 — decision-audit antes de edit-delta).

## 1. Backend — modelo

- [x] 1.1 Migration `V100__add_decision_audit_to_tb_sugestao_coach.sql` (design D3): colunas
  `reviewed_by` (uuid, nullable), `motivo_rejeicao` (text, nullable). Sem alterar constraints.
  - verify: IT Testcontainers — colunas existem, defaults nulos corretos.
- [x] 1.2 Entidade `SugestaoCoach`: campos `reviewedBy` (UUID) e `motivoRejeicao` (String).
  - verify: `./mvnw clean compile`. BUILD SUCCESS.

## 2. Backend — serviço e endpoint

- [x] 2.0 `SugestaoCoachRepository.decidirSePendente(...)` (design D4, achado Codex): `@Modifying
  @Query` UPDATE condicionado a `status = 'PENDING'`, gravando status + reviewedAt + reviewedBy +
  motivoRejeicao atomicamente; `aprovar`/`rejeitar` usam o retorno (linhas afetadas) e lançam
  `DomainConflictException` (409) quando `0` — nunca sobrescrevem uma decisão concorrente.
  - verify: CA6 (duas decisões concorrentes — teste disputa a transição, só uma vence; a outra
    recebe 409 e não perde a auditoria da vencedora). Confirmado em
    `SugestaoCoachServiceImplTest.Aprovar/Rejeitar.decisaoConcorrenteLancaConflito`.
- [x] 2.1 `aprovar`/`rejeitar` gravam `reviewedBy` do security context (design D1). Resolução
  concreta (padrão de `UsuarioServiceImpl.getCurrentUser`): injetar `AuthenticatedPrincipalResolver`
  + `UsuarioRepository`, `sub = principalResolver.getCurrentSubject()`,
  `reviewedBy = usuarioRepository.findByKeycloakIdAndAssessoria_Id(sub, tenantId).orElseThrow(...).getId()`
  — NUNCA o `sub` (string do Keycloak) direto; `reviewedBy` é o `Usuario.id` interno. `aprovar`
  seta `motivoRejeicao = null`.
  - verify: CA1 (reviewedBy do token, não do corpo), CA4 (não forjável — aprovar não aceita corpo).
- [x] 2.2 `rejeitar(id, RejeitarSugestaoRequestDto?)` — record `RejeitarSugestaoRequestDto(String
  motivoRejeicao)` com `@Size(max = 500)`; grava `motivoRejeicao` quando presente.
  - verify: CA2 (motivo gravado), CA3 (sem corpo → null).
- [x] 2.3 `CoachSugestaoController.rejeitar` com `@RequestBody(required=false)`.
  - verify: `./mvnw clean test`. 4456 testes, 0 falhas.
- [x] 2.4 `SugestaoCoachOutputDto` ganha `reviewedBy` + `motivoRejeicao`; `SugestaoCoachMapper`
  ajustado.
  - verify: CA5 (payload com e sem decisão).

## 3. Frontend

- [x] 3.1 `SugestaoService.rejeitar(id, motivoRejeicao?)` envia corpo opcional;
  `types/SugestaoCoach.ts` ganha `reviewedBy` + `motivoRejeicao`.
  - verify: `npm run build`. Verde.
- [x] 3.2 Novo `RejeitarSugestaoModal` (local a `RecentSuggestionsPanel.tsx`, mesmo padrão do
  `RejeicaoModal` de `PlanoDetalhePanel.tsx`, mas com motivo opcional) substitui o `ConfirmDialog`
  genérico; textarea opcional de motivo (`maxLength={500}`). Quando `status !== 'PENDING'`, o
  dialog exibe "Decidido por" (`reviewedBy`) e, se `REJECTED` com motivo, a seção "Motivo da
  rejeição". `reviewedBy` exibido como UUID bruto — sem endpoint de resolução nome↔id no escopo
  desta change; follow-up se a UX pedir nome.
  - verify: `npm run lint && npm run build && npm run test:run`. Lint sem issues; build verde;
    230 arquivos / 1956 testes verdes (12 no `RecentSuggestionsPanel.test.tsx`, incluindo os 2
    novos de CA5 e os 2 de motivo opcional). Smoke visual não executado (sem `npm run dev` nesta
    sessão) — ver task 4.2.

## 4. Validação final

- [ ] 4.1 `./mvnw clean verify` verde; `npm run lint && npm run build` verde.
- [ ] 4.2 Smoke dev: aprovar/rejeitar e conferir `reviewedBy` + `motivoRejeicao` no banco e no dialog.
- [ ] 4.3 Atualizar `tasks.md` antes de arquivar.
