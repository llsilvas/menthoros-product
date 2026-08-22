## 0. Pré-requisitos

- [ ] 0.1 Branch `feature/ingestao-treino-realizado` em `apps/menthoros-backend` (`/implement init`)
- [ ] 0.2 Confirmar no dataset de `TsbRecalculoEquivalenciaIT`: treinos `CANCELADO` e FIT com `metodoCalculoTss = DISPOSITIVO` (D3.1 e D8 mudam o esperado para esses; registrar o delta antes de implementar)
- [ ] 0.3 Deixar nota em `first-party-ingestion-architecture/proposal.md` ("Relação"): `WorkoutImportService` deve terminar em `registrar`
- [ ] 0.4 Baseline da métrica de sucesso: contar chamadas a `recalcularHistoricoCompleto` nos últimos 30 dias (logs de produção) e registrar no proposal

## Bloco 1 — seam, verdade única, fontes externas

### 1. Treino que conta

- [ ] 1.1 `TreinoRealizadoRepository.findQueContamByAtletaIdAndDataTreino(atletaId, data)` excluindo `CANCELADO`; teste de repositório (IT) com um cancelado no dia
- [ ] 1.2 `TsbServiceImpl.buscarTreinosDia` passa a usar a consulta de 1.1; `TsbServiceImplSemanticaTest` ajustado

### 2. `TsbService.recalcularDesde` (D13)

- [ ] 2.1 IT vermelho: treino registrado em D-3 com métricas materializadas até hoje → CTL/ATL/TSB de D-3..hoje mudam consistentemente — CA6b
- [ ] 2.2 `TsbService.recalcularDesde(atletaId, data)`: loop dia a dia até o último `MetricasDiarias` materializado (ou hoje), `atualizarMetaDados` só no último; reusa `atualizarTsbDia(…, false)`
- [ ] 2.3 Validação: `./mvnw clean test`

### 3. Módulo `IngestaoTreinoRealizadoService` (TDD, IT sobre `AbstractIntegrationTest`)

- [ ] 3.1 Interface em `services/` com `registrar` e `reprocessar` + javadoc com as invariantes do design (ordem, entidade nova/gerenciada, erros, TX, tenant)
- [ ] 3.2 IT vermelho: `registrar` parametrizado por `FonteDados` (FIT com e sem TSS de dispositivo, STRAVA, INTERVALS_ICU, MANUAL) — CA1, CA3, CA4, CA10
- [ ] 3.3 IT vermelho: entidade nova com `externalId` existente (CA2) e entidade gerenciada após merge (CA2b)
- [ ] 3.4 IT vermelho: `dataTreino` nulo — CA8; falha na carga reverte o treino — CA9
- [ ] 3.5 Implementação `registrar`: `tssCalculado` (D3.1) → `saveIdempotent` (absorver `TreinoDedupHelper`, visibilidade de pacote) → evento se inseriu → `recalcularDesde(dataTreino)`
- [ ] 3.6 IT vermelho: `reprocessar` — laps adicionados (CA5), data mudou (CA6), cancelado (CA7), id inexistente → `DomainNotFoundException`
- [ ] 3.7 Implementação `reprocessar`: recarrega por id → `tssCalculado` se conta e não é DISPOSITIVO → `recalcularDesde(min(data anterior, atual))`
- [ ] 3.8 Validação: `./mvnw clean test`

### 4. `tssCalculado` como única verdade

- [ ] 4.1 `TsbServiceImpl.calcularTssDia` passa a somar `tssCalculado` dos treinos que contam; fallback temporário "nulo → calcular" com `log.warn` e TODO referenciando a task 8.2
- [ ] 4.2 `recalcularHistoricoCompleto` preenche `tssCalculado` em cada treino que conta antes de recalcular o dia, preservando DISPOSITIVO — CA12
- [ ] 4.3 `TsbRecalculoEquivalenciaIT` verde contra o dataset de referência (com o delta da 0.2)
- [ ] 4.4 Validação: `./mvnw clean test`

### 5. Migrar FIT, intervals.icu e Strava sync

