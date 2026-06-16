# Proposal: add-assessoria-onboarding

## Status

Proposed

## Why

Hoje não existe fluxo de cadastro de uma assessoria (tenant) nem de provisionamento de suas contas.
A entidade `Assessoria` é criada manualmente/via seed, o vínculo com o Keycloak é feito por
`keycloakGroupId` (modelo de Groups) e **não há role `ATLETA`** — só `ADMIN`, `TECNICO`,
`VISUALIZADOR`. Além disso, `Usuario` (cache do Keycloak) **não tem vínculo com `Atleta`**, então é
impossível responder "este usuário logado é qual atleta?".

Sem essa fundação, os shells de atleta e coach não destravam:
- O shell do atleta pressupõe que o usuário logado tenha role `ATLETA` e resolva o próprio `atletaId`.
- O coach precisa cadastrar atletas e convidá-los, e a assessoria precisa existir como tenant com
  limites de plano.

Esta change padroniza a modelagem de tenant no **Keycloak Organizations** (recurso nativo do
Keycloak 26.x), cria o fluxo de cadastro de assessoria, introduz a role `ATLETA`, o vínculo
`Usuario`↔`Atleta` e o onboarding de atleta por **convite**.

## What Changes

- **Cadastro de assessoria:** `POST /api/admin/assessorias` (novo `AssessoriaController`,
  `@PreAuthorize("hasRole('ADMIN')")`) cria a `Assessoria` (reserva `dominio`, plano e limites) e a
  **Organization** correspondente no Keycloak via `keycloak-admin-client`, persistindo
  `keycloakOrganizationId`. DTOs `AssessoriaInputDto`/`AssessoriaOutputDto` (records).
- **Modelo Keycloak Groups → Organizations:** adiciona `Assessoria.keycloakOrganizationId`
  (migration V33) e plano de migração do tenant `default` e dos grupos existentes. O atributo
  `tenant_id` passa a ser injetado no JWT pela Organization. `JwtTenantFilter` **já resolve**
  `organization.<org>.tenant_id`, então a mudança no filtro é mínima ou nenhuma (ver `design.md`).
- **Role `ATLETA`:** adiciona o valor `ATLETA` ao enum `UserRole` e ao Keycloak (client role).
- **Vínculo `Usuario`↔`Atleta`:** migration V34 cria a coluna de vínculo (decisão de lado e nulidade
  documentada em `design.md`) para que uma conta `ATLETA` resolva seu `Atleta`.
- **Onboarding do coach (TECNICO):** estende `keycloak-user-onboarding-auth` — usuário criado já é
  membro da Organization da assessoria.
- **Onboarding do atleta por convite:** `POST /api/v1/atletas/{id}/convite` gera/reenvia um convite;
  no primeiro acesso a conta `ATLETA` é provisionada no Keycloak, vinculada à Organization e ao
  `Atleta` correspondente.

## Capabilities

### ADDED Capabilities

- `assessoria-onboarding`: cadastro de assessoria como tenant com Organization no Keycloak, role
  `ATLETA`, vínculo `Usuario`↔`Atleta` e convite de atleta.

## Impact

- **Dependência externa (declarada, não autorada aqui):** `keycloak-user-onboarding-auth` — base de
  login/sincronização e provisionamento de usuário. Esta change estende-a com assessoria + role
  `ATLETA` + convite; não redefine o login.
- **Arquivos de produção afetados (trabalho futuro de código):** `entity/Assessoria.java`,
  `entity/Usuario.java`, `entity/Atleta.java`, `enums/UserRole.java`, `security/JwtTenantFilter.java`
  (ajuste mínimo), `services/.../UsuarioSyncServiceImpl.java`, novo `AssessoriaController` +
  `AssessoriaService`, e configuração do realm `menthoros-app` (habilitar Organizations).
- **Migrações Flyway:** V33 (`keycloak_organization_id` em `tb_assessoria`), V34 (vínculo
  `usuario`↔`atleta`). Backfill do tenant `default`.
- **Segurança/multi-tenancy:** preserva o isolamento por tenant; a fonte do `tenant_id` muda de Group
  para Organization sem alterar o contrato do `TenantContext`.
- **Breaking:** o realm precisa ter Organizations habilitado e os grupos migrados antes do corte.
  Plano de migração detalhado em `design.md`.
