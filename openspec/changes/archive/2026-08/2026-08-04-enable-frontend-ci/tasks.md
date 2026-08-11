# Tasks — enable-frontend-ci (S · Full · frontend + configuração de repositório)

> Escopo: `.github/workflows/` **na raiz do repositório `menthoros-front`** (não do workspace, que
> nem é repositório git), `playwright.config.ts`, configuração do repositório e documentação.
> **Qualquer diff em `src/` fora do `src/test/setup.ts` é sinal de que algo saiu do escopo.**
>
> Validação: o próprio CI. Enquanto ele não existe, `npm run lint && npm run build && npm run test:run`.
>
> Estado verificado em 2026-08-04 contra `develop`.

## 0. Discovery (bloqueia o YAML)

- [x] 0.1 **CONFIRMADO (founder, 2026-08-04): o Railway dispara no merge para `develop`.** Mesmo
      comportamento do backend. Logo, o CI precisa estar *antes* do merge para ser gate — o que a
      branch protection do bloco 3 garante. Continua valendo o limite honesto do CA4: redeploy
      manual, rollback e trigger direto no painel seguem fora do alcance desta change.
- [x] 0.2 **Mapeado.** Os 3 specs interceptam a fronteira com `page.route()` (`login` 2, `visao-time`
      1, `lista` 4) e **não** dependem de backend nem de Keycloak — a premissa inicial da change
      estava errada. O risco residual (widgets do dashboard com chamadas próprias não interceptadas)
      **não se materializou**: a suíte fecha 15/15 de forma estável no runner. Se aparecer
      intermitência ligada a rede, é aqui que se olha primeiro.
- [x] 0.3 **Fixar a versão do Node** usada em desenvolvimento e no CI (D3). Hoje a máquina do dev roda
      **Node 26**, cuja diferença de `localStorage` já mudou o resultado de teste.
      *verify:* versão registrada (`.nvmrc` ou equivalente) e usada no workflow.
      **Feito:** `.nvmrc` com `26.1.0` (versão do dev) e `engines: node >=26 <27` no `package.json`; o workflow usa `node-version-file: .nvmrc`, então CI e dev não divergem.
- [x] 0.4 ~~**Decisão (Q1):** E2E bloqueante ou reportando?~~ **RESOLVIDA no pré-mortem: bloqueante.**
      Manter em aberto contradizia o CA10 e abriria o falso verde que a change existe para fechar. A
      ordem é o que torna isso honesto: `webServer` primeiro (1.0), gate depois.
- [x] 0.5 **DECIDIDO (founder, 2026-08-04): cobertura NÃO entra agora.** Um mínimo não calibrado
      junto com o gate travaria merge por um número que ninguém acordou, e o primeiro reflexo seria
      baixar o número — ensinando a tratar o gate como obstáculo. Medir primeiro, calibrar depois;
      fica em "Fora de escopo" do proposal.

## 1. Pré-requisito do E2E + workflow (job rápido)

- [x] 1.0 **Configurar `webServer` no `playwright.config.ts`** (ou subir o preview no workflow).
      Hoje `baseURL` é `http://localhost:5174` e nada sobe o Vite: num runner limpo os 3 specs falham
      antes da primeira asserção (D4). **Bloqueia o bloco 2.**
      *verify:* `npm run test:e2e` passa numa shell **sem** `npm run dev` rodando.

      **Feito e provado:** `npm run test:e2e` roda numa shell **sem** `npm run dev` aberto. Em CI sobe o `preview` sobre o build (mesmo artefato de produção); local reaproveita o dev server existente.
- [x] 1.1 Criar `.github/workflows/ci.yml` com gatilho em `pull_request` para `develop` e `push` para
      `develop`. **Nunca `pull_request_target`** (CA9), `permissions: contents: read`, **actions de
      terceiros fixadas por versão** e nenhum secret exposto a PR de fork.
      *verify:* revisão do YAML contra os quatro itens do CA9, um a um.
      **Feito:** `pull_request` + `push` em `develop` + `schedule`; `permissions: contents: read`; as três actions fixadas por versão exata; `concurrency` cancelando execução anterior do mesmo ref.
- [x] 1.2 Job `verify`: `actions/checkout`, `actions/setup-node` com a versão da 0.3 e cache de npm,
      `npm ci`, `npm run lint`, `npm run build`, `npm run test:run`.
      *verify:* os três comandos aparecem como passos distintos, para a falha dizer qual quebrou.
      **Feito:** passos separados (lint / build / test), para a falha dizer qual quebrou sem abrir o log.
- [x] 1.3 **Verde no runner limpo, sem nenhum secret** — PR front #53, run `30910065141`. A
      premissa de hermeticidade do proposal vira fato: o front não consome chave de IA nem credencial
      de banco, e nada precisou ser adicionado.
- [x] 1.4 **Medido (CA6): job `verify` = 2m27s** (cache frio, primeira execução). Como os dois jobs
      rodam em paralelo, o tempo total de feedback do PR é ~2m30, não a soma. Ainda não há medição
      com cache quente — anotar na próxima execução, é o número que decide se vale cache mais
      agressivo.

## 2. Workflow — job de E2E

- [x] 2.1 Job separado (D2), **depois da 1.0**: instalar browsers com cache
      (`playwright install --with-deps chromium` — o config declara só `chromium`).
      **Feito:** `playwright install --with-deps chromium` — só o browser que o config declara.
