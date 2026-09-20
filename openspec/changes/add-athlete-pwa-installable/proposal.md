**Tamanho:** S · **Trilha:** Fast

```yaml
id: add-athlete-pwa-installable
motivation: >
  O atleta acessa o Menthoros pelo navegador do celular e não tem ícone na tela inicial, não abre
  em tela cheia e não tem prompt de instalação. O shell do atleta JÁ é mobile-first (AthleteBottomNav,
  telas limitadas a 640px), então o custo de empacotar como PWA instalável é baixo — falta o
  manifest, os ícones, o service worker e as meta tags de iOS. Isso mexe direto em 1 das 4 causas
  de churn do atleta (hábito), que retroalimenta retenção do coach (efeito rede B2B2C).
scope:
  repos: [apps/menthoros-front]
  inclui: >
    manifest.webmanifest + ícones; meta tags iOS (apple-touch-icon, apple-mobile-web-app-*);
    service worker de precache do app-shell; prompt de instalação (beforeinstallprompt no Android).
  exclui: >
    presença em App Store/Play Store (rota Capacitor — decisão pós-MVP separada); web push
    notifications (exige VAPID + subscription no backend); sync de dados offline (app-shell só,
    dados continuam network-only); qualquer mudança de backend/contrato de API/schema.
acceptance_criteria: [CA1 manifest válido + instalável, CA2 ícone na home em Android e iOS, CA3 app-shell precacheado offline, CA4 sem regressão de auth/tenant, CA5 regressão lint+build+test]
risks:
  - id: R1
    descricao: Service worker cachear respostas de /api violaria multi-tenancy (dado de um tenant servido a outro) e LGPD.
    mitigacao: SW precacheia SÓ o app-shell (index.html, JS/CSS/fontes, ícones); nada de /api ou /auth entra em cache.
  - id: R2
    descricao: SW registrado em dev quebra HMR e deixa build de desenvolvimento com cache fantasma.
    mitigacao: Registrar o SW só em produção (import.meta.env.PROD); dev segue sem SW.
  - id: R3
    descricao: >
      (Critical, DoR) O Keycloak é proxyado em /auth/ no MESMO origin do SPA (nginx em prod, proxy
      Vite em dev). Um navigateFallback genérico responderia o index.html precacheado à navegação
      do browser para /auth/realms/.../protocol/openid-connect/auth — a tela de login do IdP nunca
      carregaria. O callback OIDC em si é seguro: redirect_uri é a raiz (`${origin}/`, oidc-client-ts
      lê ?code=&state= no cliente), ou seja, servir index.html nessa navegação é o comportamento
      correto.
    mitigacao: >
      navigateFallbackDenylist: [/^\/auth\//, /^\/api\//] + runtimeCaching NetworkOnly para
      /api/**, /auth/** e /env-config.js. registerType 'prompt' (nunca autoUpdate: um reload
      automático no meio do fluxo PKCE perderia o state). Custo aceito (grill Q4): sem UI de
      refresh, uma versão nova do app-shell só ativa no próximo cold start (todas as abas
      fechadas) — janela de horas num PWA de celular; documentar pra ninguém "consertar" com
      autoUpdate. Gate: E2E com SW ativo (ver CA4).
  - id: R4
    descricao: iOS não tem prompt automático — depende de "Adicionar à Tela de Início" manual.
    mitigacao: Limitação de plataforma documentada como non-goal; a entrega cobre o que iOS permite (ícone + tela cheia via meta tags).
  - id: R5
    descricao: >
      public/env-config.js é config de RUNTIME — reescrito pelo docker-entrypoint a cada startup do
      container (nginx serve com no-store) e lido em window.__RUNTIME_CONFIG__ antes do bundle
      React (apiBaseUrl, keycloakUrl). O glob padrão do vite-plugin-pwa (**/*.{js,css,html}) o
      precachearia: após um redeploy que troque a URL do backend/IdP, o SW serviria a versão
      antiga até o próximo update do SW — app apontando pro ambiente errado, sem erro visível.
    mitigacao: >
      workbox.globIgnores: ['**/env-config.js'] + NetworkOnly em runtime para o mesmo path.
      Verificação mecânica: o precache manifest dentro de dist/sw.js NÃO pode conter env-config.js.
  - id: R6
    descricao: >
      A assunção original ("hash router dispensa navigation fallback") era falsa: deep links de
      PATH públicos (/waitlist, /cadastro, /privacidade, /termos) chegam como navegação real e são
      traduzidos pra hash em src/config/deepLinkRedirect.ts. Sem fallback, esses links não abririam
      offline (e um fallback sem denylist reintroduz R3).
    mitigacao: navigateFallback: 'index.html' (cobre os 4 paths + a raiz) COM a denylist de R3.
---

> **Revisão 1 (DoR, 2026-09-20 — Codex adversarial, 6 achados, todos verificados no código):**
> (1) **Critical:** o Keycloak é proxyado em `location /auth/` no **mesmo origin** do SPA
> (`docker/nginx.conf.template`, e o proxy Vite em dev faz o mesmo) — um `navigateFallback`
> genérico serviria o `index.html` precacheado no lugar da tela de login do IdP. R3 reescrito com
> `navigateFallbackDenylist` explícito. (2) A assunção "hash router dispensa fallback" era falsa:
> `src/config/deepLinkRedirect.ts` traduz 4 paths públicos (`/waitlist`, `/cadastro`,
> `/privacidade`, `/termos`) no bootstrap — o fallback é **necessário** pra eles (R6). (3) Achado
> próprio, não do Codex: `public/env-config.js` é reescrito a cada startup do container (nginx
> `no-store`, lido em `window.__RUNTIME_CONFIG__` antes do React) — o glob padrão do plugin o
> precachearia e serviria URL de backend/IdP obsoleta após redeploy (R5). (4) Q1 fechada:
> `vite-plugin-pwa@1.3.0` declara peer `vite ^7.0.0` (projeto usa `^7.1.2`). (5) A fonte de
> ícone citada estava errada (`logo_menthoros_128x128.png` mede 142×128; `menthoros_icon.png`,
> 32×32) — mas `logo_transparent.png` é 500×500 RGBA, fonte quadrada adequada. (6) CA2/CA3 não
> eram falsificáveis em CI (Playwright só tem `Desktop Chrome`): critérios separados em
> CI-falsificável × evidência manual. Bônus: o `webServer` do Playwright roda `build && preview`
> (produção), então o SW passa a ser exercitado por TODOS os E2E de auth/coach existentes.

## Why

O atleta é persona secundária mas **mediada**, não "menos importante" (ver
`knowledge/product/personas.md`): churn de atleta é churn de coach. Hoje o atleta usa o Menthoros
pela aba do navegador — sem ícone, sem tela cheia, sem hábito de "abrir o app". O shell já nasceu
mobile-first (`src/features/athlete/layout/AthleteLayout.tsx` usa `AthleteBottomNav` e limita as telas
a 640px centralizados), então a lacuna é de empacotamento, não de UI. Fechá-la via PWA é o caminho de
menor esforço para dar ao atleta o que um app de loja daria no essencial (ícone + tela cheia), sem o
custo de rewrite nativo (8–10 semanas) nem de Capacitor (4–6 semanas).

`index.html` já tem `viewport` e `referrer strict-origin-when-cross-origin`, mas **não tem** manifest,
theme-color, apple-touch-icon nem service worker. A fonte de ícone adequada já existe em
`src/assets/icons/logo_transparent.png` (500×500 RGBA — ver item 5 e a Revisão 1 acima).

## What Changes

Somente `apps/menthoros-front`:

1. **Manifest** — `public/manifest.webmanifest` (name, short_name, start_url `.`, display `standalone`,
   theme/background color, ícones 192/512 + maskable), linkado no `index.html`.
2. **Meta tags iOS** — `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
   `apple-touch-icon` (180×180), `theme-color` no `index.html`.
