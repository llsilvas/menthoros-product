# Design — convite-assessorias-fundadoras

## Visão

```
founder (ADMIN, curl)                       fundadora (browser)
  │ POST /api/admin/waitlist/{id}/convite     │
  ▼                                            │
backend: valida inscrito ──► gera token ──► grava hash ──► envia e-mail (Resend SMTP)
                                                           │  link: /#/cadastro?convite=<token>
                                                           ▼
                                             front: GET /api/public/founding-invites/{token}
                                                    → pré-preenche nome/e-mail, bloqueia
                                                    → fundadora informa assessoria/slug/senha
                                                    → POST /api/public/coach-signups {..., inviteToken}
                                                           │
                                                           ▼
                                             saga existente (CoachSignupServiceImpl) em modo fundadora
                                             → Assessoria GRATUITO 10/1 fundadora=true
                                             → Keycloak org + usuário emailVerified=true (sem VERIFY_EMAIL)
                                             → PROPRIETARIO + membro da org + Usuario local
                                             → convite.converted_at = now()  (só no sucesso)
```

Nada de tela nova, nada de fluxo de autenticação novo. A change acrescenta **um comando admin**,
**um leitor público de token**, **um modo** na página e na saga que já existem, e **um carteiro**.

## Token

- 32 bytes de `SecureRandom`, codificado em base64url sem padding (43 chars). Vai **em claro só na
  URL do e-mail**; no banco fica `SHA-256(token)` em hex. Comparação por lookup do hash — não há
  segredo a comparar em tempo constante porque o hash já é a chave de busca.
- **Estados** derivados de colunas, sem enum de status:
  - ativo: `invalidated_at IS NULL AND converted_at IS NULL AND expires_at > now()`
  - expirado: `expires_at <= now()` e os outros nulos
  - invalidado: `invalidated_at IS NOT NULL` (reenvio gerou outro)
  - convertido: `converted_at IS NOT NULL` (terminal; nunca reaberto)
- **Reenvio** = novo registro; o serviço marca `invalidated_at` em **qualquer** registro anterior do
  inscrito que não esteja convertido nem invalidado — **inclusive expirado e inclusive sem
  `sent_at`** (SMTP falhou). O índice parcial `WHERE converted_at IS NULL AND invalidated_at IS
  NULL` não olha `expires_at` de propósito (índice parcial não pode usar `now()`), então quem
  garante que o insert não viola a UNIQUE é essa invalidação prévia, não o índice. O repositório
  expõe `findOpenByWaitlistId` (não "ativo"), justamente para enxergar o expirado.
- **Consumo só no sucesso.** O `converted_at` é gravado na mesma transação local que fecha a saga
  como `COMPLETED`. Se a saga compensar, o token segue ativo e a fundadora tenta de novo com o mesmo
  link.
- **Retentativa — semântica explícita (achado do pré-mortem).** O `resolverReenvio` existente
  **rejeita** qualquer rastro que não esteja `ACTIVE` — inclusive `FAILED` já compensado. Se a
  chave fosse simplesmente o hash do token, a segunda tentativa bateria no rastro `FAILED` e
  falharia para sempre. Por isso a chave de idempotência no modo convite é **por tentativa**:
  `"<token_hash>:<n>"`, onde `n` = número de rastros já existentes para esse `token_hash`
  (coluna `invite_id` em `tb_signup_provisioning` faz a contagem). Regras:
  - existe rastro `ACTIVE` para o convite → atende como reenvio (a saga já concluiu; o convite já
    está `converted_at`, então na prática o `GET` já devolve 404 antes disso);
  - só rastros `FAILED` (compensação completa) → nova tentativa, chave `n+1`, `correlation_id`
    novo, `invite_id` igual;
  - qualquer rastro `RECONCILIATION_REQUIRED` → **bloqueia** com `409` e mensagem "fale com o
    suporte" — não retentar por cima de resíduo que exige mão humana;
  - rastro em estado intermediário (`STARTED` … `VERIFICATION_EMAIL_SENT` — nem `ACTIVE`, `FAILED` nem `RECONCILIATION_REQUIRED`) → `409` (duplo clique enquanto a primeira corre).
  O `Idempotency-Key` do header é ignorado no modo convite.

## Onde o token trafega (achado do pré-mortem)

