# Tasks — enable-backend-ci (S · Full · backend · 16 tasks)

> Escopo: **zero diff em `src/`**. Um workflow, configuração de repositório e correção de doc.
> Exceção única e temporária: a task 2.2 quebra um `*IT` de propósito numa branch descartável, que
> nunca entra em `develop`. Fora isso, alteração em código de produção ou teste é sinal de escopo
> vazando.
>
> **Anchors verificados em 2026-08-02** contra `develop` @ `fb58e0c`, com `verify` verde.
> **Revisados em 2026-08-09** (DoR): backend segue sem `.github/` e sem branch protection; o
> `menthoros-front` **ganhou** CI e proteção em 2026-08-04 e passa a ser a referência do desenho.

## 0. Bloqueante antes de qualquer YAML

- [x] **0.1 Confirmar o gatilho do Railway** no painel do projeto (`4f4f3290-…`, serviço
  `42866f52-…`). Responder: dispara em push para `develop`? Em merge de PR? Em outra coisa?
  - ⚠️ **É a única incógnita bloqueante da change.** Se o deploy não vier depois do gate, a CA4 não
    se sustenta e o CI vira relatório pós-fato — o problema atual com mais YAML
  - **Resposta (2026-08-09, dono do repositório):** dispara **no merge de PR** no backend — ou seja,
    o Railway observa o push que o merge produz em `develop`
  - **Consequência para a CA4:** o desenho do `design.md` se sustenta **sem redesenho**. A sequência
    PR → CI verde → merge → deploy vale porque o push em `develop` só acontece no merge, e a branch
    protection (task 2.1) é o que impede o merge sem check verde. A CA3 (proibir push direto) fecha o
    outro caminho de chegada em `develop`
  - ⚠️ **Limite reconhecido:** confirmado verbalmente pelo dono, **não** por print do painel. Se a
    task 2.3 (observar um merge real) mostrar comportamento diferente, esta resposta cai e a CA4
    precisa ser reprojetada — é lá que ela vira fato observado
  - `verify:` resposta registrada acima; verificação empírica fica na task 2.3

- [x] **0.2 Confirmar se minutos de Actions são restrição** (repositório privado com cota apertada?).
  Decide se o workflow roda em push **e** PR ou só em PR
  - **Resposta (2026-08-09):** `llsilvas/menthoros-backend` é **público**. Actions em runner padrão é
    gratuito e ilimitado em repositório público — **não há cota a proteger**. Os três gatilhos
    (`pull_request` + `push` + `schedule`) ficam como o `design.md` previa
  - **Descoberta colateral, mais importante que a pergunta original:** a conta está no plano **Free**,
    e nele **repositório privado não tem branch protection nem rulesets**. Verificado sem mutação, no
    `menthoros-infra` (privado):
    `GET repos/llsilvas/menthoros-infra/branches/main/protection` ⇒ **403** *"Upgrade to GitHub Pro or
    make this repository public to enable this feature."* — idem para `/rulesets`
  - ⚠️ **Consequência para esta change:** tornar o backend privado no plano Free **remove o gate**.
    CA2, CA3 e CA7 dependem da proteção; sem ela sobra o workflow reportando, que é exatamente o que
    o `design.md` rejeita como "o problema atual com mais YAML". A task 2.1 não ficaria difícil,
    ficaria **impossível**
  - **Decisão do dono (2026-08-09):** manter **público agora**; privatizar é decisão separada, e se
    acontecer exige GitHub Pro (~US$ 4/mês, que também sobe a cota privada para 3.000 min/mês) sob
    pena de desmontar o gate sem querer
  - `verify:` visibilidade e comportamento do plano registrados acima

## 1. Workflow

