**Tamanho:** L · **Trilha:** Full

# Proposal — garmin-connection

Primeira das três changes do canal Garmin direto (ADR-0013): `garmin-connection` →
`garmin-training-push` → `garmin-activity-ingestion`. Esta entrega a **conexão** (OAuth2 PKCE,
identidade do atleta no Garmin, permissões, revogação) e o canal `GARMIN` no onboarding. Sem ela,
as outras duas não têm credencial para agir.

## Status

- ready-for-agent (2026-10-23): grilling concluído (grill-with-docs), ADR-0013 aceito, seams
  confirmadas pelo founder, revisão ponytail aplicada. Pendente só o número de atletas Garmin hoje
  no intervals.icu (Q11), que dimensiona a migração — fora desta change.
- DoR 2026-10-25: spec-reviewer e Codex devolveram NOT READY (8 achados convergentes + 6 só do
  Codex, verificados no código). Corrigidos nesta revisão. Decisões do founder: coluna nova
  `refresh_token_expira_em` com migration; atleta Garmin só pode `canalIntegracao = GARMIN`;
  webhook com segredo errado responde 404; flag `garminHabilitado` em `VITE_GARMIN_HABILITADO` +
  `garmin.habilitado` no backend.

## Why

O atleta Garmin hoje precisa criar uma conta no intervals.icu para que o treino planejado chegue ao
relógio e o realizado volte — um intermediário que o treinador precisa explicar no onboarding e que
reinterpreta o dado (alvo de FC só como `%lthr`; em 2026-10-01, 107 bpm chegou ao relógio como
197 bpm). O Garmin Connect Developer Program (Starter Access, docs v2.0 de 15/10/2026) permite a
conexão direta na conta Garmin do atleta. O founder decidiu (ADR-0013) que o Garmin direto vira o
canal obrigatório do atleta Garmin, e o intervals.icu permanece para as demais marcas.

## What Changes

- Nova **conexão** com o Garmin Connect por OAuth2 PKCE: o atleta autoriza na conta dele, o
  backend troca o code por tokens, obtém o `userId` do Garmin e as permissões concedidas.
- Tokens renovados automaticamente (access token de 24 h; refresh token de 90 dias que rotaciona a
  cada uso), inclusive para atleta parado, para a conexão não morrer em silêncio.
- **Desconectar** no app revoga o registro no Garmin (`DELETE /user/registration`, exigido pela
  licença) e marca a conexão como revogada; treinos realizados já ingeridos permanecem.
- Webhooks `deregistrations` e `userPermissionsChange` recebidos num endpoint público com segmento
  secreto na URL: revogação pelo Garmin Connect desativa a conexão; mudança de permissão é gravada.
- **Um canal por atleta:** conectar Garmin desativa a conexão intervals.icu do atleta e pausa o
  auto-sync Strava (`autoSyncPausado`, nunca revertido automaticamente), e vice-versa.
- Strava conectado depois do Garmin também nasce pausado (hoje `StravaOAuthServiceImpl` só olha
  intervals.icu).
- `CanalIntegracao` ganha `GARMIN`; atleta com `DispositivoMarca = GARMIN` tem canal `GARMIN`
  obrigatório no onboarding (nem intervals.icu nem manual). A validação não existe hoje para
  nenhuma marca; vale para rascunhos salvos a partir do deploy, sem backfill.
- Card de conexão do perfil do atleta e hook de callback generalizados por plataforma; a entrada
  GARMIN da matriz de compatibilidade passa a descrever o canal direto, com posicionamento "Em
  validação" até o gate com atleta real do canal direto (feito em `garmin-activity-ingestion`).
- Política de privacidade: a seção de IA existente ganha a declaração de transparência exigida pela
  cláusula 15.10 e a menção à transferência de treinos ao Garmin (4.5); o consentimento aparece no
  card antes de conectar.
- Flag de rollout nos dois lados: `garmin.habilitado` no backend (default false → 503 em
  `authorize-url` e callback) e `VITE_GARMIN_HABILITADO` no front (default false → card e opção de
  onboarding ocultos). Removida em `garmin-activity-ingestion`.
- Migration `V104`: coluna `refresh_token_expira_em TIMESTAMPTZ NULL` em `tb_integracao_externa`
  (expiração do refresh token, informada pelo Garmin em `refresh_token_expires_in`). O resto da
  tabela já comporta tokens, `external_athlete_id` (userId Garmin) e `scopes` (permissões).
- `StructuredLoggingFilter` mascara o segmento secreto de `/api/v1/garmin/webhook/*` no MDC e no
  log de request (hoje grava a URI inteira).
- Contadores Micrometer `garmin.oauth.callback` (tag `resultado`) e `garmin.token.refresh` (tag
  `resultado`) para medir as métricas de sucesso.

## Capabilities

