# Tasks: wire-athlete-shell-to-endpoints (Home + Plano + Chat)

> **Frontend-only** (`apps/menthoros-front`). Zero backend — todos os endpoints já existem em develop.
> Validação por task: `npm run lint && npm run build && npm run test:run`.
>
> **Refinado contra o código real (init 2026-07-03):** reuso significativo do que já existe —
> `PlanoSemanalService.listarPlanosPorAtleta` (plano), tipo `PlanoSemanal` (já tem os campos de
> volume), helper `calcularProgressoVolume`/`formatarPeriodoSemana`, `TreinoPlanejado.statusTreino`
> (D0.4), e o `ReadinessCard` **já ignora `factors`** (destructura só `score/trend/recommendation`) —
> a D0.3 é praticamente grátis. O que falta criar do zero: service+tipos de `/me/home` e
> `/me/readiness` (não existem hoje).

## 1. Cliente curado + tipos + hooks (só home/readiness — plano reusa o existente)

- [ ] 1.1 `src/types/AthleteHome.ts` — `AthleteHome` (`proximoTreino?`, `metricasChave?`) e
  `AthleteReadiness` (`score?`, `classificacao?`, `nota?`) espelhando `AtletaHomeDto`/`ReadinessDto`.
  **Não** recriar tipo de plano — reusar `src/types/PlanoSemanal.ts` (já tem `volumePlanejadoKm`/
  `volumeRealizadoKm`/`objetivoSemanal`/`treinosPlanejados[]`).
  - verify: `npm run build` (tsc) verde; campos batem com o contrato do `design.md`.
- [ ] 1.2 `src/api/services/AthleteHomeService.ts` (cliente curado, padrão `CoachDashboardService` —
  **não** rodar `generate:api`): `getHome()` → `GET /api/v1/atletas/me/home`, `getReadiness()` →
  `GET /api/v1/atletas/me/readiness`. **Plano NÃO precisa de método novo** — reusar
  `PlanoSemanalService.listarPlanosPorAtleta(atletaId)` (já existe, retorna `PlanoSemanal[]`).
  - verify: `npm run build` verde; 2 métodos novos usam `__request(OpenAPI, {...})`.
- [ ] 1.3 Adapters em `src/features/athlete/adapters/`: `homeAdapter.ts` (`AtletaHomeDto` → view model
  da Home) + helper `parseDuracaoMin` ("HH:MM:SS" → minutos) para o `proximoTreino.duracaoMin`.
  Para o plano, reusar/estender o que já houver; `completionStatus` derivado de
  `TreinoPlanejado.statusTreino` (D0.4).
  - verify: `parseDuracaoMin.test.ts` cobre "HH:MM:SS", "00:MM:SS" e malformado (fallback, não `NaN`).
- [ ] 1.4 Hooks em `src/hooks/` (ou `src/features/athlete/hooks/`): `useAthleteHome`,
  `useAthleteReadiness`, `useAthletePlan` — padrão `useCoachDashboard` (`useState` data/loading/error
  + `useCallback` fetch), sem React Query. `useAthletePlan` seleciona o plano da **semana corrente**
  da lista retornada por `listarPlanosPorAtleta` (o backend já filtra `APROVADO` para ATLETA
  server-side).
  - verify: `*.test.ts` de cada hook (mock do service) cobre sucesso + erro; `npm run test:run` verde.

## 2. AthleteHomePage

- [ ] 2.1 Trocar `MOCK_TODAY` por `useAthleteHome` + `useAthleteReadiness`; `athleteName` via
  `useUserInfo()` (hook JWT já existe, zero fetch).
  - verify: network mostra `/me/home` + `/me/readiness`; grep sem `MOCK_TODAY` no arquivo.
- [ ] 2.2 Readiness: passar `score` real + `nota` (como `recommendation`) ao `ReadinessCard`; `trend`
  default `'stable'` (sem série de tendência no DTO). `factors` — o `ReadinessCard` **já ignora**;
  remover o prop `factors` da interface como limpeza (ou passar objeto vazio). D0.3.
  - verify: card renderiza score real; nenhuma barra de recovery/fatigue/sleep; `npm run build` verde.
