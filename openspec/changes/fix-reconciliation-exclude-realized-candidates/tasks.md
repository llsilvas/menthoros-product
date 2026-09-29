# Tasks: fix-reconciliation-exclude-realized-candidates

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-reconciliation-exclude-realized-candidates` (a partir de `develop`).

---

## 1. Seletor ignora planejado já vinculado

- [ ] 1.1 Teste primeiro (CA1): em `CandidateSelectorTest`, com o planejado de 28/09 vinculado a
      outro realizado e o de 29/09 livre, o seletor devolve só o de 29/09.
      verify: `./mvnw test -Dtest=CandidateSelectorTest` vermelho antes da mudança.
- [ ] 1.2 Teste primeiro (CA3): planejado vinculado ao **próprio** realizado em análise continua
      candidato.
      verify: `CandidateSelectorTest`.
- [ ] 1.3 Teste primeiro (CA4): único planejado da janela já vinculado a outro realizado, e o
      seletor devolve lista vazia.
      verify: `CandidateSelectorTest`.
- [ ] 1.4 Implementar o filtro no `CandidateSelector`: uma única consulta de vínculo para os ids da
      janela, excluindo o próprio realizado, e sem N+1. **Não alterar**
      `findByAtletaIdAndDataBetween`, que é compartilhada com aderência, fila de atenção e outros.
      verify: 1.1–1.3 verdes; `./mvnw clean test`.

## 2. Decisão ponta a ponta

- [ ] 2.1 Teste (CA1 e CA2) no nível do executor/decisão, com os números do caso real: 0,90 contra
      o planejado livre resulta em `VINCULADO_AUTOMATICO / AUTO_MATCH`. Dois candidatos livres a
      menos de 0,10 continuam `AMBIGUO / TIE_BREAK`.
      verify: `ReconciliationDecisionExecutorTest` (ou teste de caracterização do
      `DailyActivitySyncSchedulerImpl`) verde.

## 3. Fechamento

- [ ] 3.1 `./mvnw clean verify` sem falhas.
- [ ] 3.2 `/qa` e PR para `develop`, sem merge local.