- [x] 2.2 Rodar `npm run test:e2e` e publicar o relatório como artefato em caso de falha. Sem o
      relatório, uma falha de E2E no CI é quase indepurável.
      *verify:* forçar uma falha e baixar o artefato do run.
      **Feito:** relatório publicado como artefato em `failure()`, retenção de 7 dias.
- [x] 2.3 Marcar como **bloqueante** (decisão 0.4). Rebaixar para reportando só com motivo
      registrado e gatilho de promoção — nunca como precaução silenciosa.
      **Feito:** o E2E é check obrigatório na branch protection (bloco 3), então um spec vermelho bloqueia o merge de fato — não só reporta.
- [x] 2.4 **Medido: job `e2e` = 1m21s**, cache frio, incluindo o download do Chromium.
      **Contrariou a expectativa:** o E2E é o job **mais rápido** dos dois — o `npm ci` do `verify`
      pesa mais que o browser. A separação segue justificada, mas por isolamento de instabilidade
      (D2), não por diferença de custo como o design supunha.

## 3. Branch protection

- [x] 3.1 **Proteção ativa em `develop`** (2026-08-04), após o merge do PR #53 (`65ad0a2`). Checks
      obrigatórios: `Lint, build e testes` e `E2E (Playwright)` — os dois nomes conferidos contra os
      check-runs reais do commit em `develop`, não presumidos.
- [x] 3.2 **Sem bypass e branch atualizada** — `enforce_admins: true`, `strict: true`,
      `allow_force_pushes: false`, `allow_deletions: false`. Verificado lendo a configuração de volta
      da API, não pela resposta do PUT.
      **Desvio deliberado do `CLAUDE.md`: zero approvals exigidos.** O documento pedia "≥1 approval
      (self-approval no solo)", mas **o GitHub não permite aprovar o próprio PR** — com 1 approval e um
      único dev, nenhum PR seria mergeável e o gate travaria o trabalho em vez de protegê-lo. O PR
      segue obrigatório e os checks seguem bloqueantes. `CLAUDE.md` corrigido junto (5.2).
- [x] 3.3 **Ordem CI → deploy garantida por construção** (CA4): o Railway dispara no merge (0.1) e o
      merge agora exige os dois checks verdes. Permanece o limite honesto já declarado — redeploy
      manual, rollback e trigger direto no painel seguem fora do alcance.

## 4. Execução agendada

- [x] 4.1 Adicionar `schedule` ao workflow (CA8) — CI só-em-PR tem a mesma cegueira em períodos sem
      PR, que é o modo de falha exato que originou a change do backend.
      *verify:* execução agendada aparece no histórico de runs sem PR aberto.
      **Feito:** `schedule: '0 9 * * 1-5'` no workflow.
- [x] 4.2 **DECIDIDO (founder, 2026-08-04): notificação por e-mail padrão do GitHub, para o dono do
      repositório** (`llsilvas`, `lsilva.info@gmail.com`). Horário mantido em `0 9 * * 1-5` — 9h UTC,
      **6h locais**: se quebrou, aparece antes do dia começar, não no meio dele.

      ⚠️ **Duas limitações do mecanismo, registradas para não virarem surpresa:**
      1. **A notificação ainda não foi observada na prática.** O e-mail padrão do GitHub para
         workflow agendado que falha é comportamento documentado, não verificado aqui — a primeira
         falha real do agendado é que confirma. Fica como limite conhecido, não como pendência
         silenciosa.
      2. **O GitHub desativa workflows agendados após 60 dias sem atividade no repositório.** Num
         repo ativo não acontece; num que fique parado — exatamente quando o agendamento seria mais
         útil — ele silencia sozinho. Se o projeto entrar em pausa longa, reativar é manual.

## 5. Fechamento

- [x] 5.1 ~~Prover `localStorage` no `src/test/setup.ts`.~~ **Feito fora desta change**, na branch do
      PKCE: escrever os testes do fluxo OIDC esbarrou no mesmo problema (o `stateStore` do PKCE usa Web
      Storage), então a correção foi antecipada lá. `localStorage` e `sessionStorage` em memória, com
      instância nova por teste.
- [x] 5.1b **Procedimento de rollback registrado** no `CLAUDE.md` da raiz, junto da tabela de estado
      da proteção — o lugar onde alguém procuraria sob pressão, e não enterrado nesta change.
      Desobrigar um check específico mantém o resto do gate; remover a proteção inteira é o último
      recurso. **Ainda não exercitado** em ambiente controlado: o teste real derrubaria o gate recém-
      criado, então fica para a primeira vez que for genuinamente necessário — anotado como limite,
      não como pendência silenciosa.
- [x] 5.2 Atualizar o `CLAUDE.md` da raiz: dizer onde "CI verde + branch protection" passa a valer, e
      parar de citar `main`, que não existe em nenhum dos dois repositórios.
      **Feito:** tabela de estado por repositório, a correção sobre approvals (o GitHub não permite self-approval) e o registro de que `main` não existe — o documento a descrevia como protegida.
- [x] 5.3 Registrar no `SPRINTS.md` — junto com `enable-backend-ci`, já que as duas fecham o mesmo
      gap estrutural.

      **Feito:** linha própria no Bloco de Segurança, ao lado de `enable-backend-ci`, com o que a implementação encontrou.