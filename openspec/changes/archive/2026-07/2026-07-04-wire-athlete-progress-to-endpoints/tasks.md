# Tasks: wire-athlete-progress-to-endpoints

> **Refinado contra o código real (init 2026-07-03).** Confirmado em
> `apps/menthoros-backend/.../controller/AtletaProgressController.java`: os 4 métodos de serviço
> (`getHistoricoPmc`, `getDistribuicaoZonas`, `getRecordes`, `getAderenciaSemanal`) e
> `resolverAtletaIdAtual()` já existem em `AtletaProgressService` — é só espelhar o padrão de
> `/me/home`/`/me/readiness` (mesmo controller, linhas 97–125: `@PreAuthorize("hasRole('ATLETA')")`,
> sem `@RequireTenant`, sem `@PathVariable`). Confirmado em `apps/menthoros-front`: `AthleteShellService`
> **não existe** (a change irmã criou `AthleteHomeService.ts`, nome diferente) — o serviço novo desta
> change é `AthleteProgressService.ts`, arquivo próprio, sem conflito. `pmcAdapter.ts`
> (`features/athlete/adapters/`) já existe e opera sobre `PmcPontoRaw[]` (mesmos campos de
> `PmcPontoDto`) — reusar `buildPmcDataPoints` direto. `AthleteProgressPage.tsx` confirmado com
> `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` (linhas 42/50/61/75) consumidos por `TabForma`/
> `TabVolume`/`TabOverview`/`TabProvas`.

## 0. Backend — 4 endpoints `/me/*` (AtletaProgressController)

- [x] 0.1 `GET /api/v1/atletas/me/metricas/historico` — `@PreAuthorize("hasRole('ATLETA')")`, resolve
  `atletaId` via `resolverAtletaIdAtual()`, delega em `getHistoricoPmc`.
  - verify: teste de controller 200 com dado; rota `/me/metricas/historico`; sem `@RequireTenant`
    (self-resolving, mesmo padrão de `/me/home`).
- [x] 0.2 `GET /api/v1/atletas/me/metricas/zonas` → `getDistribuicaoZonas`.
  - verify: teste de controller 200.
- [x] 0.3 `GET /api/v1/atletas/me/recordes` → `getRecordes`.
  - verify: teste de controller 200; lista vazia não quebra.
- [x] 0.4 `GET /api/v1/atletas/me/aderencia?semanas=N` (default 4) → `getAderenciaSemanal` (D0.1).
  - verify: teste de controller 200; default `semanas=4` quando omitido.
- [x] 0.5 `./mvnw clean test` verde; nenhuma mudança nos endpoints `/{id}/*` (permanecem TECNICO/ADMIN).
  - verify: suíte backend sem regressão.

## 1. Cliente curado + tipos + hooks (frontend)

- [x] 1.1 `src/types/AthleteProgress.ts` — `AthletePmc`, `AthleteZones`, `AthleteRecord`,
  `AthleteAderencia`.
  - verify: `npm run build` verde.
- [x] 1.2 `src/api/services/AthleteProgressService.ts` (arquivo novo — `AthleteShellService` não
  existe, sem conflito): `getPmcHistorico(from?, to?)`, `getZonas(from?, to?)`, `getRecordes()`,
  `getAderencia(semanas?)`, `getTreinosRecentes(dias?)` — cliente curado, **não** rodar `generate:api`.
  - verify: `npm run build` verde; métodos usam `__request(OpenAPI, {...})`.
- [x] 1.3 Adapters: `zonesAdapter.ts` (segundos→%; guarda contra `duracaoTotalSegundos=0`),
  `recordsAdapter.ts` (`tempoSegundos`→"HH:MM:SS"), `aderenciaAdapter.ts` (soma N semanas); reusar
  `pmcAdapter.ts` (`buildPmcDataPoints`) direto — `PmcPontoDto` tem os mesmos campos de
  `PmcPontoRaw` que o adapter já consome.
  - verify: `*.test.ts` cobre conversão de zonas (incl. divisão-por-zero) e formatação de recorde.
- [x] 1.4 Hooks `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`, `useAthleteAderencia`,
  `useAthleteTreinosRecentes` — formato `{ data, loading, error, fetchXxx }`, sem React Query.
  - verify: `npm run build` verde.

## 2. AthleteProgressPage

- [x] 2.1 Trocar `MOCK_PMC` por `useAthletePmc`.
  - verify: network mostra `/me/metricas/historico`; gráfico PMC com dado real.
- [x] 2.2 Trocar `MOCK_ZONES.distribution` por `useAthleteZones` (segundos→% na UI); remover
  `MOCK_ZONES.insight` (placeholder "em breve" ou ocultar).
  - verify: distribuição soma 100% (± arredondamento); sem insight fabricado.
- [x] 2.3 `MOCK_KPI`: CTL/ATL/TSB do último ponto PMC; "Volume total" somando `distanciaKm` de
  `useAthleteTreinosRecentes(28)` (D0.2); "Treinos concluídos: N de M" via `useAthleteAderencia(4)`
  (D0.1).
  - verify: KPIs batem com o perfil do atleta visto pelo coach para o mesmo atleta/período.
