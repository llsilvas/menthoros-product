# Tasks — add-plan-generation-ledger

> Backend (Java/Spring). Trilha Full. Branch `feature/add-plan-generation-ledger` em **worktree**
> (há outra sessão no repo). Validar `./mvnw clean verify` antes de entregar. TDD por item.
> Pré-requisito executado como `chore` separado: `spring.ai.retry` explícito — PR
> `menthoros-backend#115`. **A seção 1 só começa depois do merge desse PR**, com a branch
> rebaseada em `develop`.
> DoR 2026-09-13: `spec-reviewer` apontou dois gaps de assinatura (D3/D4) e o Codex sete achados
> (estado pendente, isolamento transacional, PII na resposta, desfecho da requisição, tenant dos
> listeners, tags condicionais, retry de transporte) — todos fechados em D6, D7, D11, D12, D13 na
> mesma data. As tasks abaixo refletem as decisões fechadas.

## 0. Pré-requisito (chore separado, antes desta change)

- [x] 0.1 `chore(config): spring.ai.retry explícito` — `application.yml`: `max-attempts: 3`,
      `backoff.initial-interval: 1s`, `backoff.multiplier: 2`, `backoff.max-interval: 10s`,
      `on-client-errors: false`. `LlmRetryConfigTest` ganha o caso `naoHerdaDefaultDoSpringAi`
      (binding do `application.yml` real). **verify:** 5 testes verdes; PR `menthoros-backend#115`
      mergeado em `develop` em 2026-09-13 (`365d475`). Branch da change rebaseada nele.

## 1. Schema

- [x] 1.1 Migration `V94__Create_tb_llm_call.sql` conforme D10 (PK UUID, `created_at` TIMESTAMPTZ,
      `tenant_id` solto nullable, `atleta_id` FK `ON DELETE SET NULL`, `generation_request_id`,
      `route`, `model`, tokens, custo `NUMERIC(12,10)`, latência, `tentativa`, `prompt_version`,
      `prompt_hash`, `schema_version`, `resultado` com `CHECK` (6 valores), `request_outcome`
      nullable com `CHECK` (4 valores), `transport_retries`, `violacoes` JSONB, `response_json`
      JSONB; índices `(tenant_id, created_at)` e `(generation_request_id)`; bloco `RAISE NOTICE`).
      **verify:** teste de migration (`@DataJpaTest` + Testcontainers) confirma colunas, FK e índices.
- [x] 1.2 Migration `V95__Add_generation_request_id_to_tb_plano_semanal.sql`: coluna UUID nullable +
      índice. **verify:** teste de migration.
- [x] 1.3 Entidade `LlmCall` + `LlmCallRepository`; campo `generationRequestId` em `PlanoSemanal`.
      **verify:** `./mvnw clean test`. Nota ADR-0007: colunas e campos novos em inglês (`result`,
      `attempt`, `violations`, `cost_usd`, `latency_ms`) — a spec usa os termos em PT-BR como
      conceito; os identificadores seguem o CLAUDE.md do backend.

## 2. Versionamento (CA5)

- [ ] 2.1 `PromptVersion.CURRENT = "plano-v1"` e `SchemaVersion.CURRENT = "schema-v1"` (pacote
      `domain/compliance`, ao lado de `PlannerVersion`). **verify:** teste trivial de constante.
- [ ] 2.2 `PromptHashCalculator`: SHA-256 do template estático no startup, logado em INFO, exposto
      como bean. **verify:** teste com template fixo e hash conhecido; teste que compara o hash do
      classpath com `golden/plano-prompt/prompt.sha256` (arquivo novo, gerado junto do golden).

## 3. Contexto e advisor (CA1, CA2, CA3, CA11)

- [ ] 3.1 `LlmCallContext` (record imutável: `generationRequestId`, `atletaId`, `tentativa`,
      `promptVersion`, `promptHash`, `schemaVersion`) + `LlmCallScope` (holder com **três**
      `ThreadLocal` simples: contexto, `lastCallId` e `transportRetries`; `open(ctx)`, `current()`,
      `registerCallId(id)`, `lastCallId()`, `incrementTransportRetry()`, `transportRetries()`,
      `close()`), pacote `ai/ledger`. `LlmRetryConfig`: o `RetryListener.onError` chama
      `incrementTransportRetry()`. **verify:** `LlmCallScopeTest`: `close()` limpa os três; `open`
      zera os anteriores; isolamento entre threads; `LlmRetryConfigTest` conta 2 em 500→500→200.
