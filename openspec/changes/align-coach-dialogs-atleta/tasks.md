# Tasks — align-coach-dialogs-atleta

> Repo: `apps/menthoros-front` · Branch: `feature/align-coach-dialogs-atleta`
> Dependência: `align-coach-dialogs-base-plano` mergeada em `develop` (`CoachDialog`).
> Frontend-only (Fast track). Tokens — nunca hex. Validar por seção: `npm run lint && npm run build && npm run test:run`.

---

## Seção 1 — Casca no padrão

> `src/components/features/atleta/AtletaDialog.tsx`

- [x] 1.1 Migrar para `CoachDialog` (ou aplicar `PaperProps` equivalentes): remover `Paper` branco (`#ffffff`)
  e o gradiente do `DialogTitle`/`DialogContent` → `elevation.highest` (casca) + header padrão.
  - verify: dialog abre em dark-first, sem fundo claro; header uppercase `surface[50]`.

## Seção 2 — Superfícies internas e tipografia

- [x] 2.1 Boxes de seção do form (gradientes claros) → `elevation.card` + `border content.cardBorder`.
- [x] 2.2 Chip "Edição/Cadastro" (`rgba(255,255,255,0.12)`/`#e8eaed`) → tokens.
- [x] 2.3 Tipografia: `#1a2535`/`#6b7a8d`/demais → `surface[50]/[200]/[400]`; manter Syne nos títulos.
  - verify: contraste legível (labels/inputs/placeholder) no fundo escuro.

## Seção 3 — Ações

- [x] 3.1 `DialogActions` (`#f8fafc`/`#e2e8f0`) → rodapé `CoachDialog`; botões padrão (primário
  `primary[500]`+`surface[900]`+`fontWeight 800`; cancelar `text` `surface[400]`).
  - verify: salvar/cancelar funcionam; loading e `submitError` preservados.

## Seção 4 — Validação + QA

- [x] 4.1 `npm run lint && npm run build && npm run test:run`.
- [x] 4.2 `/qa` (haiku + **Codex cross-model**) sem Critical.
- [x] 4.3 Validar criar+editar pelo roster **e** pelo `/atletas` legado (mesmo componente).
- [x] 4.4 Marcar itens `[x]`.

## Seção 5 — Entrega

- [x] 5.1 Commits por seção (Conventional Commits PT-BR).
- [ ] 5.2 Push + PR contra `develop`.
