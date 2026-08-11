# Tasks — harden-keycloak-service-account

**Tamanho:** M · **Trilha:** Full · Repos: `menthoros-infra` + `menthoros-backend`

## 0. Pré-condição — entender o realm antes de tocá-lo

- [ ] 0.1 Comparar o `menthoros-realm.json` versionado com o realm **servido** no HomeLab, olhando
      especificamente para organizations: o arquivo não declara `organizationsEnabled`, mas a API
      responde. Registrar de onde vem a diferença.
      **Por que é bloqueante:** o `sync-realm.sh` aplica atributo de realm cegamente, e o
      `menthoros-infra/keycloak/README.md` já registra um caso em que isso derrubou configuração
      (`loginTheme`). Sincronizar um client novo junto de um realm que perde organizations quebra o
      auto-cadastro inteiro.
      *validação:* diff documentado no PR do `menthoros-infra`.

## 1. Descobrir as roles mínimas (contra Keycloak real)

- [ ] 1.1 Criar o client `menthoros-backend-svc` **manualmente** num Keycloak descartável ou no
      HomeLab, com service account e **nenhuma** role, e exercitar as **dez** operações da tabela do
      `design.md` uma a uma, anotando qual role cada `403` exige.
      **Não deduzir da documentação** — foi exercitando contra servidor real que a change anterior
      descobriu `exact=true` na busca e o `400 User is disabled` no `send-verify-email`.
      *validação:* tabela operação → role no `design.md`, com as dez linhas preenchidas.
- [ ] 1.2 Confirmar o negativo do CA2: com as roles mínimas, uma operação fora do realm `menthoros`
      (ex.: `GET /admin/realms`) responde `403`.
      *validação:* saída do `curl` colada no PR.

## 2. Realm versionado (`menthoros-infra`)

- [ ] 2.1 Adicionar o client ao `menthoros-realm.json` com `publicClient: false`,
      `serviceAccountsEnabled: true`, `standardFlowEnabled: false`,
      `directAccessGrantsEnabled: false`, `implicitFlowEnabled: false` e as roles da 1.1.
      *validação:* `sync-realm.sh` em ambiente descartável, sem erro.
- [ ] 2.2 Aplicar no **HomeLab** e conferir que organizations continua funcionando (o risco da 0.1).
      *validação:* um auto-cadastro completo pelo caminho anônimo, com o backend ainda no grant antigo
      — prova que o sync não quebrou nada antes de o backend depender do client novo.
- [ ] 2.3 Aplicar no **Railway** e repetir a conferência.
      *validação:* mesma sonda, no ambiente remoto.

## 3. Backend (`menthoros-backend`)

- [ ] 3.1 **Teste primeiro:** `obterTokenAdmin()` monta `grant_type=client_credentials` com
      `client_id`/`client_secret` e **não** envia `username`/`password`.
      *validação:* `./mvnw test -Dtest=KeycloakOrganizationGatewayImpl*Test`.
- [ ] 3.2 Trocar o grant e ajustar `KeycloakAdminProperties`: entram `clientSecret`, saem `username`
      e `password`. Remover as chaves do `application.yml` e do `.env.example`.
      *validação:* `grep -rn "grant_type\", \"password\"" src/main` não retorna nada (CA da métrica).
- [ ] 3.3 Teste do caminho de segredo ausente/inválido: `KeycloakIntegrationException` → 502, e a
      mensagem e o log **não** contêm o segredo.
      *validação:* `./mvnw clean verify`.
- [ ] 3.4 Provisionar `KEYCLOAK_ADMIN_CLIENT_SECRET` (ou nome equivalente) nos dois ambientes e
      remover `KC_ADMIN_USER`/`KC_ADMIN_PASSWORD` do backend.
      ⚠️ Remover **depois** de o novo caminho estar provado no ambiente, não antes.

## 4. Entrega

- [ ] 4.1 Smoke nos dois ambientes: auto-cadastro completo pelo caminho anônimo (sonda do honeypot do
      `coach-signup-reconciliation-runbook.md` para confirmar que o endpoint está ligado), criação de
      atleta com convite, e uma compensação — que é o caminho que usa `DELETE` e costuma ser o
      primeiro a faltar role.
      *validação:* registrar cada resultado aqui, como fez a `keycloak-user-onboarding-auth`.
- [ ] 4.2 Confirmar nos logs do Keycloak que não há mais autenticação de `admin` no realm `master`
      originada do backend — é a evidência da métrica de sucesso.
- [ ] 4.3 Atualizar o `ADR-0009` (ou abrir ADR novo) registrando que o provisionamento passou a usar
      service account, e o que continua verdadeiro: o backend ainda cria usuário e role no realm do
      produto por caminho anônimo, e isso é desenho, não defeito.

## Estimativa

M. O trabalho de código é pequeno — um método e uma classe de propriedades. O que domina é a
**descoberta das roles contra servidor real** (task 1.1) e a coordenação em dois ambientes com corte
seco. A incerteza real está nas roles de organization da 26.x.
