**Tamanho:** S · **Trilha:** Full

> **Ticket 7** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 2, 4) e decisões vivem
> no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-adjust-v2` (ticket 6).

## Why

O treinador precisa ver o que mudou entre versões e recalcular as semanas futuras sem perder o que ele
mesmo editou. A origem de cada valor é também a matéria-prima do delta de decisão no nível da temporada.

## What Changes

Tasks do épico: **3.5, 3.7, 3.9 (conflito de versão), 4.7, 4.9, 7.9, 7.11 (conflito de versão)**.

- Recálculo das semanas futuras do rascunho, preservando semanas passadas e valores com origem `COACH`
- Diff entre versões, por semana e campo, com origem
- Campo alterado com o valor anterior na tela; conflito de versão sem perder a edição

## Critérios de aceite

- **Dado** um valor editado pelo treinador, **quando** o rascunho é recalculado, **então** o valor com
  origem `COACH` permanece e as semanas passadas não mudam.
- **Dado** duas versões, **quando** o diff é pedido, **então** lista semana, campo, valor anterior, valor
  novo e origem.
- **Dado** um campo editado, **quando** a tabela renderiza, **então** mostra o valor anterior e a origem.
- **Dado** que outra sessão aprovou uma versão antes, **quando** o treinador aprova, **então** vê o
  conflito e não perde a edição.

## Métrica de sucesso

% de temporadas aprovadas com ao menos uma edição do treinador (acompanhamento do épico).

## Open Questions & Assumptions

- Nenhuma.

## Bloqueado por

- `add-season-plan-adjust-v2` (ticket 6).
