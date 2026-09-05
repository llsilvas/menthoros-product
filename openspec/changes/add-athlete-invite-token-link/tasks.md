# Tasks: add-athlete-invite-token-link

Repos: `apps/menthoros-backend` (branch `feature/add-athlete-invite-token-link`) e
`apps/menthoros-front` (mesma branch). Backend primeiro; PR do backend antes do PR do front.

## 0. Migrations

- [x] 0.1 `Vxx__cria_tb_athlete_invite.sql` conforme design (Decisão 5); conferir o último número em
      `db/migration/` antes de nomear.

## 1. Backend — entidade e serviço de convite

- [x] 1.1 Entidade `AthleteInvite` + `AthleteInviteRepository` (busca por `tokenHash`, por
      `atletaId` ativo).
- [x] 1.2 Template de e-mail `athlete-invite` (`.html` + `.txt`) — link com token cru; token nunca
      logado (mesmo padrão de mascaramento do `FoundingInvite`).
- [x] 1.3 `AtletaServiceImpl.gerarConvite`: gerar `InviteToken`, expirar convite ativo anterior,
      persistir hash, enviar e-mail via `EmailSender` **fora** de transação; remover a chamada a
      `enviarConviteAtleta` do gateway Keycloak.
- [x] 1.4 Testes: reemissão invalida anterior; atleta sem e-mail → 422; falha de envio →
      `EmailDeliveryException` sem persistir `sent`; token ausente dos logs.
- [x] 1.5 Validação: `./mvnw clean test`.

## 2. Backend — lookup público e aceite provisionador

- [x] 2.1 `GET /api/public/athlete-invites/{token}` (espelho do `FoundingInviteController`):
      DTOs de output, 404/410. Adicionar `/api/public/athlete-invites/**` explicitamente ao
      `PublicEndpointRateLimitFilter` (achado do DoR: a cobertura não é automática); a isenção de
      tenant já vem do prefixo `/api/public/` no `JwtTenantFilter.shouldNotFilter`.
- [x] 2.2 `POST /api/public/athlete-invites/aceitar` (Decisão 2, molde do `CoachSignupServiceImpl`
      com pilha de compensação): validar token → `criarUsuario` (senha do form; e-mail do convite →
      `emailVerificado=true`, e-mail trocado → verificação pendente) → `atribuirRoleDeRealm(ATLETA)`
      → `adicionarMembroNaOrganization` → TX local curta (Usuario local + `atleta.usuario` +
      `accepted_at`). Tenant SEMPRE do `AthleteInvite`, nunca do `TenantContext`. 409 para e-mail
      já existente no realm ou atleta já vinculado.
- [x] 2.3 Testes de unidade (feliz com e-mail igual e divergente; expirado; consumido; 409 nos dois
      sabores; falha de Keycloak em cada passo → compensação desfaz, zera `claimed_at` e o token
      continua válido; **duplo POST concorrente → só um provisiona, o outro recebe 410**) +
      `*IT` de contrato dos dois endpoints públicos (sem JWT — são rotas públicas; incluir o
      cenário rate limit).
- [x] 2.4 `*IT` do fluxo completo pós-aceite: com o usuário provisionado, um JWT simulando o
      primeiro login (subject = keycloakId, claim organization do tenant, ROLE_ATLETA) acessa
      `/api/v1/atletas/me/home` → 200 (o caminho que o incidente quebrou).
- [x] 2.5 Validação: `./mvnw clean verify`.

## 3. Frontend — página de cadastro do atleta

- [x] 3.1 `/#/cadastro?convite=`: detectar tipo do convite via lookup (atleta × coach) e renderizar
      o formulário de atleta: nome pré-preenchido, e-mail **editável** (diferença deliberada do
      fluxo de coach, que trava o campo), senha. Token permanece só em memória — o `useInviteToken`
      atual serve como está (sem storage).
- [x] 3.2 Submissão → `POST /api/public/athlete-invites/aceitar`; 201 → tela de sucesso com botão
      de login (e aviso de verificação de e-mail quando trocado); 409/410 → mensagem clara com
      ação (contatar o coach). Após login, o atleta cai no onboarding existente.
- [x] 3.3 Cliente curado: portar os dois endpoints novos (não regenerar por cima).
- [x] 3.4 Testes de componente (lookup de atleta, e-mail editável, erros 409/410) + **E2E
      Playwright do fluxo completo** (auth/onboarding é fluxo crítico — E2E obrigatório): convite →
      aceite com e-mail diferente → login → painel carrega.
- [x] 3.5 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 4. Entrega

- [ ] 4.1 `/qa` nos dois repos; PR backend → develop, depois PR front → develop.
- [ ] 4.2 Smoke em develop: convite real, aceite com e-mail divergente, painel do atleta carrega,
      onboarding oferecido.
- [ ] 4.3 Pós-deploy em produção: auditoria de atletas órfãos —
      `SELECT id, nome, email FROM tb_atleta WHERE usuario_id IS NULL` por tenant; para cada órfão
      com usuário ativo correspondente, reenviar convite pelo canal novo (o incidente de 2026-09-04
      pode não ter sido o único caso). Registrar o resultado aqui.
