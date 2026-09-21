**Tamanho:** XS · **Trilha:** Fast · **Status:** 🟡 proposta (2026-09-20) — follow-up de
`add-athlete-pwa-installable` (decisões Q2/Q5/Q10 do grill de 2026-09-20)
**Criado:** 2026-09-20

```yaml
id: add-athlete-pwa-ux-hints
motivation: >
  add-athlete-pwa-installable entregou o PWA instalável, mas deixou dois non-goals explícitos que
  são exatamente onde o Atleta trava: (1) no iPhone não existe prompt de instalação — a Apple não
  expõe beforeinstallprompt — e "Compartilhar → Adicionar à Tela de Início" é um gesto que quase
  ninguém descobre sozinho (gargalo real de adoção no iOS); (2) offline, o app não fica em tela
  branca, mas também não diz que está offline — o Atleta vê erro de dados sem entender o motivo.
scope:
  repos: [apps/menthoros-front]
  inclui: >
    hint estático de instalação para iOS Safari fora de standalone (dispensável, persistido);
    banner "Você está offline" no shell do atleta, reativo a online/offline; ambos no mesmo slot
    acima da AthleteBottomNav que o banner de instalação já usa.
  exclui: >
    detecção de "voltou a rede" com re-restauração automática de sessão (non-goal mantido de
    add-athlete-pwa-installable, decisão 12); passo a passo ilustrado/animado para iOS; web push;
    qualquer mudança de backend, contrato de API ou schema; qualquer mudança em auth.
acceptance_criteria: [CA1 hint iOS aparece só em iOS Safari fora de standalone e some ao dispensar (ci), CA2 banner offline aparece/some com os eventos offline/online sem reload (ci+e2e), CA3 offline tem precedência sobre o banner de instalação e ambos nunca coexistem (ci), CA4 lint+build+test:run+test:e2e verdes (ci), CA5 hint iOS visível num iPhone real fora de standalone e ausente após adicionar à tela inicial (man)]
risks:
  - id: R1
    descricao: Detecção de "iOS Safari fora de standalone" por User-Agent é frágil (iPadOS se apresenta como Mac; Chrome/Firefox no iOS são WebKit com UA próprio).
    mitigacao: >
      Usar `navigator.standalone` — propriedade **só do MobileSafari** (DoR rodada 1, Codex): `false`
      = Safari iOS em aba, `true` = lançado da tela inicial, `undefined` = qualquer outro browser,
      **inclusive Chrome/Firefox no iOS** (WKWebView não a expõe) — combinada com `display-mode:
      standalone`. Consequência aceita: o hint não aparece no Chrome iOS (falso negativo conhecido;
      Safari é o browser padrão e o único com evidência manual, CA5). Falso positivo (mostrar no
      Android/desktop) não acontece — por isso a condição exige `=== false`, não `!== true`.
  - id: R2
    descricao: Dois banners no mesmo slot (instalação Android, hint iOS, offline) podem empilhar e empurrar a bottom nav.
    mitigacao: Um único componente de slot decide UMA mensagem por vez, com precedência offline > hint iOS > instalação (grill Q9 já fixou o slot; instalação e hint iOS são mutuamente exclusivos por plataforma).
  - id: R3
    descricao: `navigator.onLine` pode mentir "true" (portal cativo) e nunca mente "false".
    mitigacao: O banner só afirma "offline" quando `onLine === false` — mesma confiabilidade assimétrica já assumida pela guarda do AuthProvider (decisão 12 da change anterior). Não tenta detectar conectividade real.
---

> **Revisão 1 (DoR, 2026-09-21 — Codex adversarial, 3 achados, todos confirmados no código):**
> (1) **Important:** o E2E apontava pra `/#/atletas` com o papel padrão `ADMIN` — rota do
> `DashboardLayout` do coach, onde o slot não existe. Corrigido pra `/#/athlete/home` como
> `ATLETA`, com os mocks mínimos de `tests/e2e/athlete/home.spec.ts` (`users/me` com
> `onboardingConcluido: true` evita o redirect de onboarding). (2) **Important:** a matriz do
> hook iOS não cobria `display-mode: standalone` casando, e o jsdom não fornece `matchMedia` —
> hook guarda `typeof window.matchMedia === 'function'` como `useInstallPrompt`, teste stuba com
> `vi.stubGlobal` (padrão de `useInstallPrompt.test.ts:105-108`) e ganha o caso standalone →
> `false`. (3) **Minor:** `navigator.standalone` é só do MobileSafari — Chrome/Firefox no iOS
> (WKWebView) não a expõem; eu tinha afirmado o contrário. R1 reescrito: falso negativo
> conhecido no Chrome iOS, aceito.
>
> **Revisão 2 (DoR, 2026-09-21 — Codex rodada 2, 2 achados, ambos confirmados):** (1)
> **Important:** a tipagem de `navigator.standalone` estava errada — `interface Navigator` solta
> num módulo é local; exige `declare global { interface Navigator { standalone?: boolean } }`.
> (2) **Important:** o catch-all `**/api/v1/**` → `[]` que eu acrescentei na task 1.5 devolveria um
> array truthy pra `calibracao`, que a home trata como status válido (banner de calibração com
> campos `undefined`) — o mock específico **204** (`home.spec.ts:86`) entra por cima do catch-all.
> Confirmado correto: mover `useInstallPrompt` pro slot preserva as asserções de
> `AthleteLayout.test.tsx`; os 4 mocks nomeados + catch-all bastam pra montar o `AthleteLayout`.

