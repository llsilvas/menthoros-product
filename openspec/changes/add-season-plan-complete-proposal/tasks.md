Branch `feat/add-season-plan-complete-proposal` nos dois repos (worktrees
`.worktrees/backend-add-season-plan-complete-proposal` e `.worktrees/front-add-season-plan-complete-proposal`).
Decisões T1–T9 no `proposal.md`. Sem migration.

**Reaproveitamento (ponytail, 2026-11-18)** — conferido no código antes de implementar:

- `tb_season_week` já tem `deload`, `long_run_km` e `milestone_race_id` (V117, FK `SET NULL`), e o
  `SeasonPlanResponseDto.Week` já expõe `deload` e `longRunKm`: o service só passa a preencher.
- Taper: `TaperStrategy.resolverReducaoPercentual(dias)` já é a curva; o `SeasonPlanner` (estático) usa
  uma instância própria. Nada novo na `TaperStrategy`.
- Teto do longão e "a mais longa" das preparatórias: `RacePreparationRule.distanciaNominalKm` para
  prova sem `distanciaKm`.
- Preparatórias: `ProvaRepository.findUpcomingByAtletaIdAndTenantId` (tenant-aware, já exclui
  `CANCELADA`) + filtro no service; sem query nova. Chamar **depois** do lock da alvo (D13: carregar
  `Prova` antes deixaria a cópia travada velha).
- Marcos no GET: `findAllById` dos `milestone_race_id` da temporada, filtrando assessoria e
  `CANCELADA`; sem query nova.
- Compressão (T1): `SeasonPlannerTest` já cobre KM_21 a 6 semanas com CTL ≥ 40 e < 40 — a antiga task
  de regressão sai; só não pode quebrar.
- Front: o mapa segue o padrão de `WeeklyAdherenceLoadChart` (recharts `BarChart` + `Cell`, tokens);
  marcos e validações são listas curtas dentro do `SeasonTabPanel` com `SectionCard`, sem componentes
  próprios.
- Fora: severidade graduada, endpoint separado de validações, componente genérico de alertas.

## 1. Backend

- [x] 1.1 Descargas 3:1 e longão no `SeasonPlanner` (T4; épico 2.3, 2.4). `WeekPlan` ganha `deload` e
  `longRunKm`; `novaSemana` grava os dois.
  - verify: `SeasonPlannerTest` — maratona 16 semanas, CTL 40: semanas 4 e 8 com `deload` e × 0,80 da
    rampa, 5 e 9 de volta à rampa; longão = min(0,28 × volume, 32), × 0,75 na descarga, `null` na
    RACE_WEEK; tetos 12/16/21 nas fronteiras de distância. Testes de D9 seguem verdes.
- [x] 1.2 Taper pela `TaperStrategy` (T5; épico 2.5): saem `TAPER_FACTOR`/`RACE_WEEK_FACTOR`.
  - verify: `SeasonPlannerTest` com os TSS exatos de TAPER/RACE_WEEK (maratona no domingo e prova no
    sábado); template sem TAPER ainda reduz a RACE_WEEK; os testes que fixavam 218/164 (planner e
    service) são atualizados para os novos valores.
- [x] 1.3 Provas preparatórias (T6; épico 2.7): o motor recebe as datas (e distâncias) das candidatas e
  devolve o marco por semana; a descarga desvia do marco (T4); o service filtra e grava
  `milestone_race_id`.
  - verify: `SeasonPlannerTest` (colisão → a mais longa; descarga desviada ou pulada) e
    `SeasonPlanServiceImplTest` (alvo, a menos de 7 dias da alvo e depois da alvo ficam de fora; lock da
    alvo antes de carregar as candidatas, via `InOrder`).
- [x] 1.4 `SeasonPlanValidator` em `domain/planner` (T3; épico 2.9, 2.11): classe estática pura, entrada
  = semanas + data da prova, saída = lista de alertas.
  - verify: `SeasonPlanValidatorTest` — por regra, um caso que dispara e um no limite que não dispara;
    volume anterior zero não avalia `RAMP`; a proposta default de 16 semanas não dá `DELOAD_CADENCE`
    nem `TAPER_DEPTH`.
- [x] 1.5 Contrato e service (T2, T9): `milestones[]` e `validations[]` em `SeasonPlanResponseDto`
  (records aninhados com `@Schema`, listas vazias); `toDto` monta os dois; log `season-plan.generated`
  com contagem por regra.
  - verify: `SeasonPlanServiceImplTest` (listas vazias; marco de prova cancelada some; validações
    recalculadas no GET) e o `@WebMvcTest` do controller com os campos novos no JSON.
- [x] 1.6 `SeasonPlanIT`: POST com prova preparatória → GET; `milestones[]` e `validations[]` iguais nos
  dois (épico 2.10, 2.12).
  - verify: `./mvnw clean verify` verde (unitários + `*IT`).

Seção 1 verificada em 2026-11-18. Notas:
- 1.2: só `SeasonPlannerTest` fixava 218/164; o service não.
- 1.3: candidatas via `findUpcomingByAtletaIdAndTenantId` filtradas no service; a regra de 7 dias e a de
  "uma por semana" ficam no motor.
- 1.5: `DistanciaProva` sai como objeto (`{value, label, short, order}`); a severidade é a constante
  `WARN`. O GET só consulta provas quando há marco.
- 1.6: no IT, `em.merge` do atleta destacado reescrevia a prova-alvo e a geração dava 422; o teste usa
  `em.find`.

## 2. Frontend

- [ ] 2.1 Tipos e tabela: `SeasonPlan` ganha `milestones`/`validations`; a tabela ganha a coluna Longão
  (`—` sem valor) e marca a descarga.
  - verify: `SeasonTabPanel.test.tsx` — longão formatado, `—` na RACE_WEEK, descarga indicada.
- [ ] 2.2 Mapa (T8; épico 7.2, 9.3): `SeasonMapChart` com uma barra de volume planejado por semana,
  cor pela fase, descarga e semana atual destacadas, marco sinalizado; `role="img"` com `aria-label`
  resumido; a tabela é a alternativa textual.
  - verify: teste de componente (uma barra por semana; `aria-label` com semanas, pico e marcos).
- [ ] 2.3 Marcos e validações no `SeasonTabPanel` (épico 7.5): duas listas em `SectionCard`; validações
  com mensagem e semana; sem alertas, "Proposta dentro dos limites".
  - verify: testes do painel com marcos, com alertas e sem alertas.
- [ ] 2.4 E2E e validação: o mock de `season-plan.spec.ts` ganha um marco e um alerta; o teste vê o mapa,
  o marco e o alerta.
  - verify: `npm run lint && npm run build && npm run test:run` e `npx playwright test
    tests/e2e/coach/season-plan.spec.ts` verdes.

## 3. Docs

- [ ] 3.1 Épico: corrigir "comprimidas proporcionalmente" em `specs/season-plan-macrocycle/spec.md` para o
  corte de D9 (T1) e marcar as tasks do épico cobertas aqui.
  - verify: `rtk proxy grep -n proporcional` no spec do épico não acha mais a regra antiga.
