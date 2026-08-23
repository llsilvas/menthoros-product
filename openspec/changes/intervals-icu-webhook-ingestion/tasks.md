# Tasks: intervals-icu-webhook-ingestion

Backend `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test` verde; gate de
entrega `./mvnw clean verify`. TDD: teste antes da implementação. Cada task tem uma linha `Verify:`.

Branch: `feature/intervals-icu-webhook-ingestion`, base `develop`. Sequência: Bloco 0 (segredos +
payload real + DoR) precede tudo; Bloco 1 (properties/segurança) e Bloco 3 (idempotência) são
paralelizáveis; Bloco 2 (controller) depende de 1 e do gate 0.2; Bloco 4 (serviço) depende de 2 e 3;
Bloco 5 (smoke no Railway) depende de tudo; QA/entrega por último.

## Bloco 0 — Pré-requisitos e DoR

- [ ] 0.1 **Rotacionar o Webhook Secret do app 663** (o `TF3w-piFpR0` atual foi exposto em captura
      em 2026-08-21 e de novo em 2026-08-22) e **definir o Webhook Authorization Header** — um valor
      aleatório longo. Guardar os dois **só em env** (`INTERVALS_ICU_WEBHOOK_SECRET`,
      `INTERVALS_ICU_WEBHOOK_AUTHORIZATION`), nunca no repo, nunca em captura.
      Verify: tela mostra o secret novo; nenhum dos dois valores aparece em arquivo versionado.
- [x] 0.2 **Gate de contrato real (payload)** — **FECHADO em 2026-08-23**, três capturas num
      request bin (webhook de teste, upload real de meia maratona, e um `CALENDAR_UPDATED`
      espontâneo). O que fechou: payload é **lote** `{secret, events[]}`; **sem id de evento**
      (idempotência por hash); atividade em `events[].activity` (88 campos, **sem laps** — refetch
      permanece); **`Authorization` nunca é enviado**, mesmo com o campo preenchido (camada 1 do D1
      caiu); **`ANALYZED` não dispara no fluxo normal** (só re-análise) e o **`UPLOADED` dispara
      58 ms depois da análise** — gatilho invertido para `UPLOADED` (D5, 2ª reviravolta). Evidência
      integral em design.md D2. **Pendente, não bloqueante:** retry do provedor sem 200 não
      observado — tratado como "sem retry garantido" (o scheduler é o fallback).
      Verify: D2 com os três payloads e o record fixado. Feito.
- [ ] 0.3 DoR (`spec-reviewer`) + pre-mortem cross-model (Codex) sobre proposal/design com o D2
      fechado. Rodada 2 de 2026-08-23: spec-reviewer **NOT READY** (2 blockers — DTO sem o
      `activity` aninhado; property `webhook.authorization` órfã nas tasks — + 2 majors), todos
      corrigidos na mesma data. **Pré-condição registrada pelo founder:** scheduler validado em
      produção.
      Verify: DoR = READY (com ressalvas registradas em "Status").

## Bloco 1 — Properties e rota pública (D1)

- [ ] 1.1 Teste primeiro: `IntervalsIcuPropertiesTest` — `webhook.secret` faz binding; **contexto
      falha** com ele em branco (mesma família do `clientSecret`). **Não existe
      `webhook.authorization`**: o gate 0.2 provou que o provedor nunca envia o header (D1
      revisado). Atualizar `PROPRIEDADES_COMPLETAS` dos testes existentes com a chave nova.
      Verify: teste falha (campo não existe).
- [ ] 1.2 `IntervalsIcuProperties.Webhook` (`@Valid`, `@NotBlank` no `secret`) + chave
      `app.intervals-icu.webhook.secret` em `application.yml`. Conferir que **todos** os testes de
      contexto que sobrescrevem as properties do intervals.icu ganham a nova.
      Verify: 1.1 verde; `./mvnw clean test` verde (nenhum contexto caiu por `@NotBlank`).
- [ ] 1.3 Teste primeiro: `CoreSecurityPropertiesTest` (ou o teste de `SecurityConfig` existente) —
      `/api/v1/intervals-icu/webhook` é pública; `/api/v1/intervals-icu/**` demais continuam
      autenticadas.
      Verify: teste falha.
- [ ] 1.4 Adicionar **`/api/v1/intervals-icu/webhook`** à lista `intervalsIcuPaths` de
      `CoreSecurityProperties` — a lista **já existe** e hoje contém só
      `/api/v1/integracoes/intervals-icu/callback`; é estender, não criar. Conferir o uso na
      `SecurityConfig` (molde `asaasPaths`).
      Verify: 1.3 verde.
