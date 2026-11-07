# Tasks — inbox-lista-triagem

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-lista-triagem` em `apps/menthoros-front`, em worktree, a partir de
`develop` **depois** do merge de `inbox-barra-unica-sem-rodape` (PR #204): as duas mexem em
`CoachInboxPage.tsx`.

## 1. Linha densa

- [x] 1.1 `coachInboxAdapters.ts`: `contextoDaLinha(resumo, attention, hoje)` devolve
      `{ texto, tom }` na precedência sinal → pausado → fase/último treino, com os textos do
      proposal; `buildRosterRowFromSummary` preserva `aderenciaPercentual` ausente
      (`adherenceAvailable: false`, "—"). Teste de adapter (CA2, CA3), com ausência e 0% separados. verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters`.
- [x] 1.2 `QueueRow` e `AttentionOnlyRow`: layout de uma linha (avatar, nome + contexto,
      aderência mono à direita com cor pelo valor, "—" sem dado); chip e barra saem; moldura e
      cor do contexto seguem o sinal; textos secundários em `surface-400`. Reescrever
      `QueueRow.test.tsx` e `AttentionOnlyRow.test.tsx` (CA1, CA2, CA6).
      verify: `npx vitest run src/features/coach/components/QueueRow src/features/coach/components/AttentionOnlyRow`.
- [x] 1.3 Validação: lint, build, test:run.

## 2. Header da coluna

- [x] 2.1 `useDashboardFilters`: `'attention'` em `DashboardStatusFilter`, aceito por
      `parseDashboardStatus`, gravado como `?status=attention`, `status` ausente na query da
      API, `dashboardPage` preservado ao entrar/sair de atenção, `resetFilters` → `all`.
      `buildInboxQueue`: com `attention`, ignora o status do roster, aplica `q` por nome,
      devolve só os fixados e conta em `hiddenAttentionCount` os escondidos pela busca.
      Estado `vazio-atencao`. Testes (CA4).
      verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters src/features/coach/hooks/useDashboardFilters`.
      Achado no caminho: `useDashboardFilters` mantinha `page` em estado local e na URL, com dois
      efeitos de sincronização que brigavam quando um handler mudava os dois no mesmo ato — a
      página oscilava 2 ↔ 0 sem parar e a troca de status se perdia (reproduzido no teste do hook a
      partir de `?page=2`). A página passou a ser derivada da URL, como status e ordenação.
- [x] 2.2 `CoachInboxPage`: busca sai da barra do topo para o header da coluna; filtro segmentado
      (`ToggleButtonGroup` exclusivo: Todos (T) · Em atenção (M) · Pausados); ordenação em
      `IconButton` com `aria-label="Ordenar lista"` e o mesmo menu; "10 de 23 · página 1/3" em
      `surface-400`; `TablePagination` com `labelDisplayedRows` PT-BR e só com `totalPages > 1`.
      Atualizar `CoachInboxPage.test.tsx` (filtros na coluna, estados, CA4, CA5, CA7).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 2.3 Validação: lint, build, test:run.

## 3. E2E

- [x] 3.1 `tests/e2e/coach/inbox.spec.ts`: fixture nova (3 na fila, 15 no roster, um deles
      sem `aderenciaPercentual`); ≥ 6 linhas com bounding box inteiro dentro do contêiner da
      lista em 1366×625 e cada linha ≤ 52px (CA1); "Em atenção" da página 2 mostra os 3, URL
      `status=attention`, sem paginação, "Todos" volta à página 2 (CA4); busca no header da
      coluna (CA5); "1–10 de 23" e sem rodapé com 10 (CA7). Migrar as asserções existentes:
      `/\d+d/`, "of 15", menu "Atenção" (CA8); o teste de 11px continua.
      verify: `npx playwright test inbox`.
      Medido em 1366×625: 7 linhas inteiras de 46px (CA1 pedia ≥ 6 e ≤ 52).
- [x] 3.2 Suite completa; `/qa`; PR → `develop`.
      Parcial (2026-11-07): lint, build, 2872 unitários e E2E completo verdes. `/qa` (frontend,
      clean-code, Codex) sem Critical; ajustes em commit próprio: status legado na URL sem
      "Todos" marcado por cima, dias de calendário no último treino (Codex), página zerada ao
      sair de atenção para status do roster, efeitos de `q` com ref, nomes em inglês. PR: llsilvas/menthoros-front#205.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 5.1 e 5.2
      como entregues aqui.
