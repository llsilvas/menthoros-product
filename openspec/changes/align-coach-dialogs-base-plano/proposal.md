# Proposal — align-coach-dialogs-base-plano

**Tamanho · Trilha:** S · Fast (frontend-only; sem mudança de API/DB)

> **1 de 3** da adequação dos dialogs legados ao padrão visual do shell coach.
> Esta é a **fundação**: cria o componente base `CoachDialog` e o aplica ao dialog de menor risco
> (`PlanosDialog`, já ~90% no padrão) para provar a abordagem. As changes irmãs
> (`align-coach-dialogs-atleta`, `align-coach-dialogs-projecao`) dependem do `CoachDialog` desta.

## Why

O roster `coach/atletas` passou a abrir dialogs reaproveitados do shell legado (`PlanosDialog`,
`AtletaDialog`, `GerarProjecaoDialog`). Eles destoam do shell coach: alguns têm fundo claro, gradientes e
cores hardcoded, em vez do padrão dark-first com tokens. Isso quebra a coesão visual do produto.

Em vez de repetir o padrão de superfície em cada dialog, criamos **um wrapper base** (`CoachDialog`) que
encapsula a linguagem visual do shell coach (já existente em `TreinoEditDialog`/`RejeicaoModal`). Os dialogs
passam a herdar superfície/header/ações e ficam só com o conteúdo. Começar pelo `PlanosDialog` (que já usa
tokens na estrutura principal — só tem desvios pontuais) valida o `CoachDialog` com baixo risco.

## What Changes

**Somente `apps/menthoros-front`.**

### Novo componente `CoachDialog` (fundação)
`src/features/coach/components/CoachDialog.tsx` — wrapper com o padrão destilado do shell coach:
- `PaperProps`: `bgcolor: elevation.highest`, `border: 1px content.cardBorder`, `borderRadius: 12px`, `overflow: hidden`.
- Header: título `surface[50]`, uppercase, `letterSpacing 0.08em`, `borderBottom: content.divider`; slot opcional de ação no header.
- `DialogContent` (padding padrão) + `DialogActions` (slot `actions`).

### Adequar `PlanosDialog` (polish pontual)
- Chip de planos: `rgba(255,255,255,0.12)`/`#e8eaed` → tokens (`${surface[0]}xx` / `surface[200]`).
- Botões "Recalcular" e "Excluir plano": cores inline hardcoded → tokens (`surface`/`semantic.danger`).
- `TreinoCard` (filho): `getRpeColor()` (hex) → `semantic` tokens; caixa de insight (gradiente/rgba) → tokens.
- (Estrutura do `PlanosDialog` já usa `elevation`/`content` — manter; pode migrar para `CoachDialog` se reduzir código sem regressão.)

## Acceptance Criteria

- **CA1** — `CoachDialog` existe e renderiza no padrão (fundo `elevation.highest`, borda `content.cardBorder`, header uppercase `surface[50]`, ações no rodapé).
- **CA2** — `PlanosDialog` sem cores hardcoded: chip, botões e `TreinoCard` (RPE + insight) usam tokens.
- **CA3** — Nenhuma regressão funcional (ver/gerar/excluir plano; recálculo) e visual coerente com o shell coach (dark-first).
- **CA4** — `npm run lint && npm run build && npm run test:run` verdes.

## Success Metric

Zero hex/rgba hardcoded em `PlanosDialog` + `TreinoCard`; `CoachDialog` disponível para as changes irmãs.

## Design / Abordagem

Padrão-alvo destilado dos dialogs do shell coach (`TreinoEditDialog.tsx`, `PlanoDetalhePanel`/RejeicaoModal):
- Superfície: `elevation.highest` (#1A2940), borda `content.cardBorder`, radius 12px.
- Header: `surface[50]`, uppercase, `letterSpacing 0.08em`, divisor `content.divider`.
- Ações: primário `primary[500]` + `surface[900]` + `fontWeight 800`; destrutivo `semantic.danger[500]`; cancelar `text` `surface[400]`.
- Tokens de `src/theme/tokens.ts` e `src/shared/design-tokens/*` — nunca hex.

## Non-Goals

- `AtletaDialog` (change `align-coach-dialogs-atleta`).
- `GerarProjecaoDialog`/`ProjecaoResultadoDialog`/`ConfidenceBadge`/`MarcarOficialButton` (change `align-coach-dialogs-projecao`).
- Mover fisicamente os dialogs para `features/coach/components` (follow-up).
- Mudança de comportamento/contrato.

## Riscos e mitigações

- **Regressão visual em telas que já usam `PlanosDialog`/`TreinoCard`** (inclusive `/atletas` legado): mudar só cores→tokens, sem alterar estrutura/comportamento; validar visualmente.

## Dependência

Nenhuma. É a fundação das outras duas.
