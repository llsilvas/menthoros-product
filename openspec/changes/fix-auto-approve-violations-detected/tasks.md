# Tasks — fix-auto-approve-violations-detected

Branch `fix/fix-auto-approve-violations-detected` no backend. Validacao: `./mvnw clean test`.

## 1. Backend — veto

- [x] 1.1 Em `PlanGenerationPersister.aplicarAutoApproveSeElegivel`
  (`src/main/java/br/com/menthoros/backend/services/helper/PlanGenerationPersister.java:272-276`),
  adicionar `PlannerComplianceStatus.VIOLATIONS_DETECTED.name().equals(plano.getPlannerComplianceStatus())`
  a condicao de veto (junto de `FAILED`/`FALLBACK`/`requiresCoachReview`).
  - Validacao: `./mvnw clean test` verde.
- [x] 1.2 Atualizar o comentario do veto para documentar que `VIOLATIONS_DETECTED` vem do shadow
  sem `requiresCoachReview`.
  - Validacao: leitura do diff.

## 2. Testes

- [x] 2.1 RED: teste que falha antes do fix — plano EXCEPTION_ONLY com
  `plannerComplianceStatus=VIOLATIONS_DETECTED` e `plannerRequiresCoachReview=null` NAO e
  auto-aprovado (CA1).
  - Validacao: teste vermelho antes do fix, verde depois. Confirmado em
    `PlanGenerationPersisterProvaTest.VetoAutoAprovacao.planoViolationsDetectedNaoAprovado`.
- [x] 2.2 Regressao: plano com `COMPLIANT`/`PASSED` e skeleton sem risco segue auto-aprovado (CA2);
  veto de `FAILED`/`FALLBACK`/`requiresCoachReview` inalterado (CA3).
  - Validacao: `./mvnw clean test` verde. Novo teste
    `planoCompliantAprovado` cobre CA2; testes existentes
    `planoFailedNaoAprovado`/`planoRequiresReviewNaoAprovado`/`planoFallbackNaoAprovado` inalterados.

## 3. Validacao final

- [x] 3.1 `./mvnw clean verify` verde.
- [x] 3.2 Atualizar `tasks.md` antes de arquivar.
