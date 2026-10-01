# Tasks: fix-reconciliation-audit-planned-id

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-reconciliation-audit-planned-id` (a partir de `develop`, base `2c9608c`, já com
o #150), worktree `.worktrees/backend-fix-reconciliation-audit-planned-id`.

DoR (2026-09-29, Fast): READY. Duas notas do código:
- O "depois" depende do **status**, não de `decision.getSelectedPlanned()`: a guarda de campos
  ausentes rebaixa para `AMBIGUO` mas mantém o planejado em `selectedPlanned`, e usá-lo gravaria um
  "depois" sem vínculo (o CA2 pega).
- `VINCULADO_AUTOMATICO` com `selectedPlanned` nulo existe (o `if (planned != null)` do `persistir`):
  nesse caso o "depois" fica nulo, igual ao vínculo em memória.

---

## 1. Auditoria registra o planejado

- [x] 1.1 Teste primeiro (CA1): em `ReconciliationDecisionExecutorTest`, com a decisão
      `VINCULADO_AUTOMATICO`, capturar o `TreinoReconciliacao` salvo e conferir `afterPlannedIdUuid`
      igual ao id do planejado e `beforePlannedIdUuid` nulo.
      verify: `./mvnw test -Dtest=ReconciliationDecisionExecutorTest` vermelho antes da mudança.
- [x] 1.2 Teste primeiro (CA2): `AMBIGUO` (score e guarda de campos ausentes) e `NAO_PLANEJADO`
      gravam `afterPlannedIdUuid` nulo. Um `@ParameterizedTest` sobre os status evita repetição.
      verify: `ReconciliationDecisionExecutorTest`.
- [x] 1.3 Teste primeiro (CA3): realizado já vinculado ao planejado X antes da reconciliação grava
      `beforePlannedIdUuid = X`, mesmo quando a decisão vincula outro planejado.
      verify: `ReconciliationDecisionExecutorTest`.
- [x] 1.4 Implementar em `persistir`: capturar o id do vínculo anterior pela associação
      (`realizado.getTreinoPlanejado()`) antes de qualquer mutação, e preencher `afterPlannedIdUuid`
      só quando `VINCULADO_AUTOMATICO`. **Não** usar o espelho `getTreinoPlanejadoId()`.
      verify: 1.1–1.3 verdes; `./mvnw clean test`.

## 2. Fechamento

- [x] 2.1 `./mvnw clean verify` sem falhas (2026-09-29: 4251 unit + 202 IT, 0 falhas). Commit no
      backend: `edd3fb7`. Code review sem achado crítico ou importante.
- [x] 2.2 `/qa` e PR para `develop`: PR #151 mergeada em 2026-09-29 (via GitHub, sem merge local).
- [ ] 2.3 Pós-deploy no homelab: a consulta da "Métrica de sucesso" da proposta devolve 0 para
      eventos depois do restart. **Query rodada em 2026-10-01 — devolveu 0, mas não é validação
      real:** o último evento `RECONCILIACAO_AUTOMATICA`/`VINCULADO_AUTOMATICO` no homelab é de
      2026-09-29 21:16:42Z, **anterior** ao merge do PR #151 (22:20:42Z). Nenhuma reconciliação
      automática rodou desde o deploy — o app do homelab provavelmente não reiniciou com o jar
      novo, ou o scheduler (roda a cada ~2h) ainda não disparou sobre um caso elegível. **Continua
      pendente:** confirmar que o homelab está rodando o build pós-#151 e reexecutar a query depois
      de pelo menos um ciclo do scheduler.
