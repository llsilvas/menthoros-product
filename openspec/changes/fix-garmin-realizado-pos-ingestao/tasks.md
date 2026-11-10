## 1. Conciliação do realizado FIT (isolada da ingestão)

- [x] 1.1 Testes em `FitTreinoPersisterTest`: FIT novo de corrida publica `TreinoFitImportadoEvent(treinoId,
  tenantId)`; duplicata não publica; `corrida = false` não publica (CA3, CA4)
  - verify: testes vermelhos antes da 1.2
- [x] 1.2 `FitTreinoPersister.persistir`: publicar o evento quando `inserted() && dados.corrida()`
  - verify: `./mvnw test -Dtest=FitTreinoPersisterTest` verde
- [x] 1.3 Testes unit: o bean transacional recarrega o realizado e chama `CandidateSelector` + `ReconciliationDecisionExecutor`;
  o listener captura qualquer exceção do bean (inclusive `UnexpectedRollbackException`) e loga, sem propagar (CA5)
  - verify: testes vermelhos antes da 1.4
- [x] 1.4 Dois componentes: bean `@Transactional(REQUIRES_NEW)` com a conciliação, e listener
  `@TransactionalEventListener(AFTER_COMMIT)` **sem** `@Transactional`, com o `try/catch` em volta da chamada
  (precedente: `IntervalsIcuPlanoDeletadoListener:49-50`). JavaDoc Idempotent/Side Effects/Tenant-aware, e nota de que
  sob transação externa o evento só dispara no commit externo
  - verify: teste da 1.3 verde
- [x] 1.5 `GarminActivityIngestionIT`: ping processado com planejado inequívoco no dia → `VINCULADO_AUTOMATICO`,
  FK correta, planejado `REALIZADO`, linha em `tb_treino_reconciliacao` (CA1); sem planejado na janela ±1 dia →
  `NAO_PLANEJADO` e visível em `findPendentesParaRevisao` (CA2); executor real falhando depois de mutar
  (spy com `doCallRealMethod` + exceção após a mutação) → realizado gravado, status nulo, planejado intacto, sem
  auditoria, ping `PROCESSADO` (CA5); `WorkoutAnalysisPromptDataBuilder.build` do realizado do CA1 traz `planned` preenchido (CA8)
  - verify: `./mvnw verify -Dit.test=GarminActivityIngestionIT` verde

## 2. Análise após o "Como foi?"

- [x] 2.1 Teste em `AtletaTreinoFeedbackServiceImplTest`: `registrarFeedback` publica `TreinoRegistradoEvent` com
  id e tenant do realizado (ArgumentCaptor) (CA6)
  - verify: teste vermelho antes da 2.2
- [x] 2.2 `registrarFeedback` publica o evento após salvar; JavaDoc de Side Effects atualizado
  - verify: `./mvnw test -Dtest=AtletaTreinoFeedbackServiceImplTest` verde
- [x] 2.3 IT: realizado elegível sem RPE → `POST` do feedback (commit real) → `WorkoutAnalysisListener` grava a
  análise com LLM simulado, esperando o `@Async` (Awaitility já usado em `SugestaoCoachConcurrentDecisionIT`) (CA7)
  - verify: o IT novo verde em `./mvnw verify`
  - **Feito:** `AtletaTreinoFeedbackAnaliseIT`. O LLM é simulado indisponível (`ModelRouter` mockado), então a
    análise sai `FAILED` com a mensagem do mock: prova evento → listener → linha gravada, sem chave nem custo. O
    caminho `COMPLETED` segue coberto pelos testes do listener. Polling com teto em vez de Awaitility (não está no
    pom; não adicionei dependência).

## 3. Validação

- [x] 3.1 `./mvnw clean verify`
  - verify: 0 falhas — 6599 unit (1 skipped) + 327 IT. As 4 IT de `TrajetoShareConsentIT` caíram por queda transitória do Postgres do Testcontainers (EOF no SSL) e passaram ao rodar de novo. Fora da change: `GarminClientImplTest.timeout` e `IntervalsIcuOAuthServiceImplTest` são instáveis sob carga — o segundo travou o build no `Mono.block()` sem timeout de `IntervalsIcuOAuthServiceImpl.trocarCode`.

## 4. Pós-merge (operacional, com confirmação)

- [ ] 4.1 Backfill: listar (leitura) os realizados `GARMIN` com `reconciliation_status` nulo, confirmar que são
  corrida, e só nesses ids um SQL marca `NAO_PLANEJADO` / `BACKFILL_SEM_RECONCILIACAO` (Open Questions); pedir ao
  atleta que reenvie o "Como foi?" do treino de 2026-11-09
  - verify: leitura em produção — os ids revisados aparecem na fila do treinador; FIT de outro esporte segue nulo;
    análise do `477922c0…` existe