## Why

`add-athlete-pwa-installable` (PR #122, 2026-09-20) deixou duas coisas explicitamente fora, por
decisão do founder no grill: o hint para iOS e o estado offline. As duas têm o mesmo perfil —
uma linha de UI no shell do atleta, zero dependência nova, zero risco de auth/tenant — e o mesmo
motivo de existir: o Atleta (glossário; nunca "aluno") é persona mediada, e churn de atleta é
churn de coach. No iOS, sem o hint, a instalação simplesmente não acontece; offline, sem o
estado, o erro de dados parece bug.

## What Changes

Somente `apps/menthoros-front`:

1. **`useIosInstallHint`** (`src/features/athlete/hooks/`) — `canShow` quando
   `navigator.standalone === false` (WebKit iOS em aba) **e** `!matchMedia('(display-mode:
   standalone)').matches` **e** não dispensado; `dismiss()` persiste em
   `localStorage['menthoros:pwa-ios-hint-dismissed']` (try/catch, sem retorno — mesma semântica da
   dispensa do banner de instalação). Sem UA sniffing.
2. **`useOnlineStatus`** (`src/features/athlete/hooks/`) — estado inicial `navigator.onLine`,
   atualizado pelos eventos `online`/`offline` do `window`; sem polling.
3. **`AthleteShellBanner`** (`src/features/athlete/layout/`) — **único** componente de slot acima
   da `AthleteBottomNav`, substituindo a montagem direta do `InstallPromptBanner` no
   `AthleteLayout`: decide uma mensagem por vez com precedência **offline > hint iOS >
   instalação**. `InstallPromptBanner` continua existindo como apresentação; ganha dois irmãos
   puros: `IosInstallHintBanner` ("No iPhone: toque em Compartilhar e depois em 'Adicionar à Tela
   de Início'" + "Entendi") e `OfflineBanner` ("Você está offline — os dados vão atualizar quando
   a conexão voltar", sem botão).
4. **`AthleteLayout`** — passa a montar `AthleteShellBanner` no lugar do `InstallPromptBanner`.

Texto sem termo de persona; tokens do design system (`elevation.panel`, `content.divider`,
`text.*`); offline usa o tom neutro, não `semantic.danger` (não é erro do atleta).

## Impact

- `apps/menthoros-front`: 2 hooks novos + testes, 2 componentes puros novos + testes, 1
  componente de slot + teste, `AthleteLayout.tsx` (+ teste existente ajustado: o banner de
  instalação continua aparecendo com o evento, agora via slot), E2E novo em
  `tests/e2e/pwa/` (offline sem reload → banner). **Sem dependência nova. Backend: zero diffs.**
- `AuthProvider`/`oidcConfig`/SW/manifest: **intocados**.

## Critérios de aceite

**CI (Vitest + Playwright):**

- **CA1-ci** — Given `navigator.standalone === false` e `display-mode` não-standalone, Then o
  hint iOS renderiza; Given `navigator.standalone === true` **ou** `undefined` (Android/desktop),
  Then não renderiza; Given dispensado (chave presente), Then não renderiza e a chave sobrevive
  ao remount.
- **CA2-ci** — Given o shell montado online, When `window` dispara `offline`, Then o banner
  "Você está offline" aparece; When dispara `online`, Then some — sem reload. E2E: logado como
  **ATLETA** (`autenticarComPkce(page, { roles: ['ATLETA'] })`) em **`/#/athlete/home`** com os
  mocks mínimos de `tests/e2e/athlete/home.spec.ts` — DoR rodada 1: `/#/atletas` com `ADMIN`
  monta o `DashboardLayout` do coach, onde o slot não existe —, `context.setOffline(true)` →
  `role="status"` visível; `setOffline(false)` → some.
- **CA3-ci** — Given `beforeinstallprompt` capturado **e** offline, Then só o banner offline
  renderiza; Given hint iOS elegível **e** offline, idem; Given online, a precedência hint iOS >
  instalação nunca coexiste (por plataforma já são exclusivos; o slot garante).
- **CA4-ci** — `npm run lint && npm run build && npm run test:run && npm run test:e2e` verdes.

**Evidência manual (founder, em `develop` — junto com a 1.8 de `add-athlete-pwa-installable`):**

- **CA5-man** — iPhone real, Safari: hint visível; após "Adicionar à Tela de Início" e abrir pelo
  ícone, hint ausente (`navigator.standalone === true`).

## Métrica de sucesso

Sem métrica de produto mensurável (sem analytics no front — mesma situação da change anterior).
Proxy qualitativo: a evidência manual CA5 + ausência de ticket "o app não instala no iPhone" /
"o app quebrou sem internet" nos primeiros 30 dias. Registrar como follow-up de instrumentação
junto com o da change anterior.

## Rollback

Revert do PR único — só UI, sem storage de domínio (as duas chaves de `localStorage` são
conveniência por dispositivo e podem ficar órfãs sem efeito).

## Open Questions & Assumptions

- **Assunção (a confirmar no `/implement init` contra o código):** `AthleteLayout.test.tsx` já
  cobre "com evento o banner aparece antes da `navigation`" — o teste continua válido com o slot,
  só muda o componente montado.
- **Assunção:** `navigator.standalone` é `undefined` no jsdom — os testes stubam via
  `Object.defineProperty(navigator, 'standalone', { value: false, configurable: true })`.
- **Decidido (grill anterior, Q10):** um único follow-up com as duas coisas; não separar.
