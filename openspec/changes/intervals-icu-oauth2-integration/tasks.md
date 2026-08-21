# Tasks: intervals-icu-oauth2-integration

**Tamanho:** M · **Trilha:** Full
**Tasks totais:** 29 · **Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front`
**Revisado:** 2026-08-16 — reescrito após verificação do contrato real da API e das decisões do
founder (atleta self-service, remoção da API key, scheduler em change própria).
**Revisado:** 2026-08-21 — gate de DoR (`spec-reviewer` + Codex adversarial). Codex reprovou com 2
blockers e 4 majors, todos confirmados no código. Emendas marcadas `[DoR 2026-08-21]`:
+0.4 (rotacionar webhook secret exposto), +1.3 (fail-fast das properties), Bloco 6 fundido no
Bloco 2 com a remoção **antes** da troca Basic→Bearer, +4.3b (guard de `externalAthleteId`
duplicado no callback), 4.4 estendida (disconnect limpa todos os campos OAuth), 5.1 sem `ADMIN`,
5.2 sempre redireciona, +7.6 e +7.7.

> **Ordem de deploy é parte da entrega:** backend e front vão juntos. Sem o botão do front,
> os atletas cujas API keys pararam de funcionar não têm como reconectar. Ver "Riscos" no proposal.

## Bloco 0 — Configuração do app 663 (4 tasks, self-service)

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
- [ ] 0.3 **Corrigir Site, Política de Privacidade e Descrição** — os três vieram com o texto de
  exemplo do provedor e aparecem **na tela de consentimento que o atleta vê**. Autorizar o
  "Menthoros" e ler `example.com` destrói a confiança no momento exato em que ela é pedida; a
  política de privacidade é requisito de LGPD. Valores confirmados em 2026-08-21
  (`menthoros.com` responde 200; domínios conferidos no `PROJECT.md`):
  - **Site:** `https://menthoros.com`
  - **Política de Privacidade:** `https://menthoros.com/#/privacidade` — o front usa
    `createHashRouter`, então a URL **precisa** do `#`; sem ele o servidor não resolve a rota
    (ver "Routing Standards" no `CLAUDE.md` do front). Conteúdo já existe em
    `politicaPrivacidadeConteudo.ts`.
  - **Descrição:** trocar `Double your FTP in 3 months or your money back!` (texto de exemplo do
    provedor). Além de não ser do Menthoros, é uma **promessa comercial com garantia de reembolso**
    exibida dentro de um consentimento — não assinar isso sem uma política de reembolso real.
    A descrição deve dizer ao atleta o que os escopos pedidos realmente fazem:
    > Plataforma de treinamento de corrida com seu treinador no comando: a IA propõe, o treinador
    > aprova. O Menthoros lê seus treinos realizados no Intervals.icu e publica os treinos
    > planejados no seu calendário — e de lá para o seu relógio.
- [ ] 0.4 **[DoR 2026-08-21] Trocar o Webhook Secret do app** (`TF3w-piFpR0` em 2026-08-21) — foi
  exposto em captura de tela durante a especificação. Nenhum webhook está marcado hoje, então ele
  não protege nada e a troca não quebra nada; fazer agora evita herdar um segredo queimado quando a
  change de webhook entrar. Não versionar o valor novo em lugar nenhum.

## Bloco 1 — Config e Properties (3 tasks)

- [x] 1.1 Estender `IntervalsIcuProperties` (hoje só tem `baseUrl`) com `clientId`, `clientSecret`,
  `redirectUri`, `authorizationUri`, `tokenUri`, `scope`
- [x] 1.2 Adicionar as propriedades em `application.yml` (defaults do proposal, secret via env var)
  e em `src/test/resources/application-test.yml` com valores fake
- [x] 1.3 **[DoR 2026-08-21] Fail-fast:** `@Validated` na classe + `@NotBlank` em `clientId`,
  `clientSecret`, `redirectUri`, `authorizationUri`, `tokenUri` e `scope`. **É requisito de
  segurança, não de higiene de config:** o `clientSecret` é a chave do HMAC do state (Bloco 3) e o
  default do `application.yml` é vazio — com chave `""` qualquer um forja um state válido para
  qualquer `atletaId`, e o fluxo *funciona*, silenciosamente inseguro. `StravaProperties` não valida
  nada e não serve de precedente: o state do Strava não é assinado.
  `verify:` subir o contexto com `INTERVALS_ICU_CLIENT_SECRET=` vazio e ver o boot falhar nomeando
  a propriedade (CA11).

