# Design — athlete-home-restructure

## D1 — Ordem e hierarquia da Home

Um bloco primário (hero do treino de hoje), um secundário (prontidão), um de contexto ("Sua
semana"), e linhas (check-in, kudos, forma). Nada mais. Ordem:

1. Cabeçalho (data + saudação)
2. Linha de check-in (estado + ação) — ou o check-in inline expandido quando ainda não feito hoje
3. Hero "Treino de hoje" → `Registrar treino`
4. Prontidão (uma linha)
5. "Sua semana" (streak · volume · 7 dias · prova)
6. Kudos (uma linha; omitido quando vazio, como hoje)
7. Forma + link Progresso

Banners (`CalibrationBanner`, `WeekClosedBanner`) continuam acima do cabeçalho, como hoje.

## D2 — Check-in inline: mapeamento para `CheckinProntidaoInputDto`

O DTO recebe cinco inteiros (sono 1–10, humor 1–10, dores 0–10, energia 1–10, estresse 0–10). O
inline expõe três estados por item e grava valores fixos:

| Item | estado 1 | estado 2 | estado 3 |
|---|---|---|---|
| Sono | ruim → 3 | ok → 6 | bom → 9 |
| Humor | baixo → 3 | ok → 6 | bom → 9 |
| Energia | baixa → 3 | ok → 6 | alta → 9 |
| Dores | fortes → 8 | leves → 4 | nenhuma → 0 |
| Estresse | alto → 8 | médio → 4 | baixo → 0 |

- Ao abrir a Home com check-in já feito, o inline mostra o estado mais próximo de cada valor
  (≤4 / 5–7 / ≥8; invertido para dores e estresse) e "Salvo" (sem horário — o contrato não o traz).
- **Primeiro check-in do dia** (`useCheckinAtual` → `null`): os cinco itens começam **sem estado**
  e nada é enviado até os cinco terem seleção — a UI mostra "N de 5"; ao completar, um POST com o
  DTO completo. Não se fabrica default: os cinco campos são `@NotNull` e um valor inventado viraria
  dado de prontidão.
- **Check-in existente:** cada toque envia o DTO completo (os cinco valores atuais), com debounce
  de 600ms para absorver toques em sequência. Falha → reverte o item e mostra erro inline.
- "Mais detalhes" abre o `QuickCheckInModal` com os valores atuais — o modal não muda.
- Rejeitado: gravar só ao final com botão "Salvar" — reintroduz o formulário que se quer eliminar.

## D3 — Tema do shell do atleta

`features/athlete/theme/athleteTheme.ts` estende `appTheme` (precedente `coachTheme.ts`) com
`typography.fontFamily = font.text` e variantes de título (`h1`–`h6`) em `font.display`. Envolve o
`AthleteLayout`. Não toca `appTheme`: landing e coach continuam como estão.

**O tema não alcança literais.** Há 11 `fontFamily: 'Syne, sans-serif'` em `features/athlete/**`
(páginas Plano, Perfil, Progresso, Onboarding, registro; `QuickCheckInModal`, `FitUploadResultCard`,
`IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard`) e 2 em `shared/components`
(`ConfirmDialog`, `CoachDialog`). A task 1.2 remove os do shell do atleta (viram variante do tema);
nos compartilhados o literal vira `fontFamily: (t) => t.typography.h6.fontFamily` — o coach
continua em Syne pelo `appTheme`, o atleta resolve para `font.display`. Sem isso o CA 8 é falso.
Consequência aceita: Progresso, Coach e Perfil mudam de fonte sem redesenho — smoke (task 6.2).

## D4 — Consolidação de erros

Um `useAthleteHomeErrors(...)` local agrega `error`/`refetch` dos hooks secundários (readiness,
treinos, provas, checkinAtual, kudos, plano, **calibração — hoje `useCalibracao` expõe `error` e a
Home não o lê, então falha de calibração é silenciosa**) e devolve `{ failed: string[], retryAll }`.
A Home renderiza um `Alert` só. O erro de `useAthleteHome` continua sendo a tela de erro atual.

## D5 — Cor do tipo de treino

Fonte única: `workoutTypeColor(tipoTreino)` de `theme/activeTheme`, que recebe o **enum do
backend** (`FACIL`, `LONGO`, …). O `DayCard` hoje trabalha num `WorkoutType` local (`easy_run`,
…, via `mapTipoTreino`) e pinta por `categorical.cat*` — são dois domínios, e a divergência de cor
vem daí. Nesta change, o hero e os pontos de dia de "Sua semana" recebem o `tipoTreino` do backend
(`proximoTreino.tipoTreino`; `plano.treinos[].tipoTreino`) e chamam `workoutTypeColor` direto —
**nunca passam pelo `WorkoutType` local**. A migração do `DayCard` (e a remoção de `TYPE_COLORS`) é
de `athlete-plan-agenda`; o adaptador comum é o próprio `workoutTypeColor`, já existente.

## Riscos e mitigações

- **Perder registro por mudança de layout** (o botão sai do fim da página para o hero): E2E em
  390×844 garante o botão visível sem scroll.
- **Check-in inline degradar a qualidade do dado** (menos granularidade): a métrica de sucesso
  compara volume de check-ins; a premissa do mapeamento é validada antes da task 2.1. Se cair, o
  inline grava e o modal segue como refinamento — não se remove o modal.
- **Fonte nova em telas não redesenhadas**: task de smoke (6.2) com correção só de estouro.
