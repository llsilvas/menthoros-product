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

- `TodayCompletedCard` (estado `FEITO` da Home) passa a ser clicável.
- Novo componente leve `TodayWorkoutAnalysisDrawer` (bottom sheet, mesmo padrão visual do
  `WorkoutDetailDrawer`), acionado pelo clique, que busca e exibe a análise via
  `useAthleteWorkoutAnalysis(realizado.id)` + `WorkoutAnalysisCard` — reaproveita o hook e o
  adapter já existentes, sem duplicar a lógica de polling/estado.
- Estados tratados: `pending` ("Analisando…"), `done` (card completo), `empty`/`error` (mensagem
  curta, sem quebrar a tela) — mesmo contrato visual já usado em `WorkoutDetailDrawer`.

## Fora de escopo

- **Não reaproveita o `WorkoutDetailDrawer` inteiro.** Ele espera um `AgendaDay` com o treino
  planejado completo (etapas, perfil, etc.) — dado que a Home não tem (`AthleteRealizadoHoje` só
  tem o realizado, sem o planejado associado). O novo drawer é deliberadamente mais simples: só a
  análise, sem etapas/perfil.
- Nenhuma mudança de contrato de API — `GET /me/home` já devolve `realizadoHoje.id`, suficiente
  para acionar `useAthleteWorkoutAnalysis`. Um sinal de disponibilidade prévio (tipo
  `analiseAtletaDisponivel` que o plano semanal já tem) fica como follow-up, não é necessário para
  o drawer funcionar (o hook já faz polling).
- Estados `FEITO_SEM_FEEDBACK`, `PULADO`, `PLANEJADO`/`DESCANSO` não mudam.

## Critérios de aceite

1. Given o estado `FEITO` na Home (treino concluído e feedback já registrado), When o atleta clica
   no `TodayCompletedCard`, Then abre um bottom sheet com a análise do treino (via
   `useAthleteWorkoutAnalysis(realizado.id)`).
2. Given a análise ainda `pending`, When o drawer abre, Then mostra "Analisando…" (mesmo texto do
   `WorkoutDetailDrawer`).
3. Given a análise `empty` (204) ou erro, When o drawer abre, Then mostra uma mensagem curta sem
   quebrar a tela, igual ao comportamento já existente no `WorkoutDetailDrawer`.
4. Given o drawer aberto, When o atleta fecha, Then volta para a Home sem re-fetch desnecessário do
   `useAthleteHome`.
5. `npm run lint && npm run build` passam sem erros novos.

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
