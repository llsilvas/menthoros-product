# Tasks — add-athlete-home-workout-analysis

Repo: `apps/menthoros-front`, branch `feat/add-athlete-home-workout-analysis`. Validação padrão:
`npm run lint && npm run build` (+ `npm run test:run` nas tasks que tocam componente).

## 1. Drawer de análise para a Home

- [ ] 1.1 Novo `TodayWorkoutAnalysisDrawer.tsx` (`features/athlete/components/`): recebe
      `realizadoId: string | null`, `open: boolean`, `onClose`; usa `useAthleteWorkoutAnalysis` +
      `buildWorkoutAnalysisView` + `WorkoutAnalysisCard`, com os mesmos estados pending/done/empty/
      error do `WorkoutDetailDrawer`.
      *verify:* `npm run lint && npm run build`

## 2. Tornar o card da Home clicável

- [ ] 2.1 `TodayCompletedCard.tsx`: ganha `onClick`/área clicável (cursor pointer, affordance
      visual mínima), sem mudar o conteúdo já exibido.
- [ ] 2.2 `AthleteHomePage.tsx`: estado local para abrir/fechar o drawer; passa
      `home.realizadoHoje.id` como `realizadoId`.
      *verify:* `npm run lint && npm run build`

## 3. Testes e fechamento

- [ ] 3.1 `TodayWorkoutAnalysisDrawer.test.tsx`: cobre pending/done/empty/error.
- [ ] 3.2 `TodayCompletedCard.test.tsx` e/ou `AthleteHomePage.test.tsx`: clicar no card abre o
      drawer com o `realizadoId` certo; fechar não re-busca a Home.
- [ ] 3.3 `npm run lint && npm run build && npm run test:run`.