## Bloco 2 — Remoção da API key + Client: Basic → Bearer (4 tasks)

> **[DoR 2026-08-21] Bloco 6 foi fundido aqui, e a ordem importa.** Na versão anterior, o Bloco 2
> trocava Basic→Bearer e o `POST` de conexão por API key só morria no Bloco 6. Entre os dois
> commits, o endpoint continuava publicado anunciando um formato que ele próprio já rejeitava —
> um estado intermediário quebrado que passaria no gate de cada bloco isoladamente. **A remoção vem
> antes da troca, no mesmo bloco.**

- [x] 2.0 **[DoR 2026-08-21] Remover primeiro:** apagar `IntervalsIcuConnectInputDto`, o `POST` de
  conexão por key em `IntervalsIcuConnectionController` e `IntervalsIcuConnectionServiceImpl.conectar`
  + impl + testes. `status`/`desconectar` permanecem. (Era a task 6.1.)
- [x] 2.1 `IntervalsIcuClientImpl`: trocar `headers.setBasicAuth("API_KEY", apiKey)` por
  `headers.setBearerAuth(token)` (método `basic()` — localizar por `setBasicAuth("API_KEY"`, não
  por número de linha: era 148 em 2026-08-16 e é 151 hoje) e renomear o parâmetro `apiKey` →
  `token` nas assinaturas de `IntervalsIcuClient` + impl. **Nenhum dos 6 call sites muda de dado ou
  ordem de argumentos** — todos já passam `conexao.getAccessToken()`; o que muda são nomes
  públicos. Renomear `validarApiKey` → `validarToken`.
- [x] 2.2 Novo método `revogarAcesso(String token)` no client:
  `DELETE /api/v1/disconnect-app` com Bearer. Falha é logada, não propagada (best-effort).
- [x] 2.3 `grep -rn "apiKey\|API_KEY" src/main/java | grep -i intervals` volta vazio (fora de
  comentários históricos). O termo no domínio passa a ser `token`. (Era a task 6.2.)

## Bloco 3 — State assinado (2 tasks)

- [x] 3.1 Helper `IntervalsIcuStateSigner` (`services/helper`): `assinar(UUID atletaId)` →
  `<atletaId>.<epochSeconds>.<HMAC-SHA256 base64url>` usando o `clientSecret` como chave;
  `validar(String state)` → `Optional<UUID>`, rejeitando assinatura inválida ou idade > 10 min.
  Comparação de MAC em tempo constante (`MessageDigest.isEqual`).
- [x] 3.2 Teste unitário do signer: round-trip feliz, assinatura adulterada, state expirado,
  formato malformado, `atletaId` não-UUID. Nenhum desses caminhos pode lançar para fora.

## Bloco 4 — OAuth Service (4 tasks)

- [x] 4.1 Interface `IntervalsIcuOAuthService`: `getAuthorizationUrl()`,
  `exchangeCodeForToken(String code, String state)`, `revogarEDesconectar(UUID atletaId)`
- [x] 4.2 `getAuthorizationUrl` — resolve o atleta via `atletaProgressService.resolverAtletaIdAtual()`,
  monta a URL com `client_id`, `redirect_uri`, `scope`, `state` assinado. Tenant-aware via
  `TenantContext`.
- [x] 4.3 `exchangeCodeForToken` — **[DoR 2026-08-21] a ordem dos passos é normativa**, porque em
  JPA uma entidade obtida por `findBy...` é *managed*: mutá-la antes do guard da 4.3b a persiste no
  flush **mesmo sem `save()` explícito**, e CA12 ("nada é persistido") vira falso. Sequência:
  1. valida o state;
  2. resolve o `Atleta` **sem** filtro de tenant (o callback não tem JWT; mesmo padrão de
     `StravaOAuthServiceImpl.findAtletaForCallback`);
  3. `POST` no `tokenUri` com `client_id`/`client_secret`/`code`;
  4. parseia `access_token`/`scope`/`athlete.id`;
  5. **guard da 4.3b** — antes de qualquer busca ou mutação de `IntegracaoExterna`;
  6. só então find-or-create por `(atletaId, INTERVALS_ICU)` e popula
     `accessToken`/`scopes`/`externalAthleteId`/`ativo=true`/`lastSyncError=null`, com
     `tenantId = atleta.getAssessoria().getId()`;
  7. reaproveita o hook D5.2 (pausa Strava).

  **JavaDoc obrigatória** explicando por que `refreshToken` e `tokenExpiraEm` ficam `null` — o
  provedor não emite nenhum dos dois, e a próxima pessoa vai querer "consertar".
