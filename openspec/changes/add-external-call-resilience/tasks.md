# Tasks — add-external-call-resilience (S · Fast · backend)

> Reescrito em 2026-07-26 após grilling. O bloco de circuit breaker (Resilience4j) saiu — ver
> Non-Goals do `proposal.md`. Fechar cada bloco com `./mvnw clean test`. `verify:` = como saber que
> funcionou.

## Estado da entrega (2026-07-27)

**Todas as tasks de código entregues**, em TDD (RED observado antes de cada implementação).
Suíte final: **2215/2215** no `./mvnw clean test`, partindo de 2190 na baseline.

Branch `feature/add-external-call-resilience` em `apps/menthoros-backend`, 6 commits:

| Commit | Escopo |
|---|---|
| `c198ff3` | 1.1 — campo `timeout` por rota |
| `47f0b10` | 1.2/1.3 — teto no cliente HTTP de cada `ChatModel` |
| `dd33d6a` | 2.1/2.2 — timeout do Strava |
| `8e8041b` | 3.1 — foco semanal retenta só 5xx/429 |
| `ab801a9` | 3.1b — `RetryTemplate` próprio (achado, aprovado pelo autor) |
| `04ab1c6` | 3.2/3.3 — orçamento total na geração de plano |
| `42316f1` | 4.1/4.2/4.3 — `Timer` por rota, contador de timeout, corte do lote |

**Um achado mudou o escopo:** o `RetryTemplate` auto-configurado do Spring AI retentava
`ResourceAccessException` (o timeout) até 10× por default, o que anularia o teto por rota da 1.2 —
pior caso de ~20 min na rota `plano`, segurando uma conexão do pool. Corrigido na task 3.1b, com
aprovação explícita do autor por sair do texto original da change.

**Pendente:** 5.2 (teste manual, humano) e o arquivamento. `./mvnw verify` segue vermelho por
defeito **pré-existente** em `Task5p1ControllerIT`, confirmado rodando o mesmo IT em `origin/develop`.

## Anchors reais (verificados em 2026-07-26)

- **Timeout de LLM:** não mora no `MultiModelConfig` (esse já é por rota, com `model`/`temperature`/
  `maxTokens` de `app.llm.routing`). No Spring AI vive no cliente HTTP do `ChatModel`, e existem só
  dois — `OpenAiChatModel` e `AnthropicChatModel`, auto-configurados pelos starters.
- **Topologia:** `SIMPLE` (gpt-4o-mini, foco semanal) e `PLANO` (gpt-4o, geração) são **o mesmo
  provider** — por isso timeout por provider não serve. `COMPLEX` (Sonnet, análise de treino) é
  Anthropic. Mapa em `ModelRouter.route`.
- **Retries existentes, de comportamento oposto:** `PlanoResilienceService` só retenta falha de
  *validação* (infra propaga); `WeeklyFocusModelClient:37` retenta `Exception.class` — timeout
  incluído.
