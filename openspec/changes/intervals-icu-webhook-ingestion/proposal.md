# Proposal: intervals-icu-webhook-ingestion

**Tamanho:** M · **Trilha:** Full (**endpoint público novo** — rota sem JWT em `CoreSecurityProperties`,
autenticada pelo segredo do provedor; **tabela nova** de idempotência de eventos; processamento
assíncrono cross-tenant. Qualquer um dos três sobe para Full pelo `config.yaml`. Backend-only, zero
front.)

## Status

- Proposta inicial (2026-08-22, `/change`) — escrita **no mesmo dia** em que
  `intervals-icu-activity-sync-scheduler` foi entregue e arquivada. O `SPRINTS.md` previa abrir esta
  change só com o scheduler validado em produção; o founder decidiu abrir a spec agora — a
  validação em produção vira **pré-condição do `/implement init`**, não da escrita.
- Contrato do provedor lido da tela **Settings → Manage App** do app 663 (captura de 2026-08-22),
  porque a documentação pública não descreve o webhook. O que a tela **não** mostra (formato do
  payload) fica para o **gate 0.2**, com o botão "Enviar webhook de teste".
- **Product review (2026-08-22, `product-reviewer`): Refine**, 6 achados — incorporados: métrica
  primária passou a ser da rotina do coach (feedback no mesmo dia), a "fração via webhook" saiu da
  métrica e virou observabilidade, o non-goal de delete/update ganhou a consequência explícita
  (treino apagado no provedor fica no Menthoros), a base conectada hoje foi declarada (1 atleta),
  o indicador de UI virou follow-up, e a ordem relativa às outras changes ficou registrada em
  "Prioridade".
- **Pre-mortem cross-model (Codex, 2026-08-22): NOT READY**, 5 achados — **2 derrubaram premissas
  minhas, verificadas no código:** o `IntervalsIcuRetrySchedulerImpl` reprocessa *push*, não laps
  (não há recuperação automática de laps em lugar nenhum), e `backfillEtapas` é por atleta com até
  **50 fetches** por execução. Consequência: **o desenho mudou — importar só no
  `ACTIVITY_ANALYZED`**, quando os laps já existem; nada de backfill no webhook. Os outros três
  (corpo lido antes do header com `@RequestBody String`; claim de idempotência que vira perda
  permanente em falha; `DiscardPolicy` é silenciosa) foram incorporados em D1/D3/D4.
- **DoR rodada 2 (2026-08-23):** `spec-reviewer` NOT READY (2 blockers: DTO sem o `activity`
  aninhado; property `webhook.authorization` órfã) + Codex NOT READY (4 achados: spec/tasks ainda
  com o contrato de header morto; treino sem etapas ficava órfão — virou backfill por atividade;
  claim global quebrava o retry multi-tenant — liberado em qualquer falha; lote sem contrato — N
  eventos = N enfileiramentos). **Todos incorporados na mesma data.**
- **Premissas validadas com o founder (2026-08-22):** escopo só de ingestão (delete/update fora);
  smoke no **Railway dev com banco próprio** (o founder precisa conectar o intervals.icu lá); um
  atleta em dois tenants é hipótese, **tratada mesmo assim**.

## Prioridade

**Base conectada hoje: 1 atleta** (o founder), alimentando o intervals.icu direto do Garmin. Ou
seja: a urgência é baixa e a change é **preparação para o pilot**, não correção de dor medida. O
product review recomenda sequenciar **depois** de `coach-meta-intensidade-editor` (desbloqueada
hoje, mexe em decisão do coach) e de `refactor-llm-call-outside-transaction` (prioridade alta,
dívida com prazo). Pré-condição do `/implement init` mantida: scheduler validado em produção. A
ordem final é do founder, no SPRINTS.

## Why

O scheduler entregue hoje dá cobertura completa, mas com **latência de até 2h** entre o treino
chegar ao intervals.icu e aparecer no Menthoros. Para o coach que revisa o treino do atleta logo
depois da sessão — o cenário do Coach Insight (`WorkoutAnalysisListener`) — 2h é a diferença entre
comentar enquanto o atleta ainda lembra e comentar no dia seguinte.

