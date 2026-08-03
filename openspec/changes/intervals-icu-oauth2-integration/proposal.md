# intervals-icu-oauth2-integration — Fluxo OAuth2 com Intervals.icu

**Tamanho:** S · **Trilha:** Full (backend + config)

> App OAuth2 aprovado por David (david@intervals.icu) em 2026-08-02. Client ID `663`.
> Esta change implementa o fluxo OAuth2 — autorizacao, callback e troca de token —
> seguindo o mesmo molde do Strava (`StravaAuthController`, `StravaOAuthService`,
> `StravaProperties`).

**Status:** proposta
**Criado:** 2026-08-02
**Revisado:** 2026-08-02 (Staff Engineer — 4 achados corrigidos)

## Problema

Hoje a conexao com intervals.icu usa API key pessoal do atleta (`IntervalsIcuConnectionService`
+ `IntervalsIcuConnectionController`). Isso funciona, mas tem friccao: o atleta precisa gerar
uma API key manualmente no intervals.icu e colar no Menthoros.

O intervals.icu oferece OAuth2 proprio (modelo Strava): o atleta clica em "Conectar", loga no
intervals.icu, escolhe os escopos e o Menthoros recebe um `access_token`. Este fluxo e mais
seguro (token com escopo limitado, revogavel pelo atleta no intervals.icu) e elimina o passo
manual de gerar API key.

O app Menthoros ja foi aprovado e registrado no intervals.icu — credenciais disponiveis.

## Escopo

1. **`IntervalsIcuProperties`** — nova classe `@ConfigurationProperties(prefix = "app.intervals-icu")`
   com `clientId`, `clientSecret`, `redirectUri`, `authorizationUri`, `tokenUri`, `apiBaseUrl`
2. **`IntervalsIcuOAuthService`** — interface + impl com:
   - `getAuthorizationUrl(UUID atletaId)` — monta URL de autorizacao com state (atletaId)
   - `findAtletaForCallback(UUID atletaId)` — resolve o Atleta a partir do state UUID
     (publico, sem TenantContext — o callback nao tem JWT)
   - `exchangeCodeForToken(String code, Atleta atleta)` — troca code por access_token + refresh_token,
     persiste em `IntegracaoExterna` (plataforma `INTERVALS_ICU`) com todos os campos:
     accessToken, refreshToken, tokenExpiraEm (expires_in), scopes, externalAthleteId.
     Aplica hook D5.2: se Strava estiver ativo para o mesmo atleta, seta `autoSyncPausado=true`
     no Strava (pausa scheduler Strava — decisao do founder, igual ao fluxo inverso ja implementado
     em `StravaOAuthServiceImpl.exchangeCodeForToken`)
   - `getStatus(UUID atletaId)` — status da conexao OAuth (sem expor token)
   - `disconnect(UUID atletaId)` — soft-delete (ativo=false, zera credenciais e scopes)
3. **`IntervalsIcuAuthController`** — `@RequestMapping("/api/v1/intervals-icu/auth")`:
   - `GET /authorize?atletaId=` → redirect 302 para intervals.icu OAuth
   - `GET /authorize/url/{atletaId}` → retorna URL (para SPA)
   - `GET /callback?code=&state=` → publico (sem @PreAuthorize), fluxo:
     parse state → `findAtletaForCallback` → `exchangeCodeForToken` →
     redirect para frontend com `?intervals-icu=success|error`
   - `GET /status/{atletaId}` → status da conexao OAuth
   - `DELETE /disconnect/{atletaId}` → desconecta (soft-delete)
4. **Security** — adicionar `intervalsIcuPaths` em `CoreSecurityProperties`
   (NOVA lista, sem renomear `stravaPaths` — minimo diff, zero risco para o Strava).
   Default: `List.of("/api/v1/intervals-icu/auth/callback")`.
   Adicionar `.requestMatchers(...).permitAll()` no `CoreSecurityConfig`.
5. **Config** — adicionar propriedades em `application.yml`:
   ```yaml
   app:
     intervals-icu:
       client-id: ${INTERVALS_ICU_CLIENT_ID:}
       client-secret: ${INTERVALS_ICU_CLIENT_SECRET:}
       redirect-uri: ${INTERVALS_ICU_REDIRECT_URI:http://localhost:8099/api/v1/intervals-icu/auth/callback}
       authorization-uri: https://intervals.icu/oauth/authorize
       token-uri: https://intervals.icu/oauth/token
       api-base-url: https://intervals.icu/api/v1
   ```

