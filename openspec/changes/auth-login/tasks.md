## 1. Configuração de Ambiente Keycloak

- [ ] 1.1 Adicionar `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` em `src/config/env.ts` com fallbacks locais
- [ ] 1.2 Documentar as três variáveis no `.env.example` (ou equivalente) com os valores padrão de desenvolvimento

## 2. Tipos e Serviço de Autenticação

- [ ] 2.1 Definir os tipos `LoginRequest`, `KeycloakTokenResponse` e `LoginResult` para o fluxo de autenticação
- [ ] 2.2 Criar um serviço de autenticação que chame o endpoint de token do Keycloak via Direct Grant (`grant_type=password`, `Content-Type: application/x-www-form-urlencoded`) e retorne `{ accessToken: string }`
- [ ] 2.3 Mapear HTTP 401 do Keycloak para erro de credenciais inválidas e outros erros para mensagem genérica

## 3. Estado de Auth e Hidratação do Token

- [ ] 3.1 Atualizar `AuthContext` para hidratar o token persistido de `@Menthoros:token` na inicialização da aplicação
- [ ] 3.2 Na inicialização, configurar `OpenAPI.TOKEN` como uma função resolver que lê `localStorage.getItem('@Menthoros:token')`
- [ ] 3.3 Manter `login(token)` responsável por persistir o token, atualizar o estado de autenticação e redirecionar para `/`
- [ ] 3.4 Atualizar `logout()` para remover o token, limpar `OpenAPI.TOKEN` e redirecionar para `/auth/login`

## 4. Roteamento e Controle de Acesso

- [ ] 4.1 Adicionar uma rota pública para `/auth/login`
- [ ] 4.2 Criar um componente `ProtectedRoute` que redirecione usuários não autenticados para `/auth/login`
- [ ] 4.3 Envolver todas as rotas do dashboard com `ProtectedRoute`
- [ ] 4.4 Redirecionar usuários autenticados que tentarem acessar `/auth/login` para `/`

## 5. Tela de Login

- [ ] 5.1 Criar uma página de login autônoma fora do `DashboardLayout`
- [ ] 5.2 Implementar o formulário de login com campos de usuário/email e senha
- [ ] 5.3 Implementar os estados: idle, submitting (campos e botão desabilitados), erro de autenticação
- [ ] 5.4 Garantir layout responsivo para mobile e desktop

## 6. Integração Authorization Bearer

- [ ] 6.1 Verificar que `OpenAPI.TOKEN` está configurado como resolver antes da primeira chamada de serviço
- [ ] 6.2 Confirmar que todas as requisições ao backend enviam `Authorization: Bearer <access_token>`

## 7. Validação e Aceite

- [ ] 7.1 Login com sucesso: armazena o token, redireciona para `/`
- [ ] 7.2 Login com credenciais inválidas: exibe erro, não navega, não persiste token
- [ ] 7.3 Refresh com token armazenado: usuário permanece autenticado
- [ ] 7.4 Logout: remove token, redireciona para `/auth/login`
- [ ] 7.5 Rota protegida sem token: redireciona para `/auth/login`
- [ ] 7.6 Usuário autenticado acessa `/auth/login`: redireciona para `/`
