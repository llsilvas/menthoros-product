# Proposal: wire-coach-shell-to-dashboards

**Tamanho:** M · **Trilha:** Full

## Status

Proposed

## Why

Os endpoints agregados do coach já estão em `develop` (`add-coach-shell-dashboards`, Sprint 6):
`GET /api/v1/coach/atletas`, `/calendario-semanal?from=` e `/insights?from=&to=`. Mas as três telas
do shell do coach no `menthoros-front` — `CoachAthletesPage`, `CoachCalendarPage`,
`CoachInsightsPage` — **ainda rodam com dados mock** (`MOCK_ATHLETES`, `buildMockAthletes()`,
`MOCK_INSIGHTS`). O treinador abre a "casa" dele e vê atletas fictícios, não a própria assessoria.

Esta change liga as telas existentes aos endpoints reais: regenera o cliente OpenAPI, cria os hooks
de fetch (padrão custom-hook do repo, sem React Query), troca o mock por dados do tenant e trata
loading/error/empty. É puramente de consumo — **não altera contrato de API nem backend**.

## What Changes

Apenas frontend (`apps/menthoros-front`). Sem migração, sem mudança de contrato.

- **Cliente curado** (não `generate:api` — ver A1): `src/api/services/CoachDashboardService.ts` (nome
  limpo, padrão `AtletasService`) + tipos de domínio em `src/types/Coach.ts` (`CoachAtletaResumo`,
  `CoachCalendario`, `CoachInsights`), exportados em `src/api/index.ts`.
- **Hooks** (`src/hooks/`): `useCoachRoster`, `useCoachCalendar(from?)`, `useCoachInsights(from?, to?)`
  — cada um expõe `{ data, loading, error, fetch/refetch }`, seguindo `useAtletas`/`useRaceProjection`.
- **`CoachAthletesPage`**: troca `MOCK_ATHLETES` pelo roster real; KPI cards e filtros derivados dos
  campos reais (`status`, `fase`, `lastActivity`).
- **`CoachCalendarPage`**: troca `buildMockAthletes()` pelo calendário real, agrupando `treinos` por
  `atletaId`; tiles usam `tipoTreino` + flags (`isKeyWorkout`, `hasAlert`, `hasPendingSuggestion`).
- **`CoachInsightsPage`**: troca `MOCK_INSIGHTS` pelos insights reais (KPIs, `tendenciaCargaSemanal`,
  `topAtletas`); widgets sem fonte no DTO viram placeholder "em breve" ligado à change-fonte.
- **Reconciliação mock↔DTO** (detalhe em `design.md`): campos do mock sem fonte no backend
  (`sport`, `avgCTL/avgTSB` por semana, `adherenceRate`, `pendingValidations`, `alertsCount`,
  `sparklineData`, `distanceKm/durationMin` por treino, abas Performance/Saúde/Comparativos) são
  **derivados client-side quando triviais** ou **adiados** com placeholder, sem inventar dado.

## Critérios de aceite

- **CA1 — Roster real**
  - *Given* um treinador autenticado (TECNICO/ADMIN) com atletas na assessoria
  - *When* abre `/coach/athletes`
  - *Then* a grade lista os atletas reais do tenant com `CTL/ATL/TSB/fase/status/última atividade/volume`
    vindos de `GET /api/v1/coach/atletas`, e **nenhum** dado de `MOCK_ATHLETES` permanece.
- **CA2 — Calendário real**
  - *Given* atletas com treinos planejados na semana corrente
  - *When* abre `/coach/calendar`
  - *Then* o grid mostra os treinos reais agrupados por atleta na semana de `from`
    (default = semana atual), com `isKeyWorkout`/`hasAlert`/`hasPendingSuggestion` refletindo o DTO.
- **CA3 — Insights reais**
  - *Given* o tenant com histórico de treinos realizados
  - *When* abre `/coach/insights`
  - *Then* os KPIs (`totalAtletas/ativos/emAtencao/pausados/treinosPlanejadosSemana`), a tendência de
    carga semanal e o top atletas vêm de `GET /api/v1/coach/insights`.
- **CA4 — Estados explícitos** — cada tela renderiza loading (skeleton/spinner), error (mensagem +
  retry) e empty (sem atletas / sem treinos) de forma distinta, conforme regra do `CLAUDE.md` frontend.
- **CA5 — Sem regressão de build** — `npm run lint && npm run build && npm run test:run` verdes; o
  cliente gerado em `src/api/` não é editado à mão.
