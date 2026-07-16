# Tasks: intervals-icu-activity-ingestion

Backend `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test` verde.
TDD: teste antes da implementação em cada bloco. Cada task tem uma linha `Verify:` — o teste/comando
que confirma que a task específica funcionou, além da validação de bloco.

Branch: `feature/intervals-icu-activity-ingestion`, base `develop` @ `860b32e` (merge de
`intervals-icu-push-hardening`). Sequência dos blocos: 1→2 são independentes entre si; 3 depende só
do código já existente (scheduler); 4 depende de 1+2 (client+mapper) e do gate 3.0; 5 depende de 4
(endpoint expõe o serviço); 6 é paralelizável com 1-5 até a task 4.4/6.8 (que depende do campo
`autoSyncPausado` existir — bloco 6.1/6.2 primeiro); 7 depende de tudo; 8 depende de 7.

## Bloco 1 — Client: `buscarAtividade` + `IcuActivityDto` (D1)

- [ ] 1.1 Criar `IcuActivityDto` (record, `@JsonIgnoreProperties(ignoreUnknown = true)`) com os
      campos do D1; teste de desserialização com fixture JSON representativa (campos presentes,
      ausentes e extras).
      Verify: `IcuActivityDtoTest` (ou teste de desserialização no pacote `dto/intervalsicu`) verde
      cobrindo os três casos (todos campos, campos ausentes → null, campos extras ignorados).
- [ ] 1.2 Adicionar `buscarAtividade(String apiKey, String activityId)` à interface
      `IntervalsIcuClient` e implementar em `IntervalsIcuClientImpl` (GET `/api/v1/activity/{id}`,
      Basic Auth por chamada, `traduz` para erros; key/body nunca logados). Testes no padrão dos
      métodos existentes do client (sucesso, 404, 403, falha de transporte). De passagem (achado
      do DoR): corrigir o javadoc desatualizado de `IntervalsIcuClient.java:22` — cita
      `IntervalsIcuApiException(NOT_FOUND)`, símbolo que não existe (o construtor real é
      `(HttpStatusCode, String)`, sem enum de causa).
      Verify: `IntervalsIcuClientImplTest` cobre `buscarAtividade` (sucesso, 404, 403, falha de
      transporte) usando o mesmo mock/WireMock dos métodos existentes; `grep -n "NOT_FOUND"
      IntervalsIcuClient.java` não retorna mais nada.
- [ ] 1.3 Validação: `./mvnw clean test`.

## Bloco 2 — Mapper `IcuActivityDto` → `TreinoRealizado` (D2)

- [ ] 2.1 Testes do `IntervalsIcuActivityMapper` primeiro: pace derivado de
      `moving_time`/`distance` (prioridade) com fallback para `average_speed` só quando os
      primeiros faltarem; m → km, seg → min; campos nulos tolerados; RPE presente e ausente;
      null input → `IllegalArgumentException`; filtro de modalidade
      (Run/TrailRun/VirtualRun/Treadmill aceitos; Ride rejeitado); teste de virada de dia para
      `start_date_local` (activity 23:30-00:30 não muda de dia por fuso do servidor — parsing
      igual ao `StravaActivityServiceImpl`).
      Verify: `IntervalsIcuActivityMapperTest` (`@Nested` por cenário) verde cobrindo pace/fallback,
      conversão de unidades, null input, filtro de modalidade (aceito × rejeitado) e virada de dia.
- [ ] 2.2 Cadência: NÃO reaproveitar a fórmula do FIT/Strava por analogia. Escrever
      `sanitizeCadenciaIntervalsIcu` isolada e marcar explicitamente como pendente de confirmação
      contra payload real (revisitar no Bloco 7.1 antes de fechar a change).
      Verify: método isolado existe e testado com valores sintéticos; comentário/TODO explícito
      apontando para o item de smoke do Bloco 7.1 que confirma a unidade real.
- [ ] 2.3 Implementar o mapper (componente puro, sem IO) até os testes passarem;
      `metadadosSincronizacao` com `{icuTrainingLoad, calories, totalElevationGain, deviceName}`.
      Verify: todos os testes do 2.1 verdes; `metadadosSincronizacao` serializa como JSON válido
      com as quatro chaves.
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
      Verify: campo S/N preenchido acima com evidência (payload colado ou nome do campo
      encontrado); decisão refletida em D3 passo 9 (design.md) se o resultado for SIM.
