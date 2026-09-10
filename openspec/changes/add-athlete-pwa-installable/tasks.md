# Tasks — add-athlete-pwa-installable

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica; E2E onde indicado). Backend: **nenhuma task** —
change é frontend-only.

## Ícones e manifest

- [ ] 1.1 Gerar os ícones PWA (192×192, 512×512, maskable 512, apple-touch-icon 180×180) a partir
      de `src/assets/icons/logo_menthoros_128x128.png`/`menthoros_icon.png`, salvos em `public/icons/`.
      Validação: `ls public/icons/` mostra os 4 arquivos; `file` confirma dimensões.
- [ ] 1.2 Criar `public/manifest.webmanifest` (name "Menthoros", short_name "Menthoros",
      start_url `.`, scope `.`, display `standalone`, theme_color/background_color da identidade de
      marca, `icons` com purpose `any` e `maskable`). Validação: `npx lighthouse` / JSON válido e
      `installable` true (CA1).

## index.html — meta tags iOS e link do manifest

- [ ] 1.3 Adicionar `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color">`,
      `<meta name="apple-mobile-web-app-capable" content="yes">`,
      `<meta name="apple-mobile-web-app-status-bar-style">` e
      `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` no `index.html`.
      Validação: lint+build; inspeção do `index.html` servido mostra os links (CA3).

## Service worker (app-shell precache)

- [ ] 1.4 Adotar `vite-plugin-pwa` (ou SW manual, se a DoR refutar Q1) configurado em `vite.config.ts`:
      precache de `index.html` + hashed JS/CSS + fontes + ícones; `navigateFallback` para o
      `index.html`; **excluir `/api/**` e `/auth/**` de qualquer cache** (guardrail multi-tenancy/LGPD).
      Validação: `npm run build` gera `sw.js` + precache manifest; `grep -r "api\|auth" dist/sw.js`
      mostra as rotas como network-only (CA4).
- [ ] 1.5 Registrar o SW condicionalmente a `import.meta.env.PROD` em `src/main.tsx` (não registrar
      em dev — quebraria HMR). Validação: `npm run build && npm run preview` mostra SW ativo no
      DevTools; `npm run dev` NÃO registra SW.

## Prompt de instalação (Android/Chromium)

- [ ] 1.6 Capturar `beforeinstallprompt` e renderizar um CTA discreto "Instalar app" no shell do
      atleta (componente novo em `src/features/athlete/`, reutilizando o design system existente).
      Validação: lint+build + teste unitário do handler do prompt (CA2); E2E não cobre evento de
      instalação (limitação do navegador) — confirmar no device/DevTools.

## Verificação de regressão

- [ ] 1.7 Rodar a suíte completa e E2E de auth/atleta para garantir que o SW não interfere no fluxo
      Keycloak PKCE nem no multi-tenancy. Validação: `npm run lint && npm run build && npm run test:run`
      + `npm run test:e2e` verde (CA4/CA5).
