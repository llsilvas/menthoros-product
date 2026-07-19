# Tasks — deterministic-planner-engine (parte 1/2: motor em shadow + nucleo de dominio)

> Backend-only. Ordem: fundacao do nucleo (1) -> motor (2-4) -> compliance como dominio (5) -> golden set (6) -> shadow (7).
> Validacao: `./mvnw clean test` a cada etapa; golden set em CI.
> **Sem dependencia de change ativa** — o shadow engancha em `PlanoServiceImpl`, fora do escopo das changes-irmas. Enforcement fica em `planner-engine-enforcement`.

## 1. Fundacao do nucleo `domain/` + contratos

- [x] 1.1 Criar pacotes `domain/planner` e `domain/compliance` e o teste `DomainBoundaryArchTest` (ArchUnit, dependencia test-scope nova — aprovada 2026-07-14): `domain/..` nao importa `entity/..`, `repository/..`, `org.springframework.web`, `org.springframework.ai`, `jakarta.persistence`. **verify:** teste passa com os pacotes vazios e reprova um import proibido plantado temporariamente.
- [x] 1.2 Criar `TrainingPhase` enum em `domain/planner` (BASE, BUILD, **CALIBRATION** — reservada, nao emitida por esta change, ver design.md Decisao 2 —, PEAK, TAPER, RACE_WEEK, RECOVERY, RETURN_TO_TRAINING, POST_RACE).
- [x] 1.3 Criar records em `domain/planner`: `WeeklyLoadTarget`, `SessionSlot`, `InjuryRiskAssessment`, `ConstraintValidationResult`, `WeekPlanSkeleton`.
- [x] 1.4 Criar `OnboardingContext` + sub-records minimos `AthleteBaseline` (`ctlEstimado`, `dataEstimativa`), `PlanningPolicy` (`reviewMode`, `maxProgressionAllowed`, `explanationRequired`), `AthleteConstraints` — formas reservadas para `athlete-onboarding-baseline` popular (design.md Decisao 2); tratado como `Optional<OnboardingContext>` no planner.
- [x] 1.5 Criar `PlannerInputSnapshot` (anti-corruption layer) a partir de `DadosPlanoDto + DecisaoProgressao + Optional<OnboardingContext> + referenceDate` (design.md Decisao 17 — `referenceDate` explicito, nunca `LocalDate.now()` interno); mapper entity->record fica na camada de service, fora do dominio.
- [x] 1.6 Criar em `domain/compliance`: `PlannerComplianceStatus`, `PlannerViolation` (record proprio `key`+`mensagem`, **sem** estender `ConstraintKey`/`PlanQualityChecker` — design.md Decisao 4), `PlannerAuditMetadata`, `PlannerVersion` constante versionada.
- [x] 1.7 Migration `V58__Add_planner_metadata_to_plano_semanal.sql` (confirmar que `V57` continua sendo a ultima antes de criar — numero pode ter avancado) com colunas nullable (`planner_enabled`, `planner_version`, `planner_phase`, `planner_requires_coach_review`, `planner_skeleton_hash`, `planner_compliance_status`, `planner_metadata_json`).
- [x] 1.8 Atualizar entidade `PlanoSemanal` para os campos de auditoria (nao expor ao atleta por default).
- [x] 1.9 **verify:** `./mvnw -q compile` + `DomainBoundaryArchTest` verde.

## 2. Periodizacao + alvo de carga + taper