- [ ] 1.5 Teste primeiro: `IntervalsIcuWebhookSizeFilterTest` (unitário, `MockHttpServletRequest`)
      — `Content-Length` > 64 KB → 413 e **`getInputStream()` nunca chamado** (request espiado);
      dentro do limite → segue a cadeia; outra rota → segue sem verificar. **Não há verificação de
      header**: o provedor não envia `Authorization` (gate 0.2). Cobre CA2.
      Verify: teste falha (filtro não existe).
- [ ] 1.6 `IntervalsIcuWebhookSizeFilter` (`OncePerRequestFilter`, molde
      `PublicRequestSizeLimitFilter`), registrado via `FilterRegistrationBean` numa
      `@Configuration` (não `@Component` — regra dos slices `@WebMvcTest`).
      Verify: 1.5 verde; `./mvnw clean test` verde (nenhum slice arrastou o filtro).

## Bloco 2 — Controller (D1, D2)

- [ ] 2.1 `IntervalsIcuWebhookEventDto` conforme o payload real do gate 0.2 — record,
      `@JsonIgnoreProperties(ignoreUnknown = true)`, `@Schema` nos campos.
      Verify: teste de desserialização com o payload real capturado (sem secret) → todos os campos.
- [ ] 2.2 Teste primeiro (`@WebMvcTest(IntervalsIcuWebhookController.class)`, o filtro fica fora
      do slice por ser `@Bean`): secret errado ou ausente → 401 sem corpo e **zero** chamadas ao
      serviço; secret certo com lote de **3 eventos** → 200 e `handleEventAsync` chamado **3
      vezes, um evento por chamada, na ordem do lote** (secret validado uma vez); lote vazio → 200
      e zero chamadas; JSON quebrado → 400 sem chamar o serviço; `ListAppender`: o secret não
      aparece em log. Cobre CA3 e o contrato de lote.
      Verify: teste falha (controller não existe).
- [ ] 2.3 `IntervalsIcuWebhookController` — `@Tag(name = "intervals-icu-webhook")`, `@Operation`,
      `@ApiResponses` (200/400/401); `@RequestBody` do envelope; secret em tempo constante uma vez;
      responde 200 e delega **por evento**. Sem verificação de header (não existe — gate 0.2).
      Verify: 2.2 verde.
- [ ] 2.4 Validação: `./mvnw clean test`.

## Bloco 3 — Idempotência por evento (D3)

- [ ] 3.1 Migration `V81__create_tb_intervals_icu_webhook_evento_processado.sql` (molde V69; PK
      `evento_id VARCHAR(120)`, `tipo_evento`, `athlete_id`, `activity_id`, `processado_em`).
      Verify: `./mvnw clean verify` aplica a migration nos `*IT` com Testcontainers.
- [ ] 3.2 Entidade `IntervalsIcuWebhookEventoProcessado` + repositório.
      Verify: compila; `@DataJpaTest` ou uso no 3.4.
- [ ] 3.3 Teste primeiro: `claim(evento)` devolve `true` na primeira vez e `false` na segunda
      (captura `DataIntegrityViolationException`), **sem `@Transactional`** no método — teste que
      falha se alguém anotar (regra do CLAUDE.md "insert-or-ignore"). `liberarClaim(evento)` apaga a
      linha e o `claim` seguinte volta a devolver `true`. Chave = id do provedor, ou hash quando
      ausente (teste dos dois caminhos). Cobre CA4.
      Verify: teste falha.
- [ ] 3.4 Implementar `claim`/`liberarClaim` num helper pequeno (`services/helper`).
      Verify: 3.3 verde.

## Bloco 4 — Serviço assíncrono (D4, D5)

- [ ] 4.1 Extrair `registrarErro` + `mensagemSegura` do `IntervalsIcuActivitySyncScheduler` para um
      helper compartilhado — **refactor sem mudança de comportamento**; os 23 testes do scheduler
      seguem verdes sem edição.
      Verify: `IntervalsIcuActivitySyncSchedulerTest` 23/23 intocado.
- [ ] 4.2 Query derivada `findAllActiveByExternalAthleteIdAndPlataforma(String, FonteDados)` em
      `IntegracaoExternaRepository` (lista, não `Optional`) — D4.
      Verify: usada em 4.4; nome validado no boot do contexto.
- [ ] 4.2b Overload **por atividade** no `IntervalsIcuLapsBackfillService`:
      `backfillEtapas(UUID atletaId, UUID tenantId, String externalId)` — reusa o fetch+persist do
      caminho por atleta, sem o teto de 50; aditivo, o método existente não muda. Teste primeiro no
      `IntervalsIcuLapsBackfillServiceImplTest` existente.
      Verify: testes existentes do backfill intocados e verdes; o novo caminho coberto.
