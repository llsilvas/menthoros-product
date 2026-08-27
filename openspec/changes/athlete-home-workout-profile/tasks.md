# Tasks — athlete-home-workout-profile

Repos: `apps/menthoros-backend` (validação `./mvnw clean verify`) e `apps/menthoros-front`
(`npm run lint && npm run build && npm run test:run`). Backend primeiro; PRs coordenados.

## 1. Backend

- [x] 1.1 **Resolvido no DoR (2026-08-26):** `EtapaTreinoDto` (`:10-40`) tem só ordem, tipo,
      descrição, duração, distância, FC, ritmo, repetições, `blocoId`, `blocoRepeticoes` — nada
      sensível. D1 = reuso, sem projeção.
- [x] 1.2 `AtletaHomeDto.ProximoTreino` ganha `etapas` (`List<EtapaTreinoDto>`), `duracaoMin`
      (**`Integer` minutos**, de `Duration`) e `zonaAlvo`, opcionais; `getHome` preenche a partir do
      `TreinoPlanejado` (já em transação). Query do próximo treino ganha ordenação secundária por
      `criadoEm` (campo JPA de `TreinoBase` — `createdAt` não existe na entidade; desempate no mesmo dia). Validação: teste de serialização (com e sem etapas;
      `Duration` 45 min → 45) + teste de isolamento por atleta/tenant em `me/home`.
      verify: `AtletaProgressServiceImplTest`/controller test verdes; `./mvnw clean verify`.
- [x] 1.3 Atualizar OpenAPI (`@Schema`) e gerar referência para o front (`npm run generate:api` em
      scratch). Validação: `verify` verde.
      verify: o JSON do `me/home` no scratch mostra `proximoTreino.etapas[]`.
      **Feito 2026-08-26.** `@Schema` nos campos novos. A geração em scratch (`generate:api`) exige
      o backend de pé em `:8099` — não rodada; o porte ao cliente curado (2.1) é feito a partir do
      próprio DTO, que é a fonte. `./mvnw clean verify`: 2792 + 145 IT verdes.

## 2. Frontend

- [x] 2.1 Portar campos ao cliente curado (`types/AthleteHome.ts`: `AthleteProximoTreino.etapas?:
      EtapaTreino[]`, `duracaoMin?: number`, `zonaAlvo?: string`, `tssPlanejado?`,
      `intensidadePlanejada?` se o DTO trouxer), sem sobrescrever `src/api`. Validação: build.
      verify: `tsc -b` limpo; nenhum arquivo em `src/api` alterado.
- [x] 2.2 `buildNextWorkout`: `profile` via `selectWorkoutProfile(indexarRepeticoes(etapas.map(
      fromEtapaTreino)), { sport: 'run', tss, if, zonaAlvoTreino })` (D2b), `estimatedDuration` de
      `duracaoMin`; `profile` ausente sem etapas. Teste do adapter: com etapas (bloco 2× → blocos
      com `repeat.total === 2`), sem etapas → `profile` undefined.
      verify: `homeAdapter.test.ts` verde.
- [x] 2.3 `TodayHeroCardProps.nextWorkout.profile?: WorkoutProfileData`; o card renderiza
      `<WorkoutProfile variant="compact" />` quando `profile.blocks.length > 0` (D2, D3). Validação:
      teste de componente (com/sem perfil; `workout-profile` presente/ausente) + smoke visual com
      treino intervalado em 390px.
      verify: `TodayHeroCard.test.tsx` verde; screenshot do smoke inspecionado.
- [x] 2.4 Estender `tests/e2e/athlete/home.spec.ts`: fixture do `me/home` **com etapas** (bloco 2×);
      asserir `workout-profile` e `repeat-bracket` "2×" no hero **e** "Registrar treino" visível sem
      scroll em 390×844 com o perfil presente. Validação: `npm run test:e2e` verde.
      verify: `npm run test:e2e -- tests/e2e/athlete` verde.
      **Feito 2026-08-26.** Dois ajustes no E2E que o perfil expôs: a fixture do check-in usava
      `toISOString()` (UTC) — depois das 21h em UTC-3 o check-in "de hoje" era de amanhã para o app
      (mesma classe do bug corrigido em `selectAthletePlan`); e a varredura de fontes passou a
      isentar o subtree do `WorkoutProfile`, que tem tokens tipográficos próprios (ticks mono de
      10px) e uma tabela oculta de acessibilidade. Suíte 1278; E2E do atleta 14/14.

## QA gate — 2026-08-26

Cinco revisões (backend: `code-reviewer` + `security-reviewer`; front: `frontend-reviewer`;
`clean-code-reviewer` nos dois; Codex adversarial nos dois). Nenhum Critical; nenhum achado de
segurança High. Corrigidos no commit de QA:

- **Codex, MAJOR (real):** `TreinoBase.duracaoMin` é `nullable = false` e o backend usa
  `Duration.ZERO` como sentinela de "não prescrita" (`ReconciliationDecisionExecutor`) — `0` vazava
  como duração. ZERO agora vira `null`; teste no service.
- **Codex, MINOR:** teste do controller passou a asserir a serialização das etapas (`blocoId`,
  `blocoRepeticoes`, omissão em `etapas[0]`) e a omissão de `etapas`/`duracaoMin` no JSON.
- **clean-code, Important ×2:** o bloco `selectWorkoutProfile(indexarRepeticoes(…))` com o mesmo
  comentário estava copiado em `homeAdapter` e `WorkoutDetailDrawer`, e só o drawer ordenava por
  `ordem` → `buildProfileFromTreino` em `features/workout/profile/fromTreino.ts` (ordena, indexa,
  resolve; `sport: 'run'` e o TODO dos `thresholds` num lugar só). Teste com etapas fora de ordem.
- **frontend, Important:** TODO explícito sobre `thresholds`/esporte ausentes no contrato (agora
  no adapter compartilhado).

Follow-ups (não bloqueiam): `findByAtletaIdAndDataBetween` sem `tenantId` na query — pré-existente,
compartilhado por 3 serviços, todos com `validarAtletaNoTenant` a montante; tornar a garantia
estrutural é change própria (assinatura + call-sites). `LIMIT 1` no próximo treino (custo marginal,
janela de 14 dias).
