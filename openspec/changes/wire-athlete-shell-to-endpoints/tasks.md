# Tasks: wire-athlete-shell-to-endpoints (Home + Plano + Chat)

> **Frontend-only** (`apps/menthoros-front`). Zero backend — todos os endpoints já existem em develop.
> Validação por task: `npm run lint && npm run build && npm run test:run`.

## 1. Cliente curado + tipos + hooks

- [ ] 1.1 `src/types/AthleteShell.ts` — tipos de domínio espelhando os DTOs reais (`AthleteHome`,
  `AthleteReadiness`, `AthletePlan` + `AthletePlanDay`).
  - verify: `tsc` (via `npm run build`) sem erro; tipos batem com os campos do contrato (design.md).
- [ ] 1.2 `src/api/services/AthleteShellService.ts` (padrão `CoachDashboardService`, cliente curado —
  **não** rodar `generate:api`): `getHome()` → `/me/home`, `getReadiness()` → `/me/readiness`,
  `getPlanoSemanal(atletaId)` → `/api/v1/planos/{id}`.
  - verify: `npm run build` verde; 3 métodos usam `__request(OpenAPI, {...})` contra rotas existentes.
- [ ] 1.3 Adapters em `src/features/athlete/adapters/`: `homeAdapter.ts`, `planAdapter.ts` (funções
  puras `buildXxxFromDto()`) + helper compartilhado de parser `duracaoMin` ("HH:MM:SS" → minutos).
  - verify: `*.test.ts` do parser cobre formato válido, "00:MM:SS" e malformado (fallback seguro).
- [ ] 1.4 Hooks: `useAthleteHome`, `useAthleteReadiness`, `useAthletePlan` — formato
  `{ data, loading, error, fetchXxx }`, sem React Query.
  - verify: `npm run build` verde; hooks disparam no `useEffect` de mount da página.

## 2. AthleteHomePage

- [ ] 2.1 Trocar `MOCK_TODAY` por `useAthleteHome` + `useAthleteReadiness`; `athleteName` via
  `useUserInfo()` (hook JWT já existe).
  - verify: DevTools/network mostra `/me/home` + `/me/readiness`; nenhuma referência a `MOCK_TODAY`.
- [ ] 2.2 Remover `readiness.factors` (recovery/fatigue/sleep) da UI (D0.3); manter só `score` + `nota`.
  - verify: UI não renderiza barras de sub-fatores; só o score agregado.
- [ ] 2.3 Estados loading/error/empty (sem `proximoTreino`/`metricasChave`).
  - verify: forçar erro/empty (mock de service no teste) → UI mostra estado, não crash.
- [ ] 2.4 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `MOCK_TODAY` no arquivo.

## 3. AthletePlanPage

- [ ] 3.1 Trocar `buildMockWeek` por `useAthletePlan` (plano `APROVADO` real); `completionStatus`
  mapeado de `statusTreino` (D0.4).
  - verify: network mostra `/api/v1/planos/{id}`; dias com `statusTreino=REALIZADO` marcam concluído.
- [ ] 3.2 Trocar `MOCK_TSS` por `volumeRealizadoKm`/`volumePlanejadoKm` (D0.5), label "Volume da semana".
  - verify: barra mostra "X km de Y km", não "TSS 425/480".
- [ ] 3.3 Estado vazio explícito: "seu coach ainda não aprovou o plano desta semana" (sem plano APROVADO).
  - verify: atleta sem plano aprovado → mensagem, não `buildMockWeek`.
- [ ] 3.4 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `buildMockWeek`/`MOCK_TSS`.

## 4. AthleteCoachPage — placeholder honesto

- [ ] 4.1 Trocar `MOCK_MESSAGES`/`mockCoach` por placeholder "Mensagens chegam em breve" linkado a
  `add-athlete-coach-messaging`. Não simular conversa.
  - verify: grep sem `MOCK_MESSAGES`/`mockCoach`; UI mostra placeholder datado pela change-fonte.

## 5. Fechamento

- [ ] 5.1 Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_TSS`/`MOCK_MESSAGES`/`mockCoach` nas
  telas Home/Plano/Chat.
  - verify: `grep -r` nas páginas do atleta retorna vazio para esses símbolos.
- [ ] 5.2 Suíte completa front verde (`npm run lint && npm run build && npm run test:run`).
- [ ] 5.3 Smoke manual: login ATLETA de tenant com plano aprovado → Home/Plano batem com o que o
  coach aprovou no perfil do atleta (`athlete-profile-drilldown`).
