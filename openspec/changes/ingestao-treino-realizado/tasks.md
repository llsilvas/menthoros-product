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

- [ ] 1.1 `TreinoRealizadoRepository.findQueContamByAtletaIdAndDataTreino(atletaId, data)` com `statusSincronizacao IS NULL OR statusSincronizacao <> CANCELADO`; IT com um cancelado e um NULL no mesmo dia — o NULL conta, o cancelado não (DoR Codex #1)
  verify: IT vermelho→verde; asserta que o NULL aparece na lista e o `CANCELADO` não
- [ ] 1.2 `TsbServiceImpl.buscarTreinosDia` passa a usar a consulta de 1.1; `TsbServiceImplSemanticaTest` ajustado
  verify: `./mvnw test -Dtest=TsbServiceImplSemanticaTest` verde

### 2. `TsbService.recalcularDesde` (D13)

- [ ] 2.1 IT vermelho: treino registrado em D-3 com métricas materializadas até hoje → CTL/ATL/TSB de D-3..hoje mudam consistentemente — CA6b
  verify: teste falha (método `recalcularDesde` ainda não existe/compila)
- [ ] 2.2 `TsbService.recalcularDesde(atletaId, data)`: loop dia a dia até o último `MetricasDiarias` materializado (ou hoje), `atualizarMetaDados` só no último; reusa `atualizarTsbDia(…, false)`
  verify: IT de 2.1 vira verde (CA6b)
- [ ] 2.3 Validação: `./mvnw clean test`

### 3. Módulo `IngestaoTreinoRealizadoService` (TDD, IT sobre `AbstractIntegrationTest`)

- [ ] 3.1 Interface em `services/` com `registrar(treino, externalId?)` e `reprocessar(treinoId, dataAnterior?)` + javadoc com as invariantes do design (ordem, entidade nova/gerenciada, erros, TX, tenant)
  verify: compila; javadoc cobre ordem, TX, tenant, erro (revisão manual contra design.md "Interface do módulo")
- [ ] 3.2 IT vermelho: `registrar` parametrizado por `FonteDados` (FIT com e sem TSS de dispositivo, STRAVA, INTERVALS_ICU, MANUAL) — CA1, CA3, CA4, CA10
  verify: `@ParameterizedTest` com 5 casos, todos vermelhos (sem implementação ainda)
- [ ] 3.3 IT vermelho: entidade nova com `externalId` existente (CA2) e entidade gerenciada após merge (CA2b)
  verify: dois testes vermelhos, cada um cobrindo CA2 e CA2b isoladamente
- [ ] 3.4 IT vermelho: `dataTreino` nulo — CA8; falha na carga reverte o treino — CA9
  verify: CA8 assert `DomainRuleViolationException`; CA9 assert que o `findById` depois do erro devolve vazio
- [ ] 3.5 Implementação `registrar`: `tssCalculado` (D3.1) → `saveIdempotent` (absorver `TreinoDedupHelper`, visibilidade de pacote) → evento se inseriu → `recalcularDesde(dataTreino)`
  verify: os IT de 3.2/3.3/3.4 viram verdes
- [ ] 3.6 IT vermelho: `reprocessar` — laps adicionados sem `dataAnterior` (CA5), data mudou com `dataAnterior` preenchida (CA6, CA6b), cancelado (CA7), id inexistente → `DomainNotFoundException`
  verify: 4 testes vermelhos, um por CA
- [ ] 3.7 Implementação `reprocessar`: recarrega por id → `tssCalculado` se conta e não é DISPOSITIVO → `recalcularDesde(min(dataAnterior, treino.dataTreino))` quando `dataAnterior != null`, senão `recalcularDesde(treino.dataTreino)`
  verify: os 4 IT de 3.6 viram verdes
- [ ] 3.8 Validação: `./mvnw clean test`
  verify: build verde; nenhum teste do módulo 3 pulado

### 4. `tssCalculado` como única verdade

- [ ] 4.1 `TsbServiceImpl.calcularTssDia` passa a somar `tssCalculado` dos treinos que contam; fallback temporário "nulo → calcular" com `log.warn` e TODO referenciando a task 8.2
  verify: teste unitário com um treino `tssCalculado=null` cai no fallback e loga warn
- [ ] 4.2 `recalcularHistoricoCompleto` preenche `tssCalculado` em cada treino que conta antes de recalcular o dia, preservando DISPOSITIVO — CA12
  verify: IT com histórico misto (nulo, calculado, DISPOSITIVO) — CA12 verde, DISPOSITIVO não sobrescrito
- [ ] 4.3 `TsbRecalculoEquivalenciaIT` verde contra o dataset de referência (com o delta da 0.2)
  verify: `./mvnw test -Dtest=TsbRecalculoEquivalenciaIT` verde
- [ ] 4.4 Validação: `./mvnw clean test`
  verify: build verde

### 5. Migrar FIT, intervals.icu e Strava sync

- [ ] 5.1 `FitTreinoPersister` chama `registrar` com o treino já carregando o TSS de dispositivo quando houver; remove o cálculo local, evento e `atualizarTsbDia`; `FitTreinoPersisterTest` mocka o ingestor e perde os asserts migrados
  verify: `./mvnw test -Dtest=FitTreinoPersisterTest` verde; nenhuma chamada direta a `tsbService`/`tssCalculatorService` restando na classe (`grep -n tsbService.\|tssCalculatorService. FitTreinoPersister.java`)
- [x] 5.2 Dependência confirmada: `intervals-icu-activity-sync-scheduler` já mergeada em `develop` (commit `7fd066e`, PR #77) — contrato de `IntervalsIcuActivityPersister` estável. `IntervalsIcuActivityPersister` chama `registrar` (`IntervalsIcuActivityPersisterTest`)
  verify: `./mvnw test -Dtest=IntervalsIcuActivityPersisterTest` verde
- [ ] 5.3 `StravaActivityServiceImpl`: mantém o find-or-new + merge e chama `registrar` com a entidade gerenciada (`:172`) e no enriquecimento (`:270`); remove `atualizarTsbDia` privado e o `saveIdempotent` direto; corrigir a dupla atribuição de `statusSincronizacao` (`:384`/`:391`) só se bloquear o teste — senão follow-up do candidato 4
  verify: `./mvnw test -Dtest=StravaActivityServiceImplTest` verde (criar se não existir — pre-mortem original apontou zero testes de impl)
- [ ] 5.4 Guard de idade em `WorkoutAnalysisListener` (`workout-analysis.max-idade-dias`, `@ConfigurationProperties` + `@Validated`); teste do guard
  verify: teste com treino de idade > limite não dispara análise; `@Validated` rejeita valor `< 1` na carga da config
- [ ] 5.5 Medir em stage o custo de `recalcularDesde` na carga inicial Strava de um atleta com 90 dias; registrar no proposal (Open Question do pre-mortem #1)
  verify: número (ms/atividade ou total) registrado no proposal.md
- [ ] 5.6 Validação: `./mvnw clean test`
  verify: build verde

### 6. Entrega do Bloco 1

- [ ] 6.1 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer) sem achado Crítico — atenção a tenant (CA10) e atomicidade (CA9)
  verify: relatório do `/qa` sem item Crítico aberto
- [ ] 6.2 Dump de `tb_metricas_diarias` (backup) antes de rodar em produção; rodar `recalcularHistoricoCompleto` primeiro em stage, depois prod; query de verificação: zero treinos que contam com `tssCalculado` nulo (spec-reviewer #1)
  verify: dump salvo com timestamp; query de verificação retorna 0 em stage e em prod
- [ ] 6.2b Nota in-app na tela de PMC para tenants afetados pelo backfill ("valores históricos recalculados — treinos cancelados e TSS de dispositivo agora refletidos corretamente") (spec-reviewer / product review #2)
  verify: nota visível na tela de PMC do frontend para um tenant com backfill aplicado
- [ ] 6.3 `/pr ingestao-treino-realizado` (PR 1 de 2) com changelog para o treinador (cancelados saem do PMC; TSS de dispositivo passa a valer no PMC; agregadores fora do TSB só no PR 2)
  verify: PR aberto contra `develop`, CI verde, descrição inclui o changelog

## Bloco 2 — gestos de alteração e limpeza (só após merge do Bloco 1)

### 7. Migrar os caminhos manuais e de alteração

- [ ] 7.1 `lancarTreino`, `registrarTreinoManualAtleta`, `addTreino`: resolver default de data **uma vez** com `Clock` (injetar em `TreinoServiceImpl`), depois `registrar`; `addTreino` passa a publicar evento
  verify: teste por método confirmando `registrar` chamado uma vez com data resolvida; `addTreino` publica `TreinoRegistradoEvent`
- [ ] 7.2 Apagar `TreinoServiceImpl.atualizarVolumeDiario` e `atualizarTsb` — CA11; testes de `TreinoServiceImpl` que assertavam o `+1` incremental são removidos (descrevem o bug)
  verify: `grep -n atualizarVolumeDiario\|atualizarTsb TreinoServiceImpl.java` vazio; `metricasDiariasRepository.save` só aparece em `TsbServiceImpl`/`TsbRecalculoExecutor` (CA11)
- [ ] 7.3 `updateTreino` → ler `treino.getDataTreino()` antes de mutar/salvar, então `reprocessar(id, dataAntiga)` (`dataAntiga = null` se a data não mudou)
  verify: teste com mudança de data confirma `recalcularDesde` chamado com a menor das duas (CA6)
- [ ] 7.4 `ManualReconciliationServiceImpl` (3 pontos) → `reprocessar(id, null)`
  verify: os 3 pontos chamam `reprocessar`; teste por ponto
- [ ] 7.5 `IntervalsIcuLapsBackfillPersister` → `reprocessar(id, null)` após gravar etapas
  verify: teste confirma que `tssCalculado`/carga do dia mudam após laps adicionados (fecha CA5 no caminho real)
- [ ] 7.6 `StravaWebhookServiceImpl.markAsCanceled` → `reprocessar(id, null)`
  verify: teste confirma que a carga do dia exclui o treino após cancelamento (fecha CA7 no caminho real)
- [ ] 7.7 "Treino que conta" nos **produtores/queries** (D8, CA7b — inventário corrigido no DoR, Codex #3): `CoachDashboardServiceImpl:143`, `TreinoServiceImpl:474`, `RaceProjectionServiceImpl:184`, `InjuryRiskEvaluator:65`, e **`PlanoServiceImpl.getDadosPlano:720-724`** (`findByAtletaIdAndDataTreinoBetween` — alimenta `PlannerShadowService` e `PlanoTreinoPromptBuilder:439,466`/`VariabilidadePromptFormatter:279,303,529`; verificar se estes dois últimos leem daqui ou de query própria antes de decidir onde aplicar o predicado). Teste por query com um cancelado e um NULL no período.
- [ ] 7.8 Validação: `./mvnw clean test`
  verify: build verde

### 8. Fechar o seam

- [ ] 8.1 Teste de arquitetura: `TsbService.atualizarTsbDia`/`recalcularDesde` e `TssCalculatorService.calcularTss` só são chamados de `IngestaoTreinoRealizadoServiceImpl` (ArchUnit se disponível; senão teste com grep em `src/main`)
  verify: teste falha se um novo chamador externo for adicionado (CA11 estendido)
- [ ] 8.2 Remover o fallback "nulo → calcular" de 4.1 (backfill já rodou em produção)
  verify: query de verificação da task 6.2 ainda retorna 0 em prod antes de remover; `./mvnw clean test` verde depois
- [ ] 8.3 `TreinoDedupHelper` sem `public`; `TssCalculatorService.calcularTssDia` removido ou privado
  verify: compila sem uso externo dessas classes fora do pacote/ingestor
- [ ] 8.4 Validação: `./mvnw clean test`
  verify: build verde

### 9. Entrega do Bloco 2

- [ ] 9.1 `/qa` sem achado Crítico
  verify: relatório do `/qa` sem item Crítico aberto
- [ ] 9.2 `/pr ingestao-treino-realizado` (PR 2 de 2)
  verify: PR aberto contra `develop`, CI verde
- [ ] 9.3 Atualizar `tasks.md`; `/done ingestao-treino-realizado` (archive + SPRINTS)
  verify: change arquivada em `changes/archive/2026-08/`; `SPRINTS.md` atualizado
