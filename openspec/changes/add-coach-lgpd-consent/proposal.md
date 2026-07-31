# add-coach-lgpd-consent — Consentimento LGPD e Perfil do Coach

**Status:** proposta
**Criado:** 2026-07-31
**Sizing:** S (~8 tasks, frontend-heavy)

## Problema

O Menthoros processa dados pessoais de treinadores (nome, e-mail, avatar, registro de acesso) sem consentimento documentado. A Política de Privacidade e o RIPD cobrem atletas e assessorias, mas o coach como titular de dados está descoberto — risco LGPD identificado na auditoria de 2026-07-31.

Além disso, o coach não tem página de perfil/configurações para exercer direitos básicos (correção de dados, contato com DPO, solicitação de exclusão).

## Escopo

1. **Modal de consentimento no primeiro login** do coach — 2 checkboxes (Termos de Uso + Política de Privacidade), registro de `aceiteLgpd` + timestamp
2. **Página de Perfil do Coach** (mínima) — visualizar/editar nome, e-mail, avatar, link para política, contato DPO, botão "Solicitar exclusão"
3. **Novo campo `aceiteLgpd` + `aceiteLgpdEm`** na entidade `Usuario` + migração Flyway

## Fora do escopo

- Auto-cadastro de coach (keycloak-user-onboarding-auth)
- Conversão waitlist → assessoria
- Gestão de múltiplos técnicos por assessoria
- Termos de Uso (documento separado, placeholder por enquanto)

## Impacto

- **Backend:** `Usuario.java` (+2 campos), migração Flyway, endpoint `POST /api/v1/me/consentimento`
- **Frontend:** modal `CoachConsentDialog`, página `CoachSettingsPage`, rota no `App.tsx`
- **Documentação:** Política de Privacidade, Mapeamento de Dados e RIPD já atualizados