- [x] **1.1 Criar `.github/workflows/ci.yml` na raiz do repo `apps/menthoros-backend`** —
  `ubuntu-latest`, Java 21 (temurin), cache de `~/.m2` por hash de `pom.xml`, comando
  `./mvnw clean verify`
  - ⚠️ **Na raiz do repositório do backend**, não do workspace: a raiz do workspace não é um repo git,
    um `.github/` ali seria inerte. Partir de `menthoros-front/.github/workflows/ci.yml` como
    referência da metade genérica (gatilhos, `permissions`, `concurrency`, `timeout`, artefato)
  - ⚠️ **`verify`, não `test`.** `test` não executa nenhum dos 11 `*IT` — seria reproduzir o defeito
    de 2,5 meses com aparência de solução
  - ⚠️ Gatilho `pull_request`, **nunca `pull_request_target`** (executaria código de fork com token
    privilegiado) — [CA9]
  - ⚠️ `permissions: contents: read` explícito; não herdar o default amplo — [CA9]
  - ⚠️ **Todas** as actions fixadas por **SHA de commit**, com a versão em comentário; preferir as
    oficiais — [CA9]. Tag exata (o que o front usa) ainda é mutável
  - ⚠️ `timeout-minutes` no job (sem teto, uma trava queima minutos até o limite da plataforma) e
    `concurrency` com `cancel-in-progress` por ref
  - ⚠️ O **nome do job é contrato**: a branch protection vai referenciá-lo. Renomear depois quebra o
    gate em silêncio
  - **Feito:** job `verify`, nome `Build e testes (verify)` — é este o contexto que a task 2.1 vai
    exigir. Actions pinadas por SHA nas mesmas majors do front (`checkout` v4.2.2,
    `setup-java` v4.7.0, `upload-artifact` v4.4.3): as majors atuais são v7/v5/v7, mas divergir do
    front nas mesmas actions cria dois conjuntos para manter — upgrade uniforme é trabalho do
    Dependabot, já registrado como fora de escopo
  - **Achado durante a implementação — ruído esperado no log, documentado no próprio YAML:** o
    `springdoc-openapi-maven-plugin` está no build principal (não num profile), ligado à fase
    `integration-test`, e tenta ler `http://localhost:<porta>/v3/api-docs` sem nenhuma app no ar.
    Ele imprime `java.net.ConnectException: Connection refused` **com stack trace completo** e
    **não quebra o build** — verificado com `./mvnw -o clean verify -DskipTests` ⇒ `BUILD SUCCESS`,
    exit 0. Num primeiro CI isso é exatamente o tipo de coisa que faz alguém diagnosticar a falha
    errada, então está explicado em comentário no `ci.yml`
- [ ] **1.2 Provar a hermeticidade num runner limpo** — [CA5]
  - ⚠️ Hoje isso é **hipótese**, não fato: o verde local roda com cache do Maven, imagens Docker já
    baixadas e o ambiente do dev. "Passa aqui sem as chaves de IA" prova que os segredos de aplicação
    não são necessários, não que o build sobrevive do zero
  - ⚠️ **"Sem secret" é só uma das dimensões.** Um runner limpo também testa: Docker disponível e
    utilizável pelo Testcontainers, `~/.m2` frio (primeiro build baixa tudo), bit de execução do
    `mvnw` preservado pelo checkout, e locale/timezone do runner (UTC) diferentes da máquina local —
    qualquer teste que dependa de fuso aflora aqui
  - `verify:` o workflow não referencia `secrets.*` para compilar/testar e o run passa. Se falhar,
    registrar **o que** faltou (qual das dimensões acima) e decidir explicitamente
- [x] **1.3 Publicar os relatórios do Surefire/Failsafe como artefato, inclusive em falha**
  - Sem isso o primeiro CI é caixa preta: "falhou" não distingue quebra de Maven, de Docker, de
    Testcontainers ou de asserção — e a resposta natural de quem não conhece o log vira "roda de novo"
