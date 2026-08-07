# Tasks — fix-silent-token-renewal (S · Full · front + infra)

> Dois repos: `menthoros-front` (renovação) e `menthoros-infra` (rotação no realm).
>
> ⚠️ **Ordem entre repos não é negociável: realm primeiro, frontend depois.** O frontend aumenta o
> valor do refresh token na memória do navegador; a rotação limita a janela em que ele serve. Mergear
> o frontend antes é entregar o risco sem a mitigação.
>
> Validação: navegador real, painel de rede aberto. Não há teste automatizado que prove ausência de
> navegação.

## 0. Levantamento

- [x] 0.1 **FEITO em 2026-08-06 — 103 atributos de realm comparados, ZERO divergentes.**
      Declarar os dois atributos no arquivo não corre risco de igualar nada sem querer, porque já
      não há nada divergente. Estado relevante hoje, idêntico nos dois: `revokeRefreshToken: false`,
      `refreshTokenMaxReuse: 0`, `accessTokenLifespan: 300`, `ssoSessionIdleTimeout: 1800`,
      `ssoSessionMaxLifespan: 36000`.
      ⚠️ Mesma ressalva da `disable-ropc-direct-grant`: a identidade entre os alvos é em parte
      artefato do espelhamento do `keycloak-db`. Vale para hoje.
      **Fotografar os atributos de realm dos dois alvos** (HomeLab e Railway) pela Admin API,
      antes de declarar qualquer um no arquivo. O `menthoros-realm.json` hoje só declara `realm` e
      `enabled`; o primeiro atributo versionado abre a porta para o sync igualar, sem querer, algo
      que hoje diverge entre os ambientes.
      *verify:* JSON dos atributos de realm salvo por ambiente, com o diff entre eles registrado.
- [x] 0.2 **CONFIRMADA em 2026-08-06, no protocolo, nos dois alvos.** `grant_type=refresh_token`
      contra o `menthoros-web`: access token novo emitido, sem iframe e sem cookie envolvidos — é
      um POST simples. **A premissa central da change se sustenta.**
      📌 **Medição do "antes" para o CA4, e ela é pior do que a spec assumia:** o Keycloak **já
      emite um refresh token novo** a cada renovação, mas **o antigo continua sendo aceito**. Ou
      seja, hoje há rotação de *valor* sem revogação — que é rotação cosmética. Um refresh token
      capturado vale até o fim da sessão SSO mesmo depois de o legítimo ter renovado.
      ⚠️ Validado no protocolo, não no navegador; a confirmação visual fica na 3.1/3.4.
      **Confirmar a premissa central no navegador**: que a renovação por refresh token não usa
      iframe nem cookie. Basta observar uma renovação hoje forçada via `signinSilent()` no console,
      com o painel de rede aberto.
      *verify:* um `POST` ao endpoint de token, sem requisição de `document` e sem iframe no DOM.
      **Se aparecer iframe, PARE** — a premissa da change está errada e o design muda.
- [x] 0.3 **Q2 RESPONDIDA na 1.5: ligar a rotação NÃO derruba sessões ativas.** Verificado com
      sessão aberta antes do sync, que renovou normalmente depois. *(Registro original: a observar durante a 1.3, não antes.)* A pergunta (ligar rotação invalida sessões
      ativas?) só é respondível aplicando. Registrado como observação obrigatória no momento do sync
      no HomeLab, não como decisão prévia. Irrelevante em dev; importa quando existir produção.

## 1. Realm — rotação de refresh token (`menthoros-infra`)

- [x] 1.1 **FEITO** — duas propriedades de topo, clients intactos. Declarar no `menthoros-realm.json`, como propriedades de topo do `RealmRepresentation`:
      `revokeRefreshToken: true` e `refreshTokenMaxReuse: 0`.
      ⚠️ Declarar **apenas** esses dois atributos de realm. Cada atributo a mais é uma configuração
      viva que o sync passa a sobrescrever (ver 0.1).
      ⚠️ **"Duas linhas no diff" não significa "duas mudanças no servidor".** O `sync-realm.sh`
      reconcilia o **arquivo inteiro** — clients e roles junto. Hoje isso é inofensivo porque o
      conteúdo de clients já foi aplicado nos dois alvos pela `disable-ropc-direct-grant`, então o
      sync é idempotente ali; mas quem executar precisa saber que está reaplicando tudo, não só o
      atributo novo.
      *verify:* diff do arquivo com exatamente duas linhas novas **e** confirmação, pela Admin API,
      de que nenhum client mudou depois do sync.
- [x] 1.2 **PR `menthoros-infra` #6 mergeado** (`ec664a8`), antes de qualquer sync.
- [x] 1.3 **APLICADO no HomeLab** em 2026-08-06, sync limpo em 3s. `revokeRefreshToken: true` e
      `refreshTokenMaxReuse: 0` confirmados pela Admin API. **Clients conferidos após o sync e
      inalterados** — o alerta da 1.1 (o sync reconcilia o arquivo inteiro) não produziu efeito
      colateral.
