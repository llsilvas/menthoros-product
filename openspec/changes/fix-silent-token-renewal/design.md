# Design — fix-silent-token-renewal

**Criado:** 2026-08-06 · **Trilha:** Full

## Os três mecanismos de renovação, e por que só um serve

| Mecanismo | Como renova | Cross-site |
|---|---|---|
| **Redirect** (hoje) | navega até o IdP e volta | funciona — e é o que causa a piscada |
| **Iframe** (`prompt=none`) | iframe oculto ao `/auth`, apoiado no cookie de sessão do Keycloak | **quebra** — cookie third-party, bloqueado em Safari/Firefox |
| **Refresh token** (alvo) | `POST /token` com `grant_type=refresh_token` | **funciona** — não usa cookie |

A decisão original avaliou os dois primeiros e escolheu o redirect. O terceiro não foi considerado —
e é o único que resolve sem efeito colateral, porque **não depende de cookie nenhum**. O bloqueio de
Safari e Firefox é sobre cookies de terceiros, não sobre XHR com token no corpo.

## Decisão 1 — Deixar a biblioteca renovar

`automaticSilentRenew: true`. O `_silentRenewService` do `oidc-client-ts` escuta `accessTokenExpiring`
e chama `signinSilent()`, que usa o refresh token quando existe — verificado no código instalado
(3.5.0):

```js
if (!args.forceIframeAuth && user?.refresh_token) {
  logger.debug("using refresh token");
  return await this._useRefreshToken({ ... });
}
```

**Quem renova é a biblioteca, e só ela.** O `SilentRenewService` interno se inscreve em
`accessTokenExpiring` e chama `signinSilent()` sozinho. O app **não intercepta** essa chamada.

⚠️ **Correção de 2026-08-06, após o gate de DoR — a versão anterior deste documento estava errada e
teria virado bug de produção.** Ela dizia que `definirRenovacaoPendente` "passa a receber a promessa
do `signinSilent`", o que implica o `AuthProvider` chamar `signinSilent` também. Seriam **duas
renovações concorrentes no mesmo evento** — e com a rotação que esta própria change liga
(`refreshTokenMaxReuse: 0`), a segunda reapresenta um refresh token já rotacionado pela primeira. O
Keycloak trata como replay e derruba a sessão. O CA4, que existe para provar proteção contra ataque,
dispararia em **toda renovação normal**. Os dois revisores do DoR apontaram isso independentemente.

### O ponto de integração correto: três eventos, nenhuma chamada

O app deixa de **chamar** a renovação e passa a **observá-la**:

| Evento | O que o app faz |
|---|---|
| `addAccessTokenExpiring` | cria um *deferred* e o registra em `definirRenovacaoPendente` |
| `addUserLoaded` | resolve o deferred e limpa o pendente — renovação concluída |
| `addSilentRenewError` | limpa o pendente **e** dispara o fallback de login |

É isso que reconstrói o contrato do `session.ts` sem chamar a lib duas vezes. O `getAccessToken()`
aguarda `renovacaoPendente` antes de devolver o token (`session.ts:72`), e esse comportamento
**precisa continuar valendo** — sem ele, uma requisição disparada durante a renovação sai com o token
velho e toma `401`, exatamente o que a folga de 60s existe para evitar.

**`addSilentRenewError` é a peça que faltava.** O `catch` de hoje está pendurado no `signinRedirect`
manual do `aoExpirar`; erro da renovação automática é publicado por `_raiseSilentRenewError` e **não
passa por aquele `catch`**. Dizer que "o `catch` atual já faz" — como a versão anterior dizia —
deixaria o CA3 sem implementação nenhuma.

### A condição que o `signinSilent` impõe

O caminho de refresh token é **condicional**: sem `user.refresh_token`, a lib cai no **iframe** — o
caminho que esta change existe para evitar — e este ainda exige `silent_redirect_uri`, lançando se
não houver.

