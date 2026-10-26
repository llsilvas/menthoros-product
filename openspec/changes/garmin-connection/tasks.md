# Tasks — garmin-connection

Backend valida com `./mvnw clean verify` (os `*IT` só rodam no `verify`); frontend com
`npm run lint && npm run build && npm test`. Testes HTTP de saída usam WireMock, como
`IntervalsIcuClientImplTest` (`MockRestServiceServer` não atende `WebClient`).

Ordem: seção 1 → 2 → 3 → 4 (backend, cada uma depende da anterior) → 5 (front, depende do
cliente OpenAPI regenerado em 4.4) → 6. Revisado no DoR de 2026-10-25.

## 1. Configuração, migration e cliente HTTP

- [x] 1.1 Migration `V104__Add_refresh_token_expira_em_to_tb_integracao_externa.sql`: coluna
  `refresh_token_expira_em TIMESTAMPTZ NULL`; campo `refreshTokenExpiraEm` em `IntegracaoExterna`.
  verify: `./mvnw clean test` sobe com a migration; `@DataJpaTest` grava e lê o campo.
- [x] 1.2 `GarminProperties` (prefixo `app.garmin`, como `app.strava`/`app.intervals-icu`; `habilitado`, `client-id`, `client-secret`, `redirect-uri`,
  `authorization-uri`, `token-uri`, `api-base-url`, `webhook-secret`) lidas de `GARMIN_*` em
  `application.yml`; `habilitado()` e `configurado()` separados (D11);
  `GarminCanalIndisponivelException` + `@ExceptionHandler` 503 em `GlobalExceptionHandler` (molde
  de `ConsentResolutionUnavailableException`).
  verify: sem vars o contexto sobe, `habilitado()` e `configurado()` são false; teste do handler
  devolve 503 com `message` "canal não configurado".
- [x] 1.3 `GarminWebClientConfig` com bean `garminWebClient`, connect 5 s / read 10 s em código.
  verify: teste de timeout no molde de `StravaTimeoutTest` (WireMock com delay > 10 s → erro).
- [x] 1.4 `GarminClient` (interface) + `GarminClientImpl`: `trocarCode(code, verifier)`,
  `renovar(refreshToken)`, `userId(token)`, `permissoes(token)`, `removerRegistro(token)`;
  `GarminApiException(status, mensagem)` sem token no texto; `TokenResponse` com `expires_in` e
  `refresh_token_expires_in` (ausente → 90 dias).
  verify: WireMock com os payloads do PDF OAuth2 PKCE; 4xx/5xx viram `GarminApiException`; a
  mensagem da exceção não contém o token.
- [x] 1.5 `CacheConfig`: cache `garmin-pkce` registrado com `registerCustomCache` e
  `expireAfterWrite(10 min)` próprio; demais caches inalterados.
  verify: teste lê `policy().expireAfterWrite()` do cache nativo (10 min para `garmin-pkce`,
  `defaultTtl` para `atletas`) e prova o consumo atômico via `asMap().remove` — equivalente ao
  `Ticker` falso sem abrir seam na config.

## 2. OAuth PKCE, exclusividade e refresh

- [x] 2.1 `GarminStateSigner` (D2): HMAC-SHA256 com `garmin.client-secret`, payload
  `garmin|atletaId|epoch|nonce` (separador real `.`, para o state ir na URL sem escape), TTL 10 min, skew 30 s; `assinar(atletaId)` / `validar(state)`.
  verify: teste rejeita state do `IntervalsIcuStateSigner`, state sem prefixo, expirado e com
  MAC alterado; dois `assinar` no mesmo segundo diferem (CA3).
- [x] 2.2 `GarminOAuthServiceImpl.gerarAuthorizeUrl(atletaId)`: `GarminCanalIndisponivelException`
  se `!habilitado()` ou `!configurado()`; verifier aleatório 64 chars, `code_challenge =
  base64url(sha256(verifier))`, verifier em `garmin-pkce` com chave `state`.
  verify: teste confere URL (`oauth2Confirm`, `code_challenge_method=S256`, `client_id`, `state`)
  e que o cache tem o verifier; com flag false, exceção e cache vazio (CA1, CA13).
