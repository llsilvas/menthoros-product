# Tasks — implement-worktree-por-change

Repo: `menthoros-workflow`. Validação: `bash tests/run.sh` e `python3 tests/validate-manifests.py`.
A branch desta change nasce em worktree do `menthoros-workflow` (o próprio plugin ainda não faz isso).

## 1. Comandos

- [x] 1.1 Validar a premissa: `EnterWorktree` com `path` para um worktree em
  `<workspace>/.worktrees/` (fora do repo). Registrar aqui o resultado; se recusar, usar o caminho que
  ele aceitar e ajustar o proposal.
  - Resultado (2026-11-04): **aceita** na primeira entrada a partir da raiz do workspace (repo
    aninhado registrado no `git worktree list`).
  - Limites da ferramenta: `ExitWorktree` não remove worktree entrado por `path` (só `keep`); trocar
    de um worktree para outro via `path` só vale para alvos sob `.claude/worktrees/` do mesmo repo.
  - **Restrição nova:** dentro do worktree, o harness recusa `git -C <outro repo>` ("a
    worktree-isolated session's git operations must target its own worktree"). Afeta o Kanban do
    `init` (commit no `menthoros-brain`) e o `/done` (commit do archive no `menthoros-product`).
- [x] 1.2 `commands/implement.md` Mode A passo 4: `git fetch origin develop` + `git worktree add`
  (branch nova a partir de `origin/develop`, branch existente, worktree existente reusado), cópia dos
  `.env*` ignorados, `npm ci` no front, `cd` no worktree. Passo 7 reporta o path.
  - Implementado sem `EnterWorktree` (ver Open Questions do proposal): com ele, o harness recusa git
    em outro repo e, com o hook do `rtk`, qualquer git (reproduzido 3 vezes em 2026-11-04).
- [x] 1.3 `commands/implement.md` Modes B e C: pré-condição de estar no worktree da change; entrar
  nele por `cd`, senão mandar rodar `init`.
- [x] 1.4 `commands/done.md`: `cd` para fora do worktree primeiro; archive/SPRINTS; depois
  `git -C <principal> pull --ff-only origin develop`, `worktree remove`, `branch -d`; `-D` só com
  confirmação do usuário se o `-d` recusar.
- Validação: `python3 tests/validate-manifests.py`; leitura cruzada dos três modos e do `/done`.

## 2. git-guard

- [x] 2.1 Testes primeiro em `tests/run.sh` (CA3–CA6, CA4b): o helper `guard` precisa de variante
  com worktree secundário (`git worktree add`), com branch `feat/x` existente, e repo sem `develop`
  (critério do guard virou "repo tem `develop`", não nome de repo).
- [x] 2.2 `hooks/git-guard.sh`: bloqueio de troca de branch no worktree principal de repo com
  `develop` (`--git-dir` = `--git-common-dir`): `-b/-B`, `switch`, e `checkout <x>` com `<x>` branch
  (`rev-parse --verify <x>^{commit}`, cobre também tag e `HEAD~1`); libera checkout de arquivo, `git restore` e worktree secundário; `target_dir` por
  `cd <dir> &&` e por `git -C <dir>`.
- Validação: `bash tests/run.sh` verde (casos novos + regressão).

## 3. Fechamento

- [x] 3.1 `CHANGELOG.md`: entrada da mudança de fluxo.
- [ ] 3.2 **Adiado (2026-11-04):** precisa de sessão nova com o plugin 1.10.0 carregado. Teste manual numa sessão nova: `/implement init` de uma change de teste no backend cria o
  worktree e deixa o principal em `develop` (CA1); rodar de novo reusa o worktree (CA2); `/done`
  em dry-run lido, conferindo a sequência do CA7, sem executar.

## Entrega

PR `llsilvas/menthoros-workflow#5`, mergeado em 2026-11-04 (`b17a562`). Versão 1.10.0.
Implementado: 1.1–1.4, 2.1–2.2, 3.1. Adiado: 3.2. Follow-up: `CLAUDE.md` raiz (`menthoros-infra`),
seção "Duas sessões no mesmo repositório" — "worktree sempre, via `/implement init`" e path
`.worktrees/<repo>-<change-id>`.
