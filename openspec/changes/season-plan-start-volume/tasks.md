# Tasks — season-plan-start-volume

Repos: `apps/menthoros-backend` (branch `fix/season-plan-start-volume`, worktree já criado) e
`apps/menthoros-front`. Validação: backend `./mvnw clean verify`; front `npm run lint && npm run build && npm run test:run`.

## 0. Antes de implementar

- [x] 0.1 Decidir Q1: mediana das 8 semanas (founder, 2026-11-24).
- [ ] 0.2 DoR (`/implement init`): spec-reviewer + Codex; product-reviewer e pre-mortem da trilha Full.

## 1. Backend — volume de partida (D1)

- [ ] 1.1 Testes em `SeasonPlanServiceImplTest`: critérios 1, 2 e 3.
- [ ] 1.2 `resolverVolume` com mediana de 8 semanas e as somas semanais disponíveis para a resposta.

## 2. Backend — longão de partida (D2)

- [ ] 2.1 Testes em `SeasonPlannerTest`: critérios 4 e 5 (proporção, teto, descarga, sem `L0`).
- [ ] 2.2 `L0` no service (janela de 6 semanas) e no `SeasonPlanner.longao`.
- [ ] 2.3 Migration aditiva: coluna nullable do longão de partida em `tb_plano_treino`.

## 3. Backend — recálculo da v1 (D3)

- [ ] 3.1 Testes em `SeasonPlanAdjustmentServiceImplTest`: critérios 6 e 7.
- [ ] 3.2 Guarda do `recalculate` aceitando PROPOSED v1 sem base, usando o `L0` persistido.

## 4. Backend — resposta (D4)

- [ ] 4.1 `SeasonPlanResponseDto`: `initialVolumeKm`, `initialLongRunKm`, `volumeHistory` (teste de mapper/controller).

## 5. Front (D4)

- [ ] 5.1 Tipos e `SeasonTabPanel`: volume, longão de partida e 8 semanas na proposta v1; botão "Ajustar
      volume e fases" (teste de componente — critério 8).
- [ ] 5.2 E2E `season-plan.spec.ts`: recalcular a v1.

## 6. Validação

- [ ] 6.1 Dev: regenerar a temporada do atleta Leandro e conferir partida 20,8 km e longão 7,4 km.