O provedor passou a suportar webhooks para apps OAuth. Com eles, o treino de quem alimenta o
intervals.icu **direto do relógio** (Garmin, Polar, Suunto, Coros) aparece em minutos. O scheduler
continua sendo o caminho para quem alimenta **via Strava** — a tela do provedor é explícita:
*"activity webhooks are not delivered for Strava activities"* — e a rede de segurança para
qualquer evento perdido. Mesmo par que `StravaWebhookServiceImpl` + `StravaActivitySyncScheduler`
formam hoje.

Valor para o coach: feedback no mesmo dia, sem ação dele e sem ação do atleta.

## O que a tela do provedor diz (fonte primária, 2026-08-22)

- **Webhook URLs** — lista de URLs, cada uma com checkbox; *"URLs must be https"*; *"Please untick
  URLs you are not using"*.
- **Webhook Secret** — *"Included in the payload so you can verify that the webhook came from
  Intervals.icu"*. **O secret vai no corpo**, não em header. O valor atual (`TF3w-piFpR0`) é o
  mesmo exposto em captura em 2026-08-21 (task 0.4 adiada de `intervals-icu-oauth2-integration`):
  **rotacionar é pré-requisito**, não task adiada.
- **Webhook Authorization Header** — campo livre; o valor é enviado como header `Authorization` em
  toda chamada. Dá um **segundo segredo, verificável antes de parsear o corpo**.
- **14 tipos de evento**, com o escopo OAuth exigido por cada um. Interessam à ingestão:
  `ACTIVITY_UPLOADED` (*New activity uploaded*, escopo ACTIVITY) e `ACTIVITY_ANALYZED` (*Existing
  activity re-analyzed*). O app já tem `ACTIVITY:READ`. **Os dois são marcados; o gatilho é o
  `UPLOADED`** — ver item 6 e o histórico de reviravoltas no D5.
- Nota da tela: *"activity webhooks are not delivered for Strava activities. Please use
  CALENDAR_UPDATED and not CALENDAR_EVENT_UPDATED or CALENDAR_EVENT_DELETED"* — a segunda parte é
  para o lado de **push** (treinos planejados), fora desta change.
- Botão **"Enviar webhook de teste"** — permite capturar o formato do payload sem esperar um upload.

## What Changes (backend `apps/menthoros-backend`)

1. **Rota pública `POST /api/v1/intervals-icu/webhook`** — nova lista `intervalsIcuPaths` em
   `CoreSecurityProperties`, no molde de `stravaPaths`/`asaasPaths`. Responde **200 em
   milissegundos** e processa fora da thread do request (`@Async`, executor próprio com fila
   limitada, molde `StravaWebhookAsyncConfig`). **Nunca** devolve 5xx por falha de processamento:
   o provedor já recebeu o 200 e o scheduler cobre o que falhar.
2. **Autenticação em duas camadas, ambas obrigatórias:** (a) header `Authorization` igual a
   `app.intervals-icu.webhook.authorization`, verificado num **filtro** (`OncePerRequestFilter`
   restrito à rota, molde `PublicRequestSizeLimitFilter`) — comparação em tempo constante e
   **antes de qualquer leitura do corpo** (um `@RequestBody`, mesmo `String`, já teria lido); o
   mesmo filtro rejeita corpo acima de 64 KB com 413. Diferença → **401 sem corpo e sem log do
   valor**; (b) campo do secret no payload igual a `app.intervals-icu.webhook.secret`, no
   controller. Os dois nascem `@NotBlank` — subir sem eles derruba o contexto, pelo mesmo motivo do
   `clientSecret` (D11 da OAuth2).
3. **DTO `IntervalsIcuWebhookEventDto`** — campos definidos pelo gate 0.2 (payload real). Premissa
   a confirmar: tipo do evento, id do atleta (`i641775`), id da atividade (`i178232809`), secret.
4. **Idempotência por evento, como claim** — `tb_intervals_icu_webhook_evento_processado` (V81,
   molde V69 do Asaas): chave = id do evento se o provedor mandar um; senão, hash de (tipo, atleta,
   atividade, instante). O claim é inserido **antes** de processar (barra a entrega duplicada que
   chega durante o processamento) e **removido se o processamento falhar** — assim uma reentrega
   do provedor, ou o scheduler, reprocessa. O Strava não tem isso e reprocessa tudo; aqui o custo
   de reprocessar é **cota** (1 fetch por evento), então a tabela paga por si.
