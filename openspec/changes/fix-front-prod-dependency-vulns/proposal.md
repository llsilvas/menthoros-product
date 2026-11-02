# Proposal: fix-front-prod-dependency-vulns

**Tamanho:** S · **Trilha:** Fast (um repositório, só `package.json`/`package-lock.json`; atualizações
dentro do semver, sem contrato de API, sem schema, sem código de aplicação esperado)

## Why

O `dependency-audit` de 2026-11-02 em `apps/menthoros-front` achou 5 vulnerabilidades em dependências
que **vão para o bundle de produção** (`npm audit --omit=dev`): 3 high e 2 moderate. O front manda o JWT
do treinador a cada chamada, então o vazamento de header de autenticação e o XSS por open redirect
atingem direto a sessão de quem usa o produto.

| Pacote | Instalado | Sev. | Problema |
|---|---|---|---|
| `axios` (direta) | 1.11.0 | high | DoS por falta de limite de tamanho (GHSA-4hjh-wcwx-xvwj); bypass do `NO_PROXY` que leva a SSRF (GHSA-3p68-rc4w-qgx5) |
| `react-router` (direta) | 7.9.1 | high | XSS por open redirect (GHSA-2w69-qvjg-hvjx); redirect externo por path não confiável (GHSA-9jcx-v3wj-wh4m) |
| `form-data` (transitiva) | 4.0.0–4.0.5 | high | CRLF injection em nomes de campo e arquivo (GHSA-hmw2-7cc7-3qxx) |
| `follow-redirects` (transitiva) | ≤1.15.11 | moderate | vaza headers de autenticação em redirect cross-domain (GHSA-r4q5-vmmm-2653) |
| `yaml` (transitiva) | 1.0.0–1.10.2 | moderate | stack overflow com YAML muito aninhado (GHSA-48c2-rrv3-qjmp) |

Todas têm correção dentro do semver já declarado (`axios` 1.21.0, `react-router` 7.18.5; as transitivas
resolvem com `npm audit fix`).

## What Changes

- `axios` 1.11.0 → 1.21.0 e `react-router` 7.9.1 → 7.18.5 (`npm update`, sem trocar de major).
- `form-data`, `follow-redirects` e `yaml` por `npm audit fix` (sem `--force`).
- Só `package.json` (se o range mudar) e `package-lock.json`.

## Non-goals

- **Majors:** `vitest` 5.x, `@mui/*` 9.x, `eslint` 10, `typescript` 7, `vite` 8, `react-router` 8.
- **Vulnerabilidades só de dev/build** (`vitest`, `tinypool`, `handlebars`, `vite`, `postcss`, `minimatch`…):
  não chegam ao bundle. O `vite` 7.1.5 → 7.3.7 cabe no semver e pode entrar aqui só se o `npm audit fix`
  já o trouxer; do contrário, fica para outra change.
- **Backend:** item separado (rodar OWASP dependency-check e revisar `postgresql` 42.7.7). Não mexer no `pom.xml`.
- Não migrar para `bun`, não remover lockfile nenhum (ver A1).

## Critérios de aceite

- **CA1.** Dado o front após a change, quando rodo `npm audit --omit=dev`, então o resultado é 0
  vulnerabilidades high/critical (idealmente 0 no total).
- **CA2.** Dado `npm ls axios react-router form-data follow-redirects yaml`, então as versões resolvidas
  são ≥ 1.21.0, ≥ 7.18.5, > 4.0.5, > 1.15.11 e > 1.10.2 respectivamente.
- **CA3.** Dado o front atualizado, quando rodo `npm run lint && npm run build && npm test`, então todos passam
  sem alterar código de `src/`.
- **CA4.** Dado o E2E (Playwright) da CI, então o check `E2E (Playwright)` passa — login, navegação e
  uma chamada autenticada continuam funcionando.
- **CA5.** Dado o diff da change, então só `package.json` e `package-lock.json` mudam.

## Métrica de sucesso

Vulnerabilidades de produção no front: **5 → 0** (`npm audit --omit=dev`). Ligada à rotina do treinador
de forma indireta: a sessão autenticada do coach deixa de ficar exposta ao vazamento de header e ao
open redirect, sem custo de tempo para quem usa.

## Impact

- Sem mudança visível para o usuário. Risco de regressão baixo, mas real: `axios` fez 10 minors e
  `react-router` 9 — o E2E e a navegação autenticada são a rede de proteção.
- `src/api/core/` (cliente gerado por `openapi-typescript-codegen`) usa `axios`; qualquer quebra aparece lá.

## Rollback

Reverter o commit e redeployar o front. Sem estado, sem migration.

## Open Questions & Assumptions

- **A1:** o front tem `package-lock.json` **e** `bun.lock`. A auditoria foi feita sobre o
  `package-lock.json`, e é ele que o CI e o `Dockerfile.cloud` usam (`npm ci`) — **confirmado na task 1.1**. Se o `bun.lock`
  não for usado por ninguém, abrir change própria para removê-lo; aqui ele só não pode ser regenerado
  por engano.
- **A2:** nenhum changelog de `axios` 1.11→1.21 ou `react-router` 7.9→7.18 traz breaking change em
  comportamento usado pelo front. Premissa a confirmar lendo as release notes na task 2.1.
- **A3:** `npm audit fix` sem `--force` resolve as três transitivas. Se alguma exigir `--force`, parar e
  avaliar em vez de aplicar.
- **Resolvido:** o `npm audit fix` já trouxe o `vite` 7.3.7 (dentro do semver); entrou nesta change.
