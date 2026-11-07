# Tasks — inbox-barra-unica-sem-rodape

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-barra-unica-sem-rodape` em `apps/menthoros-front`, em worktree.

## 1. Barra única

- [ ] 1.1 `adapters/inboxSummaryKpis.ts` → `buildInboxSummaryLine(s)`: devolve os quatro
      segmentos em linha (`ativos`, `atencao`, `treinos`, `atualizado`), com `atencao` vindo de
      `attentionQueue.length`. Teste de adapter (CA2). verify: `npx vitest run src/features/coach/adapters/inboxSummaryKpis`.
- [ ] 1.2 `CoachInboxPage`: cabeçalho vira barra única (título "Inbox" 17px com
      `data-testid="inbox-titulo"`, resumo `data-testid="inbox-resumo"`, busca à direita, altura
      ≤ 56px); saem eyebrow, descrição, `KpiStrip` do resumo, "Atualizado em" e o KPI "Atletas
      exibidos". `title` do "atualizado" com data completa. Atualizar `CoachInboxPage.test.tsx`
      (o teste "resumo do topo na faixa de KPIs" vira "resumo em linha"; CA1, CA2).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 1.3 Validação: lint, build, test:run.

## 2. Rodapé fora

- [ ] 2.1 `CoachInboxPage`: remover a barra do rodapé, `Menu`, `menuAnchor`, `MoreHorizIcon`,
      `ChatBubbleOutlineIcon` e as três ações simuladas; "Ajustar plano" (outlined, `TuneIcon`)
      no cabeçalho do atleta depois do CTA e do "Rejeitar", abrindo a aba Plano.
      `data-testid="inbox-detalhe-conteudo"` na área rolável. Testes de componente: CA3, CA4.
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 2.2 Validação: lint, build, test:run.

## 3. E2E

- [ ] 3.1 `tests/e2e/coach/inbox.spec.ts`: barra única (sem `inbox-kpi-*`, "3 em atenção" com
      `resumo.emAtencao = 0`), sem rodapé, "Ajustar plano" visível no cabeçalho e abrindo a aba
      Plano (CA1, CA2, CA3). `notebook-viewport.spec.ts`: em 1366×625 com atleta selecionado,
      `inbox-detalhe-conteudo` ≥ 45% da altura (CA5). verify: `npx playwright test inbox notebook-viewport`.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 3.1–3.3b e
      4.2 como entregues aqui.
