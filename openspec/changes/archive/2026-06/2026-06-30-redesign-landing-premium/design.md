## Context

Existe uma landing premium v2.0 já desenhada e portada para React + MUI + TS (em `files/`), com
`theme.premium.ts` (tokens) já presente no repo. Esta change porta essa landing para o
`menthoros-front`, substituindo a `LandingPage.tsx` atual (582 linhas, com hex cru), e integra o form
de captura ao backend de waitlist (`POST /api/v1/waitlist`) já existente.

Referência canônica: a pasta **`files/` na raiz do workspace**
(`menthoros-workspace/files/`, fora de git — não versionada): `{LandingPage.tsx, sections.tsx,
primitives.tsx, ProductUI.tsx, AccessForm.tsx, content.ts, landing-README.md, logo.png}`. Esses arquivos
são **portados/adaptados** para `apps/menthoros-front/src/` (não são consumidos in-place).

## Goals / Non-Goals

**Goals**

- Acabamento premium (tipografia, ritmo, micro-animações, telas de produto em código), token-driven.
- Zero hex cru nos componentes (auditoria de cor).
- Captura de lead inline integrada ao `/api/v1/waitlist`, sem mudar o backend.
- Tema premium escopado à landing, sem regressão nas telas autenticadas.

**Non-Goals**

- Mudança no backend / contrato de API.
- Adotar o tema premium globalmente.
- Definir preço/planos (omitido por ora).
- Novo site/domínio separado.

## Decisions

### D1 — Arquitetura de arquivos (port)

Espelha a referência, adaptando paths ao repo:

```
src/
  theme/
    theme.premium.ts        # tokens (já existe) — fonte de verdade
    landingTheme.ts         # NOVO: createTheme(...) derivado de premiumTokens
  pages/landing/
    LandingPage.tsx         # REESCRITO: ThemeProvider(landingTheme) + seções + onSubmit
  landing/                  # NOVO módulo
    content.ts              # copy
    primitives.tsx          # Reveal, Eyebrow, SectionHeading, CtaButton, PriorityBadge
    ProductUI.tsx           # AttentionQueue, LoadChart, InterpretationCard
    AccessForm.tsx          # form inline (estendido p/ o backend)
    sections.tsx            # Nav, Hero, Pain, HowItWorks, Delta, Capabilities, Fit, Trust, Faq, FinalCta, Footer
```

### D2 — Tema premium escopado à landing

`theme.premium.ts` exporta apenas `premiumTokens` (não um tema MUI) — a referência importa um `theme`
default que **não existe**; port mecânico quebra o build. Criar `theme/landingTheme.ts` com
`createTheme(...)` mapeando os tokens para o `Theme` do MUI; **proibir** import default de
`theme.premium.ts`.

Pontos verificados na pré-mortem (evitam `tsc`/runtime quebrado):
- **`semantic` é flat** em `premiumTokens` (`danger`/`warning`/`success`/`info`, não escala `[500]`).
  Mapear explícito: `error.main = semantic.danger`, `warning.main = semantic.warning`, etc. — copiar o
  padrão escalonado do `App.tsx` geraria `undefined`.
- **`surfaceShift.panel/raised`** é usado pelas seções/`ProductUI` mas **não existe** no `Palette`
  padrão do MUI. Opções: (a) **module augmentation** de `Palette.surfaceShift` no `landingTheme.ts`, ou
  (b) trocar esses usos por imports diretos dos tokens tipados. Preferir (a) para manter o `useTheme()`
  das seções.
