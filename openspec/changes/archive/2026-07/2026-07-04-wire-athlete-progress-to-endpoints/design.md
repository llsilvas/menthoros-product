# Design: wire-athlete-progress-to-endpoints

## Contexto

`AthleteProgressPage` serve mock. O dado já existe no backend, exposto só via `/{id}/*` para
TECNICO/ADMIN (o coach vê no perfil do atleta). Esta change adiciona o espelho `/me/*` para o próprio
atleta e faz o wiring de frontend — mesmo padrão de `wire-coach-shell-to-dashboards` (reconciliação
campo-a-campo, sem fabricar dado).

## Contrato real dos DTOs (fonte: backend em develop)

```
PmcPontoDto            { data, ctl, atl, tsb, tss, statusForma }       — NOVO /me/metricas/historico
  // SEM volumeKm — volume vem de /me/treinos (D0.2)
ZonaDistribuicaoDto    { z1, z2, z3, z4, z5, duracaoTotalSegundos }    — NOVO /me/metricas/zonas
  // segundos, não percentual — conversão client-side
RecordeDto[]           { distancia, tempoSegundos, data, treinoRealizadoId } — NOVO /me/recordes
AderenciasSemanalDto[] { semanaInicio, totalPlanejado, totalRealizado, percentual } — NOVO /me/aderencia
TreinoRealizadoOutputDto[]  { dataTreino, distanciaKm, tipoTreino, ... } — GET /me/treinos?dias=N (existe, máx 30)
```

## D0 — Decisões que resolvem gaps de dado

### D0.1 — 4º endpoint `/me/aderencia` (decisão de produto, validada com o founder)

O KPI "18 de 21 treinos" (aderência) não tinha fonte com só PMC/zonas/recordes. O método
`AtletaProgressService.getAderenciaSemanal(atletaId, semanas)` **já existe** (usado hoje só pelo
`CoachAthleteProfileServiceImpl`, no perfil do atleta visto pelo coach) — falta só expor via
controller. **Decisão:** adicionar `GET /me/aderencia?semanas=N` (default 4). Custo marginal — reuso
total da camada de serviço, sem migration.

### D0.2 — "Volume total (KPI)" não precisa de endpoint novo

`PmcPontoDto` não carrega `volumeKm`. Mas `GET /me/treinos?dias=28` (já existe, de
`manual-training-entry-lightweight`, máx 30 dias) retorna `distanciaKm` por treino. O KPI "Volume
total últimas 4 semanas" é **derivado client-side** somando `distanciaKm` — sem endpoint novo, sem
duplicar agregação no backend.

### Padrão de segurança dos endpoints `/me/*`

Espelham exatamente o padrão dos endpoints `/me/*` já existentes no mesmo controller (`/me/home`,
`/me/readiness`): `@PreAuthorize("hasRole('ATLETA')")` + `resolverAtletaIdAtual()` (resolve o atleta
pelo JWT `sub` → `Usuario` → `Atleta`, tenant-scoped). **Não** recebem `atletaId` no path — o atleta
só acessa o próprio dado por construção (sem risco de IDOR, diferente dos `/{id}/*` que precisam de
`@RequireTenant`). Os `/{id}/*` permanecem TECNICO/ADMIN, contrato inalterado.

## D1 — Matriz de reconciliação (AthleteProgressPage)

| Campo mock | Tratamento | Origem |
|---|---|---|
| `MOCK_PMC[]` (ctl/atl/tsb/tss por dia) | **Mapear** | `GET /me/metricas/historico` → `PmcPontoDto[]` (reusar `pmcAdapter.ts` existente na feature) |
| `MOCK_ZONES.distribution` (z1–z5 %) | **Derivar** | `ZonaDistribuicaoDto` (segundos) → `zN_pct = zN_seg / duracaoTotalSegundos * 100` |
| `MOCK_ZONES.totalDuration` | **Mapear** | `duracaoTotalSegundos` |
| `MOCK_ZONES.insight` (mensagem/tipo) | **Adiar/Remover** | sem análise no DTO — placeholder "em breve" ou ocultar |
| KPI CTL/ATL/TSB | **Mapear** | último ponto de `PmcPontoDto[]` |
| KPI "Volume total" | **Derivar** | soma `distanciaKm` de `GET /me/treinos?dias=28` (D0.2) |
| KPI "Treinos concluídos: N de M" | **Mapear** | `GET /me/aderencia?semanas=4` → soma `totalRealizado`/`totalPlanejado` (D0.1) |
| `MOCK_PRS[]` (5k/10k/21k) | **Mapear** | `GET /me/recordes` → `RecordeDto[]` (formatar `tempoSegundos` → "HH:MM:SS") |
| Tab Provas vazia | **Mapear** | lista vazia → "ainda sem recordes" (CA3) |

## D2 — Hook, serviço, adapters (idêntico ao coach/irmã, sem React Query)

- **Hooks** em `src/features/athlete/hooks/`: `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`,
  `useAthleteAderencia`, `useAthleteTreinosRecentes` — `useState(data/loading/error)` +
  `useCallback`, sem React Query.
- **Serviço:** `AthleteProgressService.ts` (ou estender `AthleteShellService` da change irmã se ela
  já existir): `getPmcHistorico(from?, to?)`, `getZonas(from?, to?)`, `getRecordes()`,
  `getAderencia(semanas?)`, `getTreinosRecentes(dias?)` — cliente curado, **não** rodar `generate:api`.
- **Tipos** em `src/types/AthleteProgress.ts`; **adapters** em `src/features/athlete/adapters/`:
  `zonesAdapter.ts` (segundos→%), `recordsAdapter.ts` (tempoSegundos→"HH:MM:SS"), `aderenciaAdapter.ts`
  (soma N semanas); reusar `pmcAdapter.ts` existente.

## Riscos e mitigações (pré-mortem)

> "A change foi entregue e deu errado. Por quê?"

- **R1 — `generate:api` não captura os 4 endpoints novos** (backend não no ar ao gerar, ou gerador
  quebra o cliente curado). *Mitigação:* `init` sobe o backend local e confirma os 4 métodos
  manualmente no service curado — não depender do gerador.
- **R2 — Endpoint `/me/*` sem `resolverAtletaIdAtual()` correto** exporia dado errado. *Mitigação:*
  espelhar 1:1 o padrão de `/me/home`/`/me/readiness` já testado; teste de controller por endpoint.
- **R3 — `GET /me/treinos?dias=28` estoura o limite de 30 dias.** *Mitigação:* usar exatamente 28 (4
  semanas cheias), não "mês corrido".
- **R4 — Conversão zonas segundos→% divide por zero** quando `duracaoTotalSegundos = 0` (atleta sem
  treino com FC). *Mitigação:* guardar contra zero → estado vazio "sem dados de zona ainda", não `NaN`.
- **R5 — `RecordeDto` vazio (atleta novo) lido como bug.** *Mitigação:* "ainda sem recordes" explícito
  (CA3).
- **R6 — Mock removido mas fetch falha → tela morta.** *Mitigação:* estados error/empty (CA4) com retry.
- **RP1 — Atleta em onboarding (sem PMC/sem PR) lê como "produto quebrado".** *Mitigação:* estados
  vazios informativos por contexto, nunca `-` genérico.

## Fora de escopo

Home/Plano/Chat (`wire-athlete-shell-to-endpoints`); insight/heurística de zonas; histórico de
aderência além de 4 semanas; mudança nos endpoints `/{id}/*` (permanecem TECNICO/ADMIN); qualquer
migration (nenhuma).
