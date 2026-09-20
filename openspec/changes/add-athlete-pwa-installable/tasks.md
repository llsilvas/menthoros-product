# Tasks — add-athlete-pwa-installable

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica; E2E onde indicado). Backend: **nenhuma task** —
change é frontend-only.

**Revisado na DoR (2026-09-20, Codex adversarial — 6 achados confirmados no código + 1 achado
próprio, ver Revisão 1 no `proposal.md`).** Anchors: `vite.config.ts` (`plugins: [react()]`, sem
`base`, proxy dev `/api`+`/auth`, bloco `test` do Vitest no mesmo arquivo — **não tocar**);
`public/` tem só `env-config.js` (runtime, R5) e `vite.svg`; `src/main.tsx` chama
`redirectPathDeepLink()` antes de montar o React; auth via `oidc-client-ts` com
`redirect_uri = ${origin}/` (`src/context/auth/oidcConfig.ts:21`); Playwright `webServer` =
`npm run build && npm run preview` (produção) com project único `Desktop Chrome`.

## 1. Ícones

- [x] 1.1 Gerar em `public/icons/` a partir de `src/assets/icons/logo_transparent.png` (500×500
      RGBA — R/DoR: os arquivos citados originalmente não eram quadrados): `icon-192.png`,
      `icon-512.png`, `icon-512-maskable.png` (marca lime reduzida pra caber nos 80% centrais — zona
      segura de máscara — sobre fundo **navy `#0A1628`**, grill Q11) e `apple-touch-icon-180.png`
      (mesmo fundo navy opaco — iOS não aceita transparência). Script one-off (`sips` no macOS ou `sharp` via `npx`, **não
      commitado como dependência**).
      *verify:* `file public/icons/*.png` confirma as 4 dimensões; inspeção visual do maskable com
      máscara circular (a marca não pode ser cortada).

## 2. Service worker + manifest (`vite-plugin-pwa`)

- [x] 1.2 `npm i -D vite-plugin-pwa@^1.3.0`. Confirmar com `npm ls workbox-build workbox-window`
      que os peers resolveram; **não** instalar `@vite-pwa/assets-generator`.
      *verify:* `npm run build` continua verde sem o plugin configurado ainda (só a dep).
      *Entregue (commit `9812f1d`):* `vite-plugin-pwa@1.3.0`, `workbox-build`/`workbox-window`
      7.4.1. **Drift transitivo no lockfile, pra o revisor saber:** `workbox-build` puxa
      `@babel/preset-env` (+248 pacotes novos, 519 → 767) e o npm 11 deduplicou o que já existia —
      **46 de 518 pacotes pré-existentes mudaram de versão dentro dos ranges `^`** (os `@babel/*`
      7.27/7.28 → 7.29, `rollup` 4.50.1 → 4.63.4 e seus binários `@rollup/rollup-*`). Núcleo do
      toolchain inalterado: `vite` 7.1.5, `@babel/core` 7.28.4, `@vitejs/plugin-react` 5.0.2,
      `esbuild` 0.25.9, `typescript` 5.8.3. Inevitável sem duplicar cópias (o npm só nesta quando
      nenhuma versão única satisfaz todos os ranges); lint+build+test:run verdes (194/1591).
      O `package.json` foi reordenado alfabeticamente pelo npm — só `vite-plugin-pwa` é adição.
