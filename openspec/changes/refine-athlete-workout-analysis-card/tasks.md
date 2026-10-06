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

- [x] 5.1 Ajustar `tests/e2e/athlete/workout-analysis.spec.ts` ao novo layout (métricas em linha
      única, linha de plano, proximoTreino sempre visível, esforco atrás do toggle, frase pending
      nova). **Fluxo `.fit` adiado nesta E2E**: não existe E2E para importação `.fit` no repo hoje
      (`tests/e2e` não tem spec de upload) — criar uma do zero (mock de upload multipart) é escopo
      maior que esta change Fast/S. Cobertura real do fluxo `.fit` com o card novo fica no teste de
      componente `FitUploadResultCard.test.tsx` ("com analysisView mostra o card da análise —
      paridade com o registro manual"), já verde. Registrar como follow-up se o founder quiser E2E
      de upload de verdade.
- [x] 5.2 Validação final: `npm run lint && npm run build && npm run test:run` + E2E.

## 6. Alinhamento com o board (`ui/README.md` + capturas)

Depois do board do founder (`ui/board-{1,2,3}-*.png` + `.html`), ajustes para fechar a distância
apontada no `ui/README.md`:

- [x] 6.1 Prop `embedded` no `WorkoutAnalysisCard`: sem `Card`/`CardHeader` em volta, usada só pelo
      `TodayCompletedCard` (Home) — sem card-em-card, como no board. `WorkoutDetailDrawer` e
      `PostWorkoutFeedbackCard` continuam com o card completo.
- [x] 6.2 Rótulo "Análise do treino" (ícone sparkle 12px) migra para dentro do `ai-highlight`, mas
      só quando `embedded` (sem duplicar com o `CardHeader` externo no modo não-embedded).
- [x] 6.3 Linha de métricas: texto secundário mono 13px/`surface[300]` (era `h6`/`surface[50]`).
- [x] 6.4 `ai-highlight`: `radius.lg` (12px, era `radius.md`/8px) e padding assimétrico
      `12px 16px 4px` (era 12px uniforme).
- [x] 6.5 Estado `pending`: frase sem itálico em 13px/`surface[400]`, `role="status"`, barras de
      skeleton 8px de altura em 92%/64% (era 10px em 92%/70%), cor `backgrounds.highest`.
- [x] 6.6 Validação: `npm run lint && npm run build && npm run test:run` + E2E.
