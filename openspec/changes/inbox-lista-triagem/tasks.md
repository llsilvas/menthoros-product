# Tasks — inbox-lista-triagem

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-lista-triagem` em `apps/menthoros-front`, em worktree, a partir de
`develop` **depois** do merge de `inbox-barra-unica-sem-rodape` (PR #204): as duas mexem em
`CoachInboxPage.tsx`.

## 1. Linha densa

- [ ] 1.1 `coachInboxAdapters.ts`: `contextoDaLinha(row, attention)` devolve `{ texto, tom }` na
      precedência sinal → prova → pausado → disciplina/semanas; recência como "há N dias".
      Teste de adapter (CA2, CA3). verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters`.
- [ ] 1.2 `QueueRow` e `AttentionOnlyRow`: layout de uma linha (avatar, nome + contexto,
      aderência mono à direita com cor pelo valor, "—" sem dado); chip e barra saem; moldura e
      cor do contexto seguem o sinal; textos secundários em `surface-400`. Reescrever
      `QueueRow.test.tsx` e `AttentionOnlyRow.test.tsx` (CA1, CA2, CA6).
      verify: `npx vitest run src/features/coach/components/QueueRow src/features/coach/components/AttentionOnlyRow`.
- [ ] 1.3 Validação: lint, build, test:run.

## 2. Header da coluna

- [ ] 2.1 `useDashboardFilters`: valor `attention` no filtro (só cliente; a API recebe `status`
      vazio). `buildInboxQueue`: com `attention`, devolve só os fixados, sem `restante`, e
      `hiddenAttentionCount = 0`. Testes (CA4).
      verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters src/features/coach/hooks/useDashboardFilters`.
- [ ] 2.2 `CoachInboxPage`: busca sai da barra do topo para o header da coluna; filtro segmentado
      (`ToggleButtonGroup` exclusivo: Todos (T) · Em atenção (M) · Pausados); ordenação em
      `IconButton` com `aria-label="Ordenar lista"` e o mesmo menu; "10 de 23 · página 1/3" em
      `surface-400`; `TablePagination` com `labelDisplayedRows` PT-BR e só com `totalPages > 1`.
      Atualizar `CoachInboxPage.test.tsx` (filtros na coluna, estados, CA4, CA5, CA7).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 2.3 Validação: lint, build, test:run.

## 3. E2E

- [ ] 3.1 `tests/e2e/coach/inbox.spec.ts`: ≥ 6 linhas inteiras em 1366×625 e linha ≤ 52px (CA1);
      "Em atenção" com 3 na fila e 15 no roster mostra os 3 e esconde a paginação (CA4); busca
      no header da coluna (CA5); "1–10 de 23" e sem rodapé com 10 (CA7); o teste de 11px
      continua verde. verify: `npx playwright test inbox`.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 5.1 e 5.2
      como entregues aqui.
