# Design: intervals-icu-webhook-ingestion

Espelha o par `StravaWebhookController` + `StravaWebhookServiceImpl` e reaproveita
`IntervalsIcuActivityIngestionService.importarAtividade` sem alterá-lo. Uma migration aditiva
(tabela de idempotência). O scheduler `IntervalsIcuActivitySyncScheduler` não muda.

## D1 — Rota pública e autenticação em duas camadas

`POST /api/v1/intervals-icu/webhook`, listada em `CoreSecurityProperties.intervalsIcuPaths`
(molde: `stravaPaths`, `asaasPaths`). Sem `@PreAuthorize`, sem JWT, sem `@RequireTenant` — o tenant
vem da integração, não do request.

**Ordem obrigatória das verificações — e onde cada uma vive:**

> **Revisado pelo gate 0.2 (2026-08-23): o provedor NÃO envia o header `Authorization`, mesmo com
> o campo preenchido na tela** — confirmado no webhook de teste e no upload real. A "camada 1"
> planejada não existe do lado dele. O que resta, e basta:

1. **Filtro** `IntervalsIcuWebhookSizeFilter` (`OncePerRequestFilter`, só para
   `POST /api/v1/intervals-icu/webhook`, molde `PublicRequestSizeLimitFilter`): `Content-Length`
   acima de **64 KB** → `413` sem tocar em `getInputStream()` (o payload real de um upload tem
   ~2,7 KB; 64 KB dá folga para lotes). É a única defesa antes do parse — mesmo patamar do
   `/asaas/webhook`, e um acima do `/strava/webhook`, que não tem nem secret. Registrado como
   `FilterRegistrationBean` numa `@Configuration`, não `@Component` (regra dos `@WebMvcTest`).
2. **Controller**: desserializa o envelope; `secret` contra `props.getWebhook().getSecret()` em
   tempo constante (`MessageDigest.isEqual`), **uma vez por request**. Diferente ou ausente →
   `401`. JSON inválido → `400` sem chamar o serviço.
3. `200` imediato. Só então, **para cada** `events[i]`, `service.handleEventAsync(evento)` — N
   eventos = N enfileiramentos, N claims, backpressure por evento; a falha de um não contamina o
   lote.

O campo "Webhook Authorization Header" da tela fica **vazio** no app: valor que o provedor ignora
não é defesa, é falsa sensação. A property `webhook.authorization` sai do desenho.

Nenhum dos dois valores — recebido ou esperado — aparece em log, mensagem de exceção ou resposta.
Teste de contrato com `ListAppender`, igual ao do client.

```java
// IntervalsIcuProperties — acrescentar
@Valid private final Webhook webhook = new Webhook();
@Getter @Setter public static class Webhook {
    @NotBlank private String secret; // valor do campo "Webhook Secret" da tela, rotacionado
}
```

```yaml
app:
  intervals-icu:
    webhook:
      secret: ${INTERVALS_ICU_WEBHOOK_SECRET:}
```

`@NotBlank`: sem ele o endpoint público aceitaria qualquer coisa e o contexto **não pode subir**.
Mesmo raciocínio do `clientSecret` (D11 da OAuth2). Consequência: os testes de contexto que já
sobrescrevem as propriedades do intervals.icu passam a precisar de mais uma.

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

### Gate 0.2 — captura (b), upload real (`ACTIVITY_UPLOADED`), 2026-08-23 13:20 UTC

Meia maratona real do founder ("São Paulo Corrida", Garmin Forerunner 970, 21,08 km). O evento
chega com o **objeto `activity` embutido — 88 campos**, o summary completo (inclui
`icu_lap_count: 22`, FC, GAP, dinâmica de corrida), **mas sem `icu_intervals`**: os laps continuam
existindo só no `GET /activity/{id}?intervals=true` — o refetch do pipeline permanece necessário, e
o DTO ignora o objeto embutido além do `id` (não confiar em campo que não vamos re-buscar).

- Campo da atividade: **`events[].activity.id`** (`i178902020`) — não `activity_id` no evento.
- Lote com **1 evento** neste request; a estrutura continua `{secret, events[]}`.
- **Sem header `Authorization` de novo, com o campo preenchido** → o provedor **não envia o header
  em nenhum request**. A camada 1 do D1 cai — ver a revisão do D1.
- `activity.created` 13:20:22 → `analyzed` **13:20:27.550** → webhook enviado **13:20:27.608**:
  o `ACTIVITY_UPLOADED` dispara **depois** da análise (58 ms). E **nenhum `ACTIVITY_ANALYZED`
  chegou em 7h30** — a descrição da tela é literal: *"Existing activity **re**-analyzed"*, só
  re-análise. **Isso inverte o D5 da rodada 1:** o gatilho é o `UPLOADED` (que já vem
  pós-análise); o `ANALYZED` é aceito como secundário.
