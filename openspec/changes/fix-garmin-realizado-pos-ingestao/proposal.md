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

- `FitTreinoPersister.persistir`: quando `registrar` **inseriu** o realizado, busca candidatos
  (`CandidateSelector.buscarCandidatos`) e decide/persiste (`ReconciliationDecisionExecutor.executar`) na mesma
  transação — mesmo padrão do `IntervalsIcuActivityPersister`. Na duplicata, não reconcilia de novo.
- `AtletaTreinoFeedbackServiceImpl.registrarFeedback`: depois de gravar o RPE, publica
  `TreinoRegistradoEvent`. O listener roda `AFTER_COMMIT` e já ignora treino com análise `COMPLETED`.
- Backfill operacional pós-merge dos realizados já gravados (ver Open Questions).

Fora de escopo: mudar o filtro do `DailyActivitySyncScheduler`; mostrar `reconciliation_status` nulo na fila
manual; migrar `IntervalsIcuActivityPersister` para o seam `registrar`; Strava.

## Critérios de aceite

1. **Given** um ping Garmin processado cujo FIT gera um realizado novo e há planejado compatível no dia,
   **When** `FitTreinoPersister.persistir` termina, **Then** o realizado tem `reconciliationStatus` não nulo
   (decidido pelo `ReconciliationDecisionExecutor`) e há linha em `tb_treino_reconciliacao`.
2. **Given** um FIT novo sem planejado no dia, **When** persiste, **Then** `reconciliationStatus = NAO_PLANEJADO`
   e o realizado aparece na fila de pendentes do treinador.
3. **Given** um FIT já importado (duplicata), **When** persiste de novo, **Then** a reconciliação não é chamada.
4. **Given** um realizado sem RPE, **When** o atleta registra o "Como foi?" com RPE, **Then**
   `TreinoRegistradoEvent` é publicado com o id e o tenant do realizado.
5. **Given** o evento do item 4 após o commit, **When** o listener roda, **Then** é criada a análise do
   realizado (verificado no IT de ingestão Garmin + feedback, com LLM simulado).
6. A análise gerada depois da conciliação inclui o lado planejado (o realizado já está vinculado no commit
   em que o evento é processado).

## Métrica de sucesso

- % de realizados `GARMIN` criados após o deploy com `reconciliation_status` não nulo: alvo 100%.
- % de realizados com RPE registrado após o deploy com análise `COMPLETED` ou `FAILED` em até 10 min: alvo
  ≥ 95%. Hoje ambos são 0%.

## Open Questions & Assumptions

- **Backfill (decisão do usuário, pós-merge):** os 6 realizados já gravados não têm caminho automático — o
  scheduler e a fila manual não os veem. Opções: (a) script SQL único que marca `reconciliation_status =
  'PENDENTE'` para o treinador conciliar à mão, ou (b) endpoint/admin one-off que roda
  `CandidateSelector` + `ReconciliationDecisionExecutor` neles. A análise do treino de 2026-11-09 sai
  reenviando o "Como foi?" depois do deploy. Escrita em produção só com confirmação explícita.
- **Assumido:** reenviar o feedback com análise `PENDING` em curso pode disparar uma segunda chamada de LLM
  (o listener só pula `COMPLETED`). Raro (o atleta reenviaria em segundos); aceito.
- **Assumido:** `ReconciliationDecisionExecutor` chamado dentro da transação de `persistir` é seguro — o
  `IntervalsIcuActivityPersister` já faz o mesmo, e o evento de análise só é consumido após o commit.
