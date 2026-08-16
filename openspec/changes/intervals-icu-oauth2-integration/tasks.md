# Tasks: intervals-icu-oauth2-integration

**Tamanho:** M · **Trilha:** Full
**Tasks totais:** 23 · **Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front`
**Revisado:** 2026-08-16 — reescrito após verificação do contrato real da API e das decisões do
founder (atleta self-service, remoção da API key, scheduler em change própria).

> **Ordem de deploy é parte da entrega:** backend e front vão juntos. Sem o botão do front,
> os atletas cujas API keys pararam de funcionar não têm como reconectar. Ver "Riscos" no proposal.

## Bloco 0 — Configuração do app 663 (3 tasks, self-service)

> **Verificado em 2026-08-16 na tela do app:** não há gate externo. O card diz
> *"You can send anyone to the oauth consent page but the app is not listed in /settings/apps"* —
> o app já funciona para OAuth. O e-mail para o David serve para **listar publicamente**, não para
> implementar nem testar. A configuração abaixo é toda editável na própria tela.

- [ ] 0.1 **Registrar as redirect URLs** — o campo está **vazio** hoje, e o provedor não aceita
  wildcard. Registrar as duas, para que a troca de domínio planejada não quebre o OAuth:
  - `https://menthoros.up.railway.app/api/v1/integracoes/intervals-icu/callback`
  - `https://api.menthoros.com/api/v1/integracoes/intervals-icu/callback` (DNS previsto no `PROJECT.md`)
- [ ] 0.2 **Confirmar empiricamente se `http://localhost/*` cobre a porta.** A nota da tela diz que
  localhost é sempre permitido, mas o dev roda em `localhost:**8099**`. Se a porta não entrar no
  wildcard, o fluxo local falha e o sintoma parece bug de código, não de configuração. Se não
  cobrir, registrar a URI de dev explicitamente.
- [ ] 0.3 **Corrigir Site e Política de Privacidade**, hoje `https://www.example.com` e
  `https://www.example.com/privacy`. As duas URLs aparecem **na tela de consentimento que o atleta
  vê**: autorizar o "Menthoros" e ler `example.com` destrói a confiança no momento exato em que ela
  é pedida, e a política de privacidade é requisito de LGPD. O texto real já existe no front
  (`politicaPrivacidadeConteudo.ts`) — falta uma URL pública que o aponte.

## Bloco 1 — Config e Properties (2 tasks)

- [ ] 1.1 Estender `IntervalsIcuProperties` (hoje só tem `baseUrl`) com `clientId`, `clientSecret`,
  `redirectUri`, `authorizationUri`, `tokenUri`, `scope`
- [ ] 1.2 Adicionar as propriedades em `application.yml` (defaults do proposal, secret via env var)
  e em `src/test/resources/application-test.yml` com valores fake

## Bloco 2 — Client: Basic → Bearer (2 tasks)

- [ ] 2.1 `IntervalsIcuClientImpl`: trocar `headers.setBasicAuth("API_KEY", apiKey)` por
  `headers.setBearerAuth(token)` (linha 148) e renomear o parâmetro `apiKey` → `token` nas
  assinaturas de `IntervalsIcuClient` + impl. **Nenhum dos 6 call sites muda** — todos já passam
  `conexao.getAccessToken()`. Renomear `validarApiKey` → `validarToken`.
- [ ] 2.2 Novo método `revogarAcesso(String token)` no client:
  `DELETE /api/v1/disconnect-app` com Bearer. Falha é logada, não propagada (best-effort).

## Bloco 3 — State assinado (2 tasks)

- [ ] 3.1 Helper `IntervalsIcuStateSigner` (`services/helper`): `assinar(UUID atletaId)` →
  `<atletaId>.<epochSeconds>.<HMAC-SHA256 base64url>` usando o `clientSecret` como chave;
  `validar(String state)` → `Optional<UUID>`, rejeitando assinatura inválida ou idade > 10 min.
  Comparação de MAC em tempo constante (`MessageDigest.isEqual`).
- [ ] 3.2 Teste unitário do signer: round-trip feliz, assinatura adulterada, state expirado,
  formato malformado, `atletaId` não-UUID. Nenhum desses caminhos pode lançar para fora.

## Bloco 4 — OAuth Service (4 tasks)

- [ ] 4.1 Interface `IntervalsIcuOAuthService`: `getAuthorizationUrl()`,
  `exchangeCodeForToken(String code, String state)`, `revogarEDesconectar(UUID atletaId)`
- [ ] 4.2 `getAuthorizationUrl` — resolve o atleta via `atletaProgressService.resolverAtletaIdAtual()`,
  monta a URL com `client_id`, `redirect_uri`, `scope`, `state` assinado. Tenant-aware via
  `TenantContext`.
