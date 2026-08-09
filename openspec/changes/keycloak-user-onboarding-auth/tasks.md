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

      **PROVISIONADO no Railway em 2026-08-06** — as três variáveis gravadas, deploy `SUCCESS`:

      ```
      KEYCLOAK_SERVER_URL = http://menthoros-keycloak.railway.internal:8080
      KC_ADMIN_USER       = admin
      KC_ADMIN_PASSWORD   = definida
      ```

      Domínio **privado** de propósito: mantém o tráfego admin dentro da rede do Railway. A senha é a
      do admin do realm `master`, a mesma do HomeLab desde o espelhamento do `keycloak-db`. As
      credenciais foram exercitadas contra o Keycloak do Railway e **obtêm token de admin**.

      ⚠️ **A task segue ABERTA de propósito — uma suposição minha não foi verificada.** Eu escolhi
      `menthoros-keycloak.railway.internal:8080`, e ninguém provou que o backend alcança o Keycloak
      por esse endereço e porta: o serviço do Keycloak **não declara `PORT` nem `KC_HTTP_PORT`**,
      depende do default 8080 com `KC_HTTP_ENABLED=true`. Plausível, não verificado — e é a mesma
      classe de erro que já custou tempo nesta trilha (config que parece certa e só falha quando
      alguém a usa). `railway ssh` exigiria chaves configuradas e não estava disponível.

      **Onde isso se resolve naturalmente:** `AssessoriaServiceImpl:56` (`criarOrganization`) e
      `AtletaServiceImpl:270` (convite de atleta) exercitam o gateway ponta a ponta. A primeira task
      desta change que tocar esse caminho fecha a verificação — **decisão do CTO (2026-08-06):** não
      criar dado descartável em dev só para fechar a caixinha antes da hora.
      *verify:* criação real de organização no Keycloak exercitada com sucesso **no Railway**.
- [x] 0.2 **NÃO precisa.** Verificado em 2026-08-09:
      - os `*IT` de controller autenticam com o post-processor `jwt()` (JWT sintético), não com
        token real — nenhum direct grant envolvido;
      - o endpoint desta change é público: `/api/public/**` **já consta** em
        `CoreSecurityProperties.publicPaths` (`config/core/CoreSecurityProperties.java:22`).
      O `menthoros-test` só seria ligado para exploração manual de API, temporariamente, pelo
      procedimento do `menthoros-infra/keycloak/README.md`.
      📌 **De quebra, confirma o escopo da 2.4b:** o Spring Security já libera a rota; o que
      falta é a isenção no `JwtTenantFilter`, que é outro filtro, mais cedo na cadeia.
      ~~Conferir se o `menthoros-test` precisa ser ligado~~ para algum teste desta change. Ele
      nasce `enabled: false` desde 2026-08-06 (mantém direct grant, e deixá-lo ligado devolveria o
      vetor que o corte eliminou). Procedimento em `menthoros-infra/keycloak/README.md`.

## 1. Discovery e decisões

- [x] 1.1 **Mapeado em 2026-08-09.** Caminhos reais, com o que se reaproveita:

      | O que | Onde | Reaproveita? |
      |---|---|---|
      | Fluxo PKCE do front | `context/auth/{oidcConfig,userManager,AuthProvider}.ts(x)` | ✅ pronto — o cadastro só precisa iniciá-lo |
      | Claim de tenant | scope **optional** `organization` → `tenant_id` no claim | ✅ já pedido em `oidcConfig.ts` |
      | Tenant por request | `JwtTenantFilter` → `TenantContext` | ⚠️ precisa da isenção da 2.4b |
      | Rota pública no Security | `CoreSecurityProperties.publicPaths` já tem `/api/public/**` | ✅ nada a fazer |
      | Gate LGPD | `LgpdConsentInterceptor` já libera sem JWT/tenant | ✅ nada a fazer |
      | Conflito (409) | `DuplicateResourceException` → `CONFLICT` | ✅ **não criar exceção nova** |
      | Falha do Keycloak (502) | `KeycloakIntegrationException` → `BAD_GATEWAY` | ✅ **não criar exceção nova** |
      | Gateway Keycloak | `KeycloakOrganizationGatewayImpl` | ⚠️ só `criarOrganization` e `enviarConviteAtleta` — o resto é a 2.3 |
      | Rate limit | `WaitlistRateLimitFilter` (Caffeine, por `getRemoteAddr()`) | ⚠️ generalizar na 2.6 |
      | Honeypot | `WaitlistInputDto` + resposta indistinguível no controller | ✅ copiar o padrão |
      | Slug | `tb_assessoria.dominio` **UNIQUE** | ✅ **não criar campo** |

      📌 **O reaproveitamento é maior do que a estimativa L sugere.** O que a change realmente
      constrói é o **orquestrador** e a **tabela de provisionamento** — quase todo o resto já
      existe e só precisa ser conectado.
