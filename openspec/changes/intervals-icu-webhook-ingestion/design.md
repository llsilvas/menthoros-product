# Design: intervals-icu-webhook-ingestion

Espelha o par `StravaWebhookController` + `StravaWebhookServiceImpl` e reaproveita
`IntervalsIcuActivityIngestionService.importarAtividade` sem alterá-lo. Uma migration aditiva
(tabela de idempotência). O scheduler `IntervalsIcuActivitySyncScheduler` não muda.

## D1 — Rota pública e autenticação em duas camadas

`POST /api/v1/intervals-icu/webhook`, listada em `CoreSecurityProperties.intervalsIcuPaths`
(molde: `stravaPaths`, `asaasPaths`). Sem `@PreAuthorize`, sem JWT, sem `@RequireTenant` — o tenant
vem da integração, não do request.

**Ordem obrigatória das verificações — e onde cada uma vive:**

1. **Filtro** `IntervalsIcuWebhookAuthFilter` (`OncePerRequestFilter`, só para
   `POST /api/v1/intervals-icu/webhook`, molde `PublicRequestSizeLimitFilter`): header
   `Authorization` com `MessageDigest.isEqual` contra `props.getWebhook().getAuthorization()`;
   diferente ou ausente → `401` sem corpo, **sem tocar em `getInputStream()`**. No mesmo filtro,
   `Content-Length` acima de **64 KB** → `413`. **Por que filtro e não controller (pré-mortem):**
   um `@RequestBody`, mesmo `String`, é resolvido *antes* do método — o corpo já teria sido lido
   e parseado por qualquer request sem header. Registrado como `@Bean`/`FilterRegistrationBean`
   numa `@Configuration`, não `@Component`, para não entrar nos `@WebMvcTest` (regra do CLAUDE.md).
2. **Controller**: desserializa o DTO; campo do secret (nome confirmado no gate 0.2) contra
   `props.getWebhook().getSecret()`, em tempo constante. Diferente → `401`. JSON inválido → `400`
   sem chamar o serviço.
3. `200` imediato. Só então `service.handleEventAsync(dto)`.

Nenhum dos dois valores — recebido ou esperado — aparece em log, mensagem de exceção ou resposta.
Teste de contrato com `ListAppender`, igual ao do client.

```java
// IntervalsIcuProperties — acrescentar
@Valid private final Webhook webhook = new Webhook();
@Getter @Setter public static class Webhook {
    @NotBlank private String authorization; // valor literal do campo "Webhook Authorization Header"
    @NotBlank private String secret;        // valor do campo "Webhook Secret", rotacionado
}
```

```yaml
app:
  intervals-icu:
    webhook:
      authorization: ${INTERVALS_ICU_WEBHOOK_AUTHORIZATION:}
      secret: ${INTERVALS_ICU_WEBHOOK_SECRET:}
```

`@NotBlank` nos dois: sem eles o endpoint público aceitaria qualquer coisa e o contexto **não
pode subir**. Mesmo raciocínio do `clientSecret` (D11 da OAuth2). Consequência: os testes de
contexto que já sobrescrevem as sete propriedades passam a precisar de mais duas.

## D2 — DTO e gate 0.2 (payload real)

`IntervalsIcuWebhookEventDto` (record, `@JsonIgnoreProperties(ignoreUnknown = true)`) — campos
**só depois** do gate 0.2. Premissa de trabalho, a confirmar:

```java
public record IntervalsIcuWebhookEventDto(
        @JsonProperty("id") String eventoId,          // existe? único por entrega?
        @JsonProperty("type") String tipo,            // "ACTIVITY_UPLOADED" | "ACTIVITY_ANALYZED" | …
        @JsonProperty("athlete_id") String athleteId, // "i641775"
        @JsonProperty("activity_id") String activityId,
        @JsonProperty("secret") String secret,
        @JsonProperty("created") String created) {}
```

