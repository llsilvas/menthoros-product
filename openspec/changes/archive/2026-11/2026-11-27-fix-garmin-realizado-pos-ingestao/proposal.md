**Tamanho:** S · **Trilha:** Fast — só backend, sem contrato de API nem schema; duas chamadas a fluxos que já existem.

## Why

Em produção (2026-11-09), o treino Garmin do atleta Leandro não foi conciliado com o planejado do dia e
não gerou análise, mesmo com o RPE respondido no "Como foi?" dois minutos depois da sincronização.

- **Conciliação:** o caminho Garmin (`GarminPingProcessorScheduler` → `FitTreinoPersister.persistir` →
  `IngestaoTreinoRealizadoService.registrar`) grava o realizado e nunca chama `CandidateSelector` +
  `ReconciliationDecisionExecutor`. Só `IntervalsIcuActivityPersister:76` e o `DailyActivitySyncScheduler`
  fazem isso, e o scheduler só pega realizados de ontem com `statusSincronizacao = PENDENTE` — o caminho FIT
  deixa o campo nulo. A fila manual do treinador (`ReconciliacaoPendentesServiceImpl`) filtra `AMBIGUO` /
  `NAO_PLANEJADO` e também não vê `reconciliation_status` nulo. O realizado fica invisível para a conciliação
  automática **e** para a manual. A change `garmin-activity-ingestion` partiu de "o pipeline já existe" e não
  previu esse passo; o upload manual de FIT (`FitUploadServiceImpl`) tem a mesma lacuna.
- **Análise:** o `WorkoutAnalysisListener` só analisa realizado com RPE (`WorkoutAnalysisEligibility`). No
  insert sincronizado ainda não há RPE, e `AtletaTreinoFeedbackServiceImpl.registrarFeedback` grava o RPE sem
  publicar `TreinoRegistradoEvent`. Resultado: treino sincronizado (Garmin, intervals.icu, Strava) com RPE do
  "Como foi?" nunca é analisado — o card do atleta fica em `PENDING` para sempre. O de 2026-11-05 só foi
  analisado porque o treino foi editado depois via `updateTreino`, que publica o evento.

Evidência (leitura em produção): 6 realizados, todos `GARMIN`, todos com `reconciliation_status` nulo;
`tb_treino_reconciliacao` vazia; realizado `477922c0…` (2026-11-09, RPE 4 às 12:35) sem linha em
`tb_analise_workout`.

Para o treinador: sem o vínculo, a semana mostra o planejado como pendente/perdido e a aderência sai errada;
sem a análise, ele perde o resumo pós-treino que economiza a leitura do arquivo.

## What Changes

- **Conciliação do realizado FIT, isolada da ingestão.** `FitTreinoPersister.persistir`, quando `registrar`
  **inseriu** o realizado **e** `dados.corrida()` é verdadeiro, publica um evento interno (ex.:
  `TreinoFitImportadoEvent(treinoId, tenantId)`). Um listener síncrono `@TransactionalEventListener(AFTER_COMMIT)`,
  **sem** `@Transactional`, envolve num `try/catch` a chamada a um bean transacional
  (`@Transactional(REQUIRES_NEW)`) que recarrega o realizado e roda `CandidateSelector.buscarCandidatos` +
  `ReconciliationDecisionExecutor.executar`. O `try/catch` fica **fora** da fronteira transacional: pega tanto a
  exceção do método quanto a do commit (`UnexpectedRollbackException`, falha no flush), e uma falha no meio faz
  rollback inteiro da conciliação (sem commit parcial). Erro logado como ERROR, com o id: **a ingestão já foi
  commitada e nunca é revertida pela conciliação.**
  - Por que não na mesma transação, como o `IntervalsIcuActivityPersister`: o link de download do Garmin vale
    uma vez só (segundo download → 410 → ping `ERRO` sem retry). Uma falha da conciliação dentro de
    `persistir` faria rollback do treino depois de consumir o link — o treino se perderia para sempre.
  - Por que só corrida: o FIT de outro esporte vira `CONTINUO` (`FitTreinoPersister:143`), e a conciliação
    vincularia ciclismo a um planejado de corrida. O ping Garmin já filtra corrida (`GarminPingServiceImpl:28`);
    o upload manual de FIT (`FitUploadServiceImpl`), que usa o mesmo persister, não filtra.
  - Duplicata (`inserted() == false`) não publica o evento.
- **Análise após o "Como foi?".** `AtletaTreinoFeedbackServiceImpl.registrarFeedback` publica
  `TreinoRegistradoEvent` depois de gravar o RPE. O `WorkoutAnalysisListener` (async, `AFTER_COMMIT`) já aplica a
  elegibilidade (RPE presente, até `maxIdadeDias`) e pula análise `COMPLETED`.
- **Backfill operacional pós-merge** (ver Open Questions).

Fora de escopo: mudar o filtro do `DailyActivitySyncScheduler`; mostrar `reconciliation_status` nulo na fila
manual; migrar `IntervalsIcuActivityPersister` para o mesmo isolamento; Strava; claim idempotente no
`WorkoutAnalysisListener`.

## Critérios de aceite

