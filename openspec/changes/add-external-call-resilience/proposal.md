## Why

As chamadas que saem do processo não estão uniformemente protegidas contra latência e falha em cascata. Estado atual:

- **LLM (OpenAI/Anthropic):** `@EnableRetry` em `LLMConfig` + pool de threads dedicado, mas **sem response timeout** — uma chamada lenta pode segurar uma thread do pool indefinidamente.
- **Keycloak (admin client):** `KeycloakAdminRestClientConfig` define connect 5s / read 10s — **referência correta**.
- **Strava (`WebClient`):** `StravaWebClientConfig` constrói o `WebClient` **sem `responseTimeout`** — chamada pode bloquear sem limite.
- **Nenhuma integração tem circuit breaker** — uma dependência degradada (LLM fora do ar, Keycloak lento) propaga lentidão para o resto do sistema em vez de falhar rápido.

O `GlobalExceptionHandler` já mapeia `LLMException` → 503, `KeycloakIntegrationException` → 502 e `StravaRateLimitException` → 429; falta a camada que **gera** esses sinais de forma controlada quando a dependência está indisponível.

## What Changes

**Timeouts (obrigatório, baixo esforço):**
- `StravaWebClientConfig`: configurar `responseTimeout` (e connect timeout via `HttpClient` do Reactor Netty).
- LLM: impor limite de tempo de resposta às chamadas via `ChatClient` (timeout na borda reativa/bloqueante, alinhado ao `max-tokens`/latência esperada).
- Padronizar os valores de timeout em `application.yml` (`app.external.*.timeout`) em vez de hardcode, mantendo Keycloak como referência.

**Circuit breaker (estrutural — decisão de dependência):**
- Introduzir Resilience4j (`spring-cloud-starter-circuitbreaker-resilience4j` ou starter equivalente) — **dependência nova justificada por esta change** (ver CLAUDE.md raiz: deps só com justificativa e escopo de change).
- Envolver as chamadas a LLM, Keycloak e Strava com circuit breaker + (onde fizer sentido) `TimeLimiter`/bulkhead, configurados por instância nomeada.
- Mapear o estado "circuito aberto" para as exceções já tratadas (`LLMException` / `KeycloakIntegrationException` / `StravaRateLimitException`), preservando os status HTTP atuais.

**Retry (ajuste):**
- Garantir que o retry existente só cobre falhas transitórias (timeout, 5xx, 429), com tentativas limitadas e backoff; nunca retry cego de write não idempotente.

**Observabilidade:**
- Expor métricas de resiliência (timeouts, retries, aberturas de circuito) pelo registry Micrometer/Prometheus já presente.

## Capabilities

### Modified Capabilities

- `llm-integration`: chamadas ao modelo com timeout e isolamento de falha; degradação controlada (fail fast) em vez de bloqueio.
- `strava-integration`: `WebClient` com timeout e circuit breaker.
- `keycloak-integration`: timeouts mantidos + circuit breaker para indisponibilidade.

## Impact

**Código alterado:**
- `config/external/LLMConfig` (ou ponto de criação do `ChatClient`): limite de tempo de resposta.
- `config/external/StravaWebClientConfig`: `responseTimeout` + connect timeout.
- Pontos de chamada a LLM/Keycloak/Strava: anotação/wrapper de circuit breaker.

**Arquivos novos:**
- Configuração do Resilience4j (instâncias nomeadas em `application.yml` + eventual `ResilienceConfig`).

**Dependência nova:**
- Resilience4j (circuit breaker + time limiter). Justificativa: isolar falhas de dependências externas críticas (LLM/Keycloak/Strava) — hoje inexistente.

**Sem impacto em contrato de API:** os status HTTP de erro permanecem (503/502/429); muda o **mecanismo** que os dispara sob falha.

## Riscos e mitigações

- **Timeout muito agressivo corta plano legítimo (LLM lento porém válido)** (impacto Médio): calibrar com base na latência p95 observada de `gerarPlanoSemanal`; tornar configurável por `application.yml`.
- **Circuit breaker mascarar erro real durante ajuste de thresholds** (impacto Médio): começar com thresholds conservadores; observar métricas antes de apertar; logar transições de estado.
- **Dependência nova (Resilience4j) aumenta superfície de config** (impacto Baixo): usar apenas circuit breaker + time limiter; documentar instâncias nomeadas no `application.yml`.
- **Retry sobre operação não idempotente** (impacto Alto se mal feito): auditar cada ponto de retry; restringir a leituras/operações idempotentes (ver JavaDoc de idempotência exigido no CLAUDE.md).
