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
      contra payload real (revisitar no Bloco 7.1 antes de fechar a change).
- [ ] 2.3 Implementar o mapper (componente puro, sem IO) até os testes passarem;
      `metadadosSincronizacao` com `{icuTrainingLoad, calories, totalElevationGain, deviceName}`.
- [ ] 2.4 Validação: `./mvnw clean test`.

## Bloco 3 — Gate de pareamento + Extração de `CandidateSelector`/`ReconciliationDecisionExecutor` (D4)

- [ ] 3.0 **Gate de pareamento push→activity (D4.0) — PRÉ-REQUISITO, bloqueia 3.1-3.4:** founder
      habilita o fluxo de atividades no intervals.icu (se ainda não habilitado) e registra uma
      corrida real executando um evento previamente empurrado pela change-mãe
      `intervals-icu-workout-push`. Probe manual do payload de `GET /api/v1/activity/{id}`
      procurando referência ao evento/workout pareado (`external_id = menthoros-<treinoPlanejadoId>`).
      Registrar o resultado aqui:
      - [ ] Referência encontrada? (S/N) — campo: `_____________`
      - [ ] Se SIM: match direto vira PRIMÁRIO (lookup por PK do `treinoPlanejadoId` resolvido do
            campo encontrado); heurística D-1..D+1 (3.1-3.4 abaixo) vira FALLBACK — ajustar o passo
            9 do `IntervalsIcuActivityIngestionService` (Bloco 4) para tentar o match primário
            antes de acionar o `CandidateSelector`.
      - [ ] Se NÃO: heurística D-1..D+1 permanece único mecanismo, sem alteração ao design original
            — seguir 3.1-3.4 normalmente.
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
- [ ] 3.3 **Guarda absoluta de campos nulos (correção, não débito — decisão do founder):** dentro
      do `ReconciliationDecisionExecutor`, implementar o veto: se
      `realizado.getDuracaoMin() == null` OU `realizado.getDistanciaKm() == null`, o resultado é
      forçado a `AMBIGUO` independentemente do score calculado — NUNCA `VINCULADO_AUTOMATICO`
      nesse caso. `MatchingScoreCalculatorImpl` não é alterado (fica isolado no executor, que é
      novo nesta change). TDD: teste primeiro cobrindo activity sem duração, sem distância, e sem
      as duas — todos devem resultar em `AMBIGUO` mesmo com temporalScore=1.0 e demais scores
      artificialmente altos.
- [ ] 3.4 Testes unitários do executor cobrindo os quatro desfechos (VINCULADO_AUTOMATICO,
      AMBIGUO por faixa, AMBIGUO por tie-break, NAO_PLANEJADO) + auditoria gravada + `save()` do
      planejado vinculado + sem candidatos na janela + a guarda de campos nulos do 3.3.
- [ ] 3.5 Validação: `./mvnw clean test` (suítes do scheduler intactas, teste de caracterização
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
      evento/TSB/reconciliação), reconciliação inline chamada com o treino inserido (CA3, e o
      match primário do gate 3.0 quando aplicável), evento publicado somente após reconciliação
      computada. Cobrir também 422/429/5xx conforme a matriz de erros completa (design.md D3.1).
- [ ] 4.2 Guard de segurança (D5.1): antes de prosseguir, verificar que não existe outra conexão
      ativa do mesmo tenant com a mesma `externalAthleteId`; se existir, 409 sem chamada externa.
      Teste dedicado cobrindo esse cenário.
- [ ] 4.3 Validação de `activityId` (D5): normalizar/rejeitar valores com `/`, `?`, `%` (URL colada
      em vez de id simples) antes de repassar ao client. `activityId` chega como query param (não
      path variable) — ver Bloco 5.
- [ ] 4.4 **Aviso não-bloqueante de Strava ativo (D5.2, CA11):** calcular `avisoSyncStravaAtivo`
      lendo `IntegracaoExternaRepository.findByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA,
      tenantId)` — `true` quando a integração existe, está `ativo=true` E `autoSyncPausado != true`;
      caso contrário `null`/omitido. Leitura simples, sem side effect, incluída no
      `TreinoRealizadoOutputDto` retornado. Teste cobrindo os três casos (sem Strava, Strava ativo
      sem pausa, Strava pausado).
- [ ] 4.5 Implementar interface + impl com JavaDoc de idempotência/side effects/tenant-aware;
      HTTP fora da TX, persistência+reconciliação em colaborador transacional, reload da conexão
      dentro da TX antes do insert.
- [ ] 4.6 Validação: `./mvnw clean test`.

## Bloco 5 — Endpoint (D5)

- [ ] 5.1 Verificar handler de `IntervalsIcuApiException` no `GlobalExceptionHandler`; adicionar
      se ausente (mesmo commit do controller), distinguindo o novo caso de auth inválida.
