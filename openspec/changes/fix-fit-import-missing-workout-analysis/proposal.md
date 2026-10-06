**Tamanho:** XS · **Trilha:** Fast

# fix-fit-import-missing-workout-analysis

## Por que

O atleta reportou que a análise de IA do treino não aparece na tela após o treino. Investigação no
`apps/menthoros-front` confirmou um bug de wiring no fluxo de **importação de arquivo `.fit`**:

- Em `ManualTrainingFormPage.tsx`, o resultado do registro manual é guardado em `treinoRegistrado`,
  e o resultado da importação `.fit` é guardado em **`treinoImportado`** — dois estados distintos.
- `useAthleteWorkoutAnalysis` (hook que busca a análise via `GET
  /api/v1/atletas/me/realizados/{id}/analise`) é acionado **apenas** com `treinoRegistrado?.id`
  (`ManualTrainingFormPage.tsx:38`).
- `FitUploadResultCard` — exibido quando há `treinoImportado` — não usa esse hook nem renderiza
  `WorkoutAnalysisCard` em lugar nenhum.

Resultado: um treino registrado via **formulário manual** aciona a análise normalmente; um treino
**importado de `.fit`** nunca aciona a busca, e o hook fica preso em `idle` — a análise nunca é
exibida nesse caminho, mesmo quando o backend a gera com sucesso.

(Fora desta change: se a análise também não aparecer no fluxo manual, a causa é backend —
elegibilidade/kill switch/`maxIdadeDias` — fora do escopo do frontend.)

## O que muda

- `ManualTrainingFormPage.tsx`: deriva um único `realizadoId` (`treinoRegistrado?.id ??
  treinoImportado?.id ?? null`) e passa para `useAthleteWorkoutAnalysis`, cobrindo os dois fluxos.
- `FitUploadResultCard`: ganha a mesma prop `analysisView` que `PostWorkoutFeedbackCard` já tem, e
  renderiza `WorkoutAnalysisCard` quando presente — mesmo padrão já usado no card do fluxo manual.

## Fora de escopo

- Qualquer causa backend (elegibilidade, kill switch, `maxIdadeDias`, listener assíncrono) — fica
  para investigação separada se o fluxo manual também estiver afetado.
- RPE (`percepcaoEsforco`) não é coletado no upload de `.fit`; se a elegibilidade do backend exigir
  esse campo, o card seguirá mostrando `empty` (sem análise) por design — não é regressão desta
  change, é limite de dados já existente no fluxo de importação.
- `WorkoutDetailDrawer.tsx` (já cobre análise corretamente, não é afetado).

## Critérios de aceite

1. Given um atleta importa um treino via `.fit` com RPE elegível no backend, When a análise retorna
   `COMPLETED`, Then o `WorkoutAnalysisCard` aparece no `FitUploadResultCard`, igual ao que já
   acontece no registro manual.
2. Given a análise ainda está `PENDING`, When o card é exibido, Then mostra o estado "Analisando…"
   (mesmo comportamento do fluxo manual).
3. Given a análise retorna 204 (`empty`) ou erro, When o card é exibido, Then não quebra a tela —
   apenas omite o bloco de análise, como já ocorre hoje no fluxo manual.
4. `npm run lint && npm run build` passam sem erros novos.

## Métrica de sucesso

Atleta que importa treino via `.fit` passa a ver a mesma análise de IA que já via ao registrar
manualmente — paridade entre os dois fluxos de registro de treino.

## Open Questions & Assumptions

- **Assumido:** o comportamento desejado é paridade total com `PostWorkoutFeedbackCard` (mesmos
  estados: pending/done/empty/error tratados da mesma forma).
- **Aberto:** se o founder também reportar ausência de análise no fluxo manual, é sinal de causa
  backend — precisa de investigação separada (fora desta change).