- Captura (c), 20:52 UTC: chegou um `CALENDAR_UPDATED` — tipo fora do escopo aparecendo na
  prática. O descarte com log (CA8) não é cenário hipotético.

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
neste request, **com o campo preenchido na tela** (confirmado pelo founder). Ou o provedor não o
manda no evento de teste, ou não manda nunca — a captura (b) decide. Se não vier no evento real:
a camada 1 do D1 cai, a autenticação fica **só no secret do corpo**, e o filtro passa a fazer
apenas o limite de tamanho antes do parse — o mesmo patamar em que `/strava/webhook` vive hoje,
sem nem o secret. O campo da atividade não
aparece no `TEST`; fica para a captura (b).

**Consequência para o DTO — fixado pelo payload real (capturas a+b):** envelope + lista, com a
atividade **aninhada** em `events[].activity` (não `activity_id` no evento). Do objeto de 88
campos, o DTO lê **só o `id`** — o resto vem do refetch, e campo que não vamos re-buscar não entra
no contrato. `timestamp` fica **`String`** de propósito: ele só serve à chave de idempotência, e
hash sobre a string crua do provedor é estável por construção — parsear para `Instant` e
re-serializar poderia normalizar o offset (`+00:00` → `Z`) e mudar o hash entre versões de lib.

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public record IntervalsIcuWebhookPayloadDto(String secret, List<IntervalsIcuWebhookEventDto> events) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record IntervalsIcuWebhookEventDto(
        @JsonProperty("athlete_id") String athleteId,
        String type,
        String timestamp,     // ISO-8601 cru, ex.: "2026-08-23T13:20:27.608+00:00" — só para o hash
        Activity activity) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Activity(String id) {}
}
```

Chave de idempotência: `sha256(type|athlete_id|activity.id|timestamp)` **por evento**, não por
request — um lote com N eventos vira N claims. **Nenhuma das três capturas trouxe id de evento do
provedor** — o "id se existir" do D3 é puramente defensivo, o caminho vivo é o hash.

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

**O claim é liberado se QUALQUER integração falhar (pré-mortem r1, apertado na r2):** a versão
anterior ("libera só se todas falharem") quebrava o CA6 — com o mesmo atleta em dois tenants e
falha transitória em um, a reentrega seria descartada e o tenant afetado ficaria só com o
scheduler. Regra final: sucesso em **todas** → claim fica; falha em **ao menos uma** → claim sai, a
reentrega reprocessa, e a integração que já sucedeu é absorvida pelo dedup do pipeline (1 query, 0
HTTP). Sem coluna de status: o par existe/não-existe basta porque o reprocessamento é seguro.

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
    if (!TIPOS_ACEITOS.contains(evento.tipo())) { log.info(...); return; } // UPLOADED, ANALYZED — CA8, D5
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

## D5 — Gatilho: `ACTIVITY_UPLOADED`, com `ACTIVITY_ANALYZED` aceito (revisado 2× por evidência)

Rodada 1 (pré-mortem): "importar no `UPLOADED` e completar laps via backfill" caiu — não existe
recuperação automática de laps e `backfillEtapas` custa até 50 fetches. Rodada 2 (gate 0.2, dado
real): "importar só no `ANALYZED`" caiu também — **o `ANALYZED` não dispara no fluxo normal**
(é só re-análise) e o `UPLOADED` **já é enviado depois da análise** (58 ms depois do carimbo
`analyzed` na captura (b)), então o fetch com `intervals=true` encontra os laps.

| Evento | Estado do treino | Ação | Fetch |
|---|---|---|---|
| `ACTIVITY_UPLOADED` | não existe | `importarAtividade` → treino **com laps** | 1 |
| `ACTIVITY_UPLOADED` (reentrega) | existe | claim (D3) ou dedup do pipeline | 0 |
| `ACTIVITY_ANALYZED` (re-análise) | existe | `importarAtividade` → dedup no Passo 0 | 0 |
| `ACTIVITY_ANALYZED` | existe **sem etapas** (upload veio sem análise) | **backfill por atividade** — overload novo `backfillEtapas(atletaId, tenantId, externalId)` no serviço existente | 1 |
| Qualquer outro tipo (`CALENDAR_UPDATED` observado) | — | ignorado com log (CA8) | 0 |

**Residual da r1 fechado na r2 (pré-mortem):** o dedup do `importarAtividade` retorna cedo e
bloquearia a correção de um treino importado sem etapas. Por isso o `ANALYZED` sobre treino
existente **sem etapas** chama um **backfill por atividade** — overload aditivo
`backfillEtapas(atletaId, tenantId, externalId)` no `IntervalsIcuLapsBackfillService`, reusando o
fetch+persist que já existe, custo 1 fetch, sem o teto de 50 do caminho por atleta. É a função
real do evento secundário. A decisão de gatilho segue apoiada em 1 amostra; o smoke do Bloco 5
exige ≥ 2 uploads reais **com etapas** antes do PR.

Marcar no app: **`ACTIVITY_UPLOADED` e `ACTIVITY_ANALYZED`**. `CALENDAR_UPDATED` desmarcado — é do
lado de push, fora desta change.

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
| Evento que importa | `create` | `ACTIVITY_UPLOADED` (+`ANALYZED` idempotente, D5) | o upload já dispara pós-análise |
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
