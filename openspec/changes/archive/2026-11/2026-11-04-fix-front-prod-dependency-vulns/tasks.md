# Tasks: fix-front-prod-dependency-vulns

Repositório único: `apps/menthoros-front` (`package.json`, `package-lock.json`). Sem migration, sem contrato.
Branch `fix/front-prod-dependency-vulns` (tipo dominante `fix`) a partir de `develop`; worktree se houver
outra sessão no repo.

## 1. Preparação

- [x] 1.1 Confirmar qual lockfile o CI usa (`.github/workflows/ci.yml`: `npm ci` vs `bun install`) e o
      `Dockerfile`. Registrar a resposta na A1 do proposal.
      verify: resposta anotada; `bun.lock` não será tocado.
      Feito: CI (`ci.yml`) e `Dockerfile.cloud` usam `npm ci` / `package-lock.json`; A1 confirmada.
- [x] 1.2 Baseline: `npm ci && npm audit --omit=dev` (esperado: 5) e `npm run lint && npm run build && npm test`
      verdes antes de mexer.
      verify: baseline registrado.
      Feito (worktree, develop): audit prod = 5 (3 high, 2 moderate); lint, build e 2441 testes verdes.

## 2. Atualização

- [x] 2.1 Ler as release notes de `axios` (1.11→1.21) e `react-router` (7.9→7.18) procurando mudança de
      comportamento em interceptors, `NO_PROXY`, redirects, `Link`/`navigate` com URL externa (A2).
      verify: nenhuma breaking relevante, ou ajuste listado como nova task.
      Feito: axios 1.12–1.21 e react-router 7.9–7.18 sem breaking relevante (mudanças de Node/Basic auth/`unstable_`); o front não usa interceptors, `unstable_*` nem `UNSAFE_*`, e `axios` só aparece em `src/api/core/request.ts`.
- [x] 2.2 `npm install axios@^1.21.0 react-router@^7.18.5` (ajusta `package.json` só se o range não cobrir).
      verify: `npm ls axios react-router` mostra ≥ 1.21.0 e ≥ 7.18.5.
      Feito: axios 1.21.0, react-router 7.18.5 (`package.json` ajustado só nesses dois ranges).
- [x] 2.3 `npm audit fix` **sem** `--force` para `form-data`, `follow-redirects` e `yaml` (A3).
      verify: `npm ls form-data follow-redirects yaml` acima das faixas vulneráveis; se pedir `--force`, parar.
      Feito sem `--force`: form-data 4.0.6, follow-redirects 1.16.2, yaml 1.10.3. O audit fix também subiu `vite` para 7.3.7 (semver) — resolve a pergunta aberta do proposal.
- [x] 2.4 `git diff --stat`: só `package.json`/`package-lock.json` (CA5).
      verify: nenhum arquivo de `src/` alterado.
      Feito: só `package.json` e `package-lock.json` mudaram.

## 3. Validação

- [x] 3.1 `npm audit --omit=dev` → 0 high/critical (CA1).
      verify: saída anexada ao PR.
      Feito: `npm audit --omit=dev` = 0 (era 5). Total com dev: 26 (0 high, 2 critical vitest/tinypool — dev, fora de escopo).
- [x] 3.2 `npm run lint && npm run build && npm test` (CA3).
      verify: tudo verde.
      Feito: lint, build e 2441 testes verdes.
- [x] 3.3 E2E: `npx playwright test` local, ou conferir o check `E2E (Playwright)` no PR (CA4).
      verify: login, navegação e uma chamada autenticada passam.
      Feito local: `npx playwright test` = 126 passaram, 0 falharam (31,7 s). O check `E2E (Playwright)` do PR #180 ainda confirma na CI.
- [ ] 3.4 **Adiada (2026-11-04, arquivamento): não registrada; E2E da CI cobriu login e navegação.** Verificação manual rápida em `npm run dev`: login pelo Keycloak, abrir dashboard do coach,
      trocar de rota. Console sem erro novo.
      verify: sem erro no console.

## 4. Entrega

- [x] 4.1 Commit por path explícito (`git add package.json package-lock.json`), mensagem
      `fix(deps): atualiza axios e react-router e corrige transitivas vulneráveis`. PR `fix/front-prod-dependency-vulns`
      para `develop` (via `/pr`), promoção `develop → main`, depois `/done`.
      verify: CI verde (`Lint, build e testes` e `E2E (Playwright)`).
      Feito: PR #180 mergeado em 2026-11-02.

## Fora desta change (registrar como itens separados)

- [ ] Backend: rodar OWASP dependency-check e revisar `postgresql` 42.7.7 / `commons-math3` / `hibernate-types-60`.
- [ ] Front, só dev: `vitest`/`tinypool`/`handlebars`/`vite`/`postcss` e demais achados de ferramental.
- [ ] Front: decidir o destino do `bun.lock` (A1).
