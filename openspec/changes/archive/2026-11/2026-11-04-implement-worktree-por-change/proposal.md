**Tamanho:** S · **Trilha:** Fast

# Proposal — implement-worktree-por-change

Toda change de `apps/menthoros-backend` e `apps/menthoros-front` passa a rodar num git worktree
próprio, criado pelo `/implement init`. O diretório principal de cada repo fica sempre em `develop`.

Classificação: um repositório (`menthoros-workflow`), sem API, schema ou segurança de produto. A
atualização do `CLAUDE.md` raiz (que vive no `menthoros-infra`) fica fora, como follow-up, para manter
a change num repo só.

## Why

O `/implement init` cria a branch com `git checkout develop && git checkout -b <tipo>/<change-id>`
no diretório principal do repo (`commands/implement.md:49`). O checkout troca o HEAD do diretório,
não da sessão: qualquer outra sessão no mesmo diretório passa a estar na branch nova, sem aviso.

É o incidente de 2026-08-09 descrito no `CLAUDE.md` raiz (commit do CI caiu na branch de
auto-cadastro). O `CLAUDE.md` já manda usar worktree "na segunda sessão em diante", mas o comando
do workflow faz o contrário, e a regra depende de alguém lembrar que existe outra sessão — o que
não dá para detectar: o git não tem lock de sessão.

Aconteceu de novo em 2026-11-04: o `init` de `garmin-reenvio-plano` deixou o diretório principal do
backend em `feat/garmin-reenvio-plano` enquanto outra sessão preparava `coach-editar-treino-aprovado`
no mesmo repo.

O `/done` tem o mesmo problema ao contrário: `git checkout develop` no fim troca o HEAD de quem
estiver no diretório, e dentro de um worktree falha, porque `develop` já está em uso no principal.

## What Changes

- **`/implement init` (Mode A, passo 4):** em vez do checkout, cria o worktree a partir de
  `origin/develop`:
  - `git fetch origin develop`
  - branch nova: `git worktree add <workspace>/.worktrees/<repo>-<change-id> -b <tipo>/<change-id> origin/develop`
  - branch já existente (`git branch --list '*/<change-id>'`): `git worktree add <path> <branch>`;
    se já houver worktree para ela (`git worktree list`), reusa.
  - copia os `.env*` ignorados do diretório principal para o worktree (backend: `.env`,
    `.env.local`; front: `.env`) e, no front, roda `npm ci`. São segredos: cópia local, nunca
    staged (já são ignorados pelo `.gitignore` de cada repo).
  - entra no worktree com `cd <path>`. `.worktrees/` fica dentro do diretório de trabalho da sessão
    (raiz do workspace), então o `cd` persiste. **Sem `EnterWorktree`**: dentro dele o harness recusa
    git em outro repo (Kanban, archive) e, com o hook do `rtk` ativo, qualquer git.
  - `<repo>` (`backend`/`front`) no nome evita colisão quando a change toca os dois repos.
- **Modes B e C:** a pré-condição passa a exigir estar no worktree da change
  (`git branch --show-current` = `*/<change-id>`). Se o worktree existir, entra nele por `cd`; se não
  existir, manda rodar o `init` (nunca checkout no principal).
- **`/done`:**
  1. `cd` para o diretório principal se a sessão estiver no worktree da change;
  2. passos atuais de archive e `SPRINTS.md`;
  3. no lugar do passo 4: `git -C <principal> pull --ff-only origin develop` (o principal já está
     em `develop`, sem checkout), `git -C <principal> worktree remove <path>`,
     `git -C <principal> branch -d <branch>`. Se o `-d` recusar (merge por squash não deixa a
     branch "merged" para o git), o PR já foi confirmado `MERGED` no passo 1: pedir confirmação ao
     usuário para `-D` (gate do `CLAUDE.md`).
- **`hooks/git-guard.sh`:** bloqueia troca de branch no **worktree principal** de repo que tem
  `develop` (local ou `origin/develop`: hoje backend e front; `infra`, `product`, `workflow` e `brain`
  ficam fora): `git checkout -b|-B`, `git switch`, e `git checkout <x>` quando `<x>` resolve como
  commit (branch, tag, `HEAD~1`). Worktree principal = `git rev-parse --git-dir` igual a `--git-common-dir`.
  Continua liberado: checkout de arquivo (com ou sem `--`, desde que o argumento não seja branch),
  `git restore`, e qualquer checkout dentro de um worktree secundário. O repo-alvo é resolvido por
  `cd <dir> &&` (já existe) e, novo, por `git -C <dir>`. Mensagem aponta para `/implement init` ou
  `git worktree add`.
- **Fora de escopo:** atualizar o `CLAUDE.md` raiz (follow-up no `menthoros-infra`); banco ou porta
  por worktree (ver Open Questions); hooks `WorktreeCreate`/`WorktreeRemove` do Claude Code;
  `menthoros-product`/`menthoros-brain`, que seguem na mesma branch com commit por path explícito.

