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
  (≤4 / 5–7 / ≥8; invertido para dores e estresse) e "Salvo às HH:MM".
- Cada toque envia o DTO completo (os cinco valores atuais), com debounce de 600ms para absorver
  toques em sequência. Falha → reverte o item e mostra erro inline.
- "Mais detalhes" abre o `QuickCheckInModal` com os valores atuais — o modal não muda.
- Rejeitado: gravar só ao final com botão "Salvar" — reintroduz o formulário que se quer eliminar.

## D3 — Tema do shell do atleta

`features/athlete/theme/athleteTheme.ts` estende `appTheme` (precedente `coachTheme.ts`) com
`typography.fontFamily = font.text` e variantes de título em `font.display`. Envolve o `AthleteLayout`.
Não toca `appTheme`: landing e coach continuam como estão. Consequência aceita: Progresso, Coach e
Perfil mudam de fonte sem redesenho — smoke visual obrigatório (task 6.2).

## D4 — Consolidação de erros

Um `useAthleteHomeErrors(...)` local agrega `error`/`refetch` dos hooks secundários (readiness,
treinos, provas, checkinAtual, kudos, plano, calibração) e devolve `{ failed: string[], retryAll }`.
A Home renderiza um `Alert` só. O erro de `useAthleteHome` continua sendo a tela de erro atual.

## D5 — Cor do tipo de treino

Fonte única: `workoutTypeColor(tipoTreino)` de `theme/activeTheme`. O `DayCard` migra na change
`athlete-plan-agenda`; aqui o hero e os pontos de dia do card "Sua semana" já usam essa fonte.

## Riscos e mitigações

- **Perder registro por mudança de layout** (o botão sai do fim da página para o hero): E2E em
  390×844 garante o botão visível sem scroll.
- **Check-in inline degradar a qualidade do dado** (menos granularidade): a métrica de sucesso
  compara volume de check-ins; a premissa do mapeamento é validada antes da task 2.1. Se cair, o
  inline grava e o modal segue como refinamento — não se remove o modal.
- **Fonte nova em telas não redesenhadas**: task de smoke (6.2) com correção só de estouro.
