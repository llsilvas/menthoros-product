# Tasks — deterministic-planner-engine

> Backend-only. Ordem: contratos (1) -> nucleo (2-3) -> integracao (4) -> compliance (5) -> golden set (6) -> feature flag (7).
> Validacao: `./mvnw clean test` a cada etapa; golden set em CI.

## 1. Contratos e modelo de dominio

- [ ] 1.1 Criar `TrainingPhase` enum (BASE, BUILD, PEAK, TAPER, RACE_WEEK, RECOVERY, RETURN_TO_TRAINING, POST_RACE) em `enums/`.
- [ ] 1.2 Criar records: `WeeklyLoadTarget`, `SessionSlot`, `InjuryRiskAssessment`, `ConstraintValidationResult`, `WeekPlanSkeleton` em `dto/planner/`.
- [ ] 1.3 Criar `OnboardingContext` record em `dto/planner/` (campo `AthleteConstraints` como sub-record) e tratar como `Optional<OnboardingContext>` no planner.
- [ ] 1.4 Criar `PlannerInputSnapshot` interno (anti-corruption layer) a partir de `DadosPlanoDto + DecisaoProgressao + Optional<OnboardingContext>`; nao expor como DTO publico nem substituir `DadosPlanoDto`.
- [ ] 1.5 Criar enums/records de auditoria: `PlannerComplianceStatus`, `PlannerAuditMetadata`, `PlannerViolation` (ou reuso explicito de `ViolacaoQualidade`) e `PlannerVersion` constante versionada.
- [ ] 1.6 Migration `Vxx__Add_planner_metadata_to_plano_semanal.sql` com colunas nullable (`planner_enabled`, `planner_version`, `planner_phase`, `planner_requires_coach_review`, `planner_skeleton_hash`, `planner_compliance_status`, `planner_metadata_json`).
- [ ] 1.7 Atualizar entidade `PlanoSemanal` + mapper/output se necessario para persistir auditoria (nao expor campos tecnicos ao atleta por default).
- [ ] 1.8 **verify:** `./mvnw -q compile` — todos os novos tipos compilam.

## 2. Planejador de periodizacao + resolucao de alvo de carga

- [ ] 2.1 TDD: `PeriodizationPlannerTest` — cobrir prova-alvo explicita (`isProvaAlvo`), prova preparatoria dentro da semana, BASE_FITNESS sem prova, RACE_WEEK e POST_RACE. **verify:** testes vermelhos.
- [ ] 2.2 Implementar `PeriodizationPlanner` extraindo/reusando a logica hoje em `PeriodizacaoPromptFormatter`/`PlanoServiceImpl.buscarProximaProva`: prova-alvo explicita vence, preparatoria na semana vira constraint estrutural. **verify:** `./mvnw -Dtest=PeriodizationPlannerTest test` verde.
- [ ] 2.3 TDD: `LoadTargetResolverTest` — cobrir combinacao de fase + taper + `DecisaoProgressao`; `REDUZIR` nunca aumenta carga; `MANTER` nao usa todo teto fisiologico; historico insuficiente gera alvo conservador. **verify:** testes vermelhos.
- [ ] 2.4 Implementar `LoadTargetResolver` — consome `DecisaoProgressao` ja calculada e resolve `WeeklyLoadTarget` dentro dos limites de fase/taper/risco; nao duplicar `ProgressaoTreinoService`. **verify:** `./mvnw -Dtest=LoadTargetResolverTest test` verde.
- [ ] 2.5 TDD: `TaperStrategyTest` — cobrir duracao de taper por distancia, curva de reducao, RACE_WEEK como estado terminal. **verify:** testes vermelhos.
- [ ] 2.6 Implementar `TaperStrategy` — reducao exponencial de TSS mantendo zonas de intensidade nos `SessionSlot`. **verify:** `./mvnw -Dtest=TaperStrategyTest test` verde.

## 3. Prevencao de lesoes + validacao de constraints

