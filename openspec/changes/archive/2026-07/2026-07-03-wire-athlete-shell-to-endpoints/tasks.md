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

- [x] 1.1 `src/types/AthleteHome.ts` — `AthleteHome` (`proximoTreino?`, `metricasChave?`) e
  `AthleteReadiness` (`score?`, `classificacao?`, `nota?`) espelhando `AtletaHomeDto`/`ReadinessDto`.
  **Não** recriar tipo de plano — reusar `src/types/PlanoSemanal.ts` (já tem `volumePlanejadoKm`/
  `volumeRealizadoKm`/`objetivoSemanal`/`treinosPlanejados[]`).
  - verify: `npm run build` (tsc) verde; campos batem com o contrato do `design.md`.
- [x] 1.2 `src/api/services/AthleteHomeService.ts` (cliente curado, padrão `CoachDashboardService` —
  **não** rodar `generate:api`): `getHome()` → `GET /api/v1/atletas/me/home`, `getReadiness()` →
  `GET /api/v1/atletas/me/readiness`. **Plano NÃO precisa de método novo** — reusar
  `PlanoSemanalService.listarPlanosPorAtleta(atletaId)` (já existe, retorna `PlanoSemanal[]`).
  - verify: `npm run build` verde; 2 métodos novos usam `__request(OpenAPI, {...})`.
- [x] 1.3 Adapters em `src/features/athlete/adapters/`: `homeAdapter.ts` (`AtletaHomeDto` → view model
  da Home) + helper `parseDuracaoMin` ("HH:MM:SS" → minutos) para o `proximoTreino.duracaoMin`.
  Para o plano, reusar/estender o que já houver; `completionStatus` derivado de
  `TreinoPlanejado.statusTreino` (D0.4).
  - verify: `parseDuracaoMin.test.ts` cobre "HH:MM:SS", "00:MM:SS" e malformado (fallback, não `NaN`).
- [x] 1.4 Hooks em `src/hooks/` (ou `src/features/athlete/hooks/`): `useAthleteHome`,
  `useAthleteReadiness`, `useAthletePlan` — padrão `useCoachDashboard` (`useState` data/loading/error
  + `useCallback` fetch), sem React Query. `useAthletePlan` seleciona o plano da **semana corrente**
  da lista retornada por `listarPlanosPorAtleta` (o backend já filtra `APROVADO` para ATLETA
  server-side).
  - verify: `*.test.ts` de cada hook (mock do service) cobre sucesso + erro; `npm run test:run` verde.

## 2. AthleteHomePage

- [x] 2.1 Trocar `MOCK_TODAY` por `useAthleteHome` + `useAthleteReadiness`; `athleteName` via
  `useUserInfo()` (hook JWT já existe, zero fetch).
  - verify: network mostra `/me/home` + `/me/readiness`; grep sem `MOCK_TODAY` no arquivo.
- [x] 2.2 Readiness: passar `score` real + `nota` (como `recommendation`) ao `ReadinessCard`; `trend`
  default `'stable'` (sem série de tendência no DTO). `factors` — o `ReadinessCard` **já ignora**;
  remover o prop `factors` da interface como limpeza (ou passar objeto vazio). D0.3.
  - verify: card renderiza score real; nenhuma barra de recovery/fatigue/sleep; `npm run build` verde.
- [x] 2.3 `TodayHeroCard`: mapear `nextWorkout` de `proximoTreino` (título = `descricao`, duração via
  `parseDuracaoMin`); `workoutType` via adapter de enum; `timeOfDay`/`motivationalMessage` removidos
  ou fixados como decoração de UI (sem fonte — D0.3). Métricas do grid ← `metricasChave.{tss,ctl,tsb,atl}`.
  - verify: hero + métricas mostram dado real; sem string fabricada de "motivação/período".
- [x] 2.4 Estados loading/error/empty (`proximoTreino`/`metricasChave` nulos → estado vazio informativo).
  - verify: teste de componente força error/empty (mock do hook) → UI mostra estado, não crash.
- [x] 2.5 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `MOCK_TODAY`.

## 3. AthletePlanPage