3. **Service worker** — `vite-plugin-pwa@^1.3.0` (peer `vite ^7.0.0`, compatível com o `^7.1.2`
   do projeto; **sem** `@vite-pwa/assets-generator` — ícones gerados à mão, item 5). Config
   fechada na DoR (R3/R5/R6):
   - `registerType: 'prompt'`, `injectRegister: false` (registro manual em `src/main.tsx`).
   - `workbox.globPatterns: ['**/*.{js,css,html,png,svg,woff2}']` +
     **`globIgnores: ['**/env-config.js']`**.
   - `workbox.navigateFallback: 'index.html'` + **`navigateFallbackDenylist: [/^\/auth\//,
     /^\/api\//]`**.
   - `workbox.runtimeCaching`: **`NetworkOnly`** para `/api/**`, `/auth/**` e `/env-config.js`.
     Nenhuma outra estratégia de runtime — dados continuam network-only (non-goal).
   - `manifest` gerado pelo plugin (fonte única; **não** manter `public/manifest.webmanifest`
     manual em paralelo — evita drift).
   Registro condicional a `import.meta.env.PROD`, **depois** do `redirectPathDeepLink()` (se ele
   redirecionar, não registra nessa passada).
4. **Prompt de instalação** (Android/Chromium; decisões do grill, Q3/Q7/Q9) — captura
   `beforeinstallprompt` e renderiza um **banner fino logo acima do `AthleteBottomNav`**, só no
   shell do atleta: "Instalar o Menthoros na tela inicial" + botão "Instalar" + "Agora não".
   Dispensa persistida em `localStorage` (`menthoros:pwa-install-dismissed`, mesmo prefixo de
   `menthoros:restauracao-tentada`), **sem** lógica de retorno. Some após `appinstalled` ou quando
   `matchMedia('(display-mode: standalone)')` bate. Aparece onde o evento disparar — **sem gate de
   breakpoint** (atleta no desktop é raro e instalar lá não é errado; menos condição, menos teste).
   Texto sem termo de persona (glossário: "Atleta", nunca "aluno" — e o CTA fala do app, não da
   pessoa). iOS fica coberto só pelas meta tags — hint customizado é non-goal (ver follow-up).
