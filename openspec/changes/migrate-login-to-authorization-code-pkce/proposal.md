# migrate-login-to-authorization-code-pkce — Login por Authorization Code + PKCE

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-03

## Problema

O frontend autentica por **Resource Owner Password Credentials** — `AuthService.ts:9-24` posta
`grant_type: 'password'` com usuário e senha direto no endpoint de token do Keycloak e guarda o
`access_token` em `localStorage` sob `@Menthoros:token`.

Esse grant foi **removido** do OAuth 2.1 (draft-ietf-oauth-v2-1, mar/2026), não apenas
desencorajado: ele expõe a credencial ao cliente, quebra a autorização delegada e **impede MFA**.
Enquanto o login for esse, a aplicação não consegue oferecer segundo fator, federação, nem
recuperação de conta pelos fluxos nativos do Keycloak — tudo passaria a exigir tela própria
manipulando senha.

O gatilho é o bloco de auto-cadastro: `keycloak-user-onboarding-auth` assume no critério de aceite 4
que o coach recém-cadastrado "entra pelo Authorization Code + PKCE **usado pela aplicação**". Não
existe. Abrir cadastro público sobre um grant retirado significa que **todo coach novo nasce** nesse
modelo, e o volume de contas a migrar só cresce a partir daí. Por isso esta change vem antes, e não
depois.

## Por que agora — o argumento de venda

O destravamento do auto-cadastro é o gatilho, mas não é o argumento mais forte. **Enquanto o login
for ROPC, o produto não pode oferecer MFA** — o grant não comporta segundo fator por definição.

O Menthoros processa dado de saúde de atleta sob LGPD. Segurança de acesso é objeção previsível na
mesa de uma assessoria, e "não temos MFA e não temos como ter" é uma resposta que custa contrato.
Esta change não entrega MFA; ela remove o impedimento estrutural para entregá-lo quando a primeira
venda exigir.

Posicionamento honesto: isto é **table-stakes, não diferenciação**. Nenhum coach escolhe o Menthoros
por causa do fluxo de login. A change existe para remover objeção de compra e destravar roadmap, não
para ganhar cliente.

## Escopo

1. Substituir o login por **Authorization Code + PKCE (S256)** contra o Keycloak, usando biblioteca
   OIDC mantida em vez de implementação própria do fluxo.
2. **Access token deixa de ser persistido**: passa a viver em memória, com a sessão sobrevivendo a
   reload via *silent renew* (`prompt=none`) contra o cookie de sessão do Keycloak.
3. Migrar os **8 pontos de leitura direta** de `localStorage` para uma única fonte de token, e
   remover a chave `@Menthoros:token`.
4. Logout passa a encerrar a sessão no Keycloak (RP-initiated logout), não só limpar estado local.
5. Configuração do client `menthoros-web` em `infra/keycloak/menthoros-realm.json`:
   `pkce.code.challenge.method = S256` e, como **última etapa**, `directAccessGrantsEnabled = false`.
6. Atualizar a Política de Privacidade, que hoje afirma que o token é guardado em `localStorage`.

## Fora do escopo

- **BFF com cookie httpOnly** — mais seguro, mas move a sessão para o backend e vira change própria.
- Backend: o resource server já valida JWT e não muda. Nenhum endpoint novo, nenhuma migration.
- MFA, federação social e recuperação de senha: esta change **destrava** esses fluxos, não os entrega.
- Tela de login própria: passa a ser a do Keycloak. Customização visual do tema é trabalho separado.
- Renomear/alterar claims, roles ou o `JwtTenantFilter`.

## Dependências e ordem

- **Bloqueia parcialmente** `keycloak-user-onboarding-auth` (Bloco 3). O bloqueio é dos **blocos 0–4**
  (fluxo PKCE existindo e provado), não da change inteira: o critério de aceite 4 do signup exige que
  o fluxo *exista e funcione*, não que o grant antigo já tenha sido cortado. O **bloco 5** (política,
  deploy, corte do ROPC, remoção do `AuthService`) é hardening — o signup pode entrar em discovery e
  design em paralelo a ele. Nada mais do Bloco 3 depende desta change.
- O client `menthoros-web` **já** tem `standardFlowEnabled: true` e `redirectUris` para localhost,
  Railway e produção — a infra está meio pronta; falta PKCE e o corte do grant antigo.
- Acopla com `add-coach-lgpd-consent` (entregue): mudar o armazenamento do token torna falsa uma
  afirmação da Política de Privacidade vigente. Ver Open Questions.

## Critérios de aceite

- **Dado** um usuário não autenticado, **quando** acessa rota protegida, **então** é redirecionado ao
  Keycloak e retorna autenticado, com `code_challenge_method=S256` presente na requisição de
  autorização.
