# Tasks: add-current-user-endpoint

## 1. DTO

- [x] 1.1 `dto/output/UsuarioMeOutputDto` (record, `@JsonInclude(NON_NULL)`, `@Schema`):
  `id`, `nome`, `email`, `role`, `assessoria` (id/nome/dominio), `atletaId` (nullable).
- [x] 1.2 `UsuarioMapper.toMeOutputDto(Usuario, Atleta)` com null-check lançando
  `IllegalArgumentException`; `atletaId` preenchido só quando `Atleta` presente.

## 2. Service

- [x] 2.1 `UsuarioService.getCurrentUser()`: resolve `Usuario` pelo `sub` do JWT
  (`SecurityContext`) e `TenantContext.getRequiredTenantId()`; quando role `ATLETA`, resolve o
  `Atleta` vinculado (`findByUsuarioIdAndTenant`). JavaDoc `Idempotent: YES`, `Side Effects: NONE`,
  `Tenant-aware: YES`.
- [x] 2.2 Lançar `DomainNotFoundException` quando o `Usuario` não existir no tenant.

## 3. Controller

- [x] 3.1 `UsuarioController` `@RestController` `@RequestMapping("/api/v1/users")`, `@Tag`.
  Sem `@RequireTenant`: a anotação é por método e valida um parâmetro de ID de recurso
  (`resourceParamIndex`) — `/me` é self-resolving (sem param de recurso). O isolamento de tenant é
  garantido por `JwtTenantFilter` (popula `TenantContext`) + `getRequiredTenantId()` no service +
  query tenant-scoped (`findByKeycloakIdAndAssessoria_Id`). Documentar o porquê em comentário no
  controller (padrão do `StatusController`).
- [x] 3.2 `GET /me` → `ResponseEntity<UsuarioMeOutputDto>`, `@Operation` + `@ApiResponses`
  (200/401/404).

## 4. Autorização ROLE_ATLETA

- [x] 4.1 Garantir que `ATLETA` é mapeada como authority (`ROLE_ATLETA`) na conversão do JWT.
- [x] 4.2 Habilitar `ROLE_ATLETA` nos endpoints voltados ao atleta (referência para #2).
  Referência prospectiva: esta change só expõe `GET /me` (qualquer usuário autenticado, incl.
  `ATLETA`, via `anyRequest().authenticated()`). A authority `ROLE_ATLETA` já é emitida (4.1) e fica
  pronta para a change #2 (`add-athlete-progress-endpoints`) gatear seus endpoints com
  `@PreAuthorize("hasRole('ATLETA')")`. Sem endpoint de atleta no escopo desta change — nada a
  gatear aqui.

## 5. Testes

- [x] 5.1 `UsuarioServiceTest`: TECNICO retorna sem `atletaId`; ATLETA vinculado retorna `atletaId`;
  ATLETA sem vínculo retorna `atletaId` nulo; usuário inexistente → `DomainNotFoundException`;
  isolamento de tenant. (Implementado como `UsuarioServiceImplTest` — convenção do repo
  `*ServiceImplTest`; 5 cenários verdes, criados TDD-first nas tasks 2.1/2.2.)
- [x] 5.2 `./mvnw clean test` — verde. (683 testes, 0 falhas/erros.)

## 6. Pós-QA

- [x] 6.1 (m1) Contrato do `nome`: mapear `getNomeCompleto()` (nome + sobrenome) — nome de exibição
  para o shell, alinhado ao `@Schema(example="João Silva")`. `UsuarioMapper` + `UsuarioMapperTest`.
- [x] 6.2 (C2/seg) Não expor o `sub` do JWT na resposta de erro 404 — mensagem genérica, `sub` só no
  log (`UsuarioServiceImpl`).
- [x] 6.3 (I1) JavaDoc Idempotent/Side Effects/Tenant-aware no contrato `UsuarioService`.

## 7. Follow-ups foldados (current-user-quality-debt)

- [x] 7.1 (I3) `@WebMvcTest(UsuarioController.class)` — slice com 200/404 (`excludeFilters` +
  `addFilters=false`); 401 fica como integração.
- [x] 7.2 (clean#1) DIP: porta `AuthenticatedPrincipalResolver` (+ impl JWT) — service não acessa
  mais `SecurityContextHolder`.
- [x] 7.3 (clean#2) Atleta vinculado via `AtletaService.findVinculadoAoUsuario` (não mais
  `AtletaRepository` direto).
- [x] 7.4 (I2) Índice composto `(tenant_id, keycloak_id)`: decidido **não criar** (redundante —
  `keycloak_id` já é único global).
- [x] 7.5 (merge) Restaurado `UsuarioRepository.findByKeycloakIdAndAssessoria_Id`, perdido na
  resolução do merge manual `harden-tenant-isolation` → `add-current-user-endpoint`.

## Dependências resolvidas

- [x] **DEP** `reject-inactive-users` (I5) — mergeada em `develop` e incorporada nesta branch.
- [x] **DEP** `harden-tenant-isolation` — mergeada nesta branch (merge `808e2a9`); ao shipar o `/me`
  ela vai junto para `develop`.