- [x] 2.3 `GarminOAuthServiceImpl.concluir(state, code)`: valida state, consome o verifier com
  `asMap().remove`, troca o code, busca `userId` e permissões, rejeita `userId` ativo em outro
  atleta via query global `findActiveByExternalAthleteIdAndPlataforma(userId, GARMIN)` (já existia, sem
  tenant; coberta em `IntegracaoExternaGarminQueriesTest` com dois tenants), reativa ou cria `IntegracaoExterna(GARMIN)` com
  `tokenExpiraEm = now + expires_in`, `refreshTokenExpiraEm = now + refresh_token_expires_in`,
  `scopes` = permissões; `code` ausente → resultado `denied`; contador `garmin.oauth.callback`.
  verify: testes de sucesso (linha nova e linha reativada com mesmo `userId`), state inválido,
  verifier ausente, segundo uso do mesmo state, `userId` de outro atleta (inclusive de outro
  tenant), code ausente — nada gravado nos cinco últimos; contador incrementa com a tag certa (CA2, CA3).
- [x] 2.4 Exclusividade (D4): `GarminConnectionServiceImpl.ativar` desativa INTERVALS_ICU e chama
  `pausarStravaAutomaticamente`; espelho em `IntervalsIcuOAuthServiceImpl` (revoga GARMIN com
  `removerRegistro` best-effort); `StravaOAuthServiceImpl` pausa se há INTERVALS_ICU **ou** GARMIN
  ativo; query nova `findActiveByAtletaIdAndPlataformaInAndTenantId` (D5).
  verify: testes dos três lados — Garmin sobre ICU, ICU sobre Garmin, Strava depois de Garmin nasce
  `autoSyncPausado=true`; testes existentes do Strava continuam verdes (CA4).
- [x] 2.5 `GarminOAuthServiceImpl.tokenValido(conexao)`: renova quando `tokenExpiraEm − 600 s <
  now`, grava access, refresh novo e as duas expirações na mesma transação; 400/401 → `ativo=false`,
  tokens e expirações nulos, `lastSyncError`; contador `garmin.token.refresh`.
  verify: teste com `InOrder` prova um único `save` com o par novo; na falha, nenhum campo do par
  antigo persiste e o contador registra `falha` (CA5).
- [x] 2.6 `@Scheduled` diário renovando conexões GARMIN ativas com `refreshTokenExpiraEm < now +
  30 d`. Chama `renovar` (forçado), não `tokenValido`: com o access token ainda vigente este não renovaria nada.
  verify: teste unitário do filtro (uma linha dentro, uma fora, uma inativa) e da chamada a
  `tokenValido`; `save` de `scopes` ou `lastSyncError` não altera `refreshTokenExpiraEm` (CA5).
- [x] 2.7 `GarminConnectionServiceImpl.desconectar(atletaId, tenantId)` (tenant explícito em todos os métodos; o controller o resolve): `removerRegistro` best-effort (falha logada
  sem token), `ativo=false`, tokens e expirações nulos; `status` devolve `GarminConnectionStatusDto`
  com `workoutImport`/`activityExport` derivados de `scopes`; `conexaoDeCanal` usa a query de D5.
  verify: testes com Garmin ok e Garmin 500 (ambos concluem localmente); status com scopes
  parciais; `TreinoRealizado` do atleta inalterado (CA6, CA8).

## 3. Endpoints, segurança e webhook

- [x] 3.1 `CoreSecurityProperties.garminPaths` (`/api/v1/integracoes/garmin/callback`,
  `/api/v1/garmin/webhook/**`) aplicada em `CoreSecurityConfig`; `/api/v1/integracoes/me/garmin/**`
  continua autenticado.
  verify: teste de segurança prova callback e webhook anônimos permitidos e `/me/garmin` → 401 sem
  JWT.
- [x] 3.2 `StructuredLoggingFilter` mascara o último segmento de `/api/v1/garmin/webhook/*` no MDC
  e no log de request.
  verify: teste com `ListAppender`/MDC prova que a URI gravada é `/api/v1/garmin/webhook/***` e
  que outras URIs não mudam (CA9).
