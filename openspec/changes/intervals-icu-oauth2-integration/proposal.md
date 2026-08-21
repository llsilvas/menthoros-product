# intervals-icu-oauth2-integration — Fluxo OAuth2 com Intervals.icu

**Tamanho:** M · **Trilha:** Full (backend + front + remoção do fluxo de API key)

> App OAuth2 aprovado por David (david@intervals.icu) em 2026-08-02. Client ID `663`.
> Esta change implementa o fluxo OAuth2 — autorização, callback e troca de token — e
> **substitui** o fluxo de API key pessoal, que deixa de existir.

**Status:** proposta
**Criado:** 2026-08-02
**Revisado:** 2026-08-16 — contrato real da API verificado contra a documentação oficial
(3 premissas da versão anterior estavam erradas) e 3 decisões de produto tomadas pelo founder.
Tamanho subiu de S para M em consequência.
**Revisado:** 2026-08-21 — gate de Definition of Ready (`spec-reviewer` + passada adversarial do
Codex). O Codex reprovou com 2 blockers e 4 majors, **todos confirmados contra o código**; esta
revisão os endereça e as emendas estão marcadas `[DoR 2026-08-21]`. O `spec-reviewer` havia
aprovado, e a divergência é a lição: ele conferiu que tudo o que a spec **cita** existe — e existia
—, enquanto as lacunas estavam inteiras no que a spec **deixava de dizer**.

## Contrato real da API (verificado 2026-08-16)

A versão anterior desta proposta assumia o contrato do Strava por analogia. Três premissas
estavam **erradas** e produziriam código quebrado:

| # | Premissa anterior | Contrato real |
|---|---|---|
| 1 | `token-uri = https://intervals.icu/oauth/token` | **`https://intervals.icu/api/oauth/token`** — note o `/api` |
| 2 | Resposta traz `refresh_token` e `expires_in` | **Não traz nenhum dos dois.** O token não expira e não há refresh flow |
| 3 | Escopos em minúsculo (`activity:read`) | **Maiúsculo, separados por vírgula:** `ACTIVITY:READ,CALENDAR:WRITE` |

Contrato completo:

- **Authorize:** `GET https://intervals.icu/oauth/authorize?client_id=&redirect_uri=&scope=&state=`
  Retorno: `<redirect_uri>?code=&state=` ou `<redirect_uri>?error=access_denied`.
- **Token:** `POST https://intervals.icu/api/oauth/token` com `client_id`, `client_secret`, `code`.
  O `code` **expira em 2 minutos** — a troca é síncrona no callback, nunca enfileirada.
  Resposta: `{ "token_type": "Bearer", "access_token": "...", "scope": "...", "athlete": { "id": "...", "name": "..." } }`.
- **Chamadas de API:** `Authorization: Bearer <access_token>`. A doc é explícita: *"Apps intended
  to be used by more than one person should use OAuth and Bearer tokens."*
- **Revogação:** `DELETE https://intervals.icu/api/v1/disconnect-app` com o Bearer do próprio atleta.
- **Escopos disponíveis:** `ACTIVITY`, `WELLNESS`, `CALENDAR`, `CHATS`, `LIBRARY`, `SETTINGS`,
  cada um com `:READ` ou `:WRITE` (write implica read).
- **Athlete id `0`** referencia o atleta autenticado — igual ao fluxo de API key já usado em
  `validarApiKey` (`GET /api/v1/athlete/0`).

**Escopos que esta change solicita:** `ACTIVITY:READ,CALENDAR:WRITE`.
`ACTIVITY:READ` cobre a ingestão de treinos realizados (`buscarAtividade`, e a listagem futura do
scheduler); `CALENDAR:WRITE` cobre o push de treinos planejados que **já existe hoje**
(`criarEvento`/`atualizarEvento`/`deletarEvento`/`listarEventos` em `IntervalsIcuClientImpl`).
Pedir menos que isso quebra funcionalidade em produção.

## Decisões de produto (founder, 2026-08-16)

1. **Quem conecta: o atleta**, mantendo o caminho self-service `/api/v1/integracoes/me/intervals-icu`
   já existente. Não se cria endpoint coach-facing com `atletaId` (o molde do Strava, onde o
   **técnico** dispara a autorização, não se aplica: quem loga no intervals.icu é o dono da conta).
   Isso **corrige o CA1 da versão anterior**, que exigia `ROLE_TECNICO`.
   **[DoR 2026-08-21] E só `ROLE_ATLETA` — `ADMIN` sai do contrato.** `resolverAtletaIdAtual()`
   exige um `Atleta` vinculado ao `Usuario` autenticado e lança `DomainNotFoundException` quando
   não há; um ADMIN sem vínculo de atleta receberia 404 em vez da URL, ou seja, o CA descrevia um
   caminho inalcançável. E é coerente: quem não é atleta não tem conta intervals.icu para conectar.
