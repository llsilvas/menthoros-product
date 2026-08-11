# Capability — keycloak-user-onboarding-auth

> **Reescrita em 2026-08-07.** A versão anterior especificava
> `POST /api/public/auth/login` recebendo `username`/`password` e devolvendo `accessToken`, além de
> `POST /api/admin/usuarios` para provisionamento administrativo. Isso é **Resource Owner Password
> Credentials** — o grant que a `disable-ropc-direct-grant` desligou no realm em 2026-08-06, e que a
> própria proposal desta change proíbe.
>
> Como `specs/` vira contrato canônico no arquivamento, manter aquele texto consagraria de volta o
> que acabamos de eliminar. O gate de DoR reprovou por isso, em dois revisores independentes.

## ADDED Requirements

### Requirement: Backend MUST expor endpoint público de auto-cadastro de assessoria

O sistema SHALL aceitar o cadastro público de um coach e sua assessoria em uma única requisição, e
MUST provisionar, de forma coordenada, a `Assessoria` local, a organização e o usuário no Keycloak, e
o `Usuario` local.

O endpoint MUST NOT retornar token de acesso, refresh token ou senha. A autenticação subsequente
acontece **exclusivamente** pelo fluxo Authorization Code + PKCE já existente no frontend.

#### Scenario: Cadastro com dados válidos
- **WHEN** `POST /api/public/coach-signups` recebe nome, e-mail, senha, nome da assessoria e slug válidos e disponíveis
- **THEN** o sistema cria a `Assessoria` no plano BASIC (`maxAtletas=10`, `maxTecnicos=1`), provisiona organização/usuário/role no Keycloak, cria o `Usuario` local e retorna `201` **sem token algum no corpo**

#### Scenario: Slug já em uso
- **WHEN** o slug informado já pertence a outra assessoria
- **THEN** o sistema retorna `409` e **não** cria nada — nem local, nem no Keycloak

#### Scenario: E-mail já cadastrado
- **WHEN** o e-mail já existe como usuário
- **THEN** o sistema retorna `409` sem criar duplicidade e **sem revelar** se o e-mail existe por outro canal que não a própria resposta do cadastro

#### Scenario: Reenvio da mesma requisição (idempotência)
- **WHEN** a mesma requisição é submetida duas vezes (duplo clique, retry de rede) com a mesma chave de idempotência
- **THEN** o sistema retorna o mesmo resultado da primeira, **sem** criar segunda assessoria, segunda organização ou segundo usuário

---

### Requirement: O login após o cadastro MUST usar Authorization Code + PKCE

O sistema SHALL NOT expor endpoint de login por senha no backend. O backend **não** intermedeia
credenciais: quem autentica é o Keycloak, pelo fluxo de redirecionamento que o frontend já
implementa.

#### Scenario: Usuário conclui o cadastro e entra
- **WHEN** o cadastro retorna `201` e o usuário decide entrar
- **THEN** o frontend inicia o fluxo Authorization Code + PKCE contra o Keycloak, **por ação do usuário**, e nenhuma senha trafega pelo backend

#### Scenario: Tentativa de login por senha no backend
- **WHEN** qualquer cliente tenta obter token enviando senha a um endpoint do backend
- **THEN** esse endpoint **não existe** — é requisito ausente por decisão, não lacuna de implementação

---

### Requirement: A rota pública MUST atravessar os filtros de tenant e consentimento

O sistema SHALL garantir que o cadastro funcione **sem** JWT e **sem** tenant, mesmo quando o cliente
envia um `Authorization` residual — o frontend injeta o header globalmente.

> Verificado em 2026-08-07: o `JwtTenantFilter` isenta apenas `/api/admin/**` e o caminho **exato**
> `/api/v1/waitlist`. Sem isentar a rota nova, um token sem `tenant_id` a derruba. O
> `LgpdConsentInterceptor` já libera requisição sem JWT/sem tenant, então ele **não** precisa de
> mudança — mas depende do filtro anterior não rejeitar antes.

#### Scenario: Cadastro sem nenhum header de autorização
- **WHEN** `POST /api/public/coach-signups` chega sem `Authorization`
- **THEN** a requisição é processada normalmente

#### Scenario: Cadastro com Authorization residual de outra sessão
- **WHEN** a requisição chega com um `Authorization` cujo token não tem `tenant_id`
- **THEN** a requisição é processada normalmente — o filtro de tenant **não** a rejeita

#### Scenario: Cadastro não é bloqueado pelo gate de consentimento
- **WHEN** o enforcement LGPD está em `on` e o cadastro cria `Usuario` **antes** de qualquer aceite
- **THEN** a criação não é bloqueada — o aceite acontece na primeira sessão autenticada, não no formulário público

---

### Requirement: O provisionamento MUST compensar em ordem inversa e registrar o que não compensar

Não há transação entre Postgres e Keycloak. O sistema SHALL desfazer, na ordem inversa da criação, os
recursos já criados quando uma etapa falha — e, quando a própria compensação falhar, MUST registrar
`RECONCILIATION_REQUIRED` com correlation ID e os identificadores externos.

**Nenhuma falha pode deixar conta utilizável sem tenant local.** É pior que falhar: o usuário
consegue entrar e encontra um produto quebrado.