## Fora de escopo

- Substituir o fluxo de API key existente — convivem os dois caminhos
- Webhook do intervals.icu — change futura separada
- Activity sync scheduler — ja existe change propria (`intervals-icu-activity-sync-scheduler`)
- UI/frontend — botao "Conectar intervals.icu" sera change separada de frontend
- `refreshAccessToken` / `getValidToken` — postergado para a change de scheduler
  (igual Strava, que tambem nao faz refresh no controller de auth)

## Criterios de aceite

- **CA1 — Autorizacao:** Given coach autenticado com role TECNICO, When chama `GET /auth/authorize?atletaId=`,
  Then redireciona para `https://intervals.icu/oauth/authorize` com client_id, redirect_uri,
  response_type=code, scope e state=atletaId
- **CA2 — Callback feliz:** Given intervals.icu redireciona de volta com code e state validos,
  When `GET /auth/callback` processa, Then: (a) resolve atleta via findAtletaForCallback,
  (b) troca code por token e persiste IntegracaoExterna com accessToken, refreshToken,
  tokenExpiraEm, scopes e externalAthleteId, (c) aplica hook D5.2 pausando Strava se ativo,
  (d) redireciona para frontend com `?intervals-icu=success`
- **CA3 — Callback erro:** Given intervals.icu redireciona com `?error=`, When callback processa,
  Then redireciona para frontend com `?intervals-icu=error`
- **CA4 — Callback invalido:** Given code ou state ausentes, When callback processa,
  Then redireciona para frontend com `?intervals-icu=error`
- **CA5 — Status:** Given atleta conectado via OAuth, When `GET /auth/status/{atletaId}`,
  Then retorna conexao ativa (sem expor token)
- **CA6 — Desconexao:** Given atleta conectado, When `DELETE /auth/disconnect/{atletaId}`,
  Then soft-delete (ativo=false, zera accessToken, refreshToken, scopes, tokenExpiraEm)
- **CA7 — Token expirado:** refresh token flow sera tratado na change de scheduler
  (nao nesta change — igual Strava)
- **CA8 — Multi-tenancy:** TenantContext setado corretamente nos endpoints autenticados;
  callback (publico) usa findAtletaForCallback (query sem tenant filter) + atleta.getAssessoria().getId()
  para setar o tenant no IntegracaoExterna
- **CA9 — D5.2 auto-pausa:** Given atleta com Strava ativo, When connecta intervals.icu via OAuth,
  Then Strava tem autoSyncPausado=true (pausa scheduler Strava). Monotonico: so seta true,
  nunca reverter para false.

## Riscos e mitigações

- **Scope do intervals.icu:** verificar escopos disponiveis na documentacao OAuth.
  Assumido: `activity:read` para ingestao de treinos. Validar na task 5.2.
- **Convivio API key + OAuth:** OAuth cria/atualiza registro `INTERVALS_ICU` —
  mesmo `plataforma`, mesma unique `(atleta_id, plataforma)`. API key existente e
  substituida pelo token OAuth (o fluxo OAuth e o caminho recomendado).
  Implementacao: `findByAtletaIdAndPlataforma` + `orElse(new)` (merge, nao insert duplicado).
- **Refresh token:** intervals.icu prove refresh_token? Documentacao nao verificada.
  Se prover, persiste junto com access_token para uso no scheduler.
- **Config de environment variables:** client-secret NAO hardcoded — injetado via env var.
  Em dev, usar valores reais do app registrado.
- **Endpoints OAuth reais:** authorization-uri e token-uri assumidos como
  `https://intervals.icu/oauth/authorize` e `/oauth/token`. Confirmar na task 5.2
  contra a documentacao ou testando o fluxo real.

## Rollback

Aditivo: reverter o PR remove controller, service e properties. Nenhum schema novo —
reusa `IntegracaoExterna` existente. Atletas que fizeram OAuth perdem a conexao
(teriam que reconectar apos re-deploy). API key existente nao e afetada (so e
sobrescrita se o atleta explicitamente passar pelo fluxo OAuth).
