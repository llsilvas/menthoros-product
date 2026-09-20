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

- [ ] 1.1 Gerar em `public/icons/` a partir de `src/assets/icons/logo_transparent.png` (500×500
      RGBA — R/DoR: os arquivos citados originalmente não eram quadrados): `icon-192.png`,
      `icon-512.png`, `icon-512-maskable.png` (marca lime reduzida pra caber nos 80% centrais — zona
      segura de máscara — sobre fundo **navy `#0A1628`**, grill Q11) e `apple-touch-icon-180.png`
      (mesmo fundo navy opaco — iOS não aceita transparência). Script one-off (`sips` no macOS ou `sharp` via `npx`, **não
      commitado como dependência**).
      *verify:* `file public/icons/*.png` confirma as 4 dimensões; inspeção visual do maskable com
      máscara circular (a marca não pode ser cortada).

## 2. Service worker + manifest (`vite-plugin-pwa`)

- [ ] 1.2 `npm i -D vite-plugin-pwa@^1.3.0`. Confirmar com `npm ls workbox-build workbox-window`
      que os peers resolveram; **não** instalar `@vite-pwa/assets-generator`.
      *verify:* `npm run build` continua verde sem o plugin configurado ainda (só a dep).
- [ ] 1.3 `VitePWA({...})` em `plugins` de `vite.config.ts`, ao lado de `react()` — bloco `test`
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
      `workbox.runtimeCaching` com **`NetworkOnly`** pra `/api/**`, `/auth/**` e `/env-config.js`
      — nenhuma outra estratégia de runtime.
      *verify:* `npm run build` emite `dist/sw.js`, `dist/workbox-*.js`, `dist/manifest.webmanifest`;
      `node -e "JSON.parse(require('fs').readFileSync('dist/manifest.webmanifest'))"` OK;
      `grep -c env-config dist/sw.js` = **0** (precache manifest não o contém); `grep -c index.html
      dist/sw.js` ≥ 1; o `dist/sw.js` contém as regexes da denylist (CA1-ci).
- [ ] 1.4 Registro em `src/main.tsx` **depois** do `if (!redirectPathDeepLink())` (dentro do ramo
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
      → `expect(r.fromServiceWorker()).toBe(false)` (sob `vite preview` não há proxy — `server.proxy`
      é só dev — e o corpo pode até ser o `index.html` do SPA fallback do preview; o que importa é a
      **origem** da resposta: rede, não SW. Com a denylist errada, vira `true` e o teste falha);
      (d) `context.setOffline(true)` + `page.reload()` → `#root` renderiza a casca (sem tela branca)
      e a área de dados mostra erro (CA5-ci). Esperado e **não é falha**: o `<script
      src="/env-config.js">` falha offline (NetworkOnly) e a cadeia de fallback de `src/config/env.ts`
      absorve (`window.__RUNTIME_CONFIG__` indefinido → `import.meta.env`/`'/auth'`).
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