- [ ] 5.1 `FitTreinoPersister` chama `registrar` com o treino já carregando o TSS de dispositivo quando houver; remove o cálculo local, evento e `atualizarTsbDia`; `FitTreinoPersisterTest` mocka o ingestor e perde os asserts migrados
- [ ] 5.2 `IntervalsIcuActivityPersister` idem (`IntervalsIcuActivityPersisterTest`)
- [ ] 5.3 `StravaActivityServiceImpl`: mantém o find-or-new + merge e chama `registrar` com a entidade gerenciada (`:172`) e no enriquecimento (`:270`); remove `atualizarTsbDia` privado e o `saveIdempotent` direto; corrigir a dupla atribuição de `statusSincronizacao` (`:384`/`:391`) só se bloquear o teste — senão follow-up do candidato 4
- [ ] 5.4 Guard de idade em `WorkoutAnalysisListener` (`workout-analysis.max-idade-dias`, `@ConfigurationProperties` + `@Validated`); teste do guard
- [ ] 5.5 Medir em stage o custo de `recalcularDesde` na carga inicial Strava de um atleta com 90 dias; registrar no proposal (Open Question do pre-mortem #1)
- [ ] 5.6 Validação: `./mvnw clean test`

### 6. Entrega do Bloco 1

- [ ] 6.1 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer) sem achado Crítico — atenção a tenant (CA10) e atomicidade (CA9)
- [ ] 6.2 Rodar `recalcularHistoricoCompleto` em stage; query de verificação: zero treinos que contam com `tssCalculado` nulo
- [ ] 6.3 `/pr ingestao-treino-realizado` (PR 1 de 2) com changelog para o treinador (cancelados saem do PMC; TSS de dispositivo passa a valer no PMC; agregadores fora do TSB só no PR 2)

## Bloco 2 — gestos de alteração e limpeza (só após merge do Bloco 1)

### 7. Migrar os caminhos manuais e de alteração

- [ ] 7.1 `lancarTreino`, `registrarTreinoManualAtleta`, `addTreino`: resolver default de data **uma vez** com `Clock` (injetar em `TreinoServiceImpl`), depois `registrar`; `addTreino` passa a publicar evento
- [ ] 7.2 Apagar `TreinoServiceImpl.atualizarVolumeDiario` e `atualizarTsb` — CA11; testes de `TreinoServiceImpl` que assertavam o `+1` incremental são removidos (descrevem o bug)
- [ ] 7.3 `updateTreino` → `reprocessar` (data antiga capturada antes do save para a menor data afetada)
- [ ] 7.4 `ManualReconciliationServiceImpl` (3 pontos) → `reprocessar`
- [ ] 7.5 `IntervalsIcuLapsBackfillPersister` → `reprocessar` após gravar etapas
- [ ] 7.6 `StravaWebhookServiceImpl.markAsCanceled` → `reprocessar`
- [ ] 7.7 "Treino que conta" nos agregadores (D8, CA7b): `CoachDashboardServiceImpl:143`, `TreinoServiceImpl:474`, `RaceProjectionServiceImpl:184`, `PlanoTreinoPromptBuilder:439,466`, `VariabilidadePromptFormatter:279,303,529`, `InjuryRiskEvaluator:65`, `PlannerShadowService:202` — preferencialmente pelo predicado nas consultas de repositório que eles usam; teste por leitor com um cancelado no período
- [ ] 7.8 Validação: `./mvnw clean test`

### 8. Fechar o seam

- [ ] 8.1 Teste de arquitetura: `TsbService.atualizarTsbDia`/`recalcularDesde` e `TssCalculatorService.calcularTss` só são chamados de `IngestaoTreinoRealizadoServiceImpl` (ArchUnit se disponível; senão teste com grep em `src/main`)
- [ ] 8.2 Remover o fallback "nulo → calcular" de 4.1 (backfill já rodou em produção)
- [ ] 8.3 `TreinoDedupHelper` sem `public`; `TssCalculatorService.calcularTssDia` removido ou privado
- [ ] 8.4 Validação: `./mvnw clean test`

### 9. Entrega do Bloco 2

- [ ] 9.1 `/qa` sem achado Crítico
- [ ] 9.2 `/pr ingestao-treino-realizado` (PR 2 de 2)
- [ ] 9.3 Atualizar `tasks.md`; `/done ingestao-treino-realizado` (archive + SPRINTS)