### Gate 0.2 — captura (a), "Enviar webhook de teste", 2026-08-23 07:13 UTC

```http
POST / HTTP/1.1
User-Agent: Java-http-client/21.0.11
Content-Type: application/json
Content-Length: 118
```
```json
{"secret":"***","events":[{"athlete_id":"i641775","type":"TEST","timestamp":"2026-08-23T07:13:17.277+00:00"}]}
```

O que a captura fecha: **o payload é um lote** — `events` é lista, o `secret` fica no envelope, não
no evento; **não há id de evento** (idempotência por hash, o plano B do D3, vira o plano); o tipo
vem como string (`TEST`); `timestamp` ISO-8601 com offset. **Nenhum header `Authorization`** veio
neste request — a confirmar se o campo estava preenchido na tela (se estava, o provedor não manda
no teste ou não manda nunca, e a camada 1 do D1 precisa ser repensada). O campo da atividade não
aparece no `TEST`; fica para a captura (b).

**Consequência para o DTO:** envelope + lista.

```java
public record IntervalsIcuWebhookPayloadDto(String secret, List<IntervalsIcuWebhookEventDto> events) {}
public record IntervalsIcuWebhookEventDto(
        @JsonProperty("athlete_id") String athleteId,
        String type,
        String timestamp,
        @JsonProperty("activity_id") String activityId /* nome a confirmar na captura (b) */) {}
```

Chave de idempotência: `sha256(type|athlete_id|activity_id|timestamp)` **por evento**, não por
request — um lote com N eventos vira N claims.

**Gate 0.2, em duas capturas:** (a) "Enviar webhook de teste" da tela para um request bin; (b) um
upload real de atividade com a URL do bin cadastrada — o teste pode ter shape diferente do evento
real. Registrar aqui os dois payloads (sem o secret) e só então fixar o record. Perguntas que o
gate fecha: nomes dos campos; id de evento; um evento por request ou lote; se o provedor reenvia
quando não recebe 200 (e com que política); se o `Authorization` vai literal.

## D3 — Idempotência por evento

`tb_intervals_icu_webhook_evento_processado` (V81, molde V69):