5. **Ícones PWA** — gerados a partir de **`src/assets/icons/logo_transparent.png` (500×500 RGBA)**,
   a única fonte quadrada de alta resolução (DoR: `logo_menthoros_128x128.png` mede 142×128 e
   `menthoros_icon.png` 32×32 — upscaling cumpriria a dimensão formal, não a qualidade). Saída em
   `public/icons/`: 192, 512, 512 maskable (marca dentro dos 80% centrais — zona segura) e
   apple-touch-icon 180. Geração por script one-off (`sips`/`sharp`), **sem dependência nova**.

## Impact

- `apps/menthoros-front`: `index.html`, `public/manifest.webmanifest`, `public/` (ícones + `sw.js`),
  `src/main.tsx` (registro do SW), novo componente de prompt de instalação no shell do atleta,
  `vite.config.ts` (se adotar `vite-plugin-pwa`; alternativa: SW manual sem dependência nova).
- **Backend: zero diffs.** Nenhum contrato de API, schema ou auth muda.

## Critérios de aceite

Separados em **CI-falsificáveis** (gate de merge) e **evidência manual** (obrigatória antes de
anunciar, não bloqueia merge) — DoR: o Playwright só tem o project `Desktop Chrome`, e
`beforeinstallprompt`/"Adicionar à Tela de Início" não são reproduzíveis nele.

**CI (Playwright roda contra `npm run build && npm run preview` = produção → o SW está ativo em
TODOS os E2E existentes de auth/coach, que viram gate de regressão do login PKCE de graça):**

- **CA1-ci** — Given o build de produção, Then `dist/manifest.webmanifest` é JSON válido, linkado no
  `dist/index.html`, com ícones ≥192px e 512 `maskable`; `dist/sw.js` existe e seu precache
  manifest contém `index.html` e **não** contém `env-config.js`.
- **CA4-ci** — Given o SW controlando a página (`navigator.serviceWorker.controller != null`) e um
  login PKCE via fixture E2E + navegação que busca dados, Then (a) `caches` não contém nenhuma
  entrada com `/api/`, `/auth/` ou `env-config.js`; (b) uma requisição a `/auth/**` **não** é
  respondida pelo SW (`response.fromServiceWorker() === false`) — o IdP mockado a recebe; (c)
  `tests/e2e/auth/login.spec.ts` continua verde.
- **CA5-ci** — Given o app-shell precacheado, When `context.setOffline(true)` e reload, Then o
  `#root` renderiza a casca (sem tela branca) e a área de dados mostra estado de erro.
- **CA2-ci** — Given um evento `beforeinstallprompt` sintético (unit test), Then o hook faz
  `preventDefault`, expõe `canInstall=true` e `promptInstall()` chama `prompt()`; o CTA só
  renderiza com `canInstall` e some após `appinstalled`/`display-mode: standalone`.
- **CA6-ci** — `npm run lint && npm run build && npm run test:run && npm run test:e2e` verde;
  `npm run dev` **não** registra SW.

**Evidência manual (grill Q8 — pelo founder, em `develop`/Railway "testes", screenshots no PR ou
em follow-up). Não bloqueia o merge da feature em `develop`; BLOQUEIA a promoção `develop → main`
até os três itens estarem registrados:**

- **CA1-man** — Lighthouse PWA `installable = true`.
- **CA2-man** — Android Chrome: prompt dispara, CTA aparece, app instalado abre em `standalone`
  com o ícone de marca.
- **CA3-man** — iOS Safari: "Adicionar à Tela de Início" → tela cheia
  (`apple-mobile-web-app-capable`) com `apple-touch-icon` correto.

## Decisões de design (grill, 2026-09-20 — 11 decisões, entendimento confirmado pelo founder)