- [x] 1.3 `VitePWA({...})` em `plugins` de `vite.config.ts`, ao lado de `react()` — bloco `test`
      intocado. Config fechada no `proposal.md` (item 3 de What Changes):
      `registerType: 'prompt'`, `injectRegister: false`,
      `manifest` do plugin (name/short_name "Menthoros", `start_url: '.'`, `scope: '.'`,
      `display: 'standalone'`, `theme_color` = `background_color` = **`#0A1628`** (`surface[900]`, navy canônico —
      confirmado em `src/shared/design-tokens/colors.ts:26`; grill Q6), ícones 192/512 `any` + 512
      `maskable`; `display: 'standalone'`, **sem** `orientation`),
      `workbox.globPatterns: ['**/*.{js,css,html,png,svg,woff2}']`,
      **`workbox.globIgnores: ['**/env-config.js']`** (R5),
      `workbox.navigateFallback: 'index.html'`,
      **`workbox.navigateFallbackDenylist: [/^\/auth\//, /^\/api\//]`** (R3 Critical, R6),
      **sem `workbox.runtimeCaching`** (DoR rodada 2, Critical: uma rota `NetworkOnly` ainda
      responde pelo `fetch` handler do SW — `fromServiceWorker()` ficaria `true` sempre e a sonda
      da 1.7 não discriminaria; sem rota casando, o SW não chama `respondWith`, o browser vai à
      rede e nada é cacheado). `/api/**`, `/auth/**` e `/env-config.js` ficam fora de qualquer
      rota; a denylist de navegação é o único mecanismo.
      *verify:* `npm run build` emite `dist/sw.js`, `dist/workbox-*.js`, `dist/manifest.webmanifest`;
      `node -e "JSON.parse(require('fs').readFileSync('dist/manifest.webmanifest'))"` OK;
      inspecionar o array passado a `precacheAndRoute([...])` em `dist/sw.js` (script one-off
      com regex sobre o literal, ou `node -e` extraindo o array): contém uma entry `index.html`
      e **nenhuma** entry `env-config.js` — DoR rodada 2: o grep textual no arquivo inteiro não
      é a asserção certa, o que importa é o precache manifest; o `dist/sw.js` contém as regexes
      da denylist e **nenhuma estratégia de runtime** (`NetworkOnly`/`NetworkFirst`/`CacheFirst`/
      `StaleWhileRevalidate`). *Correção na implementação:* `registerRoute(` **aparece** e é
      esperado — é o próprio `navigateFallback` (`registerRoute(new NavigationRoute(...))`); a
      checagem certa é ausência de estratégias, não de `registerRoute` (CA1-ci).
      *Entregue (commit `71a094b`):* `dist/sw.js` com 18 entradas no precache (2,88 MiB) —
      `index.html` + bundle principal presentes, `env-config.js` ausente, zero estratégias de
      runtime, `NavigationRoute` com a denylist; manifest gerado e `<link rel="manifest">`
      injetado; cores importadas de `src/shared/design-tokens/colors.ts` (`surface[900]`), sem hex
      duplicado. **Ajuste não previsto na spec:** `workbox.maximumFileSizeToCacheInBytes: 3 MiB` —
      o bundle principal tem 2,2 MB (chunk único, aviso pré-existente do Vite) e o limite padrão
      de 2 MiB abortava o build **e** deixaria o shell fora do precache, matando CA5a. Code-split
      fica pra outra change.
- [x] 1.4 Registro em `src/main.tsx` **depois** do `if (!redirectPathDeepLink())` (dentro do ramo
      que monta o React), guardado por `import.meta.env.PROD`, via `registerSW` de
      `virtual:pwa-register` (`onNeedRefresh` no-op por ora — update aplicado no próximo load,
      nunca reload automático no meio do PKCE — custo aceito no grill Q4: versão nova do shell
      só ativa no próximo cold start, todas as abas fechadas). Tipar o módulo virtual com
      `/// <reference types="vite-plugin-pwa/client" />` em **`src/vite-env.d.ts`** (ao lado do
      `vite/client` já existente) — **não** em `types` do `tsconfig.app.json`, que não declara
      `types` e usa só `include: ["src"]`.
      *verify:* lint+build; `npm run build && npm run preview` → Playwright
      `page.evaluate(() => navigator.serviceWorker.controller !== null)` após reload; `npm run dev`
      → `navigator.serviceWorker.getRegistrations()` vazio (CA6-ci).
      *Entregue (commit `60ac4da`):* `registerSW({ immediate: true })` dentro do ramo que monta
      o React, guardado por `import.meta.env.PROD`; reference `vite-plugin-pwa/client` em
      `src/vite-env.d.ts`. Verificado no build: `index-*.js` referencia `/sw.js` com `immediate`,
      e `workbox-window` entra como chunk separado (19ª entrada do precache). **Sem unit test,
      justificado:** é código de módulo do `main.tsx`, sem comportamento isolável sem montar o
      app inteiro — a cobertura real é o E2E 1.7(a) sob `vite preview`; o guard PROD é
      inspecionável. O "`npm run dev` não registra SW" é garantido pelo mesmo guard (não subi o
      dev server).
