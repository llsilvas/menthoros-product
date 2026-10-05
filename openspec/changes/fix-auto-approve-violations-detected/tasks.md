# Tasks — fix-auto-approve-violations-detected

Branch `feature/fix-auto-approve-violations-detected` no backend. Validacao: `./mvnw clean test`.

## 1. Backend — veto

- [ ] 1.1 Em `PlanGenerationPersister.aplicarAutoApproveSeElegivel`
  (`src/main/java/br/com/menthoros/backend/services/helper/PlanGenerationPersister.java:272-276`),
  adicionar `PlannerComplianceStatus.VIOLATIONS_DETECTED.name().equals(plano.getPlannerComplianceStatus())`
  a condicao de veto (junto de `FAILED`/`FALLBACK`/`requiresCoachReview`).
  - Validacao: `./mvnw clean test` verde.
- [ ] 1.2 Atualizar o comentario do veto para documentar que `VIOLATIONS_DETECTED` vem do shadow
  sem `requiresCoachReview`.
  - Validacao: leitura do diff.

## 2. Testes

- [ ] 2.1 RED: teste que falha antes do fix — plano EXCEPTION_ONLY com
  `plannerComplianceStatus=VIOLATIONS_DETECTED` e `plannerRequiresCoachReview=null` NAO e
  auto-aprovado (CA1).
  - Validacao: teste vermelho antes do fix, verde depois.
- [ ] 2.2 Regressao: plano com `COMPLIANT`/`PASSED` e skeleton sem risco segue auto-aprovado (CA2);
  veto de `FAILED`/`FALLBACK`/`requiresCoachReview` inalterado (CA3).
  - Validacao: `./mvnw clean test` verde.

## 3. Validacao final

- [ ] 3.1 `./mvnw clean verify` verde.
- [ ] 3.2 Atualizar `tasks.md` antes de arquivar.
