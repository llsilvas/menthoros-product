# Tasks — season-plan-start-volume

Repos: `apps/menthoros-backend` (branch `fix/season-plan-start-volume`, worktree já criado) e
`apps/menthoros-front`. Validação: backend `./mvnw clean verify`; front `npm run lint && npm run build && npm run test:run`.

## 0. Antes de implementar

- [ ] 0.1 Decidir Q1 (regra do volume de partida) com o dono do produto.
- [ ] 0.2 DoR (`/implement init`): spec-reviewer + Codex.

## 1. Backend — volume de partida (D1)

- [ ] 1.1 Testes em `SeasonPlanServiceImplTest`: critérios 1, 2 e 3 do proposal.
- [ ] 1.2 `resolverVolume` com as duas janelas.

## 2. Backend — recálculo da v1 (D2)

- [ ] 2.1 Testes em `SeasonPlanAdjustmentServiceImplTest`: v1 PROPOSED recalcula; ACTIVE continua 409.
- [ ] 2.2 Guarda do `recalculate` aceitando PROPOSED v1 sem base.
- [ ] 2.3 `SeasonPlanResponseDto` expõe o volume de partida (se ainda não expõe).

## 3. Front (D3)

- [ ] 3.1 `SeasonTabPanel`: volume de partida e "Ajustar volume e fases" na proposta v1 (teste de componente).
- [ ] 3.2 E2E `season-plan.spec.ts`: recalcular a v1.

## 4. Validação

- [ ] 4.1 Dev: regenerar a temporada do atleta Leandro e conferir a partida (esperado ~19,1 km com Q1 proposta).
