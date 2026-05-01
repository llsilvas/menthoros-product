## Contexto

O Menthoros é um frontend React + TypeScript construído com Vite, MUI e um sistema visual orientado a dashboard. O shell atual da aplicação sempre renderiza os fluxos autenticados do dashboard, e o estado de autenticação existe apenas como um `AuthContext` mínimo com `login(token)` e `logout()`.

O backend Spring Boot é um **OAuth2 Resource Server** configurado contra o Keycloak (`KEYCLOAK_ISSUER_URI=http://localhost:8443/realms/menthoros-app`). Ele valida JWT access tokens mas **não os emite**. A emissão de tokens é responsabilidade exclusiva do Keycloak.

O JWT emitido pelo Keycloak contém os claims que o backend exige:
- `sub` — ID do usuário no Keycloak
- `tenant_id` — UUID da assessoria (extraído pelo `JwtTenantFilter`)
- `roles` / `resource_access.menthoros-api.roles` — papéis do usuário

O frontend já oferece:
- `AuthContext` com chave de persistência de token `@Menthoros:token`
- Constante `ROUTES.LOGIN` apontando para `/auth/login`
- Suporte a `Authorization: Bearer <token>` via `OpenAPI.TOKEN` na camada de requisições HTTP

Esta mudança define a estrutura UX e de aplicação necessária para que essas peças funcionem juntas usando o fluxo correto de autenticação baseado no Keycloak.

## Objetivos / Não-Objetivos

**Objetivos**

- Prover uma tela de login dedicada para usuários não autenticados
- Autenticar contra o Keycloak e receber um JWT access token na resposta
- Persistir o access token e hidratar o estado autenticado no refresh
- Proteger as rotas do dashboard contra acesso não autenticado
- Redirecionar usuários autenticados para fora da página de login
- Suportar layouts desktop e mobile com a mesma linguagem visual do Menthoros

**Não-Objetivos**

- Fluxo de registro
- Fluxo de recuperação de senha
- Refresh token / re-autenticação silenciosa (fora do escopo da primeira iteração)
- Controle de acesso baseado em papéis
- Decodificação de claims JWT / tratamento de expiração além da presença do token
- Fluxo OAuth2 Authorization Code com PKCE e redirect (usa-se Direct Grant em vez disso)

## Arquitetura de Autenticação

### Por que o endpoint de token do Keycloak, não o backend

O backend Spring Boot (`SecurityConfig`) está configurado como:

```java
.oauth2ResourceServer(oauth2 -> oauth2.jwt(...))
```

Ele valida tokens JWT emitidos pelo Keycloak mas não expõe nenhum endpoint de autenticação próprio. O frontend deve chamar o **endpoint de token do Keycloak** diretamente.

### Fluxo Direct Grant do Keycloak

```
Frontend                          Keycloak
    │                                 │
    │  POST /realms/{realm}/protocol/ │
    │       openid-connect/token      │
    │  grant_type=password            │
    │  username=...                   │
    │  password=...                   │
    │  client_id=menthoros-web        │
    │  scope=openid                   │
    │ ──────────────────────────────► │
    │                                 │  (valida credenciais,
    │                                 │   aplica claim tenant_id do grupo)
    │  200 { access_token, ... }      │
    │ ◄────────────────────────────── │
    │                                 │
    │  localStorage[@Menthoros:token] │
    │  = access_token                 │
    │                                 │
    │             Backend             │
    │  GET /atleta                    │
    │  Authorization: Bearer {JWT}    │
    │ ──────────────────────────────► │
    │                                 │  (JwtTenantFilter extrai tenant_id,
    │                                 │   SecurityConfig valida JWT contra JWKS do Keycloak)
    │  200 OK                         │
    │ ◄────────────────────────────── │
```

### Contrato de autenticação

A camada de serviço abstrai a resposta bruta do Keycloak. O contrato interno é:

```ts
// Entrada para o serviço de autenticação
type LoginRequest = {
  username: string;  // mapeado para o campo username do Keycloak
  password: string;
};

// Resposta bruta do endpoint de token do Keycloak (subconjunto usado)
type KeycloakTokenResponse = {
  access_token: string;     // JWT — enviado ao backend como Bearer token
  refresh_token: string;    // armazenado para suporte futuro a refresh token
  expires_in: number;       // segundos até expirar o access_token
  refresh_expires_in: number;
  token_type: 'Bearer';
  scope: string;
};

// Saída normalizada do serviço de autenticação
type LoginResult = {
  accessToken: string;
};
```

O serviço chama:
```
POST {VITE_KEYCLOAK_URL}/realms/{VITE_KEYCLOAK_REALM}/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&username={username}
&password={password}
&client_id={VITE_KEYCLOAK_CLIENT_ID}
&scope=openid
```

Em caso de sucesso, `access_token` é o JWT armazenado sob `@Menthoros:token` e injetado nas requisições ao backend.

### Configuração de ambiente

Novas variáveis de ambiente necessárias (`.env` / `docker-compose`):

```env
VITE_KEYCLOAK_URL=http://localhost:8443
VITE_KEYCLOAK_REALM=menthoros-app
VITE_KEYCLOAK_CLIENT_ID=menthoros-web
```

