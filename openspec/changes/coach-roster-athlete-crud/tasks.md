# Tasks — coach-roster-athlete-crud

> Repo: `apps/menthoros-front` · Branch: `feature/coach-roster-athlete-crud`
> Dependência: `coach-roster-operational-actions` mergeada em `develop` (infra de ações por linha) — **OK**.
> Frontend-only (Fast track). Sem mudança de API/DB.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.
>
> **Refino contra o código (init):**
> - Usar **`AtletasService` direto** (`cadastraAtleta`/`atualizarAtleta`/`deletarAtleta`/`buscarAtletaPorId`) +
>   `fetchRoster` — **não** `useCrud` (ele mantém uma lista própria + faz `fetchAtletas` no mount, redundante com o roster).
> - `AtletaDialog` props: `{ open, onClose, onSave:(CreateAtleta|UpdateAtleta)=>Promise<void>, atleta? }`.
> - `UpdateAtleta extends Partial<CreateAtleta>` e `atualizarAtleta(id, body: CreateAtleta)` → no Editar, fazer
>   **merge** `{ ...atletaParaEditar, ...formData }` (reaproveita o atleta completo já buscado p/ preencher o dialog;
>   replica o padrão de merge do `useCrud.updateAtleta`, sem 2ª busca).
> - Estender o estado da infra: `RosterActionType` += `'atleta-new' | 'atleta-edit'`; novo `atletaParaEditar: Atleta | null`.
> - O botão **"Adicionar"** já existe no toolbar do roster (sem `onClick`) → wire para criar.
> - Excluir: `ConfirmDialog` (`severity="danger"`) já existe em `src/shared/components/ConfirmDialog.tsx`.

---

## Seção 1 — Criar atleta

> Arquivo: `src/features/coach/pages/CoachAthletesPage.tsx`

- [x] 1.1 Botão "Novo atleta" (`PersonAdd`) no cabeçalho do roster → abre `AtletaDialog` (`atleta=undefined`).
- [x] 1.2 `onSave` → criar via `AtletasService`/`useCrud` → fechar → `fetchRoster()`.
  - verify: criar adiciona o atleta e o roster reflete.

## Seção 2 — Editar atleta (gap de dados)

- [x] 2.1 Item "Editar" no menu de ações → `AtletasService.buscarAtletaPorId(atletaId)` (com loading) →
  `setAtletaParaEditar(atleta)` → abrir `AtletaDialog` preenchido.
- [x] 2.2 `onSave` → `atualizarAtleta` → fechar → `fetchRoster()`.
  - verify: Editar carrega os dados completos do atleta; salvar atualiza e o roster reflete.

## Seção 3 — Excluir atleta (destrutivo)

- [x] 3.1 Item "Excluir" no menu → `ConfirmDialog` (`src/shared/components/ConfirmDialog.tsx`).
- [x] 3.2 Ao confirmar → `deletarAtleta(atletaId)` → `fetchRoster()`.
  - verify: exclusão pede confirmação; cancelar não exclui; confirmar remove e o roster reflete.

## Seção 4 — Testes

- [x] 4.1 Teste de comportamento: Novo atleta abre dialog vazio; Editar busca o atleta completo (mock
  `AtletasService.buscarAtletaPorId`) e abre preenchido; Excluir pede confirmação antes de chamar `deletarAtleta`.
  - verify: `npm run test:run` verde.

## Seção 5 — Validação final

- [x] 5.1 `npm run lint && npm run build && npm run test:run`.
- [x] 5.2 `/qa` (frontend-reviewer + clean-code-reviewer) sem achado Critical.
- [x] 5.3 Marcar itens `[x]` neste `tasks.md`.

## Seção 6 — Entrega

- [x] 6.1 Commits por seção lógica (Conventional Commits PT-BR).
- [ ] 6.2 Push + PR contra `develop` (não mergear local).

---

## Follow-ups (registrados, fora do escopo)

- **Inconsistência de URL no `AtletasService` (achado do Codex no QA):** `buscarAtletaPorId` chama
  `GET /v1/atletas/{id}` enquanto os demais métodos usam `/api/v1/atletas/...`. Débito pré-existente do
  cliente curado, também consumido pelo `/atletas` legado — investigar e alinhar com o backend (o error
  handling desta change já torna a falha visível, não silenciosa). Não corrigido aqui por risco ao legado.
- Migrar Provas (`ProvasDialog`) para o roster.
- Migrar fisicamente os dialogs legados para `features/coach/components`.
- Descomissionar o `/atletas` legado após validar paridade.
