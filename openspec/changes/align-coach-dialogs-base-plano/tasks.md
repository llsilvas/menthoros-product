# Tasks — align-coach-dialogs-base-plano

> Repo: `apps/menthoros-front` · Branch: `feature/align-coach-dialogs-base-plano`
> Frontend-only (Fast track). Sem mudança de API/DB. Tokens de `theme/tokens.ts` + `shared/design-tokens` — nunca hex.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.
> Referências do padrão: `features/coach/components/TreinoEditDialog.tsx`, `PlanoDetalhePanel` (RejeicaoModal).
>
> **Refino contra o código (init)** — `surface[0]` = branco; usar opacidade hex nos tokens (`${surface[0]}1F` etc.):
> - `planosDialog.tsx`: chip "plano(s)" (`314-318`: `rgba(255,255,255,0.12)`/`#e8eaed`); botão Recalcular
>   (`395-403`: `#ffffff`/`rgba(255,255,255,0.18/0.04)`); botão Excluir (`416-424`: `#fecaca`/`rgba(248,113,113…)`/`rgba(127,29,29…)`
>   → `semantic.danger`); ToggleButtonGroup (`369-371`: `rgba(255,255,255,…)` → `surface[200]`/`content.cardBorder`/`${surface[0]}0A`).
>   A casca já usa `elevation.base`/`content.cardBorder` (`289-290`) — manter; migração para `CoachDialog` é opcional.
> - `TreinoCard.tsx`: `getRpeColor` (`68-75`, hex) → 3 zonas semânticas (RPE ≤4 `success[500]`, ≤7 `warning[500]`, >7 `danger[500]`);
>   caixa de insight (`238-350`) → `elevation`/`semantic.warning`/`surface`.

---

## Seção 1 — Componente base `CoachDialog`

- [x] 1.1 Criar `src/features/coach/components/CoachDialog.tsx`:
  - Props: `{ open, onClose, title, maxWidth?, headerAction?, actions?, children }`.
  - `PaperProps.sx`: `bgcolor: elevation.highest`, `border: 1px ${content.cardBorder}`, `borderRadius: '12px'`, `overflow: 'hidden'`.
  - Header: `Box` com `borderBottom: ${content.divider}`; `Typography` `surface[50]`, `fontWeight 700`, `textTransform: uppercase`, `letterSpacing: 0.08em`; `headerAction` à direita (opcional).
  - `DialogContent` (px 2.5 / py 2) + `DialogActions` (px 2.5 / pb 2) renderizado só quando `actions`.
  - verify: render isolado mostra fundo escuro, borda sutil, header uppercase; build verde.

## Seção 2 — Adequar `PlanosDialog`

> `src/components/features/planos/planosDialog.tsx`

- [x] 2.1 Chip de planos (`rgba(255,255,255,0.12)` / `#e8eaed`) → tokens (`${surface[0]}1F` / `surface[200]`).
- [x] 2.2 Botões "Recalcular" e "Excluir plano" (cores inline hardcoded) → tokens
  (`surface`/`content` para o neutro; `semantic.danger` para o delete).
- [x] 2.3 (Opcional) Migrar a casca do `PlanosDialog` para `CoachDialog` se reduzir código sem regressão;
  senão, manter a estrutura atual (já usa `elevation`/`content`).
  - verify: nenhum hex/rgba hardcoded no arquivo; ver/gerar/excluir/recalcular intactos.

## Seção 3 — Adequar `TreinoCard` (filho do PlanosDialog)

> `src/components/features/planos/TreinoCard.tsx`

- [x] 3.1 `getRpeColor()` (hex `#4caf50`…`#f44336`) → escala com `semantic.success`/`warning`/`danger`.
- [x] 3.2 Caixa de insight (gradiente + rgba hardcoded) → tokens (`elevation`/`semantic.warning` + `surface`).
  - verify: card de treino e insight coerentes com o dark-first; sem hex hardcoded.

## Seção 4 — Validação + QA

- [x] 4.1 `npm run lint && npm run build && npm run test:run`.
- [x] 4.2 `/qa` (frontend-reviewer + clean-code-reviewer haiku + **Codex cross-model**) sem Critical.
- [x] 4.3 Marcar itens `[x]`.

## Seção 5 — Entrega

- [x] 5.1 Commits por seção (Conventional Commits PT-BR).
- [ ] 5.2 Push + PR contra `develop`.