- [x] 2.1 TDD: `PeriodizationPlannerTest` — prova-alvo explicita (`isProvaAlvo`), selecao propria sem alvo (mais proxima por data, desempate por distancia — design.md Decisao 7), prova preparatoria na semana, BASE_FITNESS sem prova, RACE_WEEK e POST_RACE. **verify:** testes vermelhos.
- [x] 2.2 Implementar `PeriodizationPlanner` em `domain/planner`: logica de fase propria (informada pelas regras hoje em `PeriodizacaoPromptFormatter`, que **nao e tocado** — design.md Decisao 12) + selecao de prova propria sobre `List` de dados de prova (records, nao entity) — **nao chama** `buscarProximaProva`/`getProximaProva`. **verify:** `./mvnw -Dtest=PeriodizationPlannerTest test` verde.
- [x] 2.3 TDD: `LoadTargetResolverTest` — fase + taper + `DecisaoProgressao`; `REDUZIR` nunca aumenta carga; `MANTER` nao usa todo teto; historico insuficiente -> alvo conservador; **CA1** rampa CTL nunca > 8 pontos/semana (CTL 40 base); **CA2** 4a semana consecutiva cai 15-25% (step-back). **verify:** testes vermelhos.
- [x] 2.4 Implementar `LoadTargetResolver` — consome `DecisaoProgressao` e resolve `WeeklyLoadTarget` nos limites de fase/taper/risco; nao duplica `ProgressaoTreinoService`. **verify:** `./mvnw -Dtest=LoadTargetResolverTest test` verde.
- [x] 2.5 TDD: `TaperStrategyTest` — duracao por distancia, curva de reducao, RACE_WEEK terminal. **verify:** testes vermelhos.
- [x] 2.6 Implementar `TaperStrategy` — reducao exponencial de TSS mantendo zonas de intensidade nos `SessionSlot`. **verify:** `./mvnw -Dtest=TaperStrategyTest test` verde.

## 3. Prevencao de lesoes + validacao de constraints

- [x] 3.1 TDD: `InjuryRiskEvaluatorTest` — faixas de TSB (seguro >-10 / WARNING -10 a -30 / HIGH_RISK <-30 — design.md Decisao 15), monotonia, lesao ativa forcando RECOVERY. **verify:** testes vermelhos.
- [x] 3.2 Implementar `InjuryRiskEvaluator` — risco por TSB de `ProgressaoHistoricoResumo.tsbAtual` (**sem** ACWR/`AthleteLoadHistory`); monotonia local (janela 7d de `tssCalculado` agregado por dia, dados chegam via snapshot — sem repository no dominio). **verify:** `./mvnw -Dtest=InjuryRiskEvaluatorTest test` verde.
- [x] 3.3 TDD: `InjuryPolicyResolverTest` — `temLesao=true` -> RECOVERY/review; `dataUltimaLesao` recente -> RETURN_TO_TRAINING; descricao sem flag -> review sem NLP (design.md Decisao 14). **verify:** testes vermelhos -> verdes com `InjuryPolicyResolver` implementado (janela via parametro, default 30 vindo de config na camada de service).
- [x] 3.4 TDD: `ConstraintValidatorTest` — violacao de dias, max sessoes, duracao, equipamento. **verify:** testes vermelhos.
- [x] 3.5 Implementar `ConstraintValidator` — constraints do `OnboardingContext` (ou do snapshot legado), valida contra `List<SessionSlot>` do skeleton candidato (desvio deliberado do texto original "valida contra WeeklyLoadTarget": as 4 dimensoes pedidas — dia/max-sessoes/duracao/equipamento — sao por-sessao, nao expressaveis so no agregado). **verify:** `./mvnw -Dtest=ConstraintValidatorTest test` verde.

## 4. Integracao — PlannerEngine.planWeek()

- [x] 4.1 TDD: `PlannerEngineTest` — fluxo completo `PlannerInputSnapshot -> WeekPlanSkeleton`. Cobrir FULL_CONTEXT, LEGACY_CONTEXT, fallback conservador com historico insuficiente, `requiresCoachReview=true` (TSB baixo, lesao), e determinismo: mesmo `referenceDate` + inputs -> mesmo skeleton, independente do relogio (CA17). **verify:** testes vermelhos.
- [x] 4.2 Implementar `PlannerEngine.planWeek(PlannerInputSnapshot)` — **nunca chama `LocalDate.now()`**; orquestra os 6 subcomponentes (5 do sketch original + `InjuryPolicyResolver`, que a Decisao 14 exige como colaborador proprio); `ProgressaoTreinoService` permanece fora, fornecendo `DecisaoProgressao`. **verify:** `./mvnw -Dtest=PlannerEngineTest test` verde.
- [x] 4.3 Escopo running-first: TDD `PlannerScopeTest` — modalidade non-running registra `plannerScope=RUNNING_FIRST` no metadata e usa TSS agregado como guardrail. **verify:** verde.

