## Pre-condições

- [x] Spring AI 1.1.6 GA confirmado (pom.xml:30) — @Tool / ToolCallbacks / ChatClient.defaultTools() estáveis
- [x] skills-core e debito-tecnico-camada-ia concluídos (dependências)
- [x] Golden-master do prompt existente (PlanoTreinoPromptBuilderGoldenTest, 5 arquétipos)
- [x] Padrão de feature flag estabelecido (ReadinessProperties / @ConfigurationProperties, EncerramentoSemanaScheduler)

---

## 1. Feature flag e configuração

- [ ] 1.1 Criar `ToolUseProperties` com `@ConfigurationProperties(prefix = "app.llm.tool-use")`:
  - `enabled` (boolean, default `false`) — liga/desliga tool calling no fluxo PLANO
  - `cacheTtlSeconds` (int, default `300`) — TTL do cache request-scope (guard futuro)
  - Validação: `@AssertTrue` se `enabled=true`, verificar se provider suporta tools + structured output `strict` no mesmo turn (hoje só `gpt4oPlanoClient`/OpenAI; Claude Sonnet não suporta `strict` JSON-Schema + tools — validar empiricamente na task 4.4 antes de habilitar para Anthropic)

## 2. Tools — bean único com @Tool nativo do Spring AI

> **Decisão:** usar `@Tool` + `ToolCallbacks.from()` do Spring AI 1.1.x em vez de contrato custom `LlmTool<I,O>` + registry manual. O framework já resolve descoberta, schema JSON, registro e invocação. Menos código, menos manutenção.

- [ ] 2.1 Criar `PlanGenerationTools` (`@Component`, pacote `services.prompt.tools`) com 7 tools:

  **Tool 1 — `getHistoricoTreinos`**: histórico de treinos das últimas 4 semanas (resumo + últimos 5 detalhados). Fonte: `PlanoTreinoPromptBuilder.formatarHistoricoTreinos()` (L386-438).

  **Tool 2 — `getAnaliseEstimulos`**: tipos realizados, gaps, volume semanal, distribuição de zonas, sinais de sobrecarga. Fonte: `VariabilidadePromptFormatter.analisarEstimulosRecentes()`.

  **Tool 3 — `getMatrizVariabilidade`**: categorias A-E usadas nas últimas 4 semanas + recomendação + alertas de repetição. Fonte: `VariabilidadePromptFormatter.identificarMatrizVariabilidade()` + `gerarAlertasVariabilidade()`.

  **Tool 4 — `getInstrucoesRecuperacao`**: treinos regenerativos recomendados, parâmetros Z1/Z2, sono/nutrição. Fonte: `RecuperacaoPromptFormatter.detalharRecuperacao()`.

  **Tool 5 — `getPaceHistorico`**: tabela min/média/max por tipo + aviso pace limiar desatualizado. Fonte: `PaceHistoricoFormatter.formatarHistoricoPace()` + `verificarPaceLimiarAtualizado()`.

  **Tool 6 — `getProvaAlvo`**: prova-alvo, fase de periodização, foco da semana, provas preparatórias. Fonte: `PeriodizacaoPromptFormatter.formatarProvas()` + `formatarPeriodizacaoProva()`.

  **Tool 7 — `getVolumeMedio`**: volume médio 3 semanas com tendência. Fonte: `VariabilidadePromptFormatter.calcularVolumeMedioUltimasTresSemanas()`.

  Sem parâmetros do LLM — atletaId vem do `ToolExecutionContext` server-side. As tools **delegam** para os formatters já testados — não reimplementam lógica.

- [ ] 2.2 Criar `ToolContextHolder` (`@Component @RequestScope`) para cachear `ContextoTreino` no escopo do request. Todas as tools usam `holder.getOrLoad()` — máximo 3 queries ao banco por geração.

- [ ] 2.3 Criar `ToolExecutionContext` com `atletaId`, `tenantId`, `atleta`, `metaDados`, `provaAlvo`, `inicioSemana`, `diasEfetivos`. Populado server-side no `IaServiceImpl`. **O LLM nunca escolhe o atletaId.**

- [ ] 2.4 Vincular `ToolExecutionContext` via `ThreadLocal` para que os `@Tool` methods acessem sem parâmetro do LLM.

## 3. Persistência e auditoria

- [ ] 3.1 Criar migration `V50__Create_llm_tool_call_table.sql` com campos: `id`, `session_id`, `atleta_id`, `tenant_id`, `tool_name`, `input_payload` (JSONB), `output_size` (INTEGER), `duration_ms`, `status` (SUCCESS/ERROR), `error_message`, `created_at`. Índices em `(session_id, created_at)` e `(atleta_id, created_at)`.

  > **PII:** `output_payload` **não é persistido** — apenas `output_size`. Output contém dados de saúde. `input_payload` é seguro (tools sem parâmetros do LLM).

