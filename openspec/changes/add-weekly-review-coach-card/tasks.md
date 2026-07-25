# Tasks — add-weekly-review-coach-card (S · Fast · frontend)

> Fatia 3 de 3. Depende do endpoint read-only da Fatia 1 (`GET /api/v1/coach/atletas/{atletaId}/revisao-semanal`, já em develop). Validação: `npm run lint && npm run build` (+ `npm run test:run` p/ o teste de componente). CA entre colchetes. `verify:` = como saber que funcionou.

## Plano de execução — anchors reais (front, 2026-07-24)

- **Fachada:** padrão de `src/api/services/CoachAthleteProfileService.ts` — classe com método estático `__request(OpenAPI, { method: 'GET', url })` → `CancelablePromise<Dto>`; DTO em `src/types/`. Não regenerar o client cru (fachada curada).
- **Hook:** espelhar `src/hooks/useAthleteProfile.ts` — `{ data, isLoading, error, errorKind, fetch }` + `useEffect`; `errorKind` distingue 404 (→ empty) de erro real.
- **Montagem:** `src/features/coach/pages/CoachAthleteProfilePage.tsx` — `<Grid container spacing={3}>` (~linha 223); reusar o `SectionCard` local (linha 52). Novo `<Grid size={12}>` com o card da revisão.
- **Contrato:** DTO backend `RevisaoSemanalOutputDto` + `WeekOverWeekDelta` (enums `RecommendationType`/`NivelAderencia`).

## 1. Camada de dados

- [x] 1.1 Tipos TS `RevisaoSemanalOutputDto` + `WeekOverWeekDeltaDto` (`src/types/RevisaoSemanal.ts`) + `CoachRevisaoSemanalService.getRevisaoSemanal` (`src/api/services/`) — [CA10]
  - verify: ✅ `npm run build` (tsc + vite) compila.
- [x] 1.2 `useWeeklyAthleteReview(atletaId)` (`src/features/coach/hooks/`) — espelha `useAthleteProfile`, 404 → `naoDisponivel` (empty) — [CA10, CA10.1]
  - verify: ✅ build; hook expõe `revisao/isLoading/error/naoDisponivel/fetchRevisao`.
- [x] 1.3 `buildWeeklyReviewFromDto` (`src/features/coach/adapters/weeklyReviewAdapters.ts`, + teste) e VM `WeeklyReviewVM` (`src/features/coach/types/WeeklyAthleteReview.ts`) — [CA10]
  - verify: ✅ `weeklyReviewAdapters.test.ts` 4/4 (rótulos PT-BR, período, delta primeira semana vs. anterior, percentual ausente).

## 2. Card

- [x] 2.1 `WeeklyReviewCard` (presentacional) num `SectionCard` "Revisão semanal" no grid de `CoachAthleteProfilePage.tsx`; mostra período, `recomendação`, `aderência`, delta, `nextWeekFocus` (quando da F2) e aviso de dados insuficientes — [CA10]
  - verify: ✅ card renderiza o VM (teste de componente); montado via hook + adapter na page.
- [x] 2.2 Estados loading (`Skeleton`) / empty (`Alert` warning — "nenhuma semana fechada") / error (`Alert` + "Tentar novamente" → `fetchRevisao`) — [CA10.1]
  - verify: ✅ `WeeklyReviewCard.test.tsx` cobre os 3 estados.
- [x] 2.3 Read-only: sem botão/ação mutadora no estado de dados — [CA10.2]
  - verify: ✅ teste assevera `queryByRole('button') === null` no estado de dados.

## 3. Testes & validação

- [x] 3.1 Teste de componente (Vitest + RTL): loading/empty/error + read-only [CA10.1, CA10.2] — `WeeklyReviewCard.test.tsx` 4/4
- [x] 3.2 Teste do adapter `buildWeeklyReviewFromDto` [CA10] — `weeklyReviewAdapters.test.ts` 4/4
- [x] 3.3 Validação: ✅ `npm run lint` (sem issues) `&& npm run build` (ok) `&& npm run test:run` (**747/747**, 98 arquivos)