- **Dado** um fluxo de autorização, **quando** o `code` é interceptado e reapresentado por outro
  cliente sem o `code_verifier` original, **então** a troca por token falha.
- **Quando** o usuário está autenticado, **então** `localStorage` **não** contém access token nem
  refresh token, e a chave `@Menthoros:token` não existe.
- **Dado** um usuário autenticado, **quando** recarrega a página, **então** a sessão é restaurada sem
  novo prompt de credenciais.
- **Dado** um usuário autenticado, **quando** faz logout, **então** a sessão no Keycloak é encerrada e
  um novo acesso a rota protegida exige autenticação de novo (não basta ter limpado estado local).
- **Dado** o token expirado durante uso, **quando** uma chamada de API é feita, **então** o token é
  renovado silenciosamente e a chamada conclui, sem derrubar o usuário para o login.
- **Dado** o silent renew falhando (sessão do Keycloak encerrada), **então** o usuário é levado ao
  login sem laço de redirecionamento.
- **Quando** o coach entra pelo fluxo novo, **então** o JWT carrega `tenant_id` e role, e o gate de
  consentimento LGPD e o roteamento coach/atleta funcionam como hoje.
- **Dado** o client configurado, **quando** se tenta `grant_type=password` no token endpoint,
  **então** o Keycloak recusa (`directAccessGrantsEnabled = false`).

## Métrica de sucesso

**Primária (rotina do treinador — não pode piorar):** taxa de login concluído com sucesso e tempo
até o dashboard permanecem iguais ou melhores que a linha de base medida antes do corte. Autenticação
é caminho obrigatório: o ganho aqui é não introduzir atrito, não reduzi-lo.

**Secundária (o que a change destrava):** zero credenciais trafegando pela aplicação — hoje 100% dos
logins passam a senha pelo frontend; depois, 0. É a pré-condição para MFA, que é requisito de venda
para assessoria que trate dado de saúde.

## Riscos e mitigações

Os cinco primeiros vieram do pré-mortem cross-model (Codex) e **foram verificados no código** antes
de entrar aqui — nenhum é hipotético.

| Risco | Mitigação |
|---|---|
| 🔴 **`organization` é optional scope** no client `menthoros-web` (`defaultClientScopes` não o inclui). Se o fluxo novo não pedir explicitamente — na autorização **e em cada renew** — o JWT sai sem o claim, o `JwtTenantFilter` rejeita **toda** requisição autenticada e o app inteiro para com 403. Não é degradação: é queda total. | Scope explícito em toda requisição de token; critério de aceite dedicado; o walking skeleton verifica o claim no token emitido, não só o login concluir. |
| 🔴 **`X-Tenant-ID` é derivado do JWT no cliente** (`main.tsx:16-28` decodifica o token do `localStorage` para montar o header). A "fonte única de token" precisa cobrir o header também, ou durante uma renovação sai `Authorization` novo com `X-Tenant-ID` ausente. | O getter único expõe token **e** claims derivadas da mesma leitura; teste cobrindo a coerência dos dois durante renew. |
| 🔴 **Retorno do callback perde o destino:** o `redirect_uri` vai para a raiz e, sob `createHashRouter`, o usuário que saiu de `#/coach/inbox` volta para `/` — a `LandingPage`, não o destino. | Persistir o destino no `state` do fluxo de autorização e restaurar após o callback; caso de teste explícito. |
| 🔴 **Corrida entre `ProtectedRoute` e o callback:** `ProtectedRoute.tsx:8` redireciona para o login quando `isAuthenticated` é `false`, e hoje `main.tsx` renderiza o app direto, sem fase de bootstrap. Enquanto o callback ou o renew estiverem em curso, o guard pode disparar e criar laço. | Estado explícito de "carregando autenticação" que suspende o guard; teste de renew pendente sem laço. |
| 🔴 **Silent renew provavelmente cross-site:** os ambientes versionados põem o Keycloak em domínio Railway e o app em `menthoros.com`. Cookie de terceiro em iframe é bloqueado por padrão em Safari e Firefox — o renew falha **em silêncio** e o usuário cai no login sem motivo aparente. | Task 0.2 decide iframe vs redirect **com base no domínio real de cada ambiente**, antes de implementar. É a premissa mais provável de estar errada. |
| ⚠️ **Existe outro password grant no backend** — `KeycloakOrganizationGatewayImpl.java:129` usa `grant_type=password` para obter token de admin. Não é o client `menthoros-web`, mas "desligar o password grant" aplicado ao client errado quebra a criação de organizações, que é justamente o que o signup vai usar. | A task de corte nomeia o client explicitamente e verifica que o gateway admin segue funcionando depois. |
| ⚠️ **Roteamento pós-login depende do token no storage** — `LoginPage.tsx:41,53` decide o destino com `destinoPorRoles(rolesDoTokenAtual())`, lendo exatamente a fonte que esta change remove. | Substituto derivado do estado de usuário da lib; walking skeleton testa coach **e** atleta. |
| **Perda de acesso em produção** se o fluxo novo falhar após desligar o ROPC | O corte de `directAccessGrantsEnabled` é a **última** task, depois do fluxo novo validado em dev e produção. Até lá os dois convivem e o rollback é reverter o frontend. **Depois do corte o rollback deixa de ser "reverter o frontend"** e passa a exigir acesso admin ao Keycloak — fazer o corte com janela e acesso garantidos. |
| **Hash router × callback OIDC** — o app usa `createHashRouter`; o `code` volta na query string e o roteador consome o fragmento | Definir e testar a rota de callback explicitamente. Já mordeu o projeto antes: em `add-coach-lgpd-consent`, `href` absoluto não resolveu sob `createHashRouter` e o teste que "cobria" passava para a forma quebrada. |
| **Laço de redirecionamento** entre guard de rota e silent renew | Critério de aceite dedicado; teste de renew falhando. |
| **Sessão mais frágil** — token em memória depende do cookie de sessão do Keycloak; navegador bloqueando cookie de terceiro em iframe pode quebrar o renew silencioso | Confirmar se Keycloak e app compartilham site; se não, usar renew por redirect. **Premissa a validar antes de implementar** (ver Open Questions). |
| **Re-consentimento LGPD em massa** disparado por mudança de texto da política | Decidir com o founder se a alteração é material (bump) ou correção editorial (sem bump). Ver Open Questions. |
| Dependência nova no frontend | Justificada: implementar PKCE à mão (verifier, challenge S256, state, nonce, rotação) é código de segurança sensível sem razão para ser próprio. |