#### Scenario: Falha ao criar o usuário no Keycloak, após a organização
- **WHEN** a organização é criada e a criação do usuário falha
- **THEN** o sistema remove a organização, não persiste `Usuario`, e retorna erro controlado
- **AND** a `Assessoria` criada no passo 1 é **removida** — não fica órfã nem é contabilizada como
  assessoria ativa. O rastro da tentativa permanece em `tb_signup_provisioning`

#### Scenario: Falha ao persistir o `Usuario` local, após o Keycloak
- **WHEN** organização e usuário existem no Keycloak e a persistência local falha
- **THEN** o sistema remove usuário e organização no Keycloak, nessa ordem, e retorna erro controlado
- **AND** a `Assessoria` recebe o mesmo tratamento: **removida**, nunca deixada para trás

#### Scenario: O slug volta a ficar disponível após falha
- **WHEN** um cadastro falha e a `Assessoria` é removida pela compensação
- **THEN** o slug daquela tentativa **não fica preso** — uma nova tentativa com o mesmo slug é aceita
- **AND** isso decorre da remoção, não de índice parcial: linha mantida com o `dominio` prenderia o
  slug pela UNIQUE existente

#### Scenario: A compensação falha
- **WHEN** a remoção no Keycloak falha durante a compensação
- **THEN** o sistema registra uma operação `RECONCILIATION_REQUIRED` com correlation ID e os IDs
  externos — **sem senha e sem token** — e retorna erro controlado
- **AND** registra o `assessoria_id` **quando ele já existir**; falha anterior à criação da
  assessoria não tem tenant a registrar, e nesse caso o `correlation_id` é o que amarra o rastro

#### Scenario: Estado residual nunca é utilizável
- **WHEN** qualquer falha parcial ocorre
- **THEN** não existe caminho em que o usuário autentique com sucesso e opere sem `Assessoria`/tenant local

---

### Requirement: A verificação de e-mail MUST usar o fluxo nativo do Keycloak

O sistema SHALL disparar a verificação pelo próprio Keycloak, sem construir e-mail próprio.

> **Corrigido em 2026-08-09, contra o Keycloak 26.7 real.** A versão anterior mandava criar o
> usuário **desabilitado** e habilitá-lo só após o envio do verify-email. Essa ordem é
> impossível: `PUT send-verify-email` num usuário desabilitado responde
> `400 {"errorMessage":"User is disabled"}` e **nenhum e-mail sai**. A barreira passa a ser a
> required action `VERIFY_EMAIL` somada a `verifyEmail: true` no realm — o Keycloak barra o
> login na tela de verificação. O objetivo ("conta não utilizável sem verificação") é o mesmo;
> o mecanismo é outro.
>
> Pré-condição de infraestrutura, resolvida em 2026-08-07: o realm passou a ter SMTP configurado e
> versionado, com envio validado em HomeLab e Railway. Antes disso, o cadastro terminaria em conta
> que nunca se confirma.

#### Scenario: O usuário nasce impedido de operar até verificar o e-mail
- **WHEN** o usuário é criado no Keycloak
- **THEN** ele é criado com `emailVerified: false` e a required action `VERIFY_EMAIL`, e **não**
  consegue concluir o login enquanto não verificar
- **AND** a barreira é a required action somada a `verifyEmail: true` no realm — **não** o flag
  `enabled`, que o Keycloak exige ligado para sequer aceitar enviar o e-mail

#### Scenario: Cadastro dispara a verificação
- **WHEN** o provisionamento conclui com sucesso
- **THEN** o Keycloak envia o e-mail de verificação ao endereço informado

#### Scenario: Envio de e-mail falha
- **WHEN** o SMTP está indisponível no momento do cadastro
- **THEN** a conta **não** fica em estado utilizável sem verificação: o sistema trata como falha da etapa e aplica a política de compensação/reconciliação

---

### Requirement: O cadastro público MUST resistir a abuso

Endpoint público, anônimo e que cria recursos em dois sistemas — é alvo natural de automação.

> Já existe precedente no módulo: o `WaitlistRateLimitFilter` protege `/api/v1/waitlist` com contagem
> por IP a partir de `getRemoteAddr()` (não do XFF cru, que é falsificável). A decisão de generalizar
> esse filtro ou criar outro é da discovery — mas **não** pode resultar em dois mecanismos com
> políticas divergentes.

#### Scenario: Excesso de tentativas do mesmo IP
- **WHEN** um mesmo IP excede o limite configurado em uma janela
- **THEN** o sistema retorna `429` sem criar recurso algum

#### Scenario: Payload acima do limite
- **WHEN** o corpo da requisição excede o tamanho máximo
- **THEN** o sistema rejeita antes de processar

---

### Requirement: Segredos MUST NOT aparecer em log ou resposta

#### Scenario: Falha durante o provisionamento
- **WHEN** qualquer etapa falha
- **THEN** os logs registram correlation ID, tenant, e-mail e IDs externos — **nunca** senha, access token ou refresh token

#### Scenario: Resposta de sucesso
- **WHEN** o cadastro conclui
- **THEN** o corpo da resposta não contém senha nem token de espécie alguma