- [ ] 4.3 Teste primeiro (`IntervalsIcuWebhookServiceImplTest`, Mockito, molde do scheduler):
      tipo fora de {`UPLOADED`, `ANALYZED`} (usar `CALENDAR_UPDATED`, observado no gate) → nada
      (CA8); evento repetido → nada (CA4);
      atleta desconhecido → nada (CA5); `UPLOADED` válido → `importarAtividade(atletaId,
      activityId, tenantId)` com `TenantContext` certo e limpo (CA1); dois tenants → duas
      importações, cada uma com o seu tenant (CA6); late-check inativo/pausado → pulado (CA10);
      re-análise de treino existente **com etapas** → dedup, nenhum fetch (CA7); `ANALYZED` de
      treino existente **sem etapas** → `backfillEtapas(atletaId, tenantId, externalId)` por
      atividade (D5); `importarAtividade` lança em **qualquer** integração → `lastSyncError`
      sanitizado via reload e **claim liberado** (CA9/CA4) — inclusive falha em uma de duas
      (regra apertada na rodada 2: a que sucedeu é absorvida pelo dedup na reentrega). Stubs de
      `doThrow` com id específico são `lenient()` — armadilha registrada no scheduler.
      Verify: teste falha (classe não existe).
- [ ] 4.4 `IntervalsIcuWebhookService` + `IntervalsIcuWebhookServiceImpl` (`@Async`, JavaDoc
      Idempotent/Side Effects/Tenant-aware).
      Verify: 4.3 verde.
- [ ] 4.5 `IntervalsIcuWebhookAsyncConfig` — executor `intervalsIcuWebhookExecutor`, core 2, max 4,
      fila 256, **`RejectedExecutionHandler` próprio** (log `warn` com tipo/atleta/atividade +
      contador Micrometer `intervals_icu.webhook.descartado`) — CA11. Teste: fila cheia →
      `execute` não bloqueia nem lança; o descarte aparece no `ListAppender` e no contador.
      Verify: teste verde.
- [ ] 4.6 Validação: `./mvnw clean verify` (migration + `*IT`).

## Bloco 5 — Smoke no Railway dev (D7)

- [ ] 5.1 Setar as duas env no serviço do Railway; deploy da branch (ou do PR) no ambiente de dev;
      cadastrar a URL no app **com `ACTIVITY_UPLOADED` e `ACTIVITY_ANALYZED` marcados**. O founder precisa estar
      conectado ao intervals.icu **no Railway** (banco próprio), não no HomeLab.
      Verify: `POST` sem header → 401; "Enviar webhook de teste" → 200 e log do tipo.
- [ ] 5.2 Upload real (ou apagar um treino do founder no banco de dev e re-sincronizar o relógio):
      `TreinoRealizado` aparece **em minutos, já com etapas** — **≥ 2 uploads reais** (a decisão
      do gatilho apoia-se em 1 amostra; o smoke é onde ela ganha ou perde); linha na tabela de
      eventos; zero duplicata; `lastSyncError` nulo. Medir a latência fim do treino → `criado_em`
      (proxy da métrica de sucesso).
      Verify: evidência (log + banco) registrada aqui com timestamps.
- [ ] 5.3 Backpressure/fallback: desmarcar a URL, fazer um upload, confirmar que o scheduler o
      traz no ciclo seguinte — o fallback está vivo.
      Verify: treino importado com `novas=1` no log do scheduler.

## QA / entrega

- [ ] 6.1 `code-reviewer` (Java/Spring, CLAUDE.md do backend).
- [ ] 6.2 `security-reviewer` — endpoint público: tempo constante, nada de segredo em log/resposta,
      corpo só após o header, multi-tenancy por integração.
- [ ] 6.3 `clean-code-reviewer` + Codex (`review` sem foco; `adversarial` com foco).
- [ ] 6.4 `./mvnw clean verify` verde; abrir PR (`feature/intervals-icu-webhook-ingestion` →
      `develop`).
- [ ] 6.5 Atualizar este `tasks.md` com o que foi entregue vs. adiado antes de arquivar; registrar
      no SPRINTS a trilha intervals.icu fechada (polling + tempo real).

**DoD:** CA1–CA11 cobertos por teste; gate 0.2 documentado em D2 com payload real; secret
rotacionado; `./mvnw clean verify` verde; smoke real no Railway com latência medida; PR mergeado;
change arquivada em `changes/archive/YYYY-MM/`.
