# Design — add-athlete-workout-verdict-chip

## D0 — Exceção à regra "Identifier Language" (decisão do QA gate, 2026-10-07)

`veredito`, os quatro valores do enum (`DENTRO_DO_PLANO`, `ABAIXO_DO_PLANO`, `ACIMA_DO_PLANO`,
`ESFORCO_ACIMA_DO_ESPERADO`), `toleranciaPct`, `deltaRpe` e o enum interno `Desvio` do
`WorkoutPlanVerdictCalculator` ficam em PT-BR — achado do `code-reviewer` no QA gate apontou que
isso viola a regra "Identifier Language" (ADR-0007, 2026-07-25: "código novo nasce em inglês").

Decisão: manter PT-BR. `veredito` convive no mesmo `AthleteWorkoutAnalysisOutputDto` que
`comoFoi`, `reconhecimento`, `esforco` e `proximoTreino` — todos PT-BR legado, porque o DTO é
especificamente o bloco de texto em linguagem de atleta (ver Javadoc do DTO). Renomear só este
campo criaria uma mistura inconsistente dentro do mesmo contrato (três campos PT, um em inglês),
sem reduzir dívida real — os quatro campos legados continuam PT até uma change dedicada à
migração do DTO inteiro. Fica registrado como desvio conhecido e intencional da ADR-0007 para
este contrato específico, não como precedente geral.

`WorkoutPlanVerdict` (enum) + `WorkoutPlanVerdictCalculator` (componente puro, sem repositório) no
backend. O front só pinta — mesma regra do design system para `readiness-*` e `zone-*`: bandas são
resolvidas no backend, a UI nunca rederiva limiar.

## D2 — Regra

Entradas: os mesmos números que o DTO já expõe em `executado` e `planejado`
(`duracaoMin`, `distanciaKm`, `rpe` / `rpeEsperado`).

Um par (duração, distância) só entra na comparação quando os dois lados existem e o planejado é
> 0 — classificado por dimensão como `ABAIXO` (executado < 85% do planejado), `ACIMA` (executado
> 115%) ou `DENTRO` (caso contrário). Um planejado sem executado correspondente (ex.: distância
prescrita mas não registrada) marca a dimensão como **não coberta**, distinta de `DENTRO` — corrige
o achado do Codex (NO-GO item 3) em que dado incompleto virava aprovação silenciosa.

Avaliação, em ordem; a primeira que casar vence:

1. sem planejado (nenhuma dimensão com valor planejado) → sem veredito (`null`);
2. `rpe` e `rpeEsperado` presentes e `rpe ≥ rpeEsperado + 2` → `ESFORCO_ACIMA_DO_ESPERADO`;
3. alguma dimensão comparável classificada `ABAIXO` **e** alguma outra classificada `ACIMA`
   (desvio misto — ex.: planejado 60 min/10 km, executado 75 min/8 km) → `ACIMA_DO_PLANO`. Corrige o
   achado do Codex (NO-GO item 1): a ordem antiga testava "abaixo" antes de "acima" e mascarava o
   excesso de duração atrás do déficit de distância. Tratamos desvio misto como excesso porque, nas
   duas combinações possíveis (duração acima/distância abaixo ou o inverso), há sempre uma dimensão
   em que o atleta foi além do plano — sinal que interessa mais ao coach do que o déficit na outra;
4. alguma dimensão comparável classificada `ABAIXO` (sem contrapartida `ACIMA`) → `ABAIXO_DO_PLANO`;
5. alguma dimensão comparável classificada `ACIMA` (sem contrapartida `ABAIXO`) → `ACIMA_DO_PLANO`;
6. todas as dimensões comparáveis são `DENTRO` **e** nenhuma dimensão planejada ficou sem
   contrapartida executada (cobertura completa) → `DENTRO_DO_PLANO`;
7. caso contrário (há dimensão planejada sem executado correspondente, e nenhuma deviation nos
   passos 2–5) → sem veredito (`null`) — não há dado suficiente para afirmar "dentro do plano".

Limiares em `WorkoutAnalysisProperties.verdict` (`toleranciaPct = 15`, `deltaRpe = 2`), validados
com `@Min`. Aceitos como padrão operacional nesta versão (decisão registrada em
`add-athlete-workout-verdict-chip` em 2026-10-06); a métrica de distribuição por assessoria serve
para recalibrar se o founder observar vereditos injustos em produção — ver Riscos.

