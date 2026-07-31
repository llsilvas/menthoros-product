# Tasks — coach-first-login-wizard

## Backend (2 tasks)

- [ ] 1.1 **Campo `onboardingConcluido`** no `Usuario.java` — boolean, default false. Migração Flyway `ALTER TABLE tb_usuario ADD COLUMN onboarding_concluido BOOLEAN NOT NULL DEFAULT false`.
- [ ] 1.2 **Endpoint `POST /api/v1/me/onboarding-concluir`** — seta `onboardingConcluido = true`; `UsuarioMeOutputDto` inclui o campo.

## Frontend (5 tasks)

- [ ] 2.1 **`CoachWelcomeWizard`** (`src/features/coach/components/CoachWelcomeWizard.tsx`): MUI Stepper horizontal com 3 steps.
- [ ] 2.2 **Step 1 — "Sua assessoria":** campos opcionais (logo upload, cor primária, cor secundária, nome). Botão "Pular" + "Próximo".
- [ ] 2.3 **Step 2 — "Primeiro atleta":** formulário `AtletaDialog` simplificado (nome, email, peso, altura, nível, objetivo). Botão "Pular" + "Próximo".
- [ ] 2.4 **Step 3 — "Convide":** confirmação visual do atleta criado, botão "Enviar convite" (chama `POST /api/v1/atletas/{id}/convite`), feedback de sucesso, botão "Ir para o Dashboard".
- [ ] 2.5 **Testes:** renderiza wizard quando `onboardingConcluido=false`, permite pular steps, conclui e redireciona.

## Verificação (2 tasks)

- [ ] 3.1 Wizard aparece após modal consentimento (fluxo completo: login → consent → wizard → dashboard).
- [ ] 3.2 Wizard NÃO aparece no segundo login (`onboardingConcluido=true`).

## Sizing: S (~7 tasks)