- [x] 1.4b **Guarda offline na restauração de sessão** (DoR rodada 3, Critical; decisão do founder
      — única mudança de auth da change). Em `src/context/auth/AuthProvider.tsx`, no `inicializar()`,
      **imediatamente antes** de `if (!jaTentouRestaurar() && !haConvitePendente())` (o bloco que
      chama `userManager.signinRedirect({ prompt: 'none', … })`, ~linhas 130-139): se
      `!navigator.onLine`, **não** marca tentativa nem redireciona — `aplicarUsuario(null)` e
      `return` (cai no `finally`, que libera a troca de código e seta `carregando=false`). Motivo
      no comentário (o *porquê*): num PWA instalado reaberto sem rede o `sessionStorage` vem vazio,
      e a navegação de topo pro IdP terminaria na página de erro do navegador. Sem detecção de
      "voltou a rede" (non-goal).
      *verify (TDD, RED antes):* **não existe `AuthProvider.test.tsx`** — criar
      `src/context/auth/restauracaoOffline.test.tsx` (irmão de `restauracaoDeSessao.test.ts`, que
      é teste de função pura dos helpers e não monta o provider) **copiando o setup de
      `renovacaoSilenciosa.test.tsx`**: `vi.spyOn(userManager, 'getUser').mockResolvedValue(null)`
      (sem usuário), `vi.spyOn(userManager, 'signinRedirect').mockResolvedValue(undefined)`, os
      seis stubs de `userManager.events.add*/remove*` (o provider registra handlers ao montar),
      `sessionStorage.clear()` no `beforeEach`, `vi.restoreAllMocks()` no `afterEach`;
      `render(<AuthProvider>{null}</AuthProvider>)` + `waitFor(() => expect(userManager.getUser)
      .toHaveBeenCalled())`. Caso offline: `vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)`
      → `signinRedirect` **nunca** é chamado e `sessionStorage.getItem('menthoros:restauracao-tentada')`
      é `null`. Caso controle (`onLine` → `true`): `signinRedirect` chamado uma vez com
      `expect.objectContaining({ prompt: 'none' })` — prova que a guarda não quebrou o fluxo atual.
      `restauracaoDeSessao`/`renovacaoSilenciosa`/`oidcConfig`/`authFlow` continuam verdes.
      *Entregue (commit `85e5e56`):* guarda `if (!navigator.onLine) { aplicarUsuario(null); return; }`
      imediatamente antes do bloco de restauração (depois de `login_required`/retorno de code,
      antes do bypass de convite). `restauracaoOffline.test.tsx` com consumidor de `AuthContext`
      que torna observável o fim de `inicializar()` (`carregando` → `false` no `finally`) em vez
      de esperar microtasks. **RED confirmado antes da guarda** ("signinRedirect chamado 1 vez"
      no caso offline); GREEN depois (2/2). Suíte completa 195 arquivos / 1593 testes.

## 3. `index.html` — meta tags iOS

- [ ] 1.5 Adicionar `<meta name="theme-color">` (mesmo valor do manifest),
      `<meta name="apple-mobile-web-app-capable" content="yes">`,
      `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` (ou
      `default`, conferir com o tema escuro do shell do atleta) e
      `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`. O `<link
      rel="manifest">` é injetado pelo plugin — **não** duplicar à mão. O `<link rel="icon">` atual
      aponta pra `/src/assets/icons/menthoros_favicon.png` (Vite resolve) — fora de escopo.
      *verify:* lint+build; `dist/index.html` contém as tags + o link do manifest injetado
      (CA1-ci/CA3-man).

## 4. Prompt de instalação (Android/Chromium)

- [ ] 1.6 Hook `useInstallPrompt` em `src/features/athlete/hooks/`: captura `beforeinstallprompt`
      (`preventDefault`, guarda o evento, expõe `canInstall`, `promptInstall()` e `dismiss()`),
      limpa em `appinstalled`, e retorna `canInstall=false` quando `matchMedia('(display-mode:
      standalone)')` bate (já instalado) **ou** quando `localStorage['menthoros:pwa-install-dismissed']`
      existe (grill Q3/Q9: dispensa persistida, sem lógica de retorno — acesso a `localStorage`
      em try/catch, é conveniência por dispositivo). Componente `InstallPromptBanner` no shell do
      atleta (`src/features/athlete/layout/`): **banner fino logo acima do `AthleteBottomNav`**,
      texto "Instalar o Menthoros na tela inicial" + botão "Instalar" + "Agora não" (tokens/MUI do
      design system; sem termo de persona no texto). Renderizado só com `canInstall`; **sem gate
      de breakpoint** (Q7) — aparece onde o evento disparar, dentro do shell do atleta.
      *verify:* unit test (Vitest) dispara um `Event('beforeinstallprompt')` sintético com
      `prompt`/`userChoice` stubados → `canInstall` vira `true` e `promptInstall()` chama
      `prompt()`; `dismiss()` grava a chave e `canInstall` vira `false`; com a chave pré-existente
      o evento é ignorado; após `appinstalled` → `false`; component test: banner ausente sem
      evento, presente com evento, some ao clicar "Agora não" (CA2-ci). E2E **não** cobre o evento
      real (Desktop Chrome) — evidência no 1.8.

## 5. Regressão com SW ativo (gate de CI)

