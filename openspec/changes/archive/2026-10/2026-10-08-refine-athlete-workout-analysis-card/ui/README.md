# Referência visual — refine-athlete-workout-analysis-card

Capturas estáticas do board (canvas do founder), 390 px de largura, cenário "dentro do plano":

- `board-1-analisando.png` — análise `pending`
- `board-2-analise-pronta.png` — análise `done`, recolhida
- `board-3-analise-expandida.png` — análise `done`, expandida

Os `.html` de mesmo nome são a marcação exata de cada captura (estilos inline com os valores finais).
Os textos marcados com "[Exemplo]" são placeholders. O chip "Dentro do plano" está no board mas é
**fora de escopo** desta change.

## Diferenças entre a implementação (branch `refactor/refine-athlete-workout-analysis-card`, commit 953a663) e o board

1. **Card dentro de card.** No board não existe um card "Análise do treino" aninhado: a linha de
   métricas fica direto no `TodayCompletedCard`, logo abaixo do título do treino, e o único contêiner
   interno é o bloco `ai-highlight`. A implementação mantém `<Card variant="flat">` + `CardHeader`
   "Análise do treino" em volta de tudo, o que gera três níveis de caixa na Home.
2. **Rótulo do bloco.** No board o rótulo é "ANÁLISE DO TREINO" com o ícone sparkle (12 px), dentro
   do bloco de destaque, em `primary[500]`. A implementação usa o `CardHeader` fora do bloco e,
   dentro dele, "Análise da IA" com o ícone de troféu.
3. **Linha de métricas.** No board é texto secundário (13 px, mono, `surface[300]`). A implementação
   usa `variant="h6"` em `surface[50]`, que compete com o título do treino.
4. **Raio e respiro do bloco.** Board: raio 12 px (`radius-lg`, papel "inner"), padding 12/16 px.
   Implementação: `radius.md` (8 px), padding 12 px.
5. **Estado `pending`.** Board: frase em 13 px, sem itálico, direto no card do treino. Implementação:
   `body1` em itálico, dentro do card aninhado.
6. **O que fica atrás de "Ver análise completa".** Board e proposal: só o resumo visível, o resto
   atrás do toque. Implementação: `reconhecimento`, `comoFoi` e `proximoTreino` sempre visíveis, só
   `esforco` recolhido. Se isso foi decisão do founder durante a implementação, vale o código —
   registrar no proposal.

Os itens 1 e 2 são os que mais afastam a tela do board. O card aninhado ainda faz sentido no
`WorkoutDetailDrawer` e no `PostWorkoutFeedbackCard`, onde não há um card de treino em volta — uma
prop `embedded` (sem `Card`/`CardHeader`) usada só pela Home resolve sem mudar os outros dois.
