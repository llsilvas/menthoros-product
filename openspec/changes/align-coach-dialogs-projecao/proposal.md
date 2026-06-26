# Proposal — align-coach-dialogs-projecao

**Tamanho · Trilha:** S/M · Fast (frontend-only; sem mudança de API/DB)

> **3 de 3** da adequação dos dialogs ao padrão do shell coach. **Depende de `align-coach-dialogs-base-plano`**
> (usa o componente `CoachDialog`). É o maior conjunto — isolado de propósito.

## Why

O fluxo de **projeção de prova** (`GerarProjecaoDialog` → `ProjecaoResultadoDialog`), agora acessível pelo
roster `coach/atletas`, está em **tema claro** com superfícies brancas, gradientes e — o ponto mais sensível —
**objetos de cor hardcoded** (`GAP_ASSESSMENT_COLORS`, `CTL_TREND_COLORS`, estilos de confiança) e os
componentes `ConfidenceBadge` / `MarcarOficialButton` fora dos tokens. Como apresenta dados de decisão
(tempo previsto, confiança, gaps), a inconsistência visual prejudica a leitura e a confiança no produto.

## What Changes

**Somente `apps/menthoros-front`.**

- **`GerarProjecaoDialog`**: casca → `CoachDialog`; remover papel branco/gradientes; chip, boxes de seção,
  `DialogActions` e botão submit → tokens (dark-first).
- **`ProjecaoResultadoDialog`**: casca → `CoachDialog`; boxes de tabela/análise/premissas → `elevation.card`+`content.cardBorder`;
  tipografia (`#0e3147`/`#4a5568`/`#2d3748`…) → `surface[*]`.
- **Objetos de cor → tokens semânticos:**
  - `GAP_ASSESSMENT_COLORS` e `CTL_TREND_COLORS` (hex `#27ae60`/`#e74c3c`/…) → `semantic.success/info/danger`.
  - Chip de confiança (mistura tokens + hex) → `semantic` consistente.
- **`ConfidenceBadge`**: `CONFIDENCE_STYLES` (rgba/hex) → `semantic.danger/warning/success`.
- **`MarcarOficialButton`**: `#27ae60`/`#1e8449` → `semantic.success[500]/[700]`.

## Acceptance Criteria

- **CA1** — Ambos os dialogs em dark-first: sem `#ffffff`/gradientes claros; superfícies via tokens.
- **CA2** — `GAP_ASSESSMENT_COLORS`, `CTL_TREND_COLORS`, `CONFIDENCE_STYLES` e botão "Marcar oficial" usam tokens `semantic.*` (zero hex).
- **CA3** — Fluxo intacto: gerar projeção → resultado → marcar oficial; valores/tabela/gaps legíveis no tema escuro.
- **CA4** — `npm run lint && npm run build && npm run test:run` verdes.

## Success Metric

Zero hex hardcoded no fluxo de projeção (dialogs + badges + objetos de cor); leitura clara dos dados de decisão no dark-first.

## Design / Abordagem

Reusa `CoachDialog`. As escalas de cor (gap/tendência/confiança) passam a derivar de `semantic.*` — mapear
cada estado (bom/atenção/ruim) ao token correspondente, preservando o significado. Contraste validado para
texto sobre `elevation.card`.

## Non-Goals

- Plano (`PlanosDialog`) e `AtletaDialog` — changes irmãs.
- Mudança no modelo de projeção / cálculos / contrato.
- Mover arquivos para `features/coach`.

## Riscos e mitigações

- **Mapeamento semântico das escalas de cor:** garantir que bom→success, atenção→warning, ruim→danger não
  inverta o significado; revisar caso a caso.
- **Legibilidade da tabela/gaps no fundo escuro:** validar contraste dos textos antes/depois.
- **Componentes usados fora do roster** (ex.: tela legada de projeção): mudar só estética; validar o fluxo nos dois pontos.

## Dependência

`align-coach-dialogs-base-plano` mergeada em `develop` (componente `CoachDialog`). Independente de `align-coach-dialogs-atleta`.