- [ ] 1.7 Novo E2E `tests/e2e/pwa/service-worker.spec.ts` sobre a fixture PKCE existente
      (`tests/fixtures/pkceAuth.ts` + `idp.ts`; mesmo `webServer` de produção dos outros specs).
      **Ordem obrigatória** (com `registerType: 'prompt'` e sem `clientsClaim`, o SW só controla a
      página a partir da **2ª navegação** — sem isso a asserção (a) fica flaky): `page.goto('/')` →
      `page.evaluate(() => navigator.serviceWorker.ready)` → `page.reload()` → só então:
      (a) `navigator.serviceWorker.controller` não-nulo;
      (b) `autenticarComPkce(page)` + `page.route('**/api/v1/atletas**', …MOCK_ATLETAS)` +
      `page.goto('/#/atletas')` + `aguardarFluxoEstavel(page)` (mesmo padrão de
      `tests/e2e/atletas/lista.spec.ts`), depois `caches.keys()` + `cache.keys()` de cada uma → nenhuma
      URL contendo `/api/`, `/auth/` ou `env-config.js`;
      (c) **sonda same-origin** — o IdP da fixture é **cross-origin** (`http://127.0.0.1:9099`,
      `idp.ts`), então o hop OIDC dos specs existentes nunca passa pelo SW e a suíte **não cobre o
      R3 sozinha**: `const r = await page.goto('/auth/realms/menthoros/protocol/openid-connect/auth')`
      → `expect(r.fromServiceWorker()).toBe(false)`. **Discriminante só porque não há rota de
      runtime** (DoR rodada 2): com a denylist certa nenhuma rota casa, o SW não chama
      `respondWith` e o browser vai à rede (`false`); com a denylist quebrada a rota de navegação
      serve o `index.html` precacheado (`true`). Sob `vite preview` não há proxy (`server.proxy` é
      só dev) e o corpo pode até ser o SPA fallback — irrelevante, só a **origem** importa. Não usar
      `page.route` nessa sonda (não intercepta fetch emitido por SW; e aqui não deve haver SW no
      caminho). **Depois da sonda, voltar a `/`** (`page.goto('/')` + `aguardarFluxoEstavel`) —
      DoR rodada 3: deixar a URL em `/auth/...` faria o reload seguinte recarregar uma rota da
      denylist, que não recebe o app-shell offline;
      (d1) **casca offline (CA5a-ci)** — em `test()` próprio, contexto novo (sem marca
      `menthoros:restauracao-tentada` pré-setada), página em `/` com o SW já controlando (a→
      ready → reload): `context.setOffline(true)` **antes** de `page.reload()` → `#root` não-vazio
      (sem tela branca), **tela de login/landing** visível, e `page.url()` continua same-origin
      (nenhuma navegação de topo pro IdP — a guarda da 1.4b impediu o `signinRedirect`; sem ela o
      teste falha na página de erro do Chromium, que é exatamente o bug que a rodada 3 pegou). Não
      asserte "dados com erro": o token vive em memória e o reload perde a sessão. Esperado e **não
      é falha**: o `<script src="/env-config.js">` falha offline (sem rota no SW → rede → erro) e a
      cadeia de fallback de `src/config/env.ts` absorve (`window.__RUNTIME_CONFIG__` indefinido →
      `import.meta.env`/`'/auth'`);
      (d2) **dados offline sem reload (CA5b-ci)** — em `test()` próprio: logado (fixture) em
      `/#/atletas` com `MOCK_ATLETAS` renderizado → `context.setOffline(true)` → navegar pra outra
      rota de dados e voltar **sem** reload → a área de dados mostra o estado de erro por consulta
      já existente (a sessão em memória sobrevive). Cada caso (a/b/c, d1, d2) isolado em seu
      `test()` — estado de SW/offline/URL nunca vaza de um pro outro.
      Confirmar que `tests/e2e/auth/login.spec.ts` e o resto da suíte continuam verdes com o SW
      ativo (CA4-ci).
      *verify:* `npm run test:e2e` verde.
- [ ] 1.8 **Evidência manual (grill Q8 — pelo founder, em `develop`/Railway "testes"). Não
      bloqueia o merge da feature; BLOQUEIA a promoção `develop → main`:** Lighthouse PWA
      `installable = true` (CA1-man); Android Chrome → banner + instalação → `standalone` com ícone
      de marca (CA2-man); iOS Safari → "Adicionar à Tela de Início" → tela cheia +
      `apple-touch-icon` (CA3-man). Screenshots no PR ou em follow-up.
      **Anotado pra próxima (grill Q2/Q5/Q10):** follow-up único `add-athlete-pwa-ux-hints`
      (XS · Fast) — hint estático iOS ("Compartilhar → Adicionar à Tela de Início", só em Safari
      fora de `standalone`) + estado "Você está offline" no shell. Criar só quando o founder
      mandar; não faz parte desta change.

## 6. Encerramento

- [ ] 1.9 `npm run lint && npm run build && npm run test:run && npm run test:e2e` verde (CA6-ci);
      atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
