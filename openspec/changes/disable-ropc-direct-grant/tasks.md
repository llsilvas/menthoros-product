# Tasks — disable-ropc-direct-grant (S · Full · infra)

> Escopo: `menthoros-infra` (`keycloak/menthoros-realm.json`). **Zero diff em `apps/`** — o código já
> está migrado (PRs front #54 e #55). O que falta é provedor, não aplicação.
>
> Alvos: **HomeLab** e **Railway `develop`**. Produção não existe (`SPRINTS.md:291`).
>
> Validação: o próprio Keycloak, exercitado por requisição. Não há suíte automatizada cobrindo
> configuração de realm.
>
> ⚠️ **Acesso admin aos dois Keycloaks é pré-condição de tudo a partir da seção 3.** Foi o gargalo
> que travou a change original.

## 0. Pré-corte — levantamento

- [x] 0.1 **Q1 — levantamento feito em 2026-08-05. Nada no código depende do password grant do
      `menthoros-web`.** Varredura nos cinco repos por `grant_type` + `password`:
      - `KeycloakOrganizationGatewayImpl:129` — o gateway admin, em `admin-cli`/`master`. Não é
        alcançado pelo corte (CA3).
      - `KeycloakOrganizationGatewayImplTest:60` — asserção sobre o form do gateway acima.
      - **6 arquivos de documentação** do backend com exemplos `curl` de password grant. Todos usam
        `client_id=menthoros-backend`, **um client que não existe** no realm atual (`menthoros-api`,
        `menthoros-web`, `menthoros-test`). Já estão quebrados hoje, por motivo alheio a esta change.
      ⚠️ **Limite do levantamento:** ele cobre o que está versionado. Script local, coleção de outro
      dev ou job fora dos repos não aparecem aqui — só o time sabe.
- [x] 0.2 **Q2 decidida em 2026-08-05: SIM, o `menthoros-api` recebe o `S256` junto.** Ele já está com
      `directAccessGrants: false` nos dois alvos, mas sem o atributo de PKCE — mesma lacuna, client
      vizinho. Fechar os dois na mesma janela evita uma segunda rodada de sync e validação num
      provedor de identidade. **A task 3.1 passa a tocar dois clients.**
- [x] 0.3 **Acesso admin confirmado nos dois** em 2026-08-05: token obtido no realm `master` do
      HomeLab e do Railway. A **mesma senha** funcionou nos dois, confirmando o efeito previsto do
      espelhamento do `keycloak-db` — o admin do Railway passou a ser o do HomeLab.
- [x] 0.4 **Capturar os valores EFETIVOS de `KEYCLOAK_ADMIN_TOKEN_REALM` e `KEYCLOAK_ADMIN_CLIENT_ID`
      em cada alvo** (CA3). Os defaults do `application.yml` são `master`/`admin-cli`, mas qualquer
      variável de ambiente os sobrescreve — e é o valor efetivo, não o default, que determina se o
      corte alcança o gateway admin.
      **Como capturar, por alvo:** Railway → `railway variables --service menthoros-backend
      --environment develop --kv`; local/HomeLab → o `.env` do `menthoros-infra` mais o bloco
      `environment:` do serviço `app` no `docker-compose.yml`. Variável ausente significa **default do
      `application.yml`**, não "não configurado" — registrar como o default, explicitamente.
      *verify:* os dois valores registrados por ambiente. Se algum apontar para o realm `menthoros`,
      **PARE** — o corte alcançaria o gateway e o plano muda.

      **Capturado em 2026-08-05 — nenhum alvo sobrescreve, os dois usam os defaults:**

      | Alvo | `KEYCLOAK_ADMIN_TOKEN_REALM` | `KEYCLOAK_ADMIN_CLIENT_ID` |
      |---|---|---|
      | Railway `develop` | ausente → **`master`** | ausente → **`admin-cli`** |
      | Local / HomeLab | `.env` vazio e o serviço `app` do compose não define nenhuma das duas → **`master`** | → **`admin-cli`** |

      **Nenhum aponta para o realm `menthoros`. CA3 satisfeito:** o corte no `menthoros-web` não
      alcança o gateway admin em nenhum ambiente.
- [x] 0.5 **Fotografar a representação COMPLETA do `menthoros-web` em cada alvo, pela Admin API,
      ANTES do primeiro sync** — `redirectUris`, `webOrigins`, scopes (default e opcional),
      **protocol mappers**, **flags de fluxo** (`standardFlow`, `directAccessGrants`,
      `serviceAccounts`, `implicitFlow`) e `attributes`. É a única forma de saber o que o sync
      sobrescreveu, já que `no-delete` não protege o conteúdo de entidades existentes.
      ⚠️ Capturar o **client inteiro**, não uma lista de campos escolhidos: o campo esquecido é
      exatamente o que ninguém vai notar sumindo.
      *verify:* JSON completo do client salvo por ambiente, comparável com o arquivo versionado.

      **Capturado em 2026-08-05. Os dois alvos estão idênticos entre si e batem com o arquivo
      versionado — zero drift:**

      | Campo | HomeLab e Railway | Arquivo versionado |
      |---|---|---|
      | `redirectUris` | 3 (front dev, menthoros.com, localhost:5174) | iguais |
      | `webOrigins` | 3 (mesmas origens) | iguais |
      | `defaultClientScopes` | `acr, basic, email, profile, roles, web-origins` | iguais |
      | `optionalClientScopes` | inclui **`organization`** | inclui |
      | `protocolMappers` | nenhum | — |
      | `directAccessGrants` / `standardFlow` | `true` / `true` | iguais |
      | `pkce.code.challenge.method` | ausente | ausente |

      **Consequência: o risco do sync pré-corte é hoje nulo** — não há nada no servidor que o arquivo
      possa sobrescrever. O `organization` está declarado como optional scope no arquivo, então o
      sync não o remove — e ele é justamente o que o front pede explicitamente
      (`oidcConfig.ts:38`), sem o qual o token nasce sem `tenant_id`.
      ⚠️ **Ressalva honesta:** os dois alvos estarem idênticos é em parte artefato do espelhamento do
      `keycloak-db` feito em 2026-08-05. A validação das tasks 1.2/1.4 continua obrigatória — a foto
      vale para hoje, não para o momento do sync.

## 1. Sync do realm — sem o corte · ⏭️ DISPENSADA em 2026-08-05

> **Os dois propósitos desta seção já estavam satisfeitos quando ela chegou a vez**, e a evidência é
> a própria task 0.5:
>
> 1. **Reconciliar drift** — não há drift. Os dois alvos batem com o arquivo versionado campo a
>    campo, incluindo scopes e o optional `organization`.
> 2. **Levar o `menthoros-test` ao Railway** — já está lá, chegou pelo espelhamento do `keycloak-db`
>    em 2026-08-05.
>
> Rodar o sync seria escrever num provedor de identidade compartilhado para produzir zero mudança.
> O ensaio do mecanismo (provar script e credenciais) acontece de qualquer forma no primeiro sync
> **com** o corte, no HomeLab — o alvo mais seguro, e antes do Railway.
>
> **A validação de login não foi dispensada, só realocada:** as tasks 4.3 e 5.2 continuam exigindo
> login completo do app após cada sync. O que sumiu foi a rodada extra de validação de um sync que
> não mudava nada.
>
> Decisão do CTO. Tasks 1.1 a 1.4 encerradas sem execução.

> Separado de propósito: o sync de 2026-08-04 revelou drift real entre arquivo e servidor. Misturar
> "o realm mudou" com "a segurança mudou" torna qualquer quebra ambígua.
>
> ⚠️ **Este sync não é seguro só por não conter o corte.** A política `no-delete` impede apagar
> *entidades* que só existam no alvo; **não impede sobrescrever o conteúdo** de entidades que existem
> nos dois lados. Um `redirectUri` ou `webOrigin` presente no servidor e ausente do arquivo **some
> aqui** — e o login quebra antes de qualquer corte. Daí a validação do app após cada sync.

- [ ] 1.1 Rodar `sync-realm.sh` contra o **HomeLab**, com o realm **ainda sem o corte**, e registrar
      o que mudou (comparando com a foto da 0.5). Isso reconcilia drift e leva o client
      `menthoros-test`, que já está no arquivo versionado.
      ⚠️ **Conferir o alvo no `.env.sync` antes de rodar** — o script aplica em quem estiver lá, sem
      pedir confirmação.
      *verify:* sync sem erro; diff do que mudou registrado.
- [ ] 1.2 **Login completo do app contra o HomeLab, imediatamente após o sync.**
      *verify:* login conclui **e** uma chamada autenticada à API responde `200`. O `403` é o modo de
      falha caro aqui: sem o scope `organization`, o token nasce sem `tenant_id`, o login parece ter
      dado certo e tudo devolve 403.
- [ ] 1.3 Mesmo sync contra o **Railway `develop`**.
      *verify:* `menthoros-test` presente no realm do Railway, confirmado pela Admin API.
- [ ] 1.4 **Repetir a 1.2 contra o Railway.** Ter passado no HomeLab não é evidência para o Railway —
      são servidores diferentes, e o drift entre eles já apareceu antes.

## 2. Saída de emergência — antes de fechar a porta

> Validar a alternativa **depois** do corte é descobrir que ela não funciona quando a original já
> morreu.

- [ ] 2.1 Obter token pelo `menthoros-test` **nos dois alvos** e confirmar que o token nasce com
      `tenant_id` (o scope `organization` é DEFAULT nesse client, justamente para isso).
      *verify:* token emitido e claim de tenant presente, nos dois ambientes.
      **Parcial em 2026-08-05:** ✅ **HomeLab OK** — token com `tenant_id`
      `1b5ce37e-1ba1-415d-b19a-70cd2b30fe1e` (`assessoria-demo`), roles `ADMIN`/`TECNICO`.
      ❌ **Railway falhou** com `unknown_error`, **por defeito alheio a esta change**: colisão do
      client scope `organization` com a feature Organizations do Keycloak (ver 3.3). Enquanto isso
      não for resolvido, a saída de emergência não está provada no Railway — **e a seção 5 não pode
      começar**.
- [ ] 2.2 Trocar o `client_id` na configuração do Apidog para `menthoros-test` e exercitar uma
      requisição autenticada de verdade.
      *verify:* requisição autenticada respondendo `200`, não `403` — o erro mais caro deste ambiente
      é o login parecer bem-sucedido e tudo devolver 403.
- [ ] 2.3 Comunicar a troca de `client_id` a quem usa o teste manual (CA5).

## 3. O corte

- [x] 3.1 **Aplicado em 2026-08-05** — `menthoros-web` com `directAccessGrantsEnabled: false` +
      `S256`; `menthoros-api` só com o `S256`; `menthoros-test` intacto. JSON validado, diff de
      3 inserções e 1 remoção. No `menthoros-realm.json`:
      - `menthoros-web`: `directAccessGrantsEnabled: false` **+** `attributes["pkce.code.challenge.method"] = "S256"`
      - `menthoros-api`: **só** o `attributes["pkce.code.challenge.method"] = "S256"` (decisão 0.2 —
        o `directAccessGrants` dele já é `false`)
      ⚠️ **Não tocar no `menthoros-test`** — o direct grant dele é proposital, é a porta do teste
      manual depois que o `menthoros-web` fechar a sua.
      *verify:* diff do arquivo afetando exatamente dois clients, e o `menthoros-test` intacto.
- [x] 3.2 **PR `menthoros-infra` #1 aberto em 2026-08-05** — `MERGEABLE`/`CLEAN`, aguardando merge.
      Revisado pelo `security-reviewer`: nenhum Critical, um High (o `menthoros-test`, ver 3.3).
      Abrir PR no `menthoros-infra` e revisar **antes que qualquer servidor receba o corte**. O
      `sync-realm.sh` aplica o JSON cegamente; o PR é a única revisão que existe entre o arquivo e o
      provedor de identidade.
      *(Redação corrigida em 2026-08-05: dizia "antes de qualquer servidor mudar", o que contradizia
      a seção 1 — os syncs pré-corte já mudam servidor de propósito. O que o PR precisa preceder é o
      corte, não toda mudança.)*

## 3.3 Bloqueadores abertos antes da seção 4

- [x] 3.3a **APLICADO em 2026-08-06** (`2a80a1b`, no PR #1). `enabled: false` no `menthoros-test`,
      com a justificativa gravada na `description` do próprio client, para quem for ligá-lo entender
      por que ele nasce desligado. — decidido em 2026-08-05 após a auditoria de
      segurança (achado High) e **ainda não aplicado**. O `standardFlow: false` não impede o ROPC:
      o client é `publicClient`, com `organization` como scope DEFAULT e `fullScopeAllowed`, num
      Keycloak exposto à internet. Sem isso, o corte fecha o ROPC no `menthoros-web` e o mantém
      aberto sob outro `client_id`. Entra no PR #1 antes do merge.
- [x] 3.3b **RESOLVIDO em 2026-08-06 — causa raiz reproduzida em laboratório.** O gatilho é o client
      ter `organization` como scope **DEFAULT** *e* a requisição também pedir `scope=organization`:
      o Keycloak coloca no mesmo mapa, chaveado por nome, o scope atribuído e o `ClientScopeDecorator`
      que cria para o scope pedido → `IllegalStateException: Duplicate key organization`.

      Realm descartável na 26.7, 40 chamadas por bateria (criado e removido; o `menthoros` não foi
      alterado):

      | Bateria | Configuração | Resultado |
      |---|---|---|
      | A | mapper nativo · optional · pedindo | 40 ok · 0 erros |
      | B | nossa config do mapper · optional · pedindo | 40 ok · 0 erros |
      | C | nossa config · **DEFAULT · pedindo** | **0 ok · 40 erros** |
      | D | nossa config · DEFAULT · sem pedir | 40 ok · 0 erros, claim presente |

      **Só o `menthoros-test` tem o scope como DEFAULT.** `menthoros-web` e `menthoros-api` o têm
      como optional e por isso nunca falharam — **a colisão nunca afetou o corte do ROPC.**
      Correção documentada na `description` do client (PR `menthoros-infra` **#2**).

      Hipóteses descartadas por experimento: não é bug genérico da 26.7 (A e D limpas); não é a nossa
      customização do mapper (B limpa); apagar o scope ou remover a atribuição do client fazem o
      `organization` deixar de existir (`invalid_scope`), ambas testadas e revertidas.

      ✅ **As seções 4 e 5 estão destravadas.**

## 4. Aplicação no HomeLab

- [x] 4.1 **APLICADO no HomeLab em 2026-08-06.** `keycloak-config-cli` 6.5.1 contra Keycloak 26.7.0,
      sem erro. ⚠️ **A primeira tentativa falhou** com `HTTP 500` -> `value too long for type character
      varying(255)`: a `description` do `menthoros-test` tinha 442 caracteres desde o PR #1, o que
      tornava o corte **insincronizável desde o merge**. Corrigido no PR #3 (descrição em 251 chars,
      detalhe movido para `keycloak/README.md`). `sync-realm.sh` contra o HomeLab, agora com o corte.
      ⚠️ **A partir daqui o rollback deixa de ser barato** — deixa de ser reverter o frontend e passa
      a ser reverter configuração de IdP, com acesso admin, sob pressão.
- [x] 4.2 **CA1 ✅ VERIFICADO** — `{"error":"unauthorized_client","error_description":"Client not
      allowed for direct access grants"}`. A mesma chamada devolvia token com `ADMIN`/`TECNICO` e
      `tenant_id` horas antes. **CA1:** tentar `grant_type=password` no `menthoros-web` com credenciais que funcionavam
      antes.
      *verify:* Keycloak **recusa**. Ler a configuração no console não vale — o que importa é o
      provedor recusando.
- [x] 4.3 **CA2 ✅ VERIFICADO em 2026-08-06** — fluxo Authorization Code + PKCE exercitado ponta a
      ponta contra o HomeLab: etapa 1 (username) `200` → etapa 2 (password) `302` para
      `http://localhost:5174/` com o `state` preservado → troca do `code` com `code_verifier`
      devolvendo token `azp=menthoros-web`, `tenant_id` `1b5ce37e-…`, roles `ADMIN`/`TECNICO` e
      `refresh_token`. Idêntico ao comportamento de antes do corte.
      ⚠️ **Ressalva:** validado no nível do protocolo, contra o provedor — **não** é o app no
      navegador. O código do front está mergeado e inalterado e a change só mexeu no IdP, então o
      risco residual é baixo; a validação pela interface fica para quando o backend subir.
      📌 **Achado não documentado antes:** o realm usa **login identity-first** — o primeiro
      formulário só tem `username`, a senha vem numa segunda página. Enviar os dois juntos devolve
      a própria página de login, sem erro visível. É o tipo de detalhe que faz teste de login
      falhar sem explicar por quê.
      **CA2:** login completo pelo app — mesmo redirect, mesma sessão, mesmo destino.
- [x] 4.4 **CA4 ✅ VERIFICADO** — sem `code_challenge`: `302` com
      `error=invalid_request&error_description=Missing+parameter:+code_challenge_method`; com
      `code_challenge`: `200`. **CA4:** tentar autorizar sem `code_challenge`.
      *verify:* Keycloak recusa. Sem isso o PKCE segue opcional no servidor.
- [x] 4.5 **CA3 ✅ VERIFICADO** — `token-realm: master` e `client-id: admin-cli` inalterados; o corte
      não os alcança. Também conferido pós-sync: `redirectUris`, `webOrigins` e o optional scope
      `organization` do `menthoros-web` **preservados** — o `no-delete` não sobrescreveu nada.
      **CA3:** confirmar que o gateway admin segue apontando para outro realm/client (valores da
      0.4 inalterados após o sync) e rodar `KeycloakOrganizationGatewayImplTest`.
      *verify:* `token-realm` e `client-id` efetivos inalterados; teste verde.
      ⚠️ **Não exigir criação real de organização.** O gate de DoR de 2026-08-05 descobriu que o
      gateway admin **não tem credenciais provisionadas em nenhum ambiente** (`KEYCLOAK_SERVER_URL` e
      `KC_ADMIN_PASSWORD` ausentes no Railway; `.env` vazio no local) — ele não obtém token de admin
      hoje, por motivo **anterior e alheio** a esta change. Exigir a criação real transformaria um
      defeito pré-existente em falha desta change. Ver o achado no `proposal.md`; a correção pertence
      ao `keycloak-user-onboarding-auth`.

## 5. Aplicação no Railway `develop`

- [ ] 5.1 `sync-realm.sh` contra o Railway, com o corte. Só depois da seção 4 inteira verde.
- [ ] 5.2 Repetir 4.2 a 4.5 contra o Railway. Ter passado no HomeLab não é evidência para o Railway —
      são servidores diferentes, e o drift entre eles já apareceu antes.

## 6. Fechamento

> **Estado em 2026-08-06: o corte está em `main` (`dba238a`), mas NÃO está em nenhum servidor.**
> O `sync-realm.sh` é manual e não foi executado com o corte — o `menthoros-web` **segue aceitando
> `grant_type=password`** nos dois alvos.
>
> A 3.3b foi resolvida e **as seções 4 e 5 estão liberadas**. O que falta é operação: rodar o sync no
> HomeLab, validar os CAs, e só então o Railway.
>
> **A change só pode ser arquivada depois disso.** O código está entregue; o controle de segurança
> passa a valer quando o provedor recusar o grant.

- [ ] 6.1 Registrar o **rollback** no README do `menthoros-infra`: `directAccessGrantsEnabled: true` +
      sync devolve o grant; remover `pkce.code.challenge.method` reverte só o PKCE. São reversíveis
      de forma independente.
- [ ] 6.2 Atualizar o `SPRINTS.md`: a linha "🔴 Corte do ROPC" do Bloco 3 passa a apontar para esta
      change, e a pendência herdada da `migrate-login-to-authorization-code-pkce` fica encerrada.
- [ ] 6.3 Registrar que **produção não requer ação** — quando a infra nascer, aplica o realm
      versionado já com o corte.
- [ ] 6.4 **Levar o achado do gateway admin para o `keycloak-user-onboarding-auth`:** as credenciais
      (`KEYCLOAK_SERVER_URL`, `KC_ADMIN_PASSWORD`) não estão provisionadas em nenhum ambiente, e o
      signup daquela change depende inteiramente delas. Registrar como pré-condição lá — não corrigir
      aqui.