## 5. SkeletonComplianceChecker (logica de dominio, sem wiring)

- [x] 5.1 TDD: `SkeletonComplianceCheckerTest` — `checkPreRedistribution`: violacao de fase, sessionCount, TSS +-10%, longo acima do teto, excesso de intensidade, sessao pesada 48-72h antes de prova (posicao gerada), constraint dura. `checkPostRedistribution`: dia indisponivel, sessao pesada perto de prova apos reposicionamento, taper violado. **verify:** testes vermelhos.
- [x] 5.2 Implementar `SkeletonComplianceChecker` em `domain/compliance` retornando `List<PlannerViolation>`. Puro — sem excecao de dominio, sem Micrometer dentro do nucleo (metricas ficam no caller). Assinatura estendida com `ComplianceContext` (prova determinante + constraints + referenceDate) alem de `(plano, skeleton)` — necessario para os checks de prova/constraints que o sketch original de 2 argumentos nao cobria. `GeneratedPlanSnapshot`/`GeneratedSessionSnapshot` novos em `domain/compliance` representam o plano do LLM (pre e pos-redistribuicao). **verify:** `./mvnw -Dtest=SkeletonComplianceCheckerTest test` verde. **Nota:** wiring de retry/enforcement fica em `planner-engine-enforcement`; aqui o checker so e consumido pelo shadow (secao 7).

## 6. Golden set deterministico

- [x] 6.1 Criar 30-50 casos em `PlannerEngineGoldenSetTest` — historico + calendario de prova + constraints -> `WeekPlanSkeleton` esperado exato (nao LLM-graded). 37 casos (32 parametrizados + 5 dedicados); asserta fase, requiresCoachReview, plannerScope e injuryRisk().level() exatos por caso.
- [x] 6.2 Cobrir: periodizacao completa (BASE->BUILD->PEAK->TAPER->RACE_WEEK->POST_RACE, incluindo limites exatos de transicao), step-back, TSB nas 3 faixas, lesao ativa, lesao recente, cold start, multi-prova (alvo explicito + desempate por distancia), BASE_FITNESS, 1 atleta multisport com guardrail conservador, monotonia, descricao de lesao nao estruturada, prova preparatoria na semana, REDUZIR/MANTER/PROGREDIR_LEVE.
- [x] 6.3 **verify:** `./mvnw -Dtest=PlannerEngineGoldenSetTest test` — 100% verde (37/37); regressao bloqueante de merge.

## 7. Shadow mode + auditoria + metricas

