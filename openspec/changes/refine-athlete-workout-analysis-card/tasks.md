# Tasks — refine-athlete-workout-analysis-card

Repo: `apps/menthoros-front` (`npm run lint && npm run build && npm run test:run`). Branch
`feature/refine-athlete-workout-analysis-card`. UI: <https://claude.ai/artifact/52uq835bTThybo2x4xUSjY>
(ignorar o chip de veredito e o controle "Cenário" — fora de escopo).

## 1. Tokens

- [ ] 1.1 Adicionar `aiHighlight = { bg, border }` em `src/theme/theme.premium.ts` com os valores do
      proposal e exportar pelo mesmo caminho que `WorkoutAnalysisCard` já importa (`theme/tokens`).
- [ ] 1.2 Validação: `npm run lint && npm run build`.

## 2. View model

- [ ] 2.1 (TDD) `buildWorkoutAnalysisView`: expor a linha de métricas e a linha de plano (nula
      quando nada difere do planejado).
- [ ] 2.2 (TDD) `valueColor` do RPE só em alerta quando informado > esperado.
- [ ] 2.3 Validação: `npm run test:run`.

## 3. WorkoutAnalysisCard

- [ ] 3.1 (TDD) Trocar o grid de stats pela linha única em mono + linha de plano condicional.
- [ ] 3.2 (TDD) Estado `pending`: uma frase + duas barras, sem caixa aninhada.
- [ ] 3.3 (TDD) Estado `done`: contêiner `ai-highlight` com `reconhecimento` e `comoFoi`; remover o
      realce de "Para o próximo treino".
- [ ] 3.4 (TDD) "Ver análise completa" / "Ver menos" (`<button>`, `aria-expanded`) controlando
      `esforco` e `proximoTreino`; rodapé mantido.
- [ ] 3.5 Validação: `npm run lint && npm run test:run`.

## 4. Home

- [ ] 4.1 (TDD) `TodayCompletedCard`: omitir o subtítulo de duração/RPE quando `analysisView` existe.
- [ ] 4.2 Conferir visualmente `WorkoutDetailDrawer` e `PostWorkoutFeedbackCard` com o card novo.
- [ ] 4.3 Validação: `npm run lint && npm run test:run`.

## 5. Fechamento

- [ ] 5.1 Ajustar `tests/e2e/athlete/workout-analysis.spec.ts` ao novo layout.
- [ ] 5.2 Validação final: `npm run lint && npm run build && npm run test:run` + E2E.
