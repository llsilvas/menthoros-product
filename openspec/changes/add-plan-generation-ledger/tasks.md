# Tasks — add-plan-generation-ledger

> Backend (Java/Spring). Trilha Full. Branch `feature/add-plan-generation-ledger` em **worktree**
> (há outra sessão no repo). Validar `./mvnw clean verify` antes de entregar. TDD por item.
> Pré-requisito executado como `chore` separado: `spring.ai.retry` explícito (ver proposal).

## 0. Pré-requisito (chore separado, antes desta change)

- [ ] 0.1 `chore(config): spring.ai.retry explícito` — `application.yml`: `max-attempts: 3`,
      `backoff.initial-interval: 1s`, `backoff.multiplier: 2`, `backoff.max-interval: 10s`,
      `on-client-errors: false`. `LlmRetryConfigTest` ganha asserção dos valores efetivos.
      **verify:** `./mvnw test -Dtest=LlmRetryConfigTest`; PR próprio para `develop`.

## 1. Schema

- [ ] 1.1 Migration `V94__Create_tb_llm_call.sql` conforme D10 (PK UUID, `created_at` TIMESTAMPTZ,
      `tenant_id` solto nullable, `atleta_id` FK `ON DELETE SET NULL`, `generation_request_id`,
      `route`, `model`, tokens, custo `NUMERIC(12,10)`, latência, `tentativa`, `prompt_version`,
      `prompt_hash`, `schema_version`, `resultado` com `CHECK`, `violacoes` JSONB, `response_json`
      JSONB; índices `(tenant_id, created_at)` e `(generation_request_id)`; bloco `RAISE NOTICE`).
      **verify:** teste de migration (`@DataJpaTest` + Testcontainers) confirma colunas, FK e índices.
- [ ] 1.2 Migration `V95__Add_generation_request_id_to_tb_plano_semanal.sql`: coluna UUID nullable +
      índice. **verify:** teste de migration.
- [ ] 1.3 Entidade `LlmCall` + `LlmCallRepository`; campo `generationRequestId` em `PlanoSemanal`.
      **verify:** `./mvnw clean test`.

## 2. Versionamento (CA5)

- [ ] 2.1 `PromptVersion.CURRENT = "plano-v1"` e `SchemaVersion.CURRENT = "schema-v1"` (pacote
      `domain/compliance`, ao lado de `PlannerVersion`). **verify:** teste trivial de constante.
- [ ] 2.2 `PromptHashCalculator`: SHA-256 do template estático no startup, logado em INFO, exposto
      como bean. **verify:** teste com template fixo e hash conhecido; teste que compara o hash do
      classpath com `golden/plano-prompt/prompt.sha256` (arquivo novo, gerado junto do golden).

## 3. Contexto e advisor (CA1, CA2, CA3, CA11)

- [ ] 3.1 `LlmCallContext` (`ThreadLocal`): `set`, `get`, `lastCallId`, `clear`; record com
      `generationRequestId`, `atletaId`, `tentativa`, `promptVersion`, `promptHash`, `schemaVersion`.
      **verify:** teste de `clear()` e de isolamento entre threads.
- [ ] 3.2 `LlmCallLedger` (service, `services/helper`): `registrarChamada(...)` chamado pelo advisor
      (grava linha, devolve id) e `registrarResultado(callId, resultado, violacoes)`. Toda escrita em
      `try/catch` com `warn` (CA8). Javadoc com Idempotent/Side Effects/Tenant-aware. **verify:**
      teste com repositório mockado lançando exceção — método não propaga.
- [ ] 3.3 `CostTrackingAdvisor`: após extrair tokens/custo/latência, chama `registrarChamada` com
      contexto (se houver) e `tenant_id` do `TenantContext` (se houver; `warn` se ausente); grava
      `SUCCESS` para rotas sem contexto, `LLM_ERROR`/`TIMEOUT` no caminho de exceção; põe o id em
      `LlmCallContext.lastCallId`; tag `tenant` em `llm.cost.estimated.usd` só com contexto.
      **verify:** `CostTrackingAdvisorTest` cobre os quatro resultados, com e sem contexto.
- [ ] 3.4 `IaServiceImpl.geraPlanoSemanalAvancado`: seta o contexto por tentativa (número vindo do
      `PlanoResilienceService`), e após `validar` chama `registrarResultado` com `SUCCESS` ou
      `VALIDATION_REJECTED` + violações; `clear()` em `finally`. `PlanoResilienceService` expõe o
      número da tentativa à função `gerar`. **verify:** `PlanoResilienceServiceTest` com 1 retry gera
      dois registros com tentativas 1 e 2 (CA1, CA3).

## 4. Requisição de geração e ligação com o plano (CA4, CA9)

- [ ] 4.1 `PlanoServiceImpl.gerarPlanoTreino` cria `generationRequestId` (UUID) e o propaga pelo
      objeto de contexto das três fases até `PlanGenerationPersister.salvarPlanoCompleto`, que o
      escreve em `PlanoSemanal`. **verify:** `PlanoServiceImplTest` assegura o mesmo id na chamada e
      no plano salvo; teste de 422/503 mostra chamadas sem plano.
- [ ] 4.2 `BatchPlanProcessor`: id por atleta criado **dentro** da virtual thread, junto com o
      `TenantContext`; `clear()` no `finally` do subtask. **verify:** teste com 2 atletas → ids
      distintos e `tenant_id` preenchido.

## 5. Resposta bruta e purga (CA6, CA7)

- [ ] 5.1 `response_json` recebe o JSON bruto do `ChatResponse` (texto do primeiro `Generation`)
      antes do parse para DTO; o prompt não é gravado em nenhuma coluna. **verify:** teste do advisor
      assegura o conteúdo e a ausência de qualquer trecho do prompt.
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
- [ ] 7.2 Consulta de validação documentada no PR (custo, p50/p95, retry e `REJEITADO` por tenant e
      `prompt_version`) executada contra o banco de dev.
- [ ] 7.3 PR `feature/add-plan-generation-ledger` → `develop`; após merge, remover worktree.
