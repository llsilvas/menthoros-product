# expandir-serie-timeline-revisao — timeline da revisão esconde a estrutura da série

**Tamanho:** XS · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-08-17

> Origem: observado em 2026-08-17, ao validar a change `fix-fartlek-expansao-etapas`. Com o fartlek
> finalmente expandido no backend, ficou visível que as duas telas desenham o mesmo treino de
> formas diferentes.

## Why

O treinador vê o mesmo treino de dois jeitos, e o jeito **menos** informativo é justamente o da tela
onde ele decide se o treino está certo.

| Tela | O que mostra |
|---|---|
| Detalhe do plano (`DetalheTreinoDialog`) | 12 barras alternando Z4/Z1 — a série visível |
| Revisão (`TreinoEditDialog`) | 4 caixas: `AQ`, `5×`, `REC`, `DQ` |

As duas já usam **o mesmo componente**, `WorkoutTimelineChart` (`TreinoEditDialog.tsx:604`). A
divergência está nos dados: o detalhe passa as etapas reais por `toWorkoutBlocks()`, enquanto o
editor monta `liveBlocks` agregando a série (`TreinoEditDialog.tsx:342-357`):

```ts
const durEsforco = (parseInt(principal.duracaoMin, 10) || 0) * rep;  // soma as repetições
blocks.push({ shortLabel: `${rep}×`, durationMin: durEsforco, ... });  // um bloco só
```

O resultado é uma barra larga de esforço contínuo — a leitura oposta do que uma série é. A duração
total continua correta, então nada parece errado; só a estrutura desaparece. Numa tela de revisão,
é exatamente a informação que justifica a revisão.

## What Changes

`liveBlocks` passa a emitir um par esforço/recuperação **por repetição**, em vez de dois blocos
agregados. O gráfico continua reagindo ao formulário ao vivo, e a soma das durações não muda.

### Non-goals

- Não mexer no colapso do editor: ele continua com **um** par esforço/recuperação, então a timeline
  mostrará N pares idênticos. Se o fartlek original tinha variação, ela já se perdeu na hidratação
  (`TreinoEditDialog.tsx:256-286`) — essa é a change adjacente listada em follow-ups.
- Não alterar `WorkoutTimelineChart`, `toWorkoutBlocks` nem o `DetalheTreinoDialog`.
- Não mudar o cálculo de totais (`totalKm`/`totalMin`), que é independente de `liveBlocks` e já
  multiplica por repetições.

## Critérios de aceite

**CA1 — uma barra por repetição**
Given um fartlek com 4 pares `INTERVALADO(3min)` + `RECUPERACAO(2min)`
When o `TreinoEditDialog` abre
Then a timeline mostra 4 barras de esforço numeradas (`1/4`…`4/4`) e 4 de recuperação.

**CA2 — duração por barra é a de uma repetição**
Given o mesmo treino
Then cada barra de esforço exibe `3 min`, não o agregado de 12 min.

**CA3 — o stepper da série não muda**
Given o mesmo treino
Then o contador de repetições continua exibindo `4×` e os botões de ±1 seguem funcionando.

**CA4 — treino simples inalterado**
Given um treino não-intervalado
Then a timeline continua com um único bloco principal.

## Métrica de sucesso

O treinador identifica a estrutura da série sem abrir o detalhe do plano: as duas telas passam a ter
a mesma leitura. Verificação: comparar a timeline das duas telas para o mesmo treino — hoje divergem,
depois coincidem.

## Open Questions & Assumptions

**Premissas assumidas:**
- Barras estreitas ficam sem rótulo por decisão já existente do componente
  (`WorkoutTimelineChart.tsx:151`, `showLabel = widthPct > 5`). Séries longas (ex.: 12×) mostrarão
  barras sem texto, exatamente como o detalhe do plano já faz hoje. Comportamento aceito, não
  alterado nesta change.

**Em aberto:**
- Nenhuma.
