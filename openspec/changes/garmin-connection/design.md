# Design — garmin-connection

## Context

Ver `proposal.md` (Why) e ADR-0013. O que existe e molda a solução:

- `tb_integracao_externa` / `IntegracaoExterna` já tem `plataforma` (`FonteDados`), `accessToken`,
  `refreshToken`, `tokenExpiraEm`, `scopes`, `externalAthleteId`, `ativo`, `autoSyncPausado`,
  `lastSyncError`, com `UNIQUE(atleta_id, plataforma)`. `FonteDados.GARMIN` existe. `atualizadoEm`
  muda em qualquer `save` (`@PreUpdate`), então não serve de "última renovação" — daí a coluna
  nova `refresh_token_expira_em` (migration `V104`, última hoje é `V103`).
- O fluxo OAuth do intervals.icu (`IntervalsIcuOAuthServiceImpl`, `IntervalsIcuStateSigner`,
  `IntervalsIcuCallbackController`, `IntervalsIcuConnectionController`) é o molde: state HMAC com
  `atletaId` + timestamp, callback sem JWT que redireciona ao perfil com resultado, status/desconectar
  com `@PreAuthorize`. O signer assina com o `clientSecret` do intervals.icu e sem purpose: um state
  dele validaria no callback Garmin. O intervals.icu não tem refresh (token não expira) — o refresh
  é novo.
- `CacheConfig` (Caffeine) registra nomes fixos em `setCacheNames` com um único TTL
  (`cache.default-ttl`, `PT30M`); TTL por cache não está implementado. `AsaasWebhookController` é o
  padrão de webhook público: comparação constant-time (`MessageDigest.isEqual`) de um header, 401
  se inválido. `StructuredLoggingFilter` grava `getRequestURI()` no MDC e em INFO em todo request.
  Paths públicos vivem em `CoreSecurityProperties` (`publicPaths`, `stravaPaths`, `asaasPaths`,
  `intervalsIcuPaths`), não em `CoreSecurityConfig`.
  `IntervalsIcuConnectionServiceImpl.pausarStravaAutomaticamente` é público.
  `StravaOAuthServiceImpl` só pausa o Strava recém-conectado se há INTERVALS_ICU ativo.
  `CoachAthleteProfileServiceImpl` resolve `intervalsIcuConnectionService.conexaoAtiva` para o
  perfil agregado do treinador. Validação de onboarding está em `OnboardingServiceImpl`
  (`OnboardingDraftInput`/`AtletaOnboardingInputDto`); nada valida `canalIntegracao` hoje.
- Garmin OAuth2 PKCE: `GET connect.garmin.com/oauth2Confirm` (S256), `POST
  diauth.garmin.com/di-oauth2-service/oauth/token` com `client_secret` (sem public client),
  `expires_in = 86400`, refresh de ~90 dias rotativo, `GET /partner-gateway/rest/user/id`,
  `GET /partner-gateway/rest/user/permissions`, `DELETE /partner-gateway/rest/user/registration`.
  Webhooks `deregistrations` e `userPermissionsChange` chegam como POST JSON, sem assinatura,
  timeout de 30 s. Licença: segredo nunca no cliente; desconexão no app deve chamar o DELETE.
- Front: `IntervalsIcuConnectionCard`, `useIntervalsIcuConnection`, `useIntervalsIcuCallbackResult`
  (lê `intervals-icu=success|error` dentro do hash, `createHashRouter`), `watchCompatibility.ts`
  (entrada GARMIN hoje descreve o caminho via intervals.icu e o "Suportado" cita o gate feito via
  intervals.icu), `OnboardingPerfilStep` (oferece `INTERVALS_ICU` e `MANUAL`), `CoachWatchLine`
  (marca/modelo + matriz estática), `config/env.ts` (só `VITE_*` de URLs e Keycloak; não há
  infra de flag), `politicaPrivacidadeConteudo.ts` (já tem seção de IA, linha ~123).

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

