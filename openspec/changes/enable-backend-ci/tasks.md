# Tasks — enable-backend-ci (S · Full · backend · 15 tasks)

> Escopo: **zero diff em `src/`**. Um workflow, configuração de repositório e correção de doc.
> Qualquer alteração em código de produção ou teste aqui é sinal de que algo saiu do escopo.
>
> **Anchors verificados em 2026-08-02** contra `develop` @ `fb58e0c`, com `verify` verde.

## 0. Bloqueante antes de qualquer YAML

- [ ] **0.1 Confirmar o gatilho do Railway** no painel do projeto (`4f4f3290-…`, serviço
  `42866f52-…`). Responder: dispara em push para `develop`? Em merge de PR? Em outra coisa?
  - ⚠️ **É a única incógnita bloqueante da change.** Se o deploy não vier depois do gate, a CA4 não
    se sustenta e o CI vira relatório pós-fato — o problema atual com mais YAML
  - `verify:` a resposta anexada à task, com print ou citação da configuração

- [ ] **0.2 Confirmar se minutos de Actions são restrição** (repositório privado com cota apertada?).
  Decide se o workflow roda em push **e** PR ou só em PR
  - `verify:` plano do GitHub registrado na task

## 1. Workflow

- [ ] **1.1 Criar `.github/workflows/ci.yml`** — `ubuntu-latest`, Java 21 (temurin), cache de `~/.m2`
  por hash de `pom.xml`, comando `./mvnw clean verify`
  - ⚠️ **`verify`, não `test`.** `test` não executa nenhum dos 11 `*IT` — seria reproduzir o defeito
    de 2,5 meses com aparência de solução
  - ⚠️ Gatilho `pull_request`, **nunca `pull_request_target`** (executaria código de fork com token
    privilegiado) — [CA9]
  - ⚠️ `permissions: contents: read` explícito; não herdar o default amplo — [CA9]
  - ⚠️ Actions de terceiros fixadas por versão; preferir as oficiais — [CA9]
  - ⚠️ `timeout-minutes` no job (sem teto, uma trava queima minutos até o limite da plataforma) e
    `concurrency` com `cancel-in-progress` por ref
  - ⚠️ O **nome do job é contrato**: a branch protection vai referenciá-lo. Renomear depois quebra o
    gate em silêncio
- [ ] **1.2 Provar a hermeticidade num runner limpo** — [CA5]
  - ⚠️ Hoje isso é **hipótese**, não fato: o verde local roda com cache do Maven, imagens Docker já
    baixadas e o ambiente do dev. "Passa aqui sem as chaves de IA" prova que os segredos de aplicação
    não são necessários, não que o build sobrevive do zero
  - `verify:` o workflow não referencia `secrets.*` para compilar/testar e o run passa. Se falhar,
    registrar **o que** faltou e decidir explicitamente
- [ ] **1.3 Publicar os relatórios do Surefire/Failsafe como artefato, inclusive em falha**
  - Sem isso o primeiro CI é caixa preta: "falhou" não distingue quebra de Maven, de Docker, de
    Testcontainers ou de asserção — e a resposta natural de quem não conhece o log vira "roda de novo"
- [ ] **1.4 Adicionar execução agendada (diária)** — [CA8]
  - ⚠️ **Não é enfeite.** O defeito que originou a change foi um `*IT` vermelho por 2,5 meses porque
    nada o executava. CI só-em-PR tem a mesma cegueira em períodos sem PR, e falha por causa externa
    (imagem fora do ar, limite de pull) não gera sinal nenhum
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
  - `verify:` `GET /branches/develop/protection` deixa de responder 404, lista o check do CI como
    obrigatório e mostra bypass desabilitado
- [ ] **2.2 Provar que o gate bloqueia** — abrir um PR que quebra deliberadamente um `*IT` e
  confirmar que o merge fica indisponível — [CA2]
  - ⚠️ Este é o teste do teste. Um CI que reporta mas não bloqueia não resolve nada, e a única forma
    de saber é tentando mergear algo quebrado
  - `verify:` botão de merge bloqueado; PR fechado sem mergear depois da prova
- [ ] **2.3 Confirmar a ordem CI → deploy** conforme respondido na 0.1 — [CA4]
  - `verify:` um merge real com CI verde, observando que o deploy ocorre depois do check

## 3. Documentação e fechamento

- [ ] **3.1 Corrigir o `CLAUDE.md` da raiz** — a seção de branch protection descreve `develop` **e
  `main`** com PR, status checks e ≥1 approval, e nada disso existia; `main` sequer é branch deste
  repositório. Ajustar para o que a change estabeleceu, nem mais nem menos
  - ⚠️ Não descrever aspiração como se fosse estado. Foi a divergência entre doc e realidade que
    deixou "CI verde + branch protection" parecer resolvido por meses
- [ ] **3.2 Guardrail de escopo:** `git diff develop -- src/` ⇒ **vazio**
- [ ] **3.3 Registrar o que ficou de fora** e por quê, para não virar dívida silenciosa: CI do front e
  do product, gate de cobertura, deploy governado por CI (incl. redeploy/rollback manual no Railway),
  governanca de repositorio (CODEOWNERS, commits assinados, Dependabot para as actions)

## Fora de escopo — abrir como change própria

- **CI para `menthoros-front` e `menthoros-product`.** Mesma lacuna, decisões diferentes (sem Docker,
  sem Testcontainers).
- **Gate de cobertura** (JaCoCo/PIT com threshold). Acoplar isso ao primeiro CI torna provável que uma
  das duas discussões seja afrouxada para destravar a outra.
- **Deploy contínuo governado por CI.** Esta change garante verificação antes do merge; redesenhar o
  pipeline de deploy é outro assunto.
- **Investigar a flakiness herdada** de `fix-tsb-recalculo-resiliente` (causa raiz não identificada).
  Se o runner de 2 vCPU fizer aparecer, abrir bug — **não** mascarar com retry.