- [ ] 4.3 `exchangeCodeForToken` — valida o state, resolve o `Atleta` **sem** filtro de tenant
  (o callback não tem JWT; mesmo padrão de `StravaOAuthServiceImpl.findAtletaForCallback`),
  `POST` no `tokenUri` com `client_id`/`client_secret`/`code`, parseia
  `access_token`/`scope`/`athlete.id`, faz find-or-create de `IntegracaoExterna` por
  `(atletaId, INTERVALS_ICU)`, popula `accessToken`/`scopes`/`externalAthleteId`/`ativo=true`/
  `lastSyncError=null`, seta `tenantId = atleta.getAssessoria().getId()`, e reaproveita o hook D5.2
  (pausa Strava). **JavaDoc obrigatória** explicando por que `refreshToken` e `tokenExpiraEm` ficam
  `null` — o provedor não emite nenhum dos dois, e a próxima pessoa vai querer "consertar".
- [ ] 4.4 `revogarEDesconectar` — chama `client.revogarAcesso(token)` (best-effort) e então o
  soft-disconnect já existente em `IntervalsIcuConnectionServiceImpl.desconectar`

## Bloco 5 — Controller e Security (3 tasks)

- [ ] 5.1 Em `IntervalsIcuConnectionController` (`/api/v1/integracoes/me/intervals-icu`):
  **remover** o `POST` de conexão por API key; **adicionar** `GET /authorize-url`
  (`ROLE_ATLETA`/`ADMIN`, devolve DTO tipado — não `Map`); manter `GET` de status;
  `DELETE` passa a chamar `revogarEDesconectar`
- [ ] 5.2 Novo controller público para o callback em `/api/v1/integracoes/intervals-icu/callback`
  (fora do `me/`, que exige JWT): `GET ?code=&state=&error=` → redirect 302 para o front com
  `?intervals-icu=success|error`. Sem `@PreAuthorize`, com comentário explicando (padrão
  `StravaAuthController.callback`)
- [ ] 5.3 `CoreSecurityProperties`: nova lista `intervalsIcuPaths` (default
  `List.of("/api/v1/integracoes/intervals-icu/callback")`) + `permitAll` no `CoreSecurityConfig`
  (linha 45 é o precedente). **Não** renomear `stravaPaths`

## Bloco 6 — Remoção do fluxo de API key (2 tasks)

- [ ] 6.1 Apagar `IntervalsIcuConnectInputDto` e `IntervalsIcuConnectionService.conectar`
  + impl + seus testes. `status`/`desconectar` permanecem.
- [ ] 6.2 `grep -rn "apiKey\|API_KEY" src/main/java | grep -i intervals` deve voltar vazio
  (fora de comentários históricos). O termo no domínio passa a ser `token`.

## Bloco 7 — Testes backend (5 tasks)

- [ ] 7.1 `IntervalsIcuOAuthServiceImpl` unit: montagem da URL de autorização, troca de code,
  merge com registro existente, hook D5.2, `refreshToken`/`tokenExpiraEm` nulos, state inválido
  não persiste nada
- [ ] 7.2 `IntervalsIcuClientImpl`: header é `Bearer` em todas as operações (não Basic);
  `revogarAcesso` não propaga falha
- [ ] 7.3 `@WebMvcTest` do controller `/me`: `authorize-url` 200 com `ROLE_ATLETA`, 403 com
  `ROLE_TECNICO`, `DELETE` 204
- [ ] 7.4 `*IT` do callback público: sucesso, `?error=`, state adulterado, state expirado —
  todos com redirect e sem vazar token na URL. Autenticação via `jwt()` post-processor onde
  houver JWT (**nunca** `@WithMockUser` — ver CLAUDE.md do backend)
- [ ] 7.5 Multi-tenancy: `tenantId` persistido vem do atleta resolvido pelo state, não do request

## Bloco 8 — Frontend (3 tasks)

- [ ] 8.1 `IntervalsIcuConnectionCard.tsx`: remover o `TextField` de API key e o link para
  `/settings`; botão "Conectar com intervals.icu" que busca `authorize-url` e redireciona
- [ ] 8.2 `useIntervalsIcuConnection`: `connect()` sem parâmetro, passa a buscar a URL e navegar;
  regenerar o client da API (`IntervalsIcuService`)
- [ ] 8.3 Tratar o retorno `?intervals-icu=success|error` na tela de perfil do atleta
  (feedback visual + refresh do status), com teste

## Bloco 9 — Validação e documentação (3 tasks)

- [ ] 9.1 `./mvnw clean verify` no backend (não só `test` — há `*IT` nesta change) e
  lint + testes + build no front
- [ ] 9.2 Smoke real contra o app 663: conectar → **push de um treino planejado** (valida
  `CALENDAR:WRITE`) → **import de uma atividade** (valida `ACTIVITY:READ`) → desconectar e
  confirmar a revogação no intervals.icu. Um escopo faltando só aparece aqui.
- [ ] 9.3 Atualizar `Integrations.md` no vault e registrar em
  `intervals-icu-activity-sync-scheduler/proposal.md` que `listarAtividades` nasce com Bearer
  (o item 1 do "What Changes" de lá ainda diz "Basic Auth com a API key do atleta")