O link é `<FRONTEND_URL>/#/cadastro?convite=<token>` — o app usa `createHashRouter`, então o
token vive no **fragmento**, que o browser **não envia** ao servidor, ao CDN nem no `Referer`
(inclusive para o Google Fonts carregado no `index.html`). Ainda assim ele fica no histórico do
browser e em qualquer captura de URL, então a página:

1. lê `convite` do fragmento no mount, guarda em estado React;
2. imediatamente faz `history.replaceState` removendo o parâmetro (a URL vira `/#/cadastro`);
3. o `index.html` ganha `<meta name="referrer" content="strict-origin-when-cross-origin">`.

O invariante de sigilo passa a ser: **o token em claro existe no e-mail, no fragmento até o
primeiro render, e na memória da página** — nunca em logs de servidor/CDN/proxy, `Referer`,
storage ou logs da aplicação.

## Migration (V84)

```sql
CREATE TABLE tb_founding_invite (
    id              UUID PRIMARY KEY,
    waitlist_id     UUID NOT NULL REFERENCES tb_waitlist(id),
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    email           VARCHAR(180) NOT NULL,           -- snapshot; a waitlist pode ser editada depois
    expires_at       TIMESTAMPTZ NOT NULL,
    sent_at      TIMESTAMPTZ,                     -- NULL se o SMTP falhou (registro fica para reenvio)
    invalidated_at   TIMESTAMPTZ,
    converted_at   TIMESTAMPTZ,
    assessoria_id   UUID REFERENCES tb_assessoria(id),
    invited_by   VARCHAR(100) NOT NULL,           -- subject do ADMIN
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_founding_invite_open
    ON tb_founding_invite (waitlist_id)
    WHERE converted_at IS NULL AND invalidated_at IS NULL;

ALTER TABLE tb_assessoria
    ADD COLUMN fundadora BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN founding_converted_at TIMESTAMPTZ;

ALTER TABLE tb_signup_provisioning
    ADD COLUMN origem VARCHAR(30) NOT NULL DEFAULT 'PUBLIC_SIGNUP',
    ADD COLUMN invite_id UUID REFERENCES tb_founding_invite(id);  -- conta tentativas por convite
CREATE INDEX idx_signup_provisioning_invite_id ON tb_signup_provisioning (invite_id)
    WHERE invite_id IS NOT NULL;
```

`email` do convite é `VARCHAR(180)` como a waitlist, mas o signup (`CoachSignupInputDto`) e
`tb_usuario.email` aceitam **100**. Um inscrito com e-mail de 101–180 chars receberia um convite
impossível de aceitar. O endpoint admin **recusa com `422`** e-mails acima de 100 chars — falha na
mão do founder, não na tela da fundadora.

Convenções do ADR-0007 (nomes em inglês para tabela nova? — **não**: a tabela segue o vocabulário
das vizinhas `tb_waitlist`/`tb_assessoria`, em PT-BR; só `created_at` segue o padrão de auditoria já
usado). Confirmar no `/implement init` contra o ADR antes de escrever a migration.

## Backend

### `POST /api/admin/waitlist/{id}/convite` — `FoundingInviteAdminController`

- `@PreAuthorize("hasRole('ADMIN')")`; `/api/admin/**` já é isento do `JwtTenantFilter`.
- Fluxo em `FoundingInviteServiceImpl.convidar(waitlistId, adminSubject)`:
  1. carrega a `Waitlist`; `perfil != TREINADOR` → `422`.
  2. `keycloak.buscarUsuarioIdPorEmail(email)` presente → `409 EMAIL_JA_POSSUI_CONTA`.
  3. convite ativo com `converted_at` → `409 CONVITE_JA_CONVERTIDO` (na prática o passo 2 já pega,
     mas o estado local é a verdade quando o Keycloak estiver fora).
  4. `@Transactional` local: invalida ativo anterior, insere novo com `token_hash`, `expires_at =
     now() + 7d`, `sent_at = NULL`.
  5. **Fora da transação:** envia o e-mail. Sucesso → `sent_at = now()`. Falha → registro fica
     sem `sent_at`, resposta `502 EMAIL_NAO_ENVIADO` com o `id` do convite; o founder reenvia
     (que gera outro token). Não retentar automaticamente: o recurso escasso é a cota de e-mail.
  6. Resposta `202 { id, waitlistId, expiraEm }` — **nunca o token**. O único lugar onde o token
     existe em claro é o corpo do e-mail.
