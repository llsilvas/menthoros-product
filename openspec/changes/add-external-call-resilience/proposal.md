**Tamanho:** S · **Trilha:** Fast

> Reescrita em 2026-07-26 após sessão de grilling com leitura do código. A versão anterior era
> M · Full (~21 tasks) e incluía circuit breaker (Resilience4j). Três premissas dela não batiam com o
> código; o circuit breaker saiu. Ver "Decisões do grilling" ao final.

## Why

Chamadas que saem do processo podem bloquear **indefinidamente**, e o dano real é maior do que
"segurar uma thread do pool de LLM".

A geração de plano é `@Transactional` (`PlanoServiceImpl.gerarPlanoTreino`) e a chamada ao LLM
acontece **dentro** da transação. O lote roda 4 em paralelo (`app.batch-plan.llm-concorrencia:4`) e
não há configuração de Hikari — pool default de **10 conexões**. Logo, cada chamada pendurada segura
uma conexão de banco, não só uma thread. Com o provider lento, o pool de conexões drena e o que cai
não é a IA: é login, telas do atleta, tudo, por `connectionTimeout`.

O gap deixou de ser teórico. A `add-weekly-review-llm-focus` adicionou um terceiro call site de LLM
sem timeout (`WeeklyFocusModelClient`) e o `/codex:review` de 2026-07-26 apontou o caminho de
degradação: com o `weeklyFocusExecutor` cheio de chamadas penduradas, o retry e o fallback para
template não disparam até o cliente retornar.

**Estado real das integrações** (verificado no código em 2026-07-26 — a versão anterior desta
proposal estava desatualizada):

| Integração | Timeout hoje |
|---|---|
| Keycloak (`KeycloakAdminRestClientConfig`) | ✅ connect 5s / read 10s — **referência** |
| intervals.icu (`IntervalsIcuWebClientConfig`) | ✅ connect 5s / response 10s — já segue a referência |
| Strava (`StravaWebClientConfig`) | ❌ nenhum |
| LLM (5 rotas via `MultiModelConfig`) | ❌ nenhum |

## What Changes

**Timeout de LLM por rota.** O `MultiModelConfig` já expõe 5 `ChatClient` nomeados com `model`/
`temperature`/`maxTokens` por rota (`app.llm.routing`), mas o timeout não vive lá — no Spring AI ele
fica no cliente HTTP do `ChatModel`, e existem só dois (OpenAI e Anthropic). Como `SIMPLE` (foco
semanal) e `PLANO` (geração) são **o mesmo provider**, um timeout no nível do provider acoplaria
justamente o par com maior diferença de latência. Por isso: `ChatModel` próprio por rota, com
`RestClient` de timeout distinto, e um campo `timeout` em `LlmRoutingProperties.RotaLlm`.

Valores iniciais, ancorados nos ~80s típicos documentados para o `PLANO`
(`PlanoResilienceService`) e escalados por `max-tokens`:

| Rota | max-tokens | Timeout |
|---|---:|---:|
| `simple` | 1.000 | 20s |
| `standard` | 2.000 | 30s |
| `complex` | 4.000 | 45s |
| `expert` | 8.000 | 90s |
| `plano` | 12.000 | 120s |

São valores **provisórios por necessidade**: não existe instrumentação de latência por rota hoje (o
`CostTrackingAdvisor` só tem `Counter`, nenhum `Timer`). Daí a decisão de instrumentar na mesma
entrega — o ganho está quase todo na transição de *ilimitado* para *limitado*; a diferença entre 90s
e 120s é marginal perto da diferença entre 120s e infinito.

**Timeout do Strava:** connect 5s / response 10s no código, igual a Keycloak e intervals.icu. Todos
os call sites são endpoints pequenos (`/activities/{id}`, `/activities/{id}/laps`, listagem).

**Timeout não é retentado.** Timeout e 5xx/429 são categorias diferentes, apesar de a versão
anterior desta proposal agrupá-las: 5xx e 429 falham rápido e barato, então retentar é quase de
graça; timeout falha *devagar por definição* — retentar paga o pior caso duas vezes exatamente
quando o sistema já está sob pressão. O `PLANO` já se comporta assim (falha de infra propaga); o
ajuste é tirar timeout do `retryFor` do `WeeklyFocusModelClient`.

**Teto total na geração de plano.** Com `plano` a 120s e o retry de validação de 2 tentativas, o
pior caso seria 240s — os "~4min" que o próprio `PlanoResilienceService` chama de inaceitável. Um
deadline checado antes da 2ª tentativa corta a cauda sem prejudicar o caso comum: a falha que
dispara esse retry é *estrutural* (resposta malformada), e normalmente chega rápido.

**Corte do lote por falhas consecutivas.** Hoje o `BatchPlanProcessor` captura por atleta e
continua. Com o provider fora do ar e 50 atletas na fila, isso vira ~25 minutos segurando 4 conexões
para produzir 50 erros previsíveis. Parar após N falhas consecutivas entrega o comportamento útil de
um circuit breaker exatamente onde ele importa, sem dependência nova.

**Observabilidade:** `Timer` por rota no `CostTrackingAdvisor` (é o ponto que já intercepta toda
chamada) + contador de timeout por rota.

## Non-Goals

