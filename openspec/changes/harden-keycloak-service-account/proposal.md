# harden-keycloak-service-account

**Tamanho:** M · **Trilha:** Full

Dois repos (`menthoros-infra` para o realm, `menthoros-backend` para o mecanismo de auth), troca de
credencial em dois ambientes e risco de segurança direto. Qualquer um dos três já subiria para Full.

## Problema

O backend fala com a admin API do Keycloak autenticando como **`admin` do realm `master`, por
password grant**:

```java
// KeycloakOrganizationGatewayImpl.obterTokenAdmin()
form.add("grant_type", "password");
form.add("client_id", props.getClientId());   // admin-cli
form.add("username", props.getUsername());    // admin
form.add("password", props.getPassword());
// POST /realms/{tokenRealm}/protocol/openid-connect/token   ← tokenRealm = master
```

São três problemas empilhados, e o terceiro é novo:

1. **É o superusuário do servidor, não do realm.** O admin do `master` administra **todos** os
   realms, não só o `menthoros`. O backend precisa criar usuário, atribuir role e gerir organization
   dentro de um realm — nada disso exige poder sobre o servidor.
2. **É password grant, o grant que a `disable-ropc-direct-grant` existiu para eliminar.** Aquela
   change desligou `directAccessGrantsEnabled` no `menthoros-web` e desligou o `menthoros-test`. O
   `admin-cli` no realm `master` **não foi tocado** — o vetor continua de pé, num caminho que
   ninguém audita porque não é o login do produto.
3. **A superfície mudou em 2026-08-11.** Até o merge do `keycloak-user-onboarding-auth` (PR #65),
   essa credencial só era alcançável por caminho autenticado. Agora `POST /api/public/coach-signups`
   é **anônimo** e chega ao mesmo gateway: uma requisição sem identidade nenhuma faz o backend
   apresentar o superusuário do Keycloak. A dívida foi registrada no próprio PR, com a ressalva de
   resolver "antes de ligar a flag em produção" — e a decisão de manter o endpoint habilitado foi
   tomada depois, com o registro de que isso é sabido.

O que **não** é o problema: o segredo não vaza pela API (o endpoint nunca devolve token nem senha, e
há teste para isso). O risco é de *blast radius* — se o processo do backend for comprometido, o que
o atacante ganha não é o tenant: é o servidor de identidade inteiro.

## Proposta

Trocar o password grant do superusuário por um **service account com `client_credentials`**, com as
roles mínimas do `realm-management` do realm `menthoros`.

- `menthoros-infra`: client confidencial novo no `menthoros-realm.json`, `serviceAccountsEnabled`,
  `standardFlowEnabled: false`, `directAccessGrantsEnabled: false`, e apenas as roles de
  `realm-management` que as dez operações do gateway usam.
- `menthoros-backend`: `obterTokenAdmin()` passa a pedir `grant_type=client_credentials` com
  `client_id` + `client_secret`; `keycloak.admin.username`/`password` deixam de existir.
- Ambientes: segredo do client em HomeLab e Railway; o admin do `master` deixa de ser credencial de
  aplicação.

## Escopo

**Dentro:**
- Client de service account no realm versionado + roles mínimas.
- Troca do grant no gateway e das propriedades de configuração.
- Provisionamento do segredo nos dois ambientes e remoção das variáveis antigas.

**Fora (não fazer aqui):**
- **Cache de token.** Hoje `obterTokenAdmin()` é chamado **10 vezes** no gateway, uma por operação —
  um token novo a cada chamada. É desperdício real, mas é problema de eficiência, não de segurança,
  e misturar os dois faz a revisão de uma mudança sensível discutir latência. Change própria.
- Rotação automática do segredo.
- Mudar o mecanismo de auth do convite de atleta para outro caminho — ele usa o mesmo gateway e vem
  junto de graça; o que fica fora é redesenhá-lo.
- Trocar o admin do `master` por outro humano/senha: o objetivo é a aplicação parar de usá-lo, não
  gerir a conta de administração.

## Critérios de aceite

1. **Given** o backend configurado com o service account, **when** um auto-cadastro completo é
   executado, **then** organização, usuário, role e envio de e-mail acontecem como antes, e **nenhum
   token do realm `master`** é solicitado.
2. **Given** o service account, **when** ele tenta uma operação fora do realm `menthoros` (por
   exemplo listar realms), **then** o Keycloak responde `403` — o privilégio é do realm, não do
   servidor.
3. **Given** a configuração sem `keycloak.admin.password`, **when** a aplicação sobe, **then** ela
   sobe normalmente; a propriedade não existe mais e nada a lê.
4. **Given** o segredo do client ausente ou inválido, **when** uma operação de Keycloak é tentada,
   **then** a falha é `KeycloakIntegrationException` → **502** com mensagem sem o segredo, e o log
   não contém o valor.
5. **Given** o realm sincronizado pelo `sync-realm.sh`, **when** o client é aplicado, **then** ele
   nasce com `standardFlowEnabled: false` e `directAccessGrantsEnabled: false` — um service account
   não faz login interativo nem password grant.

## Métrica de sucesso

Não é uma feature do treinador; a métrica honesta é de exposição, não de rotina:

**Zero uso de credencial de `master` pela aplicação**, verificável por duas evidências —
`grep` por `grant_type=password` no backend não retorna nada, e os logs de autenticação do Keycloak
deixam de registrar autenticação de `admin` no realm `master` originada do backend.

Efeito indireto na rotina do treinador: nenhum. Esta change compra a permissão de manter o
auto-cadastro público ligado sem que um comprometimento do backend entregue o servidor de identidade.

## Open Questions & Assumptions

**Premissas assumidas (verificar na 1.x antes de implementar):**

- As dez operações do gateway se resolvem com `manage-users`, `view-users` e as roles de organization
  do `realm-management`. **Não verificado** — o conjunto exato de roles é a primeira task, e é o
  ponto onde a estimativa pode crescer.
- O `menthoros-realm.json` versionado não declara `organizationsEnabled` (a chave veio `None` na
  leitura do arquivo), embora a API de organizations funcione no HomeLab. Antes de mexer no realm é
  preciso entender se a feature está ligada por outro caminho — sincronizar um realm que perde
  organizations quebraria o signup inteiro.
- Existe um único backend consumindo essa credencial. Os três serviços que a usam
  (`AssessoriaServiceImpl`, `AtletaServiceImpl`, `CoachSignupServiceImpl`) passam pelo mesmo gateway.

**Em aberto:**

- **Ordem de corte.** O client pode existir antes de o backend usá-lo (inofensivo), mas o backend
  não pode trocar antes de o client existir nos dois ambientes. Fica decidido no `design.md`.
- **O `admin-cli`/`master` deve ser bloqueado depois?** Parar de usar não é impedir de usar. Desligar
  o password grant no `master` protege de vez, mas também é o caminho de emergência de um operador —
  decisão explícita, não automática.