- [x] 3.1 Trocar `buildMockWeek` por `useAthletePlan` (plano `APROVADO` da semana corrente, via
  `listarPlanosPorAtleta`); montar os 7 dias de `treinosPlanejados[]`; `completionStatus` de
  `statusTreino` (`REALIZADO`→completed, `PENDENTE`/`PERDIDO`→pending — D0.4); `workout.type` via
  adapter de enum `tipoTreino`→`WorkoutType`.
  - verify: network mostra `/api/v1/planos/{atletaId}`; dias com `statusTreino=REALIZADO` marcam concluído.
- [x] 3.2 Trocar `MOCK_TSS` por volume: reusar `calcularProgressoVolume(volumeRealizadoKm,
  volumePlanejadoKm)` (helper já existe em `PlanoSemanal.ts`); label "Volume da semana" (D0.5).
  - verify: barra mostra "X km de Y km" / progresso real, não "TSS 425/480".
- [x] 3.3 Estado vazio explícito: lista vazia / sem plano da semana → "seu coach ainda não aprovou o
  plano desta semana" (CA2). `weekLabel` ← `objetivoSemanal` (não fabricar "fase BUILD").
  - verify: atleta sem plano aprovado → mensagem, não `buildMockWeek`.
- [x] 3.4 Remover mock. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `buildMockWeek`/`MOCK_TSS`.

## 4. AthleteCoachPage — placeholder honesto

- [x] 4.1 Trocar `mockCoach` + `<CoachChatPanel messages={[]} .../>` por placeholder "Mensagens chegam
  em breve" linkado a `add-athlete-coach-messaging` (Sprint 25). Não simular conversa nem coach fake.
  - verify: grep sem `mockCoach`/`MOCK_MESSAGES`; UI mostra placeholder datado pela change-fonte.

## 5. Fechamento