- [ ] 2.3 `TodayHeroCard`: mapear `nextWorkout` de `proximoTreino` (título = `descricao`, duração via
  `parseDuracaoMin`); `workoutType` via adapter de enum; `timeOfDay`/`motivationalMessage` removidos
  ou fixados como decoração de UI (sem fonte — D0.3). Métricas do grid ← `metricasChave.{tss,ctl,tsb,atl}`.
  - verify: hero + métricas mostram dado real; sem string fabricada de "motivação/período".
- [ ] 2.4 Estados loading/error/empty (`proximoTreino`/`metricasChave` nulos → estado vazio informativo).
  - verify: teste de componente força error/empty (mock do hook) → UI mostra estado, não crash.
- [ ] 2.5 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `MOCK_TODAY`.

## 3. AthletePlanPage

- [ ] 3.1 Trocar `buildMockWeek` por `useAthletePlan` (plano `APROVADO` da semana corrente, via
  `listarPlanosPorAtleta`); montar os 7 dias de `treinosPlanejados[]`; `completionStatus` de
  `statusTreino` (`REALIZADO`→completed, `PENDENTE`/`PERDIDO`→pending — D0.4); `workout.type` via
  adapter de enum `tipoTreino`→`WorkoutType`.
  - verify: network mostra `/api/v1/planos/{atletaId}`; dias com `statusTreino=REALIZADO` marcam concluído.
- [ ] 3.2 Trocar `MOCK_TSS` por volume: reusar `calcularProgressoVolume(volumeRealizadoKm,
  volumePlanejadoKm)` (helper já existe em `PlanoSemanal.ts`); label "Volume da semana" (D0.5).
  - verify: barra mostra "X km de Y km" / progresso real, não "TSS 425/480".
- [ ] 3.3 Estado vazio explícito: lista vazia / sem plano da semana → "seu coach ainda não aprovou o
  plano desta semana" (CA2). `weekLabel` ← `objetivoSemanal` (não fabricar "fase BUILD").
  - verify: atleta sem plano aprovado → mensagem, não `buildMockWeek`.
- [ ] 3.4 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `buildMockWeek`/`MOCK_TSS`.

## 4. AthleteCoachPage — placeholder honesto

- [ ] 4.1 Trocar `mockCoach` + `<CoachChatPanel messages={[]} .../>` por placeholder "Mensagens chegam
  em breve" linkado a `add-athlete-coach-messaging` (Sprint 25). Não simular conversa nem coach fake.
  - verify: grep sem `mockCoach`/`MOCK_MESSAGES`; UI mostra placeholder datado pela change-fonte.

## 5. Fechamento

- [ ] 5.1 Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_TSS`/`MOCK_MESSAGES`/`mockCoach` nas
  telas Home/Plano/Chat.
  - verify: `grep -rn` nessas 3 páginas retorna vazio para esses símbolos.
- [ ] 5.2 Suíte completa front verde (`npm run lint && npm run build && npm run test:run`).
- [ ] 5.3 Smoke manual (E2E opcional — toca fluxo do atleta): login ATLETA de tenant com plano
  aprovado → Home/Plano batem com o que o coach aprovou no perfil do atleta (`athlete-profile-drilldown`).

## Follow-ups / riscos anotados no init

- **Discrepância de contrato de plano a confirmar na implementação:** o front consome
  `GET /api/v1/planos/{atletaId}` retornando **lista** (`PlanoSemanal[]`), enquanto o levantamento do
  backend citou `PlanoTreinoController.buscarPlanoSemanal` retornando **um** `PlanoSemanalOutputDto`
  em `GET /{id}`. Confirmar na task 3.1 qual rota/forma o front realmente recebe e se o filtro
  `APROVADO` para ATLETA se aplica à `listarPlanosPorAtleta` — se não, ajustar o service (ainda
  frontend-only; se exigir mudança de backend, PARAR e sinalizar, pois sairia do escopo S/Fast).
- **`PlanoStatus` do tipo front** (`PLANEJADO|INICIADO|EM_ANDAMENTO|ATIVO|CONCLUIDO`) não tem
  `reviewStatus` — ok, o filtro de aprovação é server-side; o front só recebe o que pode ver.