## Open Questions & Assumptions

**Premissas assumidas (validar na discovery):**

1. O backend **não muda**: o resource server já valida JWT emitido pelo mesmo realm, e a mudança de
   grant não altera claims. *Verificado em parte — `JwtTenantFilter` lê o token, não o fluxo que o
   emitiu; confirmar que nenhum teste de integração depende de password grant.*
2. O client `menthoros-web` é público e já aceita Authorization Code — **verificado** em
   `infra/keycloak/menthoros-realm.json`.
3. Keycloak e frontend estão em domínios que permitem silent renew por iframe. **Não verificado** — se
   forem cross-site, o navegador bloqueia o cookie e o renew silencioso não funciona; nesse caso o
   desenho muda para renew por redirect.

**Em aberto:**

- **Q1 — A mudança de armazenamento do token exige bump de versão da Política de Privacidade?**
  `politicaPrivacidadeConteudo.ts:281` afirma que "o token de autenticação JWT é armazenado em
  localStorage (não em cookie)". Depois desta change isso deixa de ser verdade. Como
  `add-coach-lgpd-consent` versiona por data de vigência, um bump força **re-consentimento de todos os
  coaches**. Decisão do founder, com insumo jurídico: correção editorial ou alteração material?
- **Q2 — O realm de produção é o mesmo `menthoros` do arquivo versionado?** O `env.ts` usa
  `menthoros` como default e a entidade `Assessoria` carrega `keycloakRealm = "menthoros-app"`.
  A divergência precisa ser resolvida antes de mexer em config de client, ou a mudança é aplicada no
  realm errado.
- **Q3 — Sessões vigentes na virada:** usuários com token válido em `localStorage` no momento do
  deploy devem ser deslogados explicitamente (limpando a chave) ou deixados expirar naturalmente?
- **Q4 — Existe linha de base da métrica primária?** A métrica diz "igual ou melhor que antes do
  corte", mas não há evidência de telemetria de taxa de sucesso de login ou tempo até o dashboard. Sem
  instrumentar antes, "não piorou" é afirmação não-falsificável. Confirmar na discovery (task 0.6) se
  existe; se não existir, decidir entre instrumentar ou trocar a métrica por algo observável.
- **Q5 — Prioridade (levantada no product review, decisão do founder):** o gate de enforcement LGPD do
  Bloco 3 está `off` esperando validação jurídica e publicação dos Termos. Ou seja, mesmo com esta
  change e o signup prontos, **o auto-cadastro não abre até um bloqueio não-técnico sair do caminho**.
  Isso não invalida a change — o ROPC é dívida que cresce de qualquer forma —, mas muda a urgência
  relativa. Vale confirmar se este é o melhor uso do único dev agora, ou se algo do Radar tem caminho
  mais curto até caixa.
