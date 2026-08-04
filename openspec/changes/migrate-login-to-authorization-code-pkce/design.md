# Design — migrate-login-to-authorization-code-pkce

## Discovery obrigatória (antes de codar)

Confirmar no ambiente real, não no arquivo versionado: o **realm efetivo** de produção (Q2 do
proposal), se o Keycloak e o frontend são same-site (define se o silent renew por iframe funciona —
premissa 3), e se algum teste de integração do backend depende de password grant.

## Estado atual (verificado)

| Onde | O que há hoje |
|---|---|
| `src/services/auth/AuthService.ts:9-24` | `grant_type: 'password'` postado no token endpoint; devolve `access_token` |
| `src/context/auth/AuthProvider.tsx:5,25-33` | `@Menthoros:token` em `localStorage`; `login(token)` grava, `logout()` remove e joga para `#/auth/login` |
| `src/main.tsx:13,17` | `OpenAPI.TOKEN = async () => localStorage.getItem(...)` |
| `useUserInfo.ts:15`, `MetricasService.ts:5`, `StravaService.ts:5`, `useCalibracao`, `CoachSidebar`, `LoginPage.tsx:12` | leem a chave direto |
| `infra/keycloak/menthoros-realm.json` | client `menthoros-web`: `publicClient: true`, `standardFlowEnabled: true`, **`directAccessGrantsEnabled: true`**, `redirectUris` já cobrindo localhost:5174, Railway e menthoros.com, **sem** `pkce.code.challenge.method` |

O ponto relevante: **o Authorization Code já está habilitado**. A change é de cliente, não de infra —
no Keycloak só faltam duas linhas de atributo.

## D1 — Biblioteca OIDC

Adotar **`oidc-client-ts` + `react-oidc-context`**, não implementação própria nem `keycloak-js`.

- Contra implementação própria: `code_verifier`/`challenge` S256, `state`, `nonce`, validação de
  token e renovação são código de segurança sensível; errar é silencioso.
- Contra `keycloak-js`: amarra o frontend ao Keycloak. O backend já fala OIDC padrão, e o produto
  pode um dia trocar o IdP; a biblioteca genérica mantém a troca barata. O custo é ter de configurar
  o silent renew à mão, em vez do `check-sso` pronto do adapter.

## D2 — O token não é persistido

`oidc-client-ts` recebe um store explícito. Usar store **em memória** para o `User` (com o access
token) e deixar a continuidade da sessão por conta do **cookie de sessão do Keycloak**, não de
storage do browser. Consequência aceita: uma aba nova faz silent renew antes da primeira chamada.

Só isso já satisfaz o critério "nenhum token em `localStorage`" sem inventar cofre próprio.

## D3 — Fonte única do token **e das claims derivadas**

Hoje 8 lugares leem `localStorage` direto. Passam todos a consumir **um único getter assíncrono**
exposto pelo módulo de auth (`getAccessToken(): Promise<string>`), que resolve renovação pendente
antes de devolver.

**O token não é o único derivado.** `main.tsx:16-28` define `OpenAPI.HEADERS` decodificando o JWT
para montar `X-Tenant-ID`, e `LoginPage.tsx:41,53` decide o destino pós-login com
`destinoPorRoles(rolesDoTokenAtual())` — ambos leem a mesma chave que esta change remove. Se o
getter cobrir só o token, uma renovação em curso produz `Authorization` novo com `X-Tenant-ID`
ausente, e o backend responde 403 sem que o login pareça quebrado.

Portanto o módulo de auth expõe **token e claims na mesma leitura** (`getAccessToken`,
`getTenantId`, `getRoles`), nunca decodificação avulsa espalhada. O teste de guarda da task 1.3 vale
para as três.

`main.tsx` já usa `OpenAPI.TOKEN = async () => ...` — a assinatura assíncrona não muda, só a
implementação. `MetricasService` e `StravaService` já têm um `getAuthToken` local: viram
reexportação do getter único. Isso mata a duplicação **antes** de trocar o mecanismo, o que reduz o
diff de risco: se o getter estiver certo, os consumidores não sabem que o mecanismo mudou.

**Ordem deliberada:** centralizar primeiro (comportamento idêntico, testes verdes), migrar o
mecanismo depois. Duas etapas verificáveis em vez de uma grande.

## D4 — Callback sob `createHashRouter`

O app usa hash router. No Authorization Code o `code` volta em **query string**
(`/callback?code=...&state=...`), enquanto o roteador vive no fragmento — os dois não colidem, mas o
`redirect_uri` precisa ser uma URL que o servidor estático sirva e que a lib processe antes de o
roteador assumir.

Decisão: `redirect_uri` aponta para a **raiz da aplicação** e o processamento do retorno acontece no
bootstrap do provider, antes do render das rotas; a lib limpa a query e devolve o controle ao
roteador. Evita criar rota `#/callback`, que sob hash router é a parte frágil.

