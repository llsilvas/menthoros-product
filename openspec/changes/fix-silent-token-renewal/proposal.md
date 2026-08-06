# fix-silent-token-renewal — Renovação de token sem recarregar a página

**Tamanho:** S · **Trilha:** Full
*(Full por dois critérios do `config.yaml`: toca dois repos — `menthoros-front` e `menthoros-infra` —
e mexe em manejo de token, que é risco de segurança.)*
**Status:** proposta
**Criado:** 2026-08-06

> Origem: relato de usabilidade do CTO — "a piscada na tela quando o token expira". Herança direta da
> `migrate-login-to-authorization-code-pkce`.

## Why

**A tela recarrega inteira a cada ~4 minutos.** Verificado em 2026-08-06:

```
accessTokenLifespan                          300s (5 min)
accessTokenExpiringNotificationTimeInSeconds  60s
→ a cada 240s o app faz signinRedirect: descarrega a página, vai ao Keycloak, volta
```

Não é um glitch de renderização. É navegação de verdade, com perda de estado de componente, scroll e
qualquer coisa não persistida — no meio da rotina do treinador, quinze vezes por hora.

## A decisão que gerou isso estava meio certa

O `oidcConfig.ts` desliga o `automaticSilentRenew` com esta justificativa:

> *Todos os ambientes são cross-site, então o cookie de sessão do Keycloak é third-party dentro de um
> iframe — bloqueado por padrão em Safari e Firefox. O silent renew falharia em silêncio.*

**Isso está correto para o mecanismo de iframe** (`prompt=none`), e a decisão de rejeitá-lo foi boa.
O erro foi generalizar de "iframe não funciona" para "renovação silenciosa não funciona" — e cair no
redirect.

**A biblioteca não usa iframe quando existe refresh token.** Do código instalado
(`oidc-client-ts` 3.5.0, `dist/esm/oidc-client-ts.js`):

```js
async signinSilent(args = {}) {
  let user = await this._loadUser();
  if (!args.forceIframeAuth && user?.refresh_token) {
    logger.debug("using refresh token");
    return await this._useRefreshToken({ ... });
  }
  // só a partir daqui começa o caminho do iframe
```

É um `POST` ao `/token` com `grant_type=refresh_token`: **sem iframe, sem cookie, sem contexto
third-party.** ITP do Safari e o bloqueio do Firefox não se aplicam — eles barram cookies de
terceiros, não requisições XHR autenticadas por token no corpo.

E o refresh token **é emitido**: confirmado em 2026-08-06 exercitando o fluxo PKCE completo contra
HomeLab e Railway (`refresh_token: True` nos dois).

## What Changes

- **`automaticSilentRenew: true`** no `oidcConfig.ts`.
- **O `aoExpirar` deixa de fazer `signinRedirect`.** A renovação passa a ser da biblioteca; o
  redirect vira **fallback** para quando ela falhar (refresh expirado, sessão encerrada no IdP).
- **Rotação de refresh token no realm:** `revokeRefreshToken: true` com `refreshTokenMaxReuse: 0`.
- **O `menthoros-realm.json` passa a versionar atributos de realm** — hoje ele só declara `realm` e
  `enabled`. Ver Riscos.

## Fora de escopo

- **BFF (backend-for-frontend) com cookie `httpOnly`.** É o padrão-ouro e elimina a classe inteira
  do problema — o navegador nunca vê token. Mas é mudança de arquitetura para resolver uma piscada.
  Passa a valer se o modelo de ameaça mudar, não agora.
- **Persistir o token entre abas.** O `userStore` continua em memória; abrir aba nova continua
  fazendo um redirect. É uma vez por aba, não a cada 4 minutos — ver Open Questions.
- **Mudar o `accessTokenLifespan`.** Aumentá-lo reduziria a piscada e enfraqueceria a revogação;
  com renovação silenciosa a duração deixa de incomodar.

## Critérios de aceite

