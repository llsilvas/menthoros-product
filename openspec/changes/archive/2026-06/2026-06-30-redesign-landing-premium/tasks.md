## 1. Tema premium

- [x] 1.1 Criar `theme/landingTheme.ts` — `createTheme(...)` derivado de `premiumTokens`: `semantic` **flat** mapeado, **module augmentation** de `Palette.surfaceShift`, typography Inter (base)
- [x] 1.2 Adicionar Space Grotesk + JetBrains Mono ao `index.html` (mantendo Inter/Syne)
- [x] Validação: `npm run build` ✓

## 2. Módulo landing (port da referência)

- [x] 2.1 Criar `landing/content.ts` (copy da referência; bio do fundador como placeholder)
- [x] 2.2 Criar `landing/primitives.tsx` (Reveal, Eyebrow, SectionHeading, CtaButton, PriorityBadge) — tokens, sem hex cru
- [x] 2.3 Criar `landing/ProductUI.tsx` (AttentionQueue, LoadChart, InterpretationCard) — gráfico CTL=primary/ATL=secondary/TSB=warning
- [x] 2.4 Criar `landing/sections.tsx` (Nav, Hero, Pain, HowItWorks, Delta, Capabilities, Fit, Trust, Faq, FinalCta, Footer)
- [x] Validação: `npm run lint` + `npm run build` ✓

## 3. AccessForm integrado ao backend

- [x] 3.1 Estender `landing/AccessForm.tsx`: + campo `nome`, + checkbox LGPD (link `/privacidade`), honeypot oculto
- [x] 3.2 Normalizar `athletes` (inteiro positivo; rejeitar 0/negativo/vazio/NaN) → `qtdAtletas` (faixa) e `perfil = TREINADOR`; montar `WaitlistInput` completo; envolver em `Box component="form" onSubmit`
- [x] 3.3 Consumir `{ status, error, inscrever }` do `useWaitlist` **direto** (não `onSubmit` que resolve sempre — senão 400/429 vira sucesso visual); estados sucesso/erro preservando valores
- [x] Validação: `npm run lint` + `npm run build` ✓

## 4. Composição e rota

- [x] 4.1 Reescrever `pages/landing/LandingPage.tsx` — `ThemeProvider(landingTheme)` + seções + `onSubmit` (FinalCta)
- [x] 4.2 CTAs/nav-links rolam para as seções via `onClick` + `scrollIntoView()` (**não** `href="#..."` — colide com o hash router); manter a rota `/waitlist` intacta; footer com `getFullYear()`; limpar locals/imports não usados
- [x] 4.3 Adicionar assets em `src/assets/landing/`: logo (usar o `files/logo.png` provisório) + foto do fundador (placeholder explícito, ex. `founder-placeholder.jpg`). Build sem 404; render visual sem imagem quebrada
- [x] 4.4 **(descoberto na verificação visual)** Liberar a rota `/` para a landing: o `index` do `ProtectedRoute` (home autenticada legada) sombreava `/` e redirecionava ao login. Move a home legada para `/inicio` (path explícito), repontando o redirect pós-login do `LoginPage` e o logo do `DashboardHeader`. Sem o fix, AC1 não se cumpre
- [x] Validação: `npm run lint` + `npm run build` ✓; landing verificada no navegador em `/`

## 5. Testes

- [x] 5.1 `AccessForm.test.tsx` (6) — validação (nome/email/LGPD), payload completo com faixa mapeada + perfil TREINADOR, **erro do hook vira estado de erro** preservando valores, honeypot; `athleteRange.test.ts` — limites de faixa (1/10/11/30/31/100/101)
- [x] 5.2 `LandingPage.test.tsx` — render das seções (hero + CTA) e CTA rola via `scrollIntoView` sem navegar (substitui o teste antigo dos CTAs)
- [x] Validação: `npm run test:run` (266, 0 falhas) + `lint` + `build` ✓

## 6. Aceitação e limpeza

- [x] 6.1 AC1–AC8 verificados: **AC1 verificado no navegador** (`/` renderiza a landing premium após o fix de rota 4.4) + audit + `LandingPage.test`; AC2 (tema escopado + suite 271 verde sem regressão); AC3/AC4/AC5 (`AccessForm`/`athleteRange` tests); AC6 (`/waitlist` intacta — verificada no navegador); AC7 (a11y); AC8 (auditoria de cor + gráfico CTL/ATL/TSB)
- [x] 6.2 Auditoria de cor: `grep` em `src/landing` + `LandingPage.tsx` + `landingTheme.ts` retornou **LIMPO** (zero hex cru)
- [ ] 6.3 (pré-go-live, **não bloqueia a implementação**) Substituir placeholders pelos assets reais (logo oficial transparente + foto do fundador) e completar `trust.founderBio`
- [ ] 6.4 (no `/done` desta change, **pós-merge** — não durante a implementação) Arquivar `marketing-landing-page` como superada por esta

## 7. Adições durante a implementação (a pedido do usuário)

- [x] 7.1 **Vídeo de showcase no hero** — `landing/VideoShowcase.tsx`: faixa full-width abaixo do nav (loop ambiente mudo 1280×720/10s, autoplay forçado via `useEffect`, `prefers-reduced-motion`), fade na base para o navy; o hero sobe e sobrepõe a zona fundida. Asset `src/assets/landing/showcase.mp4`. Verificado no navegador
- [x] 7.2 **Link "Entrar" (login)** no nav da landing → `/auth/login` (o `Entrar` antigo havia saído no redesign). Verificado no navegador
- [ ] 7.3 (follow-up, não bloqueia) Nav mobile: links/CTA/login só aparecem em `md+`; avaliar um menu mobile (drawer) para a landing
