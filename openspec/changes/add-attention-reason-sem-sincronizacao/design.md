# Design — add-attention-reason-sem-sincronizacao

## D1. Motivo e prioridade

`MotivoAtencao.SEM_SINCRONIZACAO`, peso 25 (entre `ADERENCIA` 30 e `INATIVIDADE` 20). O evaluator emite
**um** dos dois para a mesma inatividade, nunca os dois: a causa conhecida substitui a genérica.

## D2. Saúde em lote

`SyncHealthResolver` (de `add-sync-health-signal`) ganha `resolverTodos(tenantId, atletaIds)`: uma consulta
em `tb_integracao_externa` por tenant, filtrada pelos atletas da fila, devolvendo um mapa atleta → saúde.
`CoachAttentionQueueServiceImpl` resolve uma vez e passa ao evaluator.

## D3. Job de sugestões

`SEM_SINCRONIZACAO` em `MOTIVOS_IGNORADOS` do `SugestaoCoachGeneratorJob`; javadoc de `TipoSugestao`
atualizado. `MotivoAtencaoTest.contratoCompleto` e `severidadeOrdenada` cobrem o valor novo.

## D4. Front

`AttentionReason` (union), `REASON_LABEL` ("Sem sincronização"), `MOTIVO_TEXTO`, e a ação primária "Pedir
reconexão" em `primaryAction` (mesma mecânica do "Contatar atleta" de `MOTIVOS_DE_ENGAJAMENTO`, texto
próprio). Recência tratada como a da `INATIVIDADE` em `coachInboxAdapters`.

## Riscos

- **Motivo novo em cliente antigo:** o front antigo não conhece o valor. Mitigação: backend e front no
  mesmo ciclo, front mergeado junto; o `Record` exaustivo pega no build.
- **Saúde desatualizada** (pull a cada 2h): um item pode permanecer até 2h depois da reconexão.
  Aceitável.

## Rollback

Reverter os PRs; o valor do enum não é persistido fora do sinal recalculado.