- [ ] 3.2 `LlmCallLedger` (service, `services/helper`): `registrarChamada(...)` (grava linha,
      devolve id), `registrarResultado(callId, resultado, violacoes)` e
      `registrarDesfecho(generationRequestId, outcome)` (atualiza a linha de maior `tentativa`).
      Cada método em `@Transactional(propagation = REQUIRES_NEW, timeout = 5)` e `try/catch` com
      `warn` (CA8, D12). Redação do nome
      do atleta em `response_json` acontece aqui, a partir de `LlmCallContext.atletaNome`
      (campo do record, preenchido pela rota `plano`). Javadoc com Idempotent/Side
      Effects/Tenant-aware. **verify:** teste com repositório lançando exceção — não propaga;
      `LlmCallLedgerIT`: chamador em `REQUIRES_NEW` faz rollback e a linha sobrevive.
- [ ] 3.3 `CostTrackingAdvisor.paraRota(rota, pricing, meterRegistry, ledger)` — novo parâmetro,
      atualizar `MultiModelConfig.advisorDeCusto` (injeta o bean `LlmCallLedger` uma vez, 5 rotas).
      Em `adviseCall`: após tokens/custo/latência, chama `registrarChamada` com `LlmCallScope.current()`
      (se houver), `TenantContext.getTenantId()` (nulo → `warn`), e o texto bruto
      `response.chatResponse().getResult().getOutput().getText()` **só com contexto**; grava
      `PENDING` com contexto e `SUCCESS` sem contexto, `LLM_ERROR`/`TIMEOUT` no `catch` antes do
      `throw e`; `transport_retries` do escopo; `LlmCallScope.registerCallId(id)`; tag `tenant`
      **sempre** em `llm.cost.estimated.usd` (sentinela `none`). **verify:**
      `CostTrackingAdvisorTest` cobre `PENDING`/`SUCCESS`/`LLM_ERROR`/`TIMEOUT`, com e sem
      contexto; teste com `PrometheusMeterRegistry` real nas duas ordens (CA11); `MultiModelConfig`
      sobe.
- [ ] 3.4 `PlanoResilienceService`: record `Tentativa(int numero, String prompt)`; `gerar` vira
      `Function<Tentativa, PlanoSemanalLlmDto>` nas duas sobrecargas de `gerarComResiliencia`
      (único caller: `IaServiceImpl`). `IaServiceImpl.geraPlanoSemanalAvancado`: `LlmCallScope.open`
      com o número da tentativa antes da chamada, `close()` em `finally` guardando o `lastCallId`;
      `catch` no lambda para falha de conversão do `responseEntity` → `registrarResultado(callId,
      PARSE_ERROR)` e relança; após `validar`, `registrarResultado(callId, SUCCESS |
      VALIDATION_REJECTED, violacoes)`. **verify:** `PlanoResilienceServiceTest` com 1 retry entrega
      `Tentativa(1)` e `Tentativa(2)`; `IaServiceImpl*Test` prova REJECTED depois SUCCESS, e
      PARSE_ERROR quando o DTO não desserializa (CA1, CA3).

## 4. Requisição de geração e ligação com o plano (CA4, CA9)

- [ ] 4.1 `PlanGenerationContext` ganha `UUID generationRequestId` (obrigatório no compact
      constructor); `PlanGenerationContextLoader.load` gera `UUID.randomUUID()` no início;
      `PlanGenerationPersister.salvarPlanoCompleto` escreve `plano.setGenerationRequestId(ctx.generationRequestId())`.
      Nenhuma assinatura de `gerarPlanoTreino`/`gerarPlanoSemanal`/`persist` muda. **verify:**
      `PlanGenerationContextLoaderIT` mostra id presente; `PlanGenerationPersisterTest` assegura o
      mesmo id no plano salvo; teste de 422/503 mostra chamadas sem plano.