- `palette.primary.main = primary[500]` (#BDDE5A); `background.default/paper = surface.*`; `text.*`;
  `divider`; typography Inter (corpo) + Space Grotesk (headings).

A `LandingPage` envolve a composição num `ThemeProvider(landingTheme)` aninhado — **escopo local**, o
`App.tsx` mantém o tema atual. **Não** duplicar `CssBaseline` (o App já tem um global); limitar
`GlobalStyles` da landing a um seletor raiz para não vazar reset/body para as telas autenticadas (AC2).
Validar visualmente portais (Select/Menu/Dialog/Tooltip) na landing. (Alternativa rejeitada: tema
global — alto blast radius.)

### D3 — Reconciliação do form com o backend

O `AccessForm` da referência coleta só `{ email, athletes }`. O `POST /api/v1/waitlist` exige
`nome`, `email`, `perfil` e `aceiteLgpd=true`. Estender o `AccessForm`:

- **+ campo `nome`** (obrigatório).
- **+ checkbox de aceite LGPD** (obrigatório, com link p/ `/privacidade`) — bloqueia o envio sem aceite.
- **`athletes` (número) → `qtdAtletas` (faixa):** `1–10→ATE_10`, `11–30→DE_11_A_30`,
  `31–100→DE_31_A_100`, `>100→MAIS_DE_100`.
- **`perfil = TREINADOR`** fixo (a landing mira assessorias).
- **honeypot** oculto (mesma defesa da `WaitlistPage`).

O `AccessForm` MUST montar um **`WaitlistInput` completo** (nome, email, perfil=TREINADOR, qtdAtletas,
aceiteLgpd, website) — não "adaptar no último segundo". Reaproveitar o padrão da `WaitlistPage` (checkbox
LGPD + link `RouterLink to="/privacidade"` + honeypot oculto).

**Erro silencioso (crítico):** o `useWaitlist.inscrever` **captura** o erro e não relança; o `AccessForm`
da referência só entra em `status="error"` se o `onSubmit` **lançar**. Plugar os dois ingenuamente faz um
`400/429` virar **sucesso visual**. → O `AccessForm` MUST consumir diretamente `{ status, error,
inscrever }` do `useWaitlist` (não um `onSubmit` que resolve sempre). O estado de sucesso/erro vem do
hook.

**Normalização de `athletes`:** inteiro positivo obrigatório (`Number.isFinite`, `> 0`, trim de vazio);
rejeitar `0`/negativo/`""`/`NaN`. Mapear para faixa com limites testados (`1/10/11/30/31/100/101`).

**Submit:** envolver os campos em `Box component="form" onSubmit={...}` (a referência usa só clique —
Enter no input não envia); bloquear double-submit via `status === 'submitting'`.

Mantém o contrato do backend intacto.

### D4 — Form inline + rota `/waitlist` coexistem

A `FinalCta` usa o `AccessForm` inline (conversão na própria landing). A rota `/waitlist`
(`WaitlistPage`) permanece para links diretos/campanha. Ambos consomem o **mesmo** `useWaitlist`/
`WaitlistService` — fonte única de lógica de envio, sem duplicar regra.

**Âncoras vs hash router (crítico):** o app usa `createHashRouter`, então o `#` já é da rota (`#/`). Os
links da referência (`href="#how"`, `href="#acesso"`) **sobrescreveriam a rota** em vez de rolar. → Os
CTAs/nav-links MUST usar `onClick` com `document.getElementById(id)?.scrollIntoView()` (não `href="#..."`).
O link do LGPD usa `RouterLink to="/privacidade"`.

### D5 — Fontes e performance

O `index.html` já carrega Inter/Syne — a referência injeta Space Grotesk/Inter/JetBrains Mono por
`@import` em `GlobalStyles` (FOUC + cascata contraditória). → Substituir por **um único `<link>`** no
`index.html` cobrindo Inter + Space Grotesk + JetBrains Mono; **remover** o `@import` da landing. Medir o
bundle da landing no build; code-split se crescer demais.

**Limpeza do port (build):** remover variáveis/imports não usados (a referência tem `const t =
useTheme()` ocioso em `Hero` — `noUnusedLocals` quebra o build); `erasableSyntaxOnly` está ativo (sem
enum/namespace/parameter-property em novos helpers); footer com `new Date().getFullYear()` (a referência
fixa `© 2025`).

### D6 — Acessibilidade (preservar da referência)

Foco visível (`*:focus-visible` com outline primary), headings semânticos, FAQ navegável por teclado,
`prefers-reduced-motion` respeitado nas animações (`Reveal`).

### D7 — Disciplina de cor

Lime (`primary.main`) só em marca/ação, ≤3 momentos por seção. No gráfico de carga: CTL=`primary`,
ATL=`text.secondary` (steel), TSB=`warning` (amber). Categóricas (séries) ≠ semânticas (estados).

**Regra de "zero hex cru":** vale para **cores de marca/estado** literais em componentes. `rgba()`/alpha
derivados de tokens (shadows, overlays glass) em `ProductUI`/`primitives` são **permitidos** (já é o
padrão do `glass`/`overlays` do repo) — não conta como hex cru. A auditoria foca em hex de cor (`#RRGGBB`)
fora dos tokens.

### D8 — Supersede da change anterior

A `marketing-landing-page` (ativa, nunca arquivada) é **superada** por esta. Ao concluir, arquivá-la
como superada (no `/done` desta change ou em limpeza de OpenSpec).

### D9 — Liberar a rota `/` para a landing (descoberto na verificação visual)

A rota `{ path: '/', element: <LandingPage/> }` estava **sombreada** pelo `{ index: true, element:
<HomePage/> }` do `ProtectedRoute` (layout sem `path`): o React Router casava o index protegido e, sem
token, redirecionava ao login — a landing nunca aparecia em `/`. Bug **pré-existente** (vem da
`marketing-landing-page`), mas bloqueia o AC1 desta change. Decisão (confirmada com o usuário): **`/`
sempre landing pública**; a home autenticada legada move para **`/inicio`** (path explícito em vez de
index). Ajustes: `App.tsx` (index → `path: 'inicio'`), `LoginPage` (redirect pós-login e já-logado →
`ROUTES.INICIO`), `DashboardHeader` (logo → `/inicio`). Verificado no navegador. (Teste automatizado de
`<App/>` inviável: importa `@mui/x-data-grid` cujo `.css` o vitest não resolve — nenhum teste do repo
renderiza `<App/>`; verificação é live.)

## Component Reuse

- **Reusa:** `hooks/useWaitlist`, `services/WaitlistService`, `types/Waitlist` (faixa/perfil),
  `pages/waitlist/PrivacidadePage` (link do LGPD), `theme/theme.premium.ts` (tokens).
- **Cria:** `theme/landingTheme.ts`, `landing/*` (5 arquivos), reescreve `pages/landing/LandingPage.tsx`.

## Testing Strategy

- **Componente (Vitest + Testing Library):** `AccessForm` — validação (email, nome, atletas, LGPD),
  mapeamento atletas→faixa, fluxo sucesso/erro com `useWaitlist` mockado, valores preservados em erro,
  honeypot. `LandingPage` — render das seções principais, CTA rola para a FinalCta, sem redirect.
- **Auditoria de cor:** garantir ausência de hex cru nos componentes da landing (lint/review).
- **Gate:** `npm run lint && npm run build && npm run test:run`.

## Rollout / Rollback

- Rollout: substitui a home `/`. Sem feature flag (página pública isolada).
- Rollback: reverter o PR restaura a `LandingPage` anterior. Assets/fontes adicionados são inertes.