1. **Persona:** "aluno" = **Atleta** (glossário `CONTEXT.md`, que lista "aluno" em *Avoid*). CTA só
   no shell do atleta; o Treinador não vê instalação (usa o inbox no desktop).
2. **iOS:** non-goal desta change — sem hint customizado. **Anotado pra próxima:** follow-up
   `add-athlete-pwa-ux-hints` (XS · Fast) com (a) hint estático em iOS Safari fora de `standalone`
   ("Compartilhar → Adicionar à Tela de Início") e (b) estado explícito "Você está offline" no
   shell. iOS é o gargalo real de adoção (Apple não expõe `beforeinstallprompt`); a change nasce
   quando o founder mandar, não junto desta.
3. **CTA Android:** banner fino acima do `AthleteBottomNav`, "Instalar o Menthoros na tela inicial"
   + "Instalar" + "Agora não".
4. **Dispensa:** persistida em `localStorage` (`menthoros:pwa-install-dismissed`), nunca volta.
   Conveniência por dispositivo — não é estado de domínio.
5. **Sem gate de breakpoint:** aparece onde o evento disparar, dentro do shell do atleta.
6. **Atualização:** `registerType: 'prompt'` sem UI de refresh — versão nova ativa no próximo cold
   start. Aceito; nunca trocar por `autoUpdate` (R3).
7. **Offline:** só a promessa "não fica em tela branca" (CA5). Sem banner offline (→ follow-up).
8. **Manifest:** `display: standalone`, sem lock de orientação, `theme_color` =
   `background_color` = `#0A1628`.
9. **Ícones:** fonte `logo_transparent.png` (500×500); maskable 512 e apple-touch 180 com fundo
   navy `#0A1628` e marca lime centrada na zona segura de 80%.
10. **Evidência manual = gate de promoção, não de merge:** Lighthouse + Android real + iPhone real,
    pelo founder, em `develop` (Railway "testes"), **antes** do PR `develop → main`.
11. **Sem ADR, sem `CONTEXT.md`:** PWA não é decisão difícil de reverter (Capacitor depois é
    aditivo) e nada aqui é vocabulário de domínio — "app-shell", "instalação", "service worker"
    são implementação.

## Métrica de sucesso

- **Primária (mecânica):** Lighthouse PWA `installable` = true no build de produção + CA4 verificado
  no DevTools (zero entry de `/api` ou `/auth` no Cache Storage).
- **Secundária (produto):** taxa de instalação/uso do app fora da aba — **não mensurável ainda**
  (sem analytics no front); registrar como follow-up quando houver instrumentação, junto com o
  gatilho de reabrir a decisão de App Store/Capacitor (demanda medida de atleta/coach).

## Open Questions & Assumptions

- ~~**Q1:** `vite-plugin-pwa` ou SW manual?~~ **Resolvida na DoR:** `vite-plugin-pwa@^1.3.0` —
  peer `vite ^3.1||^4||^5||^6||^7||^8`, compatível com o `^7.1.2` do projeto; precache hasheado
  correto de graça; `workbox-build`/`workbox-window` vêm como peers (conferir `npm ls`). **Sem**
  `@vite-pwa/assets-generator` (ícones à mão, zero dep extra).
- ~~**Q2:** mesmo origin?~~ **Confirmada:** `vite.config.ts` não define `base`; o nginx serve o SPA
  na raiz e proxya `/api/` e `/auth/` no mesmo origin (`docker/nginx.conf.template`); o proxy
  Vite em dev espelha os dois. `start_url: '.'`/`scope: '.'` resolvem na raiz.
- ~~**Assunção:** hash router dispensa navigation fallback.~~ **Refutada (R6):** os deep links de
  PATH públicos de `src/config/deepLinkRedirect.ts` exigem o fallback — que, por sua vez, exige a
  denylist de `/auth/**` e `/api/**` (R3). O callback OIDC (`redirect_uri = ${origin}/`, query
  `?code=&state=`) cai na raiz e é corretamente servido pelo `index.html` precacheado —
  `oidc-client-ts` lê o code no cliente.
- ~~**Assunção nova:** cores do manifest a confirmar.~~ **Resolvida (grill Q6/Q11, confirmada na
  fonte `src/shared/design-tokens/colors.ts`):** `theme_color` = `background_color` = **`#0A1628`**
  (`surface[900]`, navy canônico; `elevation.base` aponta pra ele). O lime `#BDDE5A`
  (`primary[500]`) fica só na marca do ícone — na status bar do sistema inundaria a tela. Fundo
  dos ícones opacos (maskable/apple-touch) também navy, marca lime na zona segura de 80%.