- [ ] 3.1 TDD: `InjuryRiskEvaluatorTest` — cobrir faixas de ACWR (seguro/WARNING/HIGH_RISK), monotonia, lesao ativa forcando RECOVERY. **verify:** testes vermelhos.
- [ ] 3.2 Implementar `InjuryRiskEvaluator` — ACWR sobre `AthleteLoadHistory`, monotonia (media/desvio-padrao), strain composto. **verify:** `./mvnw -Dtest=InjuryRiskEvaluatorTest test` verde.
- [ ] 3.3 TDD: `ConstraintValidatorTest` — cobrir violacao de dias, max sessoes, duracao, equipamento. **verify:** testes vermelhos.
- [ ] 3.4 Implementar `ConstraintValidator` — extrai constraints do `OnboardingContext` (ou do `Atleta` para legados), valida contra `WeeklyLoadTarget`. **verify:** `./mvnw -Dtest=ConstraintValidatorTest test` verde.

## 4. Integracao — PlannerEngine.planWeek()

- [ ] 4.1 TDD: `PlannerEngineTest` — fluxo completo `DadosPlanoDto + DecisaoProgressao + Optional<OnboardingContext> -> WeekPlanSkeleton`. Cobrir FULL_CONTEXT, LEGACY_CONTEXT, fallback conservador com historico insuficiente, `requiresCoachReview = true` (ACWR alto, lesao). **verify:** testes vermelhos.
- [ ] 4.2 Implementar `PlannerEngine` — orquestra PeriodizationPlanner + LoadTargetResolver + TaperStrategy + InjuryRiskEvaluator + ConstraintValidator; `ProgressaoTreinoService` permanece fora, fornecendo `DecisaoProgressao`. **verify:** `./mvnw -Dtest=PlannerEngineTest test` verde.
- [ ] 4.3 Integrar `PlannerEngine` no `PlanoServiceImpl` — chamada condicional (`planner-engine.enabled`), `WeekPlanSkeleton` adicionado ao contexto do prompt. **verify:** `./mvnw -Dtest=PlanoServiceImplTest test` verde.

## 5. SkeletonComplianceChecker + resilience

