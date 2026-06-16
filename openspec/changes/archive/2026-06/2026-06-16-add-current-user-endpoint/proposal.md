# Proposal: add-current-user-endpoint

## Status

Proposed

## Why

Os shells de atleta e coach precisam, logo após o login, saber "quem sou eu": role, dados básicos,
assessoria e — quando for atleta — qual `atletaId`. Hoje não existe endpoint de usuário atual. O
`JwtTenantFilter` já sincroniza/popula um `Usuario` e resolve o tenant, mas nada disso é exposto ao
cliente. Sem isso, o frontend não consegue rotear para o shell correto nem resolver o contexto do
atleta para as telas de progresso.

## What Changes

- Novo `UsuarioController` com `GET /api/v1/users/me` (`@RequireTenant`): retorna `role`, `nome`,
  `email`, dados da `assessoria` e `atletaId` (presente apenas quando a role for `ATLETA` e o vínculo
  existir). DTO `UsuarioMeOutputDto` (record, `@JsonInclude(NON_NULL)`).
- `UsuarioService.getCurrentUser()` resolve o `Usuario` pelo `sub` do JWT no tenant atual (reusa
  `TenantContext.getRequiredTenantId()` + `UsuarioRepository`) e, quando `ATLETA`, resolve o `Atleta`
  vinculado (`Atleta.usuario_id`, criado em `add-assessoria-onboarding`).
- Wiring de autorização `ROLE_ATLETA` nos endpoints voltados ao atleta, habilitando o consumo do
  vínculo.

## Capabilities

### ADDED Capabilities

- `user-identity`: identidade do usuário autenticado em runtime (`GET /me`) incluindo resolução do
  `atletaId` para contas `ATLETA`.

## Impact

- **Depende de (por id):** `add-assessoria-onboarding` (#0) — role `ATLETA` e vínculo
  `Usuario`↔`Atleta`; `keycloak-user-onboarding-auth` (externa) — sincronização do `Usuario`.
- **Arquivos de produção (trabalho futuro):** novo `UsuarioController`, `UsuarioService`/impl,
  `dto/output/UsuarioMeOutputDto`, `UsuarioMapper` (null-check). Sem migração nova.
- **Sem breaking changes:** endpoint somente-leitura, novo.