- [ ] 5.2 Adicionar campo `Boolean avisoSyncStravaAtivo` (nullable) a `TreinoRealizadoOutputDto`
      (`@JsonInclude(NON_NULL)` já presente na classe — fica omitido nos demais endpoints que
      retornam esse DTO). Ajustar o mapper/construtor apenas no ponto de retorno do
      `IntervalsIcuActivityIngestionService` (Bloco 4.4); demais chamadores continuam passando
      `null`/omitindo o campo.
- [ ] 5.3 `IntervalsIcuActivityController` — `POST
      /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}` (query param,
      não path variable — D5), `@PreAuthorize` TECNICO/ADMIN,
      `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (tag ASCII kebab-case,
      200/403/404/409/422). Teste de autorização no padrão dos `*ControllerAuthTest` da change
      `complete-authorization-controllers` (roles aceitas, ATLETA negado, anônimo negado). Teste
      dedicado de normalização de `activityId` (URL completa colada → extrai segmento final; `/`,
      `?`, `%` soltos → 400).
- [ ] 5.4 Validação: `./mvnw clean test`.

## Bloco 6 — Flag de pausa de sincronização Strava por atleta (D5.2 — substitui matching cross-fonte)

- [ ] 6.1 Migration `V54__add_auto_sync_pausado_integracao_externa.sql`: `ALTER TABLE
      tb_integracao_externa ADD COLUMN auto_sync_pausado BOOLEAN NOT NULL DEFAULT false;` (padrão
      de nomeação/estrutura de migration do CLAUDE.md do backend). Sem down-migration (aditiva).
- [ ] 6.2 Campo `autoSyncPausado` em `IntegracaoExterna` (`@Column(name = "auto_sync_pausado",
      nullable = false)`, `boolean`, default `false`). Teste de mapeamento básico se o padrão do
      repo usar `@DataJpaTest` para entidades novas/alteradas (ver Test Layers).
- [ ] 6.3 Testes primeiro do guard do scheduler: adicionar `and (ie.autoSyncPausado = false or
      ie.autoSyncPausado is null)` à JPQL de `AtletaRepository.findAllWithStravaConnected()`
      (`AtletaRepository.java:112-121`) — teste garantindo que um atleta com `autoSyncPausado=true`
      não aparece no resultado, e que um atleta ativo/não pausado continua aparecendo (CA10).
- [ ] 6.4 DTO `StravaSyncPauseStatusDto(boolean autoSyncPausado, Instant atualizadoEm)` em
      `dto/output/`.
- [ ] 6.5 Testes primeiro do serviço (reaproveitar `StravaOAuthServiceImpl` ou criar método
      dedicado — decisão de implementação): `pausarSync(atletaId, tenantId)` e
      `retomarSync(atletaId, tenantId)`, ambos: buscam a `IntegracaoExterna` STRAVA via
      `findByAtletaIdAndPlataformaAndTenantId` (tenant-scoped); ausente → `DomainNotFoundException`
      (404); presente → seta `autoSyncPausado` e salva; idempotente (chamar duas vezes com o mesmo
      valor é no-op seguro, sem erro). Implementar até os testes passarem.
- [ ] 6.6 Endpoints em `StravaAuthController`: `PATCH /api/v1/strava/pausar-sync/{atletaId}` e
      `PATCH /api/v1/strava/retomar-sync/{atletaId}`, `@PreAuthorize` TECNICO/ADMIN,
      `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (200/403/404). Teste de
      autorização no padrão `*ControllerAuthTest` (roles aceitas, ATLETA negado, anônimo negado).
- [ ] 6.7 Validação: `./mvnw clean test`.

## Bloco 7 — Gate de validação real (D6)

- [ ] 7.1 Smoke com atleta real conectado — checklist obrigatório:
      (a) formato real do activity id e campos realmente presentes no payload (`athlete_id`,
      `average_speed` vs `moving_time`/`distance`, unidade de `average_cadence`, formato de
      `start_date_local`) — ajustar D2/2.2/2.4 se divergir da suposição; roda junto com o probe do
      gate 3.0 (mesma activity real);
      (b) import de corrida verdadeira: métricas corretas, reconciliação com o planejado do dia,
      TSB atualizado, idempotência do re-import;
      (c) cross-tenant/cross-atleta: tentativa de acesso com key de outro atleta retorna
      403/404 do provedor e/ou é bloqueada pelo guard 4.2;
      (d) virada de dia: activity próxima da meia-noite local não muda de dia;
      (e) paridade: scheduler no próximo ciclo de 2h continua reconciliando outros pendentes
      igual ao comportamento pré-refactor;
      (f) guarda de pausa Strava (D5.2, CA10/CA11): pausar o atleta founder, confirmar que some de
      `findAllWithStravaConnected` e que o import de intervals.icu NÃO traz
      `avisoSyncStravaAtivo`; retomar e confirmar o inverso.
- [ ] 7.2 Atualizar proposal.md (Open Questions resolvidas, inclusive o resultado do gate 3.0) e
      este tasks.md com o resultado de cada item do checklist 7.1.

## QA / entrega

- [ ] 8.1 `/qa` (code-reviewer + security-reviewer; trilha Full).
- [ ] 8.2 `/pr intervals-icu-activity-ingestion` → merge via CI → `/done`.