5. **Processamento** (`IntervalsIcuWebhookServiceImpl`): tipo fora de {`ACTIVITY_UPLOADED`,
   `ACTIVITY_ANALYZED`} →
   log e fim; `externalAthleteId` sem integração ativa → log e fim; para **cada** integração ativa
   e não pausada com esse `externalAthleteId` (um atleta pode existir em dois tenants — ver D4),
   `TenantContext` por integração e `importarAtividade(atletaId, activityId, tenantId)` — o
   mesmo pipeline do import manual e do scheduler, com dedup, modalidade, TSS/TSB e reconciliação.
6. **O gatilho é `ACTIVITY_UPLOADED`; `ACTIVITY_ANALYZED` é aceito como secundário.** O gate 0.2
   mostrou com dado real que (a) o `UPLOADED` **já dispara depois da análise** (58 ms após o
   carimbo `analyzed`), então o fetch com `intervals=true` traz os laps; e (b) o `ANALYZED` **não
   dispara no fluxo normal** — é só re-análise ("Existing activity **re**-analyzed"). Importar só
   no `ANALYZED`, como a rodada 1 do pré-mortem sugeriu, significaria **nunca** importar. 1 fetch
   por treino, zero backfill; re-análises caem no dedup (0 fetch). Residual com evidência no D5.
7. **Scheduler inalterado** — continua a cada 2h como fallback e reconciliação. Zero diff nele.
8. **Operação:** marcar `ACTIVITY_UPLOADED` e `ACTIVITY_ANALYZED` no app; a URL é a do ambiente
   **com https público** (Railway dev primeiro; local não recebe webhook — ver D7).

### Fora de escopo

- **`ACTIVITY_DELETED` / `ACTIVITY_UPDATED`** — apagar ou reescrever um `TreinoRealizado` por
  evento externo é decisão de produto (o treino pode ter reconciliação, kudos, Coach Insight).
  Hoje o Strava faz `processDeleteEvent`; replicar isso sem decidir o que acontece com o que
  pendurou no treino seria copiar sem pensar. Change própria. **Consequência explícita, aceita no
  pilot:** um treino apagado ou corrigido pelo atleta no provedor **continua como estava** no
  Menthoros — o scheduler só importa, nunca apaga nem reescreve. Não é temporário: só muda com
  a change própria.
- **`APP_SCOPE_CHANGED` / `CONNECTED_SERVICE`** — desativar a integração quando o atleta revoga
  o app é útil e barato, mas é outro fluxo (conexão, não ingestão). Follow-up registrado.
- **`CALENDAR_UPDATED`** — lado de push (treinos planejados editados pelo atleta no provedor).
  Change própria, na trilha de push.
- **Atividades vindas do Strava** — o provedor não dispara; cobertas pelo scheduler.
- **Budget de cota compartilhado** — residual já aceito em `intervals-icu-activity-sync-scheduler`
  D4.1; o webhook custa 1 fetch por evento novo, dentro do mesmo `1 + N`.
- **Retry próprio de eventos que falharam** — não há fila; o claim liberado em falha deixa a
  reentrega do provedor (se houver) e o scheduler reprocessarem.
- **Backfill de laps no webhook** — descartado pelo pré-mortem (até 50 fetches por chamada). O
  caso "upload sem análise" é residual documentado no D5, não observado no dado real.
- **Front** — nada.

## Critérios de aceite

- **CA1 — Upload vira treino em segundos, já com etapas:** Given atleta com integração
  intervals.icu ativa e não pausada, When o provedor entrega `ACTIVITY_UPLOADED` válido para uma
  atividade de corrida ainda não importada, Then o `TreinoRealizado` (`fonteDados=INTERVALS_ICU`)
  existe **com as etapas** (o evento dispara pós-análise — gate 0.2), reconciliado, sem ação do
  coach nem do atleta — e o request recebeu **200 antes** de o processamento terminar.
- **CA2 — Corpo grande é barrado antes do parse:** Given `Content-Length` acima de 64 KB, When
  chega à rota, Then **413** sem desserializar e sem processamento. (A verificação de header caiu
  no gate 0.2: o provedor não envia `Authorization` — a autenticação é o CA3.)
