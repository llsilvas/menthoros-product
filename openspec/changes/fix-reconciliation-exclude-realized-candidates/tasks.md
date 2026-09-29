# Tasks: fix-reconciliation-exclude-realized-candidates

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-reconciliation-exclude-realized-candidates` (a partir de `develop`, base `0f66d50`),
worktree `.worktrees/backend-fix-reconciliation-exclude-realized-candidates` — o checkout principal do
backend está em outra change.

DoR (2026-09-29, Fast): READY. Premissa 1:1 confirmada no modelo — `TreinoPlanejado` mapeia o
realizado como `@OneToOne(mappedBy = "treinoPlanejado")`. Filtro previsto: uma query em
`TreinoRealizadoRepository` devolvendo os ids de planejados, dentre os candidatos da janela, já
vinculados a um realizado diferente do analisado.

---

## 1. Seletor ignora planejado já vinculado

- [x] 1.1 Teste primeiro (CA1): em `CandidateSelectorTest`, com o planejado de 28/09 vinculado a
      outro realizado e o de 29/09 livre, o seletor devolve só o de 29/09.
      verify: `./mvnw test -Dtest=CandidateSelectorTest` vermelho antes da mudança.
- [x] 1.2 Teste primeiro (CA3): planejado vinculado ao **próprio** realizado em análise continua
      candidato.
      verify: `CandidateSelectorTest`.
- [x] 1.3 Teste primeiro (CA4): único planejado da janela já vinculado a outro realizado, e o
      seletor devolve lista vazia.
      verify: `CandidateSelectorTest`.
- [x] 1.4 Implementar o filtro no `CandidateSelector`: uma única consulta de vínculo para os ids da
      janela, excluindo o próprio realizado, e sem N+1. **Não alterar**
      `findByAtletaIdAndDataBetween`, que é compartilhada com aderência, fila de atenção e outros.
      verify: 1.1–1.3 verdes; `./mvnw clean test`.

## 2. Decisão ponta a ponta

- [x] 2.1 Teste (CA1 e CA2) no nível do executor/decisão, com os números do caso real: 0,90 contra
      o planejado livre resulta em `VINCULADO_AUTOMATICO / AUTO_MATCH`. Dois candidatos livres a
      menos de 0,10 continuam `AMBIGUO / TIE_BREAK`.
      verify: `ReconciliacaoCandidatoOcupadoTest` verde — seletor, score e motor reais, só os
      repositórios mockados. Semântica da query (CA3) provada contra Postgres em
      `TreinoRealizadoRepositoryVinculoIT`.

## 3. Fechamento

- [x] 3.1 `./mvnw clean verify` sem falhas (2026-09-29: 4245 unit + 202 IT, 0 falhas, depois da guarda de id nulo
      pedida no code review). Commits no backend: `3431af1` (correção) e `55d0ba5` (IT).
- [ ] 3.2 `/qa` e PR para `develop`, sem merge local.
