# Tasks: wire-coach-shell-to-dashboards

> Frontend-only (`apps/menthoros-front`). Validação por bloco: `npm run lint && npm run build`
> (e `npm run test:run` nos blocos com teste). Não editar `src/api/` à mão.

## 0. Pré-requisito — cliente gerado

- [ ] 0.1 Subir o backend local (`develop`) e confirmar os 3 endpoints em `/api-docs`.
- [ ] 0.2 `npm run generate:api`; conferir no diff que surgiram o serviço de `/api/v1/coach/**` e os
  tipos `CoachAtletaResumoDto`, `CoachCalendarioDto`, `CoachInsightsDto`. **Validação:** `npm run build`
  (tsc) verde — regeneração não quebrou tipos existentes (R5). Se faltar endpoint, PARAR (R1).

## 1. Hooks de fetch (`src/hooks/`)

- [ ] 1.1 `useCoachRoster` → `{ roster, loading, error, fetchRoster }`, chama o serviço de
  `/coach/atletas`. Espelha `useAtletas` (useState + useCallback). **Teste:** sucesso popula `roster`;
  erro popula `error`. **Validação:** `npm run test:run`.
- [ ] 1.2 `useCoachCalendar(from?)` → `{ calendario, loading, error, fetchCalendario }`, repassa `from`.
- [ ] 1.3 `useCoachInsights(from?, to?)` → `{ insights, loading, error, fetchInsights }`.

## 2. Adapters DTO→view-model + mapa de enums

- [ ] 2.1 `tipoTreino` (enum backend) → `WorkoutType` da UI, com default seguro p/ desconhecido (D4).
  **Teste:** cada enum do backend mapeia; tipo inválido cai no default sem lançar. **Validação:** `npm run test:run`.
- [ ] 2.2 Adapter do calendário: agrupar `treinos[]` por `atletaId` em linhas de atleta na semana (D1/Calendar).
- [ ] 2.3 Adapter de KPIs derivados do roster ("Em risco"=`status∈{warning,danger}`, "Em taper"=
  `fase==TAPER`, "Sem atividade 7d"=`lastActivity>7d`) — derivar só de campos do DTO (R3). **Teste** dos limites.

## 3. CoachAthletesPage

- [ ] 3.1 Trocar `MOCK_ATHLETES` por `useCoachRoster`; grade e KPI cards a partir do roster real + adapters (2.3).
- [ ] 3.2 `sport`: fixar `running` ou remover coluna/filtro (A2/D1). Sem inventar dado.
- [ ] 3.3 Estados loading (skeleton da grade) / error (msg + retry) / empty (sem atletas) — CA4.
  Empty informativo p/ tenant novo (RP1); atleta sem sync/`lastActivity` nulo distinguido de "zero" (Q2/RP2).
- [ ] 3.4 Remover tipos/funções mock órfãos. **Validação:** `npm run lint && npm run build && npm run test:run`.

## 4. CoachCalendarPage

- [ ] 4.1 Trocar `buildMockAthletes()` por `useCoachCalendar(from)`; default = semana atual; navegação
  prev/next/hoje repassa `from`.
- [ ] 4.2 Tiles via adapter (2.1/2.2): `tipoTreino` + flags `isKeyWorkout/hasAlert/hasPendingSuggestion`;
  **sem** `distanceKm/durationMin` (A3); `phase/status` por linha **ocultos** (D6, sem fetch extra);
  `isInFocus` só client-side ou oculto (D1).
- [ ] 4.3 Estados loading/error/empty (semana sem treinos) — CA4.
- [ ] 4.4 Remover mocks órfãos. **Validação:** `npm run lint && npm run build && npm run test:run`.

## 5. CoachInsightsPage

- [ ] 5.1 Trocar `MOCK_INSIGHTS` por `useCoachInsights`; KPIs mapeados de `kpis`; BarChart de
  `tendenciaCargaSemanal` (volume + TSS).
- [ ] 5.2 LineChart CTL/ATL por semana: ajustar p/ o que o DTO entrega (volume/TSS) ou placeholder (D1).
- [ ] 5.3 Top atletas de `topAtletas[]` (nome + volume).
- [ ] 5.4 Widgets sem fonte (`adherenceRate`, `pendingValidations`, `alertsCount`, `sparklineData`) e abas
  Performance/Saúde/Comparativos → placeholder "em breve" ligado à change-fonte (CA6/R2).
- [ ] 5.5 Estados loading/error/empty — CA4. Remover mocks órfãos.
  **Validação:** `npm run lint && npm run build && npm run test:run`.

## 6. Fechamento

- [ ] 6.1 Garantir 0 referências a `MOCK_ATHLETES`/`buildMockAthletes`/`MOCK_INSIGHTS` nas 3 páginas
  (métrica de sucesso).
- [ ] 6.2 Suíte completa verde: `npm run lint && npm run build && npm run test:run`.
- [ ] 6.3 (Se tocar fluxo crítico) `npm run test:e2e` do shell do coach.