- [x] 3.3 `GarminConnectionController` em `/api/v1/integracoes/me/garmin` (`authorize-url`, status,
  delete) com `@PreAuthorize`, `@Tag(name="garmin-connection")`, `@Operation`/`@ApiResponses`.
  verify: `@WebMvcTest` dos três endpoints + teste de autorização no molde de
  `IntervalsIcuConnectionControllerAuthTest` (ATLETA ok, TREINADOR 403).
- [x] 3.4 `GarminCallbackController` em `/api/v1/integracoes/garmin/callback` sem JWT, redireciona
  ao perfil com `#/…?garmin=success|error|denied`; `GarminCanalIndisponivelException` capturada →
  redirect com `garmin=error` (navegador, não 503).
  verify (feito como `@WebMvcTest` com a cadeia de segurança real, não IT): molde de `IntervalsIcuCallbackIT` cobrindo os três resultados e a flag desligada
  → redirect `error` sem gravação (CA2, CA3, CA13).
- [x] 3.5 `GarminWebhookController` em `/api/v1/garmin/webhook/{segredo}`: `MessageDigest.isEqual`
  → 404 se errado ou não configurado; `deregistrations` → `ativo=false` + tokens nulos por
  `userId` (query global de 2.3); `userPermissionsChange` → `scopes`; `userId` desconhecido e
  chave desconhecida → 200.
  verify: `@WebMvcTest` cobre os cinco casos e prova (appender) que o corpo não vai ao log (CA7,
  CA8, CA9).
- [x] 3.6 `CoachAthleteProfileServiceImpl`: `AtletaPerfilCoachOutputDto.conexaoCanal { plataforma,
  ativo, workoutImport, activityExport, lastSyncError }` (ou `null`) via query nova
  `findFirstByAtletaIdAndPlataformaInAndTenantIdOrderByAtualizadoEmDesc` (ativa ou não);
  `melhoresEsforcosIntegracaoConectada` inalterado.
  verify: teste do service com atleta Garmin ativo, Garmin revogado (`ativo=false` +
  `lastSyncError`), atleta ICU e atleta sem canal (`null`) (CA12).

## 4. Onboarding, enum e contrato

- [ ] 4.1 `CanalIntegracao.GARMIN`; validação em `OnboardingServiceImpl` (D9): com
  `garmin.habilitado`, `GARMIN ⇒ canal = GARMIN`; sempre, `≠ GARMIN ⇒ canal ≠ GARMIN`;
  `DomainRuleViolationException` (422, handler existente) com mensagem citando canal e marca.
  verify: teste parametrizado por marca × canal × flag (flag on: GARMIN+ICU rejeita, GARMIN+MANUAL
  rejeita, GARMIN+GARMIN aceita; flag off: GARMIN+ICU aceita; sempre: COROS+GARMIN rejeita,
  COROS+ICU aceita); mensagem contém "canal" (CA10).
- [ ] 4.2 `FonteDados.GARMIN.description` → "Conexão direta com o Garmin Connect" (delta de
  contrato OpenAPI, só texto).
  verify: `./mvnw clean test` verde; snapshot OpenAPI, se houver, atualizado.
- [ ] 4.3 Contadores `garmin.oauth.callback` e `garmin.token.refresh` registrados (D12) — se não
  cobertos em 2.3/2.5, fechar aqui.
  verify: `/actuator/metrics/garmin.oauth.callback` existe no IT de 6.1.
- [ ] 4.4 Regenerar o cliente OpenAPI do front (`npm run generate:api`).
  verify: `GarminConnectionService`, `GarminConnectionStatusDto`, `GarminAuthorizationUrlDto`,
  `CanalIntegracao.GARMIN` e `AtletaPerfilCoachOutputDto.conexaoCanal` tipados; `npm run build`.

## 5. Frontend

- [ ] 5.1 `config/env.ts`: `garminHabilitado` lido de `VITE_GARMIN_HABILITADO` (default false),
  mesmo padrão das demais `VITE_*`; `.env.example` e `env-config.js` atualizados.
  verify: teste de `env` com var ausente → false, `"true"` → true.
