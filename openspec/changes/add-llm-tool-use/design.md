# Design — add-llm-tool-use

## Context

A geração de plano hoje (`IaServiceImpl.geraPlanoSemanalAvancado`, `apps/menthoros-backend/.../services/impl/IaServiceImpl.java:294`) é um pipeline de três fases bem definidas:

1. **Montagem eager do contexto** — `PlanoTreinoPromptBuilder.buildOptimizedPrompt()` chama `treinoHistoricoProvider.prepararContexto(atleta)` **uma vez** e despeja todo o contexto no prompt via ~10 formatters (`MetricasPromptFormatter`, `AlertasPromptFormatter`, `RecuperacaoPromptFormatter`, `PeriodizacaoPromptFormatter`, `VariabilidadePromptFormatter`, `DisponibilidadePromptFormatter`, `PaceHistoricoFormatter`, `ThresholdConstraintFormatter`). O prompt é uma **função pura determinística** dos inputs, coberta por golden-master (707 testes, `PlanoTreinoPromptBuilderGoldenTest`).
2. **Uma única chamada** ao `gpt4oPlanoClient` (gpt-4o, `temperature=0.2`, `maxTokens=12000`, `MultiModelConfig.java:129`) com **structured output estrito** — `defaultJsonSchemaOptions()` monta um JSON-Schema `strict:true` (`buildSchemaTightInlineOrDefs`) e `.entity(PlanoSemanalLlmDto.class)` desserializa.
3. **Pós-processamento determinístico de saída** — `validarENormalizarPlanoGerado()`: `expandirEtapasAgregadas`, `corrigirDistanciasEtapasTemporais`, `validarFcEtapa`, `normalizarTreinoIntervalado`, `PlanoEstruturaReparador`, reconciliação de distância; mais o gate `PlanQualityChecker.check()` offline e a resiliência `PlanoResilienceService` (1 retry → 503 vira 422).

O anti-alucinação já foi entregue de forma mais barata em changes anteriores: o seam `Constraint` + bloco mandatório `[1]` (`introduce-plan-constraints`, Sprint 7) e a resiliência estrutural (`harden-plan-generation-resilience`, Sprint 8). Esta change **não** é uma cura de alucinação — é fundação para auditabilidade, RAG (`rag-tool-calling-prescription-engine`, Sprint 12–14) e skills agênticas.

## Decisão: migração híbrida e incremental (não substituição do monólito)

Tool calling muda **como o dado de entrada chega ao modelo**; não muda que a **saída** continua alucinando estrutura e exigindo todo o pipeline da fase 3. Portanto, a migração é aditiva e seletiva, não um rip-and-replace do `buildOptimizedPrompt`.

### O que PERMANECE eager (injetado no prompt, fora de tool)

- **Bloco de `Constraint` `[1]`** (`formatarBlocoRegras`) — regras mandatórias precisam estar sempre, proeminentes, no contexto. Dado buscado sob demanda pode simplesmente não ser buscado pelo modelo. Além disso, o `PlanQualityChecker` precisa do objeto `List<Constraint>` independentemente (o seam `PromptGerado(prompt, regras)` é mantido).
- **Dados fisiológicos / zonas de FC e pace** — são quase sempre necessários; empacotá-los eager é mais barato que um round-trip de tool.
- **Structured output `strict` + `.entity(PlanoSemanalLlmDto.class)`** — mantido como contrato de saída.
- **Todo o pipeline de fase 3** (`validarENormalizarPlanoGerado`, `PlanQualityChecker`, `PlanoResilienceService`) — preservado integralmente.

### O que VIRA tool (contexto profundo, opcional ou caro de empacotar)

As três tools do MVP já são exatamente esse perfil:

- `GetHistoricoTreinosTool` — histórico estendido sob demanda (hoje sempre empacotado via `formatarHistoricoTreinos`).
- `GetProvaAlvoTool` — detalhes de prova-alvo.
- `GetAtletaMetricasTool` — CTL/ATL/TSB e pace limiar (recálculo sob demanda sem re-empacotar o prompt inteiro).

Candidatas futuras (fora do escopo desta change): recálculo de TSS de etapa, consulta a último teste de campo, e — crucialmente — recuperação RAG de metodologia.

## Pré-condições antes de tocar o caminho crítico `PLANO`

1. **Instrumentar o desperdício de contexto.** O argumento de economia de tokens só se sustenta se uma fração grande do contexto eager for genuinamente ignorada por geração. Medir antes de assumir — o fluxo `PLANO` já é o mais caro (gpt-4o, `maxTokens=12000`) e cada round-trip de tool **reenvia o histórico de mensagens crescente**, inflando tokens de input. Para uma geração single-shot que precisa de quase todo o contexto, empacotar eager pode ser mais barato que o loop de tools.
2. **Validar a interação tool loop × structured output `strict`.** Medir empiricamente a taxa de "modelo chamou tool quando deveria emitir a resposta estruturada final". Específico de provider (a máquina `defaultJsonSchemaOptions()` é `OpenAiChatOptions`).
3. **Validar primeiro em fluxo não-crítico.** Provar a infra `LlmTool`/`LlmToolRegistry` em uma análise menos sensível antes de migrar a geração de plano.

## Riscos e trade-offs

- **Rede de testes determinística enfraquece.** O golden-master assume prompt = função pura dos inputs. Com tools, *quais* funções o modelo chama (e em que ordem) é não-determinístico — o golden deixa de capturar o input real visto pelo modelo. Isso reabre a necessidade da "Camada C — eval ao vivo" deferida ao pós-MVP. Mitigar: golden-master cobre apenas a parte eager (que permanece pura); a parte por tool exige eval ao vivo.
- **Multi-tenancy dentro do loop.** Cada `LlmTool.execute` roda no meio do loop do LLM e **deve reafirmar** `TenantContext.getRequiredTenantId()` (como `validarENormalizarPlanoGerado` já faz). Não confiar no contexto implícito.
- **PII em `tb_llm_tool_call`.** Payloads JSONB de input/output podem conter dados de atleta e descrição de lesão. Sanitizar de forma tenant-aware antes de persistir (ver nota de prompt-injection via `descricaoLesao`). Tools ampliam a superfície de ataque — uma lesão injetada poderia tentar dirigir tool calls.
- **Latência/custo** — mitigar com cache `(sessão, tool, input hash)` (TTL 5min) para inputs idempotentes e streaming/feedback visual no cliente.

## Non-goals

- Substituir ou reescrever `buildOptimizedPrompt` (isso é o strangler `migrate-plan-prompt-to-skills`, Sprint 18–20, deferido).
- Remover qualquer etapa do pipeline de normalização/validação de saída.
- Migrar o caminho `PLANO` para tool calling antes das pré-condições acima estarem satisfeitas.
- Registrar tools de domínio específicas de skills (apenas habilitação; ver `introduce-domain-skills-architecture`).
