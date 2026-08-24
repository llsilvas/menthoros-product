## 0. Pré-requisitos

- [x] 0.1 Branch `feature/ingestao-treino-realizado` em `apps/menthoros-backend` (`/implement init`, 2026-08-22, base `7fd066e`)
  verify: `git -C apps/menthoros-backend branch --show-current` → `feature/ingestao-treino-realizado`
- [x] 0.2 Confirmar no dataset de `TsbRecalculoEquivalenciaIT`: treinos `CANCELADO` e FIT com `metodoCalculoTss = DISPOSITIVO` (D3.1 e D8 mudam o esperado para esses; registrar o delta antes de implementar)
  verify: grep no dataset de referência por `CANCELADO`/`DISPOSITIVO`; se algum aparecer, nota no proposal com o delta esperado antes da task 4.3 — CONFIRMADO 2026-08-22: dataset (`reference-dataset.md`, arquivada em fix-tsb-recalculo-resiliente) não contém nenhum dos dois; sem delta a registrar
- [x] 0.3 Deixar nota em `first-party-ingestion-architecture/proposal.md` ("Relação"): `WorkoutImportService` deve terminar em `registrar`
  verify: nota adicionada em "Riscos e mitigações" (não havia seção "Relação"), 2026-08-22
- [ ] 0.4 Baseline da métrica de sucesso: contar chamadas a `recalcularHistoricoCompleto` nos últimos 30 dias (logs de produção) e registrar no proposal
  verify: número registrado na seção "Métrica de sucesso" do proposal.md

## Bloco 1 — seam, verdade única, fontes externas

### 1. Treino que conta