- [ ] 5.1 TDD: `SkeletonComplianceCheckerTest` — cobrir violacao de fase, sessionCount, TSS +-10%, dia indisponivel, longo acima do teto, excesso de intensidade, treino pesado 48-72h antes de prova, taper violado e constraint dura. **verify:** testes vermelhos.
- [ ] 5.2 Implementar `SkeletonComplianceChecker` reutilizando o padrao de `PlanQualityChecker` (`ViolacaoQualidade`/violacoes tipadas + Micrometer). **verify:** `./mvnw -Dtest=SkeletonComplianceCheckerTest test` verde.
- [ ] 5.3 Integrar no pipeline pos-LLM — se `planner-engine.enabled` e compliance falha, acionar `PlanoResilienceService` com feedback estruturado; nao criar mecanismo paralelo de retry. **verify:** teste de integracao cobrindo retry.
- [ ] 5.4 Rodar compliance final apos redistribuicao (`obterTreinosParaPlano`/`redistribuicaoHelper`) e persistir `planner_compliance_status` (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`) + `planner_skeleton_hash` no `PlanoSemanal`. **verify:** teste de persistencia + teste de redistribuicao que cria/corrige violacao.
- [ ] 5.5 **verify:** `./mvnw -Dtest=SkeletonComplianceCheckerTest,PlanoServiceImplTest test` verde.

## 6. Golden set deterministico

- [ ] 6.1 Criar 30-50 casos em `PlannerEngineGoldenSetTest` — historico de atleta + calendario de prova + constraints -> `WeekPlanSkeleton` esperado exato (nao LLM-graded).
- [ ] 6.2 Golden set cobre: todos os cenarios de periodizacao (BASE->BUILD->PEAK->TAPER), step-back, ACWR nas 3 faixas, lesao ativa, cold start, multi-prova, BASE_FITNESS.
- [ ] 6.3 **verify:** `./mvnw -Dtest=PlannerEngineGoldenSetTest test` — 100% verde; regressao em qualquer caso e bloqueante de merge.

## 7. Feature flag e verificacao final

- [ ] 7.1 Adicionar flags/config em `application.yml`: `planner-engine.enabled=false`, `planner-engine.shadow=false`, `planner-engine.fail-open=true`, `planner-engine.injury.recent-window-days=30`.
- [ ] 7.2 **verify:** com flag `false`, `./mvnw clean test` — BUILD SUCCESS, zero regressao na suite completa.
- [ ] 7.3 **verify:** com flag `true`, `./mvnw clean test` — BUILD SUCCESS, golden set passa.
- [ ] 7.4 PR backend aberto; CI verde. Sem frontend.

## 8. Auditoria, observabilidade e batch

- [ ] 8.1 TDD: `PlannerAuditMetadataTest` — hash estavel do skeleton, metadata sem prompt/dado sensivel bruto, serializacao JSONB compacta. **verify:** testes vermelhos.
- [ ] 8.2 Implementar persistencia de auditoria em `PlanoSemanal` no mesmo fluxo de `persistirPlanoCompleto`; se fallback legado ocorrer, registrar `planner_enabled=false` ou `compliance_status=FALLBACK`. **verify:** teste de repository/servico.
- [ ] 8.3 Instrumentar metricas Micrometer: `planner.generated.count`, `planner.requires_coach_review.count`, `planner.compliance.failure.count`, `planner.fallback_legacy.count`, `planner.retry.count`. **verify:** teste com `SimpleMeterRegistry`.
- [ ] 8.4 Batch generation: garantir que falha de planner/compliance em um atleta vira erro individual sanitizado no `BatchPlanJob` e nao aborta o lote. **verify:** `BatchPlanProcessorTest` com um atleta falhando compliance e outro gerando plano.
- [ ] 8.5 Feature flags: `planner-engine.enabled=false`, `planner-engine.fail-open=true` default inicial. **verify:** testes flag off, flag on pass, flag on fail-open fallback.

## 9. Shadow mode, lesao recente e escopo running-first

- [ ] 9.1 TDD: `PlannerShadowModeTest` — com `shadow=true`, planner calcula skeleton/metricas mas nao altera prompt nem plano persistido. **verify:** testes vermelhos -> verdes.
- [ ] 9.2 Implementar shadow mode sem segunda chamada ao LLM: calcular skeleton e compliance hipotetico sobre o plano legado gerado, registrar metricas/logs, sem enforcement. **verify:** `./mvnw -Dtest=PlannerShadowModeTest test`.
- [ ] 9.3 TDD: `InjuryPolicyResolverTest` — `temLesao=true` -> RECOVERY/review; `dataUltimaLesao` recente -> RETURN_TO_TRAINING; descricao sem flag -> review sem NLP. **verify:** testes vermelhos -> verdes.
- [ ] 9.4 Implementar `InjuryPolicyResolver` com propriedade `planner-engine.injury.recent-window-days` default 30. **verify:** `./mvnw -Dtest=InjuryPolicyResolverTest test`.
- [ ] 9.5 TDD: `PlannerScopeTest` — modalidade non-running registra `plannerScope=RUNNING_FIRST` e usa TSS agregado apenas como guardrail. **verify:** testes vermelhos -> verdes.
- [ ] 9.6 Documentar non-goal multisport/triathlon completo no metadata e golden set. **verify:** golden set inclui 1 atleta multisport com fallback conservador.

## 10. DoD

- [ ] 10.1 CA1-CA18 verificados em teste automatizado (golden set cobre todos).
- [ ] 10.2 `progressao-treinos` mantido como change concluida; `deterministic-planner-engine` documentado como extensao dela.
- [ ] 10.3 Doc: `planner-rules.yml` stub com thresholds como comentario (placeholder para extracao futura).