### D2: `GarminStateSigner` próprio + PKCE verifier em cache Caffeine, chave = `state`
`GarminStateSigner` copia o algoritmo do `IntervalsIcuStateSigner` (HMAC-SHA256, TTL 10 min, skew
30 s) com três diferenças: chave = `garmin.client-secret`, payload `garmin|<atletaId>|<epoch>|<nonce>`
(nonce aleatório de 16 bytes para duas autorizações no mesmo segundo não colidirem no cache), e
rejeita qualquer state sem o prefixo. Chave diferente já garante que um state do intervals.icu não
valida aqui e vice-versa; o prefixo deixa isso explícito no teste. Alternativa rejeitada:
generalizar o `IntervalsIcuStateSigner` com um parâmetro de provedor — toca o código do
intervals.icu para poupar ~40 linhas, e os Non-Goals já descartam o wrapper genérico.

O verifier (64 chars aleatórios) fica em cache `garmin-pkce` registrado em `CacheConfig` com
`registerCustomCache` e `Caffeine.expireAfterWrite(10 min)` próprio (o `defaultTtl` de 30 min não
serve). Consumo atômico: `cache.getNativeCache().asMap().remove(state)` devolve o verifier e o
remove numa operação. Alternativas: coluna na `IntegracaoExterna` (migration + linha "pendente"
com semântica nova) ou verifier dentro do `state` (vaza para o histórico do navegador).
`shortcut: cache de processo; se o Railway passar a 2 réplicas, mover para tabela`.

### D3: Refresh sob demanda + job diário sobre `refreshTokenExpiraEm`
Expirações gravadas reais: `tokenExpiraEm = now + expires_in`, `refreshTokenExpiraEm = now +
refresh_token_expires_in` (o Garmin devolve ambos; se `refresh_token_expires_in` vier ausente,
assume 90 dias). A margem de 600 s é aplicada **só na leitura**: `GarminOAuthService.tokenValido(conexao)`
renova quando `tokenExpiraEm − 600 s < now`, grava `accessToken`, `refreshToken` (novo),
`tokenExpiraEm` e `refreshTokenExpiraEm` na mesma transação e devolve o access token. Um
`@Scheduled` diário renova conexões GARMIN ativas com `refreshTokenExpiraEm < now + 30 d`; como a
coluna só muda no refresh, webhook de permissão e `lastSyncError` não adiam o job. Falha 400/401 no
refresh → conexão `ativo=false`, `lastSyncError` com motivo, tokens e expirações nulos. Se o
processo cair entre o HTTP e o commit, o refresh antigo já foi consumido no Garmin: a próxima
tentativa falha com 400 e a conexão é marcada revogada — o atleta reconecta. Aceito: janela de
milissegundos, e a alternativa (two-phase com o Garmin) não existe. Alternativa rejeitada: só sob
demanda — atleta sem plano por 90 dias perderia a conexão sem aviso. Alternativa rejeitada: usar
`atualizadoEm` — muda em qualquer `save`.

### D4: Exclusividade no service, simétrica, mais o Strava
`GarminConnectionService.ativar(atletaId, tenantId, …)`: reativa ou cria a linha GARMIN (UNIQUE
atleta+plataforma — a reconexão reaproveita a linha com `ativo=false`), chama
`integracaoExternaRepository` para `ativo=false` na linha INTERVALS_ICU e
`pausarStravaAutomaticamente`. Antes de gravar, `findOtherActiveByExternalAthleteId` (já existe
para o intervals.icu) rejeita `userId` já ativo em outro atleta — mesmo de outro tenant, porque o
client ID é um só e o webhook roteia por `userId` sem tenant. O lado intervals.icu ganha o espelho:
ao concluir o OAuth do intervals.icu, revoga a linha GARMIN (chamando `removerRegistro`
best-effort). `StravaOAuthServiceImpl` passa a pausar se há INTERVALS_ICU **ou** GARMIN ativo (a
query `findActiveByAtletaIdAndPlataformaInAndTenantId` de D5). São as duas únicas edições em código
do intervals.icu/Strava nesta change. Concorrência entre dois callbacks do mesmo atleta: sem lock
pessimista, risco aceito (ver proposal).

### D5: `conexaoAtiva` por canal, preparando o push
Nova query `findActiveByAtletaIdAndPlataformaInAndTenantId(atletaId, {INTERVALS_ICU, GARMIN},
tenantId)` no repositório, exposta por `GarminConnectionService.conexaoDeCanal`. Nesta change a
usam o status, o `StravaOAuthServiceImpl` (D4) e o `CoachAthleteProfileServiceImpl` (D7);
`garmin-training-push` troca os chamadores restantes de `IntervalsIcuConnectionService.conexaoAtiva`
por ela. Deixar pronta aqui evita tocar a query duas vezes.

