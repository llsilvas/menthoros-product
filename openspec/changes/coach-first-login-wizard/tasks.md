# Tasks — coach-first-login-wizard

## 1. Discovery e backend

- [ ] 1.1 Confirmar caminhos e contratos reais de `me`, update/leitura da assessoria, criação de atleta e convite; definir quais campos de atleta são obrigatórios.
- [ ] 1.2 Criar migração que preserve coaches existentes como concluídos e deixe novos signups pendentes; auditar todos os caminhos de criação de `Usuario`.
- [ ] 1.3 Mapear `onboardingConcluido`, estender `me` e implementar `POST /api/v1/me/onboarding/concluir` idempotente e baseado no principal.
- [ ] 1.4 Testar migração com usuários existentes, signup novo, conclusão repetida e isolamento entre usuários/tenants.
- [ ] 1.5 Executar `./mvnw clean test` e migrações; registrar resultados.

## 2. Frontend

- [ ] 2.1 Centralizar no `CoachLayout` a precedência sessão → consentimento → onboarding → conteúdo, sem gates duplicados.
- [ ] 2.2 Criar `CoachWelcomeWizard` responsivo/acessível, confirmação para pular tudo, estados persistidos em memória e tratamento de loading/erro.
- [ ] 2.3 Implementar etapa de assessoria reutilizando tipos/client/form controls da página completa e respeitando o escopo real de logo.
- [ ] 2.4 Extrair/reutilizar formulário de atleta e client canônico; prevenir duplo submit e tratar conflito após refresh.
- [ ] 2.5 Implementar convite apenas para atleta criado, com estado já-enviado, retry e opção de concluir sem convite.
- [ ] 2.6 Ao concluir, chamar endpoint, refazer `me` e só então liberar o dashboard; instrumentar eventos sem PII.
- [ ] 2.7 Testar fluxo completo, pular parcial/total, voltar, mobile/teclado, erros, refresh e ausência de atleta no convite.
- [ ] 2.8 Executar `npm run lint && npm run build` e testes configurados; registrar resultados.

## 3. Entrega

- [ ] 3.1 E2E com signup novo: login → consentimento → wizard → dashboard → segundo login sem wizard.
- [ ] 3.2 E2E com coach legado para provar que não há interrupção retroativa.
- [ ] 3.3 Validar eventos e métricas de conclusão/criação de primeiro atleta.

## Estimativa

M (aprox. 8–13 dias), desde que os três contratos reutilizados estejam prontos. Se for necessário criar upload, convite ou cadastro de atleta, reestimar com a change dona.
