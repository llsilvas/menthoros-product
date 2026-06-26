# Tasks — coach-roster-athlete-actions

> Repo: `apps/menthoros-front` · Branch: `feature/coach-roster-athlete-actions`
> Frontend-only (Full track). Sem mudança de API/DB. Reusa dialogs/hooks legados as-is.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.

---

## Seção 1 — Infra de ações no roster

> Arquivo: `src/features/coach/pages/CoachAthletesPage.tsx`

- [ ] 1.1 Adicionar estado de ação: `action: RosterAction`, `actionTarget: {atletaId, nome} | null`,
  `atletaParaEditar: Atleta | null` (ver `design.md` Decisão 2).
- [ ] 1.2 Adicionar coluna final "Ações" (`sortable: false`, largura fixa) com `IconButton` (`MoreVert`)
  que abre um `Menu` por linha. Itens: Plano · Gerar plano · Sincronizar Strava · Projeção · Editar · Excluir.
  - verify: o menu abre na linha certa e o `actionTarget` recebe `{atletaId, nome}` daquela linha.
- [ ] 1.3 Adicionar botão "Novo atleta" (`PersonAdd`) no cabeçalho do roster → abre `AtletaDialog` em criação.
  - verify: build verde; grade de leitura existente intacta (colunas/filtros/busca/navegação ao perfil).

## Seção 2 — Plano (PlanosDialog)

- [ ] 2.1 Renderizar `PlanosDialog` controlado por `action === 'plano'`, passando `atletaId`/`atletaNome` do alvo.
- [ ] 2.2 Garantir que ver/gerar/excluir plano funcionam via `usePlanoSemanal` (já encapsulado no dialog);
  ao gerar/excluir com sucesso, chamar `fetchRoster()`.
  - verify: abrir Plano lista os planos do atleta; gerar cria; excluir remove; roster reflete.

## Seção 3 — Sincronizar Strava

- [ ] 3.1 Acionar `SyncStravaButton`/`useStravaSync(atletaId)` a partir do item de menu (ver `design.md`
  Decisão 4); `connected={false}` (hook resolve), `onSyncComplete={fetchRoster}`.
  - verify: disparar sync reflete estado (sincronizando/concluído/erro) e recarrega o roster ao importar.

## Seção 4 — Projeção de performance

- [ ] 4.1 Renderizar `GerarProjecaoDialog` controlado por `action === 'projecao'` (atletaId/nome do alvo);
  encadear `ProjecaoResultadoDialog` conforme o fluxo legado.
  - verify: gerar projeção exibe o resultado (tempo/pace/confiança) para o atleta selecionado.

## Seção 5 — CRUD de atleta

- [ ] 5.1 **Criar:** "Novo atleta" abre `AtletaDialog` (`atleta=undefined`); `onSave` → criar via
  `AtletasService`/`useCrud` → fechar → `fetchRoster()`.
- [ ] 5.2 **Editar:** ao clicar Editar, `AtletasService.buscarAtletaPorId(atletaId)` (com loading) →
  `setAtletaParaEditar` → abrir `AtletaDialog` em edição; `onSave` → atualizar → fechar → `fetchRoster()`.
- [ ] 5.3 **Excluir:** `ConfirmDialog` → `deletarAtleta(atletaId)` → `fetchRoster()`.
  - verify: criar/editar/excluir refletem no roster; editar carrega os dados completos do atleta.

## Seção 6 — Testes

- [ ] 6.1 Teste de comportamento (Vitest + Testing Library): o menu de ações abre e cada item dispara o
  dialog/ação correto para o atleta da linha (mockar serviços/hooks).
- [ ] 6.2 Teste do fluxo Editar: clicar Editar busca o atleta completo e abre o dialog preenchido (mock
  `AtletasService.buscarAtletaPorId`).
- [ ] 6.3 Regressão: grade de leitura (colunas/filtros/busca) permanece funcional.
  - verify: `npm run test:run` verde.

## Seção 7 — Validação final

- [ ] 7.1 `npm run lint && npm run build && npm run test:run`.
- [ ] 7.2 `/qa` (frontend-reviewer + clean-code-reviewer) sem achado Critical.
- [ ] 7.3 Marcar itens `[x]` neste `tasks.md`.

## Seção 8 — Entrega

- [ ] 8.1 Commits por seção lógica (Conventional Commits PT-BR).
- [ ] 8.2 Push + PR contra `develop` (não mergear local).

---

## Follow-ups (registrados, fora do escopo)

- Migrar Provas (`ProvasDialog`) para o roster.
- Migrar fisicamente os dialogs legados para `features/coach/components`.
- Descomissionar o `/atletas` legado após validar paridade.