```sql
CREATE TABLE IF NOT EXISTS tb_intervals_icu_webhook_evento_processado (
    evento_id      VARCHAR(120) PRIMARY KEY,
    tipo_evento    VARCHAR(50)  NOT NULL,
    athlete_id     VARCHAR(50),
    activity_id    VARCHAR(50),
    processado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

`evento_id` = id do provedor se existir; senão `sha256(tipo|athlete|activity|created)` em hex.
**Claim-or-skip sem `@Transactional`** (padrão `WaitlistServiceImpl` / `registerConsent`, e regra
explícita do CLAUDE.md do backend): tenta inserir; `DataIntegrityViolationException` = já em
processamento ou processado → log `debug` e fim. A inserção acontece **antes** do processamento,
então uma entrega duplicada que chegue durante o processamento da primeira também é barrada.

**O claim é liberado em falha (pré-mortem):** se `importarAtividade` lançar para **todas** as
integrações do evento, a linha é apagada no `finally` do serviço — senão uma falha transitória
(429, timeout) viraria "já processado" e a reentrega do provedor seria descartada para sempre. Com
sucesso em pelo menos uma integração, a linha fica. Sem coluna de status: o par
"existe = processado ou em curso / não existe = pode processar" é suficiente porque o dedup por
`externalId` no pipeline torna o reprocessamento seguro.

Por que existe, se o `importarAtividade` já tem dedup por `externalId`: o dedup evita a
**duplicata**, não o **custo** — cada reprocessamento de `UPLOADED` é uma chamada a
`buscarAtividade` (1 da cota de 100/dia). O Strava não tem essa tabela e paga esse custo; aqui a
cota é mais apertada.

Sem limpeza automática nesta change: a tabela cresce ~1 linha por treino. Follow-up se passar
de centenas de milhares.

## D4 — Processamento assíncrono e multi-tenancy

```java
@Async("intervalsIcuWebhookExecutor")
public void handleEventAsync(IntervalsIcuWebhookEventDto evento) {
    if (!"ACTIVITY_ANALYZED".equals(evento.tipo())) { log.info(...); return; }     // CA8, D5
    if (!claim(evento)) { log.debug("repetido"); return; }                          // CA4, D3
    List<IntegracaoExterna> integracoes = integracaoExternaRepository
            .findAllActiveByExternalAthleteIdAndPlataforma(evento.athleteId(), INTERVALS_ICU); // D4 ↓
    if (integracoes.isEmpty()) { log.info("atleta desconhecido"); return; }         // CA5
    boolean algumSucesso = false;
    for (IntegracaoExterna integracao : integracoes) {
        try {
            TenantContext.setTenantId(integracao.getTenantId());
            // late-check: mesma releitura fresca do scheduler (ativo E autoSyncPausado)   // CA10
            ...
            ingestionService.importarAtividade(atletaId, evento.activityId(), tenantId);
            algumSucesso = true;
        } catch (Exception ex) {
            log.warn(...); erroHelper.registrarErro(atletaId, tenantId, erroHelper.mensagemSegura(ex)); // CA9
        } finally {
            TenantContext.clear();
        }
    }
    if (!algumSucesso) liberarClaim(evento);                                        // D3
}
```

**Um atleta em dois tenants (CA6).** `findActiveByExternalAthleteIdAndPlataforma` devolve
`Optional` — com duas integrações ativas para o mesmo `externalAthleteId` em tenants diferentes
(o mesmo corredor em duas assessorias), a query lançaria `IncorrectResultSize` ou escolheria uma
arbitrariamente. Nova query derivada que devolve **lista**; processar cada uma com o próprio
`TenantContext`. O guard de duplicata **dentro** do tenant (D5.1 da ingestão) continua valendo via
`importarAtividade`.

**`registrarErro` e `mensagemSegura`** são os mesmos do scheduler — extrair para um helper
compartilhado (`services/helper/IntervalsIcuSyncErroHelper` ou equivalente) em vez de duplicar. É a
única mudança que encosta no scheduler, e é refactor sem mudança de comportamento (testes dele
seguem verdes).

**Executor** (`IntervalsIcuWebhookAsyncConfig`, molde `StravaWebhookAsyncConfig`): core 2, max 4,
fila **limitada** (256) com **`RejectedExecutionHandler` próprio** — loga `warn` com tipo, atleta
e atividade (nunca o payload inteiro) e incrementa `intervals_icu.webhook.descartado` no
Micrometer. **Não** usar `DiscardPolicy` (descarta em silêncio — achado do pré-mortem) nem
`CallerRunsPolicy` (executaria o import na thread HTTP e derrubaria o 200 imediato). CA11.

## D5 — Só `ACTIVITY_ANALYZED` importa (decidido no pré-mortem)

A versão inicial deste design importava no `UPLOADED` e completava os laps no `ANALYZED` via
`backfillEtapas`. O pré-mortem derrubou as duas premissas, verificadas no código:

- `IntervalsIcuRetrySchedulerImpl` (PT15M) reprocessa **push de treinos planejados**
  (`findAllAguardandoRetryIntervalsIcu`), não laps. `backfillEtapas` só é chamado pelo
  `IntervalsIcuActivityController` (ação manual). **Não há recuperação automática de laps.**
- `backfillEtapas(atletaId, tenantId)` é por atleta e busca **até 50** treinos sem etapas por
  execução (`MAX_POR_EXECUCAO = 50`) — um `ANALYZED` num atleta com passivo estouraria a cota.

Desenho final:

| Evento | Estado do treino | Ação | Fetch |
|---|---|---|---|
| `ACTIVITY_UPLOADED` | — | **não marcado no app**; se chegar, ignorado (CA8) | 0 |
| `ACTIVITY_ANALYZED` | não existe | `importarAtividade` → treino **já com laps** (`intervals=true`) | 1 |
| `ACTIVITY_ANALYZED` (re-análise) | existe | `importarAtividade` dedup no Passo 0 | 0 |
| `ANALYZED` perdido | não existe | scheduler no ciclo seguinte, também com laps | 1 |

Custo da escolha: a latência inclui o tempo da análise do provedor (segundos a poucos minutos).
O gate 0.2 mede esse atraso e confirma que o `ANALYZED` dispara para **todo** upload; se não
disparar, o `UPLOADED` volta ao escopo — com um desenho de laps que hoje não existe.

## D6 — Relação com o scheduler

Inalterado. Papel depois desta change: **fallback e reconciliação** — atividades vindas do Strava
(sem webhook por decisão do provedor), eventos descartados por backpressure, falhas transitórias
no processamento, e qualquer entrega perdida. O cursor do scheduler não sabe nem precisa saber que
o webhook existe: relista a janela, o dedup filtra o que o webhook já trouxe, custo zero.

Consequência prática: depois do webhook, o scheduler passa a encontrar **menos** pendentes por
ciclo para atletas Garmin-direct — a cota por atleta **cai**, não sobe.

## D7 — Ambiente e operação

- **Local não recebe webhook** (sem https público). Desenvolvimento com teste de controller
  (`@WebMvcTest`) e payloads capturados no gate 0.2; smoke no **Railway dev**.
- **Cadastro no app:** rotacionar o secret (task 0.1) → definir o Authorization header → setar as
  duas env no Railway → cadastrar a URL `https://menthoros.up.railway.app/api/v1/intervals-icu/webhook`
  → marcar **só** `ACTIVITY_UPLOADED` e `ACTIVITY_ANALYZED`. Desmarcar a URL desliga na hora.
