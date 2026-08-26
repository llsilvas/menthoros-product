# Tasks — athlete-home-workout-profile

Repos: `apps/menthoros-backend` (validação `./mvnw clean verify`) e `apps/menthoros-front`
(`npm run lint && npm run build && npm run test:run`). Backend primeiro; PRs coordenados.

## 1. Backend

- [ ] 1.1 Auditar `EtapaTreinoDto` por campos que não devem ir ao atleta; decidir D1 (reuso ou
      projeção). Validação: nota nesta task.
- [ ] 1.2 `AtletaHomeDto.ProximoTreino` ganha `etapas`, `duracaoMin`, `zonaAlvo` (opcionais); mapper
      preenche a partir do `TreinoPlanejado` do dia. Validação: teste de serialização (com e sem
      etapas) + teste de isolamento por atleta em `me/home`.
- [ ] 1.3 Atualizar OpenAPI (`@Schema`) e gerar referência para o front (`npm run generate:api` em
      scratch). Validação: `verify` verde.

## 2. Frontend

- [ ] 2.1 Portar campos ao cliente curado (`types/AthleteHome.ts` + `api`), sem sobrescrever
      `src/api`. Validação: build.
- [ ] 2.2 `buildNextWorkout`: `profile` via `selectWorkoutProfile(etapas.map(fromEtapaTreino))`,
      `estimatedDuration` de `duracaoMin`; teste do adapter (com/sem etapas).
- [ ] 2.3 `TodayHeroCard` renderiza `WorkoutProfile` compacto quando há blocos (D2, D3). Validação:
      teste de componente + smoke visual com treino intervalado em 390px.
- [ ] 2.4 Estender `tests/e2e/athlete/home.spec.ts` com fixture de etapas asserindo
      `workout-profile` presente. Validação: `npm run test:e2e` verde.
