## Requisitos ADICIONADOS

### Requisito: Prover uma rota pública de login
O sistema DEVE expor uma rota pública em `/auth/login` acessível sem autenticação prévia e que não renderize o layout autenticado do dashboard.

#### Cenário: Rota de login é pública
- **QUANDO** um usuário não autenticado navega para `/auth/login`
- **ENTÃO** o frontend DEVE renderizar a tela de login
- **E** NÃO DEVE exigir token para acessar essa rota

#### Cenário: Tela de login está fora do chrome do dashboard
- **QUANDO** a tela de login é renderizada
- **ENTÃO** o frontend NÃO DEVE renderizar a sidebar autenticada nem o cabeçalho do dashboard

---

### Requisito: Autenticar contra o Keycloak e persistir o JWT access token retornado
O sistema DEVE enviar as credenciais do usuário ao endpoint de token do Keycloak (Direct Grant) e persistir o `access_token` retornado no localStorage sob a chave `@Menthoros:token`.

O endpoint de token do Keycloak é:
```
POST {VITE_KEYCLOAK_URL}/realms/{VITE_KEYCLOAK_REALM}/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded
```

Com os campos de formulário: `grant_type=password`, `username`, `password`, `client_id={VITE_KEYCLOAK_CLIENT_ID}`, `scope=openid`.

O `access_token` na resposta é o JWT que o backend valida. DEVE ser armazenado e usado como bearer token em todas as chamadas à API do backend.

#### Cenário: Login com sucesso
- **DADO** que o usuário está em `/auth/login`
- **QUANDO** o usuário submete credenciais válidas
- **ENTÃO** o frontend DEVE chamar o endpoint de token do Keycloak com `grant_type=password`
- **E** DEVE armazenar o `access_token` da resposta do Keycloak sob `@Menthoros:token`
- **E** DEVE marcar o usuário como autenticado
- **E** DEVE redirecionar o usuário para `/`

#### Cenário: Login com credenciais inválidas
- **DADO** que o usuário está em `/auth/login`
- **QUANDO** o usuário submete credenciais inválidas
- **ENTÃO** o Keycloak retorna HTTP 401
- **E** o frontend DEVE exibir uma mensagem de erro de autenticação
- **E** NÃO DEVE redirecionar o usuário
- **E** NÃO DEVE armazenar nenhum token
- **E** NÃO DEVE marcar o usuário como autenticado

#### Cenário: Login falha por indisponibilidade de rede ou do Keycloak
- **DADO** que o usuário está em `/auth/login`
- **QUANDO** o endpoint de token do Keycloak está inacessível ou retorna erro 5xx
- **ENTÃO** o frontend DEVE exibir uma mensagem de erro genérica
- **E** NÃO DEVE redirecionar o usuário

---

### Requisito: Hidratar o estado de autenticação a partir do token persistido
O sistema DEVE inicializar o estado de autenticação do frontend a partir do token Menthoros persistido quando a aplicação iniciar.

#### Cenário: Token existente restaura o estado da sessão
- **DADO** que existe uma string não vazia em `localStorage` sob `@Menthoros:token`
- **QUANDO** a aplicação inicializa
- **ENTÃO** o frontend DEVE considerar o usuário autenticado
- **E** DEVE configurar `OpenAPI.TOKEN` para resolver ao token armazenado

#### Cenário: Token ausente deixa o usuário não autenticado
- **DADO** que não existe token em `localStorage` sob `@Menthoros:token`
- **QUANDO** a aplicação inicializa
- **ENTÃO** o frontend DEVE considerar o usuário não autenticado

---

### Requisito: Proteger as rotas do dashboard
O sistema DEVE exigir autenticação antes de renderizar as rotas privadas do dashboard.

#### Cenário: Usuário não autenticado acessa rota privada
- **DADO** que o usuário não está autenticado
- **QUANDO** o usuário navega para uma rota protegida como `/`, `/atletas`, `/planos` ou `/treinos`
- **ENTÃO** o frontend DEVE redirecionar o usuário para `/auth/login`

