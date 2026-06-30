**Tamanho:** L · **Trilha:** Full

> Critérios da trilha: incerteza de design (redesign visual), integra o contrato de API existente
> (`POST /api/v1/waitlist`) e introduz uma nova arquitetura de tema/landing. Frontend-only (1 repo).

## Why

A `LandingPage.tsx` atual (582 linhas) cumpre o básico, mas tem acabamento aquém do desejado e
**hex cru hardcoded** (`LIME`, `NAVY_DARK`, `glassCard`) — fora do design system. Existe uma
**landing premium v2.0** já desenhada e portada para React + MUI + TypeScript (em `files/`, com
`theme.premium.ts` já no repo) que eleva o acabamento visual (tipografia Space Grotesk/Inter/JetBrains
Mono, ritmo de seções, micro-animações, duas telas de produto em código) e **já fala a língua do
treinador** (coach-in-the-loop: "a IA não substitui você", "sem nunca tirar você do comando").

O objetivo é **qualidade visual / premium**: portar essa landing para o `menthoros-front`,
substituindo a atual, integrando ao backend de waitlist que já existe.

## What Changes

- Substituir `pages/landing/LandingPage.tsx` pela composição premium (11 seções: Nav, Hero, Pain,
  HowItWorks, Delta, Capabilities, Fit, Trust, Faq, FinalCta, Footer).
- Criar o módulo `landing/`: `content.ts` (copy), `primitives.tsx` (Reveal, Eyebrow, SectionHeading,
  CtaButton, PriorityBadge), `ProductUI.tsx` (AttentionQueue, LoadChart, InterpretationCard),
  `AccessForm.tsx` (form inline), `sections.tsx`.
- Criar um **tema MUI premium** a partir de `theme.premium.ts` (`premiumTokens`) e **escopá-lo à rota
  da landing** via `ThemeProvider` (o resto do app mantém o tema atual).
- **Integrar o form ao `/api/v1/waitlist`**: estender o `AccessForm` (que coletava só email + nº de
  atletas) para satisfazer o backend — adicionar campo **nome** e **checkbox de aceite LGPD**, mapear
  o nº de atletas para a faixa (`qtdAtletas`), e assumir `perfil = TREINADOR` (a landing mira
  assessorias). Reusa `useWaitlist`/`WaitlistService` — **sem mudança no backend**.
- **Form inline na landing** (FinalCta) **+ manter a rota `/waitlist`** — ambos gravam no mesmo
  endpoint. Fontes via `index.html` (preferível ao `@import` em runtime).

## Capabilities

### Modified Capabilities

- `marketing-landing-page`: a landing passa de funcional para **premium** — nova arquitetura
  token-driven (zero hex cru), seções com narrativa centrada no treinador, telas de produto em código,
  e captura de lead inline integrada à waitlist.

## Impact

- **UI (frontend):** reescrita de `pages/landing/LandingPage.tsx`; novo módulo `landing/` (5 arquivos);
  novo tema MUI premium (`theme/landingTheme.ts` derivado de `theme.premium.ts`).
- **Assets:** logo (usar o oficial transparente, não o extraído do mockup) e foto do fundador.
- **Fontes:** Space Grotesk / Inter / JetBrains Mono via `index.html`.
- **Integração:** `AccessForm` → `useWaitlist` → `POST /api/v1/waitlist` (contrato inalterado).
- **Sem backend, sem DB, sem novo contrato de API.**

## Critérios de aceite

- **AC1 — landing premium na home:** *Given* um visitante *When* abre `/` *Then* vê a landing premium
  (11 seções) renderizada com o tema premium, **sem** hex cru nos componentes.
- **AC2 — tema escopado:** *Given* a landing renderiza *Then* usa o tema premium; *And* as telas
  autenticadas continuam com o tema atual (sem regressão visual fora da landing).
- **AC3 — captura inline integrada:** *Given* o form inline (FinalCta) preenchido (email, nome, nº de
  atletas, aceite LGPD) *When* enviado *Then* faz `POST /api/v1/waitlist` e mostra o estado de sucesso;
  *And* preserva os valores em erro.
- **AC4 — mapeamento de faixa:** *Given* o nº de atletas informado *When* enviado *Then* mapeia para a
  faixa correta (`1–10→ATE_10`, `11–30→DE_11_A_30`, `31–100→DE_31_A_100`, `>100→MAIS_DE_100`) e
  `perfil = TREINADOR`.
- **AC5 — LGPD:** *Given* o aceite LGPD não marcado *Then* o envio é bloqueado com aviso + link p/
  `/privacidade`.
- **AC6 — rota /waitlist mantida:** *Given* `/waitlist` *Then* continua acessível e funcional (mesmo
  endpoint).
