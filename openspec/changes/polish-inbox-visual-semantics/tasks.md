# Tasks — polish-inbox-visual-semantics

Repo: `apps/menthoros-front`, branch `feature/polish-inbox-visual-semantics`. Validação padrão:
`npm run lint && npm run build` (+ `npm run test:run` quando a task toca lógica/componente).

Levantamento de código (2026-09-18, `/implement init`):
- **Rotas:** router único em `src/App.tsx` (`createHashRouter`, linha 67); bloco do coach em
  `:118-132`. **Nenhuma rota tem `errorElement` hoje** — não existe padrão prévio, é a primeira
  introdução do conceito no repo.
- **Badges de status:** não há um componente único — **7 locais distintos** com mapa de
  cor→severidade próprio, todos via `sx` hardcoded (não `color` prop do MUI): `StatusBadge.tsx`
  (compartilhado, consumido em `AthleteRow.tsx:352`, `CoachAthleteProfilePage.tsx:193`,
  `CoachAthletesPage.tsx:401,529`, `PlanoDetalhePanel.tsx`), `QueueRow.tsx:22-26` +
  `coachInboxHelpers.ts:7-25` (fila), `RecentSignalsPanel.tsx:11-15`, `AIInsightCard.tsx:13-15`,
  `CoachAttentionQueuePage.tsx:14-16` (rota inativa, ver `App.tsx:20`), `toneMarker.tsx:14-18`
  (não é badge, é ícone+texto). `palette.error`/`palette.warning` já mapeiam os mesmos tokens
  `semantic.danger`/`semantic.warning` em `appTheme.ts:29-30` — não precisa criar token novo.
  **Escopo desta change (1.2) é só o par badge+card da FILA do inbox** (`AthleteRow.tsx` via
  `StatusBadge` + `QueueRow.tsx`), que é o par descrito no "Why" da proposta (badge âmbar vs. card
  vermelho no mesmo item da fila). Os outros 5 locais ficam fora — nenhum deles foi citado na
  ambiguidade original, e uniformizar os 7 de uma vez foge do XS/Fast; registrar como follow-up
  informal se aparecer de novo.
- **KPI strip:** mesmo adapter (`buildSelectedAthleteFromDashboard`,
  `coachInboxAdapters.ts:158-221`) já produz `quickStats.hasWindowData` (linha 209), usado hoje só
  por `DiagnosisTabPanel.tsx:145-181` (`EmptyMetricState` quando `false`). O strip do cabeçalho
  (`CoachInboxPage.tsx:756-773` e `:776-803`) e os tiles de Aderência/Carga(7d) NÃO consultam a
  flag — usam fallback numérico (`?? 0`). Forma/ACWR já degradam pra "—", mas por `null` técnico
  do cálculo, não por `hasWindowData` — não distinguem zero legítimo. **Não precisa mudar API nem
  criar flag nova** — a premissa do proposal se confirma: é consumir `hasWindowData` que já chega
  no mesmo objeto `selected`.

- [ ] 1.1 Migrar os secundários do rodapé do painel (Enviar mensagem / Ajustar plano / Mais ações)
      de lime outline para outline neutro; migrar o estado selecionado do toggle do PMC
      (Simples/Avançado + período) de lime sólido para neutro.
      *verify:* `npm run lint && npm run build` + inspeção visual (dev server) confirmando accent
      restrito a CTA primário + nav ativa (sidebar/tab).
- [ ] 1.2 `AthleteRow.tsx` (badge, via `StatusBadge`) + `QueueRow.tsx` (card, via
      `coachInboxHelpers.ts`): status "Alerta" migra pra paleta `error`; "Atenção" permanece
      `warning`. Atualizar `STATUS_LABEL`/`statusPalette` e os testes que assertem cor/variante
      desses dois componentes.
      *verify:* `npm run test:run -- AthleteRow QueueRow` + lint+build.
- [ ] 1.3 Strip de KPIs do cabeçalho (`CoachInboxPage.tsx:756-773,776-803`): consultar
      `selected.quickStats.hasWindowData` nos tiles de Aderência e Carga (7d) — sem dado renderiza
      neutro ("—"/mensagem curta, sem ícone de estado positivo); zero legítimo continua numérico.
      Forma/ACWR: alinhar o "—" existente pra também refletir `hasWindowData` (hoje é só `null`
      técnico). Testes de adapter/componente cobrindo zero legítimo vs. ausência nos 4 KPIs.
      *verify:* `npm run test:run -- CoachInboxPage coachInboxAdapters` + lint+build.
- [ ] 1.4 `src/App.tsx`: `errorElement` no nó raiz do router (ou por seção, se o layout exigir) —
      componente de erro no tema (`elevation`/`surface` tokens), mensagem PT-BR e botão "Voltar ao
      inbox"; cobre rota inexistente e erro de render, primeira introdução do conceito no repo (sem
      precedente a seguir). Teste de página para a rota 404.
      *verify:* `npm run test:run` + lint+build + navegação manual em
      `/#/coach/rota-que-nao-existe`.
- [ ] 1.5 Encerramento: atualizar este `tasks.md` (entregue vs. adiado, incluindo a nota de escopo
      de 1.2) e abrir o PR.
