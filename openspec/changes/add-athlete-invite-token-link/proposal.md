# Proposal: add-athlete-invite-token-link

**Tamanho:** M · **Trilha:** Full (toca dois repos — backend e front; cria contrato de API público
novo (aceite de convite por token); mexe em superfície de autenticação/vínculo de identidade, que é
risco de segurança/multi-tenancy pelos critérios do `config.yaml`)

## Status

- Proposta inicial (2026-09-04) — derivada de incidente real de produção do mesmo dia.
- **Product review (2026-09-04): GO.** Correção de confiabilidade que protege a adoção no pilot
  (atleta 404 no próprio painel mina a confiança da assessoria); não altera o circuito de decisão
  do coach; escopo contido reusando padrão provado. Três pontos incorporados: a janela de
  transição virou decisão fechada no `design.md` (Decisão 6), a auditoria de atletas órfãos em
  produção entrou nas tasks (4.2), e as perguntas em aberto para o founder estão abaixo.
- Pre-mortem cross-model (Codex): pendente — rodar antes do `/implement init`.

## Why

O vínculo `Usuario ↔ Atleta` hoje é feito por **igualdade de e-mail no primeiro login**
(`UsuarioSyncServiceImpl.vincularAtletaSeNecessario`): o coach cadastra o atleta com um e-mail,
o convite vai via Keycloak Organizations (`invite-user`), e quando o usuário loga, o sistema
procura um `Atleta` do tenant com o mesmo e-mail e sem usuário.

