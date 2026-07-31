# Design — keycloak-user-onboarding-auth

## Discovery obrigatória

Antes da implementação, localizar e registrar no PR: fluxo OIDC do frontend, claim usado por `TenantContext`, representação atual de tenant no Keycloak (Organization, grupo ou atributo), APIs de criação de `Assessoria`/`Usuario`, política de senha/e-mail e contrato padrão de erros. Não criar abstrações com nomes presumidos como `KeycloakOrganizationGateway` sem confirmar o código.

## API pública

`POST /api/public/coach-signups`

```json
{
  "nome": "Ana Souza",
  "email": "ana@example.com",
  "senha": "<redacted>",
  "nomeAssessoria": "Serra Running",
  "slugAssessoria": "serra-running"
}
```

- `201 Created`: `{ "status": "EMAIL_VERIFICATION_REQUIRED", "loginUrl": "/login" }`.
- `400`: validação funcional; `409`: e-mail/slug indisponível; `429`: proteção anti-abuso; `502/503`: falha do provedor.
- A resposta nunca contém token. O `loginUrl` inicia Authorization Code + PKCE pelo adapter existente.
- Normalizar e-mail com a mesma regra do Keycloak; slug em lowercase, `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$`, com lista de reservados. Revalidar unicidade no banco por constraint, não só `existsBy...`.
- Limitar corpo e campos; não retornar ecos da senha; aplicar rate limit antes do provisionamento.

## Orquestração e consistência

Keycloak não participa da transação PostgreSQL. `@Transactional` sozinho não desfaz recursos externos. O serviço orquestrador mantém IDs de cada etapa e compensa em ordem inversa:

1. Validar entrada, rate limit, disponibilidade aparente e configuração.
2. Criar assessoria local como `PROVISIONING` (ou usar registro de operação equivalente).
3. Criar container de tenant no Keycloak.
4. Criar usuário desabilitado/pendente de verificação, definir senha, role `TECNICO` e vínculo ao tenant.
5. Criar `Usuario` local com `keycloakId` e assessoria.
6. Marcar assessoria/operação `ACTIVE`, habilitar usuário e disparar verify-email.

Em falha, excluir/desabilitar recursos externos criados e remover/marcar como falha os locais. Se compensação falhar, persistir uma operação `RECONCILIATION_REQUIRED` (sem senha) com correlation ID e IDs externos; uma rotina/admin runbook deve permitir retry idempotente. Nunca logar senha/tokens.

Se a modelagem atual não tiver estado de provisionamento, a discovery decide entre adicionar esse estado ou uma tabela `signup_provisioning`. Essa decisão deve ocorrer antes de estimar migrations finais.

## Idempotência e concorrência

- Constraint única para slug normalizado e para e-mail local normalizado, além da unicidade no Keycloak.
- Aceitar header `Idempotency-Key`; guardar hash do request sem senha e resultado por janela limitada. A mesma chave/payload retorna o resultado; payload diferente retorna `409`.
- Tratar corrida após pre-check como conflito e compensar recursos já criados.

## Frontend e jornada

O formulário não contém checkbox de aceite jurídico. Ele mostra links informativos para Termos/Privacidade; o aceite versionado acontece após autenticação. Após `201`, mostrar instrução para verificar e-mail e CTA “Ir para login”. Não gravar credenciais ou tokens no browser.

Jornada integrada:

```text
/cadastro → provisionamento → verificar e-mail → login OIDC/PKCE
→ GET /api/v1/me → consentimento pendente → onboarding pendente → dashboard
```

## Segurança e operação

- CORS apenas para origens configuradas; CSRF conforme a arquitetura do endpoint; CAPTCHA/rate limiting distribuído.
- Credencial de service account do Keycloak com privilégios mínimos e rotação.
- Métricas: tentativa/sucesso/conflito/rate-limit/falha/compensação, sem PII de alta cardinalidade.
- Teste de integração real com Keycloak em ambiente efêmero; mocks não comprovam claims/roles.

## Rollout

Publicar backend com endpoint protegido por feature flag, executar smoke/reconciliação, publicar frontend e abrir gradualmente. Desabilitar a flag interrompe novos cadastros sem afetar contas já criadas.
