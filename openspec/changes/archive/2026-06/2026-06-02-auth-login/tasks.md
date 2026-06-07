## 1. Configuração de Ambiente Keycloak

- [x] 1.1 Variáveis de ambiente Keycloak configuradas via `application.yml` e env do container
- [x] 1.2 Documentadas em `.env.example` e scripts de deploy

## 2. Tipos e Serviço de Autenticação

- [x] 2.1 Tipos `LoginRequest`, `LoginResult` e fluxo de token definidos em `AuthService`
- [x] 2.2 `AuthService.login()` chama endpoint de token do Keycloak via Direct Grant
- [x] 2.3 HTTP 401 mapeado para erro de credenciais inválidas; outros erros → mensagem genérica

## 3. Estado de Auth e Hidratação do Token

- [x] 3.1 `AuthContext` hidrata token de `localStorage` na inicialização
- [x] 3.2 `OpenAPI.TOKEN` configurado como resolver de `localStorage`
- [x] 3.3 `login(token)` persiste token, atualiza estado e redireciona para `/`
- [x] 3.4 `logout()` remove token, limpa `OpenAPI.TOKEN` e redireciona para `/auth/login`

## 4. Roteamento e Controle de Acesso

- [x] 4.1 Rota pública `/auth/login` adicionada em `App.tsx`
- [x] 4.2 Componente `ProtectedRoute` criado — redireciona não-autenticados para `/auth/login`
- [x] 4.3 Todas as rotas do dashboard envolvidas com `ProtectedRoute`
- [x] 4.4 Usuário autenticado que acessa `/auth/login` é redirecionado para `/`

## 5. Tela de Login

- [x] 5.1 `LoginPage` autônoma fora do `DashboardLayout`
- [x] 5.2 Formulário com campos de usuário/email e senha
- [x] 5.3 Estados: idle, submitting (desabilitado), erro de autenticação exibido no formulário
- [x] 5.4 Layout responsivo — adaptado ao design system dark-first

## 6. Integração Authorization Bearer

- [x] 6.1 `OpenAPI.TOKEN` configurado como resolver antes de toda chamada de serviço
- [x] 6.2 Todas as requisições ao backend enviam `Authorization: Bearer <access_token>`

## 7. Validação e Aceite

- [x] 7.1 Login com sucesso: armazena token, redireciona para `/`
- [x] 7.2 Login inválido: exibe erro sem navegar nem persistir token
- [x] 7.3 Refresh com token armazenado: usuário permanece autenticado
- [x] 7.4 Logout: remove token, redireciona para `/auth/login`
- [x] 7.5 Rota protegida sem token: redireciona para `/auth/login`
- [x] 7.6 Usuário autenticado acessa `/auth/login`: redireciona para `/`

## Notas de implementação

- Token validado com claims obrigatórios (commits `fix(auth): validate token with required claims`)
- Expiração de token tratada com redesign da `LoginPage`
- Proxy nginx para Keycloak HTTPS configurado para produção
