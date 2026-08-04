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
- [ ] 0.2 **Mapear as requisições NÃO mockadas dos 3 specs.** Já verificado que eles interceptam a
      fronteira com `page.route()` (`login` 2, `visao-time` 1, `lista` 4) e **não** dependem de backend
      nem de Keycloak — mas navegar ao dashboard passa por widgets com chamadas próprias (Strava,
      provas, aderência). Rota não interceptada deixa o spec dependente de rede no runner (D4).
      *verify:* lista das requisições que escapam do mock, por spec.
- [ ] 0.3 **Fixar a versão do Node** usada em desenvolvimento e no CI (D3). Hoje a máquina do dev roda
      **Node 26**, cuja diferença de `localStorage` já mudou o resultado de teste.
      *verify:* versão registrada (`.nvmrc` ou equivalente) e usada no workflow.
- [x] 0.4 ~~**Decisão (Q1):** E2E bloqueante ou reportando?~~ **RESOLVIDA no pré-mortem: bloqueante.**
      Manter em aberto contradizia o CA10 e abriria o falso verde que a change existe para fechar. A
      ordem é o que torna isso honesto: `webServer` primeiro (1.0), gate depois.
- [x] 0.5 **DECIDIDO (founder, 2026-08-04): cobertura NÃO entra agora.** Um mínimo não calibrado
      junto com o gate travaria merge por um número que ninguém acordou, e o primeiro reflexo seria
      baixar o número — ensinando a tratar o gate como obstáculo. Medir primeiro, calibrar depois;
      fica em "Fora de escopo" do proposal.

## 1. Pré-requisito do E2E + workflow (job rápido)

- [ ] 1.0 **Configurar `webServer` no `playwright.config.ts`** (ou subir o preview no workflow).
      Hoje `baseURL` é `http://localhost:5174` e nada sobe o Vite: num runner limpo os 3 specs falham
      antes da primeira asserção (D4). **Bloqueia o bloco 2.**
      *verify:* `npm run test:e2e` passa numa shell **sem** `npm run dev` rodando.

- [ ] 1.1 Criar `.github/workflows/ci.yml` com gatilho em `pull_request` para `develop` e `push` para
      `develop`. **Nunca `pull_request_target`** (CA9), `permissions: contents: read`, **actions de
      terceiros fixadas por versão** e nenhum secret exposto a PR de fork.
      *verify:* revisão do YAML contra os quatro itens do CA9, um a um.
- [ ] 1.2 Job `verify`: `actions/checkout`, `actions/setup-node` com a versão da 0.3 e cache de npm,
      `npm ci`, `npm run lint`, `npm run build`, `npm run test:run`.
      *verify:* os três comandos aparecem como passos distintos, para a falha dizer qual quebrou.
- [x] 1.3 **Verde no runner limpo, sem nenhum secret** — PR front #53, run `30910065141`. A
      premissa de hermeticidade do proposal vira fato: o front não consome chave de IA nem credencial
      de banco, e nada precisou ser adicionado.
- [x] 1.4 **Medido (CA6): job `verify` = 2m27s** (cache frio, primeira execução). Como os dois jobs
      rodam em paralelo, o tempo total de feedback do PR é ~2m30, não a soma. Ainda não há medição
      com cache quente — anotar na próxima execução, é o número que decide se vale cache mais
      agressivo.

## 2. Workflow — job de E2E

- [ ] 2.1 Job separado (D2), **depois da 1.0**: instalar browsers com cache
      (`playwright install --with-deps chromium` — o config declara só `chromium`).
- [ ] 2.2 Rodar `npm run test:e2e` e publicar o relatório como artefato em caso de falha. Sem o
      relatório, uma falha de E2E no CI é quase indepurável.
      *verify:* forçar uma falha e baixar o artefato do run.
- [ ] 2.3 Marcar como **bloqueante** (decisão 0.4). Rebaixar para reportando só com motivo
      registrado e gatilho de promoção — nunca como precaução silenciosa.
- [x] 2.4 **Medido: job `e2e` = 1m21s**, cache frio, incluindo o download do Chromium.
      **Contrariou a expectativa:** o E2E é o job **mais rápido** dos dois — o `npm ci` do `verify`
      pesa mais que o browser. A separação segue justificada, mas por isolamento de instabilidade
      (D2), não por diferença de custo como o design supunha.

## 3. Branch protection

- [ ] 3.1 Ativar proteção em `develop`: exigir PR, exigir os status checks do job rápido **e do
      E2E** (decisão 0.4), proibir push direto e force-push.
- [ ] 3.2 **Sem bypass** (CA7): administrador, app e token não contornam; exigir branch atualizada com
      a base.
      *verify:* tentativa de push direto em `develop` é rejeitada (CA3); PR com check vermelho não
      oferece merge (CA2).
- [ ] 3.3 Confirmar a ordem CI → deploy (CA4), com base na 0.1.

## 4. Execução agendada

- [ ] 4.1 Adicionar `schedule` ao workflow (CA8) — CI só-em-PR tem a mesma cegueira em períodos sem
      PR, que é o modo de falha exato que originou a change do backend.
      *verify:* execução agendada aparece no histórico de runs sem PR aberto.
- [ ] 4.2 Definir **canal e responsável** pela falha do agendamento, e provar o caminho com uma
      falha real (ex.: rodar o workflow agendado contra um commit sabidamente quebrado, num branch de
      teste). "Notificação chega a alguém" não é verificável sem canal, dono e evidência.
      *verify:* registro da notificação recebida, com canal e destinatário nomeados.

## 5. Fechamento

- [ ] 5.1 Se a 0.3 apontar, prover `localStorage` no `src/test/setup.ts` para remover a dependência da
      versão do Node (D3). **Único diff permitido em `src/`.**
- [ ] 5.1b **Registrar o procedimento de rollback do gate** (risco 🔴): como desobrigar o status
      check via `gh api`, quem tem a permissão e em que condição usar. Sem isso, uma quebra por causa
      externa trava todo merge — inclusive o hotfix que consertaria.
      *verify:* procedimento escrito e testado uma vez em ambiente controlado.
- [ ] 5.2 Atualizar o `CLAUDE.md` da raiz: dizer onde "CI verde + branch protection" passa a valer, e
      parar de citar `main`, que não existe em nenhum dos dois repositórios.
- [ ] 5.3 Registrar no `SPRINTS.md` — junto com `enable-backend-ci`, já que as duas fecham o mesmo
      gap estrutural.
