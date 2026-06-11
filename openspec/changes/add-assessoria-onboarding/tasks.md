# Tasks: add-assessoria-onboarding

> Status: Fases 1–4 (código) entregues e testadas (662 testes verdes). Fase 5 (infra Keycloak)
> e a execução da migração de dados (Fase 6) pendentes — exigem ambiente Keycloak. Ver
> "Notas de execução" no fim.

## 1. Modelo & Migrações

- [x] 1.1 Adicionar `keycloakOrganizationId` (`keycloak_organization_id`) em
  `entity/Assessoria.java`; manter `keycloakGroupId` durante a transição. (Sem `unique=true` na
  anotação JPA — a unicidade é o índice parcial da migration.)
- [x] 1.2 Migration V33: `ALTER TABLE tb_assessoria ADD COLUMN keycloak_organization_id VARCHAR(100)`
  + índice único **parcial** `uk_assessoria_keycloak_org` (`WHERE ... IS NOT NULL`).
- [x] 1.3 Adicionar `ATLETA` ao enum `enums/UserRole.java` + mapear em `mapToUserRole`
  (prioridade ADMIN > TECNICO > ATLETA > VISUALIZADOR). **+ V35**: atualizar o CHECK `chk_role`
  de `tb_usuario` para incluir `ATLETA` (senão o login de atleta violaria a constraint).
- [x] 1.4 Migration V34: coluna `usuario_id UUID NULL REFERENCES tb_usuario(id) ON DELETE SET NULL`
  em `tb_atleta` + índice `idx_atleta_usuario`; vínculo `@ManyToOne Usuario` em `entity/Atleta.java`.
- [x] 1.5 `./mvnw clean compile` — 0 erros.

## 2. Keycloak — Organizations  _(realm de dev configurado; adapter real implementado)_

> Realm real em uso é **`menthoros`** (não `menthoros-app` — esse é o `spring.application.name`).
> Servidor de dev: **Keycloak 26.6.0** (Organizations GA). `192.168.15.24:8080`.

- [x] 2.1 Organizations **já habilitado** no realm `menthoros` (`organizationsEnabled=true`,
  feature `ORGANIZATION` ativa).
- [x] 2.2 Mapper já configurado: client scope `organization` com `oidc-organization-membership-mapper`
  (`addOrganizationAttributes=true`, `multivalued=true`) → claim `organization.<alias>.tenant_id`.
  Org demo "Assessoria Demo" já tem `attributes.tenant_id`.
- [x] 2.3 Client role `ATLETA` criada no realm `menthoros`.
- [x] 2.4 Claim `organization.<alias>.tenant_id` resolvido pelo `JwtTenantFilter` (shape já em uso
  pelo app em runtime) — sem ajuste de parsing necessário.

> Adapter real implementado: `KeycloakOrganizationGatewayImpl` via **Keycloak Admin REST API**
> (Spring `RestClient`, sem bump de dependência — admin-client 25.0.3 não tem a API de Organizations).
> Config em `keycloak.admin.*` (`KeycloakAdminProperties` + `KeycloakAdminRestClientConfig` com timeouts).
> Falhas → `KeycloakIntegrationException` (502). Contrato REST validado ao vivo (criar org → 201 +
> Location; atributos persistem). **Pendente de verificação**: smoke end-to-end app→KC (POST
> `/api/admin/assessorias` com JWT ADMIN cria assessoria + Organization no dev) e o disparo real de
> convite (evitado nos testes para não gerar emails/usuários espúrios no dev).

## 3. Cadastro de Assessoria

- [x] 3.1 DTOs `dto/input/AssessoriaInputDto` (record + Bean Validation: `nome`, `dominio` `@Pattern`,
  `plano`, `emailContato` `@Email`, limites) e `dto/output/AssessoriaOutputDto` (`@JsonInclude(NON_NULL)`).
- [x] 3.2 `AssessoriaService.criarAssessoria(input)`: valida `dominio` único (→ `DuplicateResourceException`),
  cria `Assessoria`, chama o gateway e persiste `keycloakOrganizationId`. `@Transactional(rollbackFor=Exception.class)`.
  JavaDoc Idempotent/Side Effects/Tenant-aware na **interface** e no impl.
- [x] 3.3 `AssessoriaController`: `POST /api/admin/assessorias` `@PreAuthorize("hasRole('ADMIN')")`,
  `ResponseEntity<AssessoriaOutputDto>`, Swagger (201/400/403/409).
