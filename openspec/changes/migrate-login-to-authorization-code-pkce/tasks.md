# Tasks — migrate-login-to-authorization-code-pkce (M · Full · frontend + infra)

> Escopo: `apps/menthoros-front` e `menthoros-infra/keycloak/menthoros-realm.json`. **Qualquer diff em
> `apps/menthoros-backend/src/main` é sinal de que algo saiu do escopo** — investigar antes de seguir.
>
> Validação padrão do frontend: `npm run lint && npm run build && npm run test:run`.
>
> Anchors verificados em 2026-08-03 contra `develop`.

## 0. Discovery e decisões (bloqueia o resto)

- [x] 0.1 **Realm efetivo = `menthoros`, em todos os ambientes.** Evidência convergente em quatro
      fontes independentes: `application.yml:30` (local, `localhost:9999/realms/menthoros`),
      `application-dev.yml:62` e `application-cloud.yml:60` (ambos
      `menthoros-keycloak-develop.up.railway.app/realms/menthoros`), `env.ts:23` e o próprio
      `menthoros-realm.json` (`"realm": "menthoros"`). O `menthoros-app` de `Assessoria.keycloakRealm`
      é **default de campo legado**, não o realm em uso — não há realm `menthoros-app` configurado em
      lugar nenhum. `KEYCLOAK_ADMIN_TOKEN_REALM=master` é do gateway admin, esperado.
      **Confirmado ao vivo em 2026-08-04** contra `http://192.168.15.24:8080` (HomeLab): o
      `.well-known/openid-configuration` do realm `menthoros` responde `200`, e o discovery já
      valida três premissas da change — `code_challenge_methods_supported: [plain, S256]` (PKCE
      disponível), `end_session_endpoint` presente (logout RP-initiated do D5 é viável) e
      `grant_types_supported` incluindo `password` (o ROPC que a 5.3 vai cortar) e
      `authorization_code`.

      ⚠️ **Armadilha de ambiente:** existe um container `menthoros-keycloak` rodando em
      `localhost:8080` na máquina do dev que **não tem o realm** (`404 Realm does not exist`, só
      `master`). São Keycloaks diferentes; o de trabalho é o do HomeLab, para onde o `.env:4` do front
      aponta. Consultar `localhost` dá diagnóstico errado — foi o que aconteceu na primeira passada
      desta task. Antes do corte da 5.3, confirmar o alvo pelo `issuer`, não pela porta.
- [x] 0.2 **CROSS-SITE em todos os ambientes ⇒ renew por REDIRECT (plano B do D6).** A premissa 3 do
      proposal está **refutada**. Domínios levantados:
      | Ambiente | Frontend | Keycloak | Relação |
      |---|---|---|---|
      | Dev local | `localhost:5174` (máquina do dev) | `192.168.15.24:8080` — **HomeLab, outra máquina** | hosts distintos |
      | Dev/Railway | `menthoros-front-develop.up.railway.app` | `menthoros-keycloak-develop.up.railway.app` | subdomínios irmãos |
      | Produção | `menthoros.com` | `*.up.railway.app` | sites distintos, inequívoco |
      Em produção o cookie de sessão do Keycloak é **third-party** dentro do iframe: bloqueado por
      padrão em Safari e Firefox, e em Chrome com bloqueio de terceiros. O renew silencioso falharia
      **em silêncio** — o usuário cairia no login sem motivo aparente, que é o pior modo de falha
      possível para esta change. Decisão: **renovação por redirect**, com preservação de destino e
      estado (o critério de aceite já foi redigido de forma condicional para isso).
- [x] 0.3 **Nenhum teste depende do password grant do login** — e o único que existe protege
      justamente o que **não** pode ser desligado. `KeycloakOrganizationGatewayImplTest.java:60`
      afirma `grant_type=password`, mas para o **gateway admin**, outro client. Ele funciona como
      sentinela do risco ⚠️ já registrado: se alguém aplicar o corte da 5.3 de forma ampla em vez de
      no client `menthoros-web`, este teste fica vermelho — o que é o comportamento desejado.
