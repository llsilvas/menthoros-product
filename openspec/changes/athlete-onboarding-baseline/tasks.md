# Tasks — athlete-onboarding-baseline

> Cross-repo. Ordem: spec (0) -> backend (1-5) -> contrato (6) -> frontend (7-9).
> Depende de `deterministic-planner-engine` merged (consome `PlannerEngine`, `OnboardingContext`, `TrainingPhase.CALIBRATION`) — **confirmado mergeado em `develop`, 2026-07-20**.
> Validacao: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Spec (DoR)

- [x] 0.1 `specs/athlete-onboarding/spec.md` — cenarios Given/When/Then para CA1-CA13, espelhando o padrao de `deterministic-planner-engine/specs/planner-engine/spec.md`.

## 1. Activity Normalizer

- [ ] 1.1 TDD: `ActivityNormalizerTest` — cobrir normalizacao de cada campo (sport, pace, power null vs 0, rpe null), dataQuality nas 3 dimensoes, dedup entre fontes. **verify:** testes vermelhos.
- [ ] 1.2 Implementar `ActivityNormalizer` — `NormalizedActivity toCanonical(TreinoRealizado, DataSource)`, tabela de traducao de sport por conector. **verify:** `./mvnw -Dtest=ActivityNormalizerTest test` verde.
- [ ] 1.3 TDD: `ActivityDedupServiceTest` — mesma atividade em 2 fontes -> merge; atividades distintas no mesmo dia -> nao merge. **verify:** testes vermelhos.
- [ ] 1.4 Implementar `ActivityDedupService` — janela +-10min, similaridade +-5%, ordena por sourcePriority, retem descartado no historico. **verify:** `./mvnw -Dtest=ActivityDedupServiceTest test` verde.

## 2. Baseline Calculator

- [ ] 2.1 TDD: `BaselineCalculatorTest` — Cenario A (8+ semanas, baseline direto), Cenario B (4 semanas, hibrido real + extrapolacao), Cenario C (zero, heuristica). **verify:** testes vermelhos.
- [ ] 2.2 Implementar `BaselineCalculator` — reusa `TsbService` para CTL/ATL/TSB; Cen B preenche lacunas com TSS estimado (marcado ESTIMATED); Cen C usa tabela heuristica (`nivelExperiencia` x `modalidade`). **verify:** `./mvnw -Dtest=BaselineCalculatorTest test` verde.
- [ ] 2.3 Criar `AthleteBaseline` record (CTL/ATL/TSB + flags ESTIMATED/MEASURED por componente + `calculatedAt`). **verify:** compila.

## 3. Confidence Scorer

- [ ] 3.1 TDD: `ConfidenceScorerTest` — cobrir cada um dos 8 criterios, cenarios A/B/C por score, bonus coach-como-proxy. **verify:** testes vermelhos.
- [ ] 3.2 Implementar `ConfidenceScorer` — soma ponderada 0-100, normalizacao para 0.0-1.0 na borda do `OnboardingContext`. **verify:** `./mvnw -Dtest=ConfidenceScorerTest test` verde.

## 4. Calibration Phase + PlanningPolicy

- [ ] 4.1 `CALIBRATION` ja existe em `TrainingPhase` (reservado por `deterministic-planner-engine`, merged) — so criar `CalibrationStage` enum interno, sem editar o enum de fase.
- [ ] 4.2 TDD: `CalibrationServiceTest` — transicao OBSERVATION->CALIBRATION->STABILIZATION, re-baseline semanal, score bidirecional (sobe e desce), saida da calibracao (score >= 45 + sem HIGH_RISK + `percentualRealizacao` >= 70% via `MetricasAdesaoService`, design.md Decisao 5). **verify:** testes vermelhos.
- [ ] 4.3 Implementar `CalibrationService` — gerencia `CalibrationStage`, recalcula baseline e score a cada semana, emite alerta ao treinador se preso em CALIBRATION alem da semana 4. **verify:** `./mvnw -Dtest=CalibrationServiceTest test` verde.
- [ ] 4.4 TDD: `PlanningPolicyResolverTest` — derivar reviewMode/maxProgression/explanationRequired da faixa de score. **verify:** testes vermelhos.
- [ ] 4.5 Implementar `PlanningPolicyResolver` — tabela de faixas (>=75, 45-74, <45) -> `PlanningPolicy`. **verify:** `./mvnw -Dtest=PlanningPolicyResolverTest test` verde.

## 5. Integracao com fluxo de geracao de plano