2. **A API key é removida.** OAuth não convive com o fluxo antigo. Consequência aceita
   explicitamente: **todo atleta hoje conectado por API key para de sincronizar no deploy e
   precisa reconectar** — ver "Riscos e mitigações".
3. **O pull automático diário entra no roadmap imediato**, mas continua sendo a change
   `intervals-icu-activity-sync-scheduler` (já especificada, com pre-mortem feito). Esta change é
   pré-requisito dela — ver "Dependências".

## Problema

A conexão com intervals.icu usa API key pessoal (`IntervalsIcuConnectionService`). Isso tem
fricção — o atleta gera a key manualmente e cola no Menthoros — e não é o mecanismo que o provedor
recomenda para apps multi-usuário. O OAuth2 elimina o passo manual, dá escopo limitado, e é
revogável pelo atleta no próprio intervals.icu.

## Escopo

1. **`IntervalsIcuProperties`** (já existe, hoje só com `baseUrl`) — acrescentar `clientId`,
   `clientSecret`, `redirectUri`, `authorizationUri`, `tokenUri`, `scope`.
   **[DoR 2026-08-21] Com validação fail-fast:** `@Validated` na classe e `@NotBlank` em
   `clientId`, `clientSecret`, `redirectUri`, `tokenUri`, `authorizationUri` e `scope`. Não é
   preciosismo de configuração: o `clientSecret` **é a chave do HMAC do state** (item 3). Com o
   default vazio do `application.yml`, a chave é `""` — conhecida por qualquer um — e o state
   assinado, que é a defesa central desta change, passa a ser forjável para qualquer `atletaId`.
   O modo de falha é silencioso: o fluxo *funciona* mal configurado. Falhar no boot é o
   comportamento correto. `StravaProperties` não valida nada e **não serve de precedente aqui** —
   o state do Strava não é assinado, então lá o secret vazio não abre esse buraco.
2. **`IntervalsIcuOAuthService`** — interface + impl:
   - `getAuthorizationUrl()` — resolve o atleta do JWT (`resolverAtletaIdAtual`), monta a URL com
     `client_id`, `redirect_uri`, `scope`, `state`.
   - `exchangeCodeForToken(String code, String state)` — valida o state, resolve o atleta,
     `POST` no token endpoint, persiste em `IntegracaoExterna` (`plataforma=INTERVALS_ICU`):
     `accessToken`, `scopes`, `externalAthleteId` (do campo `athlete.id` da resposta),
     `ativo=true`, `lastSyncError=null`. **`refreshToken` e `tokenExpiraEm` ficam `null`** —
     o provedor não emite nenhum dos dois; a JavaDoc registra o porquê para ninguém "corrigir" depois.
     Mantém o hook D5.2 (pausa automática do Strava) já implementado em
     `IntervalsIcuConnectionServiceImpl.pausarStravaAutomaticamente`.
     **[DoR 2026-08-21] Guard D5.1 antes de ativar:** verificar
     `findOtherActiveByExternalAthleteIdAndPlataformaAndTenantId` — se o `externalAthleteId`
     recebido já pertence a **outro** atleta ativo do mesmo tenant, **não persistir** e redirecionar
     com erro. Ver item 9.
   - `disconnect()` — chama `DELETE /api/v1/disconnect-app` no provedor (best-effort, falha não
     bloqueia) e então o soft-disconnect local.
     **[DoR 2026-08-21] O soft-disconnect existente é insuficiente e precisa ser estendido:**
     `IntervalsIcuConnectionServiceImpl.desconectar` hoje limpa apenas `accessToken` e
     `refreshToken`. Precisa passar a limpar também `scopes`, `tokenExpiraEm`, `externalAthleteId`
     e `lastSyncError` — alinhando com `StravaOAuthServiceImpl.disconnect`, que já limpa `scopes` e
     `tokenExpiraEm`. Sem isso, CA6 ("credenciais zeradas") é falso e a métrica de sucesso deste
     documento — que conta conexões OAuth por `scopes != null` — passa a contar como conectado todo
     atleta que se desconectou.
