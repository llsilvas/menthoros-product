# Tasks — add-coach-suggestion-decision-audit

Validação por bloco: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm test`.
Branch `feature/add-coach-suggestion-decision-audit` nos dois repos. Backend mergeia antes do front.
Pré-requisito: `add-coach-suggestion-edit-delta` já mergeada.

## 1. Backend — modelo

- [ ] 1.1 Migration `Vnn__add_decision_audit_to_tb_sugestao_coach.sql` (design D3): colunas
  `reviewed_by` (uuid, nullable), `motivo_rejeicao` (text, nullable). Sem alterar constraints.
  - verify: IT Testcontainers — colunas existem, defaults nulos corretos.
- [ ] 1.2 Entidade `SugestaoCoach`: campos `reviewedBy` (UUID) e `motivoRejeicao` (String).
  - verify: `./mvnw clean compile`.

## 2. Backend — serviço e endpoint

- [ ] 2.1 `aprovar`/`rejeitar` gravam `reviewedBy` do security context (design D1); `aprovar`
  seta `motivoRejeicao = null`.
  - verify: CA1 (reviewedBy do token, não do corpo), CA4 (não forjável).
- [ ] 2.2 `rejeitar(id, RejeitarSugestaoRequest?)` — record `RejeitarSugestaoRequest(String
  motivoRejeicao)` com `@Size(max = 500)`; grava `motivoRejeicao` quando presente.
  - verify: CA2 (motivo gravado), CA3 (sem corpo → null).
- [ ] 2.3 `CoachSugestaoController.rejeitar` com `@RequestBody(required=false)`.
  - verify: `./mvnw clean test`.
- [ ] 2.4 `SugestaoCoachOutputDto` ganha `reviewedBy` + `motivoRejeicao`; `SugestaoCoachMapper`
  ajustado.
  - verify: CA5 (payload com e sem decisão).

## 3. Frontend

- [ ] 3.1 `SugestaoService.rejeitar(id, motivoRejeicao?)` envia corpo opcional;
  `types/SugestaoCoach.ts` ganha `reviewedBy` + `motivoRejeicao`.
  - verify: `npm run build`.
- [ ] 3.2 `CoachDialog` (em `RecentSuggestionsPanel.tsx`): ao rejeitar, textarea opcional de
  motivo (`maxLength={500}`); quando `status !== 'PENDING'`, exibe quem decidiu (`reviewedBy`) e,
  se rejeitada, o motivo.
  - verify: `npm run lint && npm run build`; smoke visual.

## 4. Validação final

- [ ] 4.1 `./mvnw clean verify` verde; `npm run lint && npm run build` verde.
- [ ] 4.2 Smoke dev: aprovar/rejeitar e conferir `reviewedBy` + `motivoRejeicao` no banco e no dialog.
- [ ] 4.3 Atualizar `tasks.md` antes de arquivar.
