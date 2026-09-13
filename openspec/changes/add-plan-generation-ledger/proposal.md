**Tamanho:** M · **Trilha:** Full

# Ledger de chamadas LLM — toda geração deixa rastro

**Change-id:** `add-plan-generation-ledger`
**Estado:** proposta pronta para implementação (DoR fechado — grilling 2026-09-13, Rodadas 1 e 2).
**Data:** 2026-09-13.
**Origem:** Fase 0 da análise arquitetural do motor de geração
(`apps/menthoros-backend/docs/ia/ANALISE_GERACAO_PLANOS_LLM.md`, achados A4 e A5). Sprint 24.

## Why

Nenhuma chamada ao LLM deixa registro persistido. Há métricas Prometheus agregadas
(`llm.tokens.*`, `llm.cost.estimated.usd`, `llm.call.duration`, por rota e modelo) e uma linha de
log `[llm-usage]` por tentativa, mas nada que permita responder:

- quanto custou **este** plano, incluindo o retry;
- qual **versão do prompt** ou do schema produziu os planos que o coach rejeitou;
- qual é o custo **por assessoria** (o `CostTrackingAdvisor` não conhece tenant);
- se o cache de prefixo está funcionando depois de uma mudança no template;
- qual foi a **resposta bruta** do modelo numa tentativa rejeitada pela validação.

Sem isso, nenhuma das fases seguintes da análise (split do prompt, turno de reparo, schema
semântico, bake-off de provider) pode ser aprovada com evidência, e o sinal de ouro que já existe —
`review_status` do plano e edições do coach — não se conecta à geração que o produziu.

Fatos que motivam o desenho (levantamento 2026-09-13):

- O `plano_id` só nasce no `save` do `PlanGenerationPersister`, depois de toda a normalização.
- O `request_id` do MDC não propaga para as virtual threads do lote (não há `TaskDecorator`).
- Não existe nenhum identificador de "requisição de geração" no domínio.
- O prompt não tem versão; só o planner tem (`planner-v1`).

## What Changes

- **Tabela `tb_llm_call`**: uma linha por chamada ao LLM, em **todas** as rotas, com colunas
  genéricas (tenant, rota, modelo, tokens de entrada/saída/cache-read/cache-write, custo estimado,
  latência, resultado, `created_at`) e colunas de enriquecimento **nullable** preenchidas pela rota
  `plano` (`generation_request_id`, `atleta_id`, `tentativa`, `prompt_version`, `prompt_hash`,
  `schema_version`, `violacoes` JSONB, `response_json` JSONB).
- **Coluna `generation_request_id`** (UUID, nullable) em `tb_plano_semanal`, escrita no mesmo `save`
  que já existe. A ligação chamada ↔ plano é por join nessa coluna; nada é copiado.
- **`LlmCallContext`** (`ThreadLocal`, precedente `TenantContext`): preenchido pela rota `plano` antes
  da chamada com `generationRequestId`, `atletaId`, `tentativa`, `promptVersion`, `schemaVersion`.
  O `CostTrackingAdvisor` lê o contexto, grava a linha (único escritor) e devolve o `llmCallId` no
  contexto; depois da validação a rota `plano` atualiza `resultado` e `violacoes` pelo id. No lote, o
  contexto é setado **dentro** da virtual thread de cada atleta, como já se faz com o tenant.
- **`PromptVersion.CURRENT = "plano-v1"`** e **`SchemaVersion.CURRENT = "schema-v1"`** como
  constantes, mais `prompt_hash` SHA-256 do template estático calculado no startup e logado.
- **Tag `tenant`** no counter `llm.cost.estimated.usd` quando o contexto estiver presente.
- **Purga**: `@Scheduled` diário anula `response_json` com mais de 90 dias. A linha de custo fica.
- **Glossário**: termos **Chamada LLM** (`LlmCall`) e **Requisição de geração**
  (`GenerationRequest`) no `CONTEXT.md` do backend.

## Non-goals

- Nenhuma UI nem endpoint de consulta: leitura por SQL e Grafana/Prometheus.
- Não guarda o **prompt** (PII e tamanho; precedente da V58). Guarda hash e versão.
- Não copia `review_status` nem edições do coach para a linha; isso é join.
- Não altera a geração, o prompt, o schema nem o retry. Best-effort: uma falha ao gravar a linha
  **nunca** derruba a geração.
- Não configura `spring.ai.retry`: sai antes, como `chore` separado (ver Open Questions).

## Capabilities

### New Capabilities

- `llm-call-ledger`: contrato de registro de cada chamada ao LLM, ligação com o plano gerado,
  versionamento de prompt/schema e retenção. Delta em
  [specs/llm-call-ledger/spec.md](specs/llm-call-ledger/spec.md).

## Acceptance Criteria (testáveis)

- **CA1 — Uma linha por chamada.** Given uma geração de plano com 1 retry, When as duas chamadas
  terminam, Then existem 2 linhas em `tb_llm_call` com o mesmo `generation_request_id`, `tentativa`
  1 e 2, tokens e latência de cada uma.
- **CA2 — Genérico em toda rota.** Given uma chamada da rota `standard` (análise de treino) sem
  `LlmCallContext`, When ela termina, Then existe 1 linha com `route`, `model`, tokens, custo e
  latência preenchidos e todas as colunas de enriquecimento `NULL`, e um `warn` é logado se o
  `tenant_id` estiver ausente.
