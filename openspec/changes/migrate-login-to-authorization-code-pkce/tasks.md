# Tasks — migrate-login-to-authorization-code-pkce (M · Full · frontend + infra)

> Escopo: `apps/menthoros-front` e `infra/keycloak/menthoros-realm.json`. **Qualquer diff em
> `apps/menthoros-backend/src/main` é sinal de que algo saiu do escopo** — investigar antes de seguir.
>
> Validação padrão do frontend: `npm run lint && npm run build && npm run test:run`.
>
> Anchors verificados em 2026-08-03 contra `develop`.

## 0. Discovery e decisões (bloqueia o resto)

- [ ] 0.1 Confirmar o **realm efetivo** em dev e produção (Q2): `env.ts:23` usa `menthoros` como
      default e `Assessoria.keycloakRealm` traz `menthoros-app`. Registrar qual é a verdade antes de
      alterar qualquer config de client.
      *verify:* realm confirmado por consulta ao Keycloak real, não por leitura de arquivo.
- [ ] 0.2 Determinar se Keycloak e frontend são **same-site** em cada ambiente (premissa 3 / D6).
      Decide silent renew por iframe vs. por redirect.
      *verify:* decisão registrada no design com a evidência (domínios de cada ambiente).
- [ ] 0.3 Confirmar que nenhum teste de integração do backend depende de password grant.
      *verify:* busca por `grant_type`/`password` em `apps/menthoros-backend/src/test` sem ocorrência relevante.
- [ ] 0.4 **Decisão do founder (Q1):** mudar o texto da Política de Privacidade sobre armazenamento do
      token é alteração material (bump de versão + re-consentimento de todos os coaches) ou correção
      editorial? Bloqueia a task 5.1.
      *verify:* decisão registrada no proposal, com a justificativa.
- [ ] 0.5 **Decisão (Q3):** sessões vigentes na virada são invalidadas explicitamente ou expiram sozinhas?
      *verify:* decisão registrada; se invalidar, vira task no bloco 4.
- [ ] 0.6 **Linha de base da métrica (Q4):** confirmar se existe telemetria de taxa de sucesso de
      login e tempo até dashboard. Se não existir, decidir entre instrumentar antes do corte ou trocar
      a métrica por algo observável — sem isso, "não piorou" não é verificável.
      *verify:* fonte da linha de base nomeada, ou métrica substituída no proposal.

## 1. Fonte única do token (sem trocar o mecanismo)

Etapa deliberadamente neutra: comportamento idêntico, `localStorage` ainda em uso. Serve para isolar
o risco do bloco 2.

- [ ] 1.1 Criar a fonte única — `getAccessToken()` **e as claims derivadas** `getTenantId()` /
      `getRoles()` (D3), ainda lendo a chave atual. As três saem da mesma leitura.
- [ ] 1.2 Migrar os 8 consumidores para os getters: `main.tsx:13` (`OpenAPI.TOKEN`), **`main.tsx:16-28`
      (`OpenAPI.HEADERS` / `X-Tenant-ID`)**, `useUserInfo.ts:15`, `MetricasService.ts:5`,
      `StravaService.ts:5`, `useCalibracao`, `CoachSidebar`, `AuthProvider.tsx`, e **`LoginPage.tsx:41,53`
      (`rolesDoTokenAtual`)**. Nenhuma leitura direta de `@Menthoros:token` nem decodificação avulsa de
      JWT deve sobrar fora do módulo de auth.
- [ ] 1.3 Teste de guarda: nenhuma ocorrência de `@Menthoros:token` nem de decode de JWT fora do
      módulo de auth (no espírito do `forbidden-uses.ts` já usado no repo).
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run` — suíte verde, zero mudança
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

- [ ] 3.1 Registrar `post.logout.redirect.uris` no client `menthoros-web` (hoje ausente) —
      **pré-requisito da 2.7**, então precisa ir antes do teste manual do logout.
- [ ] 3.2 Aplicar em dev e confirmar que o realm versionado bate com o realm real (0.1).
- [ ] 3.3 Validação: login completo em dev pelo fluxo novo, com o grant antigo **ainda ligado**.

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
- [ ] 4.9 Se a 0.5 decidiu invalidar sessões vigentes: limpeza da chave antiga no bootstrap.

## 5. Documento e corte do grant antigo

- [ ] 5.1 Atualizar `politicaPrivacidadeConteudo.ts:281` conforme a decisão da 0.4. Se houve bump,
      seguir o procedimento de versão de `add-coach-lgpd-consent`.
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