- [ ] 3.1 **Teste de caracterização PRIMEIRO** (antes de tocar no scheduler): fixar o
      comportamento atual de `DailyActivitySyncSchedulerImpl` — em especial que a seleção de
      pendentes filtra por `statusSincronizacao=PENDENTE` (não por `reconciliationStatus`, apesar
      do nome do método `findByAtletaIdAndDataTreinoAndReconciliationStatus`) e a janela D-1..D+1
      exata usada hoje.
      Verify: teste de caracterização novo passa contra o comportamento ATUAL do scheduler, ANTES
      de qualquer alteração de código nesta task.
- [ ] 3.2 Extrair `CandidateSelector` (busca `TreinoPlanejado` na janela D-1..D+1, mesmo filtro de
      compatibilidade do scheduler) e `ReconciliationDecisionExecutor` (decisão via
      `MatchingDecisionEngine` + persistência de status/score/reason/auditoria, com `save()`
      explícito do `TreinoPlanejado` vinculado — não depender de entidade gerenciada implícita).
      Renomear o método do repositório para refletir o filtro real (`statusSincronizacao`), sem
      mudar a query. Scheduler passa a delegar para os dois colaboradores; nenhuma asserção de
      teste existente afrouxada.
      Verify: suíte existente de `DailyActivitySyncSchedulerImplTest` continua 100% verde sem
      nenhuma asserção relaxada; o teste de caracterização do 3.1 ainda passa sem alteração.
- [ ] 3.3 **Guarda absoluta de campos nulos — AMBOS os lados (correção, não débito — decisão do
      founder; achado do 2º pre-mortem estende a guarda ao lado `planejado`):** dentro do
      `ReconciliationDecisionExecutor`, implementar o veto: se `realizado.getDuracaoMin() == null`
      OU `realizado.getDistanciaKm() == null` OU `planejado.getDuracaoMin() == null` OU
      `planejado.getDistanciaKm() == null`, o resultado é forçado a `AMBIGUO` independentemente do
      score calculado — NUNCA `VINCULADO_AUTOMATICO` nesse caso. `MatchingScoreCalculatorImpl` não
      é alterado (fica isolado no executor, que é novo nesta change). TDD: teste PARAMETRIZADO
      cobrindo os dois lados — (1) `realizado` sem duração, sem distância, e sem as duas; (2)
      `planejado` sem duração, sem distância, e sem as duas — todos os casos devem resultar em
      `AMBIGUO` mesmo com temporalScore=1.0 e demais scores artificialmente altos.
      Verify: teste parametrizado com os 6 casos (3 `realizado` + 3 `planejado`) força `AMBIGUO`
      em todos, mesmo com score artificialmente alto nas outras dimensões.
- [ ] 3.4 Testes unitários do executor cobrindo os quatro desfechos (VINCULADO_AUTOMATICO,
      AMBIGUO por faixa, AMBIGUO por tie-break, NAO_PLANEJADO) + auditoria gravada + `save()` do
      planejado vinculado + sem candidatos na janela + a guarda de campos nulos do 3.3.
      Verify: `ReconciliationDecisionExecutorTest` cobre os 4 desfechos + `save()` explícito do
      planejado vinculado verificado via `verify(...)` + auditoria `TreinoReconciliacao` gravada.
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
      computada. Cobrir também 422/429/5xx conforme a matriz de erros completa (design.md D3.1) —
      **429 é reservado exclusivamente para rate-limit do intervals.icu** (teste dedicado, nunca
      mapeado para 409); os DOIS cenários de origem do 409 dentro deste bloco (credencial
      intervals.icu revogada — 401/403, passo 3; conexão intervals.icu ausente — passo 2, CA4) são
      verificações SEPARADAS, com exceções de domínio e mensagens distintas — não reaproveitar o
      mesmo teste para os dois. O terceiro cenário de 409 (precondição de pausa Strava, passo 1) é
      coberto na task 4.4/6.8, por ser um passo anterior a quase todos os demais do fluxo — roda
      logo após a guarda de idempotência (passo 0, coberta acima em "idempotência sem chamada
      externa quando já existe (CA2)"), que tem prioridade sobre ele (ordem corrigida na 3ª rodada
      de pre-mortem: re-import de activity já existente retorna 200 sem checar a flag Strava — ver
      design.md D3/D3.1).
      Verify: `IntervalsIcuActivityIngestionServiceImplTest` verde cobrindo todos os cenários
      listados; matriz de erros do D3.1 (401/403/404/422/429/5xx) com um teste dedicado por linha.