### D6: Webhook público com segredo no caminho, 404 se errado, processamento inline
`POST /api/v1/garmin/webhook/{segredo}` em `permitAll` (lista nova `garminPaths` em
`CoreSecurityProperties`, padrão `/api/v1/garmin/webhook/**`, fora da árvore `/me/**`); segredo
comparado com `MessageDigest.isEqual` contra `GARMIN_WEBHOOK_SECRET`; errado ou segredo não
configurado → 404 sem log do corpo (decisão do founder; a ADR-0013 dizia "200 sempre" e foi
ajustada — 404 não revela que o endpoint existe). O Garmin só aceita URL, por isso o segredo vai
no caminho e não em header como no Asaas; `StructuredLoggingFilter` mascara o último segmento de
`/api/v1/garmin/webhook/*` antes de gravar a URI no MDC e no log — sem isso o segredo iria para o
Railway a cada ping. Corpo é `Map<String, List<JsonNode>>` roteado pela chave (`deregistrations`,
`userPermissionsChange`; chaves desconhecidas ignoradas com 200 — `activityFiles` será tratada na
change de ingestão). Nesta change o processamento é inline (dois `UPDATE` por `userId`, bem abaixo
dos 30 s do Garmin); a spec exige só "responder em menos de 30 s". A change de ingestão introduz
a tabela de pings e o 200-antes-de-processar para `activityFiles`. Alternativa rejeitada: IP
allowlist — o Garmin não a documenta.

### D7: Endpoints espelham o intervals.icu; estado da conexão também no perfil do treinador
`GET /api/v1/integracoes/me/garmin/authorize-url` (ATLETA), `GET /api/v1/integracoes/me/garmin`
(ATLETA, ADMIN), `DELETE /api/v1/integracoes/me/garmin` (ATLETA, ADMIN),
`GET /api/v1/integracoes/garmin/callback` (sem JWT; redireciona ao perfil com
`garmin=success|error|denied` dentro do hash, mesmo contrato de `intervals-icu=success|error`).
DTOs novos: `GarminConnectionStatusDto` (ativo, userId mascarado, permissões
`workoutImport`/`activityExport`, `ultimaSincronizacao`, `lastSyncError`) e
`GarminAuthorizationUrlDto`. Para o treinador (CA12), `AtletaPerfilCoachOutputDto` ganha
`conexaoCanal { plataforma, ativo, workoutImport, activityExport, lastSyncError }`, preenchido em
`CoachAthleteProfileServiceImpl` pela `conexaoDeCanal` de D5 — sem endpoint novo para TREINADOR;
`melhoresEsforcosIntegracaoConectada` continua derivado só do intervals.icu.

### D8: Front generalizado por plataforma, não duplicado, atrás de flag
`IntervalsIcuConnectionCard` → `ConnectionCard` com prop `plataforma: 'GARMIN' | 'INTERVALS_ICU'`
decidindo serviço, textos e guia; `useIntervalsIcuConnection` e `useIntervalsIcuCallbackResult`
ganham o parâmetro (param do hash `garmin` ou `intervals-icu`; `denied` é o terceiro estado, só
Garmin). O perfil escolhe a plataforma pela `dispositivoMarca` do onboarding (GARMIN → Garmin;
resto → intervals.icu) **somente** quando `env.garminHabilitado` (`VITE_GARMIN_HABILITADO`, lida
em `config/env.ts` como as demais `VITE_*`, default false) é true; com false, tudo segue como hoje,
inclusive a opção de onboarding. `watchCompatibility.ts`: entrada GARMIN reescrita (passos do
canal direto, `verificadoEm = '2026-10'`, sem `docOficialUrl` do intervals.icu) com posicionamento
"Em validação" e critério de promoção "gate com atleta real do canal direto, em
`garmin-activity-ingestion`" — o "Suportado" atual cita um gate feito via intervals.icu, que não
vale para o canal direto.

