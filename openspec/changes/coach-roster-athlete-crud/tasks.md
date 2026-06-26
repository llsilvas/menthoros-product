# Tasks — coach-roster-athlete-crud

> Repo: `apps/menthoros-front` · Branch: `feature/coach-roster-athlete-crud`
> Dependência: `coach-roster-operational-actions` mergeada em `develop` (infra de ações por linha).
> Frontend-only (Fast track). Sem mudança de API/DB.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.

---

## Seção 1 — Criar atleta

> Arquivo: `src/features/coach/pages/CoachAthletesPage.tsx`

- [ ] 1.1 Botão "Novo atleta" (`PersonAdd`) no cabeçalho do roster → abre `AtletaDialog` (`atleta=undefined`).
- [ ] 1.2 `onSave` → criar via `AtletasService`/`useCrud` → fechar → `fetchRoster()`.
  - verify: criar adiciona o atleta e o roster reflete.

## Seção 2 — Editar atleta (gap de dados)

- [ ] 2.1 Item "Editar" no menu de ações → `AtletasService.buscarAtletaPorId(atletaId)` (com loading) →
  `setAtletaParaEditar(atleta)` → abrir `AtletaDialog` preenchido.
- [ ] 2.2 `onSave` → `atualizarAtleta` → fechar → `fetchRoster()`.
  - verify: Editar carrega os dados completos do atleta; salvar atualiza e o roster reflete.

## Seção 3 — Excluir atleta (destrutivo)

- [ ] 3.1 Item "Excluir" no menu → `ConfirmDialog` (`src/shared/components/ConfirmDialog.tsx`).
- [ ] 3.2 Ao confirmar → `deletarAtleta(atletaId)` → `fetchRoster()`.
  - verify: exclusão pede confirmação; cancelar não exclui; confirmar remove e o roster reflete.

## Seção 4 — Testes

- [ ] 4.1 Teste de comportamento: Novo atleta abre dialog vazio; Editar busca o atleta completo (mock
  `AtletasService.buscarAtletaPorId`) e abre preenchido; Excluir pede confirmação antes de chamar `deletarAtleta`.
  - verify: `npm run test:run` verde.

## Seção 5 — Validação final

- [ ] 5.1 `npm run lint && npm run build && npm run test:run`.
- [ ] 5.2 `/qa` (frontend-reviewer + clean-code-reviewer) sem achado Critical.
- [ ] 5.3 Marcar itens `[x]` neste `tasks.md`.

## Seção 6 — Entrega

- [ ] 6.1 Commits por seção lógica (Conventional Commits PT-BR).
- [ ] 6.2 Push + PR contra `develop` (não mergear local).

---

## Follow-ups (registrados, fora do escopo)

- Migrar Provas (`ProvasDialog`) para o roster.
- Migrar fisicamente os dialogs legados para `features/coach/components`.
- Descomissionar o `/atletas` legado após validar paridade.
