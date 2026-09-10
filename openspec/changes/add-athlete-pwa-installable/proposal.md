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
    descricao: Token em memória + PKCE — o SW não pode interferir no fluxo OIDC nem cachear o redirect.
    mitigacao: /auth e /api network-only; SW não intercepta navigations do fluxo de login (skipWaiting + clients.claim controlados).
  - id: R4
    descricao: iOS não tem prompt automático — depende de "Adicionar à Tela de Início" manual.
    mitigacao: Limitação de plataforma documentada como non-goal; a entrega cobre o que iOS permite (ícone + tela cheia via meta tags).
---

## Why

O atleta é persona secundária mas **mediada**, não "menos importante" (ver
`knowledge/product/personas.md`): churn de atleta é churn de coach. Hoje o atleta usa o Menthoros
pela aba do navegador — sem ícone, sem tela cheia, sem hábito de "abrir o app". O shell já nasceu
mobile-first (`src/features/athlete/layout/AthleteLayout.tsx` usa `AthleteBottomNav` e limita as telas
a 640px centralizados), então a lacuna é de empacotamento, não de UI. Fechá-la via PWA é o caminho de
menor esforço para dar ao atleta o que um app de loja daria no essencial (ícone + tela cheia), sem o
custo de rewrite nativo (8–10 semanas) nem de Capacitor (4–6 semanas).

`index.html` já tem `viewport` e `referrer strict-origin-when-cross-origin`, mas **não tem** manifest,
theme-color, apple-touch-icon nem service worker. Os ícones de marca já existem em
`src/assets/icons/` (`logo_menthoros_128x128.png`, `menthoros_icon.png`, `menthoros_mark.png`).

## What Changes

Somente `apps/menthoros-front`:

1. **Manifest** — `public/manifest.webmanifest` (name, short_name, start_url `.`, display `standalone`,
   theme/background color, ícones 192/512 + maskable), linkado no `index.html`.
2. **Meta tags iOS** — `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
   `apple-touch-icon` (180×180), `theme-color` no `index.html`.
3. **Service worker** — precache do app-shell (index.html + hashed assets + fontes + ícones), com
   estratégia network-first para navegação e **network-only para `/api` e `/auth`** (guardrail de
   multi-tenancy/LGPD). Registro condicional a `import.meta.env.PROD`.
4. **Prompt de instalação** — captura `beforeinstallprompt` e expõe um botão/CTA discreto de
   "Instalar app" (Android/Chromium); iOS fica coberto pelas meta tags (non-goal: hint customizado).
5. **Ícones PWA** — gera os tamanhos necessários a partir de `logo_menthoros_128x128.png`/`menthoros_icon.png`.

## Impact

- `apps/menthoros-front`: `index.html`, `public/manifest.webmanifest`, `public/` (ícones + `sw.js`),
  `src/main.tsx` (registro do SW), novo componente de prompt de instalação no shell do atleta,
  `vite.config.ts` (se adotar `vite-plugin-pwa`; alternativa: SW manual sem dependência nova).
- **Backend: zero diffs.** Nenhum contrato de API, schema ou auth muda.

## Critérios de aceite

- **CA1** — Given o build de produção, When o Lighthouse PWA audit roda, Then `installable` passa
  (manifest válido, ícones ≥192px, service worker registrado, start_url resolve).
- **CA2** — Given Android Chrome, When o usuário abre o app, Then `beforeinstallprompt` dispara e o
  CTA "Instalar" aparece; ao instalar, o app abre em `standalone` com o ícone de marca.
- **CA3** — Given iOS Safari, When "Adicionar à Tela de Início" é usado, Then o app abre em tela
  cheia (`apple-mobile-web-app-capable`) com `apple-touch-icon` correto.
- **CA4** — Given um login Keycloak (PKCE) e dados de atleta, When o SW está ativo, Then `/api` e
  `/auth` não entram em cache (verificar no DevTools que nenhuma resposta dessas origens está no
  Cache Storage) e o login/troca de tenant seguem funcionando.
- **CA5** — Given o app-shell precacheado, When a rede cai após primeiro load, Then o app carrega a
  casca (splash/tela) e dados mostram estado de erro — sem tela branca (app-shell cache hit).

## Métrica de sucesso

- **Primária (mecânica):** Lighthouse PWA `installable` = true no build de produção + CA4 verificado
  no DevTools (zero entry de `/api` ou `/auth` no Cache Storage).
- **Secundária (produto):** taxa de instalação/uso do app fora da aba — **não mensurável ainda**
  (sem analytics no front); registrar como follow-up quando houver instrumentação, junto com o
  gatilho de reabrir a decisão de App Store/Capacitor (demanda medida de atleta/coach).

## Open Questions & Assumptions

- **Q1:** adotar `vite-plugin-pwa` (Workbox, ~1 dep) ou SW manual (zero dep, mais código)? Assumo
  `vite-plugin-pwa` por maturidade e por gerar precache hasheado correto; validar na DoR.
- **Q2:** o SW roda sob o mesmo domínio público (`menthoros.com`)? Assumo sim (mesmo deploy Railway do
  front); sem subpath — start_url `.` resolve na raiz.
- **Assunção:** hash router (`createHashRouter`) não exige navigation fallback especial no SW, pois a
  navegação interna é por fragmento, não por path — precache do único `index.html` cobre tudo.
