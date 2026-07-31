# coach-first-login-wizard — Wizard de Boas-Vindas do Coach

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-07-31

## Problema

Um coach recém-cadastrado chega a uma assessoria vazia sem orientação. A jornada precisa levá-lo a uma primeira ação útil sem duplicar regras de cadastro já existentes.

## Escopo

1. Wizard bloqueante de três etapas após o consentimento: conhecer/personalizar assessoria, cadastrar primeiro atleta e opcionalmente enviar convite.
2. Reutilização dos contratos de assessoria, criação de atleta e convite; o wizard apenas orquestra e apresenta versões compactas dos formulários.
3. Estado persistente `onboardingConcluido` e endpoint idempotente de conclusão.
4. Pular qualquer etapa e concluir o wizard; atleta criado permanece criado mesmo se o usuário sair depois.

## Fora do escopo

- Novos endpoints de upload, assessoria, atleta ou convite. Lacunas encontradas nesses contratos devem ser resolvidas em suas changes donas.
- Importação CSV, tour completo do produto, retomada no mesmo step entre dispositivos ou analytics comportamental detalhado.
- Rollback de atleta/convite ao abandonar o wizard.
- Exibir o wizard retroativamente para coaches existentes.

## Dependências e ordem

- `add-coach-lgpd-consent`: define o gate que sempre vem antes do wizard.
- `keycloak-user-onboarding-auth`: novos usuários devem ser criados com `onboardingConcluido=false`.
- `assessoria-settings-ui` (pelo menos API de leitura/update e estratégia de logo) e APIs existentes de criar/convidar atleta devem estar disponíveis antes do fluxo completo. Se logo upload não fizer parte do MVP de settings, o wizard também não o oferece.

## Critérios de aceite

- **Dado** um coach novo com consentimento vigente e onboarding pendente, **quando** entra, **então** vê o wizard antes do dashboard.
- **Dado** consentimento pendente, **então** o wizard não é montado até o aceite ser confirmado no `me` recarregado.
- **Quando** o coach salva uma etapa, **então** o wizard chama o mesmo serviço/API da tela completa e mostra erros sem avançar silenciosamente.
- **Quando** o coach pula uma etapa, **então** avança sem criar/alterar dados; no convite, a ação fica indisponível se nenhum atleta foi criado.
- **Quando** conclui ou confirma “pular onboarding”, **então** o endpoint idempotente marca conclusão, `me` é recarregado e o dashboard aparece.
- Coaches existentes na data da migração não recebem o wizard; novo signup recebe.

## Métrica de sucesso

Ao menos 70% dos novos coaches concluem ou pulam conscientemente o wizard em menos de 5 minutos, e ao menos 50% criam o primeiro atleta durante a sessão.

## Open Questions & Assumptions

- **Bloqueante:** confirmar contratos reais para update da assessoria, criação de atleta e convite; nomes/paths abaixo são conceituais até a discovery.
- **Premissa:** o onboarding é por usuário, não por assessoria; futuros técnicos adicionais não devem alterar o estado do proprietário.
- **Premissa:** somente coaches criados após o rollout entram pendentes. Se Produto quiser onboarding retroativo, é uma campanha separada.