- **CA3 — Resultado por chamada.** Given a rota `plano`, Then a linha nasce `PENDING`; Given uma
  resposta rejeitada pela validação, Then `VALIDATION_REJECTED` e `violacoes` com a lista
  `{key, mensagem}`; Given uma resposta aceita, Then `SUCCESS`; Given HTTP 200 cuja conversão para
  DTO falha, Then `PARSE_ERROR`; Given exceção do provider, Then `LLM_ERROR`; Given
  `SocketTimeoutException` na cadeia de causas, Then `TIMEOUT`. Given crash entre a resposta e a
  validação, Then a linha permanece `PENDING` e é contada como tal na consulta de validação.
- **CA4 — Ligação e desfecho.** Given um plano persistido, Then `tb_plano_semanal.generation_request_id`
  é igual ao `generation_request_id` das chamadas que o geraram e a última chamada tem
  `request_outcome = PERSISTED`; Given corrida perdida no índice da V52, Then `CONFLICT`; Given
  rejeição terminal depois de o LLM ter sido aceito (estágio 2 fail-closed), Then
  `REJECTED_POST_LLM`; Given falha na persistência, Then `PERSIST_ERROR`; Given plano excluído
  depois, Then o `request_outcome` permanece `PERSISTED` e o join deixa de encontrar o plano.
- **CA5 — Versão e hash.** Given o template estático no classpath, When a aplicação sobe, Then o
  hash SHA-256 é calculado uma vez, logado em INFO e gravado em cada chamada da rota `plano` junto
  com `prompt_version` e `schema_version`; um teste falha se o hash do golden divergir do classpath.
- **CA6 — Resposta bruta como dado sensível.** Given qualquer chamada da rota `plano`, Then
  `response_json` contém o JSON como veio do modelo, **antes** do reparo, com o nome do atleta
  substituído por `[ATLETA]`; o prompt não é gravado em coluna alguma; Given exclusão do atleta,
  Then `response_json` das linhas dele é anulado (além de `atleta_id = NULL`).
- **CA7 — Purga.** Given linhas com `created_at` há mais de 90 dias e `response_json` não nulo,
  When o job diário roda, Then `response_json` vira `NULL` e as demais colunas permanecem; o job é
  idempotente e loga o total anulado.
- **CA8 — Best-effort e isolamento.** Given o repositório do ledger lança exceção, When a geração
  roda, Then o plano é gerado e persistido normalmente e a falha é logada em `warn`; Given o
  chamador está em `@Transactional(REQUIRES_NEW)` e faz rollback (caso dos listeners assíncronos),
  Then a linha do ledger sobrevive; Given a escrita do ledger bloqueia, Then estoura em 5 s e não
  segura o permit do `LlmConcurrencyLimiter`.
- **CA9 — Lote.** Given um lote de N atletas, Then cada atleta tem seu próprio `generation_request_id`
  e `tenant_id` preenchido (contexto setado dentro da virtual thread).
- **CA10 — Integridade.** `atleta_id` e `plano_id` são FK com `ON DELETE SET NULL`; `tenant_id` é
  solto; índices `(tenant_id, created_at)` e `(generation_request_id)`.
- **CA11 — Custo por tenant.** `llm.cost.estimated.usd` tem **sempre** a tag `tenant` (valor
  `none` quando ausente); as duas ordens de chamada (com tenant primeiro, sem tenant primeiro)
  registram num `PrometheusMeterRegistry` real sem erro.
- **CA12 — Tenant nos listeners assíncronos.** Given uma chamada de `WorkoutAnalysisListener` ou
  `WeeklyFocusNarrativeService`, Then a linha tem `tenant_id` preenchido (os dois já recebem o
  `tenantId` e passam a publicá-lo no `TenantContext` em volta da chamada).
- **CA13 — Retry de transporte visível.** Given uma sequência HTTP 500 → 500 → 200 numa chamada
  da rota `plano`, Then existe **uma** linha com `transport_retries = 2`.

## Métrica de sucesso

Em duas semanas de produção: consulta única que devolve, por tenant e por `prompt_version`, custo
total, latência p50/p95, taxa de retry e taxa de `REJEITADO` do coach. É o painel que aprova ou
reprova a Fase 1 (`cachedTokens ≥ 60%` no lote) e serve de baseline para a Fase 4.

## Open Questions & Assumptions

- **`spring.ai.retry` explícito** (`max-attempts=3`, `initial-interval=1s`, `multiplier=2`,
  `max-interval=10s`, `on-client-errors=false`) sai **antes** desta change como `chore` de uma linha
  em `application.yml` + asserção em `LlmRetryConfigTest`, para que o ledger já nasça medindo o
  comportamento novo.
- `tenant_id` **nullable** apenas para chamadas comprovadamente sem tenant; os dois listeners
  assíncronos passam a publicar o `TenantContext` (CA12).
- Gravação síncrona na própria thread, em `@Transactional(REQUIRES_NEW, timeout = 5)` (D12): a rota
  `plano` roda fora de transação, mas os listeners assíncronos não. Sem fila, sem `@Async`.
- **Decisão revista após o DoR:** o grilling (Q14) tinha fechado "desfecho da requisição só por
  join"; o Codex mostrou quatro casos indistinguíveis por join, e a spec passou a gravar
  `request_outcome` na última chamada (D6). O veredito do coach continua sendo join (Q6).
- "Chamada LLM" é a chamada **lógica**: o retry de transporte do Spring AI acontece dentro do
  `ChatModel` e aparece como `transport_retries` na mesma linha (D13).
- Migrations `V94__Create_tb_llm_call.sql` e `V95__Add_generation_request_id_to_tb_plano_semanal.sql`
  (conferir o V mais alto no momento do merge).
- Volume: ~600 linhas/mês com 100 planos/semana. Irrelevante por anos.
- Este não é um evento de domínio: o ledger é observabilidade técnica e não dispara nada.
