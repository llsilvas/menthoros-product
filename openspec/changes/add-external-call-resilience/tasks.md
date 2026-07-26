# Tasks — add-external-call-resilience (S · Fast · backend)

> Reescrito em 2026-07-26 após grilling. O bloco de circuit breaker (Resilience4j) saiu — ver
> Non-Goals do `proposal.md`. Fechar cada bloco com `./mvnw clean test`. `verify:` = como saber que
> funcionou.

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

- [ ] 0.1 Criar branch `feature/add-external-call-resilience` em `apps/menthoros-backend`
- [ ] 0.2 ~~Levantar p95 via logs/métricas~~ — **não executável como estava**: não há `Timer` por
  rota, e o único dado é um log de duração do `PLANO` (`IaServiceImpl`). Substituído pela 4.1
  (instrumentar) + valores provisórios da 1.x. Recalibrar depois de ~2 semanas de dado.

## 1. Timeout de LLM por rota

- [ ] 1.1 Campo `timeout` (`Duration`, `@NotNull`) em `LlmRoutingProperties.RotaLlm` + valores em
  `app.llm.routing.*.timeout`: `simple` 20s, `standard` 30s, `complex` 45s, `expert` 90s,
  `plano` 120s
  - verify: contexto sobe; rota sem `timeout` no yml falha rápido na validação (`@Validated` já
    exige as 5 rotas completas)
- [ ] 1.2 `MultiModelConfig`: `ChatModel` próprio por rota, com `RestClient` de timeout distinto,
  ligado ao `ChatClient` já existente daquela rota — [CA1, CA2]
  - verify: teste com WireMock atrasando a resposta prova que `SIMPLE` estoura em ~20s e `PLANO`
    não estoura no mesmo intervalo — **é a asserção que prova granularidade por rota, não por
    provider** (os dois são OpenAI)
- [ ] 1.3 `./mvnw clean test` verde

## 2. Timeout do Strava

- [ ] 2.1 `StravaWebClientConfig`: `HttpClient` (Reactor Netty) com connect 5s + `responseTimeout`
  10s, no código — espelhar `IntervalsIcuWebClientConfig`, que já é a cópia da referência Keycloak.
  **Não** externalizar para `app.external.*` — [CA5]
  - verify: WireMock com atraso > 10s ⇒ a chamada falha em ~10s
- [ ] 2.2 `./mvnw clean test` verde

## 3. Retry e teto total

- [ ] 3.1 `WeeklyFocusModelClient`: tirar timeout do `retryFor` (hoje é `Exception.class`), mantendo
  retry para 5xx/429. Timeout falha direto para o fallback de template — [CA3]
  - verify: teste com WireMock lento ⇒ **uma** chamada ao modelo (não duas) e revisão preservada com
    `focusSource = TEMPLATE`
- [ ] 3.2 `PlanoResilienceService`: deadline total checado antes da 2ª tentativa (ponto exato: o
  `if (tentativa >= MAX_TENTATIVAS) break;` do loop). Se o decorrido já passou de ~100s, desiste em
  vez de pagar mais 120s — [CA4]
  - verify: 1ª tentativa lenta + rejeição na validação ⇒ 2ª tentativa **não** acontece; 1ª tentativa
    rápida + rejeição ⇒ 2ª acontece normalmente (o caso comum não pode regredir)
- [ ] 3.3 `./mvnw clean test` verde

## 4. Observabilidade e corte do lote

- [ ] 4.1 `Timer` por rota no `CostTrackingAdvisor` (ao lado dos `Counter` que já existem) +
  contador de timeout por rota — [CA7]
  - verify: asserção sobre `SimpleMeterRegistry` real, como já se faz no `WeeklyFocusNarrativeService`
- [ ] 4.2 `BatchPlanProcessor`: encerrar o job após N falhas consecutivas (sugestão: 3) em vez de
  percorrer a fila inteira — [CA6]
  - verify: lote com N+2 atletas e provider sempre falhando ⇒ job encerra como falha após N, e as
    gerações restantes **não** são tentadas
- [ ] 4.3 `./mvnw clean test` verde

## 5. Validação final

- [ ] 5.1 `./mvnw clean test` + `./mvnw verify` verdes
- [ ] 5.2 Teste manual: atrasar/derrubar uma dependência e confirmar que o erro chega em tempo
  previsível **e que o resto do app segue respondendo** (login e telas do atleta) — é o sintoma que
  motivou a change
- [ ] 5.3 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar conforme o `CLAUDE.md` raiz

## Derivadas — abrir como changes próprias

- [ ] 6.1 Chamada de LLM dentro da `@Transactional` (`PlanoServiceImpl.gerarPlanoTreino`): a
  transação — e portanto uma conexão do pool de 10 — fica aberta durante a chamada externa. O
  timeout limita a posse, mas não desfaz o acoplamento.
- [ ] 6.2 Reprocessamento de análises `FAILED`: `AnaliseStatus.FAILED` é terminal e o listener reage
  a um evento que já passou, então um blip perde a análise daquele treino para sempre. Retentar
  *mais tarde* é o retry com chance real de funcionar (o de 2s depois, não).
