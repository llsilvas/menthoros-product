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
      Guardar `typeof window.matchMedia === 'function'` como `useInstallPrompt.ts` faz — o jsdom
      **não** fornece `matchMedia` (DoR rodada 1).
      *verify (TDD):* jsdom não define `standalone` → teste stuba com
      `Object.defineProperty(navigator, 'standalone', { value: false, configurable: true })` e
      restaura no `afterEach`; `matchMedia` stubado como em `useInstallPrompt.test.ts:105-108`
      (`vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q) => ({ matches: q ===
      '(display-mode: standalone)' })))`, `vi.unstubAllGlobals()` no `afterEach`). Matriz completa
      (DoR rodada 1 — o caso standalone faltava): `standalone=false` + não-standalone → `true`;
      `standalone=false` + **`display-mode: standalone` casando → `false`**; `standalone=true` →
      `false`; `undefined` → `false`; sem `matchMedia` (jsdom cru) + `standalone=false` → `true`;
      chave presente → `false` mesmo elegível; `dismiss()` grava e vira `false`; `localStorage`
      lançando → segue sem persistir (CA1-ci).

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
      `goto`). **Rota e papel corrigidos na DoR (rodada 1, Codex):** `/#/atletas` com o papel
      padrão `ADMIN` monta o `DashboardLayout` do coach — o slot nunca apareceria. Usar o shell do
      atleta como `tests/e2e/athlete/home.spec.ts`: `autenticarComPkce(page, { roles: ['ATLETA'] })`,
      mocks mínimos copiados de `mockarHome` (`**/api/v1/users/me**` com `onboardingConcluido:
      true` — sem isso a home redireciona pro onboarding —, `**/api/v1/atletas/me/home`,
      `**/api/v1/atletas/me/readiness`, `**/api/v1/checkins/atleta-uuid/atual`; `mockarHome` é
      função local do spec, não exportada — copiar o subconjunto, **não** refatorar `home.spec.ts`).
      **Catch-all primeiro** (achado próprio no `/implement init`): `mockarHome` cobre 10 rotas
      (`home.spec.ts:51-86` — inclui `treinos`, `provas`, `kudos/recentes`, `planos/atleta-uuid`,
      `calibracao` 204); sob `vite preview` qualquer rota não-mockada cai no proxy morto
      (`ECONNREFUSED`) e enche a home de estados de erro, tornando o baseline "banner ausente"
      ambíguo. Registrar `page.route('**/api/v1/**', r => r.fulfill(json([])))` **antes** dos 4
      específicos — o Playwright dá precedência ao handler registrado por último —, e a home
      renderiza limpa com o mínimo de mocks nomeados),
      `goto('/#/athlete/home')` + `aguardarFluxoEstavel` → `navigation` "Navegação do atleta"
      visível e banner offline **ausente**; `context.setOffline(true)` → `getByRole('status')` com
      "Você está offline" visível; `context.setOffline(false)` → some. Sem reload (a sessão em
      memória sobrevive; o SW registra mas não controla — mesmo regime do d2 de
      `service-worker.spec.ts`). O hint iOS **não** é testável no Desktop Chrome — evidência
      manual (CA5-man).
      *verify:* `npx playwright test tests/e2e/pwa --reporter=line > log 2>&1; echo EXIT=$?` e
      ler a contagem no log (CA2-ci).

## 4. Encerramento

- [ ] 1.6 `npm run lint && npm run build && npm run test:run` verdes e `npm run test:e2e` com exit
      real do Playwright (CA4-ci); atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 1.7 **Evidência manual (founder, em `develop`, junto com a 1.8 da change anterior; gate de
      promoção, não de merge):** iPhone real/Safari — hint visível em aba; após "Adicionar à Tela
      de Início" e abrir pelo ícone, hint ausente (CA5-man).
