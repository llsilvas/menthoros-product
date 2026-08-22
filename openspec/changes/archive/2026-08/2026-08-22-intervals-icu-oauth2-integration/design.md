# Design: intervals-icu-oauth2-integration

**Criado:** 2026-08-16 · **Trilha:** Full · **Tamanho:** M
**Repos:** `apps/menthoros-backend`, `apps/menthoros-front`
**Revisado:** 2026-08-21 — gate de DoR. Decisões **D11 a D15** acrescentadas ao final, todas
originadas de achados do Codex confirmados contra o código.

Este documento registra as decisões de desenho e, principalmente, **o que foi verificado contra a
API real** — a versão anterior da proposta assumiu o contrato do Strava por analogia e errou em
três pontos que teriam produzido código que compila e não funciona.

---

## D1 — Basic → Bearer é um ponto único de mudança

**Decisão:** trocar `headers.setBasicAuth("API_KEY", apiKey)` por `headers.setBearerAuth(token)` em
`IntervalsIcuClientImpl` (método `basic()`). **[DoR 2026-08-21]** Nenhum call site muda de dado ou
de ordem de argumentos; os *nomes públicos* mudam — `validarApiKey` → `validarToken` e o parâmetro
`apiKey` → `token`. (A redação anterior dizia "nenhuma assinatura de método muda", o que
contradizia o `proposal.md` e o `tasks.md`.)

**Por quê é seguro:** os seis pontos que usam a credencial já a obtêm da mesma forma —
`conexao.getAccessToken()` — e a repassam ao client como `String`:

| Call site | Operação |
|---|---|
| `IntervalsIcuAdapter:55` | push — criar evento |
| `IntervalsIcuAdapter:89` | push — atualizar evento |
| `IntervalsIcuAdapter:124` | push — deletar evento |
| `IntervalsIcuActivityIngestionServiceImpl:130` | import — buscar atividade |
| `IntervalsIcuLapsBackfillServiceImpl:73` | backfill de laps |
| `IntervalsIcuClientImpl.validarApiKey` | validação da credencial |

A entidade `IntegracaoExterna` já chama o campo de `accessToken` — o nome sempre foi o correto; era
o *conteúdo* que era uma API key. Isso é o que torna esta change M e não L: o mecanismo de auth
muda, a topologia não.

**Consequência aceita:** a troca é global e instantânea. No deploy, uma row que guarda uma API key
passa a ser enviada como `Bearer <api key>`, que o provedor rejeita com 401. Não há como suportar
os dois formatos sem uma flag por row — e criar essa flag seria construir a convivência que a
decisão do founder explicitamente descartou. Ver D6.

## D2 — State assinado (HMAC), não `atletaId` cru

**Decisão:** o `state` é `<atletaId>.<epochSeconds>.<HMAC-SHA256(clientSecret)>`, validado no
callback com TTL de 10 minutos e comparação de MAC em tempo constante.

**Por quê não copiar o Strava:** `StravaAuthController.callback` faz `UUID.fromString(state)` e
confia. Isso é aceitável lá porque quem dispara a autorização é o **técnico** e a superfície é
interna; ainda assim é frágil. Aqui o fluxo é self-service do atleta e o callback é público por
definição — sem assinatura, qualquer um que descubra um `atletaId` monta o callback com um `code`
obtido da **própria** conta intervals.icu e vincula a conta dele ao registro de outro atleta. O
efeito não é vazamento de dado do Menthoros, mas é poluição de dado de treino de terceiro, que é
pior de detectar do que um erro barulhento.

**Por quê HMAC e não tabela de state:** stateless resolve multi-instância sem migration, sem
limpeza de registros expirados e sem uma segunda fonte de verdade. O `clientSecret` já está no
ambiente e já é secreto — não introduz material novo a proteger.

**Fora de escopo, deliberadamente:** corrigir o `state` do fluxo Strava. É dívida pré-existente e
mexer nele aqui misturaria duas changes.

