# Tasks — fix-llm-routing-finops

Repo: `apps/menthoros-backend` (branch `feature/fix-llm-routing-finops`, base `7d88ed1`).
Validação padrão de cada bloco: `./mvnw clean test`.

**Fatos verificados no init (2026-07-08):**
- Spring AI **1.1.6**; advisor = `CallAdvisor.adviseCall(ChatClientRequest, CallAdvisorChain)` (`advisor.api`).
- `AnthropicApi.Usage` **expõe** `cacheCreationInputTokens()`/`cacheReadInputTokens()` — premissa do proposal resolvida; o fallback "só input/output" não será necessário.
- Convenção de properties do repo: classe `@Configuration + @ConfigurationProperties` com Lombok `@Getter/@Setter` (ver `StravaProperties`), prefixo **`app.*`** → usar **`app.llm.routing`** (não `menthoros.llm.routing`).
- Já existe `services/helper/LlmUsageLogger` (log-only, OpenAI, rota plano — change `measure-openai-prompt-cache`): reusar o padrão de extração de native usage; **não remover** o logger (fora do escopo), registrar convergência como follow-up.

## 1. Externalizar roteamento (RISK-01 / ADR-FIN-02)

- [x] 1.1 Criar `config/external/LlmRoutingProperties` no padrão `StravaProperties`: `@Configuration + @ConfigurationProperties(prefix = "app.llm.routing")`, com classes aninhadas por rota (`simple`, `standard`, `complex`, `expert`, `plano`), cada uma com `model`, `temperature`, `maxTokens`.
   - verify: teste de binding carrega valores de um yaml de teste em todos os sub-objetos.
- [x] 1.2 Adicionar bloco `app.llm.routing` no `application.yml` com os valores vigentes (simple: gpt-4o-mini/0.3/1000; standard: claude-haiku-4-5-20251001/0.5/2000; complex: claude-sonnet-4-6/0.7/4000; expert: gpt-4o/8000 — temperatura entra na task 3.1; plano: gpt-4o/0.2/12000).
   - verify: contexto Spring sobe nos testes de integração existentes sem override.
- [x] 1.3 Refatorar `MultiModelConfig` para injetar `LlmRoutingProperties` e construir os 5 beans a partir das properties; qualifiers e assinaturas preservados (`ModelRouter` intocado).
   - verify: `rtk proxy grep -n '"gpt-\|"claude-\|temperature(0\|maxTokens(' src/main/java/br/com/menthoros/backend/config/external/MultiModelConfig.java` retorna vazio; suíte verde.
- [x] 1.4 Validar: `./mvnw clean test`.

## 2. Fonte única de preços (RISK-02)

- [x] 2.1 Criar `src/main/resources/llm-pricing.yml`: por model ID, `input-per-mtok`, `cached-input-per-mtok`, `cache-write-per-mtok`, `output-per-mtok` (USD) + `vigencia`; cobrir gpt-4o-mini, claude-haiku-4-5-20251001, claude-sonnet-4-6, gpt-4o (valores do `docs/llm-pricing-guide.md`).
   - verify: task 2.2 valida via fail-fast.
- [x] 2.2 Criar `ai/cost/LlmPricingRegistry` (`@Component`): carrega o yml no startup (Jackson YAML ou `YamlPropertiesFactoryBean`), expõe `precoDe(modelId)`; no `@PostConstruct`, valida que todo model ID de `app.llm.routing` tem preço — exceção com o nome do modelo na mensagem (critério de aceite 3).
   - verify: teste com modelo ausente lança exceção; teste com yml real passa para as 5 rotas.
- [x] 2.3 Remover do Javadoc de `MultiModelConfig` todos os preços, estimativas e a tabela de alternativas — manter só o propósito de cada rota.
   - verify: `rtk proxy grep -in 'MTok\|USD\|R\$\|preço' .../MultiModelConfig.java` retorna vazio.
- [x] 2.4 Atualizar `docs/llm-pricing-guide.md` (workspace, fora do repo git do backend): nota no topo apontando `apps/menthoros-backend/src/main/resources/llm-pricing.yml` como fonte canônica de preços.
   - verify: leitura manual; sem commit no backend.
- [x] 2.5 Validar: `./mvnw clean test`.

## 3. Semântica de temperatura da rota expert

