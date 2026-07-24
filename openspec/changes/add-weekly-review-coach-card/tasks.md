# Tasks — add-weekly-review-coach-card (S · Fast · frontend)

> Fatia 3 de 3. Depende do endpoint read-only de `add-weekly-review-consolidation`. Validação: `npm run lint && npm run build` no `apps/menthoros-front`. CA entre colchetes.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Montagem ancorada — `SectionCard` novo em `CoachAthleteProfilePage.tsx`; hook `useWeeklyAthleteReview` espelha `useAthleteProfile`; adapters em `features/coach/adapters/`, VM em `features/coach/types/`. Endpoint read-only vem da Fatia 1 — [CA10]

## 1. Camada de dados

- [ ] 1.1 Portar método/DTO de leitura da revisão para a fachada `src/api/services` (não sobrescrever com o gerado) — [CA10]
- [ ] 1.2 `useWeeklyAthleteReview(atletaId)` em `features/coach/hooks/` (data + loading + error + fetch, sem React Query) — [CA10]
- [ ] 1.3 `buildWeeklyReviewFromDto` em `features/coach/adapters/` (+ teste irmão) e VM em `features/coach/types/WeeklyAthleteReview.ts` — [CA10]

## 2. Card

- [ ] 2.1 `SectionCard` read-only "Revisão semanal" no grid de `CoachAthleteProfilePage.tsx`; mostra resumos, `recommendationType`, `weekOverWeekDelta`, `nextWeekFocus` — [CA10]
- [ ] 2.2 Estados loading (`Skeleton`) / empty (`Alert warning`) / error (`Alert` + "Tentar novamente") — [CA10.1]
- [ ] 2.3 Read-only: nenhuma ação que altere o plano — [CA10.2]

## 3. Testes & validação

- [ ] 3.1 Teste de componente: renderiza estados loading/empty/error e não expõe ação de alterar plano [CA10.1, CA10.2]
- [ ] 3.2 Teste do adapter `buildWeeklyReviewFromDto` [CA10]
- [ ] 3.3 Validação: `npm run lint && npm run build`
