# Tasks — add-weekly-review-coach-card (S · Fast · frontend)

> Fatia 3 de 3. Depende do endpoint read-only da Fatia 1 (`GET /api/v1/coach/atletas/{atletaId}/revisao-semanal`, já em develop). Validação: `npm run lint && npm run build` (+ `npm run test:run` p/ o teste de componente). CA entre colchetes. `verify:` = como saber que funcionou.

## Plano de execução — anchors reais (front, 2026-07-24)

- **Fachada:** padrão de `src/api/services/CoachAthleteProfileService.ts` — classe com método estático `__request(OpenAPI, { method: 'GET', url })` → `CancelablePromise<Dto>`; DTO em `src/types/`. Não regenerar o client cru (fachada curada).
- **Hook:** espelhar `src/hooks/useAthleteProfile.ts` — `{ data, isLoading, error, errorKind, fetch }` + `useEffect`; `errorKind` distingue 404 (→ empty) de erro real.
- **Montagem:** `src/features/coach/pages/CoachAthleteProfilePage.tsx` — `<Grid container spacing={3}>` (~linha 223); reusar o `SectionCard` local (linha 52). Novo `<Grid size={12}>` com o card da revisão.
- **Contrato:** DTO backend `RevisaoSemanalOutputDto` + `WeekOverWeekDelta` (enums `RecommendationType`/`NivelAderencia`).

## 1. Camada de dados

- [ ] 1.1 Tipos TS `RevisaoSemanalOutputDto` + `WeekOverWeekDelta` em `src/types/RevisaoSemanal.ts` (espelham o contrato do backend) + `CoachRevisaoSemanalService.getRevisaoSemanal(atletaId)` em `src/api/services/` (GET `/coach/atletas/{atletaId}/revisao-semanal`) — [CA10]
  - verify: `npm run build` (tsc) compila; tipos batem com o payload real do endpoint.
- [ ] 1.2 `useWeeklyAthleteReview(atletaId)` em `src/features/coach/hooks/` (espelha `useAthleteProfile`; 404 → estado empty, não erro) — [CA10, CA10.1]
  - verify: `npm run build`; hook expõe data/loading/error/empty.
- [ ] 1.3 `buildWeeklyReviewFromDto` em `src/features/coach/adapters/` (+ teste irmão) e VM em `src/features/coach/types/WeeklyAthleteReview.ts` — [CA10]
  - verify: teste do adapter (Vitest) mapeia DTO→VM incl. `weekOverWeekDelta.primeiraSemana`.

## 2. Card

- [ ] 2.1 `SectionCard` read-only "Revisão semanal" no grid de `CoachAthleteProfilePage.tsx`; mostra `recommendationType`, `adherenceStatus`, `dadosSuficientes`, `weekOverWeekDelta` (e `nextWeekFocus` quando vier da F2) — [CA10]
  - verify: card renderiza com dado real no drilldown.
- [ ] 2.2 Estados loading (`Skeleton`) / empty (`Alert` warning — "nenhuma semana fechada") / error (`Alert` + "Tentar novamente" → refetch) — [CA10.1]
  - verify: teste de componente cobre os 3 estados.
- [ ] 2.3 Read-only: nenhuma ação/botão que altere o plano — [CA10.2]
  - verify: teste assevera ausência de ação mutadora.

## 3. Testes & validação

- [ ] 3.1 Teste de componente (Vitest + Testing Library): loading/empty/error + read-only [CA10.1, CA10.2]
- [ ] 3.2 Teste do adapter `buildWeeklyReviewFromDto` [CA10]
- [ ] 3.3 Validação: `npm run lint && npm run build && npm run test:run`