- [ ] 5.2 `useIntervalsIcuConnection` → `useConnection(plataforma)` e
  `useIntervalsIcuCallbackResult` → `useConnectionCallbackResult(plataforma)` lendo `garmin` ou
  `intervals-icu` no hash; `denied` só para Garmin.
  verify: testes existentes do ICU adaptados e verdes; casos Garmin `success|error|denied`.
- [ ] 5.3 `IntervalsIcuConnectionCard` → `ConnectionCard` com prop `plataforma`; consentimento
  (transferência ao Garmin + IA, dois links) acima de "Conectar Garmin"; estado mostra permissões
  (D10).
  verify: teste cobre Garmin (links visíveis antes do botão, permissões parciais) e intervals.icu
  inalterado (CA11).
- [ ] 5.4 `AthleteProfilePage` escolhe a plataforma pela `dispositivoMarca` só com
  `env.garminHabilitado`.
  verify: teste GARMIN+flag → card Garmin; GARMIN sem flag → card ICU; COROS+flag → card ICU
  (CA11).
- [ ] 5.5 `watchCompatibility.ts`: entrada GARMIN nova para o canal direto (passos, avisos,
  `resumoParaCoach`, `verificadoEm = '2026-10'`, posicionamento "Em validação" com critério de
  promoção, sem citar intervals.icu); a atual vira `GARMIN_VIA_INTERVALS`; a matriz expõe uma ou
  outra por `env.garminHabilitado`.
  verify: testes de `WatchConnectionGuide` e da matriz nas duas flags; com flag on, grep de
  "intervals" na entrada GARMIN vazio; com flag off, entrada idêntica à de hoje (CA11).
- [ ] 5.6 `CoachWatchLine` lê `conexaoCanal` do perfil agregado e mostra canal + estado +
  permissões.
  verify: teste dos três cenários da spec `watch-connection-guide` (Garmin ativo, revogado com
  motivo, sem canal → "sem canal conectado") (CA12).
- [ ] 5.7 `OnboardingPerfilStep`: com flag, marca GARMIN mostra só `GARMIN`; demais marcas não
  mostram `GARMIN`; sem flag, comportamento atual.
  verify: teste por marca × flag (CA10).
- [ ] 5.8 `politicaPrivacidadeConteudo.ts`: seção de IA existente ganha a declaração de
  transparência (15.10) e a transferência ao Garmin; versão da política atualizada nos dois lados.
  verify: `npm run build`; teste da página procura o texto "transparência" e "Garmin".

## 6. Integração e operação

- [ ] 6.1 IT de ponta a ponta (WireMock como Garmin): `authorize-url` → callback → status Garmin
  ativo e intervals.icu inativo → Strava conectado nasce pausado → webhook `userPermissionsChange`
  → webhook `deregistrations` → status inativo; métricas presentes.
  verify: `./mvnw clean verify` verde (CA1–CA8, CA13).
- [ ] 6.2 Documentar em `menthoros-infra/docs` as vars `GARMIN_*` (inclusive `GARMIN_HABILITADO`) e
  `VITE_GARMIN_HABILITADO`, o passo a passo do Developer Portal (redirect, endpoints, domínio) e a
  troca do webhook testes → produção; arquivar
  `menthoros-product/artifacts/docs/architecture/INTEGRACAO_GARMIN_STRAVA_CONSOLIDATED.md`.
  verify: `./mvnw clean verify` e `npm run lint && npm run build && npm test` verdes; doc revisado
  pelo founder.

## Workflow follow-up

- Cadastrar domínio de produção no Garmin antes do deploy (revisão 24–48 h).
- Guardar o texto de uso de IA enviado no cadastro do app como evidência da cláusula 15.11.
- As flags `garmin.habilitado` e `VITE_GARMIN_HABILITADO` são removidas em
  `garmin-activity-ingestion`, que também apaga a entrada `GARMIN_VIA_INTERVALS` e promove a
  entrada GARMIN a "Suportado" após o gate com atleta real.
- `garmin-training-push` troca os chamadores restantes de `IntervalsIcuConnectionService.conexaoAtiva`
  por `conexaoDeCanal`.
