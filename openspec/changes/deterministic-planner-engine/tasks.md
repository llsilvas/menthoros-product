# Tasks — deterministic-planner-engine (parte 1/2: motor em shadow + nucleo de dominio)

> Backend-only. Ordem: fundacao do nucleo (1) -> motor (2-4) -> compliance como dominio (5) -> golden set (6) -> shadow (7).
> Validacao: `./mvnw clean test` a cada etapa; golden set em CI.
> **Sem dependencia de change ativa** — o shadow engancha em `PlanoServiceImpl`, fora do escopo das changes-irmas. Enforcement fica em `planner-engine-enforcement`.

## 1. Fundacao do nucleo `domain/` + contratos

- [ ] 1.1 Criar pacotes `domain/planner` e `domain/compliance` e o teste `DomainBoundaryArchTest` (ArchUnit, dependencia test-scope nova — aprovada 2026-07-14): `domain/..` nao importa `entity/..`, `repository/..`, `org.springframework.web`, `org.springframework.ai`, `jakarta.persistence`. **verify:** teste passa com os pacotes vazios e reprova um import proibido plantado temporariamente.
- [ ] 1.2 Criar `TrainingPhase` enum em `domain/planner` (BASE, BUILD, **CALIBRATION** — reservada, nao emitida por esta change, ver design.md Decisao 2 —, PEAK, TAPER, RACE_WEEK, RECOVERY, RETURN_TO_TRAINING, POST_RACE).
- [ ] 1.3 Criar records em `domain/planner`: `WeeklyLoadTarget`, `SessionSlot`, `InjuryRiskAssessment`, `ConstraintValidationResult`, `WeekPlanSkeleton`.
- [ ] 1.4 Criar `OnboardingContext` + sub-records minimos `AthleteBaseline` (`ctlEstimado`, `dataEstimativa`), `PlanningPolicy` (`reviewMode`, `maxProgressionAllowed`, `explanationRequired`), `AthleteConstraints` — formas reservadas para `athlete-onboarding-baseline` popular (design.md Decisao 2); tratado como `Optional<OnboardingContext>` no planner.
- [ ] 1.5 Criar `PlannerInputSnapshot` (anti-corruption layer) a partir de `DadosPlanoDto + DecisaoProgressao + Optional<OnboardingContext> + referenceDate` (design.md Decisao 17 — `referenceDate` explicito, nunca `LocalDate.now()` interno); mapper entity->record fica na camada de service, fora do dominio.
- [ ] 1.6 Criar em `domain/compliance`: `PlannerComplianceStatus`, `PlannerViolation` (record proprio `key`+`mensagem`, **sem** estender `ConstraintKey`/`PlanQualityChecker` — design.md Decisao 4), `PlannerAuditMetadata`, `PlannerVersion` constante versionada.
- [ ] 1.7 Migration `V54__Add_planner_metadata_to_plano_semanal.sql` (confirmar que `V53` continua sendo a ultima) com colunas nullable (`planner_enabled`, `planner_version`, `planner_phase`, `planner_requires_coach_review`, `planner_skeleton_hash`, `planner_compliance_status`, `planner_metadata_json`).
- [ ] 1.8 Atualizar entidade `PlanoSemanal` para os campos de auditoria (nao expor ao atleta por default).
- [ ] 1.9 **verify:** `./mvnw -q compile` + `DomainBoundaryArchTest` verde.

## 2. Periodizacao + alvo de carga + taper

