# Tasks — fix-fit-import-missing-workout-analysis

Repo: `apps/menthoros-front`, branch `fix/fix-fit-import-missing-workout-analysis`. Validação
padrão: `npm run lint && npm run build` (+ `npm run test:run` nas tasks que tocam componente).

## 1. Unificar o id de análise entre registro manual e importação .fit

- [ ] 1.1 `ManualTrainingFormPage.tsx`: derivar `realizadoId = treinoRegistrado?.id ??
      treinoImportado?.id ?? null` e passar para `useAthleteWorkoutAnalysis`.
      *verify:* `npm run lint && npm run build`

## 2. Exibir a análise no card de importação .fit

- [ ] 2.1 `FitUploadResultCard.tsx`: adicionar prop `analysisView?: WorkoutAnalysisView | null`
      (mesmo tipo usado em `PostWorkoutFeedbackCard`) e renderizar `WorkoutAnalysisCard` quando
      presente.
- [ ] 2.2 `ManualTrainingFormPage.tsx`: passar `analysisView` também para `FitUploadResultCard`.
      *verify:* `npm run lint && npm run build`

## 3. Testes e fechamento

- [ ] 3.1 Teste de `ManualTrainingFormPage` (ou do componente afetado) cobrindo: análise aparece no
      card de importação `.fit` quando o hook retorna `done`/`pending`, e o card não quebra em
      `empty`/`error`.
- [ ] 3.2 `npm run lint && npm run build && npm run test:run`.