- [ ] 5.1 TDD: `OnboardingServiceTest` — fluxo completo onboarding -> baseline -> score -> OnboardingContext. **verify:** testes vermelhos.
- [ ] 5.2 Implementar `OnboardingService` — orquestra ActivityNormalizer -> BaselineCalculator -> ConfidenceScorer -> OnboardingContext. **verify:** `./mvnw -Dtest=OnboardingServiceTest test` verde.
- [ ] 5.3 Integrar no `PlanoServiceImpl` — se `OnboardingContext` presente e `planner-engine.enabled`, chamar `PlannerEngine.planWeek(dados, ctx)`. **verify:** teste de integracao.
- [ ] 5.4 TDD: auto-approve Cenario A (CA5, design.md Decisao 7) — apos `criarPlanoEntity`, se `PlanningPolicy.reviewMode == EXCEPTION_ONLY`, `plano.setReviewStatus(PlanoReviewStatus.APROVADO)` em vez do `AGUARDANDO_REVISAO` padrao; para `MANDATORY_NON_BLOCKING`/`MANDATORY_BLOCKING`, mantem `AGUARDANDO_REVISAO` (comportamento ja existente, sem alteracao — CA4). **verify:** teste de integracao cobrindo os 3 `reviewMode`.
- [ ] 5.5 Badge de baixa confianca na fila de revisao do coach (Cenario B, `MANDATORY_NON_BLOCKING`) — reaproveita `listarPlanosPendentes`/`PlanoReviewServiceImpl`, sem endpoint novo. **verify:** teste de integracao.
- [ ] 5.6 `dataProva` do onboarding cria/atualiza `Prova` (CA13, design.md Decisao 8) — reaproveita o CRUD de `Prova` existente. **verify:** teste de integracao.
- [ ] 5.7 Migracao de atletas existentes — flag `onboarding.migrate-existing` que calcula baseline + score para atletas sem `AthleteBaseline`. **verify:** teste com atleta legado (dados reais do seed).

## 6. Contrato — novos tipos no front

- [ ] 6.1 Gerar referencia da API; nao sobrescrever fachada.
- [ ] 6.2 Portar `AthleteOnboardingProfile` (11 campos obrigatorios + opcionais) para `types/`.
- [ ] 6.3 Portar `CalibrationStatus` (phase, stage, weekNumber, confidenceScore) para `types/`.
- [ ] 6.4 **verify:** `npm run build`.

## 7. Frontend — Onboarding form

- [ ] 7.1 TDD: `AthleteOnboardingPageTest` — renderiza 11 campos, validacao, estado intermediario salvo/restaurado. **verify:** testes vermelhos.
- [ ] 7.2 Implementar `AthleteOnboardingPage` — formulario multi-step (perfil -> objetivo -> disponibilidade -> saude), progresso salvo como draft. **verify:** `npm run test:run`.
- [ ] 7.3 Integrar com endpoint de conclusao de onboarding — submete dados completos, recebe `AthleteBaseline` + score. **verify:** smoke manual.
- [ ] 7.4 Bonus coach-como-proxy — se usuario logado e treinador preenchendo perfil de atleta, UI mostra "Preenchendo como treinador" e envia flag `filledByCoach: true`.

## 8. Frontend — Calibracao UI

- [ ] 8.1 TDD: `CalibrationBannerTest` — renderiza por stage (OBSERVATION/CALIBRATION/STABILIZATION), mostra semana atual, progresso. **verify:** testes vermelhos.
- [ ] 8.2 Implementar `CalibrationBanner` na Home do atleta — consome endpoint de calibracao retornando `CalibrationStatus`. **verify:** `npm run test:run`.
- [ ] 8.3 TDD: `PostWorkoutFeedbackExtrasTest` — durante CALIBRATION, campos extras (dor, fadiga, sono, recuperacao) visiveis; fora de CALIBRATION, apenas RPE. **verify:** testes vermelhos.
- [ ] 8.4 Implementar extensao do `PostWorkoutFeedback` — condicional em `CalibrationStatus != null`, campos adicionais. **verify:** `npm run test:run`.
- [ ] 8.5 Notificacao/banner quando o atleta sai de CALIBRATION (design.md Decisao 5) — reaproveita o `CalibrationBanner` (8.2), sem canal novo. **verify:** `npm run test:run`.

## 9. Verificacao de aceite (DoD)

- [ ] 9.0 Acesso a dado sensivel (CA12, design.md Decisao 9) — teste de integracao confirmando que so o atleta dono e o coach responsavel leem campos de lesao/dor/fadiga/sono/recuperacao; outro coach do tenant recebe 403/404.
- [ ] 9.1 CA1-CA13 verificados ponta-a-ponta (backend + frontend).
- [ ] 9.2 Atleta legado: gerar plano para atleta do seed -> Cenario B, sem quebra.
- [ ] 9.3 Onboarding interrompido: fechar browser no step 2, reabrir -> retoma do step 2.
- [ ] 9.4 PR backend e PR front abertos (backend primeiro); CI verde nos dois.