- [x] 1.1 `TreinoRealizadoRepository.findQueContamByAtletaIdAndDataTreino(atletaId, data)` com `statusSincronizacao IS NULL OR statusSincronizacao <> CANCELADO`; IT com um cancelado e um NULL no mesmo dia — o NULL conta, o cancelado não (DoR Codex #1)
  verify: `TreinoRealizadoRepositoryQueContaIT` — 2 testes, 0 falhas (`./mvnw clean verify`, 2026-08-22)
- [x] 1.2 `TsbServiceImpl.buscarTreinosDia` passa a usar a consulta de 1.1; `TsbServiceImplSemanticaTest` ajustado
  verify: `TsbServiceImplSemanticaTest`, `TsbServiceImplRecalculoSemanticaTest`, `TsbServiceImplDiasConsecutivosTest` — 15 testes, 0 falhas (2026-08-22). Os três usam `Proxy` sobre `TreinoRealizadoRepository` e precisaram trocar o nome do método interceptado.

### 2. `TsbService.recalcularDesde` (D13)

- [x] 2.1 IT vermelho: treino registrado em D-3 com métricas materializadas até hoje → CTL/ATL/TSB de D-3..hoje mudam consistentemente — CA6b
  verify: `TsbServiceRecalcularDesdeIT` não compilava (`recalcularDesde` ausente) — red confirmado 2026-08-22
- [x] 2.2 `TsbService.recalcularDesde(atletaId, data)`: loop dia a dia até o último `MetricasDiarias` materializado (ou hoje), `atualizarMetaDados` só no último; reusa `atualizarTsbDia(…, false)`
  verify: `TsbServiceRecalcularDesdeIT` — 1 teste, 0 falhas (`./mvnw clean verify`, 2026-08-22); CTL propaga de D-3 até hoje (1.46/5.81) no caminho novo, zero no caminho antigo
- [x] 2.3 Validação: `./mvnw clean test`
  verify: `./mvnw clean verify` — BUILD SUCCESS

### 3. Módulo `IngestaoTreinoRealizadoService` (TDD, IT sobre `AbstractIntegrationTest`)

- [x] 3.1 Interface em `services/` com `registrar(treino, externalId?)` e `reprocessar(treinoId, dataAnterior?)` + javadoc com as invariantes do design (ordem, entidade nova/gerenciada, erros, TX, tenant)
  verify: compila; javadoc cobre ordem, TX, tenant, erro
- [x] 3.2 IT vermelho: `registrar` parametrizado por `FonteDados` (FIT com e sem TSS de dispositivo, STRAVA, INTERVALS_ICU, MANUAL) — CA1, CA3, CA4, CA10
  verify: `IngestaoTreinoRealizadoServiceRegistrarIT` — nested `TodaFonteGravaTss`, 5 testes, 0 falhas
- [x] 3.3 IT vermelho: entidade nova com `externalId` existente (CA2) e entidade gerenciada após merge (CA2b)
  verify: nested `Deduplicacao`, 2 testes, 0 falhas — inclui `TransactionTemplate` no teste para simular a mesma TX do chamador real (D6), sem o que a entidade recarregada ficava detached
- [x] 3.4 IT vermelho: `dataTreino` nulo — CA8; falha na carga reverte o treino — CA9
  verify: `IngestaoTreinoRealizadoServiceImplTest` (Mockito, não IT — não precisa de banco): 3 testes, 0 falhas
- [x] 3.5 Implementação `registrar`: `tssCalculado` (D3.1) → checagem prévia de duplicata por `(externalId, atletaId)` → `saveIdempotent` → evento se inseriu → `recalcularDesde(dataTreino)`
  verify: os IT de 3.2/3.3 e o teste de 3.4 verdes. **Bug real encontrado e corrigido** (não estava no design original): `TreinoDedupHelper.saveIdempotent` chamado de dentro de `@Transactional` deixava o INSERT pendente até a próxima query, e a violação de constraint só aparecia depois, sem tradução de exceção e com a transação Postgres já "aborted" (25P02) — corrigido com `entityManager.flush()` + catch de `ConstraintViolationException` no helper, e checagem prévia em `registrar` para o caminho comum (ver design.md "Achado de implementação")
- [x] 3.6 IT vermelho: `reprocessar` — laps adicionados sem `dataAnterior` (CA5), data mudou com `dataAnterior` preenchida (CA6, CA6b), cancelado (CA7), id inexistente → `DomainNotFoundException`
  verify: `IngestaoTreinoRealizadoServiceReprocessarIT`, 4 testes, 0 falhas
- [x] 3.7 Implementação `reprocessar`: recarrega por id → `tssCalculado` se conta e não é DISPOSITIVO → `recalcularDesde(min(dataAnterior, treino.dataTreino))` quando `dataAnterior != null`, senão `recalcularDesde(treino.dataTreino)`
  verify: os 4 IT de 3.6 verdes
- [x] 3.8 Validação: `./mvnw clean verify`
  verify: BUILD SUCCESS, 0 falhas em toda a suíte (700 classes)

### 4. `tssCalculado` como única verdade

- [x] 4.1 `TsbServiceImpl` ganha `somarTssContabilizado` — soma `tssCalculado` dos treinos que contam; fallback "nulo → calcula e persiste agora" com `log.warn` referenciando a task 8.2
  verify: `TsbServiceImplSemanticaTest` adaptado (treino com `tssCalculado` pré-setado em vez de override de `calcularTssDia`) — 6 testes, 0 falhas
- [x] 4.2 `recalcularHistoricoCompleto` preenche `tssCalculado` em cada treino que conta antes de recalcular o dia, preservando DISPOSITIVO — CA12
  verify: coberto pelo mesmo código de 4.1 (o backfill chama `atualizarTsbDia` por dia, que já grava o fallback); log real no `TsbRecalculoEquivalenciaIT` confirma o fallback disparando e persistindo
- [x] 4.3 `TsbRecalculoEquivalenciaIT` verde contra o dataset de referência (com o delta da 0.2)
  verify: 5 testes, 0 falhas
- [x] 4.4 Validação: `./mvnw clean test`
  verify: `./mvnw clean verify` — BUILD SUCCESS, 0 falhas (700 classes)

### 5. Migrar FIT, intervals.icu e Strava sync

- [x] 5.1 `FitTreinoPersister` chama `registrar` com o treino já carregando o TSS de dispositivo quando houver; remove o cálculo local, evento e `atualizarTsbDia`; `FitTreinoPersisterTest` mocka o ingestor e perde os asserts migrados
  verify: `FitTreinoPersisterTest` (23) + `FitRunningDynamicsIntegrationTest` (3) — 26 testes, 0 falhas; grep confirma zero chamadas a `tsbService.`/`tssCalculatorService.` na classe
- [x] 5.2 Dependência confirmada: `intervals-icu-activity-sync-scheduler` já mergeada em `develop` (commit `7fd066e`, PR #77). **`IntervalsIcuActivityPersister` NÃO migra para `registrar`** — conflito real de contrato descoberto: o evento precisa publicar depois da reconciliação (pre-mortem #10, `intervals-icu-activity-ingestion` arquivada), que exige `realizado.getId()` já atribuído; `registrar()` não tem hook pós-save/pré-evento e seu sinal `eraNovo` classificaria isso como re-sync, suprimindo o evento. Ver design.md "Achado de implementação (Seção 5)". Permanece na implementação atual.
  verify: `IntervalsIcuActivityPersisterTest` inalterado, continua verde (24 testes — confirmado no `./mvnw clean verify` da Seção 4)
- [x] 5.3 `StravaActivityServiceImpl`: `syncSingleActivityById` E o loop de `syncActivitiesInternal` (achado: este último nunca chamava TSB nem publicava evento — o gap mais sério do arquivo) mantêm o find-or-new + merge e chamam `registrar` com a entidade gerenciada; removidos `atualizarTsbDia` privado, os campos `tsbService`/`treinoDedupHelper` e as duas chamadas diretas a `saveIdempotent`. `enriquecerTreinoComStrava` (`:270`) **permanece inalterado** — achado real: migrar para `reprocessar` (nunca publica evento, D5) silenciaria a única análise por IA de treinos Strava sem RPE no sync inicial (`WorkoutAnalysisListener` exige RPE não-nulo); ver design.md "Achado de implementação (Seção 5) — enriquecerTreinoComStrava". A dupla atribuição de `statusSincronizacao` não bloqueou nenhum teste — não tocada, segue como follow-up do candidato 4
  verify: `StravaActivityServiceImplSyncTest` (novo, 3 testes) + `StravaActivityServiceTest` (2) + `EnriquecerStravaServiceTest` (8) — 13 testes, 0 falhas; `./mvnw clean verify` completo — BUILD SUCCESS
- [x] 5.4 Guard de idade em `WorkoutAnalysisListener` (`app.workout-analysis.max-idade-dias`, `WorkoutAnalysisProperties` com `@ConfigurationProperties` + `@Validated`, default 30 dias); teste do guard
  verify: `WorkoutAnalysisListenerTest` (8, incluindo o guard e o caso defensivo de `dataTreino` nula) + `WorkoutAnalysisPropertiesTest` (5, binding + validação) — 13 testes, 0 falhas
- [ ] 5.5 Medir em stage o custo de `recalcularDesde` na carga inicial Strava de um atleta com 90 dias; registrar no proposal (Open Question do pre-mortem #1)
  verify: **não executável nesta sessão** — sem acesso a ambiente de stage. Permanece como Open Question aberta no proposal; medir antes do deploy em produção (task 6.2 já exige stage antes de prod para o backfill, mesma janela serve para esta medição)
- [x] 5.6 Validação: `./mvnw clean test`
  verify: `./mvnw clean verify` — BUILD SUCCESS, 0 falhas (701 classes)

### 6. Entrega do Bloco 1

- [x] 6.1 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer) sem achado Crítico — atenção a tenant (CA10) e atomicidade (CA9)
  verify: relatório do `/qa` (2026-08-22) — 0 Crítico nos 3 revisores Claude + Codex review + Codex adversarial-review; `./mvnw clean test` 2773 testes, 0 falhas. 1 achado alto do Codex corrigido nesta rodada (data mudou no re-sync do Strava não recalculava o dia antigo — ver design.md "Achado de implementação (Bloco 1, Seção 5)"); 1 achado alto verificado como pré-existente e deferido (corrida de dedup pode desativar integração Strava — ver design.md). Achados Importante/Menor restantes registrados em design.md/Riscos, nenhum bloqueante para este PR
- [~] 6.2 Dump de `tb_metricas_diarias` (backup) antes de rodar em produção; rodar `recalcularHistoricoCompleto` primeiro em stage, depois prod; query de verificação: zero treinos que contam com `tssCalculado` nulo (spec-reviewer #1)
  verify: **stage (HomeLab) concluído em 2026-08-22.** Dump de `tb_metricas_diarias` (939 linhas) salvo
  em `~/menthoros-backup/tb_metricas_diarias_backup_20260822_184211.sql` na própria HomeLab e localmente.
  `recalcularHistoricoCompleto` rodado para os 6 atletas via backend local apontado para o Postgres da
  HomeLab (`192.168.15.24:5432`) — 4 com treinos (Carla Oliveira, Hugo Silva, Leandro Silva, Maria
  Santos) tiveram métricas recalculadas (`updated_at` no intervalo 18:49:26–18:50:03); 2 sem treino
  (Antonio Santos, João Silva) corretamente sem métrica. Query de verificação:
  `select count(*) from tb_treino_realizado where (status_sincronizacao is null or status_sincronizacao
  <> 'CANCELADO') and tss_calculado is null` → **0**. **Pendente: rodar em prod** (Railway) antes de
  fechar esta task — requer confirmação explícita separada, é ambiente de produção
- [x] 6.2b Nota in-app na tela de PMC para tenants afetados pelo backfill ("valores históricos recalculados — treinos cancelados e TSS de dispositivo agora refletidos corretamente") (spec-reviewer / product review #2)
  verify: implementado em `apps/menthoros-front` (branch `feature/ingestao-treino-realizado`) —
  `PmcBackfillNotice` (Alert MUI dismissível) + `usePmcBackfillNotice` (flag em `localStorage`,
  degrada com segurança se storage estiver bloqueado), exibido em `DiagnosisTabPanel` (tela de
  diagnóstico do coach) quando há série PMC. **Decisão:** banner global simples, sem flag por
  tenant no backend (mecanismo mais preciso avaliado e descartado por expandir escopo do Bloco 1 —
  ver conversa da task). `npm run lint`/`build`/`test:run` verdes (1238 testes, 19 novos/afetados).
  Não é fluxo crítico da lista de E2E obrigatório do CLAUDE.md do front — sem E2E dedicado.
  **Remover o componente/hook depois que o backfill rodar em produção e o aviso já tiver
  circulado por um tempo razoável** (sem expiração automática por código)
- [x] 6.3 `/pr ingestao-treino-realizado` (PR 1 de 2) com changelog para o treinador (cancelados saem do PMC; TSS de dispositivo passa a valer no PMC; agregadores fora do TSB só no PR 2)
  verify: PR backend aberto — https://github.com/llsilvas/menthoros-backend/pull/78 (2026-08-22);
  PR frontend aberto (nota in-app, task 6.2b) — https://github.com/llsilvas/menthoros-front/pull/86.
  Descrições incluem changelog, critérios de aceite, validação e link da spec. **Mergeados em
  `develop` em 2026-08-22** — backend `c60f516`, frontend `caa26eb`. Branches locais e remotas
  limpas. **Bloco 1 entregue.**

## Bloco 2 — gestos de alteração e limpeza (só após merge do Bloco 1)

### 7. Migrar os caminhos manuais e de alteração

- [x] 7.1 `lancarTreino`, `registrarTreinoManualAtleta`, `addTreino`: resolver default de data **uma vez** com `Clock` (injetar em `TreinoServiceImpl`), depois `registrar`; `addTreino` passa a publicar evento
  verify: os três métodos migrados para `ingestaoTreinoRealizadoService.registrar(...)`; data resolvida
  uma única vez via `LocalDate.now(clock)` (`ClockConfig` já existia). `resolverPlanoSemanal` passou a
  receber a data já resolvida em vez de reler `input.dataTreino()` (podiam divergir na borda do dia).
  `addTreino` agora publica evento (antes não publicava nenhum) — o mesmo gap que `syncActivitiesInternal`
  tinha no Strava (Seção 5). Testes atualizados: `TreinoServiceImplTest`, `AtletaTreinoServiceImplTest`,
  `TreinoServiceTenantTest`, `TreinoServiceConsistenciaValidatorTest` — 4 arquivos, stubs de
  `treinoRealizadoRepository.save`/`tsbService.atualizarTsbDia` trocados por
  `ingestaoTreinoRealizadoService.registrar`. `./mvnw clean verify` — BUILD SUCCESS, 701 classes, 0 falhas
- [x] 7.2 Apagar `TreinoServiceImpl.atualizarVolumeDiario` e `atualizarTsb` — CA11; testes de `TreinoServiceImpl` que assertavam o `+1` incremental são removidos (descrevem o bug)
  verify: `grep -n "atualizarVolumeDiario\|atualizarTsb\b" TreinoServiceImpl.java` vazio (só comentários
  mencionando o antigo comportamento); campo `TsbService tsbService` removido da classe (ficou
  inteiramente sem uso após 7.1); `metricasDiariasRepository`/`treinoRealizadoRepository.save` para
  MetricasDiarias só aparece em `TsbServiceImpl`/`TsbRecalculoExecutor` agora (CA11)
- [x] 7.3 `updateTreino` → ler `treino.getDataTreino()` antes de mutar/salvar, então `reprocessar(id, dataAntiga)` (`dataAntiga = null` se a data não mudou)
  verify: **achado real, não regressão desta task:** `dataTreino` é imutável via `updateTreino` —
  `applyMutableFields` nunca a atribui (confirmado por `UpdateTreinoIntegrationTest.
  updateTreino_doesNotOverwriteImmutableFields`, teste pré-existente e mantido). `dataAntiga` captada
  antes da mutação, então, é sempre igual à data atual — `reprocessar` sempre recebe
  `dataAnterior=null` neste caminho específico (o parâmetro segue existindo para o contrato genérico
  do seam, exercitado com data diferente em `IngestaoTreinoRealizadoServiceReprocessarIT`). O que a
  migração fecha de fato: antes, `updateTreino` **nunca** tocava TSB/`MetricasDiarias` (tabela de
  chamadores do design.md, #7 — carga do dia "não" em negrito); agora recalcula a cada update.
  Descoberto um segundo achado real ao rodar o IT existente: `UpdateTreinoIntegrationTest` não
  criava `PlanoMetaDados` para o atleta — nunca precisou antes porque nada chamava TSB; corrigido
  no fixture (mesmo padrão de `seedAtleta` usado em outros IT). Teste novo:
  `TreinoServiceImplTest.recalculaCargaViaReprocessar`. `./mvnw clean verify` — BUILD SUCCESS, 701
  classes, 0 falhas
- [x] 7.4 `ManualReconciliationServiceImpl` (3 pontos) → `reprocessar(id, null)`
  verify: `linkManually`, `markAsNotPlanned`, `unlinkManually` chamam `reprocessar(id, null)` após
  persistir + evento de auditoria — por completude (D2/D9), mesmo nenhum dos três gestos alterando
  `tssCalculado`/carga hoje (nenhum toca `statusSincronizacao` nem campos usados por
  `TssCalculatorService`). `ManualReconciliationServiceImplTest` novo (3 testes, um por ponto).
  Achado ao rodar `ManualReconciliationControllerIT` (pré-existente): mesmo gap do fixture de
  7.3 — `PlanoMetaDados` não existia para o atleta de teste; corrigido. `./mvnw clean verify` —
  BUILD SUCCESS, 701 classes, 0 falhas
- [x] 7.5 `IntervalsIcuLapsBackfillPersister` → `reprocessar(id, null)` após gravar etapas
  verify: `IntervalsIcuLapsBackfillPersisterIT` novo (2 testes, 0 falhas) — `tssCalculado` muda após
  etapa gravada, `MetricasDiarias` reflete a carga (CA5, caminho real, Testcontainers). Reprocessar
  chamado dentro da mesma transação `REQUIRES_NEW` do treino (D6, join na transação ambiente do
  `@Transactional` do próprio `gravarEtapas`). `./mvnw clean verify` — BUILD SUCCESS, 701 classes,
  0 falhas
- [x] 7.6 `StravaWebhookServiceImpl.markAsCanceled` → `reprocessar(id, null)`
  verify: fecha o achado do `/qa` (Codex review, task 6.1, 2026-08-22) — o webhook de delete do
  Strava nunca recalculava TSB após marcar `CANCELADO`. `StravaWebhookServiceTest.
  shouldMarkTrainingAsCanceledOnDelete` atualizado para verificar `reprocessar(treino.getId(),
  null)`; `StravaWebhookServiceImplTest` e o construtor ajustados para o novo colaborador.
  `./mvnw clean verify` — BUILD SUCCESS, 701 classes, 0 falhas
- [x] 7.7 "Treino que conta" nos **produtores/queries** (D8, CA7b — inventário corrigido no DoR, Codex #3): `CoachDashboardServiceImpl:143`, `TreinoServiceImpl:474`, `RaceProjectionServiceImpl:184`, `InjuryRiskEvaluator:65`, e **`PlanoServiceImpl.getDadosPlano:720-724`** (`findByAtletaIdAndDataTreinoBetween` — alimenta `PlannerShadowService` e `PlanoTreinoPromptBuilder:439,466`/`VariabilidadePromptFormatter:279,303,529`; verificar se estes dois últimos leem daqui ou de query própria antes de decidir onde aplicar o predicado). Teste por query com um cancelado e um NULL no período.
  verify: predicado centralizado como `TreinoRealizado.contaNaCarga()` (fonte única em Java;
  `IngestaoTreinoRealizadoServiceImpl` passou a delegar para ela também). Aplicado nos 4 produtores
  citados via `.filter(TreinoRealizado::contaNaCarga)`. **`InjuryRiskEvaluator` não precisou de
  mudança própria** — investigação confirmou que consome `TreinoRealizadoSnapshot` construído por
  `PlannerShadowService` a partir de `dadosPlano.ultimosTreinos()`, corrigido ao filtrar
  `PlanoServiceImpl.getDadosPlano`. **Achado real da investigação:** `PlanoTreinoPromptBuilder`/
  `VariabilidadePromptFormatter` NÃO leem de `getDadosPlano` — o método `buildRequest` que consome
  esse DTO está marcado "MÉTODO LEGADO"; o caminho real (`buildOptimizedPrompt`) usa
  `TreinoHistoricoProvider.prepararContexto`, uma query totalmente separada
  (`findByAtletaAndDataTreinoGreaterThanEqualOrderByDataTreinoDesc`) — filtrada também, já que
  alimenta toda a árvore de formatters de prompt do planner. 5 testes novos/atualizados (um por
  produtor + `TreinoHistoricoProviderTest` novo), cada um com cancelado excluído e NULL incluído.
  `./mvnw clean verify` — BUILD SUCCESS, 701 classes, 0 falhas
- [x] 7.8 Validação: `./mvnw clean test`
  verify: `./mvnw clean verify` rodado a cada task da Seção 7 — BUILD SUCCESS, 0 falhas em toda a
  suíte (última rodada: task 7.7)

### 8. Fechar o seam

- [x] 8.1 Teste de arquitetura: `TsbService.atualizarTsbDia`/`recalcularDesde` e `TssCalculatorService.calcularTss` só são chamados de `IngestaoTreinoRealizadoServiceImpl` (ArchUnit se disponível; senão teste com grep em `src/main`)
  verify: `IngestaoTreinoRealizadoSeamArchTest` novo (ArchUnit, disponível no `pom.xml`) — 3 regras,
  uma por método, com as duas exceções documentadas em design.md (`TsbServiceImpl` self-calls,
  `IntervalsIcuActivityPersister`) explicitamente permitidas via `DescribedPredicate`. Estendida
  na task 8.3 para uma 4ª regra (`TreinoDedupHelper.saveIdempotent`)
- [~] 8.2 Remover o fallback "nulo → calcular" de 4.1 (backfill já rodou em produção)
  verify: **bloqueada** — depende do backfill já ter rodado em produção (task 6.2, parte prod), que
  ainda não aconteceu nesta sessão (só stage/HomeLab). Fica pendente até o deploy + backfill de
  produção; a query de verificação da task 6.2 é o gate antes de remover
- [x] 8.3 `TreinoDedupHelper` sem `public`; `TssCalculatorService.calcularTssDia` removido ou privado
  verify: **`TreinoDedupHelper` não pode ficar package-private** — `services`/`services.impl`/
  `services.helper` são pacotes distintos e vários tipos cruzam essa fronteira (a interface do seam
  retorna `TreinoDedupHelper.SaveResult`); reescrever para o mesmo pacote seria uma mudança de
  escopo bem maior que esta task. Substituído pelo equivalente arquitetural: 4ª regra ArchUnit em
  `IngestaoTreinoRealizadoSeamArchTest` restringindo `saveIdempotent` aos 2 chamadores legítimos.
  `TssCalculatorService.calcularTssDia` **removido** — confirmado órfão (zero chamadores em
  `src/main` e `src/test`, achado do `/qa` original); dublê de teste morto em
  `TsbServiceImplRecalculoSemanticaTest` (`tssCalculatorStub`) removido junto
- [x] 8.4 Validação: `./mvnw clean test`
  verify: `./mvnw clean verify` — BUILD SUCCESS, 701 classes, 0 falhas

### 9. Entrega do Bloco 2

- [x] 9.1 `/qa` sem achado Crítico
  verify: 0 Crítico. Achados reais fixados: (1) Codex adversarial-review "high" — D8
  (`contaNaCarga`) faltava em `ProgressaoTreinoServiceImpl.calcularHistorico`,
  `PlanoServiceImpl.calcularVolumeRealizadoKm` e `AthleteThresholdUpdater.atualizarLimiares`
  (achados por investigação de seguimento sobre a mesma query) — corrigido com testes cobrindo
  CANCELADO excluído/NULL incluído; (2) Codex plain review `[P2]` — `TsbServiceImpl.atualizarMetaDados`
  lançava `IllegalArgumentException` quando `PlanoMetaDados` ainda não existia (bug pré-existente,
  blast radius ampliado por esta change consolidar os caminhos de mutação) — trocado para
  `PlanoMetadadosService.buscarOuCriarMetadados`; (3) code-reviewer — JavaDoc
  Idempotent/Side Effects/Tenant-aware faltando em `addTreino` e nos 3 métodos de
  `ManualReconciliationServiceImpl` tocados nesta migração — adicionado.
  Achados deferidos com justificativa: `addTreino`'s pre-check de duplicidade não chama o seam no
  branch de duplicata (comportamento pré-existente, não regressão — fora de escopo unificar agora);
  `TreinoDedupHelper.SaveResult` público entre pacotes e filtragem D8 em memória vs. JPQL — ambos já
  documentados como decisão deliberada (task 8.3, design.md D8); dead-code de `dataAntiga` em
  `updateTreino` — já documentado (task 7.3), comentário no código reforçado. Achados de segurança
  pré-existentes (BOLA em `TreinoRealizadoController.updateTreino`, assinatura de webhook Strava,
  enumeração em `ManualReconciliationServiceImpl`) confirmados fora do diff desta change — não
  fixados aqui. `./mvnw clean verify`: 797 unit + 37 IT, 0 falhas.
- [x] 9.2 `/pr ingestao-treino-realizado` (PR 2 de 2)
  verify: PR #79 aberto contra `develop`, CI verde (`Build e testes (verify)` pass em 5m1s,
  `GitGuardian Security Checks` pass) — https://github.com/llsilvas/menthoros-backend/pull/79
- [ ] 9.3 Atualizar `tasks.md`; `/done ingestao-treino-realizado` (archive + SPRINTS)
  verify: change arquivada em `changes/archive/2026-08/`; `SPRINTS.md` atualizado
