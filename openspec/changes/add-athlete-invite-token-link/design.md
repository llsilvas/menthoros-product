# Design: add-athlete-invite-token-link

## Decisão 1 — Reusar o padrão do convite das fundadoras, não o Keycloak Organizations

O canal do convite muda de `POST .../organizations/{orgId}/members/invite-user` (Keycloak) para o
padrão já provado em `convite-assessorias-fundadoras`: `InviteToken` opaco gerado no backend, hash
persistido, e-mail via `EmailSender` (Resend, porta 2587), link `/#/cadastro?convite=<token>`.

Motivo: o convite do Keycloak carrega só o e-mail — o `atletaId` não viaja, e o vínculo fica refém
do match de e-mail. O token do backend carrega a intenção completa (este convite é PARA este
atleta) e o aceite fica determinístico.

Consequência: a entrada do usuário na Organization (claim `organization` → tenant no JWT) passa a
ser feita **no aceite**, pelo backend, via `KeycloakOrganizationGateway` (admin API), depois de
resolver o token. Sem isso o primeiro login do convidado viria sem `tenant_id` e o `JwtTenantFilter`
rejeitaria com 403.

## Decisão 2 — Efetivação do vínculo em endpoint autenticado pós-login

O token identifica o convite; o JWT identifica a conta. O vínculo exige os dois ao mesmo tempo:

```
POST /api/v1/athlete-invites/aceitar  { token }   (autenticado, qualquer role)
```

Fluxo: front guarda o token em `sessionStorage` ao abrir `/cadastro?convite=` → usuário cria conta /
loga no Keycloak → front chama o aceite com o token → backend valida (hash, TTL, não consumido),
adiciona o usuário à Organization do tenant do convite, grava `atleta.usuario = usuario`, marca
`accepted_at`.

Por que não vincular no `JwtTenantFilter`: o filtro roda por requisição e não tem o token; e o
aceite precisa poder responder erro de negócio (410) para o front tratar — filtro não é lugar de
contrato de negócio.

Atenção (herdada de `radar_browser_router`): o token vive no **fragmento** da URL e não sobrevive
aos redirects do Keycloak — por isso `sessionStorage` antes de iniciar o login é obrigatório, igual
ao `code_verifier` do PKCE.

## Decisão 3 — Ordem das escritas no aceite

1. Validar token (leitura).
2. Chamada externa Keycloak (adicionar à Organization) — **fora** de transação de banco (regra do
   repo: chamada externa não segura conexão; timeouts do `KeycloakAdminRestClientConfig`).
3. Transação curta: vincular `atleta.usuario` + marcar `accepted_at`.

Se (2) falhar → 502, nada persistido, aceite pode ser repetido (token ainda válido).
Se (3) falhar após (2) → usuário ficou na Organization sem vínculo; o retry do aceite é idempotente
(token ainda não consumido; adicionar membro já existente na Organization é no-op).

## Decisão 4 — Fallback por e-mail permanece, token vence

`vincularAtletaSeNecessario` continua no sync de login para: convites antigos (janela de
transição), atletas criados antes desta change, e o caso feliz em que o e-mail bate. Quando um
aceite por token encontrar o atleta **já vinculado a outra conta** → 409 com mensagem clara
(suporte manual decide). Divergência de e-mail (conta ≠ e-mail do convite) → vincula e loga WARN.

## Decisão 5 — Modelo de dados

`tb_athlete_invite`: `id` UUID PK, `atleta_id` UUID NOT NULL FK CASCADE, `tenant_id` UUID NOT NULL,
`token_hash` VARCHAR UNIQUE NOT NULL, `email_enviado` VARCHAR NOT NULL, `expires_at` TIMESTAMPTZ
NOT NULL, `accepted_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
Índice composto `(tenant_id, atleta_id)`. Reemitir convite = marcar/expirar o anterior e inserir
novo (não editar o antigo — trilha de auditoria).

## Decisão 6 — Janela de transição: convites Keycloak pendentes continuam válidos

Convites enviados pelo canal antigo (Keycloak Organizations) antes do deploy **não são revogados
nem reenviados**. Quem aceitar um convite antigo entra pelo fluxo antigo: cria conta, o Keycloak já
o coloca na Organization, e o `vincularAtletaSeNecessario` (fallback por e-mail, Decisão 4) faz o
vínculo. O risco residual — e-mail divergente num convite antigo — é o comportamento de hoje, não
uma regressão; o coach pode simplesmente reenviar o convite pelo botão existente, que a partir do
deploy já sai pelo canal novo. Fechado no product review de 2026-09-04 para não deixar decisão de
produto para depois do deploy.

## Contrato de API

| Endpoint | Auth | Respostas |
|---|---|---|
| `GET /api/public/athlete-invites/{token}` | pública + rate limit | 200 (nome atleta, assessoria, email sugerido) · 404 inválido · 410 expirado/consumido |
| `POST /api/v1/athlete-invites/aceitar` | JWT | 204 · 404 · 409 já vinculado a outra conta · 410 expirado/consumido · 502 Keycloak |
| `POST /api/v1/atletas/{id}/convite` | TECNICO/ADMIN (existente) | passa a gerar token + e-mail próprio; contrato HTTP inalterado (202) |
