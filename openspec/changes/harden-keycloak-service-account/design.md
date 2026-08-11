# Design — harden-keycloak-service-account

## Estado atual, verificado

`KeycloakOrganizationGatewayImpl` é o único ponto que fala com a admin API. Ele obtém token em
`obterTokenAdmin()` e o método é chamado **10 vezes** no arquivo — uma por operação pública:

| Operação | Endpoint da admin API |
|---|---|
| criar organization | `POST /admin/realms/{r}/organizations` |
| convidar atleta | `POST /admin/realms/{r}/organizations/{id}/members/invite-user` |
| buscar usuário | `GET /admin/realms/{r}/users?email=…&exact=true` |
| criar usuário | `POST /admin/realms/{r}/users` |
| atualizar usuário | `PUT /admin/realms/{r}/users/{id}` |
| ler role de realm | `GET /admin/realms/{r}/roles/{role}` |
| atribuir role | `POST /admin/realms/{r}/users/{id}/role-mappings/realm` |
| adicionar membro | `POST /admin/realms/{r}/organizations/{id}/members` |
| enviar verificação | `PUT /admin/realms/{r}/users/{id}/send-verify-email` |
| remover (compensação) | `DELETE /admin/realms/{r}/users/{id}` e `…/organizations/{id}` |

Consumidores do gateway: `AssessoriaServiceImpl`, `AtletaServiceImpl`, `CoachSignupServiceImpl`.
Configuração em `KeycloakAdminProperties` (`keycloak.admin.*`): `serverUrl`, `realm`, `tokenRealm`
(default `master`), `clientId` (`admin-cli`), `username`, `password`.

No realm versionado existem três clients — `menthoros-api`, `menthoros-web`, `menthoros-test` — e
**nenhum** com `serviceAccountsEnabled`. O client novo é criação, não ajuste.

## Decisão 1 — client confidencial dedicado, não reuso do `menthoros-api`

O `menthoros-api` é público (`publicClient: true`), que é o oposto do que um service account precisa:
`client_credentials` exige segredo, e segredo em client público não existe. Além disso, misturar o
papel de *resource server* (validar JWT de usuário) com o de *cliente administrativo* faz um
comprometimento de qualquer um dos dois carregar o outro.

Client novo, `menthoros-backend-svc`, confidencial, com:

```jsonc
{
  "clientId": "menthoros-backend-svc",
  "publicClient": false,
  "serviceAccountsEnabled": true,
  "standardFlowEnabled": false,        // não faz login interativo
  "directAccessGrantsEnabled": false,  // não faz password grant — a dívida que esta change paga
  "implicitFlowEnabled": false
}
```

## Decisão 2 — roles do `realm-management`, não `realm-admin`

`realm-admin` seria um passo lateral: sai o superusuário do servidor, entra o superusuário do realm.
O ganho real está em pedir só o que a tabela acima usa. Hipótese de partida, **a validar na task 1.1
contra um Keycloak real** (é o mesmo método que a `keycloak-user-onboarding-auth` usou para descobrir
que `exact=true` era obrigatório — contrato de Keycloak se verifica, não se deduz):

- `manage-users` — criar, atualizar, apagar usuário e disparar `send-verify-email`;
- `view-users` — busca por e-mail (provavelmente coberta por `manage-users`; confirmar);
- roles de organization do `realm-management` na 26.x — **nome exato a confirmar**; é o item de maior
  incerteza da change, porque a feature é nova e a documentação do 26 mudou entre minors.

Se alguma operação não tiver role fina correspondente, a alternativa é registrar a exceção
explicitamente no design em vez de escalar tudo para `realm-admin` em silêncio.

## Decisão 3 — ordem de corte: infra primeiro, backend depois, sem janela

O client pode existir sem ninguém usá-lo — é inerte. O backend **não** pode trocar antes de o client
existir nos dois ambientes: erraria toda operação de Keycloak, incluindo o auto-cadastro público.

```
1. menthoros-infra: client no realm + sync no HomeLab e no Railway   (inerte, sem efeito)
2. segredo do client nas variáveis dos dois ambientes                 (inerte)
3. menthoros-backend: troca do grant + remoção de username/password   (corta aqui)
```

Não há necessidade de suporte aos dois grants ao mesmo tempo: os passos 1 e 2 não têm efeito
observável, então o passo 3 pode ser um corte seco. Um fallback "tenta client_credentials, cai para
password" seria pior — deixaria o vetor de pé indefinidamente e ninguém removeria depois.

**Rollback:** reverter o passo 3 (o commit do backend). Enquanto o client existir, o rollback é só
código, sem tocar em realm.

## Decisão 4 — o `master` continua acessível a humanos

A change tira a *aplicação* do `master`. Desligar o password grant do `admin-cli` no `master`
protegeria de vez, mas é também o caminho por onde um operador entra quando o resto falhou — e a
`disable-ropc-direct-grant` já registrou o custo de descobrir tarde que um corte amplo derruba algo
que ninguém mapeou (lá, o gateway admin). Fica **fora** desta change, como pergunta em aberto no
proposal.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **Roles finas não cobrem alguma operação** e a descoberta acontece só em produção. | Task 1.1 exercita **as dez operações** contra Keycloak real com o service account, antes de qualquer mudança no backend. É o mesmo padrão que achou o `exact=true` e o `400 User is disabled` na change anterior. |
| 🔴 **Sync do realm derruba organizations.** O `menthoros-realm.json` não declara `organizationsEnabled`, mas a API funciona no HomeLab — sinal de divergência entre arquivo e servidor. Sincronizar sem entender isso pode desligar a feature e quebrar o signup inteiro. | Task 0.1: comparar arquivo versus servidor **antes** de tocar no realm. O `menthoros-infra/keycloak/README.md` já registra que sync cego sobre atributo de realm derruba coisa (foi assim com o `loginTheme`). |
| 🟠 **Segredo do client vira novo item de gestão** em dois ambientes, sem rotação automática. | Aceito e declarado fora de escopo. O ganho já é grande: o segredo passa a valer para um realm, não para o servidor. |
| 🟠 **Corte seco erra em um ambiente e o outro fica bom** — sintoma é 502 em toda operação de Keycloak, incluindo o cadastro público. | O smoke da task 3.x roda nos **dois** ambientes antes de considerar a change entregue; a sonda do honeypot (runbook do signup) confirma o caminho anônimo em cada um. |
| 🟡 Token por operação (10 chamadas) fica igual de ineficiente. | Explicitamente fora de escopo; registrado no proposal para virar change própria. |

## O que este design **não** resolve

O backend continua com uma credencial capaz de criar usuários e atribuir roles no realm do produto,
alcançável por requisição anônima via `/api/public/coach-signups`. Isso é o desenho do produto, não um
defeito: o auto-cadastro **precisa** provisionar. O que muda é o tamanho do estrago se o processo for
comprometido — de "servidor de identidade inteiro" para "usuários e organizações do realm
`menthoros`". Quem quiser reduzir mais que isso está falando de outra arquitetura de provisionamento
(fila, worker isolado), e isso é outra conversa.