- **CA3 — Secret do envelope é a autenticação:** Given secret do corpo ausente ou diferente, When
  chega à rota, Then **401**, nada processado, secret fora do log; validado **uma vez por
  request**, e um lote de N eventos vira **N** processamentos independentes.
- **CA4 — Idempotência por evento, sem perda em falha:** Given o mesmo evento entregue duas vezes
  (mesma chave), When os dois chegam, Then o processamento roda **uma** vez e o segundo é
  registrado como repetido — zero fetch extra. Given o processamento falhou em **qualquer** das
  integrações do atleta (inclusive uma de duas, no caso de dois tenants), When a mesma entrega
  chega de novo, Then ela **é** processada — o claim foi liberado, e a integração que já sucedera
  é absorvida pelo dedup.
- **CA5 — Atleta desconhecido não é erro:** Given `externalAthleteId` sem integração ativa em
  nenhum tenant, When o evento chega, Then 200, log em `info`, nenhum fetch.
- **CA6 — Um atleta, dois tenants:** Given o mesmo `externalAthleteId` com integração ativa em
  dois tenants, When um `ACTIVITY_UPLOADED` chega, Then o treino é importado **nos dois**, cada
  um com o `TenantContext` do próprio tenant, limpo ao final.
- **CA7 — `ANALYZED` completa ou não custa:** Given treino já importado **com etapas**, When um
  `ACTIVITY_ANALYZED` chega (re-análise), Then não há segundo `TreinoRealizado` e nenhuma chamada
  ao provedor. Given treino importado **sem etapas**, Then as etapas passam a existir via backfill
  **por atividade** (1 fetch) — é a função do evento secundário.
- **CA8 — Tipo não suportado é ignorado:** Given evento de tipo fora de {`ACTIVITY_UPLOADED`,
  `ACTIVITY_ANALYZED`} — um `CALENDAR_UPDATED` real chegou durante o gate 0.2 —, When chega
  autenticado, Then 200, log, nenhum processamento.
- **CA9 — Falha no processamento não volta ao provedor:** Given `importarAtividade` lança (429,
  modalidade, credencial), When o evento é processado, Then a resposta já foi 200, a falha fica em
  log e em `lastSyncError` da integração (sanitizada, ≤ 500), e o scheduler reprocessa no próximo
  ciclo.
- **CA10 — Late-check de pausa/inatividade:** Given integração `ativo=false` ou
  `autoSyncPausado=true` no momento do processamento, When o evento é processado, Then é pulado
  com log, sem fetch.
- **CA11 — Backpressure não derruba o app nem some em silêncio:** Given a fila do executor
  cheia, When chega mais um evento, Then a rota continua respondendo 200, o evento é descartado por
  um `RejectedExecutionHandler` **próprio** que loga `warn` com tipo/atleta/atividade e incrementa
  um contador Micrometer (a `DiscardPolicy` padrão é silenciosa) — nunca bloqueia a thread HTTP
  nem propaga exceção. O scheduler cobre.

## Métrica de sucesso

- **Primária, da rotina do coach: % de treinos de atletas Garmin-direct que recebem Coach Insight
  ou kudos no mesmo dia** em que foram feitos — hoje o treino das 7h só entra no Menthoros até as
  9h (e até as 19h se o ciclo falhar), e o coach que olha o dashboard de manhã não o vê. Meta:
  subir de forma mensurável nas semanas após o deploy, para os atletas cobertos.
- **Proxy técnico: latência análise → treino visível** (p50), de **até 120 min** para **< 5 min**,
  medida entre `start_date` + duração da atividade e `criado_em` do `TreinoRealizado`. É o que dá
  para medir no dia do deploy; a primária precisa de semanas.
- **Guardrails:** zero duplicata, zero 5xx devolvido ao provedor, zero evento descartado por
  backpressure fora de pico.

*(Observabilidade, não métrica: a fração de treinos que entrou via webhook vs. scheduler, por
atleta, é telemetria de cobertura para engenharia — o coach não vê nem age sobre ela.)*

## Open Questions & Assumptions

