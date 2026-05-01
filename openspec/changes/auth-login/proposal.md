## Por quê

O frontend do Menthoros atualmente abre diretamente na experiência do dashboard sem nenhuma barreira de autenticação. Isso torna impossível proteger os dados de atletas, planos e treinos, e impede a aplicação de estabelecer um modelo de sessão consistente com o backend.

O produto precisa de uma primeira etapa de autenticação: uma tela de login dedicada que colete as credenciais do usuário, autentique contra o **Keycloak** (o provedor de identidade que suporta o backend), persista o JWT access token retornado localmente e utilize-o para desbloquear as rotas privadas do dashboard.

O backend Spring Boot é um **OAuth2 Resource Server** — ele valida tokens JWT emitidos pelo Keycloak, mas não os emite. O frontend deve autenticar diretamente contra o endpoint de token do Keycloak.

## O que Muda

- Introduzir uma nova rota pública em `/auth/login`
- Adicionar uma tela de login no estilo visual do Menthoros, separada do `DashboardLayout`
- Chamar o endpoint de token do Keycloak com as credenciais do usuário para obter um JWT access token
- Persistir o access token no `localStorage` usando a chave de auth existente do Menthoros
- Hidratar o estado de autenticação na inicialização da aplicação a partir do token persistido
- Proteger as rotas internas do dashboard e redirecionar usuários não autenticados para o login
- Redirecionar usuários autenticados que acessem a página de login de volta para `/`

## Capacidades

### Novas Capacidades

- `auth-login`: Autenticar um usuário contra o Keycloak, persistir o JWT access token retornado e controlar o acesso às rotas protegidas do Menthoros

### Capacidades Modificadas

- Roteamento do dashboard: As rotas existentes passam a ser protegidas e exigem autenticação antes de renderizar

## Impacto

- **Context**: `AuthContext` deve hidratar o estado do token persistido na inicialização e continuar expondo as ações login/logout
- **Routing**: `src/App.tsx` deve separar as rotas públicas de auth das rotas protegidas do dashboard
- **API**: Um serviço de autenticação dedicado chama o endpoint de token do Keycloak e retorna `{ accessToken: string }`
- **HTTP client**: A injeção do bearer token em `OpenAPI.TOKEN` deve ler o access token persistido
- **Config**: As coordenadas do Keycloak (URL base, realm, client ID) devem ser expostas como variáveis de ambiente
- **UI**: Uma nova página de login fora do `DashboardLayout` deve ser adicionada

## Premissas

- A autenticação usa o fluxo **Direct Grant** do Keycloak (Resource Owner Password Credentials): o frontend envia as credenciais diretamente ao endpoint de token do Keycloak
- O client do Keycloak (`menthoros-web`) tem o Direct Grant habilitado no realm
- A iteração inicial de autenticação não inclui refresh tokens, recuperação de senha, registro ou papéis de permissão
- O campo `access_token` na resposta do token do Keycloak é o JWT que o backend valida
- O redirecionamento padrão após login bem-sucedido é `/`
- A URL base do Keycloak, realm e client ID são fornecidos como variáveis de ambiente (`VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`)
