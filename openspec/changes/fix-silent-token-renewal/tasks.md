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

- [ ] 1.1 Declarar no `menthoros-realm.json`: `revokeRefreshToken: true` e `refreshTokenMaxReuse: 0`.
      ⚠️ Declarar **apenas** esses dois atributos de realm. Cada atributo a mais é uma configuração
      viva que o sync passa a sobrescrever (ver 0.1).
      *verify:* diff do arquivo com exatamente duas linhas de atributo novas.
- [ ] 1.2 PR no `menthoros-infra`, revisado antes de qualquer sync.
- [ ] 1.3 `sync-realm.sh` no **HomeLab** e confirmação pela Admin API.
      *verify:* `revokeRefreshToken: true` no realm do HomeLab.
- [ ] 1.4 **CA4:** exercitar o replay — renovar uma vez, guardar o refresh token antigo, renovar de
      novo, e reapresentar o antigo.
      *verify:* o Keycloak recusa **e** a sessão é invalidada. Recusar sem invalidar não cumpre o CA4.
- [ ] 1.5 Repetir 1.3 e 1.4 no **Railway `develop`**.

## 2. Frontend — renovação silenciosa (`menthoros-front`)

> Só depois da seção 1 aplicada nos dois alvos.

- [ ] 2.1 **TDD:** teste que falha hoje — ao disparar `accessTokenExpiring`, o app **não** deve
      chamar `signinRedirect`. Hoje chama; é o teste que descreve o defeito.
      *verify:* teste vermelho antes da mudança.
- [ ] 2.2 `automaticSilentRenew: true` no `oidcConfig.ts`, **substituindo o comentário que justifica
      o `false`** — ele está correto sobre iframe e errado sobre refresh token, e deixá-lo lá faria a
      próxima pessoa reverter isto por engano. Explicar os três mecanismos, não só o escolhido.
- [ ] 2.3 No `AuthProvider.tsx`, o `aoExpirar` **deixa de chamar `signinRedirect`**.
      ⚠️ Se ficar, os dois disparam no mesmo evento e a piscada continua — a mudança de config
      sozinha não resolve.
      `definirRenovacaoPendente` passa a receber a promessa da renovação silenciosa, mantendo o
      comportamento do `session.ts` de segurar requisições durante a renovação.
- [ ] 2.4 Manter o **fallback**: falha na renovação silenciosa leva ao login por redirect, uma vez,
      sem laço. O `catch` atual já faz — garantir que continua coberto por teste.
- [ ] 2.5 **CA5:** teste de que `localStorage` segue sem access token e sem refresh token.
- [ ] 2.6 Gate do stack: `npm run lint && npm run build && npm run test:run`.

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