### New Capabilities
- `garmin-connection`: conexão do atleta ao Garmin Connect — autorização PKCE, identidade
  (`userId`), permissões, renovação de token, revogação pelo app ou pelo Garmin, exclusividade de
  canal.

### Modified Capabilities
- `watch-connection-guide`: a entrada GARMIN da matriz e o card de conexão do perfil passam a
  apontar para o canal Garmin direto em vez do intervals.icu; o onboarding obriga canal `GARMIN`
  para marca GARMIN.

## Impact

- **Backend:** `GarminClient` (interface + impl WebClient, timeouts 5 s/10 s como o Keycloak),
  `GarminStateSigner` (mesmo algoritmo do `IntervalsIcuStateSigner`, chave = `GARMIN_CLIENT_SECRET`,
  payload com prefixo `garmin` e nonce), `GarminOAuthService` (espelho do intervals.icu + PKCE +
  refresh), `GarminConnectionService` (status, desconectar, exclusividade), controllers
  `/api/v1/integracoes/me/garmin` (authorize-url, status, delete), `/api/v1/integracoes/garmin/callback`
  (sem JWT, como o do intervals.icu) e `/api/v1/garmin/webhook/{segredo}` (permitAll; comparação
  constant-time como em `AsaasWebhookController`, que usa header — o Garmin só aceita URL).
  `CanalIntegracao`, `OnboardingServiceImpl` (validação canal × marca), `CoreSecurityProperties`
  (lista `garminPaths`), `StructuredLoggingFilter`, `StravaOAuthServiceImpl` (pausa também com
  GARMIN ativo), `CoachAthleteProfileServiceImpl` (estado da conexão Garmin no perfil agregado do
  treinador), `CacheConfig` (cache `garmin-pkce` próprio, TTL 10 min — o TTL hoje é único,
  `PT30M`), `application.yml` (`garmin.*`), migration `V104`.
- **Frontend:** `IntervalsIcuConnectionCard`/`useIntervalsIcuConnection`/`useIntervalsIcuCallbackResult`
  generalizados por `plataforma` (param de callback `garmin=success|error|denied` dentro do hash,
  mesmo contrato de `intervals-icu=success|error`); `OnboardingPerfilStep`, `watchCompatibility.ts`,
  `CoachWatchLine`, `config/env.ts` (`VITE_GARMIN_HABILITADO`), tipos gerados.