3. **State assinado (HMAC), não `atletaId` cru.** O callback é público por definição. Com o
   `state=atletaId` do molde Strava, qualquer um que descubra um `atletaId` pode vincular a
   **própria** conta intervals.icu ao registro de outro atleta. Como aqui o fluxo é self-service e
   o `atletaId` sai do JWT, o state carrega `atletaId + timestamp + HMAC-SHA256(clientSecret)`,
   validado no callback com TTL de 10 minutos. Stateless — funciona multi-instância, sem tabela nova.
   (O Strava permanece como está: corrigi-lo é fora de escopo desta change.)
4. **`IntervalsIcuClientImpl`: Basic → Bearer.** **[DoR 2026-08-21] A execução inverte a ordem
   destes dois itens: a remoção da API key (item 5) vem *antes* da troca para Bearer (item 4).**
   Esta lista é temática, não cronológica; a ordem normativa está em D15 e no Bloco 2 do
   `tasks.md`. Trocar o header antes de apagar o `POST` deixa um commit em que o endpoint de
   conexão por key continua publicado rejeitando o próprio formato que anuncia. Único ponto de
   mudança:
   `headers.setBasicAuth("API_KEY", apiKey)` → `headers.setBearerAuth(token)`
   (`IntervalsIcuClientImpl`, no método `basic()` — a linha era 148 em 2026-08-16 e é 151 hoje;
   localizar por `setBasicAuth("API_KEY"`, não por número). Os **seis** call sites
   (`IntervalsIcuAdapter` ×3, `IntervalsIcuActivityIngestionServiceImpl`,
   `IntervalsIcuLapsBackfillServiceImpl`, `validarApiKey`) já leem `conexao.getAccessToken()` e
   repassam. **[DoR 2026-08-21]** O que não muda é **o dado e a ordem dos argumentos em cada call
   site** — os *nomes públicos* mudam: o parâmetro `apiKey` vira `token` e `validarApiKey` vira
   `validarToken` nas assinaturas do `IntervalsIcuClient`. (A redação anterior dizia "nenhuma
   assinatura muda" e mandava renomear na frase seguinte.)
5. **Remoção do fluxo de API key:** apagar `IntervalsIcuConnectInputDto`, o `POST` de conexão por
   key em `IntervalsIcuConnectionController`, e `IntervalsIcuConnectionServiceImpl.conectar`.
   `status()`/`desconectar()` permanecem (o `disconnect` ganha a chamada de revogação do item 2).
   `validarApiKey` vira `validarToken` — continua útil para confirmar o token logo após a troca.
6. **Security** — nova lista `intervalsIcuPaths` em `CoreSecurityProperties`
   (default `List.of("/api/v1/integracoes/intervals-icu/callback")`) + `permitAll` no
   `CoreSecurityConfig`. **Não** renomear `stravaPaths`.
7. **Config** (`application.yml` e `application-test.yml`):
   ```yaml
   app:
     intervals-icu:
       base-url: ${INTERVALS_ICU_BASE_URL:https://intervals.icu}
       client-id: ${INTERVALS_ICU_CLIENT_ID:}
       client-secret: ${INTERVALS_ICU_CLIENT_SECRET:}
       redirect-uri: ${INTERVALS_ICU_REDIRECT_URI:http://localhost:8099/api/v1/integracoes/intervals-icu/callback}
       authorization-uri: https://intervals.icu/oauth/authorize
       token-uri: https://intervals.icu/api/oauth/token
       scope: ACTIVITY:READ,CALENDAR:WRITE
   ```
9. **[DoR 2026-08-21] Guard de `externalAthleteId` duplicado no callback.** O repositório **já
   tem** `findOtherActiveByExternalAthleteIdAndPlataformaAndTenantId` (decisão D5.1), e
   `IntervalsIcuActivityIngestionServiceImpl` já trata a duplicidade como incidente
   (`log.error("SECURITY: ...")` + `DomainConflictException`). Mas isso só dispara **no import**, e
   o **push** (`IntervalsIcuAdapter`) não tem guard nenhum. Sem verificação no callback, dois
   atletas do mesmo tenant podem autorizar a **mesma** conta intervals.icu e passar a receber
   treino planejado no mesmo calendário e no mesmo relógio — o dano chega a uma pessoa real antes
   de qualquer import acontecer. O callback é o único ponto onde o vínculo nasce, então é onde a
   verificação pertence: duplicidade detectada → nada é persistido, log de segurança, redirect com
   `?intervals-icu=error`.
10. **[DoR 2026-08-21] O callback nunca lança — sempre redireciona.** O molde
   `StravaAuthController.callback` faz `UUID.fromString(state)` **sem** try/catch: state malformado
   estoura e o handler global devolve erro HTTP, não o redirect. CA3/CA4 exigem redirect em todo
   caminho de falha, então copiar o padrão do Strava **não** atende os critérios. O handler do
   callback envolve a resolução do state e a troca do code, traduz qualquer falha em
   `?intervals-icu=error`, e registra a causa no log — sem token e sem `code` na mensagem (CA10).
11. **Frontend** (`apps/menthoros-front`) — obrigatório, não mais "change separada": remover a API
   key remove o `TextField` de `IntervalsIcuConnectionCard.tsx`, que passa a ter um botão
   "Conectar com intervals.icu" (busca a URL de autorização e redireciona). `useIntervalsIcuConnection`
   perde o parâmetro `apiKey` de `connect`. A tela de perfil trata o retorno
   `?intervals-icu=success|error`.

## Fora de escopo

- **Scheduler de sync automático** — change própria `intervals-icu-activity-sync-scheduler`
  (ver "Dependências").
- **Webhook do intervals.icu** — o provedor passou a suportar; change futura separada.
- **Corrigir o `state=atletaId` do fluxo Strava** — dívida pré-existente, não introduzida aqui.
- **Descomissão do Strava.**
- **Migração automática de conexões existentes** — não há como converter uma API key em token OAuth;
  a reconexão é necessariamente manual pelo atleta.

## Dependências

`intervals-icu-activity-sync-scheduler` **depende desta change** e sua spec precisa de um ajuste
antes de ser implementada: o item 1 do "What Changes" daquela proposta diz *"Basic Auth com a API
key do atleta, sem OAuth"* — com a API key removida, o novo método `listarAtividades` nasce usando
o mesmo Bearer dos demais. É ajuste de uma linha na spec dela, feito quando aquela change entrar
em `/implement init`; nenhuma outra parte do design dela muda (o guard `autoSyncPausado`, o cursor
e o pipeline de ingestão são independentes do mecanismo de auth).

## Critérios de aceite

- **CA1 — Autorização:** Given atleta autenticado (`ROLE_ATLETA`; **[DoR 2026-08-21]** `ADMIN`
  removido — ver Decisões de produto), When chama
  `GET /api/v1/integracoes/me/intervals-icu/authorize-url`, Then recebe a URL de
  `https://intervals.icu/oauth/authorize` com `client_id`, `redirect_uri`,
  `scope=ACTIVITY:READ,CALENDAR:WRITE` e `state` assinado.
- **CA2 — Callback feliz:** Given o provedor redireciona com `code` e `state` válidos, When o
  callback processa, Then (a) o state é validado (assinatura + TTL), (b) o code é trocado por token
  em `https://intervals.icu/api/oauth/token`, (c) `IntegracaoExterna` é criada/atualizada com
  `accessToken`, `scopes`, `externalAthleteId`, `ativo=true`, (d) `refreshToken` e `tokenExpiraEm`
  permanecem `null`, (e) o hook D5.2 pausa o Strava se ativo, (f) redireciona para o front com
  `?intervals-icu=success`.
- **CA3 — Callback com erro do provedor:** Given `?error=access_denied`, Then redireciona com
  `?intervals-icu=error` e nada é persistido.
- **CA4 — State inválido:** Given `state` com assinatura inválida, adulterado, ou mais velho que
  10 minutos, When o callback processa, Then **nada é persistido** e redireciona com
  `?intervals-icu=error`.
- **CA5 — Status:** Given atleta conectado, When `GET /api/v1/integracoes/me/intervals-icu`,
  Then retorna a conexão ativa sem jamais expor o token.
- **CA6 — Desconexão revoga no provedor:** Given atleta conectado, When
  `DELETE /api/v1/integracoes/me/intervals-icu`, Then o backend chama
  `DELETE /api/v1/disconnect-app` com o Bearer e faz o soft-disconnect local. Falha na revogação
  remota **não** impede a local. **[DoR 2026-08-21] "Credenciais zeradas" é verificável campo a
  campo:** após o `DELETE`, a row tem `ativo=false` e `accessToken`, `refreshToken`, `scopes`,
  `tokenExpiraEm`, `externalAthleteId` e `lastSyncError` todos `null`.
- **CA7 — Bearer nas chamadas de API:** Given uma conexão OAuth ativa, When qualquer operação
  chama o intervals.icu (push de evento, busca de atividade, backfill de laps), Then o header é
  `Authorization: Bearer <token>` — nenhuma chamada usa mais Basic.
- **CA8 — API key removida:** Given o deploy desta change, When se tenta `POST` com corpo
  `{apiKey}` no endpoint antigo, Then o endpoint não existe (404) — o DTO e o service foram removidos.
- **CA9 — Multi-tenancy:** Given o callback (público, sem JWT), When persiste a integração,
  Then o `tenantId` vem de `atleta.getAssessoria().getId()`, resolvido a partir do state validado —
  nunca de parâmetro do request.
- **CA10 — Token nunca vaza:** Given qualquer caminho de erro, Then o token não aparece em log,
  mensagem de exceção, resposta de API ou URL de redirect (regra já vigente em
  `IntervalsIcuClientImpl.traduz`).
- **CA11 — [DoR 2026-08-21] Configuração incompleta derruba o boot:** Given `client-secret`,
  `client-id`, `redirect-uri`, `token-uri`, `authorization-uri` ou `scope` vazio ou ausente, When a
  aplicação sobe, Then o contexto **falha no boot** com mensagem nomeando a propriedade — nunca
  sobe com um HMAC de chave vazia. O teste exercita o secret vazio explicitamente, porque é o caso
  que transforma o state assinado em decoração.
- **CA12 — [DoR 2026-08-21] Conta intervals.icu já vinculada a outro atleta:** Given o
  `externalAthleteId` retornado pela troca já pertence a outra `IntegracaoExterna` **ativa** do
  mesmo tenant em outro atleta, When o callback processa, Then **nada é persistido** (a conexão do
  segundo atleta não é criada nem ativada), um log de segurança é emitido, e o redirect leva
  `?intervals-icu=error`. Impede dois atletas de receberem push no mesmo calendário.
- **CA13 — [DoR 2026-08-21] O callback nunca devolve erro HTTP:** Given qualquer entrada — state
  malformado, `code` ausente, provedor fora do ar, exceção inesperada na troca —, When o callback
  processa, Then a resposta é **sempre** um 302 para o front (`success` ou `error`); nenhum caminho
  produz 4xx/5xx nem página de erro. É o que separa esta change do molde
  `StravaAuthController.callback`, que faz `UUID.fromString(state)` sem proteção.

## Métrica de sucesso

- Atleta conecta o intervals.icu sem sair do Menthoros e sem gerar API key: 0 passos manuais no
  provedor (hoje são 3 — abrir settings, gerar key, copiar).
- 100% dos atletas hoje conectados reconectados via OAuth em até 2 semanas do deploy (base atual
  do pilot é pequena; acompanhar por `IntegracaoExterna` com `scopes != null`).
- Nenhuma regressão no push de treinos ao relógio — o canal validado em 2026-07-14 continua
  funcionando após a troca para Bearer.

## Riscos e mitigações

- **Toda conexão existente quebra no deploy** (Alto, **aceito pelo founder**): as rows de
  `IntegracaoExterna` guardam API keys, e a partir do deploy o client manda `Bearer <api key>` —
  que o provedor rejeita com 401. Os atletas afetados param de sincronizar até reconectar.
  Mitigação: base do pilot é pequena e conhecida; avisar os atletas afetados antes do deploy, e
  fazer o deploy junto com o front (o botão precisa existir para eles conseguirem reconectar).
  **Não** fazer deploy do backend sem o front.
- **`client-secret` em env var, nunca no repositório** (Alto, mitigado): mesmo padrão do
  `STRAVA_CLIENT_SECRET`. Default vazio no `application.yml`.
- **Redirect URI precisa bater exatamente com o registrado** (Médio): o provedor não suporta
  wildcard. `http://localhost/` é sempre aceito; para o HomeLab, confirmar com David que a URI de
  produção está registrada **antes** do deploy — senão o callback falha em produção e passa nos
  testes locais.
- **Token sem expiração** (Baixo): não há refresh a implementar, mas também não há renovação
  automática se o atleta revogar no provedor. O caminho de 401 já existe
  (`lastSyncError` + `IntervalsIcuApiException`); o atleta reconecta.
- **Escopo insuficiente descoberto tarde** (Médio, mitigado): pedir `CALENDAR:WRITE` desde o
  primeiro dia, porque o push de treinos já existe em produção. Um escopo faltando só aparece na
  primeira operação real — a task de smoke test cobre push **e** import.

## Rollback

Reverter o PR restaura o fluxo de API key (o código volta), mas **as conexões OAuth feitas nesse
meio-tempo param de funcionar** — o token OAuth não é aceito como API key em Basic auth. Ou seja:
o rollback não é neutro depois que o primeiro atleta conectar. Sem migration e sem coluna nova
(reusa `IntegracaoExterna`), então não há dado a limpar — apenas reconexão manual, na direção
inversa.
