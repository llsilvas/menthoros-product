# Tasks — convite-assessorias-fundadoras

## 0. Pré-condições operacionais (fora do código, bloqueiam o `/pr`)

- [ ] 0.1 Usuário do founder com role `ADMIN` no Keycloak de **produção**, via `menthoros-infra`
      (seed/sync), nunca pelo console. Registrar o procedimento no `keycloak/README.md` se ainda
      não existir.
      *verify:* JWT do founder em produção contém `ADMIN` em `realm_access.roles`.
- [ ] 0.2 Vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS`, `SMTP_FROM`,
      `SMTP_FROM_NAME` no serviço `menthoros-backend` do Railway (`develop` e `production`), por
      referência às `KC_SMTP_*` do Keycloak. Conferir `FRONTEND_URL` nos dois ambientes.
      *verify:* `railway variables --service menthoros-backend --environment develop` lista as sete.
- [ ] 0.3 Confirmar no Resend que o domínio está verificado e que um segundo cliente SMTP com a
      mesma API key envia normalmente (teste com a implementação da task 2.6 em `develop`).

## 1. Discovery e decisões

- [x] 1.1 **Decidido em 2026-08-28: inglês.** O ADR-0007 é sobre camadas; a regra de idioma está no
      `CLAUDE.md` do backend ("Identifier Language", 2026-07-25): código novo nasce em inglês. Os
      artefatos foram renomeados (`tb_founding_invite`, `FoundingInvite`, `founding`/`founding_converted_at`,
      `origin`/`invite_id`, `InviteToken`, `EmailSender`, `inviteToken`). URLs ficam como no spec — são
      contrato, e as rotas `/api/admin/**` existentes já são PT.
- [x] 1.2 Confirmado: `KeycloakOrganizationGatewayImpl.java:148` usa `exact=true`; serve para "e-mail
      já possui conta".
- [x] 1.3 Spec revisada no `/implement init` (DoR) e renomeada junto com 1.1.

## 2. Backend — convite e e-mail

- [x] 2.1 **Feito.** Migration `V84__create_tb_founding_invite.sql`: tabela, índice parcial
      único por inscrito ativo, colunas `founding`/`founding_converted_at` em `tb_assessoria`,
      `origin` em `tb_signup_provisioning` com `DEFAULT 'PUBLIC_SIGNUP'` e `invite_id` (FK,
      índice parcial) para contar tentativas por convite.
      *verify:* teste de migration com Testcontainers (padrão `SignupProvisioningMigrationTest`);
      `./mvnw clean test`.
      📌 `FoundingInviteMigrationTest` (Testcontainers) roda só no CI — sem Docker local. FK da
      waitlist com `ON DELETE CASCADE`; `assessoria_id` com `SET NULL` (compensação apaga a assessoria).
- [x] 2.2 **Feito.** Entidade `FoundingInvite` + `FoundingInviteRepository` (`findByTokenHash`,
      `findOpenByWaitlistId` — não convertido e não invalidado, expirado incluso); campos `founding`/`foundingConvertedAt` em `Assessoria`;
      `origem` em `SignupProvisioning` (enum `ProvisioningOrigin`).
      *verify:* `./mvnw clean test`.
- [x] 2.3 **Feito** (6 testes). `InviteToken` — geração (`SecureRandom` 32 bytes, base64url) e `hash(token)` SHA-256 hex;
      `toString()` que não vaza o valor.
      *verify:* testes unitários: 43 chars, hash estável, dois tokens nunca iguais.
- [x] 2.4 **Feito** (5 testes). `EmailSender` (interface) + `EmailMessage` (record) + `FileEmailSender`
      (`@Profile({"local","test"})`, grava `.eml` em `app.email.outbox-dir`, **nunca loga o
      link**) + `SmtpEmailSender` (Spring Mail, profile `cloud`). Dependência
      `spring-boot-starter-mail` no `pom.xml`; `spring.mail.*` no `application.yml` lendo `SMTP_*`.
      *verify:* `./mvnw clean test`; em `local`/`test` o contexto sobe sem SMTP e o `.eml` aparece
      no outbox; em `cloud` sem `SMTP_HOST` o contexto **falha** (teste de contexto negativo).
      📌 Ajustes contra o real: o profile `integration` (ITs) também usa `FileEmailSender`, senão os
      `*IT` exigiriam SMTP; `SmtpEmailSender` é `@Profile("!local & !test & !integration")`. O
      `application-dev.yml` (docker local) tem SMTP **com** defaults para o backend subir — envio
      falha em runtime (502), não no startup; só o `cloud` falha o startup. O teste de contexto
      negativo do `cloud` não foi escrito: exigiria subir contexto com Postgres; o mecanismo é a
      ausência de default em `${SMTP_HOST}` no `application-cloud.yml`, validado na 5.1.
- [x] 2.5 **Feito** (6 testes). Template `resources/templates/email/founding-invite.html` + `.txt` e renderizador de
      placeholders (`{{nome}}`, `{{link}}`, `{{validade}}`). Copy em PT-BR, sem imagens.
      *verify:* teste de renderização: nenhum `{{` sobra; link contém o token; HTML escapa o nome.
- [x] 2.6 **Feito** (12 testes). `FoundingInviteService` / `Impl.convidar(waitlistId, adminSubject)`: `422` ATLETA,
      `422` e-mail > 100 chars (limite do signup/`tb_usuario`), `409` e-mail com conta no
      Keycloak, `409` já convertido, invalida **qualquer** convite anterior não convertido e não invalidado (inclusive expirado ou sem `sent_at` — o índice parcial não olha `expires_at`), insere novo, envia e-mail **fora**
      da transação, `sent_at` no sucesso, `502` na falha de envio. Link no formato
      `<FRONTEND_URL>/#/cadastro?convite=<token>` (fragmento — hash router).
      *verify:* testes de serviço com `EmailSender` e gateway mockados — os cinco caminhos de erro,
      reenvio invalidando o anterior **também quando expirado e quando o SMTP falhou** (sem violar o índice único), e que o token nunca aparece no retorno nem em log.
- [x] 2.7 **Feito** (9 testes). `FoundingInviteAdminController` — `POST /api/admin/waitlist/{id}/convite`,
      `@PreAuthorize("hasRole('ADMIN')")`, `202 { id, waitlistId, expiraEm }`; OpenAPI.
      *verify:* `*Test` (slice `@WebMvcTest` + `AuthWebMvcTestConfig`, cadeia real) com `jwt()`: `ADMIN` → 202;
      `TECNICO` e `PROPRIETARIO` → 403; sem JWT → 401; 404/409/422/502 mapeados; corpo do 502 sem
      detalhe do transporte. Emissor = `sub` do JWT.
- [x] 2.8 **Feito** (2 + 3 testes). `FoundingInviteController` — `GET /api/public/founding-invites/{token}`: `200 {nome,email}`
      só para convite ativo; `404` idêntico para expirado/invalidado/convertido/inexistente.
      `PublicEndpointRateLimitFilter` vira **method-aware** (hoje ignora tudo que não é POST) com
      política `GET` para `/api/public/founding-invites/*`.
      *verify:* slice do controller (200 / 404 com mensagem única); `PublicEndpointRateLimitFilterTest`:
      GETs repetidos no prefixo → 429, GET em outra rota passa, POST no prefixo não usa a política do
      GET, POSTs existentes inalterados. Os cinco estados do token são testados no serviço (2.6).

## 3. Backend — modo fundadora no signup

- [x] 3.1 **Feito** (3 testes de controller + 5 de serviço). `CoachSignupInputDto.inviteToken` opcional; gate do `CoachSignupController` vira
      `enabled || inviteToken != null`; no modo convite o header `Idempotency-Key` é ignorado e a
      chave é derivada **por tentativa**: `"<token_hash>:<n>"`, `n` = rastros existentes com
      aquele `invite_id`. `ACTIVE` → reenvio; só `FAILED` → tentativa nova; qualquer
      `RECONCILIATION_REQUIRED` → `409`; estado intermediário (`STARTED`…`VERIFICATION_EMAIL_SENT`) → `409`.
      *verify:* `*IT`: flag off + sem token → 404; flag off + token válido → 201; flag off + token
      inválido → 404; teste de serviço: após `FAILED` compensado a segunda chamada **conclui**
      (hoje o `resolverReenvio` rejeitaria); após `RECONCILIATION_REQUIRED` → 409.
      📌 Token em branco é normalizado para `null` no DTO (uma representação só para "sem token").
      Construtor de 6 args preservado para os chamadores existentes. A chave por tentativa é
      calculada em `chavePorTentativa` lendo `findByInviteIdOrderByCreatedAtAsc`.
- [x] 3.2 **Feito** (2 testes de gateway). `NovoUsuarioKeycloak.emailVerificado` + gateway enviando `emailVerified` na
      representação do usuário.
      *verify:* teste do gateway confirma o campo no JSON; contrato conferido contra Keycloak 26.7
      real em `develop` (como foi feito na 2.3 da change de onboarding).
      📌 Construtor de 5 args mantido (`emailVerificado = false`). A conferência contra o Keycloak
      26.7 real fica para a 5.1 — o campo `emailVerified` na representação do usuário é documentado
      na Admin REST API e já era enviado (fixo em `false`).
- [x] 3.3 **Feito** (record `ProvisioningMode` em `services/impl`, package-private). `ProvisioningMode` resolvido em `CoachSignupServiceImpl.cadastrar` antes da saga:
      `FOUNDING_INVITE` → GRATUITO 10/1, `founding = true`, `foundingConvertedAt`,
      `emailVerificado = true`, `acoesObrigatorias = []`, sem `enviarVerificacaoDeEmail`; e-mail do
      DTO ≠ e-mail do convite → `422`; token não ativo → `404`.
      *verify:* testes de serviço: os dois modos lado a lado (plano/limites/required actions/envio
      de verificação), e-mail divergente, token expirado.
      📌 Decisão extra: no modo convite os limites anti-abuso por e-mail/dia e o teto diário **não se
      aplicam** — o token é o portão, e o limite de 3/dia bloquearia a retentativa legítima após
      falha. `proximoPasso` do convite é "Sua assessoria está pronta…" (`PRONTO_PARA_ENTRAR`), já
      que não há verificação a esperar. Métricas: `sucesso_convite`, `convite_invalido`,
      `convite_email_divergente`, `convite_reconciliacao_pendente`, `convite_tentativa_em_curso`.
- [x] 3.4 **Feito** (4 testes). Fechamento da saga: no `COMPLETED`, gravar `converted_at` e `assessoria_id` no convite na
      mesma transação local do `Usuario`; `origin = FOUNDING_INVITE` no rastro; compensação não
      toca o convite.
      *verify:* teste: falha no Keycloak → assessoria compensada **e** convite continua ativo;
      segunda tentativa gera chave **nova** (`"<hash>:2"`), conclui e marca `converted_at`;
      asserção negativa: a chave `"<hash>:1"` nunca é reutilizada (o `resolverReenvio` a rejeitaria).
      📌 A saga é deliberadamente sem transação (ver JavaDoc); `convertedAt` é gravado logo após o
      rastro virar `ACTIVE`, num save próprio. Se esse save falhar depois do `ACTIVE`, o convite
      fica aberto com assessoria criada — a próxima tentativa cai no rastro `ACTIVE` e devolve o
      resultado sem provisionar de novo; o `existsByWaitlistIdAndConvertedAtIsNotNull` do reenvio
      não pegaria, mas o `buscarUsuarioIdPorEmail` sim (409). Aceito para 10 registros.
- [x] 3.5 **Feito.** Auditoria de logs: nenhum log/exception/trace com token, senha ou credencial SMTP.
      *verify:* grep nos testes (`assertThat(logs).doesNotContain(token)`) como no signup.
      📌 Coberto por `tokenNaoVaza` (serviço do signup, serviço do convite e `FileEmailSender`),
      `EmailMessage`/`NovoUsuarioKeycloak`/`InviteToken` com `toString()` mascarado, e o hash do
      payload sem senha nem token.

## 4. Frontend

- [x] 4.1 **Feito.** `CoachSignupService.consultarConvite(token)` + `inviteToken` opcional no payload; tipos.
      *verify:* `npm run lint && npm run build`.
- [x] 4.2 **Feito** (8 testes de hook). `useCoachSignup`: estado do convite (`ocioso | carregando | valido | invalido`) e dados
      pré-preenchidos.
      *verify:* testes do hook (Vitest): 200 → `valido` com nome/e-mail; 404 → `invalido`.
      📌 Ganhou também o status `fechado` (404 **sem** token → tela "cadastro por convite") e
      mensagens próprias do modo convite para 404/409/422.
- [x] 4.3 **Feito** (5 testes de componente). `CadastroPage` modo convite: lê `convite` do fragmento (`/#/cadastro?convite=`), guarda
      em estado e faz `history.replaceState` removendo o parâmetro **antes** do primeiro render;
      `valido` → nome/e-mail `disabled` + copy "turma fundadora"; `invalido` → tela de convite
      inválido com CTA `/waitlist`; submit inclui `inviteToken`. Token nunca vai para storage.
      `index.html` ganha `<meta name="referrer" content="strict-origin-when-cross-origin">`.
      *verify:* testes de componente: os dois estados; campo desabilitado não editável; payload
      carrega o token; após o mount `window.location.hash` não contém `convite`.
      📌 Token lido e removido **direto do `location.hash`** (`history.replaceState`), sem
      `useSearchParams`: a navegação do data router cria um `Request` com `AbortSignal` do jsdom e
      falha nos testes, e o router não precisa saber do token. Nome/e-mail são **derivados** do
      convite (não copiados para estado) — sem segundo render, sem chance de edição. Tela de
      sucesso do convite não mostra "Enviamos para…" (não há verificação).
- [x] 4.4 **Feito** (1 teste). `CadastroPage` sem token: `404` do `POST` (flag desligada) exibe "cadastro por convite"
      com CTA `/waitlist`, em vez do erro genérico.
      *verify:* teste de componente; `npm run lint && npm run build`.
- [ ] 4.5 **ADIADA — aguardando decisão do founder** (product review sugeriu cortar; o `CLAUDE.md` do
      front exige E2E em fluxo que cruza a fronteira da API, ou o registro explícito do adiamento —
      este é o registro). Motivo: 10 usuárias, validação manual real em `develop` nas tasks 5.1–5.2
      cobre o caminho feliz de ponta a ponta com backend, Keycloak e e-mail reais, coisa que o E2E
      com backend mockado não faz. Se o founder mantiver, entra antes do PR. E2E (Playwright) do caminho feliz com backend mockado: abrir `/#/cadastro?convite=x`,
      preencher assessoria/slug/senha, ver redirecionamento ao login.
      *verify:* `npx playwright test`.

## 5. Validação em `develop` e rollout

- [ ] 5.1 **Aguarda pré-condições 0.1–0.3 (founder).** Em `develop`: convidar um inscrito de teste, receber o e-mail real (Resend), aceitar,
      logar, confirmar JWT com `tenant_id` da nova organização e `PROPRIETARIO`, `Assessoria`
      `GRATUITO 10/1 fundadora=true`, convite `converted_at`, `tb_signup_provisioning` com
      `origin = FOUNDING_INVITE`.
- [ ] 5.2 **Aguarda 5.1.** Em `develop`: reenvio invalida o anterior (link antigo → 404); link expirado (ajustar
      `expires_at` no banco) → 404; segundo `POST` com o mesmo link depois de convertido → 409/404.
- [ ] 5.3 **Operacional (founder), no deploy.** `COACH_SIGNUP_ENABLED=false` em `production` no deploy; `/cadastro` sem token mostra o
      aviso de convite.
- [x] 5.4 **Feito** (`menthoros-infra` main, commit local; backend `CLAUDE.md` na feature branch). Atualizar `keycloak/README.md` (ADMIN do founder) e o `CLAUDE.md` do backend (seção de
      e-mail: o backend agora envia e-mail transacional próprio; Keycloak segue com os dele).
- [x] 5.5 **Feito até o QA** — tasks marcadas por seção com as decisões; QA disparado em
      2026-08-28; o PR só depois das pré-condições e do E2E (4.5) decidido. Marcar as tasks, registrar decisões tomadas durante a implementação neste arquivo e no
      `design.md`, e seguir para `/qa` → `/pr`.
