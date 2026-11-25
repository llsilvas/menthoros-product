# Tasks — season-plan-start-volume

Repos: `apps/menthoros-backend` (branch `fix/season-plan-start-volume`, worktree
`.worktrees/backend-season-plan-start-volume`) e `apps/menthoros-front` (mesma branch, worktree
`.worktrees/front-season-plan-start-volume`). Validação: backend `./mvnw clean test` por seção e
`./mvnw clean verify` na entrega; front `npm run lint && npm run build && npm run test:run`.

## 0. Antes de implementar

- [x] 0.1 Q1: mediana das 8 semanas (founder, 2026-11-24).
- [x] 0.2 DoR: spec-reviewer + Codex + product-reviewer (2026-11-24), achados incorporados.

## 1. Backend — persistência (D3)

- [x] 1.1 V122: quatro colunas nulas em `tb_plano_treino` + CHECK da origem; campos na entidade
      `PlanoTreino` e enum `StartVolumeSource`. verify: `./mvnw clean verify` (Flyway sobe no IT).
- [x] 1.2 `SeasonPlanVersioning` copia as quatro no rascunho. verify: teste do versioning (critério 10).

## 2. Backend — volume e longão de partida (D1, D2)

- [x] 2.1 `SeasonPlannerTest`: longão proporcional, piso 28%, teto 50%, teto da distância, descarga, sem
      `L0` (critérios 5 e 6). verify: vermelho antes, verde depois.
- [x] 2.2 `SeasonPlanner.plan`/`planWithPhases` com `startLongRunKm`; callers atualizados.
- [x] 2.3 `SeasonPlanServiceImplTest`: critérios 1–4 e `L0` sem PROVA. verify: idem.
- [x] 2.4 `resolverVolume` → `StartVolume` (mediana, origem, histórico) e `L0`; grava as colunas.

## 3. Backend — recálculo da v1 (D4)

- [x] 3.1 `SeasonWeekLockTest` para `forPlan`; `SeasonPlanAdjustmentServiceImplTest`: critérios 6b, 6c, 7,
      8 e 9. verify: vermelho antes.
- [x] 3.2 Guarda, `SeasonWeekLock.forPlan` em `recalculate`, `updateWeek` e `SeasonPlanResponseMapper`,
      `startLongRunKm` no DTO validado no service, gravação da origem `COACH`.
- [x] 3.3 `@ApiResponses` do `recalculate` no `SeasonPlanController`.

## 4. Backend — resposta (D5)

- [x] 4.1 `SeasonPlanResponseDto` + mapper com os quatro campos (teste do mapper; legado nulo).
- [x] 4.2 IT: gerar → recalcular a v1 → aprovar, contra Postgres. verify: `./mvnw clean verify`.

## 5. Front (D5)

- [x] 5.1 Worktree `front-season-plan-start-volume` a partir de `origin/develop`, `npm ci`.
- [x] 5.2 Tipos em `src/types/SeasonPlan.ts` e `recalculate` no `useSeasonPlan` (teste do hook).
- [x] 5.3 `SeasonTabPanel`: evidência da partida e dialog com `SeasonParametersForm` + campo de longão
      (teste de componente, critério 11); texto do alerta `LONG_RUN_SHARE`; nota de semanas preservadas do
      `SeasonParametersForm` derivada de `locked`.
- [x] 5.4 E2E `tests/e2e/coach/season-plan.spec.ts`: recalcular a v1.

## 6. Validação

- [x] 6.1 Dev: regenerar a temporada do Leandro (arquivar a PROPOSED atual desmarcando e remarcando a
      prova-alvo; `generate` devolve a PROPOSED existente) e conferir partida 20,8 km, `L0` 7,4 km, origem `MEDIAN`.
      Feito por query de leitura (`notes.md`): mediana 20,8 e `L0` 7,4 conferem. **Adiado:** a regeneração
      pela tela espera o deploy da branch no dev (a temporada da conta está ACTIVE; `generate` dá 409).
- [x] 6.2 Registrar a query da métrica (baseline) no proposal ou num `notes.md` da change.
