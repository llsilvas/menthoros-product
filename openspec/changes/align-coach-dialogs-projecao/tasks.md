# Tasks — align-coach-dialogs-projecao

> Repo: `apps/menthoros-front` · Branch: `feature/align-coach-dialogs-projecao`
> Dependência: `align-coach-dialogs-base-plano` mergeada em `develop` (`CoachDialog`).
> Frontend-only (Fast track). Tokens `semantic.*` — nunca hex. Validar por seção: `npm run lint && npm run build && npm run test:run`.
>
> **Refino contra o código (init):** hardcoded por arquivo — `ProjecaoResultadoDialog` 49, `GerarProjecaoDialog` 18,
> `ConfidenceBadge` 9 (`CONFIDENCE_STYLES`), `MarcarOficialButton` 2. Os dialogs hoje só importam `primary` →
> adicionar `surface`/`semantic`/`content` de `theme/tokens` e `elevation` de `shared/design-tokens`. Mapear
> escalas: bom→`success`, atenção→`warning`, ruim→`danger`, neutro/info→`info`/`surface`. Migrar casca para `CoachDialog`.

---

## Seção 1 — `GerarProjecaoDialog`

> `src/components/features/projecao/GerarProjecaoDialog.tsx`

- [ ] 1.1 Casca → `CoachDialog` (remover papel `#ffffff` + gradiente do title/content).
- [ ] 1.2 Boxes de seção (gradientes claros) → `elevation.card` + `content.cardBorder`; chip → tokens.
- [ ] 1.3 `DialogActions` (`#f8fafc`/`#e2e8f0`) e botão submit (`#0e3147`) → rodapé `CoachDialog` + botão padrão (`primary[500]`/`surface[900]`).
  - verify: gerar projeção funciona; dialog dark-first sem cores claras.

## Seção 2 — `ProjecaoResultadoDialog`

> `src/components/features/projecao/ProjecaoResultadoDialog.tsx`

- [ ] 2.1 Casca → `CoachDialog`; boxes de tabela/análise/premissas/CTL/goal/metadata → `elevation.card` + `content.cardBorder`.
- [ ] 2.2 Tipografia (`#0e3147`/`#4a5568`/`#2d3748`/`#6b7a8d`) → `surface[50]/[200]/[400]/[500]`.
- [ ] 2.3 Chip de confiança (mistura hex+token) → `semantic.*` consistente.
  - verify: tabela e gaps legíveis no fundo escuro; fluxo resultado intacto.

## Seção 3 — Objetos de cor + badges

- [ ] 3.1 `GAP_ASSESSMENT_COLORS` e `CTL_TREND_COLORS` (hex) → `semantic.success/info/danger` (mapear estado→token).
- [ ] 3.2 `ConfidenceBadge` (`CONFIDENCE_STYLES`) → `semantic.danger/warning/success`.
- [ ] 3.3 `MarcarOficialButton` (`#27ae60`/`#1e8449`) → `semantic.success[500]/[700]`.
  - verify: significado preservado (bom→success, atenção→warning, ruim→danger); zero hex no fluxo.

## Seção 4 — Validação + QA

- [ ] 4.1 `npm run lint && npm run build && npm run test:run`.
- [ ] 4.2 `/qa` (haiku + **Codex cross-model**) sem Critical.
- [ ] 4.3 Marcar itens `[x]`.

## Seção 5 — Entrega

- [ ] 5.1 Commits por seção (Conventional Commits PT-BR).
- [ ] 5.2 Push + PR contra `develop`.
