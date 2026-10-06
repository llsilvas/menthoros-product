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

## O que muda (desenho final)

Duas iterações anteriores foram tentadas e descartadas antes deste desenho:
1. `TodayCompletedCard` inteiro como `<button>` — visual quebrado, revertido.
2. Card separado estilo "Athlete Intelligence" (`WorkoutAnalysisTeaser`) + bottom sheet
   (`TodayWorkoutAnalysisDrawer`) — funcionava, mas o founder pediu algo mais direto: a análise
   **dentro** do próprio card de treino feito, sem indireção de clique.

Desenho final, mais simples que os dois anteriores:

- `TodayCompletedCard` ganha a prop `analysisView?: WorkoutAnalysisView | null` e renderiza
  `WorkoutAnalysisCard` **inline**, ao final do próprio card — mesmo padrão já usado em
  `PostWorkoutFeedbackCard` (tela de registro). Sem teaser, sem drawer, sem clique extra.
- `useAthleteWorkoutAnalysis(realizado.id)` sobe para `AthleteHomePage`, acionado só quando
  `feedbackRegistradoEm` existe (estado `FEITO`) — único estado em que `TodayCompletedCard`
  renderiza. `WorkoutAnalysisTeaser` e `TodayWorkoutAnalysisDrawer` foram removidos (não têm mais
  consumidor).

## Fora de escopo

- `TodayFeedbackCard` (estado `FEITO_SEM_FEEDBACK`, "Como foi?") não ganha a análise — por decisão
  explícita, a análise só aparece dentro do "Treino feito" já consolidado. Um treino sincronizado
  sem feedback ainda respondido não mostra a análise na Home nesta versão (ela continua disponível
  via Agenda, `WorkoutDetailDrawer`).
- Nenhuma mudança de contrato de API — `GET /me/home` já devolve `realizadoHoje.id`.
- `PULADO`, `PLANEJADO`/`DESCANSO` não mudam (sem `realizadoHoje`, não há o que buscar).

## Critérios de aceite

1. Given o estado `FEITO` na Home com análise `pending` ou `done`, When a página renderiza, Then o
   `WorkoutAnalysisCard` aparece dentro do próprio `TodayCompletedCard`, abaixo do resumo do
   treino.
2. Given a análise `empty`/`error`, When a página renderiza, Then `TodayCompletedCard` mostra só o
   resumo, sem o bloco de análise — sem quebrar a tela.
3. Given o estado `FEITO_SEM_FEEDBACK`, When a página renderiza, Then nenhuma busca de análise é
   feita (hook chamado com `null`).
4. `TodayCompletedCard` continua sem nenhuma prop/comportamento de clique — card estático.
5. `npm run lint && npm run build` passam sem erros novos.

## Métrica de sucesso

Atleta que completa um treino e responde o "Como foi?" vê a análise de IA direto no card "Treino
feito" da Home, sem precisar navegar até a Agenda — elimina o "a análise some" reportado.

## Open Questions & Assumptions

- **Decidido (founder):** a análise fica embutida no `TodayCompletedCard`, não num card/drawer
  separado — mais direto, sem indireção de clique.
- **Aberto:** `FEITO_SEM_FEEDBACK` (treino sincronizado sem "Como foi?" respondido) não mostra a
  análise na Home nesta versão — se isso for pedido depois, é uma extensão pequena (reaplicar o
  mesmo padrão em `TodayFeedbackCard`).
