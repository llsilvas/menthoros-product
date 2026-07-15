# Tasks: intervals-icu-activity-ingestion

Backend `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test` verde.
TDD: teste antes da implementação em cada bloco.

## Bloco 1 — Client: `buscarAtividade` + `IcuActivityDto` (D1)

- [ ] 1.1 Criar `IcuActivityDto` (record, `@JsonIgnoreProperties(ignoreUnknown = true)`) com os
      campos do D1; teste de desserialização com fixture JSON representativa (campos presentes,
      ausentes e extras).
- [ ] 1.2 Adicionar `buscarAtividade(String apiKey, String activityId)` à interface
      `IntervalsIcuClient` e implementar em `IntervalsIcuClientImpl` (GET `/api/v1/activity/{id}`,
      Basic Auth por chamada, `traduz` para erros; key/body nunca logados). Testes no padrão dos
      métodos existentes do client (sucesso, 404, 403, falha de transporte).
- [ ] 1.3 Validação: `./mvnw clean test`.

## Bloco 2 — Mapper `IcuActivityDto` → `TreinoRealizado` (D2)

- [ ] 2.1 Testes do `IntervalsIcuActivityMapper` primeiro: mapeamento completo com valores de
      referência (m/s → pace min/km, m → km, seg → min), campos nulos tolerados, RPE presente e
      ausente, sanitização de cadência (mesma regra do FIT/Strava), null input →
      `IllegalArgumentException`, filtro de modalidade (Run/TrailRun/VirtualRun/Treadmill aceitos;
      Ride rejeitado).
- [ ] 2.2 Implementar o mapper (componente puro, sem IO) até os testes passarem;
      `metadadosSincronizacao` com `{icuTrainingLoad, calories, totalElevationGain, deviceName}`.
- [ ] 2.3 Validação: `./mvnw clean test`.

## Bloco 3 — Extração do `ReconciliationDecisionExecutor` (D4, refactor sem mudança de comportamento)

- [ ] 3.1 Extrair de `DailyActivitySyncSchedulerImpl.persistMatchingDecision` o colaborador
      `ReconciliationDecisionExecutor` (decisão via `MatchingDecisionEngine` + persistência de
      status/score/reason/vínculo/auditoria). Scheduler delega; nenhuma asserção de teste
      existente afrouxada.
- [ ] 3.2 Testes unitários do executor cobrindo os quatro desfechos (VINCULADO_AUTOMATICO,
      AMBIGUO por faixa, AMBIGUO por tie-break, NAO_PLANEJADO) + auditoria gravada + sem
      candidatos na data.
- [ ] 3.3 Validação: `./mvnw clean test` (suítes do scheduler intactas).

## Bloco 4 — Serviço de ingestão (D3)

- [ ] 4.1 Testes do `IntervalsIcuActivityIngestionServiceImpl` primeiro (Mockito, `@Nested` por
      método, tenant via `TenantContext` em `@BeforeEach/@AfterEach`): happy path (CA1, CA8),
      idempotência sem chamada externa quando já existe (CA2), sem conexão → 409 (CA4),
      NOT_FOUND/FORBIDDEN do client → `DomainNotFoundException` (CA5), athlete_id divergente →
      404, modalidade inválida → 422 (CA6), corrida de dedup (`SaveResult` não-inserted → sem
      evento/TSB/reconciliação), reconciliação inline chamada com o treino inserido (CA3).
- [ ] 4.2 Implementar interface + impl com JavaDoc de idempotência/side effects/tenant-aware;
      HTTP fora da TX, persistência+reconciliação em colaborador transacional.
- [ ] 4.3 Validação: `./mvnw clean test`.

## Bloco 5 — Endpoint (D5)

- [ ] 5.1 Verificar handler de `IntervalsIcuApiException` no `GlobalExceptionHandler`; adicionar
      se ausente (mesmo commit do controller).
- [ ] 5.2 `IntervalsIcuActivityController` — `POST
      /api/v1/intervals-icu/atletas/{atletaId}/activities/{activityId}/import`, `@PreAuthorize`
      TECNICO/ADMIN, `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (tag ASCII
      kebab-case, 200/403/404/409/422). Teste de autorização no padrão dos
      `*ControllerAuthTest` da change `complete-authorization-controllers` (roles aceitas,
      ATLETA negado, anônimo negado).
- [ ] 5.3 Validação: `./mvnw clean test`.

## Bloco 6 — Gate de validação real (D6)

- [ ] 6.1 Smoke com atleta real conectado: importar uma activity de corrida verdadeira pelo
      endpoint; conferir métricas (distância, pace, FC), reconciliação com o planejado do dia,
      TSB do dia atualizado e idempotência do re-import. Registrar aqui: formato real do
      activity id e comportamento do GET com key sem acesso (premissa do proposal).
- [ ] 6.2 Atualizar proposal (Open Questions resolvidas) e este tasks.md com o resultado.

## QA / entrega

- [ ] 7.1 `/qa` (code-reviewer + security-reviewer; trilha Full).
- [ ] 7.2 `/pr intervals-icu-activity-ingestion` → merge via CI → `/done`.
