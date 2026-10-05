# Design — add-coach-suggestion-decision-audit

## Context

`SugestaoCoach` (`entity/SugestaoCoach.java`) tem `reviewedAt` mas **não** `reviewedBy` nem
`motivoRejeicao`. `SugestaoCoachServiceImpl.aprovar/rejeitar` só fazem `setStatus(...)` +
`setReviewedAt(...)`, com leitura (`buscarOuLancar`) e gravação (`repository.save`) em passos
separados, sem lock. `@Version`/`versaoEsperada` **completo** (a API de concorrência otimista que o
front vai usar para detectar edição concorrente) entra na `add-coach-suggestion-edit-delta`, que
passa a vir DEPOIS desta change (ordem invertida por decisão do founder, 2026-10-05) — mas o guard
atômico do D4 abaixo é escopo desta change, não daquela.

## D1 — `reviewedBy` vem do security context, nunca do request body

`aprovar`/`rejeitar` recebem o ator do `TenantContext`/JWT (Keycloak), igual aos demais endpoints
`TECNICO/ADMIN`. Aceitar `reviewedBy` no corpo permitiria forjar a trilha de auditoria — e auditoria
falsificável não é auditoria (guardrail "every approval is audit-logged").

## D2 — `motivoRejeicao` é texto livre opcional, só na rejeição

`rejeitar(id, motivoRejeicao?)` com `@Size(max = 500)`; ausente → `null` (rejeitar sem motivo
continua válido). `aprovar` seta `motivoRejeicao = null` (decisão final é aprovar; não carregar
motivo de rejeição residual). Sem enum na v1 — classificação é follow-up quando houver volume.

## D3 — Migration expand-only, sem backfill, independente (V100)

```sql
-- V100 (próxima livre em 2026-10-05; V99 foi consumida por notify-waitlist-docs-site no mesmo dia)
ALTER TABLE tb_sugestao_coach
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN motivo_rejeicao text;
```

Linhas legadas ficam com `reviewed_by` nulo (predatam a auditoria). Nada é retroativamente
"corrigido" — não inventamos histórico de ator.

**Rollback:** `ALTER TABLE tb_sugestao_coach DROP COLUMN reviewed_by, DROP COLUMN motivo_rejeicao;`
— seguro, colunas nullable sem FK/índice.

## D4 — Guard atômico contra decisão concorrente (achado do Codex adversarial-review, 2026-10-05)

`aprovar`/`rejeitar` fazem hoje *read-then-write*: leem o status, decidem o que fazer em memória, e
só então salvam. Duas requisições concorrentes (dois técnicos da mesma assessoria decidindo a
mesma sugestão ao mesmo tempo) podem ambas ler `PENDING` e ambas gravar — a segunda sobrescreve a
primeira **silenciosamente**, inclusive `reviewedBy`/`motivoRejeicao`. Isso já era possível antes
desta change (perda de `status`/`reviewedAt`), mas agora apagaria a própria auditoria que a change
promete tornar não-forjável — contradiz o guardrail "every approval is audit-logged".

Fix (sem introduzir o `@Version`/`versaoEsperada` completo, que é escopo da `edit-delta`): a
transição de `PENDING` para `APPROVED`/`REJECTED` passa a ser um `UPDATE` condicionado a
`status = 'PENDING'` (`@Modifying @Query`), gravando todos os campos de auditoria no mesmo
statement. Se a cláusula não afetar nenhuma linha (perdeu a corrida), lança
`DomainConflictException` (409) — nunca sobrescreve.

```java
@Modifying(clearAutomatically = true)
@Query("""
   UPDATE SugestaoCoach s SET s.status = :novoStatus, s.reviewedAt = :reviewedAt,
       s.reviewedBy = :reviewedBy, s.motivoRejeicao = :motivoRejeicao
   WHERE s.id = :id AND s.tenantId = :tenantId AND s.status = 'PENDING'
   """)
int decidirSePendente(@Param("id") UUID id, @Param("tenantId") UUID tenantId,
        @Param("novoStatus") StatusSugestao novoStatus, @Param("reviewedAt") Instant reviewedAt,
        @Param("reviewedBy") UUID reviewedBy, @Param("motivoRejeicao") String motivoRejeicao);
```

`aprovar`/`rejeitar` continuam lendo o estado primeiro para decidir entre no-op (já no status
destino) e `DomainRuleViolationException` (transição inválida) — esses dois ramos não escrevem,
então não têm a corrida. Só o ramo `PENDING → decisão` passa a usar `decidirSePendente`; `0` linhas
afetadas vira `DomainConflictException`, não um resultado silencioso.
