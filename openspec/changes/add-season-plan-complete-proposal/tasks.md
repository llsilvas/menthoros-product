Branch `feat/add-season-plan-complete-proposal` nos dois repos (worktrees
`.worktrees/backend-add-season-plan-complete-proposal` e `.worktrees/front-add-season-plan-complete-proposal`).
Decisões T1–T9 no `proposal.md`. Sem migration.

## 1. Backend

- [ ] 1.1 Descargas 3:1 e longão no `SeasonPlanner` (T4; épico 2.3, 2.4). `WeekPlan` ganha `deload` e
  `longRunKm`; o service grava em `tb_season_week`.
  - verify: `SeasonPlannerTest` — maratona 16 semanas, CTL 40: semanas 4 e 8 com `deload` e × 0,80 da
    rampa, 5 e 9 de volta à rampa; longão = min(0,28 × volume, 32), × 0,75 na descarga, `null` na
    RACE_WEEK; teto 12/16/21 nos limites de distância.
- [ ] 1.2 Taper pela `TaperStrategy` (T5; épico 2.5): remove `TAPER_FACTOR`/`RACE_WEEK_FACTOR`; redução
  na segunda-feira da semana sobre o pico fixo.
  - verify: `SeasonPlannerTest` com os TSS exatos de TAPER/RACE_WEEK (maratona domingo e prova no sábado);
    template de 8/10 semanas sem TAPER ainda reduz a RACE_WEEK; ajusta o teste do ticket 2 que fixava
    218/164.
- [ ] 1.3 Compressão: regressão de D9 (T1; épico 2.8).
  - verify: teste existente da meia a 6 semanas segue verde; um novo para CTL < 40 confirma a Base
    preservada.
- [ ] 1.4 Provas preparatórias (T6; épico 2.7): `ProvaRepository` com query tenant-aware das candidatas
  no horizonte; o motor recebe as datas e devolve o marco por semana; a descarga desvia do marco (T4).
  - verify: `SeasonPlannerTest` (colisão na mesma semana → a mais longa; descarga desviada) e
    `SeasonPlanServiceImplTest` (cancelada, alvo, fora do horizonte e a menos de 7 dias da alvo ficam
    de fora; `milestone_race_id` gravado).
- [ ] 1.5 `SeasonPlanValidator` em `domain/planner` (T3; épico 2.9, 2.11): puro, entrada = semanas +
  data e distância da prova.
  - verify: `SeasonPlanValidatorTest` — por regra, um caso que dispara e um no limite que não dispara;
    volume anterior zero não avalia `RAMP`; proposta 16 semanas default sem `DELOAD_CADENCE` nem
    `TAPER_DEPTH`.
- [ ] 1.6 Contrato e service (T2, T9): `milestones[]` e `validations[]` em `SeasonPlanResponseDto`
  (`@Schema` em tudo, listas vazias); `findCurrent` e `generate` montam os dois; marcos de prova
  cancelada/excluída saem; log `season-plan.generated` com contagem por regra.
  - verify: `SeasonPlanServiceImplTest` (listas vazias, marco de prova cancelada some, validações
    recalculadas na leitura) e `@WebMvcTest` com o JSON dos campos novos.
- [ ] 1.7 `SeasonPlanIT`: POST com prova preparatória → GET; `milestones[]` e `validations[]` iguais nos
  dois (épico 2.10, 2.12).
  - verify: `./mvnw clean verify` verde (unitários + `*IT`).

## 2. Frontend

- [ ] 2.1 Tipos e tabela: `SeasonPlan` ganha `milestones`/`validations`; a tabela da aba ganha a coluna
  Longão e marca a semana de descarga.
  - verify: `SeasonTabPanel.test.tsx` — longão formatado, `—` na RACE_WEEK, indicação de descarga.
- [ ] 2.2 Mapa da temporada (T8; épico 7.2): faixa de fases + barra de volume planejado por semana
  (recharts), marcando semana atual, descargas e marcos; `role="img"` com `aria-label` resumido; a
  tabela é a alternativa textual (épico 9.3).
  - verify: teste de componente do mapa (uma barra por semana, descarga e marco marcados, `aria-label`).
- [ ] 2.3 Painéis de marcos e validações (épico 7.5): marcos com nome, data e semana; validações com a
  mensagem e a semana; estado "dentro dos limites" sem alertas.
  - verify: testes de componente dos dois painéis, incluindo o estado vazio.
- [ ] 2.4 E2E e validação: `season-plan.spec.ts` gera uma proposta com marco e alerta e vê mapa e
  painéis.
  - verify: `npm run lint && npm run build && npm run test:run` e `npx playwright test
    tests/e2e/coach/season-plan.spec.ts` verdes.

## 3. Docs

- [ ] 3.1 Corrigir no épico (`specs/season-plan-macrocycle/spec.md`) "comprimidas proporcionalmente"
  para o corte de D9 (T1), e marcar as tasks do épico cobertas aqui.
  - verify: `rtk proxy grep -n proporcional` no spec do épico não acha mais a regra antiga.