- [ ] 4.2 Lote: nada a mudar no `BatchPlanProcessor` — o id nasce no loader e o `LlmCallScope`
      abre/fecha dentro do lambda `gerar`, que roda na virtual thread do atleta (o `TenantContext`
      já é setado lá). **verify:** teste do processor com 2 atletas e `IaService` real mockado no
      nível do `ChatClient` → 2 ids distintos e `tenant_id` preenchido em ambos (CA9).
- [ ] 4.3 Desfecho da requisição (CA4, D6): em `PlanoServiceImpl.gerarPlanoTreino`, declarar
      `PlanGenerationContext ctx = null` e `boolean llmAceito = false` **antes** do `try`; `llmAceito
      = true` logo após `gerarPlanoSemanal` devolver DTO não nulo. Nos `catch`, com `ctx != null`:
      `DomainRuleViolationException` + `llmAceito` → `REJECTED_POST_LLM`; `PlanoJaExistenteException`
      ou índice V52 + `llmAceito` → `CONFLICT`; outra exceção + `llmAceito` → `PERSIST_ERROR`; sem
      `llmAceito` → nada; retorno normal → `PERSISTED`. Tudo via
      `ledger.registrarDesfecho(ctx.generationRequestId(), outcome)`, best-effort. **verify:**
      `PlanoServiceImplTest` cobre os quatro desfechos, o caso "falha do loader → sem desfecho" e
      "fast-path duplicado antes do LLM → sem desfecho".
- [ ] 4.4 Tenant nos listeners (CA12): `WorkoutAnalysisListener` e `WeeklyFocusNarrativeService`
      fazem `TenantContext.setTenantId(tenantId)` antes da chamada ao LLM e `clear()` no `finally`
      (já recebem o id; hoje não o publicam). **verify:** testes existentes dos dois + asserção de
      que o `TenantContext` está limpo ao sair.

## 5. Resposta bruta e purga (CA6, CA7)

- [ ] 5.1 `response_json` recebe o JSON bruto do `ChatResponse` (texto do primeiro `Generation`)
      antes do parse para DTO, com nome e sobrenome do atleta substituídos por `[ATLETA]` (D7);
      o prompt não é gravado. **verify:** teste do ledger com atleta "Maria Souza" e resposta que
      cita o nome → `[ATLETA]` no JSON gravado.
- [ ] 5.3 Exclusão do atleta anula `response_json` das linhas dele, no mesmo ponto que já trata a
      exclusão (`AtletaServiceImpl.delete` ou listener). **verify:** IT: excluir atleta →
      `atleta_id = NULL` e `response_json = NULL`.
- [ ] 5.2 `LlmCallRetentionScheduler` (`@Scheduled` diário, padrão dos schedulers existentes):
      anula `response_json` > 90 dias, loga total. **verify:** teste com `Clock` fixo e 3 linhas
      (2 velhas, 1 nova) → 2 anuladas, demais colunas intactas; segunda execução anula 0.

## 6. Glossário e documentação

- [ ] 6.1 `apps/menthoros-backend/CONTEXT.md`: termos **Chamada LLM** (`LlmCall`) e **Requisição de
      geração** (`GenerationRequest`) — definição, relação 1:N, o que não são (não são evento de
      domínio; "tentativa" só existe na rota `plano`). **verify:** revisão no PR.
- [ ] 6.2 Atualizar `docs/ia/ANALISE_GERACAO_PLANOS_LLM.md` §7 Fase 0 com o nome final da tabela.

## 7. QA e entrega

- [ ] 7.1 `./mvnw clean verify` verde; `/qa` (code-reviewer + security-reviewer; atenção a
      multi-tenancy do `tenant_id` nullable e a PII no `response_json`).
- [ ] 7.2 Consulta de validação documentada no PR (custo, p50/p95, retry, `PENDING` residual,
      `request_outcome` e `REJEITADO` por tenant e `prompt_version`) executada contra o banco de dev.
- [ ] 7.3 PR `feature/add-plan-generation-ledger` → `develop`; após merge, remover worktree.