- [x] 4.3b **[DoR 2026-08-21] Guard D5.1 dentro de `exchangeCodeForToken`, no passo 5 acima —
  antes de buscar ou mutar a row:** chamar
  `integracaoExternaRepository.findOtherActiveByExternalAthleteIdAndPlataformaAndTenantId(...)`
  — o método **já existe**. Se o `externalAthleteId` recebido já pertence a outro atleta ativo do
  mesmo tenant, **nada é persistido**, emitir `log.error("SECURITY: ...")` no mesmo formato de
  `IntervalsIcuActivityIngestionServiceImpl` e sinalizar erro ao callback.
  **Não confiar no rollback para garantir CA12:** D14 manda o callback nunca lançar, então o
  caminho provável é o service devolver um resultado tipado — e retorno normal **commita** a
  transação. A garantia tem que vir da ordem, não da exceção.
  **Por que aqui e não no import:** hoje a duplicidade só é detectada na ingestão, e o **push**
  (`IntervalsIcuAdapter`) não tem guard nenhum — dois atletas vinculados à mesma conta passariam a
  receber treino planejado no mesmo calendário e no mesmo relógio antes de qualquer import rodar.
  O callback é onde o vínculo nasce.
  `verify:` teste que autoriza o atleta B com o `externalAthleteId` já ativo do atleta A e assere
  que nenhuma row nova fica `ativo=true` (CA12).
- [x] 4.4 `revogarEDesconectar` — chama `client.revogarAcesso(token)` (best-effort) e então o
  soft-disconnect em `IntervalsIcuConnectionServiceImpl.desconectar`.
  **[DoR 2026-08-21] O `desconectar` existente precisa ser estendido:** hoje limpa só `accessToken`
  e `refreshToken` (`IntervalsIcuConnectionServiceImpl.java:151-156`). Passa a limpar também
  `scopes`, `tokenExpiraEm`, `externalAthleteId` e `lastSyncError` — como
  `StravaOAuthServiceImpl.disconnect` já faz para `scopes`/`tokenExpiraEm`. Sem isso CA6 é falso e
  a métrica de sucesso (que conta OAuth por `scopes != null`) passa a contar desconectados como
  conectados.
  `verify:` após o `DELETE`, assertar os seis campos `null` e `ativo=false` (CA6).

## Bloco 5 — Controller e Security (3 tasks)

- [x] 5.1 Em `IntervalsIcuConnectionController` (`/api/v1/integracoes/me/intervals-icu`):
  **adicionar** `GET /authorize-url` (**[DoR 2026-08-21]** apenas `ROLE_ATLETA` — `ADMIN` saiu do
  contrato porque `resolverAtletaIdAtual()` exige `Atleta` vinculado ao `Usuario` e lançaria
  `DomainNotFoundException` para um ADMIN sem vínculo; devolve DTO tipado — não `Map`); manter
  `GET` de status; `DELETE` passa a chamar `revogarEDesconectar`. (A remoção do `POST` foi
  antecipada para a task 2.0.)
- [x] 5.2 Novo controller público para o callback em `/api/v1/integracoes/intervals-icu/callback`
  (fora do `me/`, que exige JWT): `GET ?code=&state=&error=` → redirect 302 para o front com
  `?intervals-icu=success|error`. Sem `@PreAuthorize`, com comentário explicando.
  **[DoR 2026-08-21] NÃO copiar `StravaAuthController.callback` como está:** ele faz
  `UUID.fromString(state)` sem try/catch, então state malformado estoura e o handler global devolve
  erro HTTP — o que viola CA4, que exige redirect. Aqui **todo** caminho de falha (state inválido,
  `code` ausente, provedor fora do ar, exceção inesperada, duplicidade da 4.3b) vira 302 com
  `?intervals-icu=error`; a causa vai para o log, sem token e sem `code` na mensagem (CA10).
  `verify:` `*IT` que cobre os quatro caminhos de falha e assere 302 em todos (CA13).