## D3 — `refreshToken` e `tokenExpiraEm` ficam `null`, e isso é o contrato

**Decisão:** não implementar refresh flow. Persistir `accessToken`, `scopes` e `externalAthleteId`;
deixar `refreshToken` e `tokenExpiraEm` nulos, com JavaDoc explicando.

**Por quê:** a resposta do token endpoint é
`{ "token_type", "access_token", "scope", "athlete" }` — **não há `refresh_token` nem `expires_in`**.
O token não expira por tempo. A proposta anterior mandava popular `tokenExpiraEm` com
`Instant.ofEpochSecond(expires_in)` a partir de um campo que não existe: o código teria persistido
`null` ou estourado NPE, dependendo do parser.

**Por quê a JavaDoc é obrigatória e não decorativa:** os campos existem na entidade (o Strava os
usa) e um leitor futuro vai encontrá-los vazios e "consertar". O comentário registra que o vazio é
o contrato do provedor, não um bug.

**Como o token morre, então:** o atleta revoga no intervals.icu, ou o app é desconectado. Nos dois
casos o provedor passa a responder 401, o caminho de erro já existente (`IntervalsIcuApiException`
+ `lastSyncError`) registra, e o atleta reconecta. Não há renovação a automatizar.

## D4 — Escopos: `ACTIVITY:READ,CALENDAR:WRITE`

**Decisão:** pedir os dois desde o primeiro dia.

**Por quê os dois:** `ACTIVITY:READ` é o que a ingestão precisa, e foi o único que a proposta
anterior previu. Mas o **push de treinos planejados ao relógio já roda em produção** desde
2026-07-14 (`criarEvento`/`atualizarEvento`/`deletarEvento`/`listarEventos`) e é escrita no
calendário. Subir com só `ACTIVITY:READ` deixaria o canal validado quebrado, e o sintoma
apareceria apenas na primeira aprovação de plano depois do deploy — longe da causa.

**Escopos disponíveis, para referência:** `ACTIVITY`, `WELLNESS`, `CALENDAR`, `CHATS`, `LIBRARY`,
`SETTINGS`, cada um com `:READ` ou `:WRITE` (write implica read). Não pedir `WELLNESS` nem
`SETTINGS` — nada no código os consome hoje, e escopo pedido a mais é atrito na tela de
autorização e superfície desnecessária.

## D5 — Callback fora do `me/`, e por quê

**Decisão:** `GET /api/v1/integracoes/intervals-icu/callback` (público) fica **fora** do prefixo
`/api/v1/integracoes/me/intervals-icu` (autenticado).

**Por quê:** o `me/` resolve o atleta pelo JWT. O callback chega do browser do atleta redirecionado
pelo provedor, e **não tem garantia de JWT** — daí o state assinado carregar a identidade (D2).
Manter os dois sob o mesmo prefixo obrigaria a abrir um buraco de `permitAll` dentro de uma árvore
que hoje é inteiramente autenticada, o que é exatamente o tipo de exceção que se esquece depois.

Segurança declarada em lista própria (`intervalsIcuPaths`), sem renomear `stravaPaths` — mesmo
princípio de diff mínimo já aplicado quando o Strava foi liberado.

## D6 — Remoção da API key: o breaking change é o desenho, não um efeito colateral

**Decisão do founder (2026-08-16):** OAuth substitui a API key. Não há convivência.

**O que quebra:** toda `IntegracaoExterna` com `plataforma=INTERVALS_ICU` existente guarda uma API
key. A partir do deploy ela é enviada como Bearer e o provedor devolve 401 — push e import param
para esses atletas até que cada um reconecte.

**O que torna isso aceitável:** a base do pilot é pequena e conhecida, e não existe caminho técnico
para converter uma API key em token OAuth — a reconexão seria manual em qualquer desenho. A
alternativa (conviver) foi avaliada e descartada pelo founder: manteria dois caminhos de auth, dois
fluxos de UI e dois conjuntos de teste indefinidamente, para poupar um clique de um punhado de
atletas uma única vez.