- [ ] 3.2 Criar entidade `LlmToolCall` e `LlmToolCallRepository`.

- [ ] 3.3 Criar `ToolCallLogger` (`@Component`) — intercepta execução das tools, persiste `LlmToolCall`, mede `duration_ms`, reafirma `TenantContext` antes de executar. Em exceção: `status=ERROR` + mensagem textual ao LLM sem stacktrace.

## 4. Integração no fluxo PLANO

- [ ] 4.1 Criar bean `gpt4oPlanoToolClient` em `MultiModelConfig` com `@ConditionalOnProperty(name = "app.llm.tool-use.enabled", havingValue = "true")` — idêntico ao `gpt4oPlanoClient` mas com `.defaultTools(ToolCallbacks.from(tools))`.

- [ ] 4.2 Ajustar `ModelRouter`: quando `toolUseProperties.isEnabled()`, retornar `gpt4oPlanoToolClient` para `TaskComplexity.PLANO`. Injetar via `@Autowired(required = false)`.

- [ ] 4.3 No `IaServiceImpl.geraPlanoSemanalAvancado()`: popular `ToolExecutionContext` no `ThreadLocal` antes da chamada; despachar para `buildCompactPrompt()` ou `buildOptimizedPrompt()` conforme flag; limpar `ThreadLocal` no `finally`.

- [ ] 4.4 **Validação empírica** — tool loop x structured output `strict`:
  - 20+ gerações com tools (no mínimo 2 por arquétipo golden)
  - Medir: taxa de tool-call indevida (deveria responder JSON), taxa de DTO válido, latência vs baseline
  - **Gate:** taxa de falha > 15% ou latência > 2x — flag permanece `false`, revisão antes de prosseguir
  - Documentar resultado em `design.md`

## 5. Prompt compact (modo tool-use)

- [ ] 5.1 Criar `buildCompactPrompt()` no `PlanoTreinoPromptBuilder` — mesma assinatura, mesmo `PromptGerado(prompt, regras)`:

  **PUSH OBRIGATÓRIO (segurança — ~1.860 tokens):**
  Constraints [1], alertas obrigatórios, hierarquia de decisão, evento competitivo, restrições/lesões, readiness, dados fisiológicos + zonas, métricas CTL/ATL/TSB, disponibilidade + dias efetivos, metas da semana, aviso pace TSB, status geral.

  **SAI DO PROMPT (~2.200 tokens — disponível via @Tool):**
  Histórico treinos 14d, pace demonstrado, análise estímulos, matriz variabilidade, volume médio, recuperação detalhada, periodização + prova.

- [ ] 5.2 Adicionar seção de instrução para tool use no prompt compact (orientar o LLM a consultar ferramentas antes de gerar o plano).

- [ ] 5.3 Confirmar: `buildCompactPrompt()` retorna `PromptGerado` com as mesmas `Constraint` — seam inalterado, `PlanQualityChecker` e pipeline fase 3 integralmente preservados.

## 6. Observabilidade

- [ ] 6.1 Métricas Micrometer: `menthoros.llm.tool.calls.total` (counter, tags: `tool_name`, `status`), `menthoros.llm.tool.call.duration` (timer), `menthoros.llm.plan.mode` (counter, tag: `mode=compact|full`).

- [ ] 6.2 Endpoint `GET /api/admin/llm/tool-calls?sessionId={id}` (role ADMIN) — sem output (PII), apenas metadata.

## 7. Multi-tenancy

- [ ] 7.1 Em `ToolCallLogger`: antes de executar, comparar `TenantContext.getRequiredTenantId()` com `ToolExecutionContext.tenantId`. Divergência = `SecurityException`.

- [ ] 7.2 Teste: tool invocada com atletaId de tenant diferente = `SecurityException`.

## 8. Testes

- [ ] 8.1 Unitários de `PlanGenerationTools`: 7 tools x (dados completos + dados vazios) = 14 testes.
- [ ] 8.2 `ToolContextHolder`: `getOrLoad` chama `prepararContexto` uma única vez.
- [ ] 8.3 `ToolCallLogger`: persistência SUCCESS/ERROR, `output_payload` não preenchido.
- [ ] 8.4 Prompt compact: blocos mandatórios presentes, blocos removidos ausentes (asserção por substring).
- [ ] 8.5 Multi-tenancy: tenant errado = `SecurityException`.
- [ ] 8.6 Feature flag: `enabled=false` = client sem tools; `enabled=true` = client com tools.
- [ ] 8.7 Golden-master compact: 5 arquétipos em `golden/plano-prompt-compact/`.

## 9. Documentação

- [ ] 9.1 Atualizar `design.md`: decisão `@Tool` nativo vs custom, resultado validação empírica, mapa push/pull, decisão PII, restrição OpenAI-only.
