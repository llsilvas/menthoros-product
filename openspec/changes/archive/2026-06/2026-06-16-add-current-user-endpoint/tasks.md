# Tasks: add-current-user-endpoint

## 1. DTO

- [ ] 1.1 `dto/output/UsuarioMeOutputDto` (record, `@JsonInclude(NON_NULL)`, `@Schema`):
  `id`, `nome`, `email`, `role`, `assessoria` (id/nome/dominio), `atletaId` (nullable).
- [ ] 1.2 `UsuarioMapper.toMeOutputDto(Usuario, Atleta)` com null-check lançando
  `IllegalArgumentException`; `atletaId` preenchido só quando `Atleta` presente.

## 2. Service

- [ ] 2.1 `UsuarioService.getCurrentUser()`: resolve `Usuario` pelo `sub` do JWT
  (`SecurityContext`) e `TenantContext.getRequiredTenantId()`; quando role `ATLETA`, resolve o
  `Atleta` vinculado (`findByUsuarioIdAndTenant`). JavaDoc `Idempotent: YES`, `Side Effects: NONE`,
  `Tenant-aware: YES`.
- [ ] 2.2 Lançar `DomainNotFoundException` quando o `Usuario` não existir no tenant.

## 3. Controller

- [ ] 3.1 `UsuarioController` `@RestController` `@RequireTenant` `@RequestMapping("/api/v1/users")`,
  `@Tag`.
- [ ] 3.2 `GET /me` → `ResponseEntity<UsuarioMeOutputDto>`, `@Operation` + `@ApiResponses`
  (200/401/404).

## 4. Autorização ROLE_ATLETA

- [ ] 4.1 Garantir que `ATLETA` é mapeada como authority (`ROLE_ATLETA`) na conversão do JWT.
- [ ] 4.2 Habilitar `ROLE_ATLETA` nos endpoints voltados ao atleta (referência para #2).

## 5. Testes

- [ ] 5.1 `UsuarioServiceTest`: TECNICO retorna sem `atletaId`; ATLETA vinculado retorna `atletaId`;
  ATLETA sem vínculo retorna `atletaId` nulo; usuário inexistente → `DomainNotFoundException`;
  isolamento de tenant.
- [ ] 5.2 `./mvnw clean test` — verde.
