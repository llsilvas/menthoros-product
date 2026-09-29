# Tasks: fix-reconciliation-audit-planned-id

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-reconciliation-audit-planned-id` (a partir de `develop`).

---

## 1. Auditoria registra o planejado

- [ ] 1.1 Teste primeiro (CA1): em `ReconciliationDecisionExecutorTest`, com a decisão
      `VINCULADO_AUTOMATICO`, capturar o `TreinoReconciliacao` salvo e conferir `afterPlannedIdUuid`
      igual ao id do planejado e `beforePlannedIdUuid` nulo.
      verify: `./mvnw test -Dtest=ReconciliationDecisionExecutorTest` vermelho antes da mudança.
- [ ] 1.2 Teste primeiro (CA2): `AMBIGUO` (score e guarda de campos ausentes) e `NAO_PLANEJADO`
      gravam `afterPlannedIdUuid` nulo. Um `@ParameterizedTest` sobre os status evita repetição.
      verify: `ReconciliationDecisionExecutorTest`.
- [ ] 1.3 Teste primeiro (CA3): realizado já vinculado ao planejado X antes da reconciliação grava
      `beforePlannedIdUuid = X`, mesmo quando a decisão vincula outro planejado.
      verify: `ReconciliationDecisionExecutorTest`.
- [ ] 1.4 Implementar em `persistir`: capturar o id do vínculo anterior pela associação
      (`realizado.getTreinoPlanejado()`) antes de qualquer mutação, e preencher `afterPlannedIdUuid`
      só quando `VINCULADO_AUTOMATICO`. **Não** usar o espelho `getTreinoPlanejadoId()`.
      verify: 1.1–1.3 verdes; `./mvnw clean test`.

## 2. Fechamento

- [ ] 2.1 `./mvnw clean verify` sem falhas.
- [ ] 2.2 `/qa` e PR para `develop`, sem merge local.
- [ ] 2.3 Pós-deploy no homelab: a consulta da "Métrica de sucesso" da proposta devolve 0 para
      eventos depois do restart.