- **AC7 — a11y:** foco visível, headings semânticos, FAQ navegável por teclado, `prefers-reduced-motion`
  respeitado.
- **AC8 — disciplina de cor:** lime só como marca/ação (`primary.main`), ≤3 momentos lime por seção;
  categóricas ≠ semânticas no gráfico (CTL=primary, ATL=text.secondary, TSB=warning).

## Métrica de sucesso

**Verificável na entrega (gate de aceitação):**

- **Captura sem erro:** o form inline registra leads válidos via `/api/v1/waitlist` com **zero erro de
  submit** no fluxo feliz (coberto por teste).
- **Auditoria de cor:** **zero hex cru** (`#RRGGBB` fora de `theme/` e `shared/design-tokens/`) nos
  componentes da landing — verificável por `grep` (ver tasks 6.2).

**Direcional (medida pós-go-live, não bloqueia a entrega):**

- **Conversão landing → waitlist** (submissões ÷ visitantes). Como **não há baseline instrumentado hoje**,
  registra-se um **snapshot no go-live** e acompanha-se a tendência. Persona-alvo: o **treinador**
  (assessoria), coerente com a estrela-guia. (Tráfego/distribuição importam tanto quanto o redesign — ver
  Open Questions.)

## Open Questions & Assumptions

**Decisões tomadas:**

- Tema premium **escopado à landing** (não global).
- Form **estendido** (nome + LGPD; atletas→faixa; perfil=TREINADOR) reusando `/api/v1/waitlist`.
- **Form inline + rota `/waitlist`** coexistem (mesmo endpoint).

**Premissas assumidas:**

- O `theme.premium.ts` (tokens) é a fonte de verdade; o tema MUI é derivado dele (não há hex novo).
- A referência em `files/` é o design canônico a portar (ajustando imports/paths ao repo).
- A landing premium **substitui** a atual em `/` (a change `marketing-landing-page` é superada por esta).

**Em aberto (produto — revisão `product-reviewer`, veredito Go). Nenhum bloqueia a implementação:**

- **Baseline de conversão** — *resolvido:* métrica reformulada (snapshot pós-go-live; verificável =
  captura sem erro + auditoria de cor). **Não bloqueia.**
- **Tráfego/distribuição** — **adiável** (operacional/marketing); não afeta a implementação.
- **Bio/foto do fundador** — **bloqueia go-live, não a implementação:** implementar com placeholder
  explícito (task 4.3); substituir no go-live (task 6.3).
- **"Turma fundadora · vagas limitadas"** — **adiável:** implementar assumindo real; validar curadoria
  antes do go-live.
- **"Performance intelligence" (eyebrow)** — **decisão de conteúdo, default manter** (termo técnico
  familiar no nicho); revisável em `content.ts` a qualquer momento. Não bloqueia.

**Em aberto (técnico/go-live):**

- **Logo oficial** transparente (horizontal p/ a nav) — implementar com o `logo.png` provisório da
  referência; trocar no go-live (task 6.3).
- **Preço/planos:** a referência omite; manter omitido até definição.
- A change `marketing-landing-page` (ativa, nunca arquivada) é arquivada como **superada** no `/done`
  desta change (pós-merge), não durante a implementação (ver task 6.4).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **Erro silencioso no form inline** (`useWaitlist` não relança → 400/429 vira sucesso visual) | `AccessForm` consome `{status,error,inscrever}` do hook direto, não `onSubmit` que resolve sempre |
| **`surfaceShift`/`semantic` flat** quebram o `createTheme` (não existem no Palette MUI / não são escala) | `landingTheme.ts` com module augmentation de `surfaceShift` + mapeamento explícito de `semantic` flat |
| **Âncoras `#how` colidem com o hash router** (sobrescrevem a rota) | CTAs com `onClick` + `scrollIntoView()`, não `href="#..."` |
| Regressão visual fora da landing ao mexer no tema | Tema escopado via `ThemeProvider` aninhado; sem `CssBaseline` duplicado; `GlobalStyles` com seletor raiz |
| Payload inválido (form da ref. só tem email+atletas) | `AccessForm` monta `WaitlistInput` completo (nome/perfil/LGPD/honeypot), reusa padrão da `WaitlistPage` |
| Mapeamento atletas→faixa com edge cases (0, negativo, vazio) | Normalizar (inteiro positivo) + testes nos limites 1/10/11/30/31/100/101 |
| FOUC / cascata de fontes contraditória | Um único `<link>` no `index.html` (Inter+Space Grotesk+JetBrains Mono); remover `@import` |
| Build quebra no port (`noUnusedLocals`, asset path, `© 2025`) | Limpar locals/imports; assets reais ou placeholder; `getFullYear()` |
| Hex cru reintroduzido | Auditoria de cor (hex `#RRGGBB` fora de tokens); `rgba()` derivado de token é permitido |