- [ ] 2.1 TDD: `PeriodizationPlannerTest` — prova-alvo explicita (`isProvaAlvo`), selecao propria sem alvo (mais proxima por data, desempate por distancia — design.md Decisao 7), prova preparatoria na semana, BASE_FITNESS sem prova, RACE_WEEK e POST_RACE. **verify:** testes vermelhos.
- [ ] 2.2 Implementar `PeriodizationPlanner` em `domain/planner`: logica de fase propria (informada pelas regras hoje em `PeriodizacaoPromptFormatter`, que **nao e tocado** — design.md Decisao 12) + selecao de prova propria sobre `List` de dados de prova (records, nao entity) — **nao chama** `buscarProximaProva`/`getProximaProva`. **verify:** `./mvnw -Dtest=PeriodizationPlannerTest test` verde.
- [ ] 2.3 TDD: `LoadTargetResolverTest` — fase + taper + `DecisaoProgressao`; `REDUZIR` nunca aumenta carga; `MANTER` nao usa todo teto; historico insuficiente -> alvo conservador; **CA1** rampa CTL nunca > 8 pontos/semana (CTL 40 base); **CA2** 4a semana consecutiva cai 15-25% (step-back). **verify:** testes vermelhos.
- [ ] 2.4 Implementar `LoadTargetResolver` — consome `DecisaoProgressao` e resolve `WeeklyLoadTarget` nos limites de fase/taper/risco; nao duplica `ProgressaoTreinoService`. **verify:** `./mvnw -Dtest=LoadTargetResolverTest test` verde.
- [ ] 2.5 TDD: `TaperStrategyTest` — duracao por distancia, curva de reducao, RACE_WEEK terminal. **verify:** testes vermelhos.
- [ ] 2.6 Implementar `TaperStrategy` — reducao exponencial de TSS mantendo zonas de intensidade nos `SessionSlot`. **verify:** `./mvnw -Dtest=TaperStrategyTest test` verde.

## 3. Prevencao de lesoes + validacao de constraints

- [ ] 3.1 TDD: `InjuryRiskEvaluatorTest` — faixas de TSB (seguro >-10 / WARNING -10 a -30 / HIGH_RISK <-30 — design.md Decisao 15), monotonia, lesao ativa forcando RECOVERY. **verify:** testes vermelhos.
- [ ] 3.2 Implementar `InjuryRiskEvaluator` — risco por TSB de `ProgressaoHistoricoResumo.tsbAtual` (**sem** ACWR/`AthleteLoadHistory`); monotonia local (janela 7d de `tssCalculado` agregado por dia, dados chegam via snapshot — sem repository no dominio). **verify:** `./mvnw -Dtest=InjuryRiskEvaluatorTest test` verde.
- [ ] 3.3 TDD: `InjuryPolicyResolverTest` — `temLesao=true` -> RECOVERY/review; `dataUltimaLesao` recente -> RETURN_TO_TRAINING; descricao sem flag -> review sem NLP (design.md Decisao 14). **verify:** testes vermelhos -> verdes com `InjuryPolicyResolver` implementado (janela via parametro, default 30 vindo de config na camada de service).
- [ ] 3.4 TDD: `ConstraintValidatorTest` — violacao de dias, max sessoes, duracao, equipamento. **verify:** testes vermelhos.
- [ ] 3.5 Implementar `ConstraintValidator` — constraints do `OnboardingContext` (ou do snapshot legado), valida contra `WeeklyLoadTarget`. **verify:** `./mvnw -Dtest=ConstraintValidatorTest test` verde.

## 4. Integracao — PlannerEngine.planWeek()

- [ ] 4.1 TDD: `PlannerEngineTest` — fluxo completo `PlannerInputSnapshot -> WeekPlanSkeleton`. Cobrir FULL_CONTEXT, LEGACY_CONTEXT, fallback conservador com historico insuficiente, `requiresCoachReview=true` (TSB baixo, lesao), e determinismo: mesmo `referenceDate` + inputs -> mesmo skeleton, independente do relogio (CA17). **verify:** testes vermelhos.
- [ ] 4.2 Implementar `PlannerEngine.planWeek(PlannerInputSnapshot)` — **nunca chama `LocalDate.now()`**; orquestra os 5 subcomponentes; `ProgressaoTreinoService` permanece fora, fornecendo `DecisaoProgressao`. **verify:** `./mvnw -Dtest=PlannerEngineTest test` verde.
- [ ] 4.3 Escopo running-first: TDD `PlannerScopeTest` — modalidade non-running registra `plannerScope=RUNNING_FIRST` no metadata e usa TSS agregado como guardrail. **verify:** verde.

## 5. SkeletonComplianceChecker (logica de dominio, sem wiring)

