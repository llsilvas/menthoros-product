# Design — athlete-home-workout-profile

## D1 — Reuso do DTO de etapas, não duplicação

`AtletaHomeDto.ProximoTreino` referencia o mesmo `EtapaTreinoDto` do detalhe (`GET .../treinos/{id}`).
Um DTO só evita divergência quando o perfil ganhar campo novo. Se a task 1.1 encontrar campo que
não deve ir ao atleta, cria-se `EtapaTreinoAtletaDto` como projeção — nunca `@JsonIgnore`
condicional.

## D2 — Variante do perfil no hero

`variant="compact"` explícito (plot 92px, sem eixo Y, três ticks): o `useResolvedVariant('auto')`
escolhe por largura e em 358px poderia resolver `full`, que tem 176px de plot — alto demais para o
hero. `showDistribution` mantido (barra de 4px + legenda).

## D3 — Ausência honesta

Sem etapas: nada. Não desenhar skeleton nem "sem etapas" no hero — a informação já está na prosa
da descrição e o espaço vazio custaria mais que a ausência.

## Riscos e mitigações

- **Contrato muda sem o front** (ou vice-versa): campos novos são opcionais dos dois lados; PR
  coordenado, backend primeiro.
- **Perfil ilegível em 390px** (rótulos de bloco, ticks): a variante compacta não desenha rótulos;
  smoke visual com treino intervalado real antes do PR.
