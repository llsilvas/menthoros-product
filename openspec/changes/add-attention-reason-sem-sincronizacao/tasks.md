# Tasks — add-attention-reason-sem-sincronizacao

Branch `feature/add-attention-reason-sem-sincronizacao` nos dois repos. **Só começa depois do merge de
`add-sync-health-signal`** (e só se o gate dela passar). Backend e front mergeados no mesmo ciclo.

## 1. Backend
- [ ] 1.1 `MotivoAtencao.SEM_SINCRONIZACAO` (peso 25) + `MotivoAtencaoTest`
- [ ] 1.2 `SyncHealthResolver.resolverTodos(tenantId, atletaIds)` — uma consulta por tenant (D2)
  - verify: CA4 (contagem de consultas), CA7
- [ ] 1.3 `CoachAttentionSignalEvaluator` + `CoachAttentionQueueServiceImpl`: um motivo ou outro (D1)
  - verify: CA1, CA2, CA3 em `CoachAttentionSignalEvaluatorTest` e `CoachAttentionQueueServiceImplTest`
- [ ] 1.4 `SugestaoCoachGeneratorJob`: motivo em `MOTIVOS_IGNORADOS` (D3)
  - verify: CA5 em `SugestaoCoachGeneratorJobTest`
- [ ] 1.5 Validação: `./mvnw clean verify`

## 2. Front
- [ ] 2.1 `AttentionReason`, `REASON_LABEL`, `MOTIVO_TEXTO`, ação "Pedir reconexão", recência (D4)
  - verify: CA6 — `coachInboxHelpers.test.ts`, `coachInboxAdapters.test.ts`, `QueueRow.test.tsx`
- [ ] 2.2 Validação: `npm run lint && npm run build && npm run test:run`; E2E `tests/e2e/coach` sem regressão

## 3. Pós-deploy
- [ ] 3.1 Métrica: itens `SEM_SINCRONIZACAO` resolvidos com reconexão em ≤ 3 dias; `INATIVIDADE` de atleta com conexão com erro = 0