- [ ] 5.1 TDD: `SkeletonComplianceCheckerTest` — `checkPreRedistribution`: violacao de fase, sessionCount, TSS +-10%, longo acima do teto, excesso de intensidade, sessao pesada 48-72h antes de prova (posicao gerada), constraint dura. `checkPostRedistribution`: dia indisponivel, sessao pesada perto de prova apos reposicionamento, taper violado. **verify:** testes vermelhos.
- [ ] 5.2 Implementar `SkeletonComplianceChecker` em `domain/compliance` retornando `List<PlannerViolation>`. Puro — sem excecao de dominio, sem Micrometer dentro do nucleo (metricas ficam no caller). **verify:** `./mvnw -Dtest=SkeletonComplianceCheckerTest test` verde. **Nota:** wiring de retry/enforcement fica em `planner-engine-enforcement`; aqui o checker so e consumido pelo shadow (secao 7).

## 6. Golden set deterministico

- [ ] 6.1 Criar 30-50 casos em `PlannerEngineGoldenSetTest` — historico + calendario de prova + constraints -> `WeekPlanSkeleton` esperado exato (nao LLM-graded).
- [ ] 6.2 Cobrir: periodizacao completa (BASE->BUILD->PEAK->TAPER), step-back, TSB nas 3 faixas, lesao ativa, lesao recente, cold start, multi-prova (alvo explicito + desempate por distancia), BASE_FITNESS, 1 atleta multisport com guardrail conservador.
- [ ] 6.3 **verify:** `./mvnw -Dtest=PlannerEngineGoldenSetTest test` — 100% verde; regressao bloqueante de merge.

## 7. Shadow mode + auditoria + metricas

- [ ] 7.1 Config: `planner-engine.shadow=false` (default) e `planner-engine.injury.recent-window-days=30` em `application.yml`. (Flags `enabled`/`fail-open` NAO existem nesta change.)
- [ ] 7.2 TDD: `PlannerShadowIntegrationTest` — com `shadow=true`, apos a geracao legada: skeleton calculado, compliance hipotetico rodado (pre sobre o DTO do LLM, pos sobre treinos redistribuidos), auditoria V54 persistida com `planner_enabled=false`; prompt/plano/persistencia do treino identicos ao pipeline legado (CA12). **verify:** testes vermelhos.
- [ ] 7.3 Implementar integracao shadow em `PlanoServiceImpl` (mapper entity->snapshot na camada de service) conforme design.md Decisao 10. **verify:** testes de 7.2 verdes.
- [ ] 7.4 Isolamento de erro: TDD — excecao plantada no planner com `shadow=true` -> geracao conclui, log + `planner.shadow.error.count` incrementa, nenhum erro ao coach (CA11); em lote, job conclui sem erro individual causado pelo shadow. **verify:** verde (incluir caso em `BatchPlanProcessorTest`).
- [ ] 7.5 Metricas Micrometer (`planner.generated.count`, `planner.requires_coach_review.count`, `planner.compliance.hypothetical_failure.count`, `planner.shadow.error.count`, `planner.phase.divergence.count`) — a divergencia compara `skeleton.phase()` com a fase do `PeriodizacaoPromptFormatter` (CA16, design.md Decisao 12). **verify:** teste com `SimpleMeterRegistry`.
- [ ] 7.6 **verify:** com `shadow=false` (default), `./mvnw clean test` — BUILD SUCCESS, zero regressao, zero codigo novo executado no fluxo de geracao.
- [ ] 7.7 **verify:** com `shadow=true`, `./mvnw clean test` — BUILD SUCCESS, golden set e integracao verdes.

## 8. DoD

- [ ] 8.1 CA1-CA17 verificados em teste automatizado (golden set + ArchUnit + integracao shadow).
- [ ] 8.2 `progressao-treinos` mantida como change concluida; esta documentada como extensao dela.
- [ ] 8.3 Doc: `planner-rules.yml` stub com thresholds como comentario (placeholder para extracao futura com dado do shadow).
- [ ] 8.4 PR backend aberto; CI verde. Sem frontend.
