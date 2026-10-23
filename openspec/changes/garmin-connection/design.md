# Design — garmin-connection

## Context

Ver `proposal.md` (Why) e ADR-0013. O que existe e molda a solução:

- `tb_integracao_externa` / `IntegracaoExterna` já tem `plataforma` (`FonteDados`), `accessToken`,
  `refreshToken`, `tokenExpiraEm`, `scopes`, `externalAthleteId`, `ativo`, `autoSyncPausado`, com
  `UNIQUE(atleta_id, plataforma)`. `FonteDados.GARMIN` existe. Zero migration.
- O fluxo OAuth do intervals.icu (`IntervalsIcuOAuthServiceImpl`, `IntervalsIcuStateSigner`,
  `IntervalsIcuCallbackController`, `IntervalsIcuConnectionController`) é o molde: state HMAC com
  `atletaId`, callback sem JWT que redireciona ao perfil com resultado, status/desconectar com
  `@PreAuthorize`. O intervals.icu não tem refresh (token não expira) — o refresh é novo.
- `CacheConfig` (Caffeine) existe; `AsaasWebhookController` é o padrão de webhook público com
  segredo; `IntervalsIcuConnectionServiceImpl.pausarStravaAutomaticamente` é público.
- Garmin OAuth2 PKCE: `GET connect.garmin.com/oauth2Confirm` (S256), `POST
  diauth.garmin.com/di-oauth2-service/oauth/token` com `client_secret` (sem public client),
  `expires_in = 86400`, refresh de ~90 dias rotativo, `GET /partner-gateway/rest/user/id`,
  `GET /partner-gateway/rest/user/permissions`, `DELETE /partner-gateway/rest/user/registration`.
  Webhooks `deregistrations` e `userPermissionsChange` chegam como POST JSON, sem assinatura,
  timeout de 30 s. Licença: segredo nunca no cliente; desconexão no app deve chamar o DELETE.
- Front: `IntervalsIcuConnectionCard`, `useIntervalsIcuConnection`, `useIntervalsIcuCallbackResult`,
  `watchCompatibility.ts` (entrada GARMIN hoje descreve o caminho via intervals.icu),
  `OnboardingPerfilStep` (oferece `INTERVALS_ICU` e `MANUAL`).

## Goals / Non-Goals

**Goals:**
- Conexão Garmin completa e revogável, com o menor código novo: uma fronteira HTTP nova
  (`GarminClient`) e reuso de tudo acima dela.
- Exclusividade de canal garantida no backend, não na UI.
- Base pronta para `garmin-training-push` (adapter precisa só de `conexao` + `GarminClient`) e
  `garmin-activity-ingestion` (webhook já existe; só ganha mais uma chave de lista).

**Non-Goals:**
- Push de treino, ingestão de atividade, migração dos atletas Garmin do intervals.icu, Health API.
- Abstrair o OAuth do intervals.icu e do Garmin numa classe genérica — dois provedores com
  divergências (PKCE, refresh, permissões) não justificam o wrapper.
- Fila/tabela para webhooks desta change: `deregistrations` e `userPermissionsChange` são
  idempotentes e baratos; processam inline após responder (ver D6).

## Decisions

### D1: `GarminClient` é a única fronteira nova
Interface + impl com `WebClient` (bean próprio, timeouts 5 s/10 s em código, como o Keycloak).
Métodos: `trocarCode`, `renovar`, `userId`, `permissoes`, `removerRegistro`. Métodos de workout,
schedule e download de arquivo entram nas changes seguintes, na mesma interface. Erro HTTP vira
`GarminApiException(status, mensagem)` sem token no texto. Alternativa rejeitada: `RestClient`
novo — o projeto já padronizou `WebClient` para intervals.icu e Strava.

### D2: PKCE verifier em cache Caffeine, chave = `state`
`state` é o HMAC do `IntervalsIcuStateSigner` (reusado como está: assina `atletaId` + timestamp,
nada do intervals.icu dentro). O verifier (43–128 chars aleatórios) fica em cache `garmin-pkce`,
TTL 10 min, removido no primeiro uso. Alternativas: coluna na `IntegracaoExterna` (migration +
linha "pendente" com semântica nova) ou verifier dentro do `state` (vaza para o histórico do
navegador). `shortcut: cache de processo; se o Railway passar a 2 réplicas, mover para tabela`.

### D3: Refresh sob demanda + job diário
`GarminOAuthService.tokenValido(conexao)` renova quando `tokenExpiraEm − 600 s < now`, grava
`accessToken`, `refreshToken` (novo) e `tokenExpiraEm` na mesma transação e devolve o access
token. Um `@Scheduled` diário renova conexões com `atualizadoEm` > 60 dias (o refresh token vive
90). Falha 400/401 no refresh → conexão `ativo=false`, `lastSyncError` com motivo, tokens apagados.
Alternativa rejeitada: só sob demanda — atleta sem plano por 90 dias perderia a conexão sem aviso.

### D4: Exclusividade no service, simétrica
`GarminConnectionService.ativar(atletaId, tenantId, …)`: grava a linha GARMIN, chama
`integracaoExternaRepository` para `ativo=false` na linha INTERVALS_ICU e
`pausarStravaAutomaticamente`. O lado intervals.icu ganha o espelho: ao concluir o OAuth do
intervals.icu, revoga a linha GARMIN (chamando `removerRegistro` best-effort). É a única edição no
código do intervals.icu nesta change.

