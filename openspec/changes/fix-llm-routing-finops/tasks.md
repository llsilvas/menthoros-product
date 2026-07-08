# Tasks — fix-llm-routing-finops

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`.

## 1. Externalizar roteamento (RISK-01 / ADR-FIN-02)

- [ ] 1.1 Criar `config/external/LlmRoutingProperties` — record `@ConfigurationProperties(prefix = "menthoros.llm.routing")` com sub-records por rota (`simple`, `standard`, `complex`, `expert`, `plano`), cada uma com `model`, `temperature`, `maxTokens`; habilitar via `@EnableConfigurationProperties` ou `@ConfigurationPropertiesScan`.
- [ ] 1.2 Adicionar bloco `menthoros.llm.routing` no `application.yml` espelhando os valores vigentes (simple: gpt-4o-mini/0.3/1000; standard: claude-haiku-4-5-20251001/0.5/2000; complex: claude-sonnet-4-6/0.7/4000; expert: gpt-4o/—/8000; plano: gpt-4o/0.2/12000). A temperatura de `expert` entra já corrigida na task 3.1.
- [ ] 1.3 Refatorar `MultiModelConfig` para injetar `LlmRoutingProperties` e construir os 5 beans a partir das properties — nenhum literal de modelo/parâmetro remanescente.
- [ ] 1.4 Teste de binding das properties (padrão `unit-test-config-properties`): valores do yaml chegam aos sub-records; ausência de rota obrigatória falha o contexto.
- [ ] 1.5 Validar: `./mvnw clean test`.

## 2. Fonte única de preços (RISK-02)

- [ ] 2.1 Criar `src/main/resources/llm-pricing.yml` com preços por model ID (input, cached-input, output em USD/MTok), cobrindo todos os modelos referenciados em `menthoros.llm.routing`; incluir campo de data de vigência.
- [ ] 2.2 Criar `ai/cost/LlmPricingRegistry` — carrega o yml no startup, expõe `precoDe(modelId)`; lança exceção no startup se algum modelo roteado não tiver preço (fail-fast, critério de aceite 3).
- [ ] 2.3 Remover do Javadoc de `MultiModelConfig` todos os preços, estimativas de custo e tabela de alternativas — manter apenas o propósito de cada rota.
- [ ] 2.4 Atualizar `docs/llm-pricing-guide.md` (workspace): nota no topo declarando `apps/menthoros-backend/src/main/resources/llm-pricing.yml` como fonte canônica de preços; o guia mantém apenas orientação de uso por rota.
- [ ] 2.5 Testes do registry: preço encontrado, modelo ausente (exceção com nome do modelo na mensagem), yml completo para as rotas configuradas.
- [ ] 2.6 Validar: `./mvnw clean test`.

## 3. Semântica de temperatura da rota expert

- [ ] 3.1 Definir `menthoros.llm.routing.expert.temperature: 0.2` no `application.yml`, com comentário do porquê (raciocínio especialista/clínico pede determinismo; 0.8 era semântica de geração criativa).
- [ ] 3.2 Teste garantindo que o bean da rota `expert` usa a temperatura configurada (critério de aceite 4).
- [ ] 3.3 Validar: `./mvnw clean test`.

## 4. Instrumentar cache_hit_rate e custo (pré-decisão de TTL)

- [ ] 4.1 Criar `ai/cost/CostTrackingAdvisor` (Spring AI Advisor): após cada call, extrair usage da resposta — input/output tokens e, no Anthropic, `cache_creation_input_tokens` / `cache_read_input_tokens` do usage nativo. Se a versão do Spring AI não expuser os campos de cache, registrar apenas input/output e documentar o gap como follow-up no proposal.
- [ ] 4.2 Publicar métricas Micrometer com tags `model` e `route`: `llm.tokens.input`, `llm.tokens.output`, `llm.cache.read.tokens`, `llm.cache.write.tokens`, `llm.cost.estimated.usd` (custo via `LlmPricingRegistry`, incluindo tarifa de cache read/write quando aplicável).
- [ ] 4.3 Registrar o advisor nos 5 beans de `MultiModelConfig` (via `defaultAdvisors`), propagando a tag `route` de cada bean.
- [ ] 4.4 Testes do advisor: contadores incrementados com resposta contendo usage; tags corretas; custo calculado com preço do registry; ausência de metadata de cache não quebra o fluxo.
- [ ] 4.5 Validar: `./mvnw clean test` e conferir presença das métricas em `/actuator/prometheus` com a aplicação local.

## 5. Encerramento

- [ ] 5.1 Rodar `./mvnw clean test` completo (critério de aceite 6).
- [ ] 5.2 Revisar critérios de aceite 1–5 do proposal contra o código final.
- [ ] 5.3 Atualizar este `tasks.md` (itens `[x]`, o que foi adiado) antes do PR.
