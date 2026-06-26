# Proposal — coach-roster-athlete-crud

**Tamanho · Trilha:** S · Fast (frontend-only; sem mudança de API/DB)

> Parte 2 de 2 da migração das ações do `/atletas` legado para o roster do coach.
> **Depende de `coach-roster-operational-actions`** (reusa a infra de ações por linha — menu kebab + estado).

## Why

Com as ações operacionais já no roster (change irmã), falta a **gestão de cadastro do atleta** —
criar, editar e excluir — que hoje só existe no `/atletas` legado (`AtletaDialog`). Trazê-la fecha a
paridade e permite descomissionar o legado.

Isolada numa change própria porque é o ponto de **maior risco** da migração: tem um gap de dados
(o roster traz resumo, o dialog precisa do atleta completo) e uma **operação destrutiva** (excluir) —
merece review e rollback próprios.

## What Changes

**Somente `apps/menthoros-front`.** No `CoachAthletesPage`, sobre a infra de ações da change irmã:

1. **Novo atleta** — botão no cabeçalho → `AtletaDialog` em modo criação (`atleta=undefined`).
2. **Editar** — item no menu de ações → busca o atleta completo e abre `AtletaDialog` preenchido.
3. **Excluir** — item no menu → `ConfirmDialog` → exclusão.

Reuso de `AtletaDialog` + `AtletasService`/`useCrud` as-is.

## Acceptance Criteria

- **CA1** — "Novo atleta" no cabeçalho abre `AtletaDialog` vazio; `onSave` cria via `AtletasService`/`useCrud`
  e o roster recarrega (`fetchRoster`).
- **CA2** — "Editar" busca o atleta completo via `AtletasService.buscarAtletaPorId(atletaId)` (com loading) e
  abre o `AtletaDialog` preenchido; `onSave` atualiza e o roster recarrega.
- **CA3** — "Excluir" exibe `ConfirmDialog`; ao confirmar, `deletarAtleta(atletaId)` e o roster recarrega.
- **CA4** — Os itens Editar/Excluir convivem no mesmo menu de ações da change irmã (Plano/Strava/Projeção).
- **CA5** — `npm run lint && npm run build && npm run test:run` verdes; CRUD coberto por testes (incl. o
  fluxo Editar com busca do atleta completo).

## Success Metric

O coach cria, edita e exclui atletas **sem sair do roster `coach/atletas`** — completando a paridade com o
`/atletas` legado.

## Design / Abordagem

- **Gap de dados (decisão central):** o roster só tem `CoachAtletaResumo`. `AtletaDialog` em edição precisa do
  `Atleta` completo (nascimento, peso, objetivo, dias…). Fluxo de Editar:
  1. `AtletasService.buscarAtletaPorId(atletaId)` (loading) → `Atleta`;
  2. `setAtletaParaEditar(atleta)` + abrir dialog;
  3. `onSave` → `atualizarAtleta` → fechar → `fetchRoster()`.
  Criar/Excluir não precisam buscar (criar: `atleta=undefined`; excluir: só `atletaId`).
- **Props confirmadas:** `AtletaDialog {open,onClose,onSave,atleta?}`; `ConfirmDialog` existe em
  `src/shared/components/ConfirmDialog.tsx`.
- **Estado adicional:** `atletaParaEditar: Atleta | null` + reaproveita `action`/`actionTarget` da infra.

## Non-Goals

- As ações operacionais (Plano/Strava/Projeção) — change irmã.
- Provas; remover o `/atletas` legado; migrar dialogs para `features/coach/components` — follow-ups.
- Mudança de backend/contrato/schema.

## Riscos e mitigações

- **Resumo × completo:** resolvido buscando o atleta completo ao editar (acima).
- **Operação destrutiva:** `ConfirmDialog` obrigatório antes de excluir; sem exclusão em massa.
- **Multi-tenancy:** endpoints já tenant-scoped; o roster limita aos atletas do coach.

## Dependência

`coach-roster-operational-actions` mergeada em `develop` — esta change adiciona itens ao menu de ações e ao
estado já criados por ela.