- [x] 7.1 Config: `planner-engine.shadow=false` (default) e `planner-engine.injury.recent-window-days=30` em `application.yml`. (Flags `enabled`/`fail-open` NAO existem nesta change.)
- [x] 7.2 `PlannerShadowServiceTest` (nome final — o wiring de `PlanoServiceImpl` e `PlannerShadowService` foi desenhado e implementado junto, dada a superficie de mapeamento entity->record; nao houve fase vermelha isolada como nas secoes 1-6, mas a suite cobre exaustivamente): com `shadow=true`, apos a geracao legada: skeleton calculado, compliance hipotetico rodado (pre sobre o DTO do LLM, pos sobre treinos redistribuidos), auditoria persistida com `planner_enabled=false`; treinos redistribuidos nao mutados (CA12). **verify:** 8 testes verdes.
- [x] 7.3 Implementada integracao shadow em `PlanoServiceImpl` (novo `PlannerShadowService` em `services/helper/`, mapper entity->snapshot dentro dele) conforme design.md Decisao 10 — chamada entre `criarPlanoComTreinos` e `salvarPlanoCompleto` (mutacao in-memory, persistida no mesmo save). Achado durante a integracao: `PlannerEngine` e seus 6 colaboradores + `SkeletonComplianceChecker` nao tinham `@Service`/`@Component` — o sketch do design.md ja indicava "registrado no Spring" mas a anotacao nunca foi adicionada nas secoes 1-5; corrigido aqui (bloqueava o boot real da aplicacao). **verify:** testes de 7.2 verdes; `PlanoServiceImplTest`/`PlanoServiceTenantTest` atualizados com o novo mock, 19 testes verdes.
- [x] 7.4 Isolamento de erro: `PlannerShadowServiceTest` cobre excecao plantada (`ProgressaoTreinoService` lancando) -> `planner.shadow.error.count` incrementa, `planner_enabled=false` ainda persistido, nada propaga (CA11). Caso em `BatchPlanProcessorTest` avaliado e descartado conscientemente: `BatchPlanProcessor` so enxerga `PlanoService` mockado na interface — um erro de shadow nunca aparece la como algo diferente de um retorno bem-sucedido normal (shadow nunca lanca), entao nao ha comportamento novo a testar nesse nivel alem do que o unit test ja prova. **verify:** verde.
- [x] 7.5 Metricas Micrometer (`planner.generated.count`, `planner.requires_coach_review.count`, `planner.compliance.hypothetical_failure.count`, `planner.shadow.error.count`, `planner.phase.divergence.count`) — a divergencia compara `skeleton.phase()` com a fase do `PeriodizacaoPromptFormatter` (CA16, design.md Decisao 12), com selecao de prova legada replicada de forma minima (so por data) para espelhar o comportamento real do formatter. **verify:** `SimpleMeterRegistry`, 8 testes verdes cobrindo as 5 metricas.
- [x] 7.6 **verify:** com `shadow=false` (default), `./mvnw clean test` — 1909/1915 verdes; os 6 restantes (`CoreSecurityConfigTest`, `OpenApiConfigTest`) falham por `.env` local do desenvolvedor apontar `POSTGRES_DB` para um IP de LAN inacessivel nesta rede — confirmado ambiental (nao regressao) apontando para o Postgres local via Docker, que passa limpo; `.env` restaurado ao original sem alteracao permanente. Zero codigo novo do planner executado no fluxo (`ShadowDesabilitado` — `meterRegistry.getMeters()` vazio).
- [x] 7.7 **verify:** com `shadow=true` — `PlannerShadowServiceTest` (real `PlannerEngine`+`SkeletonComplianceChecker`, shadow habilitado via construtor) 8/8 verdes; golden set (`PlannerEngineGoldenSetTest`) 37/37 verdes, independente do flag (exercita o dominio direto).

## 8. DoD

- [x] 8.1 CA1-CA17 verificados em teste automatizado (golden set + ArchUnit + integracao shadow). Mapeamento CA -> teste (129 testes, 0 falhas):
      CA1 `LoadTargetResolverTest`/golden · CA2 `LoadTargetResolverTest`/golden · CA3 `InjuryRiskEvaluatorTest`/golden ·
      CA4 `InjuryPolicyResolverTest`/golden · CA5 `TaperStrategyTest` · CA6 `PlannerEngineTest` (LEGACY_CONTEXT) ·
      CA7 `PlannerEngineGoldenSetTest` (37 casos) · CA8 `LoadTargetResolverTest` (REDUZIR nunca aumenta) ·
      CA9 `PeriodizationPlannerTest`/golden (multi-prova) · CA10-12 `PlannerShadowServiceTest` ·
      CA13 `PlannerScopeTest` · CA14 `InjuryPolicyResolverTest` · CA15 `DomainBoundaryArchTest` ·
      CA16 `PlannerShadowServiceTest` (divergencia) · CA17 `PlannerEngineTest` (determinismo).
- [x] 8.2 `progressao-treinos` confirmada arquivada em `changes/archive/2026-07/2026-07-08-progressao-treinos/`; proposal.md (linha 22) documenta esta change como extensao, nao substituicao, do `ProgressaoTreinoService`.
- [x] 8.3 Doc: `planner-rules.yml` criado em `apps/menthoros-backend/src/main/resources/` — inventario comentado de todos os thresholds hoje hardcoded (LoadTargetResolver, TaperStrategy, InjuryRiskEvaluator, PeriodizationPlanner, SkeletonComplianceChecker), com tag `# CA<n>` nos ancorados em criterio de aceite. Nao carregado pela aplicacao — placeholder para extracao futura com dado do shadow.
- [x] 8.4 PR backend aberto: https://github.com/llsilvas/menthoros-backend/pull/46 — aguardando CI. Sem frontend.
