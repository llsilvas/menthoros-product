**Tamanho:** S · **Trilha:** Fast

## Why

A revisão de arquitetura/FinOps da camada multi-modelo apontou quatro problemas em `MultiModelConfig` (backend) que degradam manutenibilidade e impedem decisões de custo baseadas em dados:

1. **RISK-01 / ADR-FIN-02 — Model IDs hardcoded**: os IDs de modelo (`gpt-4o-mini`, `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `gpt-4o`) e seus parâmetros (temperature, maxTokens) estão fixos no código. Trocar um modelo (deprecação de snapshot, ajuste de custo) exige recompilação e deploy, e não há como variar por ambiente.
2. **RISK-02 — Preços duplicados em Javadoc**: preços e estimativas de custo vivem em comentários de `MultiModelConfig` e em `docs/llm-pricing-guide.md`. Preço em Javadoc envelhece silenciosamente e nenhum código consome esses valores — não há fonte única legível por máquina.
3. **Semântica de temperatura invertida no bean deep-reasoning**: `gpt4oClient` (rota `EXPERT` — análise de lesões, casos clínicos, síntese especialista) usa `temperature(0.8)`, valor de geração criativa. Raciocínio especialista/clínico pede determinismo (baixa temperatura), como o próprio bean de plano (`gpt4oPlanoClient`, 0.2) já faz.
4. **Decisão de TTL Anthropic sem dados**: os beans Claude usam `AnthropicCacheTtl.ONE_HOUR` (write a 2x o preço de input) sem nenhuma métrica de cache hit. Sem instrumentar `cache_hit_rate`, não dá para saber se o TTL de 1h se paga versus o de 5min (write a 1,25x).

## What Changes

- **Novo** `config/external/LlmRoutingProperties` (`@ConfigurationProperties`, prefixo `menthoros.llm.routing`): model ID, temperature e maxTokens por rota (`simple`, `standard`, `complex`, `expert`, `plano`), com bloco correspondente no `application.yml` espelhando os valores atuais.
- **Refatorar** `MultiModelConfig` para consumir `LlmRoutingProperties` — nenhum model ID ou parâmetro literal permanece no código.
- **Novo** `src/main/resources/llm-pricing.yml`: fonte única de preços (input, cached input, output, por MTok USD) por model ID.
- **Novo** `ai/cost/LlmPricingRegistry`: carrega `llm-pricing.yml` no startup, expõe preço por model ID e falha rápido se um modelo roteado não tiver preço cadastrado.
- **Remover** todos os preços e estimativas de custo do Javadoc de `MultiModelConfig` (fica só o propósito de cada rota); `docs/llm-pricing-guide.md` passa a apontar `llm-pricing.yml` como fonte canônica.
- **Corrigir** a temperatura da rota `expert` (deep-reasoning) de 0.8 para 0.2, alinhada à semântica de raciocínio determinístico.
- **Novo** `ai/cost/CostTrackingAdvisor` (Spring AI Advisor) registrado nos beans de `MultiModelConfig`: extrai usage de cada resposta (input/output tokens; cache read/write tokens no Anthropic) e publica métricas Micrometer (`llm.tokens.*`, `llm.cache.*`, `llm.cost.estimated.usd`) com tags `model` e `route`, usando `LlmPricingRegistry` para o custo estimado. O `cache_hit_rate` é derivável no Prometheus como `cache_read / (input + cache_read)`.

## Non-Goals

- **Não** alterar o TTL de cache Anthropic — `ONE_HOUR` permanece até termos ≥2 semanas de métricas de `cache_hit_rate` (a decisão de TTL é follow-up desta change).
- **Não** criar `OpenAiBatchClient` / integração com Batch API — escopo explícito de uma change futura.
- **Não** trocar nenhum modelo nem alterar parâmetros além da temperatura da rota `expert`.
- **Não** alterar `ModelRouter`, contratos de API ou schema de banco.

## Capabilities

### New Capabilities
- `llm-cost-observability`: métricas de tokens, cache e custo estimado por rota/modelo, com preços em fonte única versionada.

### Modified Capabilities
- Roteamento multi-modelo passa a ser configurável por ambiente (properties), sem mudança de comportamento além da temperatura da rota `expert`.

## Critérios de aceite

1. **Given** o backend inicializado, **When** inspeciono `MultiModelConfig.java`, **Then** não existe nenhum model ID, temperature, maxTokens, preço ou estimativa de custo literal no arquivo (código ou Javadoc).
2. **Given** um override `menthoros.llm.routing.expert.model=gpt-4.1` em um profile, **When** o contexto sobe, **Then** o bean `gpt4oClient` usa o modelo do override sem recompilação.
3. **Given** o startup da aplicação, **When** um model ID configurado em `menthoros.llm.routing` não existe em `llm-pricing.yml`, **Then** a aplicação falha rápido com mensagem indicando o modelo sem preço.
4. **Given** a rota `expert`, **When** leio a configuração efetiva, **Then** `temperature=0.2`.
5. **Given** uma chamada LLM concluída via qualquer bean de `MultiModelConfig`, **When** consulto `/actuator/prometheus`, **Then** existem contadores de tokens de input/output (e cache read/write para Anthropic) e custo estimado em USD, com tags `model` e `route`.
6. **Given** a suíte de testes, **When** executo `./mvnw clean test`, **Then** todos os testes passam, incluindo os novos de binding de properties, registry de preços e advisor.

## Métrica de sucesso

- 100% das chamadas LLM roteadas por `MultiModelConfig` com custo estimado registrado em métrica — habilitando a decisão de TTL Anthropic (follow-up) com dados reais em vez de suposição, e dando ao time visibilidade de custo por operação do coach.

## Open Questions & Assumptions

- **Origem dos IDs**: RISK-01, RISK-02 e ADR-FIN-02 referenciam uma revisão de arquitetura/FinOps externa não versionada no workspace. Premissa: os quatro pontos desta change capturam integralmente os achados relevantes dessa revisão.
- **Premissa — temperatura 0.2 para `expert`**: assume-se que a semântica correta de deep-reasoning é determinismo (0.2, igual à rota `plano`). Validar em QA que a qualidade das análises de lesão não degrada.
- **Premissa — Spring AI expõe cache tokens**: assume-se que a versão de Spring AI em uso expõe `cache_creation_input_tokens` / `cache_read_input_tokens` no usage nativo das respostas Anthropic. Se não expor, o advisor registra input/output e o `cache_hit_rate` fica pendente de upgrade da lib (registrar como follow-up na task).
- **Em aberto — decisão de TTL**: será tomada em change futura após ≥2 semanas de coleta de `cache_hit_rate`.
- **Em aberto — Batch API**: `OpenAiBatchClient` (desconto de 50% para jobs noturnos) fica para change própria (`add-llm-batch-api`, não criada ainda).

## Impact

- **Repo afetado:** apenas `apps/menthoros-backend`.
- **Código Java:** `config/external/MultiModelConfig.java` (refactor), novos `config/external/LlmRoutingProperties`, `ai/cost/LlmPricingRegistry`, `ai/cost/CostTrackingAdvisor`.
- **Recursos:** `application.yml` (novo bloco `menthoros.llm.routing`), novo `llm-pricing.yml`.
- **Docs:** `docs/llm-pricing-guide.md` (nota apontando a fonte canônica).
- **Sem impacto em:** `ModelRouter` (assinaturas preservadas), controllers, DTOs, banco, contratos de API.
