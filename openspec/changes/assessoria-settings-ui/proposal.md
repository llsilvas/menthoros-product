# assessoria-settings-ui — UI de Configuração da Assessoria

**Status:** proposta
**Criado:** 2026-07-31
**Sizing:** S (~7 tasks, frontend-heavy)
**Dependência:** `keycloak-user-onboarding-auth` (assessoria já criada)

## Problema

A entidade `Assessoria` tem campos como `logo_url`, `cor_primaria`, `cor_secundaria`, `max_atletas`, `max_tecnicos` — mas não há UI para editá-los. Toda alteração depende de SQL manual. O coach não consegue personalizar a identidade visual da sua assessoria na plataforma.

## Escopo

1. **Página de configurações da assessoria** (`/coach/settings/assessoria`) — acessível pelo coach
2. **Editar:** nome, logo (upload), cores primária/secundária
3. **Visualizar:** plano atual, atletas usados/máximo, técnicos usados/máximo
4. **Endpoint `PUT /api/v1/assessoria/me`** — coach edita a própria assessoria

## Fora do escopo

- Upgrade/downgrade de plano (cobrança)
- Gestão de múltiplos técnicos
- Alteração de domínio (sensível, via suporte)
