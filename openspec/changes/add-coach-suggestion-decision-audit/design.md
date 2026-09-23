# Design — add-coach-suggestion-decision-audit

## Context

`SugestaoCoach` (`entity/SugestaoCoach.java`) tem `reviewedAt` mas **não** `reviewedBy` nem
`motivoRejeicao`. `SugestaoCoachServiceImpl.aprovar/rejeitar` só fazem `setStatus(...)` +
`setReviewedAt(...)`. `add-coach-suggestion-edit-delta` já adiciona `versao` (`@Version`) e
`versaoEsperada` em `aprovar`/`rejeitar` — esta change herda esse endpoint já versionado.

## D1 — `reviewedBy` vem do security context, nunca do request body

`aprovar`/`rejeitar` recebem o ator do `TenantContext`/JWT (Keycloak), igual aos demais endpoints
`TECNICO/ADMIN`. Aceitar `reviewedBy` no corpo permitiria forjar a trilha de auditoria — e auditoria
falsificável não é auditoria (guardrail "every approval is audit-logged").

## D2 — `motivoRejeicao` é texto livre opcional, só na rejeição

`rejeitar(id, motivoRejeicao?)` com `@Size(max = 500)`; ausente → `null` (rejeitar sem motivo
continua válido). `aprovar` seta `motivoRejeicao = null` (decisão final é aprovar; não carregar
motivo de rejeição residual). Sem enum na v1 — classificação é follow-up quando houver volume.

## D3 — Migration expand-only, sem backfill, sequenciada após a do `edit-delta`

```sql
-- Vnn (próxima livre, APÓS a migration do add-coach-suggestion-edit-delta)
ALTER TABLE tb_sugestao_coach
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN motivo_rejeicao text;
```

Linhas legadas ficam com `reviewed_by` nulo (predatam a auditoria). Nada é retroativamente
"corrigido" — não inventamos histórico de ator.