- [x] 1.4 **CA4 ✅ CUMPRIDO NA VERSÃO FORTE — HomeLab.**
      ```
      reuso do refresh antigo → invalid_grant: "Maximum allowed refresh token reuse exceeded"
      token novo depois disso → invalid_grant  ← a sessão inteira caiu
      ```
      O proposal tratava a invalidação da sessão como descoberta, não certeza. **Está confirmada:**
      recusa o replay **e** derruba a sessão. Antes desta mudança o token antigo era aceito (0.2).
- [x] 1.5 **Railway `develop` — aplicado e validado**, mesmo resultado do HomeLab: replay recusado
      com `Maximum allowed refresh token reuse exceeded` e sessão invalidada em seguida.
      📌 **Q2 RESPONDIDA (0.3), com experimento desenhado para isso:** abri uma sessão **antes** do
      sync e testei depois — **ela sobreviveu e renovou normalmente**. Ligar a rotação **não derruba
      sessões ativas**; a regra passa a valer da próxima renovação em diante. Importa quando existir
      produção: dá para ligar sem janela de manutenção.

## 2. Frontend — renovação silenciosa (`menthoros-front`)

> Só depois da seção 1 aplicada nos dois alvos.
>
> ⚠️ **O app não chama a renovação — ele a observa.** Com `automaticSilentRenew: true`, quem chama
> `signinSilent()` é o `SilentRenewService` da lib. Uma segunda chamada pelo app produz renovações
> concorrentes e, com a rotação ligada na seção 1, a segunda vira replay e derruba a sessão.

- [ ] 2.1 **TDD:** teste que falha hoje — ao disparar `accessTokenExpiring`, o app **não** deve
      chamar `signinRedirect`. Hoje chama; é o teste que descreve o defeito.
      *verify:* teste vermelho antes da mudança.
- [ ] 2.2 **Atualizar `oidcConfig.test.ts:28-30`**, que hoje afirma `automaticSilentRenew === false`
      com o comentário "a renovação é por redirect". Ele **vai quebrar** — e reescrever o teste é
      parte da mudança, não conserto de fricção: o novo deve afirmar `true` e explicar por que o
      refresh token não é o caso que o iframe quebrava.
- [ ] 2.3 `automaticSilentRenew: true` no `oidcConfig.ts`, **substituindo o comentário que justifica
      o `false`** — ele está correto sobre iframe e errado sobre refresh token, e deixá-lo lá faria a
      próxima pessoa reverter isto por engano. Explicar os três mecanismos, não só o escolhido.
- [ ] 2.4 **NÃO configurar `silent_redirect_uri`.** Sem refresh token em memória a lib tenta o
      iframe; sem essa URL ela falha explicitamente em vez de abrir um iframe que morreria calado
      cross-site. Falhar alto é o desejado — a falha vira `addSilentRenewError` e cai no fallback.
      *verify:* teste afirmando que `silent_redirect_uri` está ausente, com o porquê no comentário.
- [ ] 2.5 **Reescrever a renovação pendente no `AuthProvider.tsx` como deferred, sem chamar a lib:**
      - `addAccessTokenExpiring` → cria o deferred e registra em `definirRenovacaoPendente`
      - `addUserLoaded` → resolve e limpa o pendente
      - `addSilentRenewError` → limpa o pendente **e** dispara o fallback
      O `aoExpirar` **deixa de chamar `signinRedirect`**. Se ficar, a piscada continua — mudar a
      config sozinha não resolve.
      *verify:* teste de que `getAccessToken()` aguarda a renovação em curso e devolve o token novo,
      não o velho (é o contrato de `session.ts:64-75`).
- [ ] 2.6 **Fallback via `addSilentRenewError`** — login por redirect, uma vez, sem laço.
      ⚠️ O `catch` atual está no `signinRedirect` manual e **não** captura erro da renovação
      automática (publicado por `_raiseSilentRenewError`). Sem assinar este evento, o CA3 fica sem
      implementação.
- [ ] 2.7 **CA5:** teste de que `localStorage` segue sem access token e sem refresh token.
- [ ] 2.8 Gate do stack: `npm run lint && npm run build && npm run test:run`.

## 3. Validação no navegador (P0 — nenhum teste automatizado prova ausência de navegação)