**Consequência operacional que faz parte da entrega:** backend e front **sobem juntos**. Sem o
botão novo no front, o atleta cuja key parou de funcionar não tem por onde reconectar — o campo de
colar a key terá sido removido. Deploy do backend isolado transforma um atrito de um clique em uma
indisponibilidade.

## D7 — Desconectar revoga no provedor, best-effort

**Decisão:** `DELETE` local passa a chamar `DELETE /api/v1/disconnect-app` no provedor antes do
soft-disconnect. Falha na chamada remota é logada e **não** impede a desconexão local.

**Por quê best-effort:** a intenção do atleta é sair. Se o provedor estiver fora do ar, travar a
desconexão local deixaria o Menthoros continuar tentando usar um token que o atleta já quis
descartar — pior dos dois mundos. O inverso (revogar remoto e falhar local) não acontece porque a
ordem é remoto → local.

## D8 — Sem migration, reusando `IntegracaoExterna`

Nenhuma coluna nova. `accessToken` passa a guardar um token OAuth, `scopes` deixa de ser sempre
`null`, `externalAthleteId` continua vindo do provedor (agora do campo `athlete.id` da resposta do
token, em vez de `GET /athlete/0`). Rollback não deixa resíduo em banco — mas **não é neutro**: as
conexões OAuth feitas no meio-tempo param, na direção inversa do mesmo problema de D6.

## D9 — O hook de pausa do Strava é preservado, não reimplementado

`IntervalsIcuConnectionServiceImpl.pausarStravaAutomaticamente` (decisão D5.2 de
`intervals-icu-activity-ingestion`) continua sendo chamado no caminho novo, com a mesma regra
monotônica: só seta `autoSyncPausado=true`, nunca reverte. Conectar o intervals.icu por OAuth tem
exatamente o mesmo efeito cross-fonte que conectar por API key tinha — o gatilho mudou de forma,
não de significado.

## D10 — A troca do `code` é síncrona no callback

O `code` expira em **2 minutos**. Isso descarta qualquer desenho que enfileire a troca (evento
assíncrono, retry com backoff longo). A troca acontece no próprio handler do callback; falha é
falha, e o atleta refaz a autorização — que custa um clique, ao contrário do retry.

---

## D11 — O `clientSecret` é material criptográfico, e o boot precisa tratá-lo assim

**Decisão:** `@Validated` + `@NotBlank` em `IntervalsIcuProperties`. Configuração incompleta derruba
o contexto no boot.

**Por quê isso não é higiene de config:** em D2, o `clientSecret` deixou de ser apenas a credencial
do token endpoint e virou **a chave do HMAC do state**. O `application.yml` traz
`${INTERVALS_ICU_CLIENT_SECRET:}` — default vazio, seguindo o padrão do Strava. A composição das
duas coisas é o problema: com secret vazio, a chave do HMAC é `""`, conhecida por qualquer um, e o
state assinado — a defesa inteira desta change — passa a ser forjável para qualquer `atletaId`.

**O que torna isso pior que um bug comum:** não há sintoma. O fluxo funciona de ponta a ponta,
conecta atletas, e passa em qualquer teste feliz. Só um atacante nota a diferença. Um erro de
configuração precisa falhar barulhento, e o único momento barulhento disponível é o boot.

**Por quê `StravaProperties` não é precedente:** ele também não valida nada, e está certo em não
validar — o state do Strava é um UUID cru, não assinado. Lá o secret vazio quebra a troca de token
com um 401 imediato e visível. Aqui ele abre um buraco silencioso. Mesma ausência de validação,
consequências opostas.

## D12 — O vínculo `externalAthleteId` é verificado onde ele nasce, não onde é usado

