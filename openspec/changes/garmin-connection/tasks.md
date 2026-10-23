# Tasks — garmin-connection

Backend valida com `./mvnw clean verify` (os `*IT` só rodam no `verify`); frontend com
`npm run lint && npm run build && npm test`.

## 1. Configuração e cliente HTTP

- [ ] 1.1 `GarminProperties` (`garmin.client-id`, `client-secret`, `redirect-uri`,
  `authorization-uri`, `token-uri`, `api-base-url`, `webhook-secret`) lidas de `GARMIN_*` em
  `application.yml`; verificar que sem vars o contexto sobe e `GarminProperties.configurado()` é
  false (`./mvnw clean test`).
- [ ] 1.2 `GarminWebClientConfig` com bean `garminWebClient`, connect 5 s / read 10 s em código;
  teste de timeout no molde de `StravaTimeoutTest`.
- [ ] 1.3 `GarminClient` (interface) + `GarminClientImpl`: `trocarCode(code, verifier)`,
  `renovar(refreshToken)`, `userId(token)`, `permissoes(token)`, `removerRegistro(token)`;
  `GarminApiException(status, mensagem)` sem token; teste com `MockRestServiceServer` usando os
  payloads do PDF OAuth2 PKCE (token com `expires_in`, `refresh_token`; `{"userId": …}`;
  `{"permissions": […]}`).

## 2. OAuth PKCE e conexão

- [ ] 2.1 `GarminOAuthServiceImpl.gerarAuthorizeUrl(atletaId)`: verifier aleatório 64 chars,
  `code_challenge = base64url(sha256(verifier))`, `state = IntervalsIcuStateSigner.assinar`,
  verifier em cache Caffeine `garmin-pkce` (TTL 10 min, chave `state`); teste verifica URL,
  método S256 e que o cache tem o verifier (CA1).
- [ ] 2.2 `GarminOAuthServiceImpl.concluir(state, code)`: valida state, retira o verifier do cache
  (uma vez), troca o code, busca `userId` e permissões, grava `IntegracaoExterna(GARMIN)` com
  `tokenExpiraEm = now + expires_in − 600 s` e `scopes` = permissões; teste cobre sucesso, state
  inválido, verifier ausente, code ausente (recusa) — nada gravado nos três últimos (CA2, CA3).
- [ ] 2.3 Exclusividade em `GarminConnectionServiceImpl.ativar`: desativa INTERVALS_ICU, chama
  `pausarStravaAutomaticamente`; espelho em `IntervalsIcuOAuthServiceImpl` (revoga GARMIN com
  `removerRegistro` best-effort); testes dos dois lados (CA4).
- [ ] 2.4 `GarminOAuthServiceImpl.tokenValido(conexao)`: renova quando faltam < 600 s, grava
  access + refresh novo + expiração na mesma transação; 400/401 no refresh → `ativo=false`,
  tokens nulos, `lastSyncError`; teste com `InOrder` prova que nada do par antigo persiste após
  falha (CA5).
- [ ] 2.5 `@Scheduled` diário em `GarminOAuthServiceImpl` renovando conexões ativas com
  `atualizadoEm` > 60 dias; teste unitário do filtro e da chamada (CA5).
- [ ] 2.6 `GarminConnectionServiceImpl.desconectar`: `removerRegistro` best-effort (falha logada
  sem token), `ativo=false`, tokens nulos; `status` devolve `GarminConnectionStatusDto` com
  `workoutImport`/`activityExport` derivados de `scopes`; `conexaoDeCanal` usa a query nova
  `findActiveByAtletaIdAndPlataformaInAndTenantId`; testes (CA6, CA8).

## 3. Endpoints

- [ ] 3.1 `GarminConnectionController` em `/api/v1/integracoes/me/garmin` (`authorize-url`, status,
  delete) com `@PreAuthorize`, `@Tag(name="garmin-connection")`, `@Operation`/`@ApiResponses`;
  `@WebMvcTest` + teste de autorização no molde de `IntervalsIcuConnectionControllerAuthTest`.
