# Tasks — add-athlete-home-workout-analysis

Repo: `apps/menthoros-front`, branch `feat/add-athlete-home-workout-analysis`. Validação padrão:
`npm run lint && npm run build` (+ `npm run test:run` nas tasks que tocam componente).

## 1. Teaser e drawer de análise

- [x] 1.1 Novo `WorkoutAnalysisTeaser.tsx` (`features/athlete/components/`): card compacto estilo
      "Athlete Intelligence" (ícone + insight de uma linha + seta), clicável (mouse/toque/teclado).
      Reusa `SparkleIcon` exportado de `WorkoutAnalysisCard`.
- [x] 1.2 `TodayWorkoutAnalysisDrawer.tsx`: simplificado para receber `view: WorkoutAnalysisView |
      null` já calculado (sem fetch próprio) — evita buscar a análise duas vezes.
      *verify:* `npm run lint && npm run build`
- [x] 1.3 **Fix pós-relato do founder** ("não vejo nada na Home, mas vejo ao clicar no card do
      plano"): dois bugs. (a) o fallback de prévia do teaser retornava `null` quando a análise
      `done` não tinha texto narrativo, mesmo com `stats` disponíveis — agora cai para um resumo
      das stats e, por último, para uma chamada genérica; nunca fica vazio. (b)
      `useAthleteWorkoutAnalysis` só era acionado quando `feedbackRegistradoEm` existia
      (estado `FEITO`) — mas análise pode estar pronta antes do "Como foi?" ser respondido (treino
      sincronizado ou `.fit`); o teaser agora também aparece em `FEITO_SEM_FEEDBACK`. Confirmado com
      o backend que `realizadoHoje.id` (Home) e `treinoRealizadoId` (Agenda) são o mesmo
      `TreinoRealizado.id` — não era divergência de id.
      *verify:* `npm run lint && npm run build`

## 2. ~~Tornar o card da Home clicável~~ — revertido

- [x] 2.1 Primeira tentativa: `TodayCompletedCard` virou `<button>` nativo
      (`component="button"`). **Revertido** — visual quebrado reportado pelo founder. O card volta
      a ser 100% estático, sem `onClick`.
- [x] 2.2 `AthleteHomePage.tsx`: `useAthleteWorkoutAnalysis(realizado.id)` sobe para a página,
      acionado sempre que `realizadoHoje` existe (ver 1.3 — não gateado por `feedbackRegistradoEm`);
      resultado compartilhado entre o teaser e o drawer via `workoutAnalysisView`.
      *verify:* `npm run lint && npm run build`

## 3. Testes e fechamento

- [x] 3.1 `WorkoutAnalysisTeaser.test.tsx`: pending/done com reconhecimento/done com fallback para
      comoFoi/done com fallback para resumo de stats/done sem nada (chamada genérica)/clique
      mouse/clique teclado.
- [x] 3.2 `TodayWorkoutAnalysisDrawer.test.tsx`: reescrito para o novo contrato (`view` em vez de
      `realizadoId`) — pending/done/null/fechar.
- [x] 3.3 `TodayCompletedCard.test.tsx`: revertido para a versão sem `onClick`.
- [x] 3.4 `AthleteHomePage.test.tsx`: cobre teaser ausente sem análise pronta, teaser presente em
      `FEITO_SEM_FEEDBACK` (fix 1.3b) e fluxo completo (teaser visível → clique → drawer com
      `WorkoutAnalysisCard`).
- [x] 3.5 `npm run lint && npm run build && npm run test:run` — 232 arquivos, 1965 testes
      passando.