- [x] 1.2 **ADR 0009 escrito** — `apps/menthoros-backend/docs/adr/0009-provisionamento-de-signup-sem-transacao-entre-postgres-e-keycloak.md`,
      com as cinco decisões e as consequências, para que sobrevivam ao arquivamento da change.
      ~~Decidir e documentar em ADR curto:~~ ~~container de tenant~~, ~~verificação de e-mail~~,
      ~~estado de provisionamento~~, compensação/reconciliação e proteção anti-abuso.
      **Três já decididas em 2026-08-07 e registradas no `design.md`:**
      - **tenant = Organizations** (não grupo/atributo) — é o caminho já implementado no gateway;
        vêm juntas as restrições de um-usuário-uma-organização e do scope optional.
      - **`verifyEmail: true` no realm**, desconsiderando os cadastros existentes (decisão do CTO).
      - **estado de provisionamento** = tabela `tb_signup_provisioning` (V75), esboçada no design.
      Restam **compensação/reconciliação** (detalhe operacional do runbook) e **anti-abuso**
      (ligado à 2.6: generalizar o `WaitlistRateLimitFilter` ou criar outro).
- [x] 1.3 **FEITO em 2026-08-07 — `spec.md` reescrito.** A versão anterior especificava
      `POST /api/public/auth/login` com `username`/`password` devolvendo `accessToken`, e
      `POST /api/admin/usuarios` — ou seja, **ROPC**, o grant desligado no realm em 2026-08-06.
      Como `specs/` vira contrato canônico ao arquivar, aquilo consagraria de volta o que a
      `disable-ropc-direct-grant` eliminou. Agora especifica o signup público, PKCE para o login,
      a travessia dos filtros, a compensação em ordem inversa, a verificação de e-mail nativa e
      o anti-abuso.

## 2. Backend

- [x] 2.1 `CoachSignupInputDto` + 35 testes. Normalização no construtor compacto roda **antes** da
      validação, então ` ADMIN ` não escapa da reserva por caixa alta. A senha fica fora da
      normalização de propósito — trim mudaria o segredo escolhido.
      ⚠️ **`default` é slug reservado de fato**, não hipotético: é o tenant semeado pela V2.
      ⚠️ **O realm não tem `passwordPolicy`** — o `@Size` da senha é hoje o *único* portão de
      força. Ver 4.x.
      *verify:* `./mvnw test -Dtest=CoachSignupInputDtoTest` → 35/35 verdes.
- [x] 2.2 `V75__create_tb_signup_provisioning.sql` + `SignupProvisioningMigrationTest`.
      Ajustes contra o esboço do `design.md`, por divergência com o banco real: `slug`
      **varchar(100)** (não 120), acompanhando `tb_assessoria.dominio`; `email` **varchar(180)**,
      espelhando o DTO. CHECK no `status` e índice parcial na varredura de reconciliação.
      *verify:* validado contra **Postgres 17 descartável**, não só por leitura — os cinco
      comportamentos passaram, incluindo o que sustenta a compensação: após o `DELETE` da
      assessoria o rastro preserva `slug` e `correlation_id`, a referência vira `NULL` e o slug
      é reaproveitado. O teste JUnit exige Testcontainers e roda no CI (sem Docker local).

- [ ] 2.3 Adaptar o gateway Keycloak existente para criar, consultar, habilitar/desabilitar e remover tenant/usuário, atribuir role/claim e enviar verify-email.
- [ ] 2.4 Implementar orquestrador idempotente, plano BASIC (`maxAtletas=10`, `maxTecnicos=1`), compensações e registro para reconciliação; não confiar em `@Transactional` para Keycloak.
- [ ] 2.4b **Isentar `/api/public/**` no `JwtTenantFilter`** — hoje ele isenta apenas
      `/api/admin/**` e o caminho **exato** `/api/v1/waitlist` (`JwtTenantFilter:69`). O front
      injeta `Authorization` globalmente, então um token residual **sem `tenant_id`** derruba o
      cadastro com 403 — e o sintoma não aponta para o filtro.
      ⚠️ Seguir o padrão do waitlist: match **exato** ou prefixo deliberado, com comentário
      explicando por que a rota é tenant-less. O `LgpdConsentInterceptor` **não** precisa mudar:
      ele já libera requisição sem JWT/sem tenant — mas depende deste filtro não rejeitar antes.
      *verify:* cadastro com `Authorization` residual de outra sessão responde normalmente.
- [ ] 2.5 Implementar `POST /api/public/coach-signups` com respostas `201/400/409/429/502/503`, feature flag, limite de corpo e sem tokens na resposta.
- [ ] 2.6 **Rate limit — DECIDIDO em 2026-08-07 (ver `design.md`): generalizar o `WaitlistRateLimitFilter`,
      com duas dimensões (~3/h por IP e ~3/dia por e-mail), honeypot reusado e teto diário global
      (**~20/dia**) com alerta. Sem CAPTCHA agora, com gatilho declarado. Isto é execução, não decisão.** Já existe proteção por IP em `/api/v1/waitlist`, contando por
      `getRemoteAddr()` e não pelo XFF cru (que é falsificável) — a correção veio da
      `harden-waitlist-rate-limit`. Criar um segundo mecanismo sem decidir produz **duas
      políticas divergentes** para o mesmo tipo de rota pública.
      Implementar a proteção anti-bot decidida; configurar CORS/CSRF e service account de menor
      privilégio.
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