1. **Given** um FIT novo de corrida com um planejado compatível e inequívoco no mesmo dia (mesmo atleta e
   tenant, tipo `CONTINUO`, duração e distância próximas), **When** `persistir` commita, **Then** o realizado
   fica `VINCULADO_AUTOMATICO`, com `treino_planejado_id` = esse planejado, o planejado fica `REALIZADO` e há
   uma linha em `tb_treino_reconciliacao`.
2. **Given** um FIT novo de corrida sem planejado na janela ±1 dia, **When** persiste, **Then**
   `reconciliationStatus = NAO_PLANEJADO` e o realizado aparece em `findPendentesParaRevisao` com os status
   padrão.
3. **Given** um FIT já importado (duplicata), **When** persiste de novo, **Then** a conciliação não roda.
4. **Given** um FIT de outro esporte (`corrida = false`), **When** persiste, **Then** a conciliação não roda e
   `reconciliationStatus` fica nulo.
5. **Given** a conciliação falha — exceção do `ReconciliationDecisionExecutor` depois de mutar entidades, ou falha
   no commit/flush da transação dela — **When** `persistir` termina, **Then** o realizado
   continua gravado (commit da ingestão preservado), sem mudança parcial da conciliação (status nulo, planejado
   intacto, sem linha de auditoria), nenhuma exceção chega ao chamador e o erro é logado com o id do realizado.
6. **Given** um realizado sem RPE, **When** o atleta registra o "Como foi?" com RPE, **Then** `registrarFeedback`
   publica `TreinoRegistradoEvent` com o id e o tenant do realizado.
7. **Given** um realizado elegível (RPE, dentro de `maxIdadeDias`), **When** o feedback commita, **Then** o
   `WorkoutAnalysisListener` recebe o evento e grava a análise (IT com commit real e LLM simulado).
8. **Given** o realizado do CA1 (`VINCULADO_AUTOMATICO`), **When** `WorkoutAnalysisPromptDataBuilder.build` monta
   o prompt, **Then** o bloco `planned` vem preenchido (tipo, duração e distância do planejado vinculado). Não
   se aplica a `AMBIGUO`/`NAO_PLANEJADO`, que não vinculam.

## Métrica de sucesso

Medida por SQL de leitura em produção, 7 dias após o deploy, executada no `/done`:

- % de realizados `GARMIN` de corrida criados após o deploy com `reconciliation_status` não nulo — alvo 100%.
- % de realizados com `feedback_registrado_em` após o deploy e elegíveis (≤ `maxIdadeDias`) com linha em
  `tb_analise_workout` (`COMPLETED` ou `FAILED`) — alvo ≥ 95%. Hoje os dois são 0%.

## Rollback

Reverter o PR. Sem schema nem contrato. Realizados conciliados enquanto esteve no ar continuam válidos; análises
geradas também.

## Open Questions & Assumptions

- **Backfill (pós-merge, escrita em produção só com confirmação explícita):** os realizados já gravados
  não têm caminho automático. Plano: listar por leitura os realizados `GARMIN` com `reconciliation_status` nulo,
  confirmar que são corrida (vieram de ping Garmin, que só aceita corrida, ou têm `descricao` sem esporte
  anotado — `descricaoParaEsporte` marca os outros) e, só nesses **ids revisados**, um SQL marca
  `reconciliation_status = 'NAO_PLANEJADO'` e `reconciliation_reason_code = 'BACKFILL_SEM_RECONCILIACAO'`.
  `NAO_PLANEJADO` está nos status padrão da fila (`ReconciliacaoPendentesServiceImpl:55`), então o treinador os
  vincula à mão (coach-in-the-loop). `PENDENTE` foi descartado: não aparece na fila padrão. FIT de outro esporte
  continua nulo (CA4). A análise do treino de 2026-11-09 sai quando o atleta reenviar o "Como foi?" (está dentro
  de `maxIdadeDias`).
- **Aceito:** corrida entre o evento do insert (async) e o do feedback — se o atleta responder antes de o evento
  do insert ser processado, os dois podem achar RPE e disparar duas chamadas de LLM (o listener só pula
  `COMPLETED`). Exige resposta em segundos após a sincronização; custo máximo uma análise extra. Claim
  idempotente fica fora de escopo.
- **Aceito:** se a conciliação falhar (CA5), o realizado fica com status nulo, como hoje. O log ERROR com o id é o
  sinal; o mesmo SQL do backfill o recupera.
- **Aceito (atualização perdida):** `TreinoRealizado` não tem `@Version`, e o Hibernate grava todas as colunas
  no UPDATE. Se a transação da conciliação e a do feedback carregassem o mesmo realizado ao mesmo tempo, a última
  a commitar sobrescreveria o RPE ou o vínculo. A conciliação roda síncrona logo após o commit da ingestão
  (milissegundos), e o feedback exige que o atleta abra o app e responda depois de ver o treino — a janela é
  desprezível na prática. `@Version`/`@DynamicUpdate` em `TreinoRealizado` toca todos os caminhos de escrita da
  entidade e fica fora desta change; se aparecer RPE ou vínculo perdido, abrir change própria.
- **Assumido:** o `TenantContext` do `GarminPingProcessorScheduler` (`:109`) e do upload continua instalado no
  `AFTER_COMMIT` síncrono (mesma thread); o listener ainda assim recebe o tenant pelo evento.