Esforço tem precedência porque é o sinal que mais interessa ao coach e ao atleta: um treino
encurtado com RPE alto é "esforço acima", não só "abaixo do plano".

## D3 — Contrato

`AthleteWorkoutAnalysisOutputDto` ganha `WorkoutPlanVerdict veredito` (nullable; o DTO já é
`@JsonInclude(NON_NULL)`, então some do JSON quando nulo). Preenchido em `dtoPendente` e
`dtoCompleto` de `AtletaWorkoutAnalysisServiceImpl`. Campo aditivo: front antigo ignora.

Métrica `atleta_treino_veredito_total{veredito}` incrementada junto com
`registrarPrimeiraVisualizacao` (uma vez por análise), para não inflar com o polling.

## D4 — Front

- Tipo `AthleteWorkoutAnalysis.veredito?: WorkoutPlanVerdict`.
- `buildWorkoutAnalysisView` expõe `verdict: { label, tone: 'success' | 'warning' } | null`.
- Componente `WorkoutVerdictChip` (presentacional): ponto de 6 px + rótulo, 11 px/600,
  padding 4×8, `radius.xs`, cor de `semantic.success` / `semantic.warning` e fundo `alpha(cor, 0.12)`.
  Sem hex no componente.
- Home: `TodayCompletedCard` renderiza o chip na linha do overline "Treino feito"
  (`justify-content: space-between`), lendo `analysisView.verdict`.
- Drawer e pós-feedback: `WorkoutAnalysisCard` renderiza o chip no próprio cabeçalho. Para não
  duplicar na Home, o card recebe `hideVerdict` (ou a prop `embedded`, se ela já existir após o
  ajuste da `refine-athlete-workout-analysis-card`).

## D5 — Sequência

Backend primeiro (campo aditivo, sem flag). Front depois. Sem migração, sem rollout gradual.

## Riscos e mitigações

- **Limiares errados geram veredito injusto** ("abaixo do plano" por 1 min). Mitigação: tolerância
  de 15%, limiares configuráveis sem deploy de front, e a métrica de distribuição para calibrar.
- **Veredito contradiz o texto da IA** (chip "dentro do plano", texto apontando problema). A IA usa
  mais sinais (FC, etapas). Mitigação: rótulos descrevem só aderência a números; registrar casos
  na turma fundadora. Não alimentar o prompt com o veredito nesta change.
- **Colisão com a branch `refactor/refine-athlete-workout-analysis-card`**, ainda aberta e mexendo
  nos mesmos arquivos. Mitigação: implementar o front desta change só depois do merge daquela.
- **Chip ausente quando a análise devolve 204.** Aceito nesta versão; ver Open Questions.
- **Veredito some numa transição `PENDING` → `FAILED`** (achado Codex NO-GO item 2): o chip some
  mesmo sem mudança nos números executados, porque o veredito viaja só no DTO da análise. Aceito
  nesta versão pelo mesmo motivo do 204 — exigiria expor o campo em `realizadoHoje` do
  `GET /me/home`, fora de escopo (ver Open Questions, extensão já citada ali).
- **Veredito diverge do texto da IA já persistido, após edição do realizado** (achado do
  `code-reviewer` na implementação, 2026-10-06): o veredito é recalculado a cada chamada a partir
  do `TreinoRealizado` atual, mas os quatro textos da IA ficam congelados em `tb_analise_workout`
  desde a primeira geração. Editar duração/distância/RPE depois de `COMPLETED` (edição manual ou
  re-sync do Strava) não invalida nem reprocessa a análise — o chip pode contradizer o texto já
  escrito. Aceito nesta versão (reprocessar a IA é fora de escopo); documentado no Javadoc de
  `AtletaWorkoutAnalysisServiceImpl`. Mitigação futura, se incomodar em produção: invalidar
  `AnaliseWorkout` quando os campos relevantes do realizado mudarem.

## Rollback

Reversão trivial: campo `veredito` é aditivo e `@JsonInclude(NON_NULL)` — revertendo o PR de
backend o campo some do DTO e o front (campo opcional, chip condicional) volta a não renderizar
nada, sem estado inconsistente. Sem migração de schema, sem flag, sem dado persistido a limpar.
