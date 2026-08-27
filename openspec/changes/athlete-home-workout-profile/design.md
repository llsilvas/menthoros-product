# Design — athlete-home-workout-profile

## D1 — Reuso do DTO de etapas, não duplicação

`AtletaHomeDto.ProximoTreino` referencia o mesmo `EtapaTreinoDto` do detalhe (`GET .../treinos/{id}`).
Um DTO só evita divergência quando o perfil ganhar campo novo. Se a task 1.1 encontrar campo que
não deve ir ao atleta, cria-se `EtapaTreinoAtletaDto` como projeção — nunca `@JsonIgnore`
condicional.

## D2 — Variante do perfil no hero

`variant="compact"` explícito (plot 92px, sem eixo Y, três ticks). `useResolvedVariant('auto')` só
resolve `full` a partir de 560px, então em 358px cairia em `compact` de qualquer forma — o
explícito é por determinismo (testes e o hero nunca mudam de variante com a largura), não por
risco. `showDistribution` mantido (barra de 4px + legenda).

## D2b — Mesmo caminho do drawer do Plano

`profile = selectWorkoutProfile(indexarRepeticoes(etapas.map(fromEtapaTreino)), { sport: 'run',
tss: tssPlanejado, if: intensidadePlanejada, zonaAlvoTreino: zonaAlvo })`, como em
`WorkoutDetailDrawer` (`athlete-plan-agenda`). Duas telas, uma regra: o bracket "N×" sai igual.

## D3 — Ausência honesta

Sem etapas: nada. Não desenhar skeleton nem "sem etapas" no hero — a informação já está na prosa
da descrição e o espaço vazio custaria mais que a ausência.

## Riscos e mitigações

- **Contrato muda sem o front** (ou vice-versa): campos novos são opcionais dos dois lados; PR
  coordenado, backend primeiro.
- **Perfil ilegível em 390px** (rótulos de bloco, ticks): a variante compacta não desenha rótulos;
  smoke visual com treino intervalado real antes do PR.
