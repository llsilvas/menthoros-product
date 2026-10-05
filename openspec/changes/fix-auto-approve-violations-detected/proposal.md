**Tamanho:** S · **Trilha:** Fast

```yaml
id: fix-auto-approve-violations-detected
motivation: >
  O auto-approve do onboarding (Cenario A / EXCEPTION_ONLY) aprova planos que o shadow do planner
  deterministico marcou com VIOLATIONS_DETECTED, porque o veto so cobre FAILED, FALLBACK e
  requiresCoachReview. O shadow grava VIOLATIONS_DETECTED sem setar requiresCoachReview, entao o
  plano com violacao chega ao atleta sem revisao do coach — quebra do coach-in-the-loop em producao.
scope:
  repos: [menthoros-backend]
  inclui: adicionar VIOLATIONS_DETECTED a condicao de veto do auto-approve + testes de regressao
  exclui: mexer no shadow, no enforcement, nos demais status, no front, ou em migration
acceptance_criteria:
  - Plano EXCEPTION_ONLY com plannerComplianceStatus=VIOLATIONS_DETECTED NUNCA e auto-aprovado
  - Plano COMPLIANT/PASSED/RETRIED_PASSED/NOT_EVALUATED com skeleton sem risco segue elegivel
  - Veto de FAILED/FALLBACK/requiresCoachReview inalterado
risks:
  R1: veto conservador demais reduz auto-approve alem do necessario — mitigacao: so VIOLATIONS_DETECTED entra; demais status elegiveis intactos
  R2: regressao no caminho feliz do auto-approve — mitigacao: teste cobre o caso feliz
```

## Why

O auto-approve foi desenhado para o Cenario A (atleta `EXCEPTION_ONLY`, alta confianca) —
`athlete-onboarding-baseline` CA5. O veto em `PlanGenerationPersister.aplicarAutoApproveSeElegivel`
(`PlanGenerationPersister.java:272-276`) garante que um plano marcado como `FAILED`/`FALLBACK` ou
com `requiresCoachReview=true` nunca e auto-aprovado.

Mas o shadow do planner deterministico (`PlannerShadowService.executar`,
`PlannerShadowService.java:166-168`) grava `PlannerComplianceStatus.VIOLATIONS_DETECTED` **sem**
setar `plannerRequiresCoachReview` — e auditoria em paralelo, sem enforcement. Como
`VIOLATIONS_DETECTED` nao esta no veto, um plano com violacoes detectadas (ex.: treino em dia
indisponivel, taper violado) e auto-aprovado e chega ao atleta sem passar pela fila do coach. Em
producao desde o merge do `athlete-onboarding-baseline` — o fix fecha o gap do veto.

## What Changes

Backend (`apps/menthoros-backend`):

- `PlanGenerationPersister.aplicarAutoApproveSeElegivel` (`:272-276`): adicionar
  `PlannerComplianceStatus.VIOLATIONS_DETECTED.name().equals(plano.getPlannerComplianceStatus())`
  a condicao de veto, junto de `FAILED`/`FALLBACK`/`requiresCoachReview`.
- Atualizar o comentario do veto para documentar que `VIOLATIONS_DETECTED` vem do shadow (que nao
  seta `requiresCoachReview`).
- Testes: cobrir o novo veto e preservar o caso feliz.

## Impact

- `PlanGenerationPersister.java` (condicao de veto + comentario).
- Teste(s) em `src/test/java/br/com/menthoros/backend/services/helper/` (junto de
  `PlanGenerationPersisterCoberturaTest` ou teste focado novo).
- Sem migration, sem contrato de API, sem front.

## Criterios de aceite

1. **CA1 — Violacao veta:** dado plano EXCEPTION_ONLY com `plannerComplianceStatus =
   VIOLATIONS_DETECTED` e `plannerRequiresCoachReview = null`, quando o auto-approve roda, entao o
   plano **nao** e aprovado (permanece `AGUARDANDO_REVISAO`).
2. **CA2 — Caso feliz intacto:** dado plano EXCEPTION_ONLY com `plannerComplianceStatus = COMPLIANT`
   (ou `PASSED`/`NOT_EVALUATED`), skeleton sem violacao e risco nao-HIGH, quando o auto-approve
   roda, entao e aprovado com `OrigemAprovacao.AUTO_CONFIANCA_ALTA`.
3. **CA3 — Vetos existentes inalterados:** dado `FAILED`, `FALLBACK` ou `requiresCoachReview=true`,
   o comportamento segue vetando (sem mudanca).
4. **CA4 — Suite:** `./mvnw clean verify` verde.

## Open Questions & Assumptions

- **Assuncao:** o shadow roda em producao e grava `VIOLATIONS_DETECTED` real. Se o shadow estiver
  desligado (`shadowEnabled=false`), o status nao e gravado e o veto e no-op (sem efeito colateral)
  — o fix continua correto.
- **Decisao (founder, 2026-10-05):** `VIOLATIONS_DETECTED` do shadow passa a vetar auto-approve —
  transforma parte do shadow em soft-enforcement do coach-in-the-loop. Comportamento pretendido
  (auditoria que protege o atleta), nao um hardening acidental.

## Metrica de sucesso

Zero planos auto-aprovados com `plannerComplianceStatus = VIOLATIONS_DETECTED` apos o deploy.
Medida: query no homelab/prod contando planos `APROVADO` com origem `AUTO_CONFIANCA_ALTA` e status
`VIOLATIONS_DETECTED` — deve ser 0.
