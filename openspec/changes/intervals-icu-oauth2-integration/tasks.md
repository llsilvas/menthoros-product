# Tasks: intervals-icu-oauth2-integration

**Tamanho:** S · **Trilha:** Full
**Tasks totais:** 17 (+2 apos revisao Staff Engineer 2026-08-02)

## Bloco 1 — Config e Properties (2 tasks)

- [ ] 1.1 Criar `IntervalsIcuProperties` (`@ConfigurationProperties(prefix = "app.intervals-icu")`)
  com campos: clientId, clientSecret, redirectUri, authorizationUri, tokenUri, apiBaseUrl
- [ ] 1.2 Adicionar config no `application.yml` e `application-test.yml`

## Bloco 2 — OAuth Service (6 tasks)

- [ ] 2.1 Criar interface `IntervalsIcuOAuthService` com metodos:
  `getAuthorizationUrl(UUID atletaId)`, `findAtletaForCallback(UUID atletaId)`,
  `exchangeCodeForToken(String code, Atleta atleta)`, `getStatus(UUID atletaId)`,
  `disconnect(UUID atletaId)`
- [ ] 2.2 Implementar `getAuthorizationUrl` — monta URL com client_id, redirect_uri,
  response_type=code, scope, state=atletaId. Tenant-aware: valida que atleta pertence
  ao tenant do coach logado.
- [ ] 2.3 Implementar `findAtletaForCallback(UUID atletaId)` — query sem tenant filter
  (callback nao tem JWT, nao tem TenantContext). Usa `AtletaRepository.findByIdBasic`
  (mesmo padrao `StravaOAuthServiceImpl.findAtletaForCallback`).
- [ ] 2.4 Implementar `exchangeCodeForToken`:
  - POST para token endpoint (client_id, client_secret, code, grant_type=authorization_code, redirect_uri)
  - Parsear resposta: access_token, refresh_token, expires_in, scope, athlete.id
  - Find-or-create `IntegracaoExterna` por `(atletaId, FonteDados.INTERVALS_ICU)`
  - Popular: accessToken, refreshToken, tokenExpiraEm (Instant.ofEpochSecond), scopes, externalAthleteId
  - Setar tenantId = atleta.getAssessoria().getId()
  - **Hook D5.2:** verificar se Strava ativo para o mesmo atleta+tenant;
    se sim, setar autoSyncPausado=true na integracao Strava (pausa scheduler Strava).
    Monotonico: so seta true, nunca false.
  - Salvar IntegracaoExterna
- [ ] 2.5 Implementar `getStatus` — retorna Map com connected, externalAthleteId,
  ultimaSincronizacao (sem expor token)
- [ ] 2.6 Implementar `disconnect` — soft-delete: ativo=false, accessToken=null,
  refreshToken=null, scopes=null, tokenExpiraEm=null

## Bloco 3 — Auth Controller (3 tasks)

- [ ] 3.1 Criar `IntervalsIcuAuthController` (`@RequestMapping("/api/v1/intervals-icu/auth")`):
  `GET /authorize?atletaId=`, `GET /authorize/url/{atletaId}`, `GET /callback`,
  `GET /status/{atletaId}`, `DELETE /disconnect/{atletaId}`.
  Callback: parse state UUID → findAtletaForCallback → exchangeCodeForToken →
  redirectToFrontend(?intervals-icu=success|error)
- [ ] 3.2 Seguranca: adicionar `List<String> intervalsIcuPaths` em `CoreSecurityProperties`
  com default `List.of("/api/v1/intervals-icu/auth/callback")`. Adicionar
  `.requestMatchers(securityProperties.getIntervalsIcuPaths()...).permitAll()`
  no `CoreSecurityConfig`. NAO renomear stravaPaths (minimo diff).
- [ ] 3.3 Redirect para frontend com query param `?intervals-icu=success|error`
  (mesmo padrao `redirectToFrontend` do `StravaAuthController`)

## Bloco 4 — Testes (4 tasks)

- [ ] 4.1 Teste unitario: `IntervalsIcuOAuthServiceImpl` — mock do WebClient,
  verificar montagem de URL, troca de token, merge com registro existente,
  hook D5.2 (auto-pausa Strava)
- [ ] 4.2 Teste de integracao: `IntervalsIcuAuthController` — fluxo completo
  (auth URL → callback → status → disconnect)
- [ ] 4.3 Teste de seguranca: callback sem autenticacao (publico) — 302 redirect
- [ ] 4.4 Teste de multi-tenancy: atleta de outro tenant — 404/403

## Bloco 5 — Documentacao (2 tasks)

- [ ] 5.1 Atualizar `Integrations.md` no vault com status "OAuth2 implementado"
- [ ] 5.2 Validar fluxo OAuth2 manualmente contra o app real do intervals.icu:
  - Confirmar endpoints reais (authorization-uri, token-uri)
  - Confirmar escopos disponiveis
  - Confirmar se prove refresh_token
  - Testar com redirect URI de dev `http://localhost:8099/api/v1/intervals-icu/auth/callback`
