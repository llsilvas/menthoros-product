# Tasks: add-athlete-engagement-signals

> **Refinado contra o código real (init 2026-07-04).** Confirmado: `ProvaOutputDto` já traz
> `diasFaltando` (int) calculado pelo backend — "próxima prova" usa `nomeProva`/`dataProva` (filtro
> `data >= hoje`) + `diasFaltando` direto do DTO, sem recalcular a diferença de dias no frontend.
> `GET /atletas/{atletaId}/provas` hoje não tem `@PreAuthorize` (débito pré-existente, fora de
> escopo). Frontend: `AthleteProgressService.ts` já existe (`apps/menthoros-front/src/api/services/`,
> mergeado na 9.6) — `getProvas()` estende esse arquivo, não cria um novo. `AthleteHomePage.tsx`
> ainda não busca `/me/treinos` — task 2.1 adiciona `useManualTraining(30)` (hook já existente,
> reaproveitado na 9.6) à Home.

## 0. Backend — 1 endpoint `/me/provas`

- [x] 0.1 `GET /api/v1/atletas/me/provas` em `AtletaProgressController` (mesmo arquivo dos demais
  `/me/*`) — `@PreAuthorize("hasRole('ATLETA')")`, resolve `atletaId` via
  `atletaProgressService.resolverAtletaIdAtual()`, injeta `ProvaService` (novo field no controller)
  e delega em `provaService.listarProvas(atletaId)`.
  - verify: teste de controller 200 com dado + lista vazia; 404 quando atleta do token não resolve
    (mesmo padrão de `meRecordesNotFound` etc.).
- [x] 0.2 `./mvnw clean test` verde; nenhuma mudança em `GET /atletas/{atletaId}/provas`
  (permanece sem `@PreAuthorize` — débito pré-existente, não tocado nesta change).

## 1. Cliente + hook + helper (frontend)

- [x] 1.1 `getProvas()` em `src/api/services/AthleteProgressService.ts` (arquivo já existe —
  adicionar método, não criar serviço novo).
- [x] 1.2 `useAthleteProvas` em `src/hooks/` — `{ provas, loading, error, fetchProvas }`, mesmo
  padrão dos demais hooks `useAthleteXxx`.
- [x] 1.3 `calcularStreakSemanas(treinos, hoje?): number` — função pura em
  `src/features/athlete/adapters/` (consistente com `zonesAdapter`/`recordsAdapter`/
  `aderenciaAdapter` da 9.6, não um `utils/` separado). Testes: sem treino (0), streak ativo, streak
  quebrado por lacuna, semana atual em andamento sem treino ainda.

## 2. AthleteHomePage — card de streak

- [x] 2.1 Adicionar `useManualTraining(30)` (hook já existente, reusado — não criar hook novo) à
  `AthleteHomePage.tsx` + `calcularStreakSemanas`.
- [x] 2.2 Renderizar "X semanas seguidas treinando" quando streak ≥ 1; **ocultar** o card quando
  streak = 0 (R1/D0.1.4).
- [x] 2.3 `npm run lint && npm run build && npm run test:run` verde.

## 3. AthleteProgressPage — card de próxima prova

- [x] 3.1 `useAthleteProvas` na tab Provas (`AthleteProgressPage.tsx`, `case 'provas'`), filtrar
  prova futura mais próxima (`dataProva >= hoje`, ordenar asc).
- [x] 3.2 Renderizar `nomeProva` + `diasFaltando` (do DTO, sem recalcular) na tab Provas; CTA honesto
  ("peça ao seu coach para cadastrar sua próxima meta") quando não há prova futura (CA2).
- [x] 3.3 `npm run lint && npm run build && npm run test:run` verde.

## 4. Fechamento

- [x] 4.1 Nenhum valor fabricado nos dois cards quando a fonte está vazia (CA3).
- [x] 4.2 Suíte completa front + backend verde.
- [ ] 4.3 Smoke manual: login ATLETA com treino manual registrado (9d) + prova cadastrada pelo
  coach → streak e próxima prova corretos e batendo com o que o coach vê no perfil do atleta.