## Impact

- `commands/implement.md` (Modes A, B, C), `commands/done.md`, `hooks/git-guard.sh`,
  `tests/run.sh`, `CHANGELOG.md`.
- Vale na sessão seguinte ao merge (o plugin roda direto do repo).
- Primeiro uso por change custa um `npm ci` no front (~1 min) e disco de um checkout a mais.

## Critérios de aceite

- **CA1 — init cria worktree.** Given diretório principal do backend em `develop` e change sem
  branch, When `/implement init <id>`, Then existe `.worktrees/backend-<id>` na branch
  `<tipo>/<id>` a partir de `origin/develop`, a sessão está nele, e o diretório principal continua
  em `develop`.
- **CA2 — init com branch existente.** Given branch `*/<id>` já existente sem worktree, When
  `init`, Then o worktree é criado nessa branch sem criar outra; Given worktree já existente, Then é
  reusado.
- **CA3 — guard bloqueia no principal.** Given repo com `develop`, no worktree principal, When
  `git checkout -b feat/x`, `git checkout feat/x` ou `git switch feat/x`, Then exit 2.
- **CA4 — guard libera arquivo e worktree.** Given o mesmo repo, When `git checkout -- src/a.java`,
  `git checkout HEAD -- src/a.java` ou `git checkout src/a.java` no principal, Then exit 0; When
  `git checkout feat/x` dentro de um worktree secundário, Then exit 0.
- **CA4b — `git -C`.** Given sessão fora do repo, When `git -C <principal> checkout -b feat/x`,
  Then exit 2.
- **CA5 — repo sem `develop` fora.** Given repo sem branch `develop` (classe de `menthoros-product`,
  `-workflow`, `-brain`, `-infra`), When `git checkout -b docs/x`, Then exit 0.
- **CA6 — `cd <dir> &&`.** Given sessão na raiz e comando `cd apps/menthoros-backend && git checkout
  -b feat/x`, Then exit 2 (o guard resolve o repo pelo `cd`, como já faz para commit).
- **CA7 — done sem checkout.** Given PR mergeado e sessão dentro do worktree da change, When
  `/done <id>`, Then a sessão sai do worktree por `cd`, a change é arquivada, o worktree e a branch local
  somem, e o HEAD do diretório principal continua `develop`.
- **CA8 — regressão.** `bash tests/run.sh` verde, com os casos atuais e os novos (CA3–CA6).

CA1, CA2 e CA7 são prosa de comando, sem teste automatizado: entram no teste manual da task 3.2.

## Rollback

Reverter o commit do plugin no `menthoros-workflow` (vale na sessão seguinte). Worktrees já criados
continuam válidos: `git worktree remove` à mão ao fim de cada change.

## Métrica de sucesso

Zero commits de uma change caindo na branch de outra por troca de HEAD (classe do incidente
2026-08-09) a partir do merge. Proxy verificável: `git -C apps/menthoros-backend branch
--show-current` = `develop` sempre que nenhuma sessão estiver fora de worktree.

Ligação com o treinador: indireta — protege o fluxo de entrega das changes que ele usa.

## Open Questions & Assumptions

- **Decidido (2026-11-04, implementação):** sem `EnterWorktree`. A ferramenta aceita o path em
  `.worktrees/` (task 1.1), mas dentro dela o harness recusa git em outro repo e, com o hook do
  `rtk`, recusa qualquer git (`rtk git status` incluso). Entrar por `cd` não tem essas restrições e
  persiste porque `.worktrees/` fica dentro do diretório de trabalho. Custo: perde o isolamento do
  harness, que impediria a sessão de editar fora do worktree; o `git-guard` cobre o caso que importa
  (troca de branch no principal).
- **Premissa:** ninguém precisa trocar de branch no diretório principal no dia a dia. Se precisar,
  o bloqueio vira atrito; a saída documentada é `git worktree add`.
- **Aberto:** porta e banco continuam compartilhados. Duas sessões podem programar e rodar
  `./mvnw verify`/`npm run test:run` em paralelo (Testcontainers isola o banco do teste), mas só uma
  por vez sobe a app: o Flyway com `validate-on-migrate` quebra o boot de uma branch sem a migration
  que a outra aplicou no Postgres local. Banco por worktree fica para change própria, se a dor
  aparecer.
- **Aberto:** o `.worktrees/intervals-icu-oauth2-integration/` e outros diretórios antigos em
  `.worktrees/` estão vazios ou órfãos; limpeza manual, fora desta change.
- **Follow-up:** `CLAUDE.md` raiz ("Duas sessões no mesmo repositório") passa de "worktree na segunda
  sessão em diante" para "worktree sempre, criado pelo `/implement init`".