- [x] 2.4 Trocar `MOCK_PRS` por `useAthleteRecordes`; tab Provas: "ainda sem recordes" quando vazio (CA3).
  - verify: atleta sem PR → mensagem, não `MOCK_PRS`.
- [x] 2.5 Estados loading/error/empty (CA4). Remover mocks. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.

## 3. Fechamento

- [x] 3.1 Zero referências a `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` na tela de Progresso.
  - verify: `grep -r` retorna vazio para esses símbolos.
- [x] 3.2 Suíte completa front (`npm run lint && npm run build && npm run test:run`) + backend
  (`./mvnw clean test`) verde.
- [x] 3.3 Smoke manual: login ATLETA de tenant com treino manual registrado (9d) → PMC/zonas/recordes/
  aderência batem com o perfil do atleta visto pelo coach (`athlete-profile-drilldown`).
  - **Smoke executado (2026-07-03):** ambiente subido (postgres+redis+keycloak reaproveitando o
    volume `menthoros_pg_data` + backend na branch atual), login ATLETA real. Os 4 tabs
    (Visão Geral/Forma/Volume/Provas) carregaram dado real dos 5 endpoints (`/me/metricas/historico`,
    `/me/metricas/zonas`, `/me/recordes`, `/me/aderencia?semanas=4`, `/me/treinos?dias=28`), todos 200.
    KPIs (CTL 41 / ATL 34 / TSB +7) batem entre Home e Progresso — mesma pipeline PMC. Zonas somam
    100% sem insight fabricado; recordes formatados (`HH:MM:SS`) corretamente; sem erro no console.
    Equivalência coach↔atleta garantida pelo próprio código (`/me/*` delega nos mesmos métodos de
    serviço dos `/{id}/*`, coberto por `AtletaProgressControllerTest`) — dispensa novo login como coach.

## QA gate (`/qa`) — code-reviewer + security-reviewer (backend) + frontend-reviewer + clean-code-reviewer

Rodados em paralelo sobre `git diff develop...feature/wire-athlete-progress-to-endpoints`. Sem Critical.
Segurança ok (sem IDOR — `atletaId` só via JWT/`resolverAtletaIdAtual()`, sem `@PathVariable`;
`validarAtletaNoTenant()` revalida tenant em cada método de serviço; DTOs sem PII).

**Corrigidos:**
- **`semanas` sem limite superior (`AtletaProgressController.java`, commit `d6ea34f`):** `@Min(1)`
  sem `@Max` permitia valor arbitrário; `getAderenciaSemanal` varreria todo o histórico de
  `TreinoPlanejado` sem paginação — custo de leitura evitável / DoS trivial e barato. Adicionado
  `MAX_SEMANAS_ADERENCIA = 104` (2 anos) + `@ApiResponse 400` no Swagger + testes de borda
  (`semanas=0` e `=105` → 400, BVA).
- **Duplicação de endpoint/hook/tipo (`AthleteProgressPage.tsx`, commit `4ee0236`):** `GET
  /me/treinos` já tinha cliente curado (`ManualTrainingService.listarRecentes`) e hook
  (`useManualTraining`) próprios — `AthleteProgressService.getTreinosRecentes`/
  `useAthleteTreinosRecentes`/`AthleteTreinoRecente` duplicavam sem necessidade. Removidos; o KPI
  "Volume total" agora reusa `useManualTraining(28)`.
- **Bug real — "Volume total" podia fabricar "0 km" (mesmo commit):** `useManualTraining.isFetching`
  começa em `false` (diferente dos outros hooks desta página, que começam `loading=true`) — sem
  guard, o primeiro render mostrava "0" em vez de "—" antes do fetch resolver, violando a regra de
  nunca fabricar dado (CA3). Corrigido com um flag local `treinosFetched` setado só após o
  `fetchRecentes()` resolver; teste dedicado adicionado.

**Minor — registrados, não bloqueiam:**
- `ZONAS_PERIOD_LABEL` fixo ("Últimos 90 dias") assume o default do backend — se mudar, diverge
  silenciosamente do dado real. `ultimoPmc` assume ordenação ascendente do array PMC sem validar.
  `buildKpis`/`formatSinal`/cálculo de `volumeKm` ficaram inline na página em vez de em um adapter
  próprio (diferente de `zonesAdapter`/`recordsAdapter`/`aderenciaAdapter`) — não testado em
  isolamento (só via teste de componente); extrair para `kpisAdapter.ts` reduziria o risco de bugs
  como o de "Volume total" recorrerem. Falta cobertura de `422` (intervalo `from > to`) em
  `/me/metricas/historico`/`zonas` — gap pré-existente aos `/{id}/*`, não introduzido por esta change.
- Nomeação: a aba "Volume" (zonas de FC) e o KPI "Volume total" (km) usam o mesmo termo para métricas
  diferentes — sem risco funcional, só clareza.

**Suíte pós-fix:** frontend lint+build ok, **54 arquivos / 346 testes verdes**; backend
**1118 testes verdes** (`./mvnw clean test`).
