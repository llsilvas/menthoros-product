**Tamanho:** S · **Trilha:** Fast

# Proposal: current-user-quality-debt

## Status

Proposed

## Why

Achados de qualidade/design (não-segurança, não-bloqueantes) do QA de `add-current-user-endpoint`,
agrupados para tratamento posterior sem segurar o ship do `/me`.

## What Changes

- **Teste de controller (I3):** o `UsuarioController` é testado via Mockito direto (convenção atual
  do `StatusControllerTest`), que não cobre rota/serialização JSON/401. Avaliar adotar
  `@WebMvcTest(UsuarioController.class)` + `MockMvc` + `@MockBean` (status/JSON/401/404). Decisão de
  convenção transversal — pode virar padrão para novos controllers.
- **DIP no `UsuarioServiceImpl` (clean#1/#2):** o service lê `SecurityContextHolder` diretamente e
  injeta `AtletaRepository`. Extrair um `AuthenticatedPrincipalResolver` (porta) e resolver o atleta
  via `AtletaService` em vez do repository, reduzindo acoplamento e melhorando testabilidade.
- **Índice composto (I2):** avaliar `CREATE INDEX idx_usuario_tenant_keycloak_id ON
  tb_usuario(tenant_id, keycloak_id)` — `keycloak_id` já tem índice único global, então o ganho é
  marginal; decidir se vale a migração.

## Impact

- **Arquivos de produção (trabalho futuro):** `UsuarioServiceImpl` (+ nova porta/adapter),
  possivelmente `AtletaService`; testes do controller; migração opcional.
- **Sem mudança de contrato** de API.
- Descoberto em: QA de `add-current-user-endpoint` (I3, I2, clean#1/#2/#3).