- **Latência:** só o `PLANO` tem número, e é comentário de código (`PlanoResilienceService`, "~80s
  por tentativa"), não p95 medido. `CostTrackingAdvisor` só tem `Counter` — nenhum `Timer`.
- **Já resolvidos, não tocar:** `KeycloakAdminRestClientConfig` (5s/10s) e
  `IntervalsIcuWebClientConfig` (5s/10s).
- **Teste de dependência lenta:** WireMock standalone já está no `pom.xml` — usar `withFixedDelay`.

## 0. Pré-requisitos

- [x] 0.1 Criar branch `feature/add-external-call-resilience` em `apps/menthoros-backend`
  - nota: a branch anterior de mesmo nome foi mergeada em `develop` em 2026-07-27 trazendo **só docs** (ADR-0008 + `CLAUDE.md`), sem código, e apagada. Esta é a branch de implementação.
- [x] 0.2 ~~Levantar p95 via logs/métricas~~ — **substituída, não executada**: não há `Timer` por
  rota, e o único dado é um log de duração do `PLANO` (`IaServiceImpl`). Substituído pela 4.1
  (instrumentar) + valores provisórios da 1.x. **A 4.1 foi entregue**, então o `Timer llm.call.duration`
  por rota já existe: recalibrar os 5 timeouts depois de ~2 semanas de dado real continua sendo a
  ação em aberto, agora com instrumentação para fazê-lo.

## 1. Timeout de LLM por rota

- [x] 1.1 Campo `timeout` (`Duration`, `@NotNull`) em `LlmRoutingProperties.RotaLlm` + valores em
  `app.llm.routing.*.timeout`: `simple` 20s, `standard` 30s, `complex` 45s, `expert` 90s,
  `plano` 120s
  - verify: ✅ `LlmRoutingPropertiesTest` 7/7 (eram 4) — os 5 valores lidos do `application.yml` real, rota sem `timeout` derruba o contexto, e `simple` × `plano` com tetos distintos apesar do mesmo provider. Vizinhos que consomem as mesmas properties conferidos: `MultiModelConfigTest`, `LlmPricingRegistryTest`, `CostTrackingAdvisorTest`. Só o `application.yml` define `routing` — nenhum profile de teste precisou de ajuste.
- [x] 1.2 `MultiModelConfig`: `ChatModel` próprio por rota, com `RestClient` de timeout distinto,
  ligado ao `ChatClient` já existente daquela rota — [CA1, CA2]
  - verify: ✅ `MultiModelTimeoutTest` 3/3 — os dois models apontam para o **mesmo** WireMock com o **mesmo** atraso e um estoura enquanto o outro completa. Timeouts encurtados no teste (300ms × 10s) em vez dos 20s/120s reais; o que se prova é a granularidade, não o número.
  - ⚠️ **Assimetria entre providers descoberta na execução.** `OpenAiChatModel`/`OpenAiApi` expõem `mutate()`, então as rotas OpenAI (`simple`, `expert`, `plano`) são derivadas do bean auto-configurado trocando só o cliente HTTP — tool calling, retry template e observação seguem os do auto-config. `AnthropicApi` e `AnthropicChatModel` **não** têm `mutate()` no Spring AI 1.1.6 e o `Builder` não tem construtor de cópia: as rotas Anthropic (`standard`, `complex`) remontam a API a partir das mesmas `AnthropicConnectionProperties` que o `AnthropicChatAutoConfiguration` usa, preservando `retryTemplate` e `toolCallingManager` por injeção. Se um upgrade trouxer `mutate()`, os dois caminhos convergem — está anotado no código.
  - nota de projeto: a montagem do `ChatClient` saiu para `clienteDeRota()`. Passar os beans a derivar o model quebrou o `MultiModelConfigTest`, que injeta um `ChatModel` mockado para testar o advisor de custo; separar a costura preservou aquele teste sem cliente HTTP.
  - ⚠️ **Limite conhecido:** o teto cobre só o caminho síncrono (`RestClient`). Streaming usa `WebClient` e segue sem teto — nenhuma rota faz streaming hoje.
- [x] 1.3 ✅ `./mvnw clean test` — **2197/2197**, 0 falhas, 0 erros.

## 2. Timeout do Strava

- [x] 2.1 `StravaWebClientConfig`: `HttpClient` (Reactor Netty) com connect 5s + `responseTimeout`
  10s, no código — espelhar `IntervalsIcuWebClientConfig`, que já é a cópia da referência Keycloak.
  **Não** externalizar para `app.external.*` — [CA5]
  - verify: ✅ `StravaTimeoutTest` 2/2, no formato do `IntervalsIcuTimeoutTest`: WireMock com 11s de atraso ⇒ falha antes dos 11s; resposta rápida segue normal. O RED foi observado com a falha certa ("execution timed out after 11000 ms" — a chamada pendurava). Fecha a última integração sem teto.
- [x] 2.2 ✅ `./mvnw clean test` — **2199/2199**.

## 3. Retry e teto total

- [x] 3.1 `WeeklyFocusModelClient`: tirar timeout do `retryFor` (hoje é `Exception.class`), mantendo
  retry para 5xx/429. Timeout falha direto para o fallback de template — [CA3]
  - verify: ✅ `WeeklyFocusModelClientRetryTest` 3/3 — timeout chama o modelo **1×**, `TransientAiException` (5xx/429) chama 2×. RED confirmado antes: o timeout era retentado. O teste precisa do proxy do Spring Retry (`@Retryable` não faz nada em instância criada com `new`), daí o `ApplicationContextRunner` com `@EnableRetry`.
- [x] 3.1b **(achado na execução, aprovado pelo autor)** `LlmRetryConfig`: `RetryTemplate` próprio, porque o do `SpringAiRetryAutoConfiguration` retentava `TransientAiException` **e** `ResourceAccessException` — e o segundo é o timeout. Com `spring.ai.retry` não configurado valia o default de **10 tentativas**: a rota `plano` teria pior caso de 120s × 10 ≈ **20 minutos** segurando uma conexão do pool, o que anularia na prática o teto da 1.2. O bean do auto-config é `@ConditionalOnMissingBean`, então declarar o nosso o desliga; `maxAttempts` e backoff seguem vindo de `spring.ai.retry`.
  - verify: ✅ `LlmRetryConfigTest` 4/4 — timeout não retenta, 5xx retenta até `maxAttempts`, sucesso não retenta, propriedades respeitadas.
  - **Consequência aceita:** erro de transporte deixa de ser retentado, inclusive conexão recusada, que falharia rápido. O `RetryTemplateBuilder` não permite combinar lista de inclusão com exclusão, e ambos chegam como `ResourceAccessException` — não há como distinguir por classe. Entre perder o retry de um blip de conexão e pagar o timeout 10×, escolhemos a primeira.
- [x] 3.2 `PlanoResilienceService`: deadline total checado antes da 2ª tentativa (ponto exato: o
  `if (tentativa >= MAX_TENTATIVAS) break;` do loop). Se o decorrido já passou de ~100s, desiste em
  vez de pagar mais 120s — [CA4]
  - verify: ✅ `PlanoResilienceServiceTest` 6/6 (eram 4) — 1ª lenta ⇒ `gerar` chamado 1× e contador `plano_deadline_estourado`; 1ª rápida ⇒ 2 chamadas e retry normal. Os dois lados testados porque o risco real aqui é regredir o caso comum. O orçamento entra por construtor visível para teste, evitando criar uma property que a spec não pediu.
  - ⚠️ **Regressão causada e corrigida na mesma task:** o construtor de teste deixou o bean ambíguo (dois construtores, nenhum eleito) e o Spring caiu no construtor default inexistente — **128 testes de integração quebraram**. Resolvido com `@Autowired` explícito no construtor de produção.
- [x] 3.3 ✅ `./mvnw clean test` — **2208/2208**.

## 4. Observabilidade e corte do lote

- [x] 4.1 `Timer` por rota no `CostTrackingAdvisor` (ao lado dos `Counter` que já existem) +
  contador de timeout por rota — [CA7]
  - verify: ✅ `CostTrackingAdvisorTest` 10/10 (eram 6), sobre `SimpleMeterRegistry` real: `llm.call.duration` por rota, `llm.timeout` incrementado só em timeout e a exceção propagando, erro comum não contando como timeout, duração registrada também na falha.
  - decisões: a duração é medida **também no caminho de falha** — a chamada que estoura o teto é a que mais interessa medir. Timeout é reconhecido por `SocketTimeoutException` na cadeia de causas, separando estouro de teto de outras falhas de transporte. A tag é só `route`: no caminho de exceção não há `model`, e variar o conjunto de tags do mesmo meter quebraria o registry.
  - ⚠️ **Contrato de teste alterado de propósito:** `ignoraRespostaSemChatResponse` assertava `getMeters()` vazio. Como a duração passa a ser registrada mesmo sem `usage` legível, a asserção virou `containsExactly("llm.call.duration")` — continua provando que nenhuma métrica de custo/token é emitida, sem afrouxar.
- [x] 4.2 `BatchPlanProcessor`: encerrar o job após N falhas consecutivas (**N = 3**) em vez de
  percorrer a fila inteira — [CA6]
  - verify: ✅ `BatchPlanProcessorTest` 11/11 (eram 8) — 5 atletas com provider falhando ⇒ **3** chamadas reais ao LLM e 2 curto-circuitadas; sucesso no meio zera o contador e o lote não é cortado; `plano já existe` não conta como falha (é resultado de negócio — contá-lo abortaria lote legítimo).
  - ⚠️ **Duas divergências do texto da task, que pressupunha um loop sequencial.** (a) Não há loop: os atletas são submetidos de uma vez em virtual threads paralelas, então "consecutivas" virou "falhas sem nenhum sucesso entre elas, na ordem de término" — aproximado por construção, e suficiente para parar um lote condenado. (b) O job encerra como `CONCLUIDO_COM_ERROS`, status terminal já existente, com motivo próprio nos atletas pulados; criar status novo mudaria o contrato de string consumido pelo front, fora do escopo de uma change backend-only.
  - nota de teste: os 2 últimos atletas **não** são stubados de propósito — se o corte falhasse, o motivo viria "não encontrado" e a asserção quebraria. Stubs removidos em vez de `lenient()`, conforme o `CLAUDE.md`.
- [x] 4.3 ✅ `./mvnw clean test` — **2215/2215**.

## 5. Validação final

- [~] 5.1 `./mvnw clean test` ✅ **2215/2215**, 0 falhas, 0 erros. `./mvnw verify` ❌ **falha por defeito pré-existente**: 14 falhas em `Task5p1ControllerIT` (403 onde se espera 200/400).
  - Não assumido: rodei o mesmo IT num worktree de `origin/develop` e deu **exatamente 14 falhas** (19 testes). É defeito da base, sem relação com esta change — o diff não toca segurança nem autorização. `verify` verde depende de consertar aquele IT, que não é escopo daqui.
- [ ] 5.2 Teste manual: atrasar/derrubar uma dependência e confirmar que o erro chega em tempo
  previsível **e que o resto do app segue respondendo** (login e telas do atleta) — é o sintoma que
  motivou a change
  - **PENDENTE — validação humana**, não automatizável aqui.
- [~] 5.3 `tasks.md` atualizado em 2026-07-27 (implementado vs. adiado). **Arquivamento pendente**: depende do 5.2 e do merge em `develop`.

## Derivadas — abrir como changes próprias

- [x] 6.1 Chamada de LLM dentro da `@Transactional` — **change criada:
  `refactor-llm-call-outside-transaction`** (M · Full). O timeout desta change limita a posse da
  conexão, mas não desfaz o acoplamento. Ponto de ruptura calculado: o lote leva `N × 20s`, então em
  **~90 atletas** ele ultrapassa o `recovery-limite-min: 30`, cujo comentário afirma que "nenhum
  lote real dura tanto".
- [ ] 6.2 Reprocessamento de análises `FAILED`: `AnaliseStatus.FAILED` é terminal e o listener reage
  a um evento que já passou, então um blip perde a análise daquele treino para sempre. Retentar
  *mais tarde* é o retry com chance real de funcionar (o de 2s depois, não).
