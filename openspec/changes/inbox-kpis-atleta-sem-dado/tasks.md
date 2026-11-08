# Tasks — inbox-kpis-atleta-sem-dado

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-kpis-atleta-sem-dado` em `apps/menthoros-front`, em worktree, a
partir de `develop` **depois** do merge do PR 206 (`inbox-proximo-em-atencao` — mesmos
`CoachInboxPage.tsx` e `DiagnosisTabPanel.tsx`).

## 1. Faixa compacta

- [x] 1.1 `KpiCell`: prop `dense` — rótulo (+ qualificador) e valor na mesma linha, selo ao lado
      do valor; `detail` vai para `title` da célula e para um `<span>` visualmente oculto
      (`visuallyHidden` do MUI + `fontSize: '0.6875rem'` explícito — o E2E de 11px conta texto
      com `clip`). `detail === ''` → sem `title` e sem span. `KpiStrip` repassa `dense` e ganha
      `testId?` na raiz. Teste de componente em `AthleteKpiStrip.test.tsx` (CA2, CA5); reescrever
      "não corta a linha de apoio" para o modo `dense`.
      verify: `npx vitest run src/features/coach/components/AthleteKpiStrip`.
- [x] 1.2 `AthleteKpiStrip` sempre `dense`, `data-testid="inbox-kpi-faixa"`;
      `athleteKpiAdapters.semDado` devolve `detail: ''` (tipo `KpiView.detail` continua
      `string`). Ajustar `athleteKpiAdapters.test.ts`.
      verify: `npx vitest run src/features/coach/adapters/athleteKpiAdapters`.
- [x] 1.3 Validação: lint, build, test:run.

## 2. Aviso único

- [x] 2.1 `athleteKpiAdapters.ts`: `avisoSemDado(row: CoachAthleteRow): string | null` — `null`
      quando `quickStats.hasWindowData`; senão o texto citando forma e ACWR, e carga só quando
      `!row.distance7d`. Testes: sem série e sem km; sem série com km; série presente com ACWR
      nulo (→ `null`).
      verify: `npx vitest run src/features/coach/adapters/athleteKpiAdapters`.
- [x] 2.2 `CoachInboxPage`: linha `data-testid="inbox-kpi-aviso"` abaixo da faixa, só quando
      `selectedProfile && !profileLoading && !profileError` e `avisoSemDado` não é `null` (mesmo
      gate de `nextRaceHeader`). `DiagnosisTabPanel`: sem `EmptyMetricState` no lugar da grade
      (a grade some quando `hasWindowData` é falso); apagar `EmptyMetricState.tsx` (único
      consumidor; não tinha teste próprio). Aviso fecha com o link "Conferir integração" →
      `/coach/athletes`. Atualizar `CoachInboxPage.test.tsx` ("Sem dado na janela": zero
      ocorrências em texto e `title`; um aviso com perfil carregado; nenhum durante carregamento
      e em erro) e `DiagnosisTabPanel.test.tsx` (CA3, CA4).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage src/features/coach/components/panels/DiagnosisTabPanel`.
- [x] 2.3 Validação: lint, build, test:run.
- [x] 2.4 `QueueRow` e `AttentionOnlyRow`: a célula `queue-row-aderencia` ganha o rótulo "Ader."
      antes do número (`surface-400`, `0.6875rem`, sem mono); o número mantém a cor por faixa;
      sem dado continua "Ader. —". `aria-label` inalterado. Testes em `QueueRow.test.tsx`
      (ou o existente da linha). Decisão do founder em 2026-11-07: "a porcentagem no card ficou
      solta sem sentido".
      verify: `npx vitest run src/features/coach/components/QueueRow`.

## 3. E2E

- [x] 3.1 `tests/e2e/coach/inbox.spec.ts`: `inbox-kpi-faixa` ≤ 40px e `inbox-detalhe-conteudo`
      ≥ 62% em 1366×625 (CA1, CA6 — hoje 57%, o teste afirma 45%); "Sem dado na janela" zero
      vezes e um `inbox-kpi-aviso` com `perfilDe(...)` (já vem com `pmc: []`) (CA3); o teste de
      11px continua. verify: `npx playwright test inbox`.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 4.1 como
      entregue aqui.
