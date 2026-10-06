# Tasks — fix-fit-import-missing-workout-analysis

Repo: `apps/menthoros-front`, branch `fix/fix-fit-import-missing-workout-analysis`. Validação
padrão: `npm run lint && npm run build` (+ `npm run test:run` nas tasks que tocam componente).

## 1. Unificar o id de análise entre registro manual e importação .fit

- [x] 1.1 `ManualTrainingFormPage.tsx`: derivar `realizadoId = treinoRegistrado?.id ??
      treinoImportado?.id ?? null` e passar para `useAthleteWorkoutAnalysis`.
      *verify:* `npm run lint && npm run build`

## 2. Exibir a análise no card de importação .fit

- [x] 2.1 `FitUploadResultCard.tsx`: adicionar prop `analysisView?: WorkoutAnalysisView | null`
      (mesmo tipo usado em `PostWorkoutFeedbackCard`) e renderizar `WorkoutAnalysisCard` quando
      presente.
- [x] 2.2 `ManualTrainingFormPage.tsx`: passar `analysisView` também para `FitUploadResultCard`.
      *verify:* `npm run lint && npm run build`

## 3. Testes e fechamento

- [x] 3.1 `FitUploadResultCard.test.tsx`: cobre com/sem `analysisView` (pending exibe
      `workout-analysis-card`, ausente/`null` não quebra). `ManualTrainingFormPage.test.tsx`: cobre
      que importar `.fit` aciona `useAthleteWorkoutAnalysis` com o id do treino importado e exibe o
      card de análise.
- [x] 3.2 `npm run lint && npm run build && npm run test:run` — 230 arquivos, 1955 testes passando.
