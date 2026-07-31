# Design — keycloak-user-onboarding-auth

## Arquitetura

### Fluxo

```
Coach acessa /cadastro
        ↓
Preenche: nome, email, senha, nome assessoria, domínio
        ↓
POST /api/public/signup
        ↓
Backend (transação):
  1. Cria Assessoria (plano BASIC, maxAtletas=10, maxTecnicos=1)
  2. Keycloak: cria Organization + cria user + envia verify-email
  3. Cria Usuario vinculado (role=TECNICO, keycloakId)
  4. Retorna token JWT
        ↓
Frontend: login automático
        ↓
CoachLayout: aceiteLgpd=false → CoachConsentDialog
        ↓
Após aceite → wizard boas-vindas (primeiro login)
```

### Entidades impactadas

| Entidade | Mudança |
|---|---|
| `Assessoria` | Criada via `AssessoriaService.criarAssessoria()` existente |
| `Usuario` | Criado com `keycloakId`, `email`, `nome`, `role=TECNICO` |
| Keycloak | User + Organization provisionados via `KeycloakOrganizationGateway` |

### Segurança

- Endpoint público (`/api/public/**`) sem autenticação
- Rate-limit no endpoint de signup (prevenir abuse)
- Senha validada no Keycloak (política de complexidade)
- E-mail verify obrigatório antes de acesso completo (Keycloak)
