**Tamanho:** S · **Trilha:** Fast

# add-athlete-home-workout-analysis

## Por que

Investigando o relato "a análise do treino com IA não aparece na tela do atleta após o treino",
confirmamos que a **Home do atleta nunca teve essa integração** — não é regressão, é gap de escopo:
a change original `analise-ia-treino-atleta` (arquivada em 2026-08-31) cobriu três telas por
desenho (`WorkoutDetailDrawer` na Agenda, `WeekAgendaRow`, `PostWorkoutFeedbackCard` na tela de
registro) e a Home nunca entrou nos critérios de aceite nem no `tasks.md`.

Fluxo real hoje: o atleta registra o treino (manual ou `.fit`) e vê a análise na própria tela de
registro; ao voltar para a Home (`TodayCompletedCard`, estado `FEITO`), o card mostra tipo, duração,
RPE e comentário — **sem análise, e sem ser clicável**. A análise só reaparece se o atleta for até a
Agenda e abrir o dia concluído. Para a maioria dos atletas, que não revisita a Agenda no mesmo dia,
a análise efetivamente "some" depois da tela de registro.

## O que muda

- **`TodayCompletedCard` permanece estático** (sem clique) — uma primeira versão tentou tornar o
  card inteiro num `<button>`, mas o resultado visual não ficou bom e foi revertido.
- Novo componente `WorkoutAnalysisTeaser`: card compacto, separado, no estilo "Athlete
  Intelligence" da Strava — ícone de IA + insight de uma linha (prévia do `reconhecimento`/`comoFoi`,
  com fallback para um resumo das `stats` ou uma chamada genérica quando não há texto narrativo) +
  seta — aparece logo abaixo do `TodayCompletedCard`/`TodayFeedbackCard` quando há análise
  `pending`/`done` disponível.
- Novo componente leve `TodayWorkoutAnalysisDrawer` (bottom sheet, mesmo padrão visual do
  `WorkoutDetailDrawer`), acionado pelo clique no teaser, que exibe `WorkoutAnalysisCard`.
- `useAthleteWorkoutAnalysis(realizado.id)` sobe para `AthleteHomePage` e é acionado **sempre que
  existe `realizadoHoje`** — independente de `feedbackRegistradoEm` (o "Como foi?" da Home já ter
  sido respondido). Um treino sincronizado (Strava/Intervals.icu) ou importado de `.fit` pode ter
  análise pronta no backend antes desse feedback; gatear pelo `FEITO` escondia o teaser
  injustamente no `FEITO_SEM_FEEDBACK`, o bug real por trás do relato "não vejo nada na Home, mas
  vejo ao clicar no card do plano". O resultado é **compartilhado** entre teaser e drawer — uma
  única busca/polling.

## Fora de escopo

- **Não reaproveita o `WorkoutDetailDrawer` inteiro.** Ele espera um `AgendaDay` com o treino
  planejado completo (etapas, perfil, etc.) — dado que a Home não tem (`AthleteRealizadoHoje` só
  tem o realizado, sem o planejado associado). O novo drawer é deliberadamente mais simples: só a
  análise, sem etapas/perfil.
- Nenhuma mudança de contrato de API — `GET /me/home` já devolve `realizadoHoje.id`, suficiente
  para acionar `useAthleteWorkoutAnalysis`. Um sinal de disponibilidade prévio (tipo
  `analiseAtletaDisponivel` que o plano semanal já tem) fica como follow-up, não é necessário para
  o drawer funcionar (o hook já faz polling).
- `TodayFeedbackCard` (conteúdo do "Como foi?") não muda — o teaser aparece ao lado dele, não dentro.
- `PULADO`, `PLANEJADO`/`DESCANSO` não mudam (sem `realizadoHoje`, não há o que buscar).

## Critérios de aceite

1. Given `realizadoHoje` com análise `pending` ou `done` — em `FEITO` **ou** `FEITO_SEM_FEEDBACK` —,
   When a página renderiza, Then aparece o `WorkoutAnalysisTeaser` com uma prévia de uma linha
   (texto `pending`: "Analisando o seu treino…"; `done`: `reconhecimento`/`comoFoi`/resumo das
   stats/chamada genérica, nessa ordem de fallback).
2. Given a análise `empty`/`error`, ou sem `realizadoHoje`, When a página renderiza, Then o teaser
   não aparece — sem card clicável vazio.
3. Given o teaser visível, When o atleta clica (mouse, toque ou teclado — Enter/Espaço), Then abre o
   `TodayWorkoutAnalysisDrawer` com `WorkoutAnalysisCard` completo, sem nova busca de rede (reaproveita
   o estado já carregado).
4. Given o drawer aberto, When o atleta fecha, Then volta para a Home sem re-fetch desnecessário do
   `useAthleteHome`.
5. `TodayCompletedCard` continua passando pelos próprios testes sem nenhuma prop/comportamento de
   clique — regressão zero no card estático.
6. `npm run lint && npm run build` passam sem erros novos.

## Métrica de sucesso

Atleta que completa um treino consegue revisitar a análise de IA a partir da própria Home, sem
precisar navegar até a Agenda — elimina o "a análise some" reportado.

## Open Questions & Assumptions

- **Assumido:** não é necessário adicionar um sinal de "análise pronta" ao payload de `/me/home`
  nesta change — o hook de polling já resolve a exibição; o sinal prévio é otimização visual
  (badge), não bloqueante.
- **Assumido:** o drawer da Home não precisa mostrar etapas/perfil do treino planejado — só a
  análise, texto RPE/sensações (já no `TodayCompletedCard`) é suficiente para esse ponto de
  revisão.
- **Aberto:** se o founder quiser o mesmo nível de detalhe do `WorkoutDetailDrawer` (etapas,
  perfil) na Home, isso exigiria a Home também buscar o `TreinoPlanejado` associado — change própria
  de maior escopo.
