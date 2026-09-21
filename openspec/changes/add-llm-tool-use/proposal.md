## Status

- DoR (2026-09-18): `spec-reviewer` (Claude) + pre-mortem cross-model **NOT READY** — Codex indisponível
  (limite de uso da conta), fallback DeepSeek usado no lugar. Gaps fechados nesta revisão: Critérios de
  Aceite, Métrica de sucesso, evidência de dependências, propagação de contexto no loop de tools
  (`ThreadLocal`/`@RequestScope` → `ToolContext` nativo do Spring AI). Ver `## Open Questions &
  Assumptions` para os achados aceitos como risco residual, não bloqueantes.

## Why

A geração de plano no Menthoros hoje é um monólogo: empacotamos todo o contexto do atleta, TSS/TSB, provas, histórico, e passamos ao LLM em um único prompt. Isso tem três limitações conhecidas:

1. O LLM não consegue pedir mais detalhes quando o contexto é insuficiente — ele adivinha ou generaliza;
2. Atualizações sobre dados do atleta (ex: recalcular TSS de uma etapa, consultar último teste de campo) precisariam de um novo round-trip com prompt inteiro;
3. Não conseguimos auditar quais informações o LLM efetivamente usou para gerar cada decisão.

Adotar tool use nativo do Spring AI (anotação `@Tool` + `ToolCallback`/`ToolCallbacks`, registrados via `ChatClient...defaultTools(...)`) transforma o LLM em um "agente" que pode chamar funções expostas do nosso próprio serviço durante a geração. Isso permite prompts mais enxutos, auditoria de chamadas, e habilita a arquitetura de Skills (já especificada em `introduce-domain-skills-architecture`) a evoluir para um loop verdadeiramente agêntico.

## What Changes

- **Novo módulo `llm.tool`**: infraestrutura para registrar funções expostas ao LLM via Spring AI
- **Classe abstrata `LlmTool<I, O>`**: contrato mínimo com `getName`, `getDescription`, `getInputSchema`, `execute(I input)`
- **Registrador `LlmToolRegistry`**: descobre beans `LlmTool` e os publica como `ToolCallback` para o `ChatClient` (via `ChatClient...defaultTools(...)` no bean `gpt4oPlanoClient`)
- **Primeiras ferramentas concretas (3 para MVP)**:
  - `GetAtletaMetricasTool`: retorna CTL/ATL/TSB e pace limiar atual do atleta
  - `GetHistoricoTreinosTool`: retorna últimos N treinos realizados com TSS, distância e data
  - `GetProvaAlvoTool`: retorna prova-alvo ativa com data, distância e `tempoObjetivo`
- **Migração gradual do `PlanoTreinoPromptBuilder`**: em vez de empacotar tudo, o prompt passa a descrever o atleta em alto nível e informa que o LLM pode consultar ferramentas para aprofundar
- **Logging estruturado de chamadas de ferramenta**: todas as invocações de tool são persistidas em `tb_llm_tool_call` para auditoria e análise

## Capabilities

### New Capabilities

- `llm-tool-use`: infraestrutura para expor funções internas do Menthoros como ferramentas invocáveis pelo LLM durante a geração de planos, treinos ou análises.

### Modified Capabilities

<!-- Não modifica `introduce-domain-skills-architecture` — complementa, oferecendo a camada de execução que Skills podem usar para ações agênticas. -->

## Impact

**Entidades e banco:**
- Nova tabela: `tb_llm_tool_call` (ID, session_id, atleta_id, tool_name, input_payload JSONB, output_payload JSONB, duration_ms, status, error_message, tenant_id, created_at)
- Índice `(session_id, created_at)` para reconstrução de timeline da conversa

**APIs:**
- Nenhum endpoint público novo; é infraestrutura interna consumida por `IaService`
- Endpoint administrativo opcional: `GET /api/llm/tool-calls?sessionId=X` para inspeção (uso interno)

**Dependências (evidência):**
- `skills-core` → `changes/archive/2026-06/2026-06-16-build-skills-core-foundation/`
- `debito-tecnico-camada-ia` → `changes/archive/2026-06/2026-06-17-debito-tecnico-camada-ia/`

**Código:**
- Dependência `spring-ai-starter-model-openai` já presente em **1.1.6 (GA)** (ver `apps/menthoros-backend/pom.xml`, `spring-ai.version`) — tool calling é estável nesta linha; usar a API GA (`@Tool`/`ToolCallback`, `ChatClient...defaultTools(...)`), não a antiga `FunctionCallbackWrapper` da série M. O starter `spring-ai-starter-model-anthropic` também está presente (relevante caso a tarefa `PLANO` seja roteada para Claude no futuro)
- Três ferramentas iniciais implementadas e registradas como `@Component` implementando `LlmTool`
- `IaService.gerarPlano()` passa a usar `ChatClient` com tools registrados ao invés do `ChatClient` simples

**Integração com Skills:**
- Skills especificadas em `introduce-domain-skills-architecture` podem registrar tools específicas de domínio (ex: `CalcularRiegelTool`, `VerificarElegibilidadeIntervaladoTool`) — isso NÃO é escopo desta change, é habilitação
- Esta change é bloqueante para Skills que dependam de execução de ações além de leitura de contexto

**Observabilidade:**
- Cada invocação de tool é logada em `tb_llm_tool_call` com payload completo (atenção a PII — sanitizar em `tenant_id`-aware logger)
- Métrica Micrometer: `llm_tool_calls_total{tool_name, status}` e `llm_tool_call_duration_seconds`

## Riscos e mitigações