Como o `userStore` é em memória, "sem refresh token" não é hipótese remota: é o estado normal de toda
aba nova e de todo reload.

**Proteção implementável:** **não** configurar `silent_redirect_uri`. Sem ele a tentativa de iframe
falha explicitamente, em vez de abrir um iframe que morreria em silêncio cross-site — e a falha cai
no `addSilentRenewError`, que leva ao fallback. Falhar alto é o comportamento desejado aqui.

### O que esta change NÃO resolve

**O reload (F5) continua navegando.** Sem token em memória, o bootstrap faz
`signinRedirect({ prompt: 'none' })` (`AuthProvider.tsx:92-110`) para perguntar ao Keycloak se ainda
há sessão. Isso é por design e independe desta change.

A distinção importa para não prometer o que não se entrega: some a piscada **periódica**, a cada ~4
minutos, que é a que interrompe o treinador no meio do trabalho. A do reload continua, uma vez, e só
quando ele mesmo recarrega.

## Decisão 2 — Rotação é parte da mesma entrega

`revokeRefreshToken: true` + `refreshTokenMaxReuse: 0`.

Sem isso, um refresh token vazado vale até o fim do `ssoSessionMaxLifespan` — hoje **10 horas**. Com
rotação, cada renovação invalida a anterior, e reapresentar a antiga é tratado como replay: o
Keycloak derruba a sessão.

**Por que as duas coisas andam juntas:** o item de frontend aumenta o valor do que está na memória do
navegador; o item de realm limita a janela em que esse valor serve para alguma coisa. Mergear só o
primeiro é entregar o risco sem a mitigação — **a ordem é realm primeiro, frontend depois.**

## Decisão 3 — O redirect continua existindo, como fallback

Renovação silenciosa falha em casos legítimos: refresh expirado, sessão encerrada no Keycloak, logout
em outra aba. O caminho tem de terminar no login por redirect, **uma vez, sem laço**.

O `catch` atual já faz isso (`aplicarUsuario(null)` e o guard leva ao login) e continua valendo —
mas passa a ser exercitado de verdade, não só em teste (CA3). Era esse o medo que motivou o redirect
permanente; a resposta não é evitar o silencioso, é garantir que a falha dele seja visível.

## O que não muda

- **`userStore` em memória.** Nenhum token vai para `localStorage` ou `sessionStorage`. O refresh
  token vive onde o access token já vivia.
- **`stateStore` em `sessionStorage`.** Guarda `code_verifier` e `state`, não token.
- **`scope: 'openid profile email organization'`.** O `organization` é optional no `menthoros-web` e
  pedir é o correto ali — ver `disable-ropc-direct-grant` para o caso do `menthoros-test`, onde é o
  oposto.
- **`monitorSession: false`.**

## Armadilha conhecida do realm

O `menthoros-realm.json` declara hoje apenas `realm` e `enabled` no nível de realm. `revokeRefreshToken`
será **o primeiro atributo de realm versionado**, e o `sync-realm.sh` aplica o arquivo sem cerimônia:
o que estiver declarado passa a valer, o que não estiver fica como está no servidor.

O risco não é o atributo que se quer mudar — é declarar junto, por descuido, algum que hoje diverge
entre HomeLab e Railway e igualá-los sem querer. Daí a task de fotografar os dois antes.

É a mesma lição que a `disable-ropc-direct-grant` aprendeu com clients, agora um nível acima. E
reforça a pendência já registrada: **client scopes e atributos de realm deveriam estar versionados** —
o arquivo gerencia menos do que o nome sugere.

## Rollback

| Falha | Reversão |
|---|---|
| Renovação silenciosa não funciona em algum navegador | `automaticSilentRenew: false` e devolver o `signinRedirect` ao `aoExpirar`. Volta a piscar, volta a funcionar. |
| Rotação derrubando sessões indevidamente | `revokeRefreshToken: false` + sync. Independente do frontend. |

As duas são reversíveis separadamente — de propósito, porque as causas são diferentes.
