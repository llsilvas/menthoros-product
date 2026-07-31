# keycloak-user-onboarding-auth — Auto-cadastro de Coach e Assessoria

**Status:** proposta
**Criado:** 2026-07-31
**Sizing:** M (~18 tasks, backend + frontend)
**Dependência:** `add-coach-lgpd-consent` (modal consentimento precisa existir antes)

## Problema

Hoje, para cada assessoria nova, o ADMIN precisa manualmente:
1. Criar usuário coach no Keycloak Admin Console
2. Atribuir role TECNICO + grupo da assessoria
3. Criar Assessoria via `POST /api/admin/assessorias`
4. Vincular o coach à assessoria

Isso escala zero. A waitlist captura leads, mas não há conversão automatizada.

## Escopo

1. **Tela de cadastro do coach** (`/cadastro`) — formulário com nome, e-mail, senha, nome da assessoria, domínio
2. **Criação automática** — backend provisiona Keycloak (user + organization) + Assessoria + Usuario em uma transação
3. **E-mail de confirmação** — Keycloak envia verify-email + boas-vindas
4. **Redirecionamento pós-cadastro** — login automático → modal consentimento LGPD → wizard boas-vindas

## Fora do escopo

- Conversão da waitlist → cadastro (follow-up)
- Múltiplos técnicos (follow-up)
- Cobrança/plano no cadastro (usa plano BASIC padrão)
