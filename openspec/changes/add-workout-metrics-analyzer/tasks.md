## Pré-requisitos
- [ ] 0.1 Confirmar a existência (ou criar) de `first-party-ingestion-architecture`: `CompletedWorkout`, `WorkoutImportService`, `WorkoutImportedEvent`, caminho de import. Se ausente, recortar o escopo para a camada determinística com um modelo mínimo de `CompletedWorkout`.
- [ ] 0.2 Mapear o que `WorkoutAnalysisListener` faz hoje e decidir reconciliação (refactor vs. substituição) — registrar no `design.md`.
- [ ] 0.3 Branch `feature/add-workout-metrics-analyzer` em `apps/menthoros-backend` (`/implement init`).

## 1. Zonas por atleta (determinístico, TDD)
- [ ] 1.1 `AthleteZoneProfile` (record) com `zoneFor(bpm)` via `NavigableMap.floorEntry`; fábrica `fromLthr`.
- [ ] 1.2 Teste: bordas de zona (BVA), bpm abaixo de Z1, sem perfil → fallback definido.
- [ ] 1.3 `AthleteZoneRepository.profileFor(athleteId)` lendo LTHR/HRmax do perfil.

## 2. WorkoutMetricsCalculator (determinístico, TDD, <50ms)
- [ ] 2.1 `computeZoneTime` — acumula tempo por zona com peso = gap até a próxima amostra; última amostra = 1s.
- [ ] 2.2 `computeDecoupling` — EF por metade; null se < 60 amostras úteis; arredonda 1 casa.
- [ ] 2.3 `output(sample, sport)` — speed (run) / power com fallback speed (bike).
- [ ] 2.4 Testes (Gherkin do design): distribuição de zona; decoupling ~6% → flag; sinal insuficiente → null.
- [ ] 2.5 `enrich()` integra no fluxo de import (in-transaction); medir < 50ms.

## 3. Skill workout-analyzer (narrativa sobre fatos)
- [ ] 3.1 `skills/workout-analyzer/SKILL.md` versionado (role, input determinístico EN, output PT-BR, regras de flag).
- [ ] 3.2 `WorkoutAnalyzerSkill` — `renderFacts()` (bloco determinístico em inglês), roteamento Haiku, `maxTokens` baixo, `temperature` baixa.
- [ ] 3.3 `WorkoutAnalysis.proposal(...)` em estado `PENDING` + `AnalysisFlag` (ex.: `HIGH_DECOUPLING > 5%`).
- [ ] 3.4 Persistência (`tb_workout_analysis` se necessário) — migration Flyway conforme padrão.
- [ ] 3.5 Teste: análise persiste `PENDING`, não exposta ao atleta; roteamento HAIKU; output PT-BR com termos técnicos em EN.

## 4. Wiring assíncrono
- [ ] 4.1 `WorkoutImportedEvent` + `@TransactionalEventListener(AFTER_COMMIT)` `@Async` → `analyze(workoutId)`.
- [ ] 4.2 Reconciliar/remover o caminho duplicado do `WorkoutAnalysisListener`.
- [ ] 4.3 Confirmar entrada no loop `PENDING → ACCEPTED/MODIFIED/REJECTED` (cockpit do treinador).

## 5. Validação final
- [ ] 5.1 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer) sem achado Crítico.
- [ ] 5.2 `./mvnw clean test` verde; cálculo determinístico coberto por branch.
- [ ] 5.3 Atualizar `tasks.md`; `/ship` (merge + archive + SPRINTS).
