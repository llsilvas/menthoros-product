# coach-first-login-wizard — Wizard de Boas-Vindas do Coach

**Status:** proposta
**Criado:** 2026-07-31
**Sizing:** S (~7 tasks, frontend-heavy)
**Dependência:** `add-coach-lgpd-consent` (modal), `keycloak-user-onboarding-auth` (signup)

## Problema

Após login, o coach cai num dashboard vazio. Não há orientação sobre o que fazer primeiro. A primeira experiência determina retenção — um coach que não consegue criar o primeiro atleta em 5 minutos abandona.

## Escopo

1. **Wizard de 3 etapas** exibido após consentimento LGPD no primeiro login:
   - Etapa 1: "Configure sua assessoria" (logo, cores, nome — opcional, pode pular)
   - Etapa 2: "Cadastre seu primeiro atleta" (formulário simplificado)
   - Etapa 3: "Convide o atleta" (dispara convite Keycloak)
2. **Flag `onboardingConcluido`** no Usuario — impede re-exibição
3. **Progresso visual:** stepper com 3 steps, permite voltar, permite pular (com confirmação)

## Fora do escopo

- Import CSV de atletas (change separada)
- Configuração completa da assessoria (change separada)
