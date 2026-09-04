# Tasks: add-athlete-invite-token-link

Repos: `apps/menthoros-backend` (branch `feature/add-athlete-invite-token-link`) e
`apps/menthoros-front` (mesma branch). Backend primeiro; PR do backend antes do PR do front.

## 0. Migrations

- [ ] 0.1 `Vxx__cria_tb_athlete_invite.sql` conforme design (Decisão 5); conferir o último número em
      `db/migration/` antes de nomear.

## 1. Backend — entidade e serviço de convite

- [ ] 1.1 Entidade `AthleteInvite` + `AthleteInviteRepository` (busca por `tokenHash`, por
      `atletaId` ativo).
- [ ] 1.2 Template de e-mail `athlete-invite` (`.html` + `.txt`) — link com token cru; token nunca
      logado (mesmo padrão de mascaramento do `FoundingInvite`).
- [ ] 1.3 `AtletaServiceImpl.gerarConvite`: gerar `InviteToken`, expirar convite ativo anterior,
      persistir hash, enviar e-mail via `EmailSender` **fora** de transação; remover a chamada a
      `enviarConviteAtleta` do gateway Keycloak.
- [ ] 1.4 Testes: reemissão invalida anterior; atleta sem e-mail → 422; falha de envio →
      `EmailDeliveryException` sem persistir `sent`; token ausente dos logs.
- [ ] 1.5 Validação: `./mvnw clean test`.

## 2. Backend — lookup público e aceite

- [ ] 2.1 `GET /api/public/athlete-invites/{token}` (espelho do `FoundingInviteController`):
      DTOs de output, 404/410, coberto pelo `PublicEndpointRateLimitFilter`; isenção já coberta
      pelo prefixo `/api/public/` no `JwtTenantFilter.shouldNotFilter`.
- [ ] 2.2 `POST /api/v1/athlete-invites/aceitar`: validar token → Keycloak Organization add (fora
      de TX, timeouts padrão) → TX curta (vínculo + `accepted_at`), conforme Decisão 3. 409 quando
      atleta já vinculado a outra conta.
- [ ] 2.3 Divergência e-mail do convite × e-mail da conta: vincular + WARN (Decisão 4).
- [ ] 2.4 Testes de unidade (cenários: feliz, expirado, consumido, 409, falha Keycloak → retry
      idempotente) + `*IT` de contrato com JWT real (post-processor `jwt()`, subject UUID).
- [ ] 2.5 Validação: `./mvnw clean verify`.

## 3. Frontend — página de cadastro e efetivação

- [ ] 3.1 `/#/cadastro?convite=`: detectar convite de atleta via lookup; pré-preencher e-mail;
      guardar token em `sessionStorage` antes de iniciar o fluxo Keycloak.
- [ ] 3.2 Pós-login: chamar `aceitar` com o token; sucesso → redirecionar para o onboarding do
      atleta; 409/410 → mensagem clara com ação (contatar o coach).
- [ ] 3.3 Cliente curado: portar os dois endpoints novos (não regenerar por cima).
- [ ] 3.4 Testes de componente + **E2E Playwright do fluxo completo** (auth/onboarding é fluxo
      crítico — E2E obrigatório): convite → cadastro com e-mail diferente → vínculo → painel 200.
- [ ] 3.5 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 4. Entrega

- [ ] 4.1 `/qa` nos dois repos; PR backend → develop, depois PR front → develop.
- [ ] 4.2 Smoke em develop: convite real, aceite com e-mail divergente, painel do atleta carrega,
      onboarding oferecido.
- [ ] 4.3 Pós-deploy em produção: auditoria de atletas órfãos —
      `SELECT id, nome, email FROM tb_atleta WHERE usuario_id IS NULL` por tenant; para cada órfão
      com usuário ativo correspondente, reenviar convite pelo canal novo (o incidente de 2026-09-04
      pode não ter sido o único caso). Registrar o resultado aqui.
