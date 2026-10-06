# Tasks — refine-athlete-workout-analysis-card

Repo: `apps/menthoros-front` (`npm run lint && npm run build && npm run test:run`). Branch
`refactor/refine-athlete-workout-analysis-card`. UI: <https://claude.ai/artifact/52uq835bTThybo2x4xUSjY>
(ignorar o chip de veredito e o controle "Cenário" — fora de escopo).

## 1. Tokens

- [x] 1.1 Adicionar `aiHighlight = { bg, border }` em `src/theme/theme.premium.ts` com os valores do
      proposal e exportar pelo mesmo caminho que `WorkoutAnalysisCard` já importa (`theme/tokens`).
- [x] 1.2 Validação: `npm run lint && npm run build` + checar manualmente (ou com ferramenta de
      contraste tipo DevTools/axe) que o texto sobre `aiHighlight.bg` mantém contraste ≥ 4.5:1
      (critério de aceite 8).

## 2. View model

- [x] 2.1 (TDD) `buildWorkoutAnalysisView`: expor a linha de métricas e a linha de plano (nula
      quando nada difere do planejado).
- [x] 2.2 (TDD) `valueColor` do RPE só em alerta quando informado > esperado.
- [x] 2.3 Validação: `npm run test:run`.

## 3. WorkoutAnalysisCard

- [x] 3.1 (TDD) Trocar o grid de stats pela linha única em mono + linha de plano condicional.
- [x] 3.2 (TDD) Estado `pending`: uma frase + duas barras, sem caixa aninhada.
- [x] 3.3 (TDD) Estado `done`: contêiner `ai-highlight` com `reconhecimento`, `comoFoi` e
      `proximoTreino` sempre visíveis; remover o realce próprio de "Para o próximo treino" (ele
      passa a herdar o destaque do contêiner).
- [x] 3.4 (TDD) "Ver análise completa" / "Ver menos" (`<button>`, `aria-expanded`) controlando só
      `esforco`; `proximoTreino` nunca fica atrás do toggle; rodapé mantido.
- [x] 3.5 Validação: `npm run lint && npm run test:run`.

## 4. Home e demais consumidores

- [x] 4.1 (TDD) `TodayCompletedCard`: omitir o subtítulo de duração/RPE quando `analysisView` existe.
- [x] 4.2 Conferir visualmente `WorkoutDetailDrawer`, `PostWorkoutFeedbackCard` e
      `FitUploadResultCard` (fluxo de importação `.fit`) com o card novo. Verificação por código +
      suite automatizada (sem sessão de browser com login Keycloak nesta execução): os três só
      fazem `<WorkoutAnalysisCard view={analysisView} />` sem seção duplicada de métricas — herdam
      o layout novo automaticamente. `WorkoutDetailDrawer` mantém seu próprio chip de RPE separado,
      de propósito (proposal: "o item 2 é específico da Home").
- [x] 4.3 Validação: `npm run lint && npm run test:run`.

## 5. Fechamento

- [ ] 5.1 Ajustar `tests/e2e/athlete/workout-analysis.spec.ts` ao novo layout, cobrindo também o
      fluxo de importação `.fit` que renderiza `WorkoutAnalysisCard` via `FitUploadResultCard`.
- [ ] 5.2 Validação final: `npm run lint && npm run build && npm run test:run` + E2E.