- **Produção:** mesma sequência com a URL de produção; a env é por ambiente.

## D8 — O que fica igual ao Strava e o que é diferente, de propósito

| | Strava | intervals.icu (esta change) | Por quê |
|---|---|---|---|
| Verificação de subscription (`GET hub.challenge`) | sim | **não** | o provedor não tem handshake; cadastro é na tela |
| Autenticação | `verify_token` só no handshake; POST sem auth | header + secret no corpo, **todo POST** | a rota é pública e o provedor oferece os dois |
| Idempotência por evento | não | **sim**, claim liberado em falha (D3) | cota de 100/dia por atleta |
| Evento que importa | `create` | `ACTIVITY_ANALYZED` (D5) | laps só existem após a análise |
| Autenticação antes do corpo | n/a | filtro (D1) | `@RequestBody` lê antes do método |
| Delete/update | `processDeleteEvent`/`processUpdateEvent` | **fora de escopo** | decisão de produto pendente |
| Lookup do atleta | `findActiveIntegrationByOwnerId` (um) | lista (D4) | um atleta pode estar em dois tenants |
| Fila do executor | `StravaWebhookAsyncConfig` | limitada + descarte com log | CA11 |

## Pre-mortem

**Rodada 1 (Codex, 2026-08-22, no `/change`): NOT READY, 5 achados — todos verificados no código
e todos incorporados.** (1) `@RequestBody String` lê o corpo antes do método → header vai para um
**filtro** (D1) com limite de 64 KB. (2) O retry scheduler reprocessa push, não laps; não há
recuperação automática de laps → **importar só no `ANALYZED`** (D5). (3) Claim antes do
processamento virava perda permanente em falha → **claim liberado no `finally`** (D3).
(4) `DiscardPolicy` é silenciosa → `RejectedExecutionHandler` próprio com log e contador (D4).
(5) `backfillEtapas` faz até 50 fetches por chamada → **nenhum backfill no webhook** (D5).
Rodada 2 no `/implement init`, sobre o D2 fechado pelo gate 0.2.