- [x] 5.1 Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_TSS`/`MOCK_MESSAGES`/`mockCoach` nas
  telas Home/Plano/Chat.
  - verify: `grep -rn` nessas 3 páginas retorna vazio para esses símbolos.
- [x] 5.2 Suíte completa front verde: **lint limpo, build ok, 44 arquivos / 311 testes** (incl. 32
  novos desta change: adapters, hooks e páginas Home/Plano).
- [x] 5.3 **Smoke manual executado** — login ATLETA real (Keycloak + `Atleta` vinculado por e-mail,
  vínculo automático no primeiro request via `UsuarioSyncServiceImpl`/`JwtTenantFilter`), Home carregou
  com dado real (`/me/home`, `/me/readiness`). Achados corrigidos durante o smoke:
  - **403 → guard de role** (commit `8b7abce`): sessão não-ATLETA batia 403 em `/me/*`; `RoleRoute`
    adicionado na rota `/athlete`, redireciona não-atleta para `/inicio`.
  - **404 → causa identificada** (ambiente, não código): faltava `Atleta` de domínio com e-mail
    casando o usuário Keycloak — vínculo é automático assim que o `Atleta` existe (sem mudança de código).
  - **Cor do card "Próximo" fora do padrão** (commit `c3b9ac1`): usava cor neutra em vez de
    `workoutTypeColor()` (fonte única de cor por tipo de treino, mesma do `DayCard`/Plano). Nota: essa
    fonte tem colisão semântica conhecida, endereçada por `refactor-color-system-premium-v2` (L,
    proposta, não agendada — decisão do founder: deixar como backlog); por usar a função canônica,
    esta tela herda a paleta nova automaticamente quando aquela change for implementada.
  - verify: suíte final **45 arquivos / 316 testes**, lint+build ok.

## Follow-ups / riscos anotados no init

- **Discrepância de contrato de plano a confirmar na implementação:** o front consome
  `GET /api/v1/planos/{atletaId}` retornando **lista** (`PlanoSemanal[]`), enquanto o levantamento do
  backend citou `PlanoTreinoController.buscarPlanoSemanal` retornando **um** `PlanoSemanalOutputDto`
  em `GET /{id}`. Confirmar na task 3.1 qual rota/forma o front realmente recebe e se o filtro
  `APROVADO` para ATLETA se aplica à `listarPlanosPorAtleta` — se não, ajustar o service (ainda
  frontend-only; se exigir mudança de backend, PARAR e sinalizar, pois sairia do escopo S/Fast).
- **`PlanoStatus` do tipo front** (`PLANEJADO|INICIADO|EM_ANDAMENTO|ATIVO|CONCLUIDO`) não tem
  `reviewStatus` — ok, o filtro de aprovação é server-side; o front só recebe o que pode ver.
- **Resolvido na implementação:** o contrato do plano é objeto único (`buscarPlanoSemanal` filtra
  `APROVADO` para ATLETA server-side); o `listarPlanosPorAtleta` do front está mistipado como lista,
  mas `useAthletePlan` normaliza single/array via `selectAthletePlan` — **continua frontend-only**,
  sem mudança de backend. O `atletaId` é resolvido via `UsuarioService.getMe()` (o endpoint de plano
  não é rota `/me`).

## QA gate (`/qa`) — frontend-reviewer + clean-code-reviewer

Rodados em paralelo sobre `git diff develop...feature/wire-athlete-shell-to-endpoints`. Sem Critical.
Segurança ok (sem IDOR client-side — `atletaId` vem do JWT via `/users/me`; sem segredo/`any`/hex).

**Important — corrigidos (commit 5d9139e):**
- **Tendência fabricada:** `ReadinessCard` recebia `trend="stable"` fixo (dado inexistente no backend),
  renderizando "Tendência: Estável" — mesma violação da regra de ouro que já removeu `factors` (D0.3).
  `trend` virou opcional; bloco oculto quando ausente; Home não passa mais.
- **Erro do readiness engolido:** `AthleteHomePage` descartava `error` de `useAthleteReadiness` — falha
  virava "card ausente" indistinguível de empty. Agora exibe aviso inline "Prontidão indisponível" +
  recarregar. +1 teste.

**Minor — alinhamentos e follow-ups (não bloqueiam):**
- `buildWeeklyPlan` mapeia `PERDIDO → 'skipped'` (DayCard suporta o estado, mais honesto que 'pending'
  do texto original da D0.4 — decisão de UI que a própria D0.4 deixa aberta).
- Nomes reais divergem do `design.md` (`AthleteHomeService`/`src/types/AthleteHome`/hooks em
  `src/hooks/`) — refinamento contra o código real, já justificado; não vale re-sincronizar o design.
- **Débito de consolidação (deferido — tocaria o `features/coach`, fora do escopo S/Fast):**
  (a) helpers de data (`weekDatesFromInicio`/`formatWeekRange`) e (b) `mapTipoTreino`/label de tipo de
  treino deveriam ser promovidos a `shared/` (hoje `athlete` importa de `coach/adapters`); (c) 3ª
  variante de parse "HH:MM:SS→min" no código — consolidar em `shared/utils/duration.ts`. Registrados
  para a próxima vez que esses arquivos forem tocados.
- `console.log(QuickCheckInData)` na Home é pré-existente (fora de escopo) — remover quando o check-in
  for ligado ao endpoint da 9k.

**Suíte pós-fix:** lint limpo, build ok, **44 arquivos / 312 testes verdes**.

## Adendo pós-smoke — redirecionamento pós-login por role

Fora do escopo original (`tasks.md` 1–5), mas entregue na mesma branch/PR por completar a
experiência do shell do atleta: login de ATLETA agora vai direto para `/athlete/home` (antes
caía sempre em `/inicio`).

- **Commit `e8b63e9`:** `LoginPage` passa a decidir o destino pós-login pela role do JWT
  (`ATLETA` → `/athlete/home`; demais → `/inicio`).
- **Bug reportado pelo founder ("não funcionou") + fix (commit `4ca6f5f`):** o destino usava
  `roles` de `useUserInfo()`, memoizado uma única vez no mount do `LoginPage` — como o componente
  já estava montado com `isAuthenticated=false` antes do login, o valor ficava congelado vazio
  quando o `AuthProvider.login()` virava o contexto para `true` no mesmo mount, mandando o atleta
  para `/inicio` em vez do shell dele. Corrigido lendo o token direto do `localStorage` a cada
  render, sem cache obsoleto. Testes reescritos usando o `AuthProvider` real (não mockado) para
  reproduzir a corrida de fato — confirmado que falhavam no código antigo e passam com o fix.
- verify: suíte final **46 arquivos / 320 testes verdes**, lint+build ok. PR #27 mergeada em
  `develop` (squash, commit `ad64e766`).