- [x] **1.4 Adicionar execução agendada** — `cron: '0 9 * * 1-5'`, o mesmo do front — [CA8]
  - ⚠️ **Não é enfeite.** O defeito que originou a change foi um `*IT` vermelho por 2,5 meses porque
    nada o executava. CI só-em-PR tem a mesma cegueira em períodos sem PR, e falha por causa externa
    (imagem fora do ar, limite de pull) não gera sinal nenhum
  - ⚠️ Dias úteis, não todo dia: falha no sábado que ninguém lê na segunda não acrescenta nada e
    gasta minutos
  - ⚠️ **Duas limitações herdadas do front, a registrar, não a resolver aqui:** o GitHub **desativa**
    `schedule` após 60 dias sem atividade no repositório; e o front **nunca observou** a notificação
    de um agendamento vermelho chegando a alguém
- [ ] **1.4b Confirmar que a falha do agendamento notifica** — disparar o workflow agendado com
  `workflow_dispatch` (ou aguardar a primeira execução vermelha) e verificar se o e-mail/notificação
  do GitHub chega ao dono do repositório
  - ⚠️ É o elo que fecha a CA8. Um run vermelho que ninguém vê reproduz o defeito de 2,5 meses com
    um dashboard por cima. O front deixou este ponto em aberto — aqui ele é explícito
  - `verify:` notificação recebida (print/citação), ou a constatação registrada de que **não** chega
    e a decisão do que fazer a respeito
- [ ] **1.5 Abrir um PR de teste e observar o run** — [CA1]
  - `verify:` o status check aparece no PR e o log mostra a fase `integration-test` executando os
    `*IT` (não só Surefire)
- [ ] **1.6 Medir o tempo de ponta a ponta e registrar** — [CA6]
  - `verify:` o número real anotado aqui, comparado com o baseline local de **1min55s**. Se doer,
    dividir em jobs vira decisão consciente registrada, **não** reação automática
  - Se o run falhar com erro de **pull do Docker Hub** (limite anônimo por IP, ordem de 100/6h em
    runners compartilhados), reconhecer o sintoma: derruba todos os `*IT` de uma vez e **não** se
    parece com falha de teste. Resposta é autenticar o pull ou espelhar a imagem

## 2. O gate de verdade

- [ ] **2.1 Ligar branch protection em `develop`**: exigir PR, exigir o status check do CI, proibir
  push direto e force-push — [CA2] [CA3]
  - ⚠️ **Sem isto o workflow é decorativo.** É a task que transforma relatório em gate
  - ⚠️ **Bloquear bypass** (administradores, apps e tokens incluídos) — [CA7]. Num projeto solo isto é
    o item mais fácil de deixar frouxo e o mais consequente: o único que pode atravessar é o único que
    vai atravessar, às pressas
  - ⚠️ **Exigir branch atualizada com a base** — [CA7]. Sem isso, um check verde num SHA antigo aprova
    um merge cujo resultado ninguém testou: verde legítimo, conclusão inválida
  - ⚠️ Conferir que o **nome do contexto** exigido é exatamente o do job criado na 1.1; nome errado faz
    a proteção esperar um check que nunca chega
  - ⚠️ Não incluir `main`: essa branch **não existe** neste repositório
  - **Configuração de referência:** a mesma aplicada ao `menthoros-front` em 2026-08-04 — exigir PR,
    exigir os status checks, `strict=true` (branch atualizada com a base), `enforce_admins=true`
    (sem bypass), proibindo push direto, force-push e deleção. **Zero approvals**, de propósito: o
    GitHub não deixa aprovar o próprio PR, então exigir 1 travaria todo merge num projeto solo
  - **Rollback:** não inventar procedimento novo — usar a "Saída de emergência" já documentada no
    `CLAUDE.md` da raiz (`PATCH .../protection/required_status_checks` para desobrigar um check;
    `DELETE .../protection` como último recurso)
  - `verify:` `GET /branches/develop/protection` deixa de responder 404, lista o check do CI como
    obrigatório e mostra `enforce_admins=true` e `strict=true`
