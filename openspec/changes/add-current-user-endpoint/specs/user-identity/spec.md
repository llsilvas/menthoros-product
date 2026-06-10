## ADDED Requirements

### Requirement: Endpoint de usuário atual (GET /me)

O sistema SHALL expor `GET /api/v1/users/me` (autenticado, tenant-aware) que retorna a identidade do
usuário do token: `id`, `nome`, `email`, `role` e dados da `assessoria`. A resposta SHALL ser
`ResponseEntity<UsuarioMeOutputDto>` com campos nulos omitidos (`@JsonInclude(NON_NULL)`).

#### Scenario: Coach autenticado consulta a própria identidade
- **WHEN** um usuário com role `TECNICO` chama `GET /api/v1/users/me`
- **THEN** o sistema retorna `200 OK` com `role=TECNICO`, dados básicos e a `assessoria`, sem
  `atletaId`

#### Scenario: Usuário não sincronizado no tenant
- **WHEN** o `sub` do JWT não corresponde a nenhum `Usuario` no tenant atual
- **THEN** o sistema retorna `404 Not Found`

#### Scenario: Requisição não autenticada
- **WHEN** a requisição chega sem JWT válido
- **THEN** o sistema retorna `401 Unauthorized`

---

### Requirement: Resolução de atletaId para contas ATLETA

Quando a role do usuário for `ATLETA` e existir vínculo `Usuario`↔`Atleta` no tenant, o sistema SHALL
incluir `atletaId` na resposta de `GET /me`. Quando o vínculo não existir, `atletaId` SHALL ser
omitido.

#### Scenario: Atleta vinculado
- **WHEN** um usuário `ATLETA` vinculado a um `Atleta` chama `GET /me`
- **THEN** a resposta inclui `atletaId` correspondente ao `Atleta` vinculado

#### Scenario: Atleta ainda não vinculado
- **WHEN** um usuário `ATLETA` sem vínculo (`Atleta.usuario_id` nulo) chama `GET /me`
- **THEN** a resposta retorna `200 OK` sem o campo `atletaId`

#### Scenario: Isolamento de tenant na resolução
- **WHEN** o `Atleta` vinculado pertence a outro tenant
- **THEN** o sistema não o resolve e `atletaId` é omitido