- Log estruturado com `invite_id` e `waitlist_id`; nunca token, nunca e-mail em claro (padrão do
  `NovoUsuarioKeycloak.toString()`).

### `GET /api/public/founding-invites/{token}` — `FoundingInviteController`

- Público (`/api/public/**` já está em `publicPaths` e isento de tenant).
- Rate limit pelo `PublicEndpointRateLimitFilter` — **atenção (achado do pré-mortem):** o filtro
  hoje devolve `null` para qualquer método que não seja `POST`, então "adicionar o path" não
  limitaria nada. O filtro precisa ficar **method-aware**, com política `GET` para
  `/api/public/founding-invites/*` (~10/min/IP), e o teste deve provar `429` em GETs repetidos.
- Lookup por `SHA-256(token)`; só responde `200 { nome, email }` para convite **ativo**. Qualquer
  outro estado → `404` com corpo vazio, sem distinguir. Não expõe `expiraEm`.

### Modo fundadora em `POST /api/public/coach-signups`

- `CoachSignupInputDto` ganha `String inviteToken` opcional (`@Size(max = 64)`).
- Gate no controller: `properties.isEnabled() || inviteToken != null`. Com token e flag desligada,
  o serviço valida o token; token inválido com flag desligada → `404` (mesma resposta de "cadastro
  não existe" — não vaza que existe modo convite).
- `CoachSignupServiceImpl.cadastrar` recebe um `ProvisioningMode` resolvido antes da saga:
  - `PUBLIC_SIGNUP` (hoje): BASIC 20/1, `VERIFY_EMAIL`, `send-verify-email`.
  - `FOUNDING_INVITE`: GRATUITO 10/1, `founding = true`, `founding_converted_at`,
    `NovoUsuarioKeycloak` com `emailVerified = true` e `acoesObrigatorias = []`, **sem**
    `send-verify-email`; e-mail do DTO **deve** igualar o do convite (`422` se não).
- `Idempotency-Key` do header é ignorado no modo convite; a chave é derivada por tentativa
  (`"<token_hash>:<n>"`, ver "Token → Retentativa"). Duplo clique converge para `409` enquanto a
  primeira tentativa corre; falha compensada abre tentativa nova.
- Passo final da saga (`COMPLETED`): grava `converted_at` e `assessoria_id` no convite, na mesma
  transação local que persiste o `Usuario`. Compensação **não toca** o convite.
- `SignupProvisioning.origem` recebe `FOUNDING_INVITE`.

### `NovoUsuarioKeycloak`

Ganha `boolean emailVerificado`. O gateway envia `"emailVerified": true` na representação. Hoje o
record não tem o campo e o Keycloak assume `false`.

### Carteiro — `EmailSender`

- Interface `EmailSender { void enviar(EmailMessage m); }` com implementação Spring Mail
  (`JavaMailSenderImpl`) em `services/impl/SmtpEmailSender`. Interface existe para o teste da saga
  não subir SMTP e para trocar por API HTTP do Resend depois sem tocar o serviço.
- Configuração `spring.mail.*` lida de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_STARTTLS`, `SMTP_FROM`, `SMTP_FROM_NAME` — mesmos valores das `KC_SMTP_*` (Resend: host
  `smtp.resend.com`, porta **2587**, STARTTLS; Railway bloqueia 465/587).
- Template `resources/templates/email/founding-invite.html` renderizado com substituição simples
  de placeholders (`{{nome}}`, `{{link}}`, `{{validade}}`) — **sem** Thymeleaf/Freemarker: uma
  dependência nova já é o teto desta change. Versão texto-puro como alternativa multipart.
- Perfil `local`/`test`: `FileEmailSender`, que grava cada mensagem como `.eml` em
  `app.email.outbox-dir` (default `target/outbox/`) — o link fica num arquivo local, **nunca em
  log** (achado do pré-mortem: um `LoggingEmailSender` contradizia o invariante "token nunca em
  log" e viraria vazamento em massa se `app.email.enabled=false` escapasse para a nuvem). O bean
  é `@Profile({"local","test"})`; no profile `cloud` só existe o `SmtpEmailSender`, e a ausência
  de `SMTP_*` **falha o startup** em vez de degradar para arquivo/log.

## Frontend

### `CadastroPage` em modo convite

- Lê `?convite=` da URL. Com token: chama `GET /api/public/founding-invites/{token}` no mount.
  - `200`: renderiza o formulário com `nome` e `email` preenchidos e `disabled`; título e copy
    mudam para "Bem-vinda à turma fundadora"; campos de assessoria/slug/senha como hoje; o submit
    inclui `inviteToken`.
  - `404`: tela "Convite inválido ou expirado — peça um novo convite" com link para a waitlist.
    Nunca mostra o formulário.
- Sem token: comportamento atual, **exceto** que `404` do `POST` (flag desligada) passa a exibir
  "O cadastro é por convite. Entre na lista de espera" com CTA para `/waitlist`. Hoje esse caso
  cai num erro genérico.
- `CoachSignupService.ts` ganha `consultarConvite(token)` e o campo opcional `inviteToken` no
  payload; `useCoachSignup` expõe o estado do convite (`carregando | valido | invalido`).
- O token **não** vai para `localStorage`/`sessionStorage`; vive só na URL e no estado da página.

## Infra (fora do código, mas dentro da change)

- Railway `menthoros-backend` (`production` e `develop`): `SMTP_HOST/PORT/USER/PASSWORD/STARTTLS/
  FROM/FROM_NAME` por **referência** às vars do serviço Keycloak; `FRONTEND_URL` conferido.
- `COACH_SIGNUP_ENABLED=false` em `production` ao entrar em produção; `develop` pode ficar ligado.
- Usuário `ADMIN` do founder: role `ADMIN` de realm atribuída via `menthoros-infra` (procedimento
  documentado no `keycloak/README.md`; **console proibido**).

## Segurança

- Token com 256 bits de entropia, uso único, 7 dias, armazenado como hash: vazamento do banco não
  entrega links válidos.
- O `GET` público responde igual para todos os estados inválidos e passa pelo rate limit.
- O modo convite **não** substitui o e-mail do formulário pelo do convite silenciosamente: exige
  igualdade e falha com `422` — evita que um token vazado crie conta para outro e-mail.
- `409` do endpoint admin revela que um e-mail tem conta — aceitável: é rota `ADMIN`, chamada pelo
  founder.
- Credenciais SMTP só por env; `spring.mail.password` mascarado no actuator (`/env` já não é
  exposto).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Resend recusa o remetente do backend (domínio, DKIM) | Validar na pré-condição, em `develop`, antes do PR; a implementação de log permite testar o resto sem SMTP |
| E-mail cai em spam | Sem imagens, link também em texto, remetente já usado pelo Keycloak; o founder avisa a fundadora por WhatsApp que o e-mail foi enviado |
| Fundadora usa link expirado | `404` com instrução clara; reenvio gera token novo em um comando |
| Saga falha depois de criar Assessoria | Compensação existente; token segue válido; tentativa nova com chave `"<hash>:<n+1>"` (o `resolverReenvio` **rejeitaria** a mesma chave num rastro `FAILED`) |
| Resíduo `RECONCILIATION_REQUIRED` | Bloqueia novas tentativas com `409`; reparo manual antes de reenviar |
| Dois cliques no submit | `409` enquanto a primeira tentativa está em estado intermediário |
| Token em URL vaza em log/CDN/Referer | Fragmento (`#/cadastro?convite=`) nunca sai do browser; `replaceState` no mount; `meta referrer` |
| `GET` público sem limite (filtro só trata POST) | Filtro method-aware com política GET; teste de `429` em GET |
| Sender de dev loga o link em produção | `FileEmailSender` só em `@Profile({"local","test"})`; `cloud` sem SMTP falha o startup |
| E-mail da waitlist > 100 chars não cabe no signup | `422` no convite |
| Fundadora já tem conta (foi atleta) | Detectado no convite (`409`); o founder resolve à mão |
| Flag desligada quebra `develop`/testes que dependem do signup aberto | `develop` continua ligado; só `production` desliga |

### Rollback

Desligar é reverter o deploy: a tabela nova e as colunas com `DEFAULT` não quebram a versão
anterior. Convites já enviados ficam órfãos até o redeploy — aceitável para 10 pessoas.
