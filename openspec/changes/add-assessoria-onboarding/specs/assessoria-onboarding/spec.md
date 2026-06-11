## ADDED Requirements

### Requirement: Cadastro de assessoria cria tenant e Organization no Keycloak

O sistema SHALL expor `POST /api/admin/assessorias`, restrito a `ADMIN`, que cria uma `Assessoria`
(tenant) e a Organization correspondente no Keycloak, persistindo `keycloakOrganizationId`.

O `dominio` SHALL ser único; o corpo SHALL ser validado via Bean Validation; a resposta SHALL ser
`ResponseEntity<AssessoriaOutputDto>` (nunca `Map`).

#### Scenario: Assessoria criada com sucesso
- **WHEN** um `ADMIN` envia `AssessoriaInputDto` válido com `dominio` inédito
- **THEN** a `Assessoria` é persistida, uma Organization é criada no Keycloak e
  `keycloakOrganizationId` é gravado
- **THEN** o endpoint retorna `201 Created` com `AssessoriaOutputDto`

#### Scenario: Domínio já existente
- **WHEN** o `dominio` informado já pertence a outra assessoria
- **THEN** o sistema retorna `409 Conflict` e não cria Organization no Keycloak

#### Scenario: Requisição sem permissão de ADMIN
- **WHEN** um usuário sem role `ADMIN` chama o endpoint
- **THEN** o sistema retorna `403 Forbidden`

#### Scenario: Payload inválido
- **WHEN** `nome`, `dominio` ou `plano` estão ausentes/inválidos
- **THEN** o sistema retorna `400 Bad Request` sem efeitos colaterais

---

### Requirement: tenant_id resolvido via Keycloak Organizations

O sistema SHALL resolver o `tenant_id` da requisição a partir do token emitido pela Organization do
Keycloak, mantendo o contrato de `TenantContext`. Durante a transição, o sistema SHALL aceitar tanto
o claim baseado em Organization quanto a claim direta `tenant_id`.

#### Scenario: Token de Organization resolve tenant
- **WHEN** chega um JWT cujo claim de Organization contém `tenant_id`
- **THEN** `JwtTenantFilter` resolve o `tenant_id` e popula `TenantContext`

#### Scenario: Token sem tenant_id é rejeitado
- **WHEN** chega um JWT sem `tenant_id` em nenhum dos formatos suportados
- **THEN** o sistema rejeita a requisição com `401/403` e não processa a operação

---

### Requirement: Role ATLETA e vínculo Usuario↔Atleta

O sistema SHALL suportar a role `ATLETA` (enum `UserRole` + Keycloak) e SHALL permitir vincular uma
conta `Usuario` a exatamente um `Atleta` por meio de `Atleta.usuario_id` (nullable até o aceite do
convite), respeitando o isolamento por tenant.

#### Scenario: Atleta resolve sua conta
- **WHEN** um `Usuario` com role `ATLETA` está vinculado a um `Atleta` no mesmo tenant
- **THEN** o sistema consegue resolver o `Atleta` a partir do `sub` do JWT

#### Scenario: Atleta sem conta ainda não vinculado
- **WHEN** um `Atleta` foi cadastrado pelo coach mas o convite ainda não foi aceito
- **THEN** `usuario_id` permanece nulo e nenhum acesso autenticado resolve esse `Atleta`

---

### Requirement: Onboarding de atleta por convite

O sistema SHALL expor `POST /api/v1/atletas/{id}/convite` (restrito a `TECNICO`/`ADMIN`,
tenant-aware) que gera ou reenvia um convite. No primeiro acesso, o sistema SHALL provisionar a conta
`ATLETA` no Keycloak, torná-la membro da Organization da assessoria e preencher `Atleta.usuario_id`.

O reenvio de convite SHALL ser idempotente quanto ao vínculo: não duplica `Atleta` nem `Usuario`.

#### Scenario: Convite gerado para atleta cadastrado
- **WHEN** um `TECNICO` chama o endpoint para um `Atleta` do seu tenant sem conta
- **THEN** o sistema gera o convite e retorna `202 Accepted`

#### Scenario: Reenvio de convite é idempotente
- **WHEN** o endpoint é chamado novamente para o mesmo `Atleta` ainda não vinculado
- **THEN** o sistema reenvia o convite sem criar `Atleta`/`Usuario` adicionais

#### Scenario: Aceite provisiona conta e efetiva vínculo
- **WHEN** o atleta acessa pela primeira vez via convite
- **THEN** a conta `ATLETA` é criada no Keycloak, vinculada à Organization, e `Atleta.usuario_id` é
  preenchido

#### Scenario: Convite para atleta de outro tenant é negado
- **WHEN** um `TECNICO` tenta convidar um `Atleta` que pertence a outro tenant
- **THEN** o sistema responde `404 Not Found` (isolamento de tenant)
