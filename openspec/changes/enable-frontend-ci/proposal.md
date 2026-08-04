# enable-frontend-ci — CI que executa lint, build e testes antes do merge

**Tamanho:** S · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-04

> Origem: `enable-backend-ci` (2026-08-02) deixou o frontend explicitamente **fora de escopo** —
> "fazer os três de uma vez triplica a superfície de decisão sem melhorar nenhuma". Esta é a metade
> prevista lá. As decisões estruturais (gate antes do deploy, branch protection sem bypass, execução
> agendada) já foram tomadas na change do backend; aqui elas são **aplicadas**, não redecididas.

## Why

O `menthoros-front` **não tem CI**. Não existe `.github/` no repositório. Verificado em 2026-08-04:

1. **Nada é verificado antes de entrar em `develop`.** O único status check no PR #51, mergeado
   ontem, foi `GitGuardian Security Checks` — varredura de segredo, não build. Lint, type-check e os
   **796 testes** só rodam se alguém lembrar de rodar na própria máquina.

2. **`develop` não tem branch protection.** `GET /branches/develop/protection` responde `404`.
   `main` não existe; o default branch é `develop`. Mesma ficção que a change do backend encontrou.

3. **A suíte protege pouco se ninguém a executa.** São 104 arquivos e 796 testes, vários deles
   testes de regressão que documentam bugs reais já corridos. Esse patrimônio hoje depende de
   disciplina individual a cada commit.

O agravante em relação ao backend é o **custo de verificar à mão ser baixo**: `lint`, `build` e
`test:run` levam segundos, não os quase dois minutos do `verify`. Ou seja, não há trade-off de
tempo que justifique a ausência — só falta o automatismo.

## What Changes

- **Um workflow do GitHub Actions** (`.github/workflows/ci.yml`) rodando `npm ci`, `npm run lint`,
  `npm run build` (que já faz `tsc -b`, então cobre type-check) e `npm run test:run`, em cada PR para
  `develop` e em cada push para `develop`.
