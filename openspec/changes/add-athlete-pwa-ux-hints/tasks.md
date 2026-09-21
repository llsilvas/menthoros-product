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

- [x] 1.1 *Entregue (commit `2769492`, 3 testes):* `useOnlineStatus()` em `src/features/athlete/hooks/useOnlineStatus.ts`: `useState(() =>
      navigator.onLine)`, `useEffect` registrando `online`/`offline` em `window` (com cleanup).
      *verify (TDD):* teste com `vi.spyOn(navigator, 'onLine', 'get')` pro estado inicial e
      `window.dispatchEvent(new Event('offline'))`/`'online'` dentro de `act` → estado alterna;
      unmount remove os listeners (`removeEventListener` espiado).
- [x] 1.2 *Entregue (commit `2769492`, 8 testes — matriz completa incl. `display-mode: standalone`
      e jsdom sem `matchMedia`):* `useIosInstallHint()` em `src/features/athlete/hooks/useIosInstallHint.ts`: `canShow =
      navigator.standalone === false && !matchMedia('(display-mode: standalone)').matches &&
      !dispensado`; `dismiss()` grava `localStorage['menthoros:pwa-ios-hint-dismissed'] = '1'`
      (try/catch como em `useInstallPrompt`). **Sem UA sniffing** (R1) — `navigator.standalone` é
      só WebKit iOS: `false` = Safari em aba, `true` = lançado da tela inicial, `undefined` =
      outra plataforma. Tipar com **augment global** — `declare global { interface Navigator {
      standalone?: boolean } }` no próprio arquivo do hook (DoR rodada 2: `interface Navigator`
      solta num módulo com `import`/`export` é local e `navigator.standalone` não compila).
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

- [x] 1.3 *Entregue (commit `f15b2b1`; 2 + 1 testes):* `IosInstallHintBanner` e `OfflineBanner` em `src/features/athlete/layout/` — puros, mesmo
      estilo do `InstallPromptBanner` (`elevation.panel`, `content.divider`, `text.*`). Textos:
      "No iPhone: toque em Compartilhar e depois em 'Adicionar à Tela de Início'" + botão
      "Entendi"; "Você está offline — os dados vão atualizar quando a conexão voltar" (sem botão,
      tom neutro — não é `semantic.danger`). Sem termo de persona.
      *verify:* component tests: textos e `role="button"` "Entendi" chama `onDismiss`; offline
      renderiza como `role="status"` (a11y: leitor de tela anuncia sem roubar foco).
- [x] 1.4 *Entregue (commit `f15b2b1`; slot com 6 testes da matriz de precedência; os 5 testes de
      `AthleteLayout` continuaram verdes sem mudar uma asserção):* `AthleteShellBanner` em `src/features/athlete/layout/`: consome `useOnlineStatus`,
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

- [x] 1.5 *Entregue (commit `5c229b7`):* `npx playwright test tests/e2e/pwa` → **4 passed, EXIT=0**
      do Playwright (3 do `service-worker.spec.ts` + 1 novo). `tests/e2e/pwa/offline-banner.spec.ts` sobre a fixture PKCE (mock **antes** do primeiro
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
      ambíguo. Registrar `page.route('**/api/v1/**', r => r.fulfill(json([])))` **antes** dos
      específicos — o Playwright dá precedência ao handler registrado por último. **Por cima do
      catch-all, obrigatoriamente** (DoR rodada 2): os 4 nomeados acima **e**
      `**/api/v1/atletas/atleta-uuid/calibracao**` com **status 204 sem corpo** (como
      `home.spec.ts:86`) — um `[]` truthy vira "status de calibração válido" com campos
      `undefined` e renderiza o banner de calibração, sujando o baseline "sem banner". Assim a home
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

- [x] 1.6 *Entregue (exit codes reais, gravados em log — nunca de pipe):* `npm run lint` limpo;
      `npm run build` EXIT 0; `npm run test:run` **202 arquivos / 1627 testes**; `npx playwright
      test` (suíte inteira) **104 passed / 0 failed**, EXIT 0 (CA4-ci). QA gate na seção 5.
      `npm run lint && npm run build && npm run test:run` verdes e `npm run test:e2e` com exit
      real do Playwright (CA4-ci); atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 1.7 **Evidência manual (founder, em `develop`, junto com a 1.8 da change anterior; gate de
      promoção, não de merge):** iPhone real/Safari — hint visível em aba; após "Adicionar à Tela
      de Início" e abrir pelo ícone, hint ausente (CA5-man).

## 5. QA gate (2026-09-21) — `frontend-reviewer` + `clean-code-reviewer` + Codex, em paralelo

**Nenhum achado Critical nos três.** Codex: **APROVADO**, nenhum defeito verificado no diff.

Aceito e corrigido (commit `01774c9`):
- Os três banners do slot repetiam o mesmo `sx` de container — 3ª ocorrência (clean-code
  Important #2) → `shellBannerSx`/`shellBannerRowSx` em `layout/`, sem mudança de comportamento
  (16/16 nos 5 arquivos afetados, lint, build).

Refutado com evidência:
- "Nomear o tipo de retorno de `useIosInstallHint` para evitar drift nos mocks" (frontend
  Important #2): `vi.mocked(hook).mockReturnValue({...})` já é tipado contra `ReturnType` do hook —
  mudança de shape quebra o teste em compile time; e `useInstallPrompt` existente também não
  nomeia. Sem ação.
- "Slot chama os três hooks mesmo quando offline já decide" (frontend Important #1): o próprio
  revisor rebaixa — chamar hooks condicionalmente violaria as Rules of Hooks. Sem ação.

Débito documentado, sem ação:
- `lerDispensa`/`gravarDispensa`/`rodandoInstalado` quase idênticos entre `useIosInstallHint` e
  `useInstallPrompt` (2ª ocorrência; clean-code Important #1) — extrair um `usePwaDismissal(key)`
  só na 3ª (ex.: hint de update do SW).
- `role="status"` + `aria-live="polite"` redundantes no `OfflineBanner` (frontend Minor) — o
  padrão mais compatível entre leitores de tela; mantido.

Conformidade confirmada pelos três: tokens (nenhum hex), hook × apresentação, `declare global`
correto, nomenclatura, a11y, `AthleteLayout` sem regressão (5 testes inalterados), E2E com
catch-all antes dos mocks nomeados e `calibracao` 204.
