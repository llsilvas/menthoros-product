# Tasks: add-athlete-progress-endpoints

## 1. DTOs (records)

- [ ] 1.1 `dto/output/PmcPontoDto` (`data`, `ctl`, `atl`, `tsb`, `tss`) — `@JsonInclude(NON_NULL)`,
  `@Schema`.
- [ ] 1.2 `dto/output/ZonaDistribuicaoDto` (`z1..z5` em segundos/percentual, `duracaoTotal`).
- [ ] 1.3 `dto/output/RecordeDto` (`distancia`, `tempo`, `data`, `treinoRealizadoId`).
- [ ] 1.4 `dto/output/ReadinessDto` (`score`, `fatores`).
- [ ] 1.5 `dto/output/AtletaHomeDto` (`proximoTreino`, `metricasChave`).

## 2. Service

- [ ] 2.1 `getHistoricoPmc(atletaId, from, to)` lê `MetricasDiarias` por intervalo (tenant-aware);
  `from`/`to` default = últimos 90 dias quando ausentes. JavaDoc `Idempotent: YES`,
  `Side Effects: NONE`, `Tenant-aware: YES`.
- [ ] 2.2 `getDistribuicaoZonas(atletaId, from, to)` agrega tempo por zona a partir dos treinos/etapas
  realizados no intervalo.
- [ ] 2.3 `getRecordes(atletaId)` deriva PRs (5k/10k/21k) dos treinos realizados.
- [ ] 2.4 `getReadinessAtual(atletaId)` compõe readiness subjetivo (externo) + carga objetiva
  (`MetricasDiarias`/externo); degrada com defaults quando sinais ausentes.
- [ ] 2.5 `getHome(atletaId)` monta próximo treino planejado + métricas-chave (reusa
  `getResumoSemanal`).
- [ ] 2.6 Validar `from <= to`; lançar `DomainNotFoundException` quando o atleta não existe no tenant.

## 3. Controller

- [ ] 3.1 `GET /api/v1/atletas/{id}/metricas/historico?from=&to=` → `ResponseEntity<List<PmcPontoDto>>`.
- [ ] 3.2 `GET /api/v1/atletas/{id}/metricas/zonas?from=&to=` → `ResponseEntity<ZonaDistribuicaoDto>`.
- [ ] 3.3 `GET /api/v1/atletas/{id}/recordes` → `ResponseEntity<List<RecordeDto>>`.
- [ ] 3.4 `GET /api/v1/atletas/me/readiness` → `ResponseEntity<ReadinessDto>` (resolve `me`).
- [ ] 3.5 `GET /api/v1/atletas/me/home` → `ResponseEntity<AtletaHomeDto>` (resolve `me`).
- [ ] 3.6 Todos `@RequireTenant`, com `@Operation`/`@ApiResponses`/`@Parameter`. Endpoints `me/*`
  autorizados para `ROLE_ATLETA`; endpoints `{id}` também para `TECNICO`/`ADMIN`.

## 4. Testes

- [ ] 4.1 Histórico PMC: intervalo respeitado; default 90 dias; pontos ordenados por `data`; vazio
  retorna lista vazia.
- [ ] 4.2 Zonas: soma das zonas = duração total; período sem treinos → zeros.
- [ ] 4.3 Recordes: PR por distância correto; sem treinos → lista vazia.
- [ ] 4.4 Readiness/home: defaults quando sinais ausentes; `me` resolve o atleta do token; tenant
  cruzado → not found.
- [ ] 4.5 `./mvnw clean test` — verde.
