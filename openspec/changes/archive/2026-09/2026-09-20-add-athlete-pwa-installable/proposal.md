**Tamanho:** S · **Trilha:** Fast · **Status:** ✅ **CONCLUÍDA** — mergeada em `develop`
([PR #122](https://github.com/llsilvas/menthoros-front/pull/122), 2026-09-20, CI 3/3). DoR READY
após 4 rodadas de pre-mortem (Codex, 13 achados fechados) + grill (12 decisões). QA sem Critical.
**Pendente antes de promover `develop → main`:** evidência manual da task 1.8 (Lighthouse
*installable*, Android real, iPhone real) pelo founder. Follow-up anotado: `add-athlete-pwa-ux-hints`.

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
    manifest (gerado pelo vite-plugin-pwa) + ícones; meta tags iOS (apple-touch-icon,
    apple-mobile-web-app-*); service worker de precache do app-shell; prompt de instalação
    (beforeinstallprompt no Android, banner dispensável); guarda mínima `!navigator.onLine` na
    restauração de sessão do AuthProvider (única mudança de auth — ver item 6 e Revisão 3).
  exclui: >
    presença em App Store/Play Store (rota Capacitor — decisão pós-MVP separada); web push
    notifications (exige VAPID + subscription no backend); sync de dados offline (app-shell só,
    dados continuam network-only); qualquer mudança de backend/contrato de API/schema.
acceptance_criteria: [CA1 manifest válido + instalável (ci+man), CA2 prompt/instalação Android (ci+man), CA3 tela cheia iOS (man), CA4 SW nunca intercepta /api e /auth nem cacheia env-config.js (ci), CA5a casca offline após reload (ci), CA5b erro de dados offline sem reload (ci), CA6 lint+build+test+e2e verde e sem SW em dev (ci)]
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
      navigateFallbackDenylist: [/^\/auth\//, /^\/api\//] e NENHUMA rota de runtime para
      /api/**, /auth/** ou /env-config.js (DoR rodada 2: uma rota NetworkOnly ainda responde pelo
      SW e mataria a testabilidade; sem rota, o browser vai direto à rede e nada é cacheado).
      registerType 'prompt' (nunca autoUpdate: um reload
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
      workbox.globIgnores: ['**/env-config.js'] e nenhuma rota de runtime para esse path (sem rota,
      o SW não intercepta e o browser busca na rede a cada load — que é exatamente o contrato do
      nginx no-store). Verificação mecânica (DoR rodada 2): inspecionar o array passado a
      precacheAndRoute([...]) dentro de dist/sw.js — nenhuma entry com url 'env-config.js'; não
      basta grep textual no arquivo inteiro.
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
>
> **Revisão 2 (DoR, 2026-09-20 — Codex rodada 2, 4 achados, todos confirmados):** (1) **Critical:**
> a sonda R3 era não-discriminante — Workbox `NetworkOnly` ainda responde pelo `fetch` handler do
> SW, então `fromServiceWorker()` daria `true` com a denylist certa ou errada. **`runtimeCaching`
> removido por completo**: sem rota casando, o SW não chama `respondWith` e o browser vai direto à
> rede (`false`); com a denylist quebrada, a rota de navegação serve o `index.html` (`true`). A
> denylist passa a ser o único mecanismo — e testável. (2) **Critical:** CA5 assumia "dados com
> erro" após reload offline, mas o token vive em memória: o reload perde a sessão, o `AuthProvider`
> tenta restaurar, falha, e a rota protegida cai no login. CA5 dividido em reload offline (casca +
> login visível) e falha de dados offline sem reload (logado). (3) item 1/Impact ainda falavam em
> manifest manual — fonte única é o gerado pelo plugin. (4) o `grep env-config dist/sw.js = 0` era
> inválido enquanto havia `NetworkOnly` no SW; a checagem certa é o array `precacheAndRoute`.
> Confirmado correto pelo Codex: API do `vite-plugin-pwa@1.3`, injeção automática do
> `<link rel=manifest>`, referência `vite-plugin-pwa/client`, semântica de cold start.
>
> **Revisão 3 (DoR, 2026-09-20 — Codex rodada 3, 3 achados, todos confirmados):** (1) **Critical,
> bug real da spec:** CA5a assumia que a restauração de sessão offline "falha de volta no React";
> mas `src/context/auth/AuthProvider.tsx:130-139` faz `signinRedirect({prompt:'none'})` —
> **navegação de topo pro IdP** — sempre que não há usuário em memória nem a marca
> `menthoros:restauracao-tentada` no `sessionStorage`. Offline, isso termina na página de erro do
> navegador. E num PWA instalado, fechar/reabrir zera o `sessionStorage`: a reabertura offline
> (o caso mais comum) cairia exatamente aí — a promessa "sem tela branca" seria falsa em
> produção. **Decisão do founder:** guarda mínima `!navigator.onLine` → pula a restauração e
> conclui anônimo (item 6, task 1.4b, unit test). (2) **Critical:** a sonda (c) da task 1.7
> deixava a URL em `/auth/...` e o reload de (d1) recarregava uma rota da denylist — corrigida a
> ordem (voltar a `/` antes de ficar offline; casos isolados). (3) lista yaml
> `acceptance_criteria` estava desalinhada dos critérios detalhados — normalizada (CA1–CA6).

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

1. **Manifest** — **gerado pelo `vite-plugin-pwa`** a partir da opção `manifest` em
   `vite.config.ts` (name/short_name "Menthoros", `start_url: '.'`, `scope: '.'`, `display:
   'standalone'`, `theme_color`/`background_color` `#0A1628`, ícones 192/512 `any` + 512
   `maskable`); o plugin emite `dist/manifest.webmanifest` e **injeta o `<link rel="manifest">`
   sozinho** (confirmado na DoR rodada 2). **Nenhum `public/manifest.webmanifest` manual** — fonte
   única, sem drift.
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
   - **Sem `workbox.runtimeCaching`** (DoR rodada 2, Critical): uma rota `NetworkOnly` ainda
     responde pelo `fetch` handler do SW, o que (a) tornaria a sonda R3 não-discriminante
     (`fromServiceWorker()` sempre `true`) e (b) não acrescenta nada — sem rota casando, o SW não
     chama `respondWith` e o browser vai direto à rede, sem cache. `/api/**`, `/auth/**` e
     `/env-config.js` ficam **fora de qualquer rota do SW**; a denylist de navegação é o único
     mecanismo, e por isso testável. Dados continuam network-only (non-goal).
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
6. **Guarda offline na restauração de sessão** (DoR rodada 3, Critical; decisão do founder) — em
   `src/context/auth/AuthProvider.tsx`, imediatamente antes do bloco
   `if (!jaTentouRestaurar() && !haConvitePendente())` que chama
   `userManager.signinRedirect({prompt:'none'})`: **se `!navigator.onLine`, não tenta restaurar —
   conclui anônimo (`aplicarUsuario(null)`) e segue**. É a única mudança de comportamento de auth
   da change, e é o mínimo que torna CA5a verdadeiro em produção: sem ela, um PWA instalado
   reaberto sem rede faz uma navegação de topo pro IdP e o navegador mostra a própria página de
   erro — tela "branca" por definição. `navigator.onLine === false` é confiável (só é `false` sem
   interface de rede); `true` pode mentir (portal cativo), mas nesse caso o fluxo segue como hoje.
   Não há detecção de "voltou a rede" nem re-restauração automática (non-goal: cresceria a change
   e adicionaria estado ao `AuthProvider`; o atleta recarrega quando a rede voltar).

## Impact

- `apps/menthoros-front`: `index.html` (meta tags iOS), `public/icons/` (ícones gerados),
  `vite.config.ts` (`VitePWA` — manifest inline + workbox; `dist/sw.js` e
  `dist/manifest.webmanifest` são **emitidos no build**, não commitados), `src/main.tsx` (registro
  do SW), `src/vite-env.d.ts` (referência de tipos), `src/features/athlete/hooks/useInstallPrompt`
  + `src/features/athlete/layout/InstallPromptBanner`, `tests/e2e/pwa/service-worker.spec.ts`.
  Dependência nova: `vite-plugin-pwa@^1.3.0` (dev). **Sem `public/manifest.webmanifest` manual.**
  Auth: `src/context/auth/AuthProvider.tsx` (guarda `!navigator.onLine` antes do
  `signinRedirect`, item 6) + unit test correspondente — única mudança de comportamento de
  autenticação; `oidcConfig`/`userManager` intocados.
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
  entrada com `/api/`, `/auth/` ou `env-config.js`; (b) uma **navegação same-origin** a
  `/auth/realms/menthoros/protocol/openid-connect/auth` **não** é respondida pelo SW
  (`response.fromServiceWorker() === false`). Discriminante porque **não há rota de runtime**
  (DoR rodada 2): com a denylist certa nenhuma rota casa e o browser vai à rede; com a denylist
  quebrada a rota de navegação serve o `index.html` precacheado e o valor vira `true`. O corpo da
  resposta é irrelevante (sob `vite preview` pode ser o SPA fallback) — só a origem importa; (c)
  `tests/e2e/auth/login.spec.ts` continua verde.
- **CA5a-ci (casca offline)** — Given o app-shell precacheado e a página em `/` (não numa rota da
  denylist), When `context.setOffline(true)` **antes** do `reload` e **sem** pré-setar a marca
  `menthoros:restauracao-tentada`, Then o `#root` renderiza (sem tela branca), a **tela de
  login/landing** fica visível e **nenhuma navegação de topo pro IdP acontece** (a URL permanece
  same-origin; `signinRedirect` não é chamado). Só é verdadeiro por causa da guarda
  `!navigator.onLine` do item 6 (DoR rodada 3): sem ela, o `AuthProvider` faria
  `signinRedirect({prompt:'none'})` e o navegador mostraria a própria página de erro — o caso mais
  comum num PWA instalado reaberto sem rede, já que fechar o app zera o `sessionStorage`. Não
  asserte "dados com erro" aqui: o token vive em memória e o reload perde a sessão.
- **CA5b-ci (dados offline sem reload)** — Given logado em `/#/atletas` com dados carregados, When
  `context.setOffline(true)` e uma nova busca é disparada (navegar pra outra rota de dados e
  voltar, **sem** reload), Then a área de dados mostra o estado de erro por consulta já existente
  — a sessão em memória sobrevive porque não houve reload.
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
12. **Guarda offline na restauração de sessão (rodada 3 da DoR, decidido pelo founder):** única
    mudança de auth da change — `!navigator.onLine` pula o `signinRedirect({prompt:'none'})` e
    conclui anônimo. Alternativas rejeitadas: manter auth intocada (CA5a viraria limitação
    documentada — PWA instalado reaberto sem rede cairia na página de erro do navegador, o oposto
    da promessa da change) e restauração consciente de rede com evento `online` (S → M, estado
    novo no `AuthProvider`; fica pro follow-up se houver demanda medida).

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