Os `redirectUris` do client já usam wildcard (`https://menthoros.com/*`), então cobrem a raiz sem
alteração. **Isto é o que precisa ser provado no walking skeleton** — é a armadilha mais provável, e
a change de LGPD já foi mordida por hash router antes.

**Voltar para a raiz não pode significar voltar para a home.** Quem saiu de `#/coach/inbox` e voltou
para `/` cai na `LandingPage`, não no destino. O destino original vai no `state` do fluxo de
autorização e é restaurado depois do callback — não é detalhe de UX, é o fluxo comum de sessão
expirada no meio do trabalho.

## D3b — Fase de bootstrap antes do guard

`ProtectedRoute.tsx:8` redireciona para o login sempre que `isAuthenticated` é `false`, e `main.tsx`
renderiza o app imediatamente. Enquanto o callback é processado ou o renew está pendente, "ainda não
sei" é indistinguível de "não autenticado" — o guard dispara, o callback perde o contexto e o par
pode entrar em laço.

Introduzir estado terciário explícito (`carregando`) que suspende o guard. É a mesma classe de bug do
spinner infinito encontrado em `add-coach-settings-page`, quando `loading` voltava a `false` com
`granted` ainda nulo: os dois vêm de tratar ausência de resposta como resposta negativa.

## D3c — O scope `organization` é obrigatório, e é opcional no client

Verificado no realm: `menthoros-web` traz `organization` em `optionalClientScopes`, **não** em
`defaultClientScopes`. O login atual funciona porque `AuthService.ts:16` pede
`scope: 'openid profile email organization'` na mão.

Consequência: o fluxo novo tem de pedir `organization` explicitamente na autorização **e em cada
renovação**. Esquecer não degrada nada — emite um token sem o claim, o `JwtTenantFilter` rejeita toda
requisição autenticada e o produto inteiro responde 403. É o modo de falha mais barato de introduzir
e o mais caro de diagnosticar, porque o login em si conclui com sucesso.

## D5 — Logout

`logout()` hoje só apaga a chave e muda o hash: a sessão no Keycloak **continua viva**, então um novo
login não pede credenciais — o usuário acha que saiu e não saiu. Passa a ser RP-initiated logout
(`end_session_endpoint` com `id_token_hint` e `post_logout_redirect_uri`), o que exige registrar
`post.logout.redirect.uris` no client — atributo que hoje não existe no realm versionado.

## D6 — Silent renew e o plano B

Renew por iframe com `prompt=none` depende de o browser enviar o cookie de sessão do Keycloak dentro
do iframe. Se Keycloak e app forem **cross-site**, os navegadores bloqueiam por padrão e o renew
falha silenciosamente — o usuário cai no login sem motivo aparente.

Se a discovery mostrar cross-site, o plano B é renovação **por redirect** no expiry (perde-se a
suavidade, mantém-se a segurança). A decisão é da discovery, não do implementador no meio da task.

## D7 — Sequência de corte

1. Deploy do frontend novo com PKCE, **com `directAccessGrantsEnabled` ainda `true`**.
2. Validar login, reload, logout e renovação em dev e em produção.
3. Só então `directAccessGrantsEnabled: false` + `pkce.code.challenge.method: S256`.

O PKCE obrigatório entra **junto com o corte**, não antes: com o grant antigo ainda ligado, exigir
PKCE não protege nada e só arrisca quebrar o fluxo velho durante a janela de convivência.

Rollback em qualquer ponto até o passo 3 = reverter o frontend. Depois do passo 3, rollback exige
reativar o grant no Keycloak — por isso o passo 3 é uma decisão consciente, não um detalhe de deploy,
e deve acontecer com janela e acesso administrativo garantidos.

⚠️ **O corte é no client `menthoros-web`, e só nele.** `KeycloakOrganizationGatewayImpl.java:129` usa
`grant_type=password` para obter token de **admin** do Keycloak — outro client, outro propósito.
Desligar password grant "no Keycloak" de forma ampla quebra a criação de organizações, que é
exatamente o que `keycloak-user-onboarding-auth` vai precisar. A task nomeia o client e verifica o
gateway admin depois do corte.

## Testes

O padrão do repo é Vitest + Testing Library. O fluxo OIDC não deve ser testado contra Keycloak real
no unitário: mockar o provider e cobrir **decisões**, não a biblioteca — presença de
`code_challenge_method=S256` na URL de autorização, ausência de token em `localStorage`, renew
falhando não vira laço, logout chamando `end_session_endpoint`.

A prova de que o fluxo real funciona é o **walking skeleton manual** (D4), não teste automatizado —
mesma lição de `athlete-onboarding-baseline`, em que o click-through real pegou três bugs que nenhum
teste com mock pegou.
