# Design — enable-frontend-ci

## O que já está decidido (não redecidir aqui)

`enable-backend-ci` fixou as decisões estruturais do CI neste workspace: **gate antes do deploy**,
**branch protection sem bypass** e **execução agendada**. Esta change as aplica ao frontend. O que
está abaixo é apenas o que difere por ser outro stack.

## Estado verificado (2026-08-04)

| Item | Estado |
|---|---|
| `.github/workflows` | não existe |
| Branch protection em `develop` | `404 Branch not protected` |
| `main` | não existe; default branch é `develop` |
| Status check no último PR (#51) | apenas `GitGuardian Security Checks` |
| Suíte | 104 arquivos, **796 testes**, verdes |
| E2E | **3 specs**, Playwright, projeto único (`chromium`) |
| Scripts | `lint`, `build` (`tsc -b && vite build`), `test:run`, `coverage`, `test:e2e` |
| TypeScript | `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` |

## D1 — `build` já é o type-check

`npm run build` é `tsc -b && vite build`. Não há job separado de type-check: rodar `tsc` de novo
seria duplicar o passo mais lento sem ganhar sinal. Se um dia o build passar a usar `vite build`
sozinho, aí sim o `tsc --noEmit` vira job próprio.

## D2 — Dois jobs, não um

**Job rápido** (`lint` + `build` + `test:run`): segundos, determinístico, sem browser. É o gate que
todo PR paga.

**Job de E2E** (Playwright): download de browser, mais lento e historicamente mais instável.

Separar não é preciosismo: no job único, o feedback de um erro de lint espera o Playwright baixar
o Chromium. E se o E2E ficar intermitente, ele contamina o sinal do resto — o caminho conhecido para
uma equipe começar a mergear com o CI vermelho "porque é flaky".

## D3 — A armadilha do `localStorage`, e por que ela vira decisão de CI

Verificado em 2026-08-04, ao escrever `session.test.ts`: **`window.localStorage` é `undefined`** sob
o jsdom deste runtime, e o Node 26 expõe um `localStorage` nativo experimental que fica indisponível
sem `--localstorage-file`. Testes de componente não sofrem, porque o testing-library inicializa o
`window`; teste de módulo puro quebra.

Isso importa para o CI por um motivo específico: **qual conjunto de testes quebra depende da versão
do Node**. Um runner com Node diferente da máquina do dev produz um resultado diferente — e um CI que
discorda da máquina local é um CI que as pessoas aprendem a ignorar.

Duas providências, nesta ordem:

1. **Fixar a versão do Node** no workflow, para CI e desenvolvimento concordarem.
2. **Avaliar prover `localStorage` no `src/test/setup.ts`**, o que remove a dependência da versão de
   uma vez. Hoje o contorno vive em cada teste que precisa (stub explícito), o que funciona mas se
   repete.

## D4 — E2E quebra no runner limpo hoje, e não é por causa de backend

Verificado em 2026-08-04 (achado do pré-mortem, confirmado no código):

- Os 3 specs **já mockam a fronteira** com `page.route()` — `login.spec.ts` (2 interceptações),
  `visao-time.spec.ts` (1), `lista.spec.ts` (4). **Não precisam de backend nem de Keycloak.** A
  premissa inicial desta change estava errada.
- O problema real é outro: `playwright.config.ts:17` aponta `baseURL` para
  `http://localhost:5174` e **não há `webServer` configurado**. Num runner limpo, nada sobe o Vite —
  os três specs falham antes do primeiro `route()`. Hoje isso passa despercebido porque quem roda
  E2E localmente já tem `npm run dev` de pé.

Consequência: **o job de E2E não é só configuração de CI** — exige `webServer` no
`playwright.config.ts` (ou subir o preview no workflow). Sem isso, o job nasce vermelho por motivo
que não é bug do produto, que é a forma mais rápida de ensinar a equipe a ignorar o CI.

Fica valendo o alerta que sobra da premissa derrubada: mock **parcial**. Um spec que navega para o
dashboard passa por widgets que fazem chamadas próprias (Strava, provas, aderência); se a rota não
estiver interceptada, o comportamento no runner depende de rede. Mapear as requisições **não
mockadas** é parte da discovery — não basta constatar que existe `route()` no arquivo.

## D5 — Ordem de bloqueio

O job rápido nasce **bloqueante** — é determinístico e a suíte está verde, então o gate nasce
honesto (mesmo critério que a change do backend usou para escolher o momento).

**O job de E2E também nasce bloqueante**, e a Q1 deixa de ser uma escolha aberta. O pré-mortem
apontou a contradição: o CA10 exige E2E como status check enquanto este design permitia "nascer
reportando" — e check que não bloqueia deixa o PR mergear com E2E vermelho, que é precisamente o
falso verde que a change existe para eliminar.

A condição para isso ser honesto é o `webServer` do D4: **primeiro o E2E roda de forma confiável no
runner, depois vira gate**. Se, com o `webServer` resolvido, os specs ainda se mostrarem
intermitentes, a decisão de rebaixar para reportando passa a ser **explícita** — com o motivo
registrado e um gatilho de promoção — em vez de nascer assim por precaução.

## Alternativas consideradas

**Rodar os três repositórios num workflow reutilizável.** Descartado pelo mesmo motivo que a change
do backend descartou fazer os três de uma vez: os stacks não compartilham passo nenhum (`mvnw` vs
`npm`), e a abstração só apareceria em `actions/checkout` e `setup-*`.

**Incluir threshold de cobertura agora.** Adiado (Q2). Ligar um mínimo não calibrado junto com o CI
trava merge por um número que ninguém acordou — e o primeiro reflexo seria baixar o número, que
ensina a tratar o gate como obstáculo.

## Documentação a corrigir junto

O `CLAUDE.md` da raiz descreve "CI verde + branch protection" como realidade nos repositórios. Depois
desta change isso passa a ser verdade para backend e frontend — o texto deve dizer exatamente onde
vale, e não em `main`, que não existe em nenhum dos dois.
