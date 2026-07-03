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

- [ ] 1.1 `src/types/AthleteProgress.ts` — `AthletePmc`, `AthleteZones`, `AthleteRecord`,
  `AthleteAderencia`.
  - verify: `npm run build` verde.
- [ ] 1.2 `src/api/services/AthleteProgressService.ts` (arquivo novo — `AthleteShellService` não
  existe, sem conflito): `getPmcHistorico(from?, to?)`, `getZonas(from?, to?)`, `getRecordes()`,
  `getAderencia(semanas?)`, `getTreinosRecentes(dias?)` — cliente curado, **não** rodar `generate:api`.
  - verify: `npm run build` verde; métodos usam `__request(OpenAPI, {...})`.
- [ ] 1.3 Adapters: `zonesAdapter.ts` (segundos→%; guarda contra `duracaoTotalSegundos=0`),
  `recordsAdapter.ts` (`tempoSegundos`→"HH:MM:SS"), `aderenciaAdapter.ts` (soma N semanas); reusar
  `pmcAdapter.ts` (`buildPmcDataPoints`) direto — `PmcPontoDto` tem os mesmos campos de
  `PmcPontoRaw` que o adapter já consome.
  - verify: `*.test.ts` cobre conversão de zonas (incl. divisão-por-zero) e formatação de recorde.
- [ ] 1.4 Hooks `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`, `useAthleteAderencia`,
  `useAthleteTreinosRecentes` — formato `{ data, loading, error, fetchXxx }`, sem React Query.
  - verify: `npm run build` verde.

## 2. AthleteProgressPage

- [ ] 2.1 Trocar `MOCK_PMC` por `useAthletePmc`.
  - verify: network mostra `/me/metricas/historico`; gráfico PMC com dado real.
- [ ] 2.2 Trocar `MOCK_ZONES.distribution` por `useAthleteZones` (segundos→% na UI); remover
  `MOCK_ZONES.insight` (placeholder "em breve" ou ocultar).
  - verify: distribuição soma 100% (± arredondamento); sem insight fabricado.
- [ ] 2.3 `MOCK_KPI`: CTL/ATL/TSB do último ponto PMC; "Volume total" somando `distanciaKm` de
  `useAthleteTreinosRecentes(28)` (D0.2); "Treinos concluídos: N de M" via `useAthleteAderencia(4)`
  (D0.1).
  - verify: KPIs batem com o perfil do atleta visto pelo coach para o mesmo atleta/período.
- [ ] 2.4 Trocar `MOCK_PRS` por `useAthleteRecordes`; tab Provas: "ainda sem recordes" quando vazio (CA3).
  - verify: atleta sem PR → mensagem, não `MOCK_PRS`.
- [ ] 2.5 Estados loading/error/empty (CA4). Remover mocks. `npm run lint && npm run build && npm run test:run`.
  - verify: suíte verde; grep sem `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.

## 3. Fechamento

- [ ] 3.1 Zero referências a `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` na tela de Progresso.
  - verify: `grep -r` retorna vazio para esses símbolos.
- [ ] 3.2 Suíte completa front (`npm run lint && npm run build && npm run test:run`) + backend
  (`./mvnw clean test`) verde.
- [ ] 3.3 Smoke manual: login ATLETA de tenant com treino manual registrado (9d) → PMC/zonas/recordes/
  aderência batem com o perfil do atleta visto pelo coach (`athlete-profile-drilldown`).
