# Proposal: wire-athlete-progress-to-endpoints

**Tamanho:** M · **Trilha:** Full (dois repos — backend + frontend — e adiciona endpoints à API)

## Status

Proposed (2026-07-03). **Separada de `wire-athlete-shell-to-endpoints`** por decisão do founder após
product-review (Refine): a tela de Progresso tem justificativa distinta (engajamento/retenção do
atleta — o atleta olhando o próprio histórico) da tela Home+Plano (fecha o loop coach→atleta), e é
onde vivem os 4 endpoints `/me/*` novos. Sequenciada **depois** de `wire-athlete-shell-to-endpoints`
(demo-crítica); arquivos de frontend disjuntos, podem ir em paralelo.

## Why

A tela `/athlete/progress` roda inteira em mock (`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`). É a
visão do atleta sobre a própria evolução — curva PMC, distribuição de zonas, KPIs de carga e recordes.
Não fecha o loop coach→atleta como Home+Plano, mas é o que mantém o **atleta** engajado no app entre
uma aprovação de plano e outra (retenção — critério indireto do North Star: risco/progresso do atleta
mais fácil de ver, aqui pelo próprio atleta).

O dado já existe no backend, exposto hoje **só via `/{id}/*` para TECNICO/ADMIN** (o coach vê no
perfil do atleta, `athlete-profile-drilldown`). Falta o espelho `/me/*` para o próprio atleta e o
wiring de frontend.

## What Changes

### Backend (`AtletaProgressController`, 4 endpoints `/me/*`)

Cada um: `@PreAuthorize("hasRole('ATLETA')")`, resolve `atletaId` via `resolverAtletaIdAtual()`,
delega no método de serviço já existente (usado hoje pelos endpoints `/{id}/*` e pelo perfil do
coach). Sem migration, sem mudança de contrato dos `/{id}/*` existentes.

- `GET /me/metricas/historico` → `getHistoricoPmc` (PMC, `List<PmcPontoDto>`).
- `GET /me/metricas/zonas` → `getDistribuicaoZonas` (`ZonaDistribuicaoDto`).
- `GET /me/recordes` → `getRecordes` (`List<RecordeDto>`).
- `GET /me/aderencia?semanas=N` (default 4) → `getAderenciaSemanal` (`List<AderenciasSemanalDto>`,
  D0.1 — o método já existe, usado só pelo `CoachAthleteProfileServiceImpl`; falta expor).

### Frontend (`apps/menthoros-front`, `features/athlete`)

- `AthleteProgressService.ts` (ou estender o `AthleteShellService` da change irmã) + hooks
  `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`, `useAthleteAderencia`.
- `AthleteProgressPage`: troca os 4 mocks pelos endpoints; KPI "Volume total" derivado client-side de
  `GET /me/treinos?dias=28` (já existe — sem endpoint novo, D0.2); zonas em segundos → percentual na
  UI; tab Provas com placeholder "ainda sem recordes" quando `recordes` vier vazio (CA-sem-invenção);
  insight textual de zonas removido/placeholder (sem fonte no DTO).

## Critérios de aceite

- **CA1 — 4 endpoints `/me/*`:** cada um responde 200 para role ATLETA, resolve o atleta pelo JWT,
  espelha exatamente o dado do `/{id}/*` correspondente; os `/{id}/*` seguem TECNICO/ADMIN sem
  alteração. Teste de controller por endpoint.
- **CA2 — Progresso real:** `/athlete/progress` consome os 4 endpoints + `/me/treinos` (volume), zero
  `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.
- **CA3 — Sem dado inventado:** PRs vazios → "ainda sem recordes"; insight de zonas sem fonte →
  removido/placeholder; nenhum número fabricado.
- **CA4 — Estados explícitos** (loading/error/empty) na tela, mesmo padrão de
  `wire-coach-shell-to-dashboards`.
- **CA5 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) + `./mvnw clean
  test` (backend) verdes.

## Métrica de sucesso

Zero referências a `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` no bundle da tela de Progresso.
Proxy demonstrável: os números de PMC/zonas/recordes/aderência que o atleta vê batem com os que o
coach vê no perfil dele (`athlete-profile-drilldown`) — ambos consomem os mesmos métodos de serviço.
Sem métrica de negócio instrumentada (change de wiring de engajamento — aceitável, registrado).

## Impact

- **Depende de:** `add-athlete-progress-endpoints` (métodos de serviço + DTOs), `manual-training-entry-lightweight`
  (dado real de treino para volume/aderência) — ambas em `develop`.
- **Repos:** `apps/menthoros-backend` (4 endpoints, sem migration) + `apps/menthoros-front` (Progresso).
- **Relação com a irmã:** independente de `wire-athlete-shell-to-endpoints` (arquivos frontend
  disjuntos — esta toca `AthleteProgressPage`, a outra Home/Plan/Coach). Se ambas criarem
  `AthleteShellService`/`AthleteProgressService`, coordenar para não colidir (a que for primeiro cria,
  a segunda estende).

## Open Questions & Assumptions

- ✅ **`/me/aderencia` (D0.1):** decisão do founder — expor o método já existente em vez de fabricar
  o KPI "N de M treinos".
- ✅ **Volume via `/me/treinos?dias=28` (D0.2):** sem endpoint novo — deriva client-side somando
  `distanciaKm`.
- Assume-se `dias=28` (4 semanas cheias) como janela de "últimas 4 semanas" nos KPIs (volume,
  aderência) — leitura direta do texto do mock; não confirmado explicitamente.
- Insight textual de zonas (`MOCK_ZONES.insight`) não tem fonte no `ZonaDistribuicaoDto` → removido
  ou placeholder. Se o produto quiser um insight real, é change futura (heurística ou LLM) — não
  fabricar aqui.