**Incidente de 2026-09-04 em produção:** o atleta foi cadastrado com `lsilva.info@gmail.com`, mas a
conta usada no login era `carmaniacs1@hotmail.com`. O match nunca aconteceu, o `Atleta` ficou órfão
(`usuario_id` nulo) e **todo o painel do atleta respondeu 404** ("Atleta vinculado ao usuário não
encontrado") — inclusive o onboarding, que resolve o atleta pelo token. Consequência em cascata: o
atleta não conseguiu calibrar, o batch gerou plano sem baseline (tier C) e a geração falhou.
O conserto foi um `UPDATE` manual no banco.

O e-mail é um identificador que o usuário controla e pode divergir; o vínculo precisa de um
identificador que **o sistema** controla. A infraestrutura já existe: o convite das assessorias
fundadoras (`convite-assessorias-fundadoras`) usa token opaco do backend (`InviteToken`, hash
persistido), e-mail próprio via `EmailSender`/Resend e aceite em `/#/cadastro?convite=<token>`.

## What Changes

### Backend

- **Entidade `AthleteInvite`** (nova tabela `tb_athlete_invite`): `atleta_id` FK, `tenant_id`,
  `token_hash` (nunca o token cru), `email_enviado`, `expires_at` (default 7 dias), `accepted_at`,
  `created_at`. Reemissão de convite invalida o anterior (um convite ativo por atleta).
- **`AtletaService.gerarConvite`** passa a: gerar `InviteToken`, persistir o hash, enviar o e-mail
  pelo `EmailSender` próprio (template novo `athlete-invite`) com link
  `/#/cadastro?convite=<token>` — **substituindo** o `invite-user` do Keycloak Organizations como
  canal do convite. A adição do usuário à Organization passa a acontecer no aceite (via
  `KeycloakOrganizationGateway`), não no convite.
- **Endpoint público de lookup** `GET /api/public/athlete-invites/{token}` (espelho do
  `FoundingInviteController`): retorna nome do atleta/assessoria e e-mail sugerido para a página de
  cadastro; 404/410 para token inválido/expirado/consumido. Coberto pelo
  `PublicEndpointRateLimitFilter`.
- **Aceite vincula por token, não por e-mail:** ao concluir o cadastro/primeiro login originado do
  convite, o backend resolve `token → AthleteInvite → atletaId` e grava `atleta.usuario`,
  **independente do e-mail usado na conta**. Marca `accepted_at` (consumo único).
- **Fallback preservado:** `vincularAtletaSeNecessario` (match por e-mail) continua existindo para
  logins sem token; quando os dois divergirem, o token vence e a divergência é logada em WARN.

### Frontend

- Página `/#/cadastro?convite=` reconhece convite de **atleta** (além do de coach): consome o
  lookup, pré-preenche o e-mail e, após signup no Keycloak, envia o token no fluxo de conclusão
  para o backend efetivar o vínculo.
- Após o vínculo, o atleta cai no **onboarding** (fluxo existente de
  `athlete-onboarding-baseline`) — que agora sempre funciona, porque o vínculo é garantido.

## Non-goals

- Não migrar o convite de **coach** (fundadoras) — já funciona por token.
- Não remover `vincularAtletaSeNecessario` — vira fallback.
- Não criar UI de gestão de convites (listar/revogar) além do reenvio já existente no botão atual.
- Não tratar re-vínculo de atleta que trocou de conta (suporte manual continua).

## Critérios de aceite

1. **Given** um atleta cadastrado com e-mail X, **when** o coach clica em convidar, **then** um
   e-mail é enviado para X com link contendo token opaco, e nenhum convite via Keycloak
   Organizations é disparado.
2. **Given** o convidado abre o link e cria conta com e-mail **Y ≠ X**, **when** o cadastro
   conclui com o token, **then** `atleta.usuario` aponta para a conta Y, o convite é marcado como
   aceito, e o painel `/me/*` do atleta responde 200.
3. **Given** um token expirado ou já aceito, **when** o lookup ou aceite é chamado, **then**
   responde 410 (expirado/consumido) sem revelar dados do atleta.
4. **Given** um token de convite de outro tenant, **when** o aceite tenta vincular, **then** o
   vínculo respeita o tenant do convite (o atleta e o vínculo ficam no tenant de origem do convite).
5. **Given** reenvio de convite, **when** um novo token é gerado, **then** o token anterior deixa de
   ser aceito (410).
6. **Given** login de um usuário ATLETA sem token e com e-mail idêntico ao de um atleta órfão do
   tenant, **when** o sync roda, **then** o fallback por e-mail ainda vincula (comportamento atual).

## Métrica de sucesso

- Zero atletas órfãos (`tb_atleta` com convite aceito e `usuario_id` nulo) após o aceite — hoje o
  incidente exigiu SQL manual em produção.
- Coach não precisa conferir/corrigir e-mail de login do atleta: o convite aceito vincula em 100%
  dos casos, medível por `accepted_at` preenchido vs. `usuario_id` preenchido.

## Open Questions & Assumptions

- **Assumido:** o cadastro da conta continua no Keycloak (registration flow atual); o token viaja
  na URL da página de cadastro e é efetivado num endpoint autenticado pós-login (mesmo desenho do
  aceite das fundadoras). Validar no design se o fragmento (`/#/`) sobrevive ao redirect do
  Keycloak — decisão registrada em `radar_browser_router` indica que o token no fragmento é
  sensível ao fluxo de auth.
- **Assumido:** 7 dias de expiração é suficiente; configurável em `app.invite.athlete.ttl`.
- **Resolvido (product review):** convites Keycloak já enviados e não aceitos no deploy continuam
  válidos — o aceite deles segue o caminho antigo (login → fallback por e-mail). Nenhuma revogação
  ou reenvio automático; decisão registrada no `design.md`, Decisão 6.
- **Em aberto (para o founder, não bloqueia implementação):** (a) vale uma change curta separada de
  "auditoria + alerta de atleta órfão" no roadmap pós-pilot, em vez de depender de report manual?
  (b) o 409 "já vinculado a outra conta → suporte manual" basta como resposta operacional no pilot,
  ou re-vínculo deve virar item explícito de roadmap?

## Rollback e Riscos

- **Rollback:** feature é aditiva (tabela nova + endpoint novo + template novo). Reverter =
  voltar `gerarConvite` ao gateway Keycloak; a tabela pode ficar (sem leitura).
- **Risco:** token vazado vincula a conta errada. **Mitigação:** hash em repouso, TTL, consumo
  único, rate limit no endpoint público, e o token não dá acesso a dados (lookup expõe só
  nome/assessoria).
- **Risco:** fluxo de cadastro do Keycloak perder o token no meio (redirects). **Mitigação:**
  persistir o token em `sessionStorage` na entrada da página (mesma técnica do PKCE) e efetivar
  pós-login; cobrir com E2E (fluxo crítico — auth/onboarding, E2E obrigatório pelo CLAUDE.md do
  front).
