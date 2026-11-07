# Tasks — inbox-barra-unica-sem-rodape

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-barra-unica-sem-rodape` em `apps/menthoros-front`, em worktree.

## 1. Barra única

- [x] 1.1 `adapters/inboxSummaryKpis.ts` → `buildInboxSummaryLine(s)`: devolve os quatro
      segmentos em linha (`ativos`, `atencao`, `treinos`, `atualizado`); a página passa
      `atencao = dashboardAttentionQueue.length`. `buildInboxSummaryKpiViews` sai e
      `inboxSummaryKpis.test.ts` é reescrito junto (o caso "Atletas exibidos" some). Teste de
      adapter (CA2). verify: `npx vitest run src/features/coach/adapters/inboxSummaryKpis`.
- [x] 1.2 `CoachInboxPage`: cabeçalho vira barra única (título "Inbox" 17px com
      `data-testid="inbox-titulo"`, resumo `data-testid="inbox-resumo"`, busca à direita, altura
      ≤ 56px); saem eyebrow, descrição, `KpiStrip` do resumo, "Atualizado em" e o KPI "Atletas
      exibidos". `title` do "atualizado" com data completa. Abaixo de `md` a busca quebra de
      linha (CA1). Limpar imports que ficam sem uso: `KpiStrip`, `INBOX_SUMMARY_ICON` e os
      ícones dele. Atualizar `CoachInboxPage.test.tsx` (o teste "resumo do topo na faixa de KPIs"
      vira "resumo em linha"; CA1, CA2).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 1.3 Validação: lint, build, test:run.

## 2. Rodapé fora

- [x] 2.1 `CoachInboxPage`: remover a barra do rodapé, o `Menu` **do rodapé** (`menuAnchor`,
      `setMenuAnchor(null)` em `openRejectDialog`), `MoreHorizIcon`, `ChatBubbleOutlineIcon`,
      `ACTION_BTN_END_ICON_SX` e as três ações simuladas — os `Menu` de status e ordenação da
      lista ficam; "Ajustar plano" (outlined, `TuneIcon`) no cabeçalho do atleta depois do CTA e
      do "Rejeitar", abrindo a aba Plano.
      `data-testid="inbox-detalhe-conteudo"` na área rolável. Testes de componente: CA3, CA4.
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 2.2 Validação: lint, build, test:run.

## 3. E2E

- [x] 3.1 `tests/e2e/coach/inbox.spec.ts`: barra única (sem `inbox-kpi-*`, "3 em atenção" com
      `resumo.emAtencao = 0`), sem rodapé, "Ajustar plano" visível no cabeçalho e abrindo a aba
      Plano (CA1, CA2, CA3). `notebook-viewport.spec.ts`: **testes novos** (o spec atual usa
      1024×640 e dashboard vazio): 1366×625 com atleta selecionado e dashboard/perfil válidos,
      `inbox-detalhe-conteudo` ≥ 45% da altura (CA5); 1093×500 com plano aguardando revisão,
      nome e prova longos, três ações inteiras na viewport e detalhe ≥ 40% (CA6).
      verify: `npx playwright test inbox notebook-viewport`.
      Os três testes ficaram em `inbox.spec.ts` (é onde o inbox já tem mock de dashboard real;
      `notebook-viewport.spec.ts` cobre as outras telas, como seu cabeçalho diz). O mock do
      spec não modela `summary.kpis`, então "ativos de total" não é afirmado no E2E — fica no
      teste de componente. Medido: barra 53px; detalhe 1366×625 e 1093×500 acima do gate.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 3.1–3.3b e
      4.2 como entregues aqui.
