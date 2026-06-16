# Tasks: current-user-quality-debt

> **Foldada em `add-current-user-endpoint`** (decisão do usuário): os itens foram implementados
> direto na branch `feature/add-current-user-endpoint`, não como change/branch separada. Esta change
> serve de registro; ao arquivar, marcar como entregue via o fold.

## 1. Teste de controller (I3)

- [x] 1.1 Decisão: **adotar `@WebMvcTest`** para o `UsuarioController` (primeiro do repo). Slice com
  `excludeFilters` (JwtTenantFilter/StructuredLoggingFilter) + `addFilters=false`.
- [x] 1.2 `@WebMvcTest(UsuarioController.class)` cobrindo 200 (JSON: id/nome/role/assessoria/atletaId)
  e 404 (`DomainNotFoundException` → status 404 via `GlobalExceptionHandler`). 401 fica como
  integração (SecurityFilterChain global), fora do slice — documentado no teste.

## 2. DIP no UsuarioServiceImpl (clean#1/#2)

- [x] 2.1 Extraída a porta `AuthenticatedPrincipalResolver` (+ impl `JwtAuthenticatedPrincipalResolver`)
  para resolver o `sub`; `UsuarioServiceImpl` não acessa mais `SecurityContextHolder`.
  `UsuarioServiceImplTest` simplificado (mock da porta, sem montar `SecurityContext`/`Jwt`).
- [x] 2.2 Atleta vinculado resolvido via `AtletaService.findVinculadoAoUsuario(usuarioId)` (interface)
  em vez de `AtletaRepository` direto.

## 3. Índice (I2)

- [x] 3.1 Decisão: **não criar** o índice composto `(tenant_id, keycloak_id)`. `keycloak_id` já tem
  índice único global (`idx_usuario_keycloak_id`), que a query `findByKeycloakIdAndAssessoria_Id`
  usa eficientemente — o composto seria redundante. Sem migração.

## 4. Validação

- [x] 4.1 `./mvnw clean test` — verde (694 testes, 0 falhas/erros).
