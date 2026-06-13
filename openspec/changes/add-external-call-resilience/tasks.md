## Pré-requisitos

- [ ] 0.1 Criar branch `feature/add-external-call-resilience` em `apps/menthoros-backend`
- [ ] 0.2 Levantar latência p95 atual de `gerarPlanoSemanal` e das chamadas Strava/Keycloak (logs/métricas) para calibrar timeouts

## 1. Timeouts (sem dependência nova)

- [ ] 1.1 `StravaWebClientConfig`: configurar `HttpClient` (Reactor Netty) com connect timeout + `responseTimeout`; injetar no `WebClient.builder()`
- [ ] 1.2 LLM: impor limite de tempo de resposta às chamadas via `ChatClient` (timeout na borda) alinhado ao p95 + margem
- [ ] 1.3 Externalizar timeouts para `application.yml` sob `app.external.{llm,strava,keycloak}.*-timeout`, mantendo Keycloak (5s/10s) como referência
- [ ] 1.4 Teste: simular dependência lenta (mock/stub) e verificar que a chamada falha por timeout dentro do limite, sem segurar thread
- [ ] 1.5 `./mvnw clean test` verde

## 2. Circuit breaker (Resilience4j)

- [ ] 2.1 Adicionar dependência Resilience4j (starter de circuit breaker) ao `pom.xml` — commit `chore` isolado com justificativa
- [ ] 2.2 Definir instâncias nomeadas (`llm`, `keycloak`, `strava`) em `application.yml`: sliding window, failure-rate threshold, wait-duration-in-open-state, slow-call-threshold
- [ ] 2.3 Envolver as chamadas a LLM, Keycloak e Strava com circuit breaker (+ `TimeLimiter` onde a chamada for reativa)
- [ ] 2.4 Mapear circuito aberto → `LLMException` / `KeycloakIntegrationException` / `StravaRateLimitException` (preservar status 503/502/429 do `GlobalExceptionHandler`)
- [ ] 2.5 Teste: forçar abertura do circuito (N falhas consecutivas) e verificar fail-fast + exceção/status corretos
- [ ] 2.6 `./mvnw clean test` verde

## 3. Retry (ajuste do existente)

- [ ] 3.1 Auditar todos os pontos com retry (`@EnableRetry`/retry template); restringir a falhas transitórias (timeout, 5xx, 429)
- [ ] 3.2 Confirmar que nenhum write não idempotente é retried cegamente (cruzar com o JavaDoc de idempotência dos serviços)
- [ ] 3.3 Garantir backoff + teto de tentativas

## 4. Observabilidade

- [ ] 4.1 Expor métricas Resilience4j (circuit breaker state, calls, slow calls) e de timeout/retry via Micrometer/Prometheus
- [ ] 4.2 Logar transições de estado do circuito (CLOSED→OPEN→HALF_OPEN) em nível WARN/INFO com contexto

## 5. Validação final

- [ ] 5.1 `./mvnw clean test` + `./mvnw verify` verdes
- [ ] 5.2 Teste manual: derrubar/atrasar uma dependência (ex.: LLM) e confirmar fail-fast com status correto, sem degradar o restante do sistema
- [ ] 5.3 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar a change conforme regra do CLAUDE.md raiz