- [ ] 3.2 `GarminCallbackController` em `/api/v1/integracoes/garmin/callback` sem JWT, redireciona
  ao perfil com `?garmin=ok|erro|recusado`; `permitAll` em `CoreSecurityConfig`; IT no molde de
  `IntervalsIcuCallbackIT` (CA2, CA3).
- [ ] 3.3 `GarminWebhookController` em `/api/v1/garmin/webhook/{segredo}` (`permitAll`): segredo em
  comparação constante → 404; `deregistrations` → `ativo=false` por `userId`;
  `userPermissionsChange` → `scopes`; chave desconhecida → 200; `@WebMvcTest` cobre os quatro
  casos e que o corpo não vai ao log (CA7, CA8, CA9).
- [ ] 3.4 Sem `GARMIN_*` configurado: `authorize-url` responde 503 com mensagem "canal não
  configurado"; webhook responde 404; teste.

## 4. Onboarding e canal

- [ ] 4.1 `CanalIntegracao.GARMIN`; validação em `AtletaOnboardingService`: `GARMIN ⇒ canal ∈
  {GARMIN, MANUAL}`, `≠ GARMIN ⇒ canal ≠ GARMIN`; testes parametrizados por marca (CA10).
- [ ] 4.2 `FonteDados.GARMIN.description` → "Conexão direta com o Garmin Connect"; conferir que
  nenhum teste quebra (`./mvnw clean test`).
- [ ] 4.3 Regenerar o cliente OpenAPI do front (`npm run generate:api`) e confirmar que
  `GarminConnectionService` e os DTOs aparecem com tipos corretos.

## 5. Frontend

- [ ] 5.1 `useIntervalsIcuConnection` → `useConnection(plataforma)` e
  `useIntervalsIcuCallbackResult` → `useConnectionCallbackResult(plataforma)` lendo `?garmin=` ou
  `?intervals=`; testes existentes adaptados e caso Garmin adicionado.
- [ ] 5.2 `IntervalsIcuConnectionCard` → `ConnectionCard` com prop `plataforma`; texto de
  consentimento (transferência ao Garmin + IA, dois links) acima de "Conectar Garmin"; estado
  mostra permissões; teste cobre Garmin e intervals.icu (CA11, D10).
- [ ] 5.3 `AthleteProfilePage` escolhe a plataforma pela `dispositivoMarca` (GARMIN → Garmin, resto
  → intervals.icu), atrás da flag `garminHabilitado` (default false); teste das duas marcas.
- [ ] 5.4 `watchCompatibility.ts`: entrada GARMIN reescrita para o canal direto (passos, avisos,
  `resumoParaCoach`, `verificadoEm = '2026-10'`, sem citar intervals.icu); testes de
  `WatchConnectionGuide` e `CoachWatchLine` atualizados (CA11, CA12).
- [ ] 5.5 `OnboardingPerfilStep`: opção `GARMIN` visível só para marca GARMIN, `INTERVALS_ICU`
  oculta para GARMIN; teste (CA10).
- [ ] 5.6 `politicaPrivacidadeConteudo.ts`: seção "Transparência de IA" (nature e finalidade do
  processamento, consentimento e revogação) e menção à transferência de treinos ao Garmin;
  `npm run build`.

## 6. Integração e operação

- [ ] 6.1 IT de ponta a ponta: `authorize-url` → callback (Garmin stubado) → status mostra Garmin
  ativo e intervals.icu inativo → webhook `deregistrations` → status inativo (CA1–CA7).
- [ ] 6.2 Documentar em `menthoros-infra/docs` as vars `GARMIN_*`, o passo a passo do Developer
  Portal (redirect, endpoints, domínio) e a troca do webhook testes → produção; `./mvnw clean
  verify` e `npm run lint && npm run build && npm test` verdes.

## Workflow follow-up

- Cadastrar domínio de produção no Garmin antes do deploy (revisão 24–48 h).
- Guardar o texto de uso de IA enviado no cadastro do app como evidência da cláusula 15.11.
- A flag `garminHabilitado` é removida em `garmin-activity-ingestion`, quando o canal fica
  completo.