### D5: `conexaoAtiva` por canal, preparando o push
Nova query `findActiveByAtletaIdAndPlataformaInAndTenantId(atletaId, {INTERVALS_ICU, GARMIN},
tenantId)` no repositório, exposta por `GarminConnectionService.conexaoDeCanal`. Nesta change só o
status a usa; `garmin-training-push` troca os quatro chamadores de
`IntervalsIcuConnectionService.conexaoAtiva` por ela. Deixar pronta aqui evita tocar a query
duas vezes.

### D6: Webhook público com segredo no caminho, processamento inline
`POST /api/v1/garmin/webhook/{segredo}` em `permitAll`; segredo comparado em tempo constante com
`GARMIN_WEBHOOK_SECRET`; errado → 404 sem log do corpo. Corpo é `Map<String, List<JsonNode>>`
roteado pela chave (`deregistrations`, `userPermissionsChange`; chaves desconhecidas ignoradas
com 200 — `activityFiles` será tratada na change de ingestão). Nesta change o processamento é
inline porque são dois `UPDATE` por `userId`; a change de ingestão introduz a tabela de pings e
o 200-antes-de-processar para `activityFiles`. Alternativa rejeitada: IP allowlist — o Garmin
não a documenta.

### D7: Endpoints espelham o intervals.icu
`GET /api/v1/integracoes/me/garmin/authorize-url` (ATLETA), `GET /api/v1/integracoes/me/garmin`
(ATLETA, ADMIN), `DELETE /api/v1/integracoes/me/garmin` (ATLETA, ADMIN),
`GET /api/v1/integracoes/garmin/callback` (sem JWT; redireciona ao perfil com
`?garmin=ok|erro|recusado`). DTOs novos: `GarminConnectionStatusDto` (ativo, userId mascarado,
permissões `workoutImport`/`activityExport`, `ultimaSincronizacao`, `lastSyncError`) e
`GarminAuthorizationUrlDto`.

### D8: Front generalizado por plataforma, não duplicado
`IntervalsIcuConnectionCard` → `ConnectionCard` com prop `plataforma: 'GARMIN' | 'INTERVALS_ICU'`
decidindo serviço, textos e guia; `useIntervalsIcuConnection` e `useIntervalsIcuCallbackResult`
ganham o parâmetro. O perfil escolhe a plataforma pela `dispositivoMarca` do onboarding (GARMIN →
Garmin; resto → intervals.icu). `watchCompatibility.ts`: entrada GARMIN reescrita (passos do
canal direto, `verificadoEm` novo, sem `docOficialUrl` do intervals.icu).

### D9: Validação de canal × marca no backend
`AtletaOnboardingInputDto`/service: `dispositivoMarca = GARMIN ⇒ canalIntegracao ∈ {GARMIN,
MANUAL}`; `dispositivoMarca ≠ GARMIN ⇒ canalIntegracao ≠ GARMIN`. Front esconde a opção inválida,
backend rejeita.

### D10: Consentimento no card
Texto fixo no card antes de "Conectar": transferência de treino ao Garmin (link para
`garmin.com/privacy/connect`) e processamento por IA (link para a política do Menthoros). A
política (`politicaPrivacidadeConteudo.ts`) ganha a seção "Transparência de IA". Sem tabela de
consentimento nova: o ato de autorizar no Garmin é o registro (o Garmin guarda o consent).

## Risks / Trade-offs

- [Garmin muda endpoints ou formato do token] → cliente isolado em `GarminClient`; contrato coberto
  por teste com `MockRestServiceServer`/`MockWebServer` e payloads do PDF.
- [Refresh token rotativo gravado fora de transação perde o vínculo] → gravar access + refresh +
  expiração numa única transação; teste cobre falha após o HTTP (não persiste nada do par antigo).
- [Reinício do processo durante o consent] → cache perde o verifier; atleta repete. Aceito (1
  réplica).
- [Webhook sem assinatura] → segredo no caminho + `userId` conhecido; corpo nunca logado.
- [Revisão de domínio do Garmin (24–48 h) no go-live] → cadastrar o domínio de produção antes do
  deploy; até lá o webhook aponta para o ambiente de testes.
- [Atleta Garmin já no intervals.icu conecta o Garmin] → exclusividade desativa o intervals.icu;
  até `garmin-training-push` entrar, esse atleta fica sem push. Mitigação: não divulgar a conexão
  Garmin aos atletas até as três changes estarem em produção (flag de UI `garminHabilitado`,
  default false, removida na terceira change).

## Migration Plan

1. Deploy backend com `GARMIN_*` vazios: endpoints respondem 503 "canal não configurado"; webhook
   responde 404.
2. Cadastrar client ID no Developer Portal, apontar redirect e webhook para o ambiente de testes;
   configurar vars no Railway (testes).
3. Validar CA1–CA9 com conta Garmin real no ambiente de testes.
4. Produção: cadastrar domínio (revisão 24–48 h), configurar vars, virar o webhook.
5. Rollback: remover vars → endpoints voltam a 503/404; linhas `plataforma=GARMIN` ficam inertes.

## Open Questions

- Garmin devolve `refresh_token_expires_in` no token response; o job diário pode usar esse valor
  em vez dos 60 dias fixos. Decidir ao ver o payload real no ambiente de testes — não muda spec
  nem tasks.
