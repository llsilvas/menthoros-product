# Design: add-athlete-invite-token-link

> **Redesenho pós-DoR (2026-09-04).** A 1ª versão deste design propunha aceite em endpoint
> **autenticado** pós-login. O DoR (spec-reviewer + Codex, convergentes) reprovou com 4 críticos:
> (1) o `JwtTenantFilter` responderia 403 ao próprio aceite — o primeiro JWT do convidado não tem
> `tenant_id`, que só existiria **depois** do aceite; (2) com signup livre desligado (decisão das
> fundadoras), o convidado não tinha caminho concreto para criar conta; (3) mesmo após
> `adicionarMembroNaOrganization`, o access token já emitido não ganha o claim — exigiria
> relogin forçado; (4) ninguém atribuía a role `ATLETA` (membership em Organization não é role de
> realm; o realm não tem default role). A versão atual resolve os quatro com um único movimento:
> **o aceite é público e provisiona a conta server-side, no molde exato do coach signup.**

## Decisão 1 — Convite por token do backend, e-mail próprio

Canal do convite: `InviteToken` opaco gerado no backend, hash persistido, e-mail via `EmailSender`
(Resend, porta 2587), link `/#/cadastro?convite=<token>` — substituindo o
`invite-user` do Keycloak Organizations, que só carrega o e-mail (o `atletaId` não viaja e o
vínculo fica refém do match de e-mail). Mesmo padrão de `convite-assessorias-fundadoras`.

## Decisão 2 — Aceite público que provisiona a conta (molde do coach signup)

```
POST /api/public/athlete-invites/aceitar   { token, nome, senha, email? }   (público + rate limit)
```

O aceite NÃO exige login — ele **cria** a conta, como `CoachSignupServiceImpl` já faz para o coach
(precedente verificado: `criarUsuario` + `atribuirRoleDeRealm` + `adicionarMembroNaOrganization`
com pilha de compensação `desfazer`). Sequência:

1. Validar token (hash, TTL, não consumido) → resolve `AthleteInvite` → `atletaId` + `tenantId`.
   O tenant vem **do convite**, nunca de `TenantContext` (rota pública, filtro isento por prefixo
   `/api/public/` — isenção que já existe em `JwtTenantFilter.shouldNotFilter`).
2. `keycloak.criarUsuario(...)` com a senha do formulário. E-mail: o do convite por padrão;
   o formulário permite trocar (critério central — foi a divergência de e-mail que causou o
   incidente). E-mail igual ao do convite → `emailVerificado=true` (o token provou a posse);
   e-mail trocado → `emailVerificado=false` + `enviarVerificacaoDeEmail`.
3. `keycloak.atribuirRoleDeRealm(usuarioId, "ATLETA")` — resolve o crítico 4.
4. `keycloak.adicionarMembroNaOrganization(orgId, usuarioId)` — org da assessoria do convite.
5. Transação local curta: criar `Usuario` (role ATLETA, id = keycloakId), gravar
   `atleta.usuario`, marcar `accepted_at`.
6. Compensação em pilha (padrão do coach signup): falha em qualquer passo desfaz os anteriores e o
   token continua válido para retry.

Consequência que elimina os críticos 1–3: quando o atleta faz o **primeiro login**, a conta já é
membro da Organization e já tem `ROLE_ATLETA` — o primeiro JWT nasce com `tenant_id` e role
corretos, o `JwtTenantFilter` passa, e nenhum refresh forçado é necessário.

Convidado que já tem conta no realm (e-mail existente no Keycloak) → 409 com orientação; o
re-aproveitamento de conta existente fica fora do escopo do pilot (non-goal, suporte manual).

## Decisão 3 — Front sem token em storage

A página `/#/cadastro?convite=` já existe (fundadoras) e o `useInviteToken` atual mantém o token
**apenas em memória** (contrato explícito do hook: nunca vai para storage, e some da URL). Com o
aceite público não há redirect do Keycloak no meio do fluxo — o formulário posta direto no
backend, igual ao cadastro de coach — então **não há necessidade de `sessionStorage`** (a versão
anterior deste design dependia disso; o DoR apontou que não havia implementação de referência).
Após o 2xx do aceite, o front direciona para o login normal; logado, o atleta cai no onboarding.
Diferença a implementar vs. o fluxo de coach: o formulário de atleta permite **editar o e-mail**
(no de coach o campo é travado no e-mail convidado).

## Decisão 4 — Fallback por e-mail permanece, token vence

`vincularAtletaSeNecessario` continua no sync de login para convites antigos e atletas criados
antes desta change. Aceite por token que encontrar o atleta já vinculado a outra conta → 409.

## Decisão 5 — Modelo de dados

`tb_athlete_invite`: `id` UUID PK, `atleta_id` UUID NOT NULL FK CASCADE, `tenant_id` UUID NOT NULL,
`token_hash` VARCHAR UNIQUE NOT NULL, `email_enviado` VARCHAR NOT NULL, `sent_at` TIMESTAMPTZ
(preenchido só após envio bem-sucedido — falha de SMTP não persiste `sent_at`, semântica idêntica
ao `FoundingInvite`), `expires_at` TIMESTAMPTZ NOT NULL, `accepted_at` TIMESTAMPTZ, `created_at`
TIMESTAMPTZ NOT NULL DEFAULT NOW(). Índice composto `(tenant_id, atleta_id)`. Reemitir convite =
expirar o anterior e inserir novo (trilha de auditoria).

## Decisão 6 — Janela de transição: convites Keycloak pendentes continuam válidos

Convites enviados pelo canal antigo antes do deploy não são revogados nem reenviados; aceite deles
segue o caminho antigo (login → fallback por e-mail). Reenviar pelo botão existente já sai pelo
canal novo. Fechado no product review de 2026-09-04.

## Decisão 7 — Rate limit

`PublicEndpointRateLimitFilter` cobre hoje só o founding invite — adicionar explicitamente os
paths `/api/public/athlete-invites/**` (lookup e aceite). Achado do DoR: a cobertura não é
automática por prefixo.

## Contrato de API

| Endpoint | Auth | Respostas |
|---|---|---|
| `GET /api/public/athlete-invites/{token}` | pública + rate limit | 200 (nome atleta, assessoria, email sugerido) · 404 inválido · 410 expirado/consumido |
| `POST /api/public/athlete-invites/aceitar` | pública + rate limit | 201 conta criada e vinculada · 404/410 token · 409 e-mail já existe no realm OU atleta já vinculado · 422 payload inválido · 502 Keycloak/SMTP |
| `POST /api/v1/atletas/{id}/convite` | TECNICO/ADMIN (existente) | passa a gerar token + e-mail próprio; contrato HTTP inalterado (202) |
