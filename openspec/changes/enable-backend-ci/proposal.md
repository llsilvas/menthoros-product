# enable-backend-ci — CI que executa `verify` antes do merge

**Tamanho:** S · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-02

> Origem: `fix-reconciliation-it-auth` (2026-08-02) deixou `./mvnw clean verify` verde pela primeira
> vez desde 2026-05-14. Ela registrou explicitamente que a correção **estrutural** ficava fora do
> escopo: sem CI, o próximo `*IT` apodrece do mesmo jeito. Esta change fecha isso.

## Why

O `menthoros-backend` **não tem CI**. Não existe `.github/` no repositório — nada, nem workflow nem
diretório. Consequências verificadas em 2026-08-02:

1. **Nenhum código é compilado ou testado antes de entrar em `develop`.** O único status check nos
   PRs é um **deploy do Railway**. Ou seja: o PR mergeia sem verificação e o Railway publica o
   resultado. O check verde ao lado do botão de merge não é build — é deploy, e ele é *consequência*
   do merge, não condição dele.

2. **`develop` não tem branch protection.** `GET /branches/develop/protection` responde 404. E `main`
   **não existe** no repositório: o default branch é `develop`. O `CLAUDE.md` da raiz descreve
   "CI verde + branch protection" em `develop` e `main` como se fossem realidade; hoje é ficção
   dupla.

3. **Um teste de integração pode apodrecer indefinidamente sem sinal.** Foi exatamente o que
   aconteceu: `Task5p1ControllerIT` ficou vermelho por **2,5 meses** (2026-05-14 → 2026-08-02),
   deixando três endpoints de reconciliação manual sem cobertura de contrato — incluindo autorização
   e isolamento multi-tenant. Ninguém viu porque `*IT` só roda em `verify`, e `verify` não roda em
   lugar nenhum automaticamente.

O custo não é hipotético e não é sobre disciplina individual. Rodar `verify` à mão antes de cada PR
é um passo que depende de alguém lembrar, num fluxo em que a máquina já está fazendo deploy sozinha.

**A janela é agora.** `verify` está verde. Ligar CI num repositório com suíte vermelha obriga a
escolher entre um gate que ninguém pode satisfazer ou um gate com exceções — e gate com exceção vira
gate ignorado. Esta é a primeira vez em 2,5 meses que o gate pode nascer honesto.

## What Changes

- **Um workflow do GitHub Actions** (`.github/workflows/ci.yml`) que roda `./mvnw clean verify` em
  cada PR para `develop` e em cada push para `develop`.
- **Branch protection em `develop`**: exigir PR, exigir o status check do CI, proibir push direto e
  force-push. É configuração de repositório (feita via `gh api` ou UI), não código — mas sem ela o
  workflow é decorativo.
- **Ordenar CI antes do deploy**: hoje o Railway publica no merge. O gate precisa estar *antes*,
  senão CI vira relatório pós-fato. Ver `design.md` — é a decisão de maior risco desta change.
- Atualizar o `CLAUDE.md` da raiz, cuja descrição de branch protection não corresponde ao repositório
  (cita `main`, que não existe).

## Capabilities

Nenhuma. Não toca código de produção, contrato de API nem schema.

## Impact

- **Zero diff em `src/`.** A change é um arquivo de workflow, configuração de repositório e correção
  de documentação.
- **Repositórios:** só `menthoros-backend`. O `menthoros-front` e o `menthoros-product` também não
  têm CI, mas fazer os três de uma vez triplica a superfície de decisão sem melhorar nenhuma. Ver
  "Fora de escopo".
- **Tempo de PR:** passa a existir uma espera que hoje não existe. `clean verify` local leva
  **1min55s** (cache quente, Docker quente). Num runner do GitHub — 2 vCPU, cache frio, pull da
  imagem `pgvector/pgvector:pg17` — a expectativa é maior; medir é task explícita, não estimativa.

## O que provavelmente torna isto barato

Levantado em 2026-08-02. **Tratar como hipótese favorável, não como fato** — os dois primeiros itens
só ficam provados num runner limpo (task 1.2).

- **O build parece hermético.** O profile `integration` stuba as chaves de IA (`test-anthropic-key`,
  `test-openai-key`) e usa JWKS dummy; o profile `test` stuba as credenciais do Strava. Empiricamente:
  `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` estão **ausentes** do ambiente local e `verify` passa.
  **O que isso não prova:** a máquina local tem cache do Maven, imagens Docker já baixadas,
  credencial do Docker, locale e rede próprios. "Passa aqui sem as chaves" é evidência de que os
  *segredos de aplicação* não são necessários — não de que o build sobrevive a um runner do zero.
- **Testcontainers deve funcionar no runner padrão.** `ubuntu-latest` traz Docker; o
  `TestcontainersConfiguration` usa `pgvector/pgvector:pg17` com tag fixa.
  **Risco concreto:** pull anônimo do Docker Hub tem limite por IP (na ordem de 100 pulls / 6h), e
  runners compartilhados do GitHub saem por IPs compartilhados. Um limite atingido derruba **todos**
  os `*IT` de uma vez, com erro que não se parece com falha de teste. Se acontecer, a resposta é
  autenticar o pull ou espelhar a imagem — decisão a tomar com o erro na mão, não por antecipação.
