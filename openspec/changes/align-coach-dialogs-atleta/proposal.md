# Proposal — align-coach-dialogs-atleta

**Tamanho · Trilha:** S · Fast (frontend-only; sem mudança de API/DB)

> **2 de 3** da adequação dos dialogs ao padrão do shell coach. **Depende de `align-coach-dialogs-base-plano`**
> (usa o componente `CoachDialog`).

## Why

O `AtletaDialog` (criar/editar atleta), agora aberto a partir do roster `coach/atletas`, está em **tema
claro** (papel branco, gradientes claros, ações e tipografia hardcoded) — destoa do shell coach dark-first.
Como é o formulário de cadastro central, precisa parecer parte do produto.

## What Changes

**Somente `apps/menthoros-front`** — `src/components/features/atleta/AtletaDialog.tsx`:
- Migrar a casca para `CoachDialog` (ou aplicar o mesmo padrão): fundo `elevation.highest`, borda `content.cardBorder`, header uppercase `surface[50]`.
- Remover o **fundo branco** (`#ffffff`) e os **gradientes claros** do title/content/boxes → superfícies `elevation.card`/`${surface[0]}06` com borda `content.cardBorder`.
- Chip "Edição/Cadastro": `rgba(255,255,255,0.12)`/`#e8eaed` → tokens.
- Tipografia: textos `#1a2535`/`#6b7a8d` → `surface[50]/[200]/[400]`; manter Syne nos títulos.
- `DialogActions` (`#f8fafc`/`#e2e8f0`) → rodapé do `CoachDialog`; botões no padrão (primário `primary[500]`+`surface[900]`; cancelar `text`).
- Preservar 100% do comportamento do formulário (validação, `onSave`, `submitError`, loading).

## Acceptance Criteria

- **CA1** — `AtletaDialog` em dark-first: sem `#ffffff`/gradientes claros; superfícies e bordas via tokens.
- **CA2** — Header, campos, chip e ações no padrão do shell coach (via `CoachDialog`/tokens).
- **CA3** — Criar e editar atleta continuam funcionando (validação, erro de save, loading) — sem regressão.
- **CA4** — `npm run lint && npm run build && npm run test:run` verdes.

## Success Metric

Zero hex/rgba/gradiente claro hardcoded em `AtletaDialog`; visual indistinguível dos dialogs nativos do shell coach.

## Design / Abordagem

Reusa o `CoachDialog` da change-fundação. Campos do form (`TextField`/`Select`) herdam o tema MUI escuro;
onde houver `sx` com cor, trocar por tokens. Seções internas → `elevation.card` + `content.cardBorder`.

## Non-Goals

- Plano/projeção (changes irmãs). Mudança de comportamento/validação do form. Mover o arquivo para `features/coach`.

## Riscos e mitigações

- **Form usado também no `/atletas` legado:** mudar só estética (tokens), preservar estrutura/handlers; validar criar+editar nos dois pontos de entrada (roster e legado).
- **Contraste dos inputs no fundo escuro:** validar legibilidade (labels/placeholder) com os tokens.

## Dependência

`align-coach-dialogs-base-plano` mergeada em `develop` (componente `CoachDialog`).
