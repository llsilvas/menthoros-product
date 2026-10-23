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
- `CanalIntegracao` ganha `GARMIN`; atleta com `DispositivoMarca = GARMIN` tem canal `GARMIN`
  obrigatório no onboarding (não pode escolher intervals.icu).
- Card de conexão do perfil do atleta e hook de callback generalizados por plataforma; a entrada
  GARMIN da matriz de compatibilidade passa a descrever o canal direto.
- Política de privacidade ganha a declaração de transparência de IA (cláusula 15.10) e o aviso de
  transferência de dado ao Garmin (4.5) no consentimento da conexão.
- Nenhuma migration: `tb_integracao_externa` com `plataforma = GARMIN` já comporta tokens,
  `external_athlete_id` (userId Garmin) e `scopes` (permissões).

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
  `GarminOAuthService` (espelho do intervals.icu + PKCE + refresh), `GarminConnectionService`
  (status, desconectar, exclusividade), controllers `/api/v1/integracoes/me/garmin` (authorize-url,
  status, delete), `/api/v1/integracoes/garmin/callback` (sem JWT, como o do intervals.icu) e
  `/api/v1/garmin/webhook/{segredo}` (permitAll, padrão `AsaasWebhookController`). `CanalIntegracao`,
  validação do onboarding, `CoreSecurityConfig`, `application.yml` (`garmin.*`). PKCE verifier em
  cache Caffeine (`CacheConfig` existente), TTL 10 min, chave = `state`.
- **Frontend:** `IntervalsIcuConnectionCard`/`useIntervalsIcuConnection`/`useIntervalsIcuCallbackResult`
  generalizados por `plataforma`; `OnboardingPerfilStep`, `watchCompatibility.ts`, tipos gerados.
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
  scopes=permissões, tokenExpiraEm=now+expires_in−600s)` e redireciona o atleta ao perfil com
  resultado de sucesso.
- **CA3 — Callback inválido.** Given `state` adulterado, expirado ou verifier ausente, When o
  callback é chamado, Then nada é gravado e o atleta volta ao perfil com erro; o `client_secret`
  nunca aparece em log ou resposta.
- **CA4 — Exclusividade.** Given atleta com conexão intervals.icu ativa, When conecta Garmin, Then a
  linha intervals.icu fica `ativo=false`, a Strava fica `autoSyncPausado=true`, e `GET status`
  mostra só Garmin ativo. Simétrico ao conectar intervals.icu com Garmin ativo.
- **CA5 — Refresh.** Given access token a menos de 600 s de expirar, When qualquer chamada ao
  Garmin precisa do token, Then o backend renova antes, grava o **novo** refresh token na mesma
  transação e usa o access token novo. Given refresh token com mais de 60 dias, When o job diário
  roda, Then renova sem precisar de uso.
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
  do corpo.
- **CA10 — Onboarding.** Given rascunho com `dispositivoMarca = GARMIN`, When salvo com
  `canalIntegracao = INTERVALS_ICU`, Then rejeitado com erro de validação; com `GARMIN`, aceito.
  Marca não-Garmin com `canalIntegracao = GARMIN` também é rejeitada.
- **CA11 — Guia.** Given atleta Garmin, When abre o perfil, Then o card mostra "Conectar Garmin"
  acima do guia da marca, e o guia GARMIN descreve o canal direto, sem mencionar intervals.icu.
- **CA12 — Treinador.** Given atleta Garmin conectado, When o treinador abre o perfil do atleta,
  Then a linha "Relógio" mostra Garmin com canal direto e estado da conexão.

## Métrica de sucesso

- Atleta Garmin novo conecta sem abrir ticket ao treinador: ≥ 90 % das conexões concluídas no
  primeiro callback (CA2/CA3) nas 4 primeiras semanas em produção.
- Zero conexões Garmin expiradas por refresh não executado (CA5) em 90 dias.

## Open Questions & Assumptions

- **Assumido:** 1 client ID Starter serve todos os tenants; o Menthoros é o licenciado, assessorias
  são clientes (ADR-0013). A cláusula 15.11 (IA) foi informada no cadastro do app e o founder a
  considera tratada; o texto enviado é guardado como evidência.
- **Assumido:** Railway roda 1 réplica; verifier PKCE em cache de processo basta (reinício durante o
  consent = atleta clica de novo).
- **Assumido:** o Garmin não assina o webhook; o segmento secreto na URL é a única autenticação.
- **Aberto (fora desta change):** quantos atletas Garmin estão no intervals.icu hoje — define o
  aviso e o prazo de 30 dias da migração, que entra depois de `garmin-activity-ingestion`.