Lidas por `src/config/env.ts` junto com o `VITE_API_BASE_URL` existente.

### Integração com o HTTP client

O resolver `OpenAPI.TOKEN` já injeta o bearer token em cada requisição à API. Após login bem-sucedido, `login(token)` persiste o token no `localStorage` e `OpenAPI.TOKEN` é conectado para lê-lo:

```ts
// em main.tsx (ou no AuthProvider na montagem)
OpenAPI.TOKEN = () => Promise.resolve(
  localStorage.getItem('@Menthoros:token') ?? ''
);
```

Isso garante que a injeção de token continue funcionando sem modificações na camada de requisições.

## Estrutura UX

### 1. Página de login pública

**Decisão:** A experiência de login fica em sua própria rota pública (`/auth/login`) e não renderiza dentro do `DashboardLayout`.

**Justificativa:** A página de login é uma porta de entrada não autenticada, não faz parte do modelo de navegação privada do dashboard.

### 2. Layout do card de login

A página renderiza:

- um card de login centralizado sobre um fundo com a identidade do Menthoros
- marca/título Menthoros
- título da página: `Entrar`
- subtítulo explicativo curto
- campo de usuário com label `Email ou usuário`
- campo de senha
- CTA primário `Entrar`
- área de mensagem de erro inline

Direção visual:

- shell escuro com gradiente/fundo do Menthoros
- superfície de card clara com borda sutil
- Syne para títulos onde apropriado
- tipografia de corpo padrão consistente com o restante da aplicação
- espaçamento responsivo e botão primário de largura total em mobile

### 3. Estados de interação

- **Idle**: campos habilitados, nenhum erro visível
- **Submitting**: CTA desabilitado, indicador de carregamento exibido, campos desabilitados
- **Erro de autenticação**: alerta inline exibido, formulário permanece editável — HTTP 401 do Keycloak mapeia para "Credenciais inválidas", outros erros para mensagem genérica
- **Redirecionamento autenticado**: usuário autenticado que acessa `/auth/login` é redirecionado para `/`

### 4. Comportamento mobile

Em telas pequenas:
- a view de login pode ocupar toda a altura do viewport
- a largura do card deve reduzir com padding confortável
- botões devem ter largura total
- tamanhos de fonte e espaçamento devem permanecer legíveis sem aglomeração

## Decisões de Fluxo da Aplicação

### Comportamento pós-login

Em login bem-sucedido:

1. chamar o endpoint de token do Keycloak com as credenciais
2. receber o `access_token`
3. persistir o `access_token` no `localStorage` sob `@Menthoros:token`
4. chamar `AuthContext.login(accessToken)`
5. redirecionar para `/`

### Comportamento de hidratação

Na inicialização da aplicação:

- se `@Menthoros:token` existe e não está vazio, inicializar o usuário como autenticado
- se não existe token, as rotas protegidas redirecionam para `/auth/login`

Nota: a expiração do token não é validada no cliente nesta iteração. Tokens expirados produzirão respostas `401` do backend, surfaced como erros na UI posteriormente.

### Comportamento de logout

O logout remove o token persistido, limpa o estado de autenticação e redireciona para a rota de login. Não chama o endpoint de logout do Keycloak nesta iteração.

## Riscos / Trade-offs

- **Direct Grant vs. PKCE redirect**: O Direct Grant expõe as credenciais ao SPA. É aceitável para a primeira iteração, mas o fluxo PKCE Authorization Code é o caminho de upgrade recomendado para hardening em produção.
- **Sem verificação de expiração do token**: Sem checagem client-side de expiração, o usuário verá `401`s do backend após `expires_in` segundos sem feedback explícito. Aceitável para a primeira iteração.
- **Label do campo identificador**: A UI exibe `Email ou usuário`; o serviço envia como `username` para o Keycloak, que trata ambos os formatos dependendo da configuração do realm.
- **Chave `@Menthoros:token`**: Usada pelo `AuthContext` existente e pelo resolver `OpenAPI.TOKEN`. Nenhuma migração necessária.

## Plano de Migração

1. Adicionar variáveis Keycloak em `src/config/env.ts`
2. Criar os tipos `LoginRequest`, `LoginResult` e `KeycloakTokenResponse`
3. Criar um serviço de autenticação que chame o endpoint de token do Keycloak
4. Atualizar `AuthContext` para hidratar o token do localStorage na inicialização e conectar `OpenAPI.TOKEN`
5. Introduzir um componente wrapper `ProtectedRoute`
6. Atualizar `App.tsx` para separar rotas públicas de auth das rotas protegidas do dashboard
7. Adicionar a tela de login e conectar o fluxo de submissão
8. Validar login, hidratação, redirect e logout

## Questões Abertas Resolvidas

- **Destino pós-login**: `/`
- **Servidor de auth**: Keycloak — o frontend chama o endpoint de token do Keycloak diretamente
- **Campo do token**: `access_token` da resposta do Keycloak → armazenado como `@Menthoros:token`
- **Grant type**: Direct Grant (Resource Owner Password Credentials) para a primeira iteração