- **Circuit breaker / Resilience4j.** O valor de um CB é não pagar o timeout repetidamente, e o
  único ponto onde as chamadas se repetem rápido é o lote — resolvido acima sem dependência nova.
  Caminhos interativos são pontuais (o coach clica uma vez e recebe 503). Keycloak e Strava não têm
  volume que justifique, e o **Strava está em descontinuação** (ADR-0003). **Gatilho de
  reavaliação:** quando existir mais de um caminho repetindo chamadas em rajada, ou volume de
  tenants que torne o desperdício relevante.
- **Tirar a chamada de LLM de dentro da `@Transactional`.** Ataca a causa, mas é refactor de risco
  no fluxo mais crítico do produto. O timeout converte posse ilimitada em posse limitada, que é o
  que torna o problema sobrevivível. Vai para change própria.
- **Reprocessamento de análises `FAILED`.** Change própria (ver Impact).
- **Externalizar os timeouts HTTP** para `app.external.*`: 5s/10s para chamada REST pequena é valor
  que ninguém tuna por ambiente. Só o LLM é externalizado, porque vai ser recalibrado.

## Critérios de aceite

- **CA1** — Dado um provider que não responde, quando uma rota de LLM é chamada, então a chamada
  falha dentro do timeout daquela rota (± margem) e a thread é liberada.
- **CA2** — Dado que `SIMPLE` e `PLANO` têm timeouts distintos, quando ambos são configurados, então
  cada rota respeita o seu (prova de que a granularidade é por rota, não por provider).
- **CA3** — Dado um timeout no foco semanal, quando a chamada falha, então **não** há segunda
  tentativa e a revisão mantém `focusSource = TEMPLATE`.
- **CA4** — Dada uma 1ª tentativa de geração de plano que consumiu mais que o deadline, quando a
  validação a rejeita, então a 2ª tentativa **não** é iniciada e o erro é devolvido.
- **CA5** — Dado o Strava sem responder, quando uma atividade é buscada, então a chamada falha em
  ~10s, não indefinidamente.
- **CA6** — Dadas N falhas consecutivas no lote, quando o limite é atingido, então o job encerra
  como falha em vez de percorrer a fila inteira.
- **CA7** — Dada uma chamada de LLM concluída, quando ela termina, então sua duração é registrada
  como métrica por rota.

## Métrica de sucesso

Nenhuma chamada externa com duração acima do teto da sua rota nas métricas — hoje esse dado não
existe, então a primeira entrega é justamente conseguir medi-lo. Efeito esperado na rotina do
treinador: um provider degradado deixa de derrubar o app inteiro (login e telas do atleta seguem
funcionando), e o coach recebe erro em tempo previsível em vez de tela pendurada.

## Impact

**Código alterado:** `MultiModelConfig` (`ChatModel` por rota), `LlmRoutingProperties.RotaLlm`
(campo `timeout`), `application.yml` (`app.llm.routing.*.timeout`), `StravaWebClientConfig`,
`WeeklyFocusModelClient` (`retryFor`), `PlanoResilienceService` (deadline), `BatchPlanProcessor`
(corte), `CostTrackingAdvisor` (`Timer`).

**Sem dependência nova.** WireMock standalone já é dependência de teste — simular dependência lenta
com `withFixedDelay` não precisa de nada novo.

**Sem impacto em contrato de API:** os status 503/502/429 do `GlobalExceptionHandler` permanecem;
muda o mecanismo que os dispara.

**Changes derivadas:**
1. ✅ **`refactor-llm-call-outside-transaction`** (criada 2026-07-26) — `PlanoServiceImpl` segura
   conexão de banco durante a chamada externa. Esta change limita a posse; aquela desfaz o
   acoplamento.
2. Reprocessamento de análises `FAILED` — hoje `AnaliseStatus.FAILED` é terminal (não há caminho de
   reprocessamento; o listener reage a um evento que já passou), então um blip perde a análise
   daquele treino para sempre. Retentar *mais tarde* é o retry com chance real de funcionar.

## Open Questions & Assumptions

- **Premissa:** os ~80s do `PLANO` são estimativa típica em comentário de código, não p95 medido. O
  p95 real provavelmente está acima. Por isso 120s (e não 90s) — e por isso o `Timer`.
- **Premissa:** os valores das outras 4 rotas são derivados de `max-tokens`, não medidos.
- **Em aberto:** N do corte do lote. Sugestão: 3 falhas consecutivas.
- **Em aberto:** recalibrar os 5 timeouts quando houver ~2 semanas de dado do `Timer`.

## Decisões do grilling (2026-07-26)

Correções de fato à versão anterior desta proposal:

1. "Só o Keycloak tem timeout" — **falso**: o intervals.icu já seguia a referência.
2. "O timeout no `MultiModelConfig` afeta todas as rotas" — **impreciso**: o `MultiModelConfig` já é
   por rota; o timeout é que não mora nele.
3. Task 3.1 pedia retry de transitórias "incluindo timeout" — **invertido**: retentar timeout
   multiplica a janela de exaustão que a change existe para fechar.
4. Task 1.3 pedia externalizar todos os timeouts — **reduzido** ao LLM.
5. Risco descrito como "segura threads" — **subestimado**: segura conexão de banco, e o dano é no
   app inteiro.