**Decisão:** o guard D5.1 (`findOtherActiveByExternalAthleteIdAndPlataformaAndTenantId`, que **já
existe** no repositório) roda dentro de `exchangeCodeForToken`, antes de persistir.

**Por quê o guard atual não basta:** ele só é chamado em
`IntervalsIcuActivityIngestionServiceImpl`, ou seja, **no import**. O push de treino planejado
(`IntervalsIcuAdapter`) lê `conexao.getAccessToken()` e escreve no calendário sem verificação
nenhuma. Se dois atletas do mesmo tenant autorizarem a mesma conta intervals.icu, os dois passam a
receber treino planejado no mesmo calendário e no mesmo relógio — e isso acontece **antes** de
qualquer import rodar, então a defesa existente nunca dispara a tempo.

**Por quê no callback:** é o único ponto do sistema onde o vínculo atleta ↔ conta externa é criado.
Verificar no consumo significa espalhar a mesma checagem por todo call site futuro e depender de
ninguém esquecer. Verificar na origem é uma chamada, num lugar só.

**Cuidado de implementação:** o filtro do repositório é `atleta.id <> :atletaId`, então
**reconexão do próprio atleta não é bloqueada** — só o vínculo cruzado. O teste 7.7 cobre os dois
lados justamente porque um guard que barra a reconexão legítima seria pior que a ausência dele.

**A ordem dentro do método é parte da decisão, não detalhe de implementação.** O guard roda depois
de parsear a resposta do token (precisa do `athlete.id`) e **antes** de qualquer busca ou mutação de
`IntegracaoExterna`. O motivo é JPA: uma entidade obtida por `findBy...` é *managed*, e mutá-la a
persiste no flush do commit **sem `save()` explícito**. Somado a D14 — que manda o callback nunca
lançar, tornando provável um service que devolve resultado tipado em vez de exceção —, o retorno
normal **commita**. Se o guard rodasse depois da mutação, CA12 ("nada é persistido") dependeria de
um rollback que nunca aconteceria. A garantia vem da ordem.

## D13 — Desconectar zera tudo, não só o token

**Decisão:** `desconectar` limpa `accessToken`, `refreshToken`, `scopes`, `tokenExpiraEm`,
`externalAthleteId` e `lastSyncError`.

**Por quê:** o método existente limpa apenas os dois primeiros. Isso já era incompleto, mas com
OAuth passa a ter uma consequência mensurável: a métrica de sucesso desta change conta conexões
OAuth por `scopes != null`, e um atleta desconectado continuaria contado como conectado. O
equivalente do Strava (`StravaOAuthServiceImpl.disconnect`) já limpa `scopes` e `tokenExpiraEm` —
a inconsistência entre os dois caminhos é dívida, não decisão.

**`externalAthleteId` também sai** porque, com D12, uma row inativa que guarda o id externo é um
registro sem função que só pode confundir uma auditoria futura.

## D14 — O callback é uma superfície de redirect, não uma API

**Decisão:** todo caminho do callback termina em 302 — `success` ou `error`. Nenhum produz 4xx/5xx.

**Por quê não copiar o Strava:** `StravaAuthController.callback` faz `UUID.fromString(state)` sem
try/catch. Um state malformado lança `IllegalArgumentException` e o handler global devolve erro
HTTP. Quem está do outro lado é **o browser do atleta**, não um cliente de API: ele veria uma
página de erro em vez de voltar ao Menthoros. E CA3/CA4 exigem redirect explicitamente, então o
molde não atende os critérios desta change.

**Consequência de desenho:** o handler traduz falha em redirect e registra a causa no log — nunca
na URL, que é visível na barra do browser e no histórico (CA10). Isso vale inclusive para o `code`,
que não é token mas é credencial de troca.

## D15 — A remoção da API key vem antes da troca para Bearer

**Decisão:** fundir o antigo Bloco 6 no Bloco 2, com a remoção primeiro.

