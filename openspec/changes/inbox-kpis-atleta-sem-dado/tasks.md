# Tasks — inbox-kpis-atleta-sem-dado

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-kpis-atleta-sem-dado` em `apps/menthoros-front`, em worktree, a
partir de `develop` **depois** do merge de `inbox-proximo-em-atencao` (mesmos
`CoachInboxPage.tsx` e `DiagnosisTabPanel.tsx`).

## 1. Faixa compacta

- [ ] 1.1 `KpiCell`: prop `dense` — rótulo (+ qualificador) e valor na mesma linha, selo ao lado
      do valor; `detail` vai para `title` da célula e para um `<span>` visualmente oculto
      (padrão `visuallyHidden` do MUI). `KpiStrip` repassa `dense`. Teste de componente em
      `AthleteKpiStrip.test.tsx` (CA2, CA5); reescrever "não corta a linha de apoio".
      verify: `npx vitest run src/features/coach/components/AthleteKpiStrip`.
- [ ] 1.2 `AthleteKpiStrip` sempre `dense`; `athleteKpiAdapters.semDado` passa a devolver
      `detail: null` (a célula mostra só "—"). Ajustar `athleteKpiAdapters.test.ts`.
      verify: `npx vitest run src/features/coach/adapters/athleteKpiAdapters`.
- [ ] 1.3 Validação: lint, build, test:run.

## 2. Aviso único

- [ ] 2.1 `athleteKpiAdapters.ts`: `avisoSemDado(kpis)` devolve o texto do aviso quando carga,
      forma ou ACWR estão sem dado, senão `null`. Teste.
      verify: `npx vitest run src/features/coach/adapters/athleteKpiAdapters`.
- [ ] 2.2 `CoachInboxPage`: linha `data-testid="inbox-kpi-aviso"` abaixo da faixa, só com aviso.
      `DiagnosisTabPanel`: sem `EmptyMetricState` no lugar da grade de métricas (a grade some
      quando `hasWindowData` é falso). Atualizar `CoachInboxPage.test.tsx` (strip "sem dado na
      janela": zero ocorrências, um aviso) e `DiagnosisTabPanel.test.tsx` (CA3, CA4).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage src/features/coach/components/panels/DiagnosisTabPanel`.
- [ ] 2.3 Validação: lint, build, test:run.

## 3. E2E

- [ ] 3.1 `tests/e2e/coach/inbox.spec.ts`: faixa do atleta ≤ 40px e detalhe ≥ 55% em 1366×625
      (CA1, CA6); "Sem dado na janela" zero vezes e um `inbox-kpi-aviso` com o perfil sem PMC
      (CA3); o teste de 11px continua. verify: `npx playwright test inbox`.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`. Ao retomar `coach-inbox-notebook-height`, marcar 4.1 como
      entregue aqui.