- **E2E dos fluxos críticos no CI** — o `CLAUDE.md` do front passou a exigir E2E em fluxos críticos
  (front PR #52). Sem execução automática, a regra depende de alguém lembrar. Ver `design.md`: entra
  como **job separado**, pela natureza diferente de custo e estabilidade.
- **Branch protection em `develop`**: exigir PR, exigir os status checks, proibir push direto e
  force-push, sem bypass de administrador.
- **Ordenar CI antes do deploy** — o Railway publica no merge, como no backend.
- **Execução agendada**, para que a suíte não apodreça em períodos sem PR.

## Capabilities

Nenhuma. Não toca código de produção, contrato de API nem schema.

## Impact

- **Zero diff em `src/`.** Workflow, configuração de repositório e, se necessário, ajuste de config
  de teste (ver Riscos).
- **Repositórios:** só `menthoros-front`. O `menthoros-product` e o `menthoros-infra` seguem sem CI —
  são repositórios de documento e configuração, e o custo/benefício é outro.
- **Tempo de PR:** hoje é zero. Passa a existir. Localmente `lint` + `build` + `test:run` somam
  poucos segundos; num runner frio, o peso está no `npm ci` e — se incluído no mesmo job — no
  download dos browsers do Playwright. Medir é task, não estimativa.

## Critérios de aceite

- **CA1** — Dado um PR aberto para `develop`, quando o CI roda, então executa `lint`, `build` e
  `test:run`, e cada resultado aparece como status check no PR.
- **CA2** — Dado um PR com qualquer um dos três falhando, quando se tenta mergear, então o merge é
  **bloqueado**. CI que reporta mas não bloqueia não resolve o problema que originou esta change.
- **CA3** — Dado um push direto em `develop`, então é rejeitado.
- **CA4** — Dado que o CI passa, quando o PR é mergeado, então o deploy do Railway ocorre **depois**
  da verificação.
  **Limite honesto deste CA** (importado da change do backend, que o documentou): ele cobre o
  caminho do merge, não "nada não verificado chega em produção". Redeploy manual, rollback e trigger
  direto no painel do Railway continuam existindo e ficam fora do alcance desta change.
- **CA5** — Dado o workflow num **runner limpo**, então instala e roda sem nenhum secret do GitHub.
  O front não consome chave de IA nem credencial de banco; se algo for necessário, vira decisão
  explícita e documentada.
- **CA6** — O tempo de ponta a ponta é **medido e registrado**, não estimado.
- **CA7** — A proteção **não permite** bypass por administrador, app ou token, e exige a branch
  atualizada com a base.
- **CA8** — Dado que ninguém abre PR por vários dias, quando a suíte apodrece por causa externa
  (dependência, browser do Playwright, mudança de runtime), então a execução **agendada** revela isso
  sem depender de atividade.
- **CA9** — O workflow usa `pull_request` (nunca `pull_request_target`) e declara permissões mínimas.
- **CA10** — Dado um PR que altera um fluxo crítico, quando o job de E2E roda, então ele executa os
  specs de E2E e o resultado é status check. **Limite honesto:** o CI garante que os specs
  existentes rodam; garantir que o spec *cobre* o fluxo alterado continua sendo revisão humana — o
  `CLAUDE.md` é quem carrega essa regra.

## Métrica de sucesso

**Primária:** zero merges em `develop` sem lint, build e testes verdes. Hoje esse número é
desconhecido porque nada mede — todo PR mergeado até aqui foi verificado apenas por confiança.

**Secundária (o que a change previne):** tempo entre uma quebra ser introduzida e ser detectada. O
precedente do backend é a régua: um `*IT` ficou **2,5 meses** vermelho sem sinal. O alvo aqui é que
qualquer quebra apareça no PR que a introduz.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **O ambiente de teste não fornece `localStorage`** — verificado em 2026-08-04: `window.localStorage` é `undefined` sob jsdom neste runtime, e o Node 26 expõe um nativo indisponível sem `--localstorage-file`. Testes de componente escapam porque o testing-library inicializa o `window`; teste de módulo puro quebra. Num runner com outra versão de Node, o conjunto que quebra **muda**. | Fixar a versão do Node no workflow (`.nvmrc` ou `node-version` explícito) para o CI não divergir da máquina do dev. Avaliar prover `localStorage` no `src/test/setup.ts`, o que remove a dependência da versão. |
| **Playwright pesa no runner** — download de browser é a parte cara, e E2E é mais instável que unit. Um job único faz o feedback rápido esperar pelo lento. | Job separado, com cache dos browsers. Se a instabilidade aparecer, a decisão (bloquear vs. reportar) é tomada com dado, não por antecipação. |
| 🔴 **O E2E quebra no runner limpo hoje** — `playwright.config.ts:17` aponta `baseURL` para `http://localhost:5174` e **não há `webServer`**. Nada sobe o Vite no runner, e os 3 specs falham antes de qualquer asserção. Passa despercebido localmente porque quem roda E2E já tem `npm run dev` de pé. Um job que nasce vermelho por motivo alheio ao produto é o jeito mais rápido de ensinar a ignorar o CI. | Configurar `webServer` no `playwright.config.ts` (ou subir o preview no workflow) **antes** de tornar o job bloqueante. Vira task própria. |
| **Mock parcial nos specs** — os 3 specs já interceptam a fronteira com `page.route()` (2, 1 e 4 rotas), então **não** dependem de backend nem de Keycloak. Mas navegar até o dashboard passa por widgets com chamadas próprias (Strava, provas, aderência): rota não interceptada deixa o resultado dependente de rede. | Discovery mapeia as requisições **não** mockadas — constatar que existe `route()` no arquivo não basta. |
| **CI verde vira falso conforto** — lint e testes passam e a tela quebra no navegador. | Já endereçado fora desta change: o `CLAUDE.md` (PR #52) exige E2E em fluxo crítico. O CI executa; a regra define o que precisa existir. |
| Gate que o dono do repositório atravessa | CA7: sem bypass. Uma proteção contornável é sugestão. |

## Open Questions & Assumptions

**Premissas (validar na discovery):**

1. O build é hermético — o front não consome secret em build time. `runtimeConfig` lê `VITE_*` com
   defaults. *Parcialmente verificado: `npm run build` roda local sem `.env` especial.*
2. O Railway do front dispara no merge, como no backend. **Não verificado** — confirmar o gatilho
   antes de qualquer YAML, mesma exigência que a change do backend fez.

**Em aberto:**

- ~~**Q1 — E2E bloqueia ou só reporta?**~~ **RESOLVIDA no pré-mortem: bloqueia.** Manter a dúvida
  contradizia o CA10 e abria o falso verde que a change existe para fechar. A condição é a ordem:
  primeiro o E2E roda de forma confiável no runner (exige o `webServer`, ver Riscos), depois vira
  gate. Rebaixar para reportando volta a ser possível, mas só como decisão explícita, com motivo
  registrado e gatilho de promoção.
- **Q2 — Cobertura entra com threshold agora?** O script `coverage` existe e o `vite.config.ts` não
  define mínimo. Ligar threshold junto com o CI arrisca travar o merge por um número que ninguém
  calibrou.