- [x] 3.4 `AssessoriaMapper` (`@Component`) com null-check lançando `IllegalArgumentException`.

## 4. Convite de Atleta

- [x] 4.1 `AtletaService.gerarConvite(atletaId)`: gera/reenvia convite; guard de email e de
  `keycloakOrganizationId` ausentes (→ 422). JavaDoc **Idempotent: NO** (reenvio (re)dispara o convite —
  efeito externo observável), `Side Effects: External API (Keycloak)`, `Tenant-aware: YES`.
  `@Transactional(readOnly=true)` (lê `assessoria` lazy).
- [x] 4.2 Endpoint `POST /api/v1/atletas/{id}/convite` em `AtletaController`,
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, `@RequireTenant(resourceParamIndex=0)`,
  `ResponseEntity<Void>` (202), Swagger.
- [x] 4.3 Vínculo no primeiro acesso: `UsuarioSyncServiceImpl`, quando role `ATLETA`, vincula
  `Usuario`↔`Atleta` (preenche `usuario_id`) por email dentro do tenant — idempotente. (O
  provisionamento da **conta** em si é responsabilidade do Keycloak — Fase 5.)
- [x] 4.4 `GlobalExceptionHandler`: reusadas exceções existentes (`DuplicateResourceException`→409,
  `DomainRuleViolationException`→422, `DomainNotFoundException`→404); **adicionado** handler
  `UnsupportedOperationException`→501 para o placeholder do gateway. (Não foram necessárias novas
  exceções `ConviteInvalidoException`/`DominioJaExisteException`.)

## 5. Migração de Dados

- [x] 5.1 Runbook de migração Groups→Organizations + backfill do tenant `default` documentado em
  `apps/menthoros-backend/docs/add-assessoria-onboarding-keycloak-runbook.md`. (Execução da migração
  em si é Fase 5/infra — pendente.)

## 6. Testes

- [x] 6.1 `AssessoriaServiceImplTest`: cria assessoria + Organization (gateway mockado); rejeita
  `dominio` duplicado; propaga erro do gateway sem persistir org id. `AssessoriaMapperTest` (null-checks).
- [x] 6.2 `AtletaServiceImplConviteTest`: gera convite; atleta de outro tenant → not found; sem email → 422;
  sem org id → 422. `UsuarioSyncServiceImplLinkTest`: vincula quando ATLETA + email bate; não revincula.
- [ ] 6.3 `JwtTenantFilter`: resolver `tenant_id` a partir do claim de **Organization** (Fase 5 —
  depende do token real). Entregue `JwtTenantFilterShouldNotFilterTest` (libera `/api/admin/**`).
- [x] 6.4 `./mvnw test` — verde (662 testes, 0 falhas).

## 7. OpenSpec

- [x] 7.1 Atualizar este `tasks.md` conforme execução.
- [x] 7.2 `specs/assessoria-onboarding/spec.md` permanece alinhado (sem mudança de contrato).

---

## Notas de execução / desvios

- **Gateway placeholder**: `KeycloakOrganizationGatewayImpl` existe só para o contexto Spring subir;
  **falha explícito (501)** se chamado — nunca cria assessoria com org id sintético. Substituir pelo
  adapter real na Fase 5.
- **`JwtTenantFilter.shouldNotFilter("/api/admin/**")`**: necessário porque o cadastro de assessoria é
  feito por um ADMIN **sem tenant** (está criando o tenant); sem isso o endpoint ficaria inacessível.
  Autorização continua via `@PreAuthorize("hasRole('ADMIN')")`.
- **V34 revertida ao conteúdo original**: uma correção de revisão havia editado a V34 in-place após ela
  já ter sido aplicada ao Postgres de dev compartilhado (`192.168.15.24`), quebrando o checksum do
  Flyway. Revertida (migration aplicada é imutável). O banco de dev já tem **V33/V34/V35** aplicadas.
- **Tech-debt anotado** (não-bloqueante): `created_at`/`createdAt` em `LocalDateTime` vs `TIMESTAMPTZ`;
  `UNIQUE(usuario_id)` para race de login concorrente; documentar 401 no Swagger; unicidade **global**
  de email de atleta (`tb_atleta.email UNIQUE`) — limitação de produto a revisar.
