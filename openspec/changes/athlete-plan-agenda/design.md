# Design — athlete-plan-agenda

## D1 — Agenda vertical em vez de carrossel

Sete linhas de altura fixa (64px; descanso 56px; hoje expandido ~130px) numa única superfície
`elevation.card` com divisórias `surface[700]`. Em 390px, cabe inteira acima da dobra com o rodapé
de volume. Em desktop (>900px), a mesma lista, largura máxima 640px — não voltar ao carrossel.

Rejeitado: faixa de sete colunas + card do dia selecionado. Mostra menos por dia e exige toque para
ler qualquer treino além do selecionado.

## D2 — Expansão vs. detalhe

Comportamento do toque depende do que o contrato traz (task 0.1):

- **Sem etapas no contrato:** toque expande/colapsa a linha (descrição completa + ação). Só uma
  linha expandida por vez; hoje expandido por padrão.
- **Com etapas:** toque abre `WorkoutDetailDrawer` (MUI `Drawer` bottom) com descrição, etapas
  (duração · zona · alvo) e, quando existir, o `WorkoutProfile` (reuso de
  `features/workout/profile`) — o mesmo que `athlete-home-workout-profile` traz ao hero.

## D3 — Rodapé de volume neutro

`total / target km` com uma casa; barra com marcador em `diaDaSemana / 7 * target`; texto
"Dia N de 7 · X de Y treinos feitos". Nenhuma classificação qualitativa: essa leitura é do coach
(revisão semanal), não do app para o atleta. A cor da barra é sempre `primary[500]`.

## D4 — Estado por ícone

| Estado | Ícone | Cor |
|---|---|---|
| concluído | check em círculo | `semantic.success[500]` |
| pulado | círculo com traço | `surface[600]` |
| futuro/pendente | chevron | `surface[600]` |
| hoje | número do dia em círculo lime | `primary[500]` / `surface[900]` |

Sem `border-left`. Fundo de hoje: `rgba(189,222,90,0.06)` + anel interno `rgba(189,222,90,0.35)`.

## Riscos e mitigações

- **Perder a visão "de relance" em desktop** (o carrossel mostrava sete cards lado a lado): a lista
  de 64px por linha ocupa ~450px — cabe em 900px de altura sem scroll. Aceito.
- **Toque virar dead-end de novo** se o detalhe não existir: D2 garante comportamento em ambos os
  casos; nenhuma linha fica clicável sem ação.
