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

- **CA1 — 4 endpoints `/me/*`:** GIVEN um usuário autenticado com role ATLETA WHEN ele chama
  `GET /api/v1/atletas/me/metricas/historico`, `/me/metricas/zonas`, `/me/recordes` ou
  `/me/aderencia?semanas=N` THEN a API responde 200, resolve o `atletaId` via `resolverAtletaIdAtual()`
  (JWT, sem receber `atletaId` no path) e retorna exatamente o dado do método de serviço espelhado
  (`getHistoricoPmc`/`getDistribuicaoZonas`/`getRecordes`/`getAderenciaSemanal`), o mesmo que os
  endpoints `/{id}/*` (TECNICO/ADMIN) retornam para aquele atleta — sem alteração de contrato ou de
  role nos `/{id}/*` existentes. Teste de controller por endpoint confirma o 200 + o espelhamento.
- **CA2 — Progresso real:** GIVEN a tela `/athlete/progress` carregada WHEN os 4 endpoints + `/me/treinos`
  respondem THEN a UI exibe PMC/zonas/recordes/aderência/volume reais, com zero referências a
  `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` no código entregue.
- **CA3 — Sem dado inventado:** GIVEN um atleta sem recordes WHEN a tab Provas carrega THEN exibe
  "ainda sem recordes" (não uma lista vazia silenciosa); GIVEN o `ZonaDistribuicaoDto` sem campo de
  insight WHEN a tela de zonas renderiza THEN nenhum texto de insight é fabricado (placeholder
  explícito ou seção removida) — nenhum número ou texto sem fonte no DTO.
- **CA4 — Estados explícitos:** GIVEN qualquer uma das 4 chamadas em loading/erro/vazio WHEN a tela
  renderiza THEN mostra o estado correspondente (spinner/aviso com retry/mensagem vazia informativa),
  nunca uma tela em branco — mesmo padrão de `wire-coach-shell-to-dashboards`.
- **CA5 — Sem regressão:** GIVEN a suíte de validação WHEN executada THEN `npm run lint && npm run
  build && npm run test:run` (front) e `./mvnw clean test` (backend) terminam verdes.

## Métrica de sucesso

Zero referências a `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` no bundle da tela de Progresso.
Proxy demonstrável: os números de PMC/zonas/recordes/aderência que o atleta vê batem com os que o
coach vê no perfil dele (`athlete-profile-drilldown`) — ambos consomem os mesmos métodos de serviço.
Sem métrica de negócio instrumentada (change de wiring de engajamento — aceitável, registrado).

## Impact

- **Depende de:**
  - `add-athlete-progress-endpoints` (métodos de serviço + DTOs) — merged 2026-06-17
    (`archive/2026-06/2026-06-17-add-athlete-progress-endpoints`); confirmado em código:
    `AtletaProgressService.getHistoricoPmc/getDistribuicaoZonas/getRecordes/getAderenciaSemanal` e os
    DTOs `PmcPontoDto`/`ZonaDistribuicaoDto`/`RecordeDto`/`AderenciasSemanalDto` já existem em `develop`.
  - `manual-training-entry-lightweight` (dado real de treino para volume/aderência) — merged
    2026-06-19 (`archive/2026-06/2026-06-19-manual-training-entry-lightweight`); confirmado em código:
    `GET /me/treinos?dias=N` (`AtletaTreinoController`, máx. 30 dias) retorna `distanciaKm` por treino.
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