- [x] 3.1 **CA1 ✅ VERIFICADO no navegador em 2026-08-06.** Sessão de 351s (além dos 300s de vida do
      token), `performance.getEntriesByType('navigation').length === 1`, `history` inalterado
      (26→26), título, variável de módulo e estado JS preservados, URL intacta em `#/coach/inbox`.
      **Zero `REFRESH_TOKEN_ERROR` no Keycloak na janela** — antes, cada ciclo produzia um.
      **CA1:** sessão aberta por mais de 5 minutos com o painel de rede aberto.
      *verify:* `POST` ao endpoint de token no momento da renovação **e nenhum** request de
      `document`; histórico sem entrada nova; estado de componente e scroll preservados.
- [x] 3.2 **CA2 ✅ VERIFICADO em 2026-08-06, com o backend no ar.** 54 chamadas ao backend ao longo
      de ~400s — além dos 300s de vida do token, portanto atravessando pelo menos uma renovação —
      exercitando o **shell do coach**: `users/me`, `coach/attention-queue`, `coach/planos/revisao`,
      `coach/dashboard`, `coach/atletas`.
      ```
      401: nenhum
      200: todas, inclusive as posteriores à janela de renovação
      404: apenas strava/sync-status de atletas sem Strava — 404 de domínio, não de auth
      ```
      Página com **uma única navegação** em 556s de vida.
      📌 **Correção de um erro meu:** eu havia afirmado que o inbox do coach era todo mock. Falso — o
      instrumento é que estava cego: `performance.getEntriesByType('resource')` não devolvia os XHR
      desta página. O log de rede mostra o inbox inteiramente ligado ao backend.
      **CA2:** nenhuma requisição do app toma `401` durante o intervalo de renovação.
- [x] 3.3 **CA3 ✅ VERIFICADO, por acidente e de forma mais convincente que o roteiro previa.**
      Nas rodadas em que a renovação falhava de verdade (`Session doesn't have required client`),
      o app caiu para `#/auth/login` **uma vez, sem laço**, e o `console.warn` do
      `addSilentRenewError` registrou a causa. O fallback foi exercitado em falha real, não simulada.
      **CA3:** encerrar a sessão no Keycloak pelo console e esperar a próxima renovação.
      *verify:* app cai no login **uma vez**, sem laço de redirect.
- [ ] 3.4 **CA6 — parcial.** ✅ **Safari verificado pelo CTO em 2026-08-06** (não por mim). É o
      navegador mais restritivo dos dois — o ITP é justamente o mecanismo que quebraria o iframe —,
      então é o sinal mais forte de que a premissa da change se sustenta: a renovação por refresh
      token não depende de cookie e passa onde o iframe morreria.
      ⛔ **Firefox pendente.** Chrome verificado por mim (3.1/3.2).
      **CA6:** repetir 3.1 em **Safari e Firefox**. É onde o iframe falharia — se falhar aqui, a
      premissa da change está errada.
- [ ] 3.5 **Métrica:** sessão de 30 minutos de uso contínuo com **zero** recarregamentos não
      solicitados. Hoje seriam ~7.


## 3b. Achado da validação — bug pré-existente corrigido

- [x] 3b.1 **Troca dupla do código de autorização (`CODE_TO_TOKEN_ERROR`).** O `StrictMode` monta os
      efeitos duas vezes em dev e o `signinCallback()` trocava o mesmo `code` duas vezes; o Keycloak
      trata como replay e **remove a client session**, o que fazia toda renovação seguinte falhar com
      `Session doesn't have required client`.
      **O desenho anterior escondia o defeito:** com renovação por redirect a cada ~4 min, o app
      ganhava sessão nova antes de precisar da antiga. Ao depender do refresh token, a client session
      morta passa a ser a única que existe. **A change não introduziu — revelou.**
      Causalidade provada por experimento: `StrictMode` off → zero ocorrências; on → uma por
      carregamento; com a correção → zero, com `StrictMode` ligado.
      *Correção:* `trocarCodigoUmaVez()` memoiza a **promessa** (não um booleano), para a segunda
      chamada aguardar o mesmo resultado em vez de seguir como se não houvesse sessão.
- [x] 3b.2 **Multi-aba com rotação ligada derruba a renovação.** Duas abas do app na mesma sessão SSO
      fazem `prompt=none` independentes; a client session é recriada e o refresh token da outra aba
      passa a ser recusado com `refresh token issued before the client session started`.
      Confirmado por eliminação: com uma aba só, 351s sem um único erro; com duas, falha em todo ciclo.
      ⚠️ **Consequência para produção, não endereçada aqui:** o coach que abrir o app em duas abas cai
      no login. Precisa de decisão própria — persistir o token entre abas mudaria o modelo de ameaça
      (ver Q1), e desligar a rotação anularia a mitigação da seção 1.

## 4. Fechamento

- [ ] 4.1 Registrar no `SPRINTS.md`.
- [ ] 4.2 Responder Q1 no proposal: o redirect ao abrir aba nova incomoda o suficiente para
      justificar persistir token? Só decidir **depois** de conviver com a mudança.
