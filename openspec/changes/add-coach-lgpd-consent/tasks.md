# Tasks — add-coach-lgpd-consent

## 1. Backend

- [ ] 1.1 Localizar `Usuario`, `GET /api/v1/me`, convenções de DTO/erro e a última migração; documentar os caminhos reais no PR antes de codificar.
- [ ] 1.2 Criar migração aditiva com `aceite_lgpd_em`, `versao_termos_aceita` e `versao_privacidade_aceita`; validar aplicação sobre banco com usuários existentes e rollback operacional.
- [ ] 1.3 Mapear os três campos em `Usuario` e criar configuração validada para URLs, versões e e-mail do DPO.
- [ ] 1.4 Estender o output de `me` com `consentimentoPendente`, evidência do aceite e `documentosLegais`; adicionar testes para usuário legado, aceite vigente e versão expirada.
- [ ] 1.5 Implementar `POST /api/v1/me/consentimento` com principal autenticado, validação das duas confirmações/versões, relógio injetável, idempotência e respostas `204/400/409`.
- [ ] 1.6 Testar serviço e controller, incluindo usuário A/B, repetição, concorrência e versão obsoleta.
- [ ] 1.7 Executar no backend `./mvnw clean test` e o comando Flyway adotado pelo repositório; registrar o resultado no PR.

## 2. Frontend

- [ ] 2.1 Atualizar tipos e client de `me`/consentimento sem duplicar um segundo modelo de sessão.
- [ ] 2.2 Implementar `CoachConsentDialog` bloqueante e acessível, com links reais vindos da API, estados de loading/erro e tratamento de versão obsoleta.
- [ ] 2.3 Implementar a precedência no `CoachLayout`: loading/erro → consentimento → onboarding (se disponível) → conteúdo; refetch obrigatório após aceite.
- [ ] 2.4 Criar `/coach/settings/perfil` e o item “Meu perfil”; exibir dados e informações de privacidade. Manter campos read-only salvo se APIs existentes forem confirmadas.
- [ ] 2.5 Testar diálogo, teclado/backdrop, falha/refetch, gate e página de perfil com a biblioteca já usada no frontend.
- [ ] 2.6 Executar no frontend `npm run lint && npm run build` e a suíte de testes configurada; registrar o resultado no PR.

## 3. Entrega

- [ ] 3.1 Validar com Jurídico/DPO textos, base legal, versões, URLs, recusa/retirada e e-mail antes de habilitar a flag em produção.
- [ ] 3.2 Fazer teste E2E: coach legado, coach novo, nova versão de documento e segundo login.
- [ ] 3.3 Confirmar telemetria sem PII: tentativas, sucessos, conflitos de versão e erros, agregados por ambiente.

## Estimativa

M (aprox. 8–12 dias de engenharia + aprovação jurídica externa). Mudança de schema, API, frontend e fluxo global exige trilha Full.