- **CA1** — Dado um usuário autenticado, quando o access token se aproxima do vencimento, então o
  token é renovado **sem navegação**: nenhuma entrada nova no histórico, nenhum unload de página,
  estado de componente preservado.
  *Evidência exigida:* a renovação observada como `POST` ao endpoint de token no painel de rede, e
  **nenhum** `document` request no mesmo intervalo. Captura de tela não serve — a piscada some, mas o
  que interessa é não haver navegação.
- **CA2** — Dado que a renovação acontece, então nenhuma requisição do app toma `401` no intervalo.
  A folga de 60s existe para isso.
- **CA3** — Dado que a renovação silenciosa **falha** (refresh expirado ou sessão encerrada no
  Keycloak), então o app cai para o login por redirect **uma vez, sem laço**.
  *Evidência exigida:* exercitar a falha de verdade — encerrar a sessão no Keycloak e esperar a
  próxima renovação —, não simular no teste apenas.
- **CA4** — Dado `revokeRefreshToken: true`, quando um refresh token já usado é reapresentado, então
  o Keycloak recusa **e invalida a sessão**.
  *Evidência exigida:* replay real do token anterior devolvendo erro.
- **CA5** — `localStorage` continua **sem access token e sem refresh token**. O critério da change de
  PKCE não pode regredir aqui.
- **CA6** — O fluxo funciona em **Safari e Firefox**. É o motivo de a decisão original ter ido para o
  redirect; se falhar num deles, a premissa desta change está errada.

## Métrica de sucesso

**Interrupções por sessão de trabalho do treinador: de ~15 por hora para 0.**

Medível e ligada à rotina: hoje toda sessão de mais de 4 minutos sofre pelo menos um recarregamento
completo. O alvo é zero recarregamentos não solicitados numa sessão de 30 minutos de uso contínuo.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **O refresh token passa a viver na memória da aba.** Um XSS que hoje rouba um access token de 5 minutos passaria a roubar algo de alcance bem maior — hoje até 10h (`ssoSessionMaxLifespan`). | **A rotação não é opcional nesta change, é o que limita a janela.** `revokeRefreshToken: true` faz cada renovação invalidar a anterior, e um replay derruba a sessão. Sem o item de realm, o item de frontend **não deve ser mergeado**. |
| 🟠 **O `menthoros-realm.json` não versiona atributos de realm.** Ele declara apenas `realm` e `enabled`; `revokeRefreshToken` nunca passou por PR. Adicionar o primeiro atributo abre a porta para o `sync-realm.sh` sobrescrever configuração de realm que hoje vive só no servidor. | Antes de aplicar, **fotografar os atributos de realm dos dois alvos** pela Admin API e declarar no arquivo apenas o que for igual nos dois mais o que se quer mudar. Mesmo cuidado que a `disable-ropc-direct-grant` teve com clients. |
| **Renovação falha em silêncio e o coach é jogado no login** | Foi exatamente o medo que motivou o redirect. Coberto pelo CA3, com falha exercitada de verdade, e pelo CA6 nos dois navegadores em que o iframe falharia. |
| **Regressão do CA de `localStorage`** da change de PKCE | CA5, com teste. O `userStore` em memória não muda. |

## Open Questions & Assumptions

**Premissas:**

1. **O `_useRefreshToken` da biblioteca não toca cookie nem iframe.** Lido no código instalado e
   citado acima. A confirmar na prática pelo CA6 — é a premissa que sustenta a change inteira.
2. **`ssoSessionIdleTimeout` de 30 min é folgado o bastante** para que a renovação a cada ~4 min
   mantenha a sessão viva indefinidamente dentro do `ssoSessionMaxLifespan` de 10h.

**Em aberto:**

- **Q1 — O redirect ao abrir aba nova incomoda?** Com `userStore` em memória, aba nova nasce sem
  token e faz um redirect. É uma vez por aba. Persistir mudaria o modelo de ameaça (token em
  `sessionStorage`) e contraria o CA5 — só entra se o incômodo for real.
- **Q2 — Ligar rotação invalida as sessões ativas hoje?** Provável que sim, no momento do sync.
  Irrelevante em dev; vale saber antes de existir produção.