### D9: Validação de canal × marca no backend, só GARMIN
Em `OnboardingServiceImpl` ao salvar o rascunho/perfil: `dispositivoMarca = GARMIN ⇒
canalIntegracao = GARMIN`; `dispositivoMarca ≠ GARMIN ⇒ canalIntegracao ≠ GARMIN`. Violação →
`DomainRuleViolationException` com campo `canalIntegracao` (mesmo handler dos outros erros de
domínio do onboarding; não é Bean Validation porque depende de dois campos). Sem backfill: vale
para salvamentos a partir do deploy. Front esconde a opção inválida, backend rejeita.

### D10: Consentimento no card
Texto fixo no card antes de "Conectar": transferência de treino ao Garmin (link para
`garmin.com/privacy/connect`) e processamento por IA (link para a política do Menthoros). A
seção de IA que já existe em `politicaPrivacidadeConteudo.ts` ganha o texto da declaração de
transparência (15.10) e a menção à transferência ao Garmin; a versão da política sobe nos dois
lados onde ela é versionada (linhas 19–23 do arquivo). Sem tabela de consentimento nova: o ato de
autorizar no Garmin é o registro (o Garmin guarda o consent).

### D11: Flag `garmin.habilitado` no backend
`GarminProperties.habilitado` (`GARMIN_HABILITADO`, default false). False → `authorize-url` e
callback respondem 503 "canal não configurado" sem gravar nada; status, delete e webhook seguem
funcionando (revogação pelo Garmin e desconexão não podem depender da flag). `configurado()`
(client ID/secret presentes) é condição separada, também 503. Removida em
`garmin-activity-ingestion` junto com a `VITE_`.

### D12: Métricas
Dois `Counter` Micrometer, no padrão do `CoachAthleteProfileServiceImpl`: `garmin.oauth.callback`
com tag `resultado ∈ {sucesso, erro, recusado}` e `garmin.token.refresh` com tag `resultado ∈
{sucesso, falha}`. São o que mede a métrica de sucesso da proposal.

## Risks / Trade-offs

- [Garmin muda endpoints ou formato do token] → cliente isolado em `GarminClient`; contrato coberto
  por teste com WireMock (como `IntervalsIcuClientImplTest` e `StravaTimeoutTest`;
  `MockRestServiceServer` não atende `WebClient`) e payloads do PDF.
- [Segredo do webhook em log] → mascarado no `StructuredLoggingFilter`; teste prova que a URI no
  MDC não contém o segredo.
- [Dois callbacks simultâneos do mesmo atleta] → sem lock; aceito como improvável (ver proposal).
- [Refresh token rotativo gravado fora de transação perde o vínculo] → gravar access + refresh +
  expiração numa única transação; teste cobre falha após o HTTP (não persiste nada do par antigo).
- [Reinício do processo durante o consent] → cache perde o verifier; atleta repete. Aceito (1
  réplica).
- [Webhook sem assinatura] → segredo no caminho + `userId` conhecido; corpo nunca logado.
- [Revisão de domínio do Garmin (24–48 h) no go-live] → cadastrar o domínio de produção antes do
  deploy; até lá o webhook aponta para o ambiente de testes.
- [Atleta Garmin já no intervals.icu conecta o Garmin] → exclusividade desativa o intervals.icu;
  até `garmin-training-push` entrar, esse atleta fica sem push. Mitigação: não divulgar a conexão
  Garmin aos atletas até as três changes estarem em produção (flags `garmin.habilitado` e
  `VITE_GARMIN_HABILITADO`, default false, removidas na terceira change — D8/D11).

## Migration Plan

1. Deploy backend com migration `V104` e `GARMIN_*` vazios / `GARMIN_HABILITADO=false`:
   endpoints respondem 503 "canal não configurado"; webhook responde 404.
2. Cadastrar client ID no Developer Portal, apontar redirect e webhook para o ambiente de testes;
   configurar vars no Railway (testes).
3. Validar CA1–CA9 com conta Garmin real no ambiente de testes.
4. Produção: cadastrar domínio (revisão 24–48 h), configurar vars, virar o webhook.
5. Rollback: remover vars → endpoints voltam a 503/404; linhas `plataforma=GARMIN` ficam inertes.

## Open Questions

- Nenhuma. `refresh_token_expires_in` foi incorporado em D3 (DoR 2026-10-25).