- **Infra/contrato:** client ID único; webhook aponta para o ambiente de testes do Railway até o
  go-live e depois para produção (revisão de domínio do Garmin leva 24–48 h); variáveis
  `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, `GARMIN_WEBHOOK_SECRET`.
- **Não toca:** push de treino planejado e ingestão do realizado (changes seguintes); código do
  intervals.icu continua intacto.

## Critérios de aceite

- **CA1 — Autorizar.** Given atleta autenticado com perfil `DispositivoMarca = GARMIN`, When pede a
  URL de autorização, Then recebe URL de `connect.garmin.com/oauth2Confirm` com `code_challenge`
  S256, `state` assinado e `client_id`; o verifier fica retido por até 10 min.
- **CA2 — Callback feliz.** Given `state` válido e `code`, When o Garmin redireciona para o
  callback, Then o backend troca o code no servidor (com `client_secret`), busca `userId` e
  permissões, grava `IntegracaoExterna(plataforma=GARMIN, ativo=true, externalAthleteId=userId,
  scopes=permissões, tokenExpiraEm=now+expires_in, refreshTokenExpiraEm=now+refresh_token_expires_in)`
  e redireciona o atleta ao perfil com resultado de sucesso. Se já existe linha GARMIN inativa do
  atleta, ela é reativada (UNIQUE atleta+plataforma); se o `userId` já está ativo em outro atleta,
  nada é gravado e o atleta volta com erro.
- **CA3 — Callback inválido.** Given `state` adulterado, expirado, assinado pelo signer do
  intervals.icu, ou verifier ausente, When o callback é chamado, Then nada é gravado e o atleta
  volta ao perfil com erro; o `client_secret` nunca aparece em log ou resposta.
- **CA4 — Exclusividade.** Given atleta com conexão intervals.icu ativa, When conecta Garmin, Then a
  linha intervals.icu fica `ativo=false`, a Strava fica `autoSyncPausado=true`, e `GET status`
  mostra só Garmin ativo. Simétrico ao conectar intervals.icu com Garmin ativo. Given Garmin
  ativo, When o atleta conecta o Strava depois, Then a linha Strava nasce `autoSyncPausado=true`.
- **CA5 — Refresh.** Given access token a menos de 600 s de expirar, When qualquer chamada ao
  Garmin precisa do token, Then o backend renova antes, grava access, **novo** refresh,
  `tokenExpiraEm` e `refreshTokenExpiraEm` na mesma transação e usa o access token novo. Given
  `refreshTokenExpiraEm` a menos de 30 dias, When o job diário roda, Then renova sem precisar de
  uso; um webhook de permissão ou um `lastSyncError` gravado no meio não adia essa renovação.
- **CA6 — Desconectar pelo app.** Given conexão ativa, When o atleta desconecta, Then o backend
  chama `DELETE /user/registration` (best-effort: falha do Garmin não trava a desconexão local),
  marca `ativo=false` e apaga os tokens; treinos realizados não mudam.
- **CA7 — Desconectar pelo Garmin.** Given ping `{"deregistrations":[{"userId":…}]}` no webhook com
  segredo correto, When processado, Then a conexão daquele `userId` fica `ativo=false` e a resposta
  é 200 em menos de 30 s; `userId` desconhecido também responde 200, sem efeito.
- **CA8 — Permissões.** Given ping `userPermissionsChange`, When processado, Then `scopes` da
  conexão reflete a lista nova; status do atleta exibe se `WORKOUT_IMPORT` e `ACTIVITY_EXPORT`
  estão concedidos.
- **CA9 — Webhook sem segredo.** When o webhook é chamado com segmento errado, Then 404, sem log
  do corpo; em qualquer chamada ao webhook, o segmento secreto aparece mascarado no log de request
  e no MDC.
- **CA10 — Onboarding.** Given `garmin.habilitado=true` e rascunho com `dispositivoMarca = GARMIN`, When salvo com
  `canalIntegracao = INTERVALS_ICU` ou `MANUAL`, Then rejeitado com 422 (`DomainRuleViolationException`,
  mensagem citando o canal e a marca); com `GARMIN`, aceito. Com a flag false, marca GARMIN salva
  como hoje. Marca não-Garmin com `canalIntegracao = GARMIN` é rejeitada sempre.
- **CA11 — Guia.** Given atleta Garmin e `VITE_GARMIN_HABILITADO=true`, When abre o perfil, Then o
  card mostra "Conectar Garmin" acima do guia da marca, e o guia GARMIN descreve o canal direto, sem
  mencionar intervals.icu. Com a flag false, o card continua o de hoje (intervals.icu).
- **CA12 — Treinador.** Given atleta Garmin conectado, When o treinador abre o perfil do atleta,
  Then o perfil agregado (`AtletaPerfilCoachOutputDto`) traz canal `GARMIN`, conexão ativa e
  permissões, e a linha "Relógio" mostra Garmin com canal direto e estado da conexão. Given
  conexão revogada, Then o perfil traz `ativo=false` e `lastSyncError`, distinto de "nunca
  conectou" (`conexaoCanal = null`).
- **CA13 — Flag backend.** Given `garmin.habilitado=false` ou credenciais ausentes, When
  `authorize-url` é chamado, Then 503 "canal não configurado" (`GarminCanalIndisponivelException`
  + handler); When o callback é chamado, Then redireciona ao perfil com `garmin=error`; nada é
  gravado nos dois casos; webhook e status continuam funcionando (revogação pelo Garmin não depende
  da flag).

## Métrica de sucesso

- Atleta Garmin novo conecta sem abrir ticket ao treinador: ≥ 90 % das conexões concluídas no
  primeiro callback (CA2/CA3) nas 4 primeiras semanas em produção. Medido pelo contador
  `garmin.oauth.callback{resultado=sucesso|erro|recusado}`.
- Zero conexões Garmin expiradas por refresh não executado (CA5) em 90 dias. Medido por
  `garmin.token.refresh{resultado=sucesso|falha}` e pela ausência de linhas GARMIN com
  `lastSyncError` de refresh.

## Open Questions & Assumptions

- **Assumido:** 1 client ID Starter serve todos os tenants; o Menthoros é o licenciado, assessorias
  são clientes (ADR-0013). A cláusula 15.11 (IA) foi informada no cadastro do app e o founder a
  considera tratada; o texto enviado é guardado como evidência.
- **Assumido:** Railway roda 1 réplica; verifier PKCE em cache de processo basta (reinício durante o
  consent = atleta clica de novo).
- **Assumido:** o Garmin não assina o webhook; o segmento secreto na URL é a única autenticação.
  Com segredo errado a resposta é 404 (decisão do founder, 2026-10-25); a ADR-0013 dizia "200
  sempre" e foi ajustada.
- **Assumido:** dois callbacks simultâneos do mesmo atleta (Garmin e intervals.icu) é cenário
  improvável; a exclusividade não usa lock pessimista. Se aparecer, `conexaoDeCanal` devolve a
  mais recente e a seguinte desativa a outra.
- **Aberto (fora desta change):** quantos atletas Garmin estão no intervals.icu hoje — define o
  aviso e o prazo de 30 dias da migração, que entra depois de `garmin-activity-ingestion`.