**Por quê a ordem importa:** na sequência anterior, o Bloco 2 trocava o header para Bearer e o
`POST` de conexão por API key só era apagado no Bloco 6. Entre os dois commits existe um estado em
que o endpoint continua publicado, aceita um corpo `{apiKey}`, persiste a key — e o client já a
envia como Bearer, que o provedor rejeita. O endpoint estaria anunciando um formato que ele próprio
já quebrou.

**Por quê isso passaria despercebido:** cada bloco passa no seu próprio gate isoladamente. O estado
quebrado só existe *entre* eles, que é exatamente o tipo de defeito que validação por bloco não vê.
Como os blocos são checkpoints de commit, e não deploys, o risco real é baixo — mas o custo de
inverter a ordem é zero.

---

## Contrato verificado (2026-08-16)

| Item | Valor |
|---|---|
| Authorize | `GET https://intervals.icu/oauth/authorize?client_id=&redirect_uri=&scope=&state=` |
| Token | `POST https://intervals.icu/api/oauth/token` — `client_id`, `client_secret`, `code` |
| Resposta | `{ token_type: "Bearer", access_token, scope, athlete: { id, name } }` |
| Chamadas | `Authorization: Bearer <access_token>` |
| Revogação | `DELETE https://intervals.icu/api/v1/disconnect-app` (Bearer) |
| Athlete id | `0` referencia o atleta autenticado |
| Client ID | `663` (app aprovado por David em 2026-08-02) |
| Rate limits | 2500/15min · 8000/dia · **100/usuário/dia** · 10 chamadas/s por IP |

**Três correções contra a versão anterior da spec:** `token-uri` tem `/api` no caminho; não há
`refresh_token` nem `expires_in`; escopos são maiúsculos e separados por vírgula.

---

## Riscos residuais

- **Redirect URI de produção não registrada** (Médio, **confirmado vazio em 2026-08-16 — task 0.1**):
  o campo "Redirect URLs" do app 663 está em branco e o provedor não aceita wildcard. `http://localhost/*`
  é sempre aceito, então o fluxo **passa em local e falha em produção** se ninguém registrar. Deixou
  de ser gate externo: é editável na própria tela do app, sem depender do David.
- **`http://localhost/*` pode não cobrir a porta** (Baixo, task 0.2): o dev roda em `:8099`. Se o
  wildcard for por host e não por origem, o fluxo local falha com sintoma de bug de código.
- **Site e Política de Privacidade são placeholders `example.com`** (Médio, task 0.3): aparecem na
  tela de consentimento do atleta. Não bloqueia o código, bloqueia o uso por gente real.
- **Escopo insuficiente descoberto tarde** (Médio, mitigado por D4 + task 9.2): o smoke exercita
  push **e** import, nessa ordem, justamente porque cada um valida um escopo diferente.
- **Rollback não é neutro** (Médio, aceito): ver D8.
- **Sem lock/idempotência no callback** (Baixo): dois callbacks concorrentes com states válidos do
  mesmo atleta convergem para a mesma row (find-or-create na unique `(atleta_id, plataforma)`); o
  perdedor sobrescreve com um token igualmente válido. Sem dano.

## Estratégia de teste

- **Signer** (Bloco 3.2): round-trip, assinatura adulterada, expirado, malformado — nenhum caminho
  pode lançar para fora do `Optional`.
- **Service** (7.1): a asserção que importa é *negativa* — state inválido **não persiste nada**.
- **Client** (7.2): asserção explícita de que o header é `Bearer` em todas as operações. É o teste
  que impede alguém de reverter D1 sem perceber.
- **Callback** (7.4): `*IT`, com `jwt()` post-processor onde houver JWT — **nunca**
  `@WithMockUser`, que não popula o `TenantContext` e produz 403 por dois motivos ao mesmo tempo
  (ver `CLAUDE.md` do backend).
- **Gate final** (9.1): `./mvnw clean verify`, não `test` — esta change cria `*IT`, que o Surefire
  não executa.
