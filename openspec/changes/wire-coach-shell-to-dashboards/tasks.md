# Tasks: wire-coach-shell-to-dashboards

> Frontend-only (`apps/menthoros-front`). Validação por bloco: `npm run lint && npm run build`
> (e `npm run test:run` nos blocos com teste). Não editar `src/api/` à mão.

## 0. Cliente curado do coach (NÃO `generate:api` — ver A1/D3)

> Descoberto no init: `src/api/` é curado à mão; `generate:api` é destrutivo. Seguir o padrão do
> `AtletasService` (serviço nomeado + tipos em `src/types/`). Backend em execução serve só de
> referência de contrato (`/api-docs` já confirma os 3 endpoints).

- [x] 0.1 `src/types/Coach.ts` — tipos de domínio dos DTOs (`CoachAtletaResumo`, `CoachCalendario` +
  `TreinoAgendado`, `CoachInsights` + `Kpis`/`PontoCargaSemanal`/`TopAtleta`); `status` como union.
- [x] 0.2 `src/api/services/CoachDashboardService.ts` (padrão `AtletasService`): `getRoster()`,
  `getCalendario(from?)`, `getInsights(from?, to?)` contra `/api/v1/coach/**`; export em
  `src/api/index.ts`. **Validação:** `npm run build` (tsc) verde — sem tocar nos serviços curados existentes.

## 1. Hooks de fetch (`src/hooks/`)

- [x] 1.1 `useCoachRoster` → `{ roster, loading, error, fetchRoster }`, chama o serviço de
  `/coach/atletas`. Espelha `useAtletas` (useState + useCallback). **Teste:** sucesso popula `roster`;
  erro popula `error`. **Validação:** `npm run test:run`.
- [x] 1.2 `useCoachCalendar(from?)` → `{ calendario, loading, error, fetchCalendario }`, repassa `from`.
- [x] 1.3 `useCoachInsights(from?, to?)` → `{ insights, loading, error, fetchInsights }`.

## 2. Adapters DTO→view-model + mapa de enums

- [x] 2.1 `tipoTreino` (enum backend) → `WorkoutType` da UI, com default seguro p/ desconhecido (D4).
  **Teste:** cada enum do backend mapeia; tipo inválido cai no default sem lançar. **Validação:** `npm run test:run`.
- [x] 2.2 Adapter do calendário: agrupar `treinos[]` por `atletaId` em linhas de atleta na semana (D1/Calendar).
- [x] 2.3 Adapter de KPIs derivados do roster ("Em risco"=`status∈{warning,danger}`, "Em taper"=
  `fase==TAPER`, "Sem atividade 7d"=`lastActivity>7d`) — derivar só de campos do DTO (R3). **Teste** dos limites.

## 3. CoachAthletesPage

- [x] 3.1 Trocar `MOCK_ATHLETES` por `useCoachRoster`; grade e KPI cards a partir do roster real + adapters (2.3).
- [x] 3.2 `sport`: fixar `running` ou remover coluna/filtro (A2/D1). Sem inventar dado.
- [x] 3.3 Estados loading (skeleton da grade) / error (msg + retry) / empty (sem atletas) — CA4.
  Empty informativo p/ tenant novo (RP1); atleta sem sync/`lastActivity` nulo distinguido de "zero" (Q2/RP2).
- [x] 3.4 Remover tipos/funções mock órfãos. **Validação:** `npm run lint && npm run build && npm run test:run`.

## 4. CoachCalendarPage

- [x] 4.1 Trocar `buildMockAthletes()` por `useCoachCalendar(from)`; default = semana atual; navegação
  prev/next/hoje repassa `from`.
- [x] 4.2 Tiles via adapter (2.1/2.2): `tipoTreino` + flags `isKeyWorkout/hasAlert/hasPendingSuggestion`;
  **sem** `distanceKm/durationMin` (A3); `phase/status` por linha **ocultos** (D6, sem fetch extra);
  `isInFocus` só client-side ou oculto (D1).
- [x] 4.3 Estados loading/error/empty (semana sem treinos) — CA4.
- [x] 4.4 Remover mocks órfãos. **Validação:** `npm run lint && npm run build && npm run test:run`.

## 5. CoachInsightsPage

- [x] 5.1 Trocar `MOCK_INSIGHTS` por `useCoachInsights`; KPIs mapeados de `kpis`; BarChart de
  `tendenciaCargaSemanal` (volume + TSS).
- [x] 5.2 LineChart CTL/ATL por semana: ajustar p/ o que o DTO entrega (volume/TSS) ou placeholder (D1).
- [x] 5.3 Top atletas de `topAtletas[]` (nome + volume).
- [x] 5.4 Widgets sem fonte (`adherenceRate`, `pendingValidations`, `alertsCount`, `sparklineData`) e abas
  Performance/Saúde/Comparativos → placeholder "em breve" ligado à change-fonte (CA6/R2).
- [x] 5.5 Estados loading/error/empty — CA4. Remover mocks órfãos.
  **Validação:** `npm run lint && npm run build && npm run test:run`.

## 6. Fechamento

- [ ] 6.1 Garantir 0 referências a `MOCK_ATHLETES`/`buildMockAthletes`/`MOCK_INSIGHTS` nas 3 páginas
  (métrica de sucesso).
- [ ] 6.2 Suíte completa verde: `npm run lint && npm run build && npm run test:run`.
- [ ] 6.3 (Se tocar fluxo crítico) `npm run test:e2e` do shell do coach.

## 7. Follow-ups (dívida pré-existente — fora do escopo da 6b)

- [ ] 7.1 Lint do front tem 23 erros pré-existentes em 17 arquivos de terceiros (cliente gerado +
  componentes) — `npm run lint` global está vermelho independentemente desta change. Validação da 6b
  feita lintando só os arquivos tocados (0 erros). Cliente gerado será regenerado pela Fase B de
  `fix-openapi-client-generation`; resto é dívida de saúde do front.
- [x] 7.2 vitest passou a excluir `tests/e2e/**` (Playwright não roda sob vitest) — corrigido nesta change.
