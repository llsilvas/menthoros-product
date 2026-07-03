# Tasks: wire-athlete-shell-to-endpoints

## 0. Backend — 3 endpoints `/me/*` (AtletaProgressController)

- [ ] 0.1 `GET /api/v1/atletas/me/metricas/historico` — `@PreAuthorize("hasRole('ATLETA')")`,
  resolve `atletaId` via `resolverAtletaIdAtual()`, delega em `getHistoricoPmc`. Teste de
  controller (200 com dado, tenant isolado via service layer).
- [ ] 0.2 `GET /api/v1/atletas/me/metricas/zonas` — idem, delega em `getDistribuicaoZonas`.
- [ ] 0.3 `GET /api/v1/atletas/me/recordes` — idem, delega em `getRecordes`.
- [ ] 0.4 Suíte backend verde; nenhuma mudança nos endpoints `{id}` existentes.

## 1. Cliente curado + hooks (frontend)

- [ ] 1.1 `src/api/services/AthleteProgressService.ts` (padrão `CoachDashboardService`):
  `getHome()`, `getReadiness()`, `getPlanoSemanal(atletaId)`, `getPmc()`, `getZonas()`,
  `getRecordes()`.
- [ ] 1.2 Hooks: `useAthleteHome`, `useAthletePlan`, `useAthletePmc`, `useAthleteZones`,
  `useAthleteRecordes` — mesmo formato `{ data, loading, error, refetch }`.

## 2. AthleteHomePage

- [ ] 2.1 Trocar `MOCK_TODAY` por `useAthleteHome` + `useAthleteReadiness`.
- [ ] 2.2 Estados loading/error/empty (sem plano/sem dado ainda).
- [ ] 2.3 Remover mock. Validação: `npm run lint && npm run build && npm run test:run`.

## 3. AthletePlanPage

- [ ] 3.1 Trocar `buildMockWeek`/`MOCK_TSS` por `useAthletePlan` (plano aprovado real).
- [ ] 3.2 Estado vazio explícito: "seu coach ainda não aprovou o plano desta semana".
- [ ] 3.3 Remover mock. Validação igual acima.

## 4. AthleteProgressPage

- [ ] 4.1 Trocar `MOCK_PMC` por `useAthletePmc`; `MOCK_ZONES` por `useAthleteZones`;
  `MOCK_KPI` derivado dos dados reais (CTL/ATL/TSB/volume/adesão); `MOCK_PRS` por
  `useAthleteRecordes`.
- [ ] 4.2 Tab Provas: placeholder "ainda sem recordes" quando lista vier vazia (CA7).
- [ ] 4.3 Remover mocks. Validação igual acima.

## 5. AthleteCoachPage — placeholder honesto

- [ ] 5.1 Trocar `MOCK_MESSAGES`/`mockCoach` por placeholder "Mensagens chegam em breve"
  linkado a `add-athlete-coach-messaging`. Não simular conversa.

## 6. Fechamento

- [ ] 6.1 Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/
  `MOCK_PRS`/`MOCK_MESSAGES`/`mockCoach` nas páginas do atleta.
- [ ] 6.2 Suíte completa front + backend verde.
- [ ] 6.3 Smoke manual: login ATLETA de tenant com plano aprovado + treino manual registrado
  (9d) → números batem com o perfil do atleta visto pelo coach (`athlete-profile-drilldown`).
