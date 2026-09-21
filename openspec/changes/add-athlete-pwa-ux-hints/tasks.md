# Tasks — add-athlete-pwa-ux-hints

Repo: `apps/menthoros-front`. Validação de cada bloco: `npm run lint && npm run build && npm run
test:run` (E2E onde indicado, com exit code do runner — nunca de um pipe). Backend: **nenhuma
task**. Anchors reais: `src/features/athlete/layout/AthleteLayout.tsx` monta hoje
`{canInstall && <InstallPromptBanner …/>}` entre `</ErrorBoundary>` e `<AthleteBottomNav>`;
`src/features/athlete/hooks/useInstallPrompt.ts` (padrão de hook + `localStorage` em try/catch);
`tests/e2e/pwa/service-worker.spec.ts` d2 (login + `context.setOffline(true)` sem reload —
padrão a reaproveitar); `tests/fixtures/pkceAuth.ts` (`autenticarComPkce`, `aguardarFluxoEstavel`
— mock **antes** do primeiro `goto`).

## 1. Hooks

- [ ] 1.1 `useOnlineStatus()` em `src/features/athlete/hooks/useOnlineStatus.ts`: `useState(() =>
      navigator.onLine)`, `useEffect` registrando `online`/`offline` em `window` (com cleanup).
      *verify (TDD):* teste com `vi.spyOn(navigator, 'onLine', 'get')` pro estado inicial e
      `window.dispatchEvent(new Event('offline'))`/`'online'` dentro de `act` → estado alterna;
      unmount remove os listeners (`removeEventListener` espiado).
- [ ] 1.2 `useIosInstallHint()` em `src/features/athlete/hooks/useIosInstallHint.ts`: `canShow =
      navigator.standalone === false && !matchMedia('(display-mode: standalone)').matches &&
      !dispensado`; `dismiss()` grava `localStorage['menthoros:pwa-ios-hint-dismissed'] = '1'`
      (try/catch como em `useInstallPrompt`). **Sem UA sniffing** (R1) — `navigator.standalone` é
      só WebKit iOS: `false` = Safari em aba, `true` = lançado da tela inicial, `undefined` =
      outra plataforma. Tipar via augment local (`interface Navigator { standalone?: boolean }`).
      *verify (TDD):* jsdom não define `standalone` → teste stuba com
      `Object.defineProperty(navigator, 'standalone', { value: false, configurable: true })` e
      restaura no `afterEach`; casos: `false` → `true`; `true` → `false`; `undefined` → `false`;
      chave presente → `false` mesmo com `standalone === false`; `dismiss()` grava e vira `false`;
      `localStorage` lançando → segue sem persistir (CA1-ci).

## 2. Apresentação e slot

- [ ] 1.3 `IosInstallHintBanner` e `OfflineBanner` em `src/features/athlete/layout/` — puros, mesmo
      estilo do `InstallPromptBanner` (`elevation.panel`, `content.divider`, `text.*`). Textos:
      "No iPhone: toque em Compartilhar e depois em 'Adicionar à Tela de Início'" + botão
      "Entendi"; "Você está offline — os dados vão atualizar quando a conexão voltar" (sem botão,
      tom neutro — não é `semantic.danger`). Sem termo de persona.
      *verify:* component tests: textos e `role="button"` "Entendi" chama `onDismiss`; offline
      renderiza como `role="status"` (a11y: leitor de tela anuncia sem roubar foco).
- [ ] 1.4 `AthleteShellBanner` em `src/features/athlete/layout/`: consome `useOnlineStatus`,
      `useIosInstallHint` e `useInstallPrompt`; renderiza **uma** mensagem: offline → hint iOS →
      instalação → nada (R2). `AthleteLayout.tsx` passa a montar `<AthleteShellBanner />` no
      lugar de `{canInstall && <InstallPromptBanner …/>}` (o `useInstallPrompt` sai do layout e
      vai pro slot).
      *verify (TDD):* teste do slot com os três hooks mockados (`vi.mock` por módulo) cobrindo a
      matriz: offline+instalação → só offline; offline+hint → só offline; hint sozinho; instalação
      sozinha; nada (CA3-ci). `AthleteLayout.test.tsx` existente continua verde sem mudar as
      asserções (o banner de instalação ainda aparece com o evento e ainda precede a `navigation`
      na ordem do DOM) — se precisar de ajuste, é só o import/mocks, não a expectativa.

## 3. E2E

- [ ] 1.5 `tests/e2e/pwa/offline-banner.spec.ts` sobre a fixture PKCE (mock **antes** do primeiro
      `goto`): `autenticarComPkce` + `page.route('**/api/v1/atletas**')` + `goto('/#/atletas')` +
      `aguardarFluxoEstavel` → banner offline **ausente**; `context.setOffline(true)` → banner
      visível (`getByRole('status')` com o texto); `context.setOffline(false)` → banner some. Sem
      reload (a sessão em memória sobrevive). O hint iOS **não** é testável no Desktop Chrome —
      evidência manual (CA5-man).
      *verify:* `npx playwright test tests/e2e/pwa --reporter=line > log 2>&1; echo EXIT=$?` e
      ler a contagem no log (CA2-ci).

## 4. Encerramento

- [ ] 1.6 `npm run lint && npm run build && npm run test:run` verdes e `npm run test:e2e` com exit
      real do Playwright (CA4-ci); atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 1.7 **Evidência manual (founder, em `develop`, junto com a 1.8 da change anterior; gate de
      promoção, não de merge):** iPhone real/Safari — hint visível em aba; após "Adicionar à Tela
      de Início" e abrir pelo ícone, hint ausente (CA5-man).
