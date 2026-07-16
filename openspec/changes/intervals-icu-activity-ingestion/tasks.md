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

- [ ] 2.1 Testes do `IntervalsIcuActivityMapper` primeiro: pace derivado de
      `moving_time`/`distance` (prioridade) com fallback para `average_speed` só quando os
      primeiros faltarem; m → km, seg → min; campos nulos tolerados; RPE presente e ausente;
      null input → `IllegalArgumentException`; filtro de modalidade
      (Run/TrailRun/VirtualRun/Treadmill aceitos; Ride rejeitado); teste de virada de dia para
      `start_date_local` (activity 23:30-00:30 não muda de dia por fuso do servidor — parsing
      igual ao `StravaActivityServiceImpl`).
- [ ] 2.2 Cadência: NÃO reaproveitar a fórmula do FIT/Strava por analogia. Escrever
      `sanitizeCadenciaIntervalsIcu` isolada e marcar explicitamente como pendente de confirmação
      contra payload real (revisitar no Bloco 6.1 antes de fechar a change).
- [ ] 2.3 Implementar o mapper (componente puro, sem IO) até os testes passarem;
      `metadadosSincronizacao` com `{icuTrainingLoad, calories, totalElevationGain, deviceName}`.
- [ ] 2.4 Validação: `./mvnw clean test`.

## Bloco 3 — Extração de `CandidateSelector` + `ReconciliationDecisionExecutor` (D4, refactor sem mudança de comportamento)

- [ ] 3.1 **Teste de caracterização PRIMEIRO** (antes de tocar no scheduler): fixar o
      comportamento atual de `DailyActivitySyncSchedulerImpl` — em especial que a seleção de
      pendentes filtra por `statusSincronizacao=PENDENTE` (não por `reconciliationStatus`, apesar
      do nome do método `findByAtletaIdAndDataTreinoAndReconciliationStatus`) e a janela D-1..D+1
      exata usada hoje.
- [ ] 3.2 Extrair `CandidateSelector` (busca `TreinoPlanejado` na janela D-1..D+1, mesmo filtro de
      compatibilidade do scheduler) e `ReconciliationDecisionExecutor` (decisão via
      `MatchingDecisionEngine` + persistência de status/score/reason/auditoria, com `save()`
      explícito do `TreinoPlanejado` vinculado — não depender de entidade gerenciada implícita).
      Renomear o método do repositório para refletir o filtro real (`statusSincronizacao`), sem
      mudar a query. Scheduler passa a delegar para os dois colaboradores; nenhuma asserção de
      teste existente afrouxada.
- [ ] 3.3 Testes unitários do executor cobrindo os quatro desfechos (VINCULADO_AUTOMATICO,
      AMBIGUO por faixa, AMBIGUO por tie-break, NAO_PLANEJADO) + auditoria gravada + `save()` do
      planejado vinculado + sem candidatos na janela + caso de campos nulos (distância/duração
      ausentes) não resultando em `VINCULADO_AUTOMATICO` só pela data (guarda do D4; se o
      comportamento herdado do `MatchingScoreCalculator` permitir isso, documentar como débito
      conhecido em vez de alterar o calculator nesta change).
- [ ] 3.4 Validação: `./mvnw clean test` (suítes do scheduler intactas, teste de caracterização
      do 3.1 ainda passa).

## Bloco 4 — Serviço de ingestão (D3)

- [ ] 4.1 Testes do `IntervalsIcuActivityIngestionServiceImpl` primeiro (Mockito, `@Nested` por
      método, tenant via `TenantContext` em `@BeforeEach/@AfterEach`): happy path (CA1, CA8),
      idempotência sem chamada externa quando já existe (CA2), sem conexão → 409 (CA4),
      `Atleta` resolvido via `findByIdAndTenantId` explícito (não o UUID cru do path), NOT_FOUND
      do client → `DomainNotFoundException` (CA5), erro de auth (401/403) do client → exceção
      distinta indicando reconexão (não confundir com NOT_FOUND), athlete_id divergente → 404,
      modalidade inválida → 422 (CA6), conexão desativada entre a leitura inicial e o insert
      (TOCTOU) → 409 sem persistir, corrida de dedup (`SaveResult` não-inserted → sem
      evento/TSB/reconciliação), reconciliação inline chamada com o treino inserido (CA3), evento
      publicado somente após reconciliação computada.
- [ ] 4.2 Guard de segurança (D5.1): antes de prosseguir, verificar que não existe outra conexão
      ativa do mesmo tenant com a mesma `externalAthleteId`; se existir, 409 sem chamada externa.
      Teste dedicado cobrindo esse cenário.
- [ ] 4.3 Validação de `activityId` (D5): normalizar/rejeitar valores com `/`, `?`, `%` (URL colada
      em vez de id simples) antes de repassar ao client.
- [ ] 4.4 Implementar interface + impl com JavaDoc de idempotência/side effects/tenant-aware;
      HTTP fora da TX, persistência+reconciliação em colaborador transacional, reload da conexão
      dentro da TX antes do insert.
- [ ] 4.5 Validação: `./mvnw clean test`.

## Bloco 5 — Endpoint (D5)

- [ ] 5.1 Verificar handler de `IntervalsIcuApiException` no `GlobalExceptionHandler`; adicionar
      se ausente (mesmo commit do controller), distinguindo o novo caso de auth inválida.
- [ ] 5.2 `IntervalsIcuActivityController` — `POST
      /api/v1/intervals-icu/atletas/{atletaId}/activities/{activityId}/import`, `@PreAuthorize`
      TECNICO/ADMIN, `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (tag ASCII
      kebab-case, 200/403/404/409/422). Teste de autorização no padrão dos
      `*ControllerAuthTest` da change `complete-authorization-controllers` (roles aceitas,
      ATLETA negado, anônimo negado).
- [ ] 5.3 Validação: `./mvnw clean test`.

## Bloco 6 — Gate de validação real (D6)

- [ ] 6.1 Smoke com atleta real conectado — checklist obrigatório:
      (a) formato real do activity id e campos realmente presentes no payload (`athlete_id`,
      `average_speed` vs `moving_time`/`distance`, unidade de `average_cadence`, formato de
      `start_date_local`) — ajustar D2/2.2/2.4 se divergir da suposição;
      (b) import de corrida verdadeira: métricas corretas, reconciliação com o planejado do dia,
      TSB atualizado, idempotência do re-import;
      (c) cross-tenant/cross-atleta: tentativa de acesso com key de outro atleta retorna
      403/404 do provedor e/ou é bloqueada pelo guard 4.2;
      (d) virada de dia: activity próxima da meia-noite local não muda de dia;
      (e) paridade: scheduler no próximo ciclo de 2h continua reconciliando outros pendentes
      igual ao comportamento pré-refactor.
- [ ] 6.2 Atualizar proposal.md (Open Questions resolvidas) e este tasks.md com o resultado de
      cada item do checklist 6.1.

## QA / entrega

- [ ] 7.1 `/qa` (code-reviewer + security-reviewer; trilha Full).
- [ ] 7.2 `/pr intervals-icu-activity-ingestion` → merge via CI → `/done`.
