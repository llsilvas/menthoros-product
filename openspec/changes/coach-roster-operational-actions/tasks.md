# Tasks — coach-roster-operational-actions

> Repo: `apps/menthoros-front` · Branch: `feature/coach-roster-operational-actions`
> Frontend-only (Fast track). Reusa dialogs/hooks legados as-is. Sem mudança de API/DB.
> Validar por seção: `npm run lint && npm run build && npm run test:run`.

---

## Seção 1 — Infra de ações no roster

> Arquivo: `src/features/coach/pages/CoachAthletesPage.tsx`

- [ ] 1.1 Estado de ação: `action: 'plano' | 'projecao' | null`, `actionTarget: {atletaId, nome} | null`.
- [ ] 1.2 Coluna final "Ações" (`sortable:false`, largura fixa) com `IconButton(MoreVert)` que abre um
  `Menu` por linha. Itens: Plano · Gerar plano · Sincronizar Strava · Projeção.
  - verify: menu abre na linha certa; `actionTarget` recebe `{atletaId, nome}` daquela linha; grade de
    leitura (colunas/filtros/busca/navegação ao perfil) intacta.

## Seção 2 — Plano (PlanosDialog)

- [ ] 2.1 Renderizar `PlanosDialog` controlado por `action === 'plano'` (passa `atletaId`/`atletaNome` do alvo).
- [ ] 2.2 Ao gerar/excluir plano com sucesso, chamar `fetchRoster()`.
  - verify: abrir Plano lista planos do atleta; gerar cria; excluir remove; roster reflete.

## Seção 3 — Sincronizar Strava

- [ ] 3.1 Acionar `SyncStravaButton`/`useStravaSync(atletaId)` pelo item de menu (`connected={false}`,
  `onSyncComplete={fetchRoster}`).
  - verify: sync reflete estado (sincronizando/concluído/erro) e recarrega o roster ao importar.

## Seção 4 — Projeção de performance

- [ ] 4.1 Renderizar `GerarProjecaoDialog` controlado por `action === 'projecao'` (atletaId/nome do alvo);
  encadear `ProjecaoResultadoDialog` conforme o fluxo legado.
  - verify: gerar projeção exibe o resultado (tempo/pace/confiança) para o atleta selecionado.

## Seção 5 — Testes

- [ ] 5.1 Teste de comportamento (Vitest + Testing Library): o menu abre e cada item dispara o dialog/ação
  correto para o atleta da linha (mockar serviços/hooks).
- [ ] 5.2 Regressão: grade de leitura permanece funcional.
  - verify: `npm run test:run` verde.

## Seção 6 — Validação final

- [ ] 6.1 `npm run lint && npm run build && npm run test:run`.
- [ ] 6.2 `/qa` (frontend-reviewer + clean-code-reviewer) sem achado Critical.
- [ ] 6.3 Marcar itens `[x]` neste `tasks.md`.

## Seção 7 — Entrega

- [ ] 7.1 Commits por seção lógica (Conventional Commits PT-BR).
- [ ] 7.2 Push + PR contra `develop` (não mergear local).