#### Cenário: Usuário autenticado acessa rota privada
- **DADO** que o usuário está autenticado
- **QUANDO** o usuário navega para uma rota protegida do dashboard
- **ENTÃO** o frontend DEVE permitir a renderização da rota

---

### Requisito: Redirecionar usuários autenticados para fora da rota de login
O sistema DEVE impedir que usuários autenticados permaneçam na tela de login.

#### Cenário: Usuário autenticado abre a página de login
- **DADO** que o usuário está autenticado
- **QUANDO** o usuário navega para `/auth/login`
- **ENTÃO** o frontend DEVE redirecionar o usuário para `/`

---

### Requisito: Enviar o JWT do Keycloak como bearer token em todas as requisições autenticadas ao backend
O sistema DEVE injetar o `access_token` armazenado como bearer token em toda requisição à API do backend.

#### Cenário: Requisição autenticada inclui bearer token
- **DADO** que existe um token armazenado sob `@Menthoros:token`
- **QUANDO** o frontend executa qualquer requisição à API do backend
- **ENTÃO** a requisição DEVE incluir `Authorization: Bearer <token>`
- **E** o token DEVE ser o JWT emitido pelo Keycloak (o valor armazenado em `@Menthoros:token`)

#### Cenário: Resolver de `OpenAPI.TOKEN` está conectado ao localStorage
- **DADO** que a aplicação foi inicializada
- **ENTÃO** `OpenAPI.TOKEN` DEVE ser configurado como uma função resolver que lê `localStorage.getItem('@Menthoros:token')`
- **E** essa configuração DEVE ocorrer antes de qualquer chamada de serviço à API

---

### Requisito: Suportar logout explícito
O sistema DEVE remover o token persistido e retornar o usuário ao ponto de entrada de login quando o logout for executado.

#### Cenário: Logout encerra a sessão
- **DADO** que o usuário está autenticado
- **QUANDO** o usuário executa o logout
- **ENTÃO** o frontend DEVE remover `@Menthoros:token` do localStorage
- **E** DEVE limpar `OpenAPI.TOKEN` para que requisições subsequentes não enviem bearer token
- **E** DEVE marcar o usuário como não autenticado
- **E** DEVE redirecionar o usuário para `/auth/login`

---

### Requisito: Expor a configuração do Keycloak como variáveis de ambiente
O sistema DEVE ler as coordenadas do Keycloak a partir de variáveis de ambiente para que o serviço de autenticação seja configurável por ambiente sem alteração de código.

#### Cenário: Configuração do Keycloak é resolvida pelo ambiente
- **DADO** que a aplicação está em execução
- **ENTÃO** o serviço de autenticação DEVE construir a URL de token do Keycloak a partir de:
  - `VITE_KEYCLOAK_URL` — URL base (ex.: `http://localhost:8443`)
  - `VITE_KEYCLOAK_REALM` — nome do realm (ex.: `menthoros-app`)
  - `VITE_KEYCLOAK_CLIENT_ID` — client ID (ex.: `menthoros-web`)
- **E** DEVEM ser fornecidos valores de fallback locais para que `npm run dev` funcione sem arquivo `.env`

---

### Requisito: Renderizar uma interface de login responsiva
O sistema DEVE renderizar a tela de login em um layout utilizável tanto em mobile quanto em desktop.

#### Cenário: Login em mobile permanece utilizável
- **QUANDO** a tela de login é renderizada em viewport mobile
- **ENTÃO** os campos do formulário DEVEM permanecer verticalmente legíveis
- **E** a ação primária DEVE ser facilmente acionável por toque

#### Cenário: Tela de login exibe estado de carregamento
- **QUANDO** o usuário submete credenciais e a requisição ao Keycloak está pendente
- **ENTÃO** a interface de login DEVE exibir um estado de carregamento
- **E** o botão de envio DEVE estar desabilitado
- **E** os campos do formulário DEVEM estar desabilitados até a resposta chegar