- [ ] 4.2 Guard de segurança (D5.1): antes de prosseguir, verificar que não existe outra conexão
      ativa do mesmo tenant com a mesma `externalAthleteId`; se existir, 409 sem chamada externa.
      Teste dedicado cobrindo esse cenário.
      Verify: teste dedicado confirma 409 e `verifyNoInteractions` no client intervals.icu quando
      há `externalAthleteId` duplicado no tenant.
- [ ] 4.3 Validação de `activityId` (D5): normalizar/rejeitar valores com `/`, `?`, `%` (URL colada
      em vez de id simples) antes de repassar ao client. `activityId` chega como query param (não
      path variable) — ver Bloco 5.
      Verify: teste dedicado cobre URL completa colada → extrai segmento final; valores soltos com
      `/`, `?`, `%` que não sejam URL reconhecível → rejeitados antes de chamar o client.
- [ ] 4.4 **Precondição bloqueante de Strava ativo (D5.2 — agora safety net residual: com a pausa
      passando a ser automática nos dois pontos de conexão — tasks 6.10/6.11 — este passo deixa de
      proteger contra "o coach esqueceu de pausar" e passa a proteger o cenário residual de
      `retomar-sync` deliberado com intervals.icu ainda ativo; lógica técnica inalterada, correção
      do 2º pre-mortem, ordem ajustada na 3ª rodada de pre-mortem):** passo 1 do serviço
      (design.md D3), executado logo após a guarda de idempotência (passo 0 — ver task 4.1, cenário
      "idempotência sem chamada externa quando já existe") e ANTES de qualquer outro passo
      subsequente do fluxo (inclusive antes de `conexaoAtiva`, passo 2): ler
      `IntegracaoExternaRepository.findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA,
      tenantId)`; se existir integração ativa com `autoSyncPausado=false`, lançar exceção de
      domínio dedicada (409, mensagem curada "pause a sincronização Strava deste atleta antes de
      importar do intervals.icu") — sem qualquer chamada externa, sem leitura da conexão
      intervals.icu, sem persistência. Este passo só é alcançado quando a activity ainda NÃO existe
      (dedup do passo 0 não encontrou); se já existe, o fluxo retorna 200 direto no passo 0 sem
      chegar aqui (CA2 tem prioridade — re-import não deve ser bloqueado por precondição). Sem
      Strava conectado, ou já pausado, o passo 1 é no-op e o fluxo segue normal a partir do passo 2.
      TDD: teste cobrindo os quatro casos (activity já importada + Strava ativo sem pausa → 200,
      sem checar a flag — ordem explícita do achado MÉDIO da 3ª rodada de pre-mortem; sem Strava →
      prossegue; Strava ativo sem pausa → 409 e nenhuma interação com repositório/client de
      intervals.icu; Strava pausado → prossegue).
      Verify: os quatro cenários passam, incluindo a ordem CA2-antes-de-CA11 (re-import não
      dispara a precondição mesmo com Strava ativo e não pausado). Depende do campo
      `autoSyncPausado` existir (Bloco 6.1/6.2) — se ainda não implementado, usar um mock/stub do
      repositório retornando o valor esperado.
- [ ] 4.5 Implementar interface + impl com JavaDoc de idempotência/side effects/tenant-aware;
      HTTP fora da TX, persistência+reconciliação em colaborador transacional, reload da conexão
      dentro da TX antes do insert.
      Verify: todos os testes de 4.1-4.4 verdes contra a implementação real (não mais mocks do
      próprio serviço); JavaDoc com as três linhas obrigatórias (Idempotent/Side Effects/Tenant-aware)
      presente no método público.
- [ ] 4.6 Validação: `./mvnw clean test`.

## Bloco 5 — Endpoint (D5)

- [ ] 5.1 Verificar handler de `IntervalsIcuApiException` no `GlobalExceptionHandler`; adicionar
      se ausente (mesmo commit do controller), distinguindo o novo caso de auth inválida.
      Verify: teste do `GlobalExceptionHandler` (ou teste de integração do controller) confirma que
      `IntervalsIcuApiException` com status 401/403 mapeia para o 409 curado, distinto de 404.
- [ ] 5.2 `IntervalsIcuActivityController` — `POST
      /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}` (query param,
      não path variable — D5), `@PreAuthorize` TECNICO/ADMIN,
      `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (tag ASCII kebab-case,
      200/403/404/409/422/429 — 429 é o rate-limit do intervals.icu, já especificado em D3.1).
      Teste de autorização no padrão dos `*ControllerAuthTest` da change
      `complete-authorization-controllers` (roles aceitas, ATLETA negado, anônimo negado). Teste
      dedicado de normalização de `activityId` (URL completa colada → extrai segmento final; `/`,
      `?`, `%` soltos → 400).
      Verify: `IntervalsIcuActivityControllerAuthTest` cobre TECNICO/ADMIN aceitos, ATLETA e
      anônimo negados; Swagger gera os 6 status codes; `@Tag` name é ASCII kebab-case.
- [ ] 5.3 Validação: `./mvnw clean test`.

## Bloco 6 — Flag de pausa de sincronização Strava por atleta (D5.2 — substitui matching cross-fonte)

- [ ] 6.1 **Antes de criar o arquivo, confira `ls src/main/resources/db/migration/ | sort -V | tail -3`
      — V54 é o próximo número livre no momento do DoR (2026-07-16), mas a change ativa
      `deterministic-planner-engine` TAMBÉM reivindica V54
      (`V54__Add_planner_metadata_to_plano_semanal.sql`, proposal.md:46). Regra: quem mergear
      primeiro trava V54; a outra renumera para V55 antes do PR — combine com o founder qual
      change tranca o número primeiro, ou confira novamente o disco no início da implementação.**
      Migration `V54__add_auto_sync_pausado_integracao_externa.sql` (ou `V55` se
      `deterministic-planner-engine` já tiver mergeado): `ALTER TABLE tb_integracao_externa ADD
      COLUMN auto_sync_pausado BOOLEAN NOT NULL DEFAULT false;` (padrão de nomeação/estrutura de
      migration do CLAUDE.md do backend). Sem down-migration (aditiva).
      Verify: `ls src/main/resources/db/migration/ | sort -V | tail -3` reconferido no início desta
      task (não só no DoR); `./mvnw clean test` sobe o schema via Flyway sem erro no contexto de
      teste (Testcontainers/H2 conforme o padrão do repo).
- [ ] 6.2 Campo `autoSyncPausado` em `IntegracaoExterna` (`@Column(name = "auto_sync_pausado",
      nullable = false)`, `boolean`, default `false`). Teste de mapeamento básico se o padrão do
      repo usar `@DataJpaTest` para entidades novas/alteradas (ver Test Layers).
      Verify: entidade persiste e recarrega com `autoSyncPausado=false` por default em uma linha
      nova; `@DataJpaTest` (se aplicável) confirma o mapeamento da coluna.
- [ ] 6.3 Testes primeiro do guard do scheduler: adicionar `and (ie.autoSyncPausado = false or
      ie.autoSyncPausado is null)` à JPQL de `AtletaRepository.findAllWithStravaConnected()`
      (`AtletaRepository.java:112-121`) — teste garantindo que um atleta com `autoSyncPausado=true`
      não aparece no resultado, e que um atleta ativo/não pausado continua aparecendo (CA10).
      Verify: teste `@DataJpaTest` (ou equivalente) sobe dois atletas (um pausado, um não) e
      confirma que só o não-pausado aparece em `findAllWithStravaConnected()`.
- [ ] 6.4 DTO `StravaSyncPauseStatusDto(boolean autoSyncPausado, Instant atualizadoEm)` em
      `dto/output/`.
      Verify: record compila com `@Schema`/`@JsonInclude(NON_NULL)` conforme o padrão de DTOs; usado
      pelos endpoints da task 6.6.
- [ ] 6.5 Testes primeiro do serviço (reaproveitar `StravaOAuthServiceImpl` ou criar método
      dedicado — decisão de implementação): `pausarSync(atletaId, tenantId)` e
      `retomarSync(atletaId, tenantId)`, ambos: buscam a `IntegracaoExterna` STRAVA via
      `findByAtletaIdAndPlataformaAndTenantId` (tenant-scoped); ausente → `DomainNotFoundException`
      (404); presente → seta `autoSyncPausado` e salva; idempotente (chamar duas vezes com o mesmo
      valor é no-op seguro, sem erro). Implementar até os testes passarem.
      Verify: teste cobre presente/ausente e idempotência (duas chamadas seguidas com o mesmo valor
      não lançam erro nem duplicam side effect observável).
- [ ] 6.6 Endpoints em `StravaAuthController`: `PATCH /api/v1/strava/pausar-sync/{atletaId}` e
      `PATCH /api/v1/strava/retomar-sync/{atletaId}`, `@PreAuthorize` TECNICO/ADMIN,
      `@RequireTenant(resourceParamIndex = 0)`, Swagger completo (200/403/404). Teste de
      autorização no padrão `*ControllerAuthTest` (roles aceitas, ATLETA negado, anônimo negado).
      Verify: `StravaAuthControllerAuthTest` cobre os dois novos endpoints com as mesmas roles do
      padrão existente do controller.
- [ ] 6.7 **Late-check no scheduler antes de cada persistência (design.md D5.2 — TOCTOU, achado do
      2º pre-mortem):** imediatamente antes de persistir a atividade Strava de CADA atleta no
      `DailyActivitySyncSchedulerImpl`, revalidar `autoSyncPausado` com uma query fresca (não
      reusar o valor lido em `findAllWithStravaConnected` na listagem inicial); se pausado nesse
      ponto, pular aquele atleta naquele ciclo (log + métrica, sem lançar erro). TDD: teste
      dedicado com mock simulando o atleta pausado ENTRE a listagem e o insert (ex.: listagem
      retorna o atleta elegível, mas a query de revalidação — chamada logo antes do insert —
      já reflete `autoSyncPausado=true`) → atleta pulado, nenhuma atividade persistida para ele
      naquele ciclo, sem exceção lançada.
      Verify: teste dedicado confirma que o atleta pausado ENTRE a listagem e o insert é pulado no
      MESMO ciclo, sem exceção, com log/métrica emitidos.
- [ ] 6.8 **Teste do 409 de precondição no import (design.md D3 passo 1, D5.2 — safety net
      residual agora que a pausa é automática nos dois pontos de conexão, ver 6.10/6.11):**
      cenário
      bloqueado — atleta com Strava ativo e `autoSyncPausado=false`, import de intervals.icu
      retorna 409 com a mensagem curada, nada persistido (nenhum `TreinoRealizado`, nenhuma
      chamada ao client intervals.icu). Cenário liberado — atleta sem conexão Strava, OU com
      `autoSyncPausado=true`, import prossegue normalmente (200). Cenário de re-import — activity
      já importada anteriormente + Strava ativo sem pausa (que bloquearia um import novo): a
      resposta é 200 com o treino existente, SEM 409 (dedup do passo 0 tem prioridade sobre a
      precondição do passo 1 — achado MÉDIO da 3ª rodada de pre-mortem, CA2). Complementa o TDD da
      task 4.4; aqui o foco é a integração ponta a ponta via controller/service reais (não só mock).
      Verify: teste de integração (controller+service reais, client mockado) cobre os três
      cenários (bloqueado/liberado/re-import) ponta a ponta.
- [ ] 6.9 **Guard no webhook Strava (CRÍTICO, achado da 3ª rodada de pre-mortem — a flag precisa
      cobrir os DOIS caminhos automáticos do Strava, não só o scheduler):** o webhook do Strava
      (`StravaWebhookServiceImpl.handleEventAsync` → `processCreateEvent`/`processUpdateEvent` →
      `requireIntegration(ownerId)`, `StravaWebhookServiceImpl.java:69-95`) não passa pelo
      scheduler nem por `findAllWithStravaConnected` — sem guard próprio, um atleta pausado ainda
      teria atividades inseridas em tempo real via webhook, reabrindo a colisão cross-fonte que a
      flag deveria eliminar. Adicionar o guard em `requireIntegration` (ou logo após sua chamada em
      `processCreateEvent`/`processUpdateEvent`): se `integracao.isAutoSyncPausado()` for `true`,
      pular o processamento SILENCIOSAMENTE — sem lançar exceção (o endpoint HTTP do webhook precisa
      responder 200 ao Strava independentemente, por contrato do webhook; lançar faria o Strava
      reenviar o evento indefinidamente). `processDeleteEvent`
      (`StravaWebhookServiceImpl.java:82-87`) NÃO precisa do guard — deletar um treino que talvez
      nem exista pela pausa é inofensivo/idempotente. TDD: teste de `StravaWebhookServiceImpl` com
      `autoSyncPausado=true` → `processCreateEvent`/`processUpdateEvent` NÃO chamam
      `syncSingleActivityById`, nenhuma exceção é lançada (webhook endpoint continua respondendo
      200 ao Strava, contrato preservado); com `autoSyncPausado=false` ou sem integração pausada,
      comportamento atual é preservado (chama `syncSingleActivityById` normalmente).
      Verify: `StravaWebhookServiceImplTest` cobre create/update com pausado (sem chamada, sem
      exceção) e não-pausado (comportamento atual preservado); `processDeleteEvent` sem alteração
      de comportamento.
- [ ] 6.10 **Hook automático em `IntervalsIcuConnectionServiceImpl.conectar` (D5.2 — pausa
      automática, decisão final do founder que substitui o modelo manual-primário):** TDD primeiro
      — cenário "atleta com Strava ativo conecta intervals.icu → integração Strava marcada
      `autoSyncPausado=true`, `save()` verificado (mock/spy do repositório)"; cenário "atleta sem
      Strava conectado conecta intervals.icu → no-op, sem erro, nenhuma chamada de save adicional
      para a integração Strava (que não existe)". Implementar: logo após `integracao =
      integracaoRepository.save(integracao);` (linha 88 do método `conectar`), buscar a integração
      STRAVA ativa via
      `integracaoRepository.findActiveByAtletaIdAndPlataformaAndTenantId(atletaId,
      FonteDados.STRAVA, tenantId)`; se presente e `autoSyncPausado != true`, setar `true` e
      salvar. **Cenário adicional (achado Baixo do 5º pre-mortem — cobertura, lógica já é segura por
      construção):** Strava já `autoSyncPausado=true` (pausado manualmente antes) + atleta conecta
      intervals.icu → permanece `true`, sem save duplicado nem erro (idempotente; o `!= true` já
      evita double-set, só faltava o teste explícito).
      Verify: `IntervalsIcuConnectionServiceImplTest` cobre os três cenários (pausa nova, no-op sem
      Strava, idempotente com Strava já pausado) com `verify(...)` no número exato de chamadas de
      save.
- [ ] 6.11 **Hook automático em `StravaOAuthServiceImpl.exchangeCodeForToken` (D5.2 — Strava nasce
      pausado quando intervals.icu já está ativo):** TDD primeiro — cenário "atleta com
      intervals.icu ativo conecta/reconecta Strava via OAuth → integração Strava nasce com
      `autoSyncPausado=true` no MESMO save (não dois saves separados — verificar o número de
      chamadas ao repositório)"; cenário "atleta sem intervals.icu conectado → `autoSyncPausado`
      fica no default `false` da migration, sem regressão do fluxo OAuth existente (suíte atual do
      OAuth continua verde)". Implementar: ANTES do único
      `integracaoExternaRepository.save(integracao)` (linha 75), buscar a integração INTERVALS_ICU
      ativa do mesmo atleta+tenant; se presente, `integracao.setAutoSyncPausado(true)` no objeto
      Strava antes do save.
      **Cenários adicionais (achado Codex #4 do 5º pre-mortem — hooks são monotônicos, só setam
      `true`, nunca resetam `false`):** o método é find-or-create
      (`findByAtletaIdAndPlataforma(...).orElse(new IntegracaoExterna())`) — uma reconexão reutiliza
      a linha existente. TDD cobrindo: (a) linha existente com `autoSyncPausado=true` (herdado de
      pausa automática ou manual anterior) + reconecta Strava via OAuth com intervals.icu **já
      desconectado** → `autoSyncPausado` permanece `true` (o hook não toca no campo quando a busca
      por intervals.icu ativo retorna vazia — não reseta para `false`); (b) linha existente com
      `autoSyncPausado=true` + reconecta Strava com intervals.icu **ainda ativo** → permanece `true`
      (idempotente, sem erro, sem save duplicado).
      Verify: `StravaOAuthServiceImplTest` cobre os quatro cenários (nasce pausado, default false
      sem regressão, preserva `true` herdado com intervals.icu inativo, preserva `true` herdado com
      intervals.icu ativo) e confirma UM único `save()` por chamada (não dois).
- [ ] 6.12 **`IntervalsIcuConnectionServiceImpl.desconectar` NÃO toca em `autoSyncPausado` (decisão
      do founder, 5º pre-mortem — "nunca auto-retomar", ver design.md D5.2):** TDD: cenário "atleta
      com Strava pausado (`autoSyncPausado=true`) desconecta o intervals.icu → a integração Strava
      permanece `autoSyncPausado=true` inalterada; nenhuma chamada a
      `integracaoExternaRepository.save` para a linha do Strava dentro de `desconectar`" — teste
      negativo explícito (`verify(integracaoExternaRepository, never()).save(argThat(...))` ou
      equivalente para a linha Strava), não apenas ausência de erro. Log estruturado (nível INFO) no
      momento do `desconectar` quando o atleta tinha Strava pausado, indicando que o Strava
      permanece pausado e requer `retomar-sync` manual — mitigação mínima de observabilidade (sem
      alerta proativo, frontend fora de escopo).
      Verify: teste negativo confirma zero chamadas de save para a linha Strava dentro de
      `desconectar`; log estruturado emitido (capturado via `@ExtendWith` de log ou similar ao
      padrão já usado no repo, se houver).
- [ ] 6.13 Validação: `./mvnw clean test`.

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
      (f) pausa automática (D5.2, camada primária, 6.10/6.11): com o atleta founder já com Strava
      ativo, conectar o intervals.icu e confirmar via query direta que `auto_sync_pausado` virou
      `true` sem chamar nenhum endpoint manual; repetir no sentido inverso (intervals.icu já ativo
      → (re)conectar Strava) e confirmar que a linha nasce `auto_sync_pausado=true` desde o
      primeiro save;
      (g) guarda de pausa Strava — override manual (D5.2, camada secundária, CA10): com o atleta do
      item (f) ainda pausado, confirmar que some de `findAllWithStravaConnected` e que um import de
      intervals.icu prossegue normalmente (200); usar `retomar-sync` para reabrir deliberadamente e
      confirmar que um novo import é bloqueado com 409 e mensagem curada, sem persistência; usar
      `pausar-sync` de novo e confirmar o inverso;
      (h) late-check do scheduler (6.7): validar em ambiente de teste/staging que pausar um atleta
      no meio de um ciclo do scheduler o exclui daquele mesmo ciclo (não só do próximo);
      (i) desconectar não reativa (D5.2, 6.12): com o atleta do item (f) ainda pausado
      automaticamente, desconectar o intervals.icu e confirmar via query direta que
      `auto_sync_pausado` permanece `true` (não reverte) e que o log estruturado foi emitido;
      confirmar que o atleta só volta a aparecer para o scheduler após `retomar-sync` manual.
      Verify: cada item (a)-(i) marcado com o resultado observado (não só "OK"/"feito") no relatório
      da task 7.2 — evidência suficiente para outra pessoa confirmar sem repetir o smoke.
- [ ] 7.2 Atualizar proposal.md (Open Questions resolvidas, inclusive o resultado do gate 3.0) e
      este tasks.md com o resultado de cada item do checklist 7.1.
      Verify: `proposal.md` "Open Questions & Assumptions" sem itens "Aberto" que o smoke já
      resolveu; `git diff` mostra as respostas registradas, não apenas checkboxes marcados.

## QA / entrega

- [ ] 8.1 `/qa` (code-reviewer + security-reviewer; trilha Full).
- [ ] 8.2 `/pr intervals-icu-activity-ingestion` → merge via CI → `/done`.
