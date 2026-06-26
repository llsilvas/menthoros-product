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

## Referências

- **Spring AI Reference (1.1.x)**: "Tool Calling" (`@Tool`, `ToolCallback`, `ChatClient.defaultTools`) — https://docs.spring.io/spring-ai/reference/api/tools.html
- **OpenAI Function Calling docs** — https://platform.openai.com/docs/guides/function-calling
- **OpenSpec change `introduce-domain-skills-architecture`** — consumidor natural desta infraestrutura
