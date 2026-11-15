**Tamanho:** M · **Trilha:** Full

> **Ticket 3** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 3b, 7) e decisões vivem
> no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-generate-tracer` (ticket 2).

## Why

A proposta do tracer só tem fases e volume. Para o treinador aprovar, ela precisa ter o que ele de fato
planeja — taper, longão, descargas, provas preparatórias — e dizer onde está fora do razoável.

## What Changes

Tasks do épico: **2.3 (descargas e pico antes do taper), 2.4, 2.5, 2.7, 2.8, 2.9, 2.10 (menos
calibração), 2.11, 2.12, 7.2, 7.5**.

- Taper via `TaperStrategy`, embutido no `tssAlvo` e aplicado uma vez
- Longão com teto por fração do volume; descargas na cadência do template
- Provas preparatórias como marcos; compressão de fases em preparação curta
- `MacrocicloValidator` (rampa, longão/volume, cadência de descarga, janela de taper), só alertas
- Na aba: mapa de fases e volume, marcos e painel de validações

## Critérios de aceite

- **Dado** as semanas de taper, **quando** a proposta é gerada, **então** o `tssAlvo` já tem a curva da
  `TaperStrategy`, aplicada uma vez.
- **Dado** uma janela menor que o mínimo da distância, **quando** gera, **então** as fases são comprimidas
  e a temporada é marcada como preparação curta.
- **Dado** uma prova preparatória dentro da janela, **quando** gera, **então** ela aparece como marco na
  semana correspondente.
- Cada regra do validador tem um caso que dispara e um que não dispara; nenhum alerta bloqueia a
  aprovação.
- **Dado** uma proposta com alertas, **quando** o treinador abre a aba, **então** vê o mapa de fases, os
  marcos e as validações.

## Métrica de sucesso

A do épico; aqui, acompanhar o % de propostas aprovadas sem edição (template coerente).

## Open Questions & Assumptions

- Nenhuma.

## Bloqueado por

- `add-season-plan-generate-tracer` (ticket 2).
