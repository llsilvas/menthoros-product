# Tasks: add-athlete-progress-endpoints

## 1. DTOs (records)

- [x] 1.1 `dto/output/PmcPontoDto` (`data`, `ctl`, `atl`, `tsb`, `tss`) — `@JsonInclude(NON_NULL)`,
  `@Schema`.
- [x] 1.2 `dto/output/ZonaDistribuicaoDto` (`z1..z5` em segundos/percentual, `duracaoTotal`).
- [x] 1.3 `dto/output/RecordeDto` (`distancia`, `tempo`, `data`, `treinoRealizadoId`).
- [x] 1.4 `dto/output/ReadinessDto` (`score`, `fatores`).
- [x] 1.5 `dto/output/AtletaHomeDto` (`proximoTreino`, `metricasChave`).

## 2. Service

- [x] 2.1 `getHistoricoPmc(atletaId, from, to)` lê `MetricasDiarias` por intervalo (tenant-aware);
  `from`/`to` default = últimos 90 dias quando ausentes. JavaDoc `Idempotent: YES`,
  `Side Effects: NONE`, `Tenant-aware: YES`.
- [x] 2.2 `getDistribuicaoZonas(atletaId, from, to)` agrega tempo por zona a partir dos treinos/etapas
  realizados no intervalo.
- [x] 2.3 `getRecordes(atletaId)` deriva PRs (5k/10k/21k) dos treinos realizados.
- [x] 2.4 `getReadinessAtual(atletaId)` compõe readiness subjetivo (externo) + carga objetiva
  (`MetricasDiarias`/externo); degrada com defaults quando sinais ausentes.
- [x] 2.5 `getHome(atletaId)` monta próximo treino planejado + métricas-chave (reusa
  `getResumoSemanal`).
- [x] 2.6 Validar `from <= to`; lançar `DomainNotFoundException` quando o atleta não existe no tenant.

## 3. Controller

- [x] 3.1 `GET /api/v1/atletas/{id}/metricas/historico?from=&to=` → `ResponseEntity<List<PmcPontoDto>>`.
- [x] 3.2 `GET /api/v1/atletas/{id}/metricas/zonas?from=&to=` → `ResponseEntity<ZonaDistribuicaoDto>`.
- [x] 3.3 `GET /api/v1/atletas/{id}/recordes` → `ResponseEntity<List<RecordeDto>>`.
- [x] 3.4 `GET /api/v1/atletas/me/readiness` → `ResponseEntity<ReadinessDto>` (resolve `me`).
- [x] 3.5 `GET /api/v1/atletas/me/home` → `ResponseEntity<AtletaHomeDto>` (resolve `me`).
- [~] 3.6 `@Operation`/`@ApiResponses`/`@Parameter` ✅; `me/*` → `hasRole('ATLETA')`, `{id}` → `hasAnyRole('TECNICO','ADMIN')` ✅. **Desvio do `@RequireTenant`:** ele lança `AccessDeniedException`→**403**, mas o spec exige **404** em cross-tenant. Isolamento garantido via consulta tenant-scoped no serviço (`findByIdAndTenantId`→`DomainNotFoundException`→404), igual ao padrão do `MetricasController`. `me/*` é auto-resolvido (sem `@RequireTenant`, conforme CLAUDE.md).

## 4. Testes

- [x] 4.1 Histórico PMC: intervalo respeitado; default 90 dias; pontos ordenados por `data`; vazio
  retorna lista vazia.
- [x] 4.2 Zonas: soma das zonas = duração total; período sem treinos → zeros.
- [x] 4.3 Recordes: PR por distância correto; sem treinos → lista vazia.
- [x] 4.4 Readiness/home: defaults quando sinais ausentes; `me` resolve o atleta do token; tenant
  cruzado → not found.
- [x] 4.5 `./mvnw clean test` — verde.
