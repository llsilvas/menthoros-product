# Tasks: add-assessoria-onboarding

## 1. Modelo & Migrações

- [ ] 1.1 Adicionar `keycloakOrganizationId` (`keycloak_organization_id`, unique) em
  `entity/Assessoria.java`; manter `keycloakGroupId` durante a transição.
- [ ] 1.2 Migration V33: `ALTER TABLE tb_assessoria ADD COLUMN keycloak_organization_id VARCHAR(100)`
  + índice único `uk_assessoria_keycloak_org`.
- [ ] 1.3 Adicionar `ATLETA` ao enum `enums/UserRole.java` (ajustar `podeEscrever()` se necessário).
- [ ] 1.4 Migration V34: coluna `usuario_id UUID NULL REFERENCES tb_usuario(id) ON DELETE SET NULL`
  em `tb_atleta` + índice `idx_atleta_usuario`; mapear vínculo em `entity/Atleta.java`.
- [ ] 1.5 `./mvnw clean compile` — 0 erros.

## 2. Keycloak — Organizations

- [ ] 2.1 Habilitar Organizations no realm `menthoros-app` (config do realm / docker-compose).
- [ ] 2.2 Configurar attribute/claim mapper que injeta `tenant_id` da Organization no token.
- [ ] 2.3 Adicionar client role `ATLETA` no Keycloak.
- [ ] 2.4 Validar o formato real do claim emitido e confirmar que `JwtTenantFilter` o resolve;
  ajustar o parsing apenas se o shape divergir de `organization.<org>.tenant_id`.

## 3. Cadastro de Assessoria

- [ ] 3.1 DTOs `dto/input/AssessoriaInputDto` (records + Bean Validation: `nome`, `dominio`, `plano`,
  limites) e `dto/output/AssessoriaOutputDto` (`@JsonInclude(NON_NULL)`).
- [ ] 3.2 `AssessoriaService.criarAssessoria(input)`: valida `dominio` único, cria `Assessoria`, cria
  Organization no Keycloak (admin client) e persiste `keycloakOrganizationId`. JavaDoc:
  `Idempotent: NO`, `Side Effects: DB insert + Keycloak Organization create`, `Tenant-aware: N/A (admin)`.
- [ ] 3.3 `AssessoriaController`: `POST /api/admin/assessorias` `@PreAuthorize("hasRole('ADMIN')")`,
  `ResponseEntity<AssessoriaOutputDto>`, Swagger (`@Tag`/`@Operation`/`@ApiResponses` 201/400/403/409).
- [ ] 3.4 `AssessoriaMapper` com null-check lançando `IllegalArgumentException`.

## 4. Convite de Atleta

- [ ] 4.1 `AtletaService.gerarConvite(atletaId)`: gera/reenvia convite (idempotente quanto ao vínculo).
  JavaDoc `Idempotent: YES (reenvio)`, `Side Effects: Keycloak invite / email`, `Tenant-aware: YES`.
- [ ] 4.2 Endpoint `POST /api/v1/atletas/{id}/convite` em `AtletaController`,
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, `@RequireTenant`, `ResponseEntity<Void>` (202),
  Swagger completo.
- [ ] 4.3 Provisionamento no primeiro acesso: estender `UsuarioSyncServiceImpl` para, quando role
  `ATLETA`, vincular `Usuario` ao `Atleta` (preencher `usuario_id`) dentro do tenant.
- [ ] 4.4 `GlobalExceptionHandler`: handler para novas exceções (ex.: `ConviteInvalidoException`,
  `DominioJaExisteException`).

## 5. Migração de Dados

- [ ] 5.1 Procedimento (runbook) de migração Groups→Organizations por assessoria + backfill do
  tenant `default`. Documentar em `V33__RUNBOOK.md`.

## 6. Testes

- [ ] 6.1 `AssessoriaServiceTest`: cria assessoria + Organization (mock admin client); rejeita
  `dominio` duplicado; null/blank em campos obrigatórios.
- [ ] 6.2 Teste de convite: gera convite; reenvio não duplica vínculo; provisionamento preenche
  `usuario_id`; isolamento de tenant (atleta de outro tenant → not found).
- [ ] 6.3 `JwtTenantFilter`: resolve `tenant_id` a partir do claim de Organization.
- [ ] 6.4 `./mvnw clean test` — verde.

## 7. OpenSpec

- [ ] 7.1 Atualizar este `tasks.md` conforme execução.
- [ ] 7.2 Manter `specs/assessoria-onboarding/spec.md` alinhado a qualquer mudança de contrato.
