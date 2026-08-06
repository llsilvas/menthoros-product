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

- [ ] 0.1 **Fotografar os atributos de realm dos dois alvos** (HomeLab e Railway) pela Admin API,
      antes de declarar qualquer um no arquivo. O `menthoros-realm.json` hoje só declara `realm` e
      `enabled`; o primeiro atributo versionado abre a porta para o sync igualar, sem querer, algo
      que hoje diverge entre os ambientes.
      *verify:* JSON dos atributos de realm salvo por ambiente, com o diff entre eles registrado.
- [ ] 0.2 **Confirmar a premissa central no navegador**: que a renovação por refresh token não usa
      iframe nem cookie. Basta observar uma renovação hoje forçada via `signinSilent()` no console,
      com o painel de rede aberto.
      *verify:* um `POST` ao endpoint de token, sem requisição de `document` e sem iframe no DOM.
      **Se aparecer iframe, PARE** — a premissa da change está errada e o design muda.
- [ ] 0.3 **Decidir Q2:** ligar rotação invalida as sessões ativas no momento do sync? Irrelevante em
      dev, mas registrar o comportamento observado.

## 1. Realm — rotação de refresh token (`menthoros-infra`)

- [ ] 1.1 Declarar no `menthoros-realm.json`, como propriedades de topo do `RealmRepresentation`:
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
- [ ] 1.2 PR no `menthoros-infra`, revisado antes de qualquer sync.
- [ ] 1.3 `sync-realm.sh` no **HomeLab** e confirmação pela Admin API.
      *verify:* `revokeRefreshToken: true` no realm do HomeLab.
- [ ] 1.4 **CA4:** exercitar o replay — renovar uma vez, guardar o refresh token antigo, renovar de
      novo, e reapresentar o antigo.
      *verify:* o Keycloak recusa **e** a sessão é invalidada. Recusar sem invalidar não cumpre o CA4.
- [ ] 1.5 Repetir 1.3 e 1.4 no **Railway `develop`**.

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

- [ ] 3.1 **CA1:** sessão aberta por mais de 5 minutos com o painel de rede aberto.
      *verify:* `POST` ao endpoint de token no momento da renovação **e nenhum** request de
      `document`; histórico sem entrada nova; estado de componente e scroll preservados.
- [ ] 3.2 **CA2:** nenhuma requisição do app toma `401` durante o intervalo de renovação.
- [ ] 3.3 **CA3:** encerrar a sessão no Keycloak pelo console e esperar a próxima renovação.
      *verify:* app cai no login **uma vez**, sem laço de redirect.
- [ ] 3.4 **CA6:** repetir 3.1 em **Safari e Firefox**. É onde o iframe falharia — se falhar aqui, a
      premissa da change está errada.
- [ ] 3.5 **Métrica:** sessão de 30 minutos de uso contínuo com **zero** recarregamentos não
      solicitados. Hoje seriam ~7.

## 4. Fechamento

- [ ] 4.1 Registrar no `SPRINTS.md`.
- [ ] 4.2 Responder Q1 no proposal: o redirect ao abrir aba nova incomoda o suficiente para
      justificar persistir token? Só decidir **depois** de conviver com a mudança.