- **Aberto, gate 0.2 — formato do payload.** A tela não mostra. Capturar com "Enviar webhook de
  teste" apontando para um request bin **e** com um upload real (o teste pode ter shape
  diferente). Perguntas: nome do campo do secret; id do evento (existe? é único por entrega?);
  id do atleta (`i…`) e da atividade; tipo do evento como string; timestamp; se vem um batch ou um
  evento por request.
- **Aberto, gate 0.2 — retry do provedor.** Se não responder 200, ele reenvia? Com que política?
  Define se a idempotência é "nice to have" ou obrigatória.
- ~~Aberto — `ACTIVITY_ANALYZED` dispara para todo upload?~~ **FECHADO pelo gate 0.2: não
  dispara** (só re-análise). E o `UPLOADED` já vem pós-análise. Gatilho invertido — ver D5.
- **Assumido — `ACTIVITY_ANALYZED` pode vir mais de uma vez** (re-análise manual). Tratado como
  idempotente e barato pelo dedup do pipeline.
- **Follow-up de UI (product review):** a ficha do atleta não diz se ele sincroniza em tempo real
  (webhook) ou a cada 2h (scheduler) — o coach não tem como calibrar "por que ainda não vi o
  treino de hoje?". Registrar no Radar; não é desta change.
- **Assumido — o `Authorization` header configurado na tela é enviado literalmente.** Se a tela
  prefixar (`Bearer …`), a comparação tem de ser do valor inteiro. Confirmar no gate 0.2.
- **Assumido — `findActiveByExternalAthleteIdAndPlataforma` devolve `Optional`** e precisa de uma
  variante que devolva **lista** (um atleta em dois tenants). Ver D4.
- **Pré-condição do `/implement init`:** scheduler validado em produção (o `SPRINTS.md` exigia isso
  para abrir a change; o founder moveu o gate para o `init`).
- **Pré-condição operacional:** rotacionar o Webhook Secret **antes** de cadastrar a URL (task
  0.4 herdada da OAuth2) e definir o valor do Authorization header — ambos em env, nunca no repo.
- **Ambiente:** local (`:8099`) não recebe webhook (sem https público). O smoke é contra o
  **Railway dev** (`menthoros.up.railway.app`), com a URL cadastrada no app e desmarcada depois.

## Riscos e mitigações

- **Endpoint público** (Alto, mitigado): duas camadas de segredo, comparação em tempo constante,
  401 sem corpo, sem log de valores; corpo só é parseado depois do header. Rate limit de rede
  fora de escopo (mesmo estado do `/strava/webhook` e do `/asaas/webhook`).
- **Secret exposto** (Alto, **pré-requisito**): rotacionar antes de cadastrar qualquer URL.
- **Replay** (Médio, mitigado): claim por evento + dedup por `externalId` no pipeline — replay
  custa no máximo 1 linha na tabela de eventos, zero fetch.
- **Tempestade de eventos** (Médio, mitigado): executor com fila limitada e handler de rejeição
  próprio, com log e contador (CA11); o scheduler é o retry. Nunca bloquear a thread HTTP.
- **Corpo lido antes da autenticação** (Alto, corrigido pelo pré-mortem): `@RequestBody`, mesmo
  `String`, consome o corpo antes do método. A verificação do header vive num **filtro** e há
  limite de tamanho — sem isso, um atacante sem o header força o parse de qualquer payload.
- **Perda permanente por claim em falha** (Alto, corrigido pelo pré-mortem): registrar o evento
  antes de processar e nunca liberar transformaria uma falha transitória em "já processado".
  O claim é removido na falha (D3).
- **Cota** (Médio, residual): 1 fetch por treino novo; re-análise é 0 fetch. Sem backfill no
  webhook. Mesmo residual do scheduler.
- **`ANALYZED` perdido** (Baixo, coberto): o treino entra no ciclo seguinte do scheduler, **já com
  laps** (o fetch do scheduler também pede `intervals=true`).
- **Um atleta em dois tenants** (Baixo, tratado): processar todas as integrações ativas, não a
  primeira — ver D4.

## Rollback

Aditiva: reverter o PR remove rota, serviço, DTO e executor; desmarcar a URL no app interrompe a
entrega na hora, sem deploy. A tabela V81 fica (vazia ou com histórico) — sem efeito. Nenhum
`TreinoRealizado` criado por webhook difere de um criado pelo scheduler.