- **Custo de tokens**: tool use aumenta número de round-trips com OpenAI. Mitigar com cache local por `(sessão, tool, input hash)` quando input é idempotente (TTL 5min)
- **Latência percebida**: geração pode ficar mais lenta por chamadas extras. Mitigar com streaming de resposta e feedback visual no cliente
- ~~**Estabilidade de Spring AI M6**~~: **resolvido** — o projeto já está em `spring-ai 1.1.6` (GA), onde tool calling é estável. Risco rebaixado a obsoleto; sem necessidade de feature flag por instabilidade de versão
- **Tool calling × structured output `strict`**: o fluxo de plano depende de saída estruturada estrita (`ResponseFormat` JSON-Schema + `.entity(PlanoSemanalLlmDto.class)`). Combinar loop de tools com saída estrita no turno final é mais delicado e específico de provider — validar empiricamente a taxa de "chamou tool quando deveria responder" antes de migrar o caminho crítico

## Critérios de Aceite

- **CA1 (flag desligada):** Given `app.llm.tool-use.enabled=false`, When um plano semanal é gerado, Then o `ChatClient` usado é o `gpt4oPlanoClient` sem tools e o prompt é o `buildOptimizedPrompt()` atual — comportamento idêntico ao pré-existente (golden-master intacto).
- **CA2 (flag ligada, tools registradas):** Given `app.llm.tool-use.enabled=true`, When `IaServiceImpl.geraPlanoSemanalAvancado()` roda, Then o `gpt4oPlanoToolClient` é usado, as 7 tools de `PlanGenerationTools` estão registradas e o prompt é o `buildCompactPrompt()`.
- **CA3 (isolamento multi-tenant):** Given uma tool executando dentro do loop, When o `tenantId` do `ToolExecutionContext` diverge do `TenantContext.getRequiredTenantId()` corrente, Then `ToolCallLogger` lança `SecurityException` antes de qualquer execução da tool.
- **CA4 (auditoria sem PII de output):** Given qualquer chamada de tool concluída (sucesso ou erro), When ela é persistida em `tb_llm_tool_call`, Then o registro contém `output_size` mas nunca `output_payload`.
- **CA5 (gate de validação empírica):** Given a task 4.4 medindo 20+ gerações, When a taxa de tool-call indevida excede 15% OU a latência excede 2x o baseline, Then a flag permanece `false` em produção e a change não avança para o caminho crítico sem nova revisão.

## Métrica de sucesso

Esta change é um spike/fundação — não migra o caminho crítico `PLANO` até as pré-condições do `design.md` estarem satisfeitas. O sinal que decide "spike bem-sucedido, seguir para migração real" é o mesmo gate desenhado na task 4.4:

- **Sucesso:** taxa de tool-call indevida ≤ 15% **e** latência ≤ 2x o baseline (`gpt4oPlanoClient` sem tools), medido em 20+ gerações (mín. 2 por arquétipo golden).
- **Abortar/revisar:** qualquer um dos dois limites excedido → flag permanece `false`, achados documentados em `design.md` §9.1, decisão de prosseguir volta para revisão humana (não é automático).

Nenhuma métrica de negócio (tempo de geração percebido, taxa de aceitação do coach) é gate desta change — ela é infraestrutura habilitadora, medida antes de qualquer migração do caminho crítico.

## Open Questions & Assumptions

Achados do pre-mortem cross-model (DeepSeek, 2026-09-18, Codex indisponível no gate) aceitos como risco
residual — não bloqueiam o DoR, mas ficam registrados para não virar decisão silenciosa:

- **Regressão silenciosa se o LLM não chamar tools no modo compact.** `buildCompactPrompt()` remove
  ~2.200 tokens do prompt assumindo que o modelo busca via tool o que precisar; se ele não chamar
  nenhuma tool (nada força a chamada), o plano sai com menos dado do que a versão atual e nada detecta
  isso — a task 4.4 mede taxa de erro, não taxa de "tool relevante nunca chamada". Decisão adiada para a
  implementação: considerar `ToolChoice` forçado numa primeira rodada, ou aceitar o risco e medir na 4.4.
- **`input_payload` "seguro" é uma suposição que quebra com tools futuras.** As 7 tools do MVP não
  recebem parâmetro do LLM; `rag-tool-calling-prescription-engine` (Sprint 12+) prevê tools que podem
  receber. Quando isso acontecer, revisar a premissa — não nesta change.
- **Prompt-injection via `descricaoLesao`** é citado como risco no `design.md` mas nenhuma task mitiga
  com sanitização/delimitação explícita. Risco residual aceito nesta change; revisar antes de qualquer
  tool que aceite esse dado como entrada.
- **Gate estatístico da 4.4 (n=20) é frágil** para uma taxa-alvo de 15% — intervalo de confiança amplo.
  Aceito como troca consciente (rápido/barato) em vez de aumentar a amostra.
- **`ModelRouter` com `@Autowired(required = false)`** pode cair silenciosamente no client sem tools se
  o bean condicional `gpt4oPlanoToolClient` não existir por engano de config, mesmo com a flag `true`.
  Recomendado na implementação (task 4.2): log de warning ou fail-fast nesse caso.

## Referências

- **Spring AI Reference (1.1.x)**: "Tool Calling" (`@Tool`, `ToolCallback`, `ChatClient.defaultTools`) — https://docs.spring.io/spring-ai/reference/api/tools.html
- **OpenAI Function Calling docs** — https://platform.openai.com/docs/guides/function-calling
- **OpenSpec change `introduce-domain-skills-architecture`** — consumidor natural desta infraestrutura