- [x] 0.4 ~~**Decisão do founder (Q1)** sobre bump da Política.~~ **RESOLVIDA fora desta change** em
      2026-08-04 (front PR #51): a frase do token foi reescrita de forma neutra quanto ao mecanismo,
      válida antes e depois desta migração. Não há bump a fazer aqui.
- [x] 0.5 **DECIDIDO (founder, 2026-08-04): derrubar todas as sessões vigentes.** Na virada, o
      bootstrap limpa `@Menthoros:token` de quem ainda o tiver, em vez de deixar expirar. Mais
      previsível: ninguém fica num estado híbrido — token velho em storage com o app já esperando
      sessão em memória. Implementado na task 4.9, que deixa de ser condicional.
- [x] 0.7 **`post.logout.redirect.uris = +` aplicado** no client `menthoros-web` (2026-08-04), via
      `sync-realm.sh` contra o HomeLab, e confirmado pela Admin API. O valor `+` reaproveita os
      próprios `redirectUris` em vez de manter uma segunda lista — duas listas divergem com o tempo,
      que é exatamente como o drift abaixo nasceu.
      **Drift encontrado e corrigido de quebra:** o HomeLab tinha só `http://localhost:5174/*` em
      `redirectUris`/`webOrigins`, enquanto o arquivo versionado listava também Railway e produção. O
      D4 afirmava que "os `redirectUris` já cobrem produção" — verdade para o arquivo, **não** para o
      servidor. O sync alinhou os dois (só adiciona; `no-delete` em todas as categorias).
      Inalterados de propósito, porque pertencem à task 5.3: `directAccessGrantsEnabled` segue `true`
      e o `pkce.code.challenge.method` segue ausente.
- [ ] 0.6 **Linha de base da métrica (Q4) — DESPRIORIZADA (founder, 2026-08-04): não bloqueia o
      bloco 0.** A telemetria de login não existe hoje e é métrica nova; entra por último, junto com o
      corte, em vez de segurar a implementação. **Consequência aceita:** enquanto não existir, a
      métrica primária do proposal não é falsificável — "não piorou" fica sendo julgamento, não
      medição. Fechar antes da 5.3 (o corte), não antes do bloco 1.
      *verify:* fonte da linha de base nomeada, ou métrica substituída no proposal.

## 1. Fonte única do token (sem trocar o mecanismo)

Etapa deliberadamente neutra: comportamento idêntico, `localStorage` ainda em uso. Serve para isolar
o risco do bloco 2.

- [x] 1.1 Criar a fonte única — `getAccessToken()` **e as claims derivadas** `getTenantId()` /
      `getRoles()` (D3), ainda lendo a chave atual. As três saem da mesma leitura.
      **A API de claims precisa ter forma síncrona (snapshot).** `LoginPage.tsx:41` chama
      `destinoPorRoles(rolesDoTokenAtual())` **no corpo do render**, e `AuthProvider.tsx:10` inicializa
      estado com leitura síncrona. Tornar as claims `Promise`-only quebraria render e navegação —
      o token continua assíncrono, as claims do usuário já carregado não.
      *verify:* `LoginPage` e `AuthProvider` compilam sem `await` no caminho de render.
- [x] 1.2 Migrar os consumidores reais para os getters: `main.tsx:13` (`OpenAPI.TOKEN`),
      **`main.tsx:16-28` (`OpenAPI.HEADERS` / `X-Tenant-ID`)**, `useUserInfo.ts:15`,
      `MetricasService.ts:5`, `StravaService.ts:5`, `useCalibracao`, `AuthProvider.tsx` e
      **`LoginPage.tsx:41,53` (`rolesDoTokenAtual`)**.
      *(Lista corrigida no DoR: `CoachSidebar` usa `localStorage` para o estado colapsado da sidebar,
      não para token — não entra. `ProvaService.ts:149` já consome via `OpenAPI.TOKEN`, então é
      coberto pela troca de `main.tsx`, sem edição própria.)*
- [x] 1.3 Teste de guarda **por padrão, não por lista**: nenhuma leitura de `@Menthoros:token` e
      nenhum decode de JWT fora do módulo de auth (no espírito do `forbidden-uses.ts` já usado no
      repo). Lista manual envelhece; padrão pega o consumidor novo que alguém adicionar depois.
- [x] 1.4 Validação: `npm run lint && npm run build && npm run test:run` — suíte verde, zero mudança
      de comportamento observável.

## 2. Fluxo Authorization Code + PKCE

- [ ] 2.1 Adicionar `oidc-client-ts` + `react-oidc-context` (D1). Registrar a justificativa da
      dependência no PR — exigência do `CLAUDE.md`.
- [ ] 2.2 Configurar o provider: `authority` (realm da 0.1), `client_id: menthoros-web`,
      `response_type: code`, PKCE S256, **store em memória** (D2). **`scope` deve incluir
      `organization` explicitamente** — é `optionalClientScope` no client (D3c); sem ele o token sai
      sem `tenant_id` e o `JwtTenantFilter` derruba o app inteiro com 403.
- [ ] 2.3 Processar o retorno no bootstrap, antes do render das rotas, com `redirect_uri` na raiz, e
      **restaurar o destino original a partir do `state`** — voltar para `/` não pode cair na
      `LandingPage` (D4).
- [ ] 2.4 Estado de "carregando autenticação" que suspende `ProtectedRoute` enquanto callback ou renew
      estão pendentes (D3b) — ausência de resposta não pode ser tratada como não-autenticado.
- [ ] 2.5 `getAccessToken`/`getTenantId`/`getRoles` passam a resolver da lib, aguardando renovação
      pendente. Consumidores do bloco 1 não mudam.
- [ ] 2.6 `LoginPage` deixa de coletar senha e passa a disparar o redirect de autorização; o destino
      pós-login sai do estado de usuário da lib, não de token em storage.
- [ ] 2.7 Silent renew conforme a decisão da 0.2; renew falhando leva ao login **sem laço**.
- [ ] 2.8 Logout RP-initiated com `end_session_endpoint` + `post_logout_redirect_uri` (D5).
- [ ] 2.9 Testes (mockando o provider, cobrindo decisões e não a biblioteca): `code_challenge_method=S256`
      **e `scope` contendo `organization`** na URL de autorização e no renew; `localStorage` sem token
      após autenticar; renew pendente não dispara o guard nem gera laço; destino restaurado do `state`;
      `X-Tenant-ID` coerente com o `Authorization` durante renovação; logout chama `end_session_endpoint`.
- [ ] 2.10 Validação: `npm run lint && npm run build && npm run test:run`.

## 3. Configuração do Keycloak

- [ ] 3.1 Aplicar em dev e confirmar que o realm versionado bate com o realm real (0.1).
      *(O `post.logout.redirect.uris` já foi registrado na 0.7 — era pré-requisito da 2.8.)*
- [ ] 3.2 Validação: login completo em dev pelo fluxo novo, com o grant antigo **ainda ligado**.

## 4. Walking skeleton manual (P0 — a prova de que funciona)

Nenhum destes é substituível por teste automatizado (D4/testes).

- [ ] 4.1 Login real como coach: redirect ao Keycloak, retorno, dashboard.
- [ ] 4.2 Reload da página mantém a sessão, sem novo prompt.
- [ ] 4.3 Aba nova autentica por silent renew, sem pedir credenciais.
- [ ] 4.4 Logout encerra a sessão no Keycloak: novo acesso exige credenciais de novo.
- [ ] 4.5 Expiração durante uso renova sem derrubar o usuário.
- [ ] 4.6 Gate de consentimento LGPD e roteamento coach/atleta seguem funcionando. **Não basta abrir
      `/me`:** o `LgpdConsentInterceptor` age sobre escrita, então exercitar uma escrita real de coach
      e, se aplicável, o próprio aceite — é lá que um `tenant_id` ausente aparece como 403/503.
- [ ] 4.6b Inspecionar o JWT emitido: `tenant_id` presente e `realm_access.roles` populado. O backend
      só lê `realm_access.roles` (`CoreSecurityConfig`), enquanto o front aceita `roles` flat — um
      token com formato diferente rotearia no front e seria negado no backend.
- [ ] 4.7 Login como **atleta**: redirect para `/athlete/home` como hoje.
- [ ] 4.8 `localStorage` inspecionado no browser: sem token, sem `@Menthoros:token`.
- [ ] 4.9 Limpeza de `@Menthoros:token` no bootstrap, derrubando quem ainda tiver sessão antiga
      (decisão 0.5 — não é mais condicional). Verificar com um token velho plantado no storage.

## 5. Documento e corte do grant antigo

- [x] 5.1 ~~Atualizar a Política conforme a decisão da 0.4.~~ **Feito fora desta change** (front PR #51,
      2026-08-04). Resta apenas **confirmar** ao fim da migração que a frase segue verdadeira com o
      token em memória — verificação, não edição.
- [ ] 5.2 Deploy do frontend em produção e repetição do bloco 4 lá (D7, passo 2).
- [ ] 5.3 **Ponto sem retorno barato:** `directAccessGrantsEnabled: false` +
      `pkce.code.challenge.method: S256` **no client `menthoros-web`, e só nele** (D7). Fazer com
      janela e acesso admin ao Keycloak garantidos — daqui em diante o rollback deixa de ser reverter
      o frontend. Só depois da 5.2 verde.
      *verify:* `grant_type=password` recusado para `menthoros-web`; **e** o gateway admin
      (`KeycloakOrganizationGatewayImpl:129`, que usa password grant em outro client) segue criando
      organização normalmente — regressão aqui quebraria o signup do Bloco 3.
- [ ] 5.4 Remover `AuthService.ts` (login por senha) e os tipos que só ele usava.
- [ ] 5.5 Validação final: `npm run lint && npm run build && npm run test:run`.