- [x] 3.1 Definir `app.llm.routing.expert.temperature: 0.2` no `application.yml`, com comentário do porquê (deep-reasoning clínico pede determinismo; 0.8 era semântica criativa).
   - verify: teste do bean `gpt4oClient` com temperatura configurada = 0.2 (critério de aceite 4).
- [x] 3.2 Validar: `./mvnw clean test`.

## 4. Instrumentar cache_hit_rate e custo (pré-decisão de TTL)

- [x] 4.1 Criar `ai/cost/CostTrackingAdvisor` implements `CallAdvisor`: após `chain.nextCall(...)`, extrair usage do `ChatClientResponse` — input/output genéricos via `Usage`, e cache read/write via `getNativeUsage()` com pattern-matching para `AnthropicApi.Usage` (`cacheReadInputTokens`/`cacheCreationInputTokens`) e `OpenAiApi.Usage` (`promptTokensDetails().cachedTokens()`, padrão do `LlmUsageLogger`). Best-effort: falha na extração nunca propaga (mesmo contrato do logger).
   - verify: testes unitários com `ChatClientResponse` stub por provider.
- [x] 4.2 Publicar métricas Micrometer (`MeterRegistry`) com tags `model` e `route`: `llm.tokens.input`, `llm.tokens.output`, `llm.cache.read.tokens`, `llm.cache.write.tokens`, `llm.cost.estimated.usd` (custo via `LlmPricingRegistry`, tarifas de cache read/write aplicadas quando presentes).
   - verify: teste com `SimpleMeterRegistry` assertando contadores e tags.
- [x] 4.3 Registrar o advisor nos 5 beans de `MultiModelConfig` via `defaultAdvisors(...)`, um advisor por rota carregando a tag `route` (factory `CostTrackingAdvisor.paraRota("expert", ...)` ou similar).
   - verify: teste garante advisor presente nos defaults de cada bean.
- [x] 4.4 Testes de borda: resposta sem metadata/usage não incrementa nada nem lança; modelo sem preço no registry não quebra a chamada (custo omitido + WARN).
   - verify: casos cobertos na suíte do advisor.
- [x] 4.5 Validar: `./mvnw clean test` OK; exposição do endpoint `prometheus` adicionada ao `application.yml` (autenticado). Smoke manual do `/actuator/prometheus` com chamada real fica para o pre-deploy (mesma janela do smoke de prompt da progressao-treinos).

## 5. Encerramento

- [x] 5.1 Rodar `./mvnw clean test` completo (critério de aceite 6) — 1285 testes, 0 falhas.
- [x] 5.2 Revisar critérios de aceite 1–5 do proposal contra o código final — todos atendidos (critério 5 exigiu expor o endpoint `prometheus`, autenticado).
- [x] 5.3 Atualizar este `tasks.md` (itens `[x]`, adiados) antes do PR.

> **QA gate (2026-07-08):** code-reviewer + security-reviewer + clean-code-reviewer em paralelo — **zero Critical**.
> Importants corrigidos no commit `b8f4477`: guards de estrutura no parse do `llm-pricing.yml` (mensagens operacionais
> em vez de NPE/ClassCastException), `todasAsRotas()` eliminando o acoplamento do registry aos getters nomeados,
> rounding explícito no cálculo de custo. Duplicação com `LlmUsageLogger` mantida deliberadamente (follow-up abaixo).

## Follow-ups (fora do escopo — não implementar aqui)

- **Aposentar `LlmUsageLogger`** quando o `CostTrackingAdvisor` cobrir a rota plano em produção — gatilho definido no QA: colapsar as duas extrações de usage nesse momento, não antes.
- Decisão de TTL Anthropic após ≥2 semanas de `cache_hit_rate` em produção.
- `add-llm-batch-api` (OpenAiBatchClient, desconto 50%).
- (QA/security Minor) `springdoc.show-actuator: true` expõe a existência do `/actuator/prometheus` na Swagger UI pública — avaliar `false` em produção (config pré-existente, fora do escopo).
- (QA/security Minor) Normalizar a tag `model` das métricas contra as rotas configuradas se os provedores rotacionarem aliases (cardinalidade).
- (QA Minor) Extrair fixtures de teste `rota()`/`routingVigente()` duplicadas em 3 classes de teste.
