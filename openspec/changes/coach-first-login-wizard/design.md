# Design — coach-first-login-wizard

## Fluxo

```
Login → CoachLayout → aceiteLgpd=false → CoachConsentDialog
        ↓ (aceitou)
CoachLayout → onboardingConcluido=false → CoachWelcomeWizard
        ↓
Step 1: Configurar assessoria (opcional) → Pular/Próximo
Step 2: Cadastrar primeiro atleta (opcional) → Pular/Próximo
Step 3: Enviar convite (se atleta cadastrado) → Ir para Dashboard
        ↓
POST /api/v1/me/onboarding-concluir
        ↓
Dashboard normal
```

## Componentes

| Componente | Descrição |
|---|---|
| `CoachWelcomeWizard` | Stepper container, gerencia step atual |
| `CoachWelcomeWizard.stories.tsx` | Casos: fluxo completo, pular tudo, só configurar assessoria |

## Estado

- `onboardingConcluido` persiste no backend — sobrevive a refresh/relogin
- Wizard é renderizado no `CoachLayout` (antes do conteúdo normal), similar ao `CoachConsentDialog`
- Steps 1 e 2 são opcionais: "Pular" avança sem salvar