- [x] 5.3 `CoreSecurityProperties`: nova lista `intervalsIcuPaths` (default
  `List.of("/api/v1/integracoes/intervals-icu/callback")`) + `permitAll` no `CoreSecurityConfig`
  (linha 45 é o precedente). **Não** renomear `stravaPaths`

## Bloco 6 — vazio

> **[DoR 2026-08-21]** As duas tasks deste bloco viraram 2.0 e 2.3. Ver a nota do Bloco 2: a
> remoção da API key precisa acontecer **antes** da troca Basic→Bearer, senão existe um commit
> intermediário em que o `POST` de conexão por key continua publicado rejeitando o próprio formato
> que anuncia. A numeração dos blocos seguintes foi preservada de propósito, para não invalidar as
> referências cruzadas do `design.md` e do `proposal.md`.

## Bloco 7 — Testes backend (7 tasks)

- [x] 7.1 `IntervalsIcuOAuthServiceImpl` unit: montagem da URL de autorização, troca de code,
  merge com registro existente, hook D5.2, `refreshToken`/`tokenExpiraEm` nulos, state inválido
  não persiste nada
- [x] 7.2 `IntervalsIcuClientImpl`: header é `Bearer` em todas as operações (não Basic);
  `revogarAcesso` não propaga falha
- [x] 7.3 `@WebMvcTest` do controller `/me`: `authorize-url` 200 com `ROLE_ATLETA`, 403 com
  `ROLE_TECNICO`, `DELETE` 204
- [x] 7.4 `*IT` do callback público: sucesso, `?error=`, state adulterado, state expirado,
  **[DoR 2026-08-21]** state malformado (não-UUID) e falha do provedor na troca — **todos** com
  redirect 302 e sem vazar token na URL (CA13). Autenticação via `jwt()` post-processor onde
  houver JWT (**nunca** `@WithMockUser` — ver CLAUDE.md do backend)
- [x] 7.5 Multi-tenancy: `tenantId` persistido vem do atleta resolvido pelo state, não do request
- [x] 7.6 **[DoR 2026-08-21]** Boot falha com `client-secret` vazio (CA11). É o teste que impede
  alguém de "simplificar" o `@NotBlank` e reabrir o HMAC de chave vazia.
- [x] 7.7 **[DoR 2026-08-21]** Guard D5.1 no callback (CA12): atleta B autoriza com o
  `externalAthleteId` já ativo do atleta A → nada persistido, log de segurança, redirect com erro.
  E o caso legítimo de reconexão do **próprio** atleta A continua funcionando (o guard filtra por
  `atleta.id <> :atletaId`, então não pode barrar a reconexão).

## Bloco 8 — Frontend (3 tasks)

- [x] 8.1 `IntervalsIcuConnectionCard.tsx`: remover o `TextField` de API key e o link para
  `/settings`; botão "Conectar com intervals.icu" que busca `authorize-url` e redireciona
- [x] 8.2 `useIntervalsIcuConnection`: `connect()` sem parâmetro, passa a buscar a URL e navegar;
  regenerar o client da API (`IntervalsIcuService`)
- [x] 8.3 Tratar o retorno `?intervals-icu=success|error` na tela de perfil do atleta
  (feedback visual + refresh do status), com teste

## Bloco 9 — Validação e documentação (3 tasks)

- [x] 9.1 `./mvnw clean verify` no backend (não só `test` — há `*IT` nesta change) e
  lint + testes + build no front
- [ ] 9.2 Smoke real contra o app 663: conectar → **push de um treino planejado** (valida
  `CALENDAR:WRITE`) → **import de uma atividade** (valida `ACTIVITY:READ`) → desconectar e
  confirmar a revogação no intervals.icu. Um escopo faltando só aparece aqui.
- [ ] 9.3 Atualizar `Integrations.md` no vault e registrar em
  `intervals-icu-activity-sync-scheduler/proposal.md` que `listarAtividades` nasce com Bearer
  (o item 1 do "What Changes" de lá ainda diz "Basic Auth com a API key do atleta")
