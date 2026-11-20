Branch `feat/add-season-plan-approve-athlete-view` nos dois repos (worktrees
`.worktrees/backend-add-season-plan-approve-athlete-view` e `.worktrees/front-add-season-plan-approve-athlete-view`).
Decisões A1–A9 no `proposal.md`. Sem migration.

## 1. Backend

- [ ] 1.1 Aprovar (A1, A3, A5; épico 3.1, 4.10): `SeasonPlanService.approve(atletaId, seasonPlanId)` com
  lock da prova, releitura, 200/409/422 e idempotência; `approvedBy` pelo `sub` do JWT; endpoint
  `POST .../season-plans/{id}/approve`; `approvedAt` no `SeasonPlanResponseDto`.
  - verify: `SeasonPlanServiceImplTest` (PROPOSED → ACTIVE com `approvedBy`/`approvedAt`; ACTIVE de novo
    sem reescrever; ARCHIVED → 409; outra ACTIVE → 409; prova cancelada após lock → 422; lock antes da
    releitura, via `InOrder`) e `@WebMvcTest` (200, 404, 404 da flag, 409, 422, 403 do `ATLETA`).
- [ ] 1.2 Leitura do atleta (A2, A6; épico 4.11): `GET /api/v1/atletas/me/season-plan` +
  `AthleteSeasonPlanDto`; atleta pelo `AuthenticatedAtletaResolver`; 204 fora de `ACTIVE`, depois da
  prova e com a flag desligada.
  - verify: `SeasonPlanServiceImplTest` (fase atual pela semana corrente, nula fora do horizonte; só marcos
    futuros; 204 nos casos de A2) e `@WebMvcTest` (200 sem `validations` no JSON, 204, 403 do `TECNICO`).
- [ ] 1.3 `SeasonPlanIT` (épico 4.12b): POST → approve → GET do atleta; atleta com só `PROPOSED` recebe
  204; atleta A não vê a de B (mesmo tenant e outro tenant); aprovar × aprovar e aprovar × cancelar a
  prova concorrentes.
  - verify: `./mvnw clean verify` verde (unitários + `*IT`) e os dois endpoints novos no OpenAPI.

## 2. Frontend

- [ ] 2.1 Ação "Aprovar temporada" no `SeasonTabPanel` (só em `PROPOSED`): `SeasonPlanService.approve` +
  `useSeasonPlan` ganha `approve`; erro de aprovar aparece na aba; depois de aprovar, a faixa de proposta
  sai e o botão some.
  - verify: teste do hook (approve atualiza o plano) e do painel (botão só em `PROPOSED`, some após
    aprovar, erro exibido).
- [ ] 2.2 Card "Minha temporada" no `AthleteHomePage` (A7; épico 8.1, 8.4): service + tipo
  `AthleteSeasonPlan` + hook; prova, dias, fase, próximos marcos e nota de previsão; 204 ou erro → card
  ausente.
  - verify: testes do card/home: ausente com 204, ausente com erro, completo com `ACTIVE`, sem marcos.
- [ ] 2.3 E2E e validação (épico 8.7): `season-plan.spec.ts` ganha "treinador aprova"; um spec do atleta
  vê o card com a API interceptada.
  - verify: `npm run lint && npm run build && npm run test:run` e os E2E tocados verdes.
