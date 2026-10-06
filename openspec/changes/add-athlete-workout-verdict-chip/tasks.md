# Tasks — add-athlete-workout-verdict-chip

Repos: `apps/menthoros-backend` (`./mvnw clean verify`) e `apps/menthoros-front`
(`npm run lint && npm run build && npm run test:run`; E2E obrigatória). Branch
`feat/add-athlete-workout-verdict-chip` nos dois repos. Design: `design.md`.
UI: `ui/board-chip-dentro-do-plano.png` e `ui/board-chip-esforco-acima.png` (ler as duas antes da
task 4).

## 0. Premissas

- [x] 0.1 Limiares (±15%, RPE +2), precedência e rótulos confirmados no gate DoR de 2026-10-06
      (ver proposal.md Open Questions).
- [x] 0.2 `spec-reviewer` e `/codex:adversarial-review` executados no gate DoR de 2026-10-06;
      achados do Codex (precedência de desvio misto, dado incompleto) incorporados em `design.md` D2.
- [x] 0.3 `refine-athlete-workout-analysis-card` mergeada em `develop` (PR #149, commit `0800691`) —
      confirmado antes do `/implement init`.

## 1. Backend — regra

- [x] 1.1 (TDD) `WorkoutPlanVerdict` + `WorkoutPlanVerdictCalculator` cobrindo os cenários do spec,
      bordas de 85%/115%, campos ausentes e planejado zero.
- [ ] 1.2 `WorkoutAnalysisProperties.verdict` (`toleranciaPct`, `deltaRpe`) com validação.
- [ ] 1.3 Validação: `./mvnw clean test`.

## 2. Backend — contrato

- [ ] 2.1 (TDD) Campo `veredito` no `AthleteWorkoutAnalysisOutputDto`; preencher em `dtoPendente` e
      `dtoCompleto`; `@Schema` no OpenAPI.
- [ ] 2.2 Métrica `atleta_treino_veredito_total{veredito}` junto da primeira visualização.
- [ ] 2.3 Validação: `./mvnw clean verify`.

## 3. Front — dados

- [ ] 3.1 Tipo `WorkoutPlanVerdict` e campo opcional em `AthleteWorkoutAnalysis`.
- [ ] 3.2 (TDD) `buildWorkoutAnalysisView`: `verdict` (`label`, `tone`) ou `null`.
- [ ] 3.3 Validação: `npm run lint && npm run test:run`.

## 4. Front — UI

- [ ] 4.1 (TDD) `WorkoutVerdictChip` com tokens `semantic.success` / `semantic.warning`, sem hex.
- [ ] 4.2 (TDD) `TodayCompletedCard`: chip na linha do overline "Treino feito".
- [ ] 4.3 (TDD) `WorkoutAnalysisCard`: chip no cabeçalho, omitido quando embutido na Home.
- [ ] 4.4 Conferir `WorkoutDetailDrawer` e `PostWorkoutFeedbackCard`.
- [ ] 4.5 Comparar a Home com as duas capturas de `ui/`.
- [ ] 4.6 Validação: `npm run lint && npm run test:run`.

## 5. Fechamento

- [ ] 5.1 E2E `tests/e2e/athlete/workout-analysis.spec.ts`: chip presente com análise pendente.
- [ ] 5.2 Validação final: `./mvnw clean verify` e `npm run lint && npm run build && npm run test:run` + E2E.