- **CA6 — Sem dado inventado** — widgets sem fonte no DTO (adesão, alertas, sparklines, abas
  Performance/Saúde/Comparativos) exibem placeholder "em breve", não números fabricados.

## Métrica de sucesso

**Métrica de entrega (verificável agora):** ao abrir o shell, o treinador vê a própria assessoria —
**0 das 3 telas** servem mock. Proxy: nenhuma referência a `MOCK_ATHLETES`/`buildMockAthletes`/
`MOCK_INSIGHTS` no bundle das páginas, e as 3 telas disparam as chamadas `/api/v1/coach/**`.

**Métrica de adoção (a acompanhar pós-deploy):** sessões ativas no shell do coach (filtros usados,
navegação de semanas, clique em atleta) — baseline coletado na 1ª semana pós-deploy. Mede se o
treinador *usa* o que foi conectado, não só se os dados são reais. *(produto-review)*

## Open Questions & Assumptions

- **A1 (revisada no init):** ❌ `generate:api` **NÃO** se aplica. Descoberto no init que o `src/api/`
  do repo é **curado à mão** (serviços com nomes limpos em inglês, tipos importados de `src/types/`,
  sem `models/`), divergindo do `CLAUDE.md`. Rodar `generate:api` é destrutivo (renomeia serviços a
  partir dos `@Tag` PT-BR e quebra ~13 arquivos de outras features). **Decisão:** seguir o padrão
  curado — `CoachDashboardService.ts` (nome limpo) + `src/types/Coach.ts`, espelhando `AtletasService`.
  O `/api-docs` em execução confirma os 3 endpoints (usado só como referência de contrato).
- **A2:** `sport` (running/cycling) na `CoachAthletesPage` não tem fonte no `CoachAtletaResumoDto`.
  **Assunção:** plataforma é running-only hoje → fixar `running` ou remover a coluna/filtro de esporte.
- **A3:** A `CoachCalendarPage` exibe `distanceKm/durationMin` por treino, ausentes no
  `CoachCalendarioDto`. **Assunção:** tiles passam a mostrar `tipoTreino` + flags; distância/duração
  ficam fora até o DTO expô-las (não bloqueia). *(decisão em design.md)*
- **A4:** KPIs de insights sem fonte (`adherenceRate`, `pendingValidations`, `alertsCount`,
  `avgCTL/avgTSB` por semana, `sparklineData`) dependem de changes futuras
  (`add-weekly-athlete-review`, `add-coach-attention-queue`, `add-coach-suggestion-inbox`).
  **Assunção:** placeholder "em breve" ligado à change-fonte, sem fabricar valor.
- **Q1:** `avgCTL/avgTSB/volume total` agregados — derivar client-side a partir do roster, ou aguardar
  endpoint? *(proposta em design.md: derivar do roster quando trivial.)*
- **Q2 (produto-review, RP2):** atleta com Strava dessincronizado → `ctl/atl/tsb` desatualizados ou
  `lastActivity` nulo/antigo. O treinador pode ler "dado desatualizado" como "dado errado" e perder
  confiança no Roster no 1º acesso real. *Como sinalizar* (badge "sem sync"/idade do dado) fica como
  open question — não inventar valor, mas distinguir "sem dado" de "zero".
- **A5 (produto-review, RP1):** tenant novo / sem histórico → Insights com KPIs legítimos porém
  zerados pode parecer bug. **Assunção:** empty states **informativos por contexto** (tenant novo vs.
  semana sem treinos), não um `-` genérico.
- **A6 (produto-review):** fidelidade do placeholder — **se já existir** componente de placeholder no
  front, reusar; **se não**, preferir **ocultar a seção** a construir componente novo só para esta
  change (evita escopo rastejar). *(decisão em design.md D5)*

## Impact

- **Depende de:** `add-coach-shell-dashboards` (#6, **em develop** ✅) — fonte dos 3 endpoints.
- **Repos:** somente `apps/menthoros-front`. Sem mudança no backend.
- **Reusa:** padrão de cliente OpenAPI-gerado, custom-hooks (`useAtletas`, `useRaceProjection`),
  componentes do coach (`CoachAthleteAvatar`, `AthleteRow`, `WorkoutBlock`), tokens de tema.
- **Não faz (anti-goals):** não cria/altera endpoints; não constrói as fontes de adesão/atenção/inbox;
  não introduz React Query; não implementa as abas Performance/Saúde/Comparativos (seguem placeholder).
- **Sem breaking changes:** telas já existem; troca de fonte de dados é interna ao frontend.