- **A suíte está verde e é rápida.** 2311 unitários + 62 de integração, 0 falhas.

## Critérios de aceite

- **CA1** — Dado um PR aberto para `develop`, quando o CI roda, então executa `./mvnw clean verify`
  (não `test`) e o resultado aparece como status check no PR.
- **CA2** — Dado um PR cujo `verify` falha, quando se tenta mergear, então o merge é **bloqueado**
  pela branch protection. Um CI que reporta mas não bloqueia não resolve o problema que originou esta
  change.
- **CA3** — Dado um push direto em `develop`, então é rejeitado.
- **CA4** — Dado que o CI passa, quando o PR é mergeado, então o deploy do Railway ocorre **depois**
  da verificação.
  **Limite honesto deste CA:** ele cobre o caminho do merge, não "nada não verificado chega em
  produção". Redeploy manual, rollback e trigger direto no painel do Railway continuam existindo e
  ficam fora do alcance desta change — ver "Fora de escopo".
- **CA5** — Dado o workflow rodando num **runner limpo**, então compila e testa sem nenhum secret do
  GitHub. É aqui que a hipótese de hermeticidade vira fato ou cai; se cair, o que passa a ser
  necessário vira decisão explícita e documentada.
- **CA6** — O tempo de ponta a ponta do CI é **medido e registrado**, não estimado. Se passar de um
  teto acordado, a divisão em jobs (unitário rápido + integração) vira decisão consciente, não
  reação.
- **CA7** — Dado um PR que não pode ser mergeado por bypass, então a proteção **não permite** que
  administrador, app ou token contorne o check obrigatório, e exige a branch atualizada com a base.
  Uma proteção que o dono do repositório atravessa sem fricção é sugestão, não gate.
- **CA8** — Dado que ninguém abriu PR por vários dias, quando a suíte apodrece por causa externa,
  então uma execução **agendada** revela isso sem depender de atividade. É o modo de falha exato
  que originou esta change: um `*IT` vermelho por 2,5 meses porque nada o executava.
- **CA9** — Dado o workflow, então usa `pull_request` (nunca `pull_request_target`), declara
  `permissions: contents: read`, fixa as actions de terceiros por versão e não expõe secret a PR de
  fork. Um primeiro CI que amplia a superfície de ataque troca um problema por outro.

## Métrica de sucesso

Nenhum `*IT` consegue ficar vermelho por mais de um PR sem alguém ser notificado — contra os 2,5
meses do incidente que originou esta change. Verificável: depois do rollout, um PR deliberadamente
quebrando um `*IT` é bloqueado antes do merge.

## Open Questions & Assumptions

**Bloqueante:**

- **Como o Railway está disparando hoje?** Se ele observa push em `develop`, o CI só o precede se a
  branch protection impedir o merge antes do check — o que resolve o caso do PR, mas não o de um push
  direto (que a CA3 passa a proibir). Se o Railway estiver ligado a outro gatilho, a ordenação da CA4
  precisa ser reprojetada. **Isto precisa ser confirmado no painel do Railway antes de implementar** —
  não dá para inferir do repositório.

**Premissas:**

- Minutos de GitHub Actions não são restrição relevante no plano atual. Se o repositório for privado
  com cota apertada, ~2–8 min por PR passa a ter custo — verificar antes de ligar em push *e* PR.
- O runner `ubuntu-latest` (2 vCPU) roda a suíte sem timeout. A suíte usa Testcontainers em 11
  classes; contenção de CPU pode aflorar flakiness que a máquina local esconde.

**Risco conhecido, herdado:** `fix-tsb-recalculo-resiliente` registrou que a causa raiz de uma
flakiness **não foi identificada** e a mitigação aplicada (pausa de 50ms no laço do leitor) é
hipótese, não diagnóstico. CI de 2 vCPU é exatamente o ambiente que faz esse tipo de coisa aparecer.
**Se aparecer, não mascarar com retry.** Retry automático em CI transforma teste instável em ruído
tolerado, e o hábito de tolerar ruído é o que esta change existe para acabar.

## Fora de escopo — abrir como change própria

- **CI para `menthoros-front` e `menthoros-product`.** O front tem `lint`/`build`/`test:run` e nenhum
  CI; a mesma lacuna, com decisões diferentes (sem Docker, sem Testcontainers). Merece change própria
  para não misturar dois conjuntos de risco.
- **Deploy contínuo governado por CI** (promover para produção só com verify verde). Esta change
  garante o código verificado *antes* do merge; redesenhar o pipeline de deploy é outro assunto.
  Inclui os caminhos que a CA4 não alcança: redeploy manual, rollback e trigger direto no Railway.
- **Governança de repositório além do gate**: CODEOWNERS, approvals obrigatórios, commits assinados,
  linear history, Dependabot/Renovate para as actions. São melhorias reais, mas cada uma é uma
  discussão própria e nenhuma é pré-requisito para parar o apodrecimento silencioso.
- **Cobertura mínima como gate** (JaCoCo/PIT com threshold). Adicionar gate de cobertura junto com o
  primeiro CI acopla duas discussões e torna provável que uma delas seja afrouxada para destravar a
  outra.
