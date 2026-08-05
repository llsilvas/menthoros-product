## MODIFIED Requirements

> Substitui os requisitos de `auth-login` formalizados em
> `changes/archive/2026-06/2026-06-02-auth-login/`, que descrevem Direct Grant (`grant_type=password`)
> e persistência do token em `localStorage`. O backend não muda: segue validando JWT como resource
> server, e nenhum contrato de API é alterado.

### Requirement: Autenticar por Authorization Code + PKCE

O sistema SHALL autenticar o usuário pelo fluxo Authorization Code com PKCE (`S256`) contra o
Keycloak, e MUST NOT coletar ou transmitir a senha do usuário pela aplicação.

#### Scenario: Início do fluxo de autorização

- **WHEN** um usuário não autenticado acessa uma rota protegida
- **THEN** é redirecionado ao Keycloak com `code_challenge_method=S256` e com o scope
  `organization` explícito na requisição de autorização

#### Scenario: Código interceptado não é trocável

- **WHEN** o `code` de autorização é reapresentado por outro cliente, sem o `code_verifier` original
- **THEN** a troca por token falha

#### Scenario: Direct Grant recusado no client da aplicação

- **WHEN** uma requisição usa `grant_type=password` contra o client `menthoros-web`
- **THEN** o Keycloak recusa a requisição

---

### Requirement: Não persistir credenciais nem tokens no navegador

O sistema SHALL manter o access token apenas em memória durante a sessão, e MUST NOT gravar access
token ou refresh token em `localStorage` ou `sessionStorage`.

#### Scenario: Nenhum token persistido após autenticar

- **WHEN** o usuário conclui a autenticação
- **THEN** `localStorage` e `sessionStorage` não contêm access token nem refresh token, e a chave
  `@Menthoros:token` não existe

---

### Requirement: Restaurar a sessão sem novo prompt de credenciais

O sistema SHALL restaurar o estado autenticado após recarga de página ou abertura de nova aba,
renovando a sessão contra o Keycloak sem solicitar credenciais.

#### Scenario: Recarga mantém a sessão

- **WHEN** o usuário autenticado recarrega a página
- **THEN** a sessão é restaurada sem prompt de credenciais

#### Scenario: Renovação durante uso

- **WHEN** o token expira enquanto o usuário opera e uma chamada de API é feita
- **THEN** a sessão é renovada sem exigir credenciais; com renovação por iframe a chamada original
  conclui, e com renovação por redirect o retorno preserva o destino e o estado

#### Scenario: Falha de renovação não gera laço

- **WHEN** a renovação falha porque a sessão no Keycloak foi encerrada
- **THEN** o usuário é levado ao login uma única vez, sem laço de redirecionamento

---

### Requirement: Não tratar autenticação pendente como não autenticado

O sistema SHALL distinguir "autenticação em curso" de "não autenticado", e a proteção de rota MUST
NOT redirecionar ao login enquanto o retorno do fluxo ou uma renovação estiverem pendentes.

#### Scenario: Guard suspenso durante o callback

- **WHEN** o retorno do fluxo de autorização ou uma renovação está em andamento
- **THEN** a rota protegida aguarda a resolução, sem redirecionar ao login

---

### Requirement: Preservar o destino através do fluxo de autorização

O sistema SHALL retornar o usuário à rota que ele tentou acessar antes da autenticação.

#### Scenario: Destino restaurado após o retorno

- **WHEN** um usuário não autenticado acessa uma rota protegida específica e conclui a autenticação
- **THEN** é levado àquela rota, e não à página inicial

---

### Requirement: Encerrar a sessão no provedor de identidade no logout

O sistema SHALL encerrar a sessão no Keycloak (RP-initiated logout), e MUST NOT considerar o logout
concluído apenas com a limpeza de estado local.

#### Scenario: Logout exige nova autenticação

- **WHEN** o usuário faz logout e em seguida acessa uma rota protegida
- **THEN** a autenticação é exigida novamente, sem reaproveitar a sessão anterior do provedor