- [ ] **2.2 Provar que o gate bloqueia** — abrir um PR que quebra deliberadamente um `*IT` e
  confirmar que o merge fica indisponível — [CA2]
  - ⚠️ Este é o teste do teste. Um CI que reporta mas não bloqueia não resolve nada, e a única forma
    de saber é tentando mergear algo quebrado
  - **Protocolo — o PR existe para falhar, e precisa morrer sem chance de ser mergeado:**
    1. Branch descartável com nome autoexplicativo: `test/ci-gate-proof` (**não** `feature/*`)
    2. Uma única linha alterada num `*IT` (ex.: inverter uma asserção), commit `test: prova do gate
       de CI — NÃO MERGEAR`
    3. Abrir o PR **como draft**, com o corpo dizendo "PR de prova do gate — será fechado sem merge"
    4. Confirmar: check vermelho **e** botão de merge indisponível
    5. Fechar o PR e **apagar a branch remota** (`git push origin --delete test/ci-gate-proof`)
    6. Conferir que `develop` não recebeu nenhum commit desta prova (`git log origin/develop -1`)
  - Aproveitar a mesma janela para provar a **CA3**: `git push origin HEAD:develop` a partir da
    branch quebrada deve ser **rejeitado** pelo servidor
  - `verify:` botão de merge bloqueado; push direto rejeitado; PR fechado e branch remota apagada;
    `develop` inalterada
- [ ] **2.3 Confirmar a ordem CI → deploy** conforme respondido na 0.1 — [CA4]
  - `verify:` um merge real com CI verde, observando que o deploy ocorre depois do check

## 3. Documentação e fechamento

- [ ] **3.1 Atualizar a linha do backend na tabela de branch protection do `CLAUDE.md` da raiz** —
  virar ❌ para ✅ com a data e o nome exato do check obrigatório criado na 1.1
  - ⚠️ **Escopo é uma linha.** A redação original desta task mandava "corrigir" um texto que descrevia
    `main` e ≥1 approval — esse texto **não existe mais**: `enable-frontend-ci` já o substituiu pela
    tabela real, pela nota de que `main` não existe e pela justificativa de zero approvals. Reescrever
    a seção reintroduziria a divergência que a change gêmea acabou de fechar
  - ⚠️ Não descrever aspiração como se fosse estado: só marcar ✅ **depois** que a 2.1 e a 2.2
    passarem. Foi a divergência entre doc e realidade que deixou "CI verde + branch protection"
    parecer resolvido por meses
- [ ] **3.2 Guardrail de escopo:** `git diff develop -- src/` ⇒ **vazio**
- [ ] **3.3 Registrar o que ficou de fora** e por quê, para não virar dívida silenciosa: CI do
  `menthoros-product`, alinhamento do front ao pin por SHA, gate de cobertura, deploy governado por
  CI (incl. redeploy/rollback manual no Railway), governança de repositório (CODEOWNERS, commits
  assinados, Dependabot para as actions) e manutenção do required check quando o job mudar de nome

## Fora de escopo — abrir como change própria

- **CI para `menthoros-product`.** Guarda specs, não build — o gate ali seria `openspec validate`,
  com decisões próprias. O `menthoros-front` saiu desta lista: tem CI desde 2026-08-04.
- **Alinhar o front ao pin por SHA** (CA9): melhoria barata, mas mexe no CI em produção de outro
  repositório.
- **Governança pós-rollout** (renome de job, troca de versão de Java, atualização das actions, troca
  da imagem do Testcontainers): toda mudança nessas coisas pode quebrar o required check em silêncio.
  Manter isso vivo é assunto de Dependabot/CODEOWNERS, já fora de escopo abaixo.
- **Gate de cobertura** (JaCoCo/PIT com threshold). Acoplar isso ao primeiro CI torna provável que uma
  das duas discussões seja afrouxada para destravar a outra.
- **Deploy contínuo governado por CI.** Esta change garante verificação antes do merge; redesenhar o
  pipeline de deploy é outro assunto.
- **Investigar a flakiness herdada** de `fix-tsb-recalculo-resiliente` (causa raiz não identificada).
  Se o runner de 2 vCPU fizer aparecer, abrir bug — **não** mascarar com retry.
