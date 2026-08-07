# Tasks — keycloak-user-onboarding-auth

## 0. Pré-condição herdada — o gateway admin não funciona hoje

> Achado em 2026-08-06 durante a `disable-ropc-direct-grant`, roteado para cá porque **o signup
> desta change depende inteiramente dele** para provisionar organização e usuário no Keycloak.

- [ ] 0.1 **Provisionar as credenciais de admin do Keycloak no backend do Railway `develop`.**
      `KeycloakOrganizationGatewayImpl:129` obtém token de admin com `grant_type=password` usando
      `admin-cli` no realm `master`.

      | Alvo | Estado (verificado 2026-08-06) |
      |---|---|
      | Local / HomeLab | ✅ **funciona** — `apps/menthoros-backend/.env` traz `KEYCLOAK_SERVER_URL`, `KC_ADMIN_USER` e `KC_ADMIN_PASSWORD`, e as credenciais foram exercitadas: token de admin obtido com sucesso |
      | Railway `develop` | ❌ **as três ausentes** → cai nos defaults `http://localhost:8080` e senha vazia; o backend tentaria autenticar em si mesmo |

      ⚠️ **Correção de um registro anterior meu.** Eu havia escrito que as credenciais faltavam em
      *todos* os ambientes — olhei o `.env` do `menthoros-infra`, que serve ao **compose**, enquanto o
      backend roda como processo local e lê o `.env` do próprio repo. O defeito é real, mas **só no
      Railway**.

      *Valores para o Railway:* `KEYCLOAK_SERVER_URL=http://menthoros-keycloak.railway.internal:8080`
      (domínio privado, sem sair para a internet), `KC_ADMIN_USER=admin` e a senha do admin do realm
      `master` — que desde o espelhamento do `keycloak-db` é a mesma do HomeLab.
      *verify:* criação real de organização no Keycloak exercitada com sucesso **no Railway**.
- [ ] 0.2 **Conferir se o `menthoros-test` precisa ser ligado** para algum teste desta change. Ele
      nasce `enabled: false` desde 2026-08-06 (mantém direct grant, e deixá-lo ligado devolveria o
      vetor que o corte eliminou). Procedimento em `menthoros-infra/keycloak/README.md`.

## 1. Discovery e decisões

- [ ] 1.1 Mapear OIDC/PKCE, claims de role/tenant, modelo Keycloak, serviços/repositórios e contratos de erro existentes; registrar caminhos reais e decisões.
- [ ] 1.2 Decidir e documentar em ADR curto: container de tenant, verificação de e-mail, estado de provisionamento, compensação/reconciliação e proteção anti-abuso.
- [ ] 1.3 Revisar o arquivo `specs/keycloak-user-onboarding-auth/spec.md`, que atualmente descreve login público por senha e provisionamento administrativo, e alinhá-lo ao signup público desta change antes de implementar.

## 2. Backend

- [ ] 2.1 Criar DTO/validação/normalização para nome, e-mail, senha, nome e slug; adicionar lista de slugs reservados e limites de payload.
- [ ] 2.2 Criar constraints/migração e, conforme ADR, estado/tabela de provisionamento e idempotência; validar com dados concorrentes.
- [ ] 2.3 Adaptar o gateway Keycloak existente para criar, consultar, habilitar/desabilitar e remover tenant/usuário, atribuir role/claim e enviar verify-email.
- [ ] 2.4 Implementar orquestrador idempotente, plano BASIC (`maxAtletas=10`, `maxTecnicos=1`), compensações e registro para reconciliação; não confiar em `@Transactional` para Keycloak.
- [ ] 2.5 Implementar `POST /api/public/coach-signups` com respostas `201/400/409/429/502/503`, feature flag, limite de corpo e sem tokens na resposta.
- [ ] 2.6 Implementar rate limit distribuído e a proteção anti-bot decidida; configurar CORS/CSRF e service account de menor privilégio.
- [ ] 2.7 Adicionar logs estruturados por correlation ID, métricas sem senha/token e alerta/runbook para `RECONCILIATION_REQUIRED`.
- [ ] 2.8 Testar validação, idempotência, corridas, cada ponto de falha/compensação e ausência de segredos em logs/respostas.
- [ ] 2.9 Executar `./mvnw clean test`, migrações e testes de integração com Keycloak efêmero; registrar resultados.

## 3. Frontend

- [ ] 3.1 Criar rota pública `/cadastro`, formulário acessível e links informativos configurados para documentos legais, sem checkbox de aceite.
- [ ] 3.2 Criar client/hook com estados loading, erros funcionais, `429`, indisponibilidade e chave de idempotência por tentativa.
- [ ] 3.3 Após `201`, exibir confirmação de verificação de e-mail e iniciar o login OIDC/PKCE existente somente por ação do usuário; não usar `localStorage.setItem` manual.
- [ ] 3.4 Testar validação, duplo clique/idempotência, conflito, rate limit, falha do provedor e redirecionamento.
- [ ] 3.5 Executar `npm run lint && npm run build` e a suíte de testes configurada; registrar resultados.

## 4. Entrega

- [ ] 4.1 E2E real: signup → e-mail → login → claims corretos → consentimento → wizard/dashboard.
- [ ] 4.2 Testar falhas injetadas após cada recurso criado e comprovar que compensação/reconciliação não deixa conta utilizável sem tenant local.
- [ ] 4.3 Habilitar por feature flag, observar métricas e executar o runbook de rollback/reconciliação.

## Estimativa

L (aprox. 15–25 dias de engenharia, mais configuração de infraestrutura/e-mail). Identidade pública, multi-tenancy, integração não transacional e anti-abuso tornam a estimativa M original irrealista.
