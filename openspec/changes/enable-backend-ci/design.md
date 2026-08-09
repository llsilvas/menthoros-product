# Design — enable-backend-ci

## Precedente: o CI do frontend (2026-08-04)

`enable-frontend-ci` já entregou `menthoros-front/.github/workflows/ci.yml` e a branch protection de
`develop` naquele repositório. **Isto é a referência desta change**, não uma coincidência: a metade
genérica do desenho (gatilhos, `permissions`, `concurrency`, `schedule`, `timeout`, artefato em
falha) está rodando em produção há dias e não precisa ser redescoberta aqui.

O que se herda direto: `pull_request` restrito a `develop`, `permissions: contents: read`,
`concurrency: ci-${{ github.ref }}` com `cancel-in-progress`, `timeout-minutes` por job, artefato
publicado com `if: failure()`, e `schedule` em **dias úteis às 09:00 UTC** — não "diário" genérico.

O que **não** se herda, e é onde mora o risco desta change: Maven com cache de `~/.m2`, a fase
`integration-test` do Failsafe e Testcontainers puxando `pgvector/pgvector:pg17` de dentro do runner.
O front não tem Docker no CI; nada do que ele provou fala sobre isso.

Duas limitações registradas pelo front, que valem aqui:

- **A notificação da execução agendada ainda não foi observada** — ninguém confirmou que uma falha
  do `schedule` chega a alguém. Aqui isso vira item explícito da métrica de sucesso.
- **O GitHub desativa `schedule` após 60 dias sem atividade no repositório.** Num repo ativo é
  irrelevante; num que hiberne, o agendamento morre em silêncio — exatamente a cegueira que ele
  existe para fechar.

## Estado verificado (2026-08-02, reconfirmado em 2026-08-09)

| Fato | Valor | Como foi verificado |
|---|---|---|
| CI no backend | **inexistente** | não há `.github/` no repositório (reconferido 2026-08-09) |
| CI no frontend | **existe** desde 2026-08-04 | `menthoros-front/.github/workflows/ci.yml` |
| Default branch | `develop` | `gh api repos/llsilvas/menthoros-backend -q .default_branch` |
| Branch `main` | **não existe** | `GET /branches/main/protection` ⇒ "Branch not found" |
| Branch protection em `develop` | **ausente** | `GET /branches/develop/protection` ⇒ 404 (reconferido 2026-08-09) |
| Único status check hoje | deploy do **Railway** | `GET /commits/{sha}/status` ⇒ contexto `robust-expression - menthoros-backend` |
| Segredos exigidos pelo build | **nenhum** | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` ausentes do ambiente e `verify` passa |
| `clean verify` local | **1min55s** | `time ./mvnw clean verify`, cache e Docker quentes |
| Suíte | 2311 unitários + 62 integração, 0 falhas | mesma execução |
| Classes `*IT` | 11 | `find src/test -name "*IT.java"` |

## A decisão que importa: gate antes do deploy

O resto é mecânica. Esta é a parte que pode sair errada de um jeito que ninguém percebe.

Hoje o Railway publica quando `develop` recebe commit. Se o CI for adicionado sem branch protection,
o resultado é um workflow que **relata** enquanto o deploy **acontece** — ou seja, o build vira
relatório pós-fato e o gate é decorativo. Pior que não ter: passa a existir um check verde ao lado do
botão de merge que dá a impressão de verificação.

Por isso a branch protection **não é opcional nesta change**. Ela é o que transforma o workflow em
gate. Um workflow sem proteção é a versão do problema atual com mais YAML.

Sequência correta:

```
PR aberto  →  CI roda verify  →  check verde  →  merge permitido  →  push em develop  →  Railway
                     ↓
                  vermelho  →  merge BLOQUEADO
```

**O que ainda não sei:** o gatilho exato do Railway. Se ele observa push em `develop`, a sequência
acima se sustenta para PRs, porque o push só ocorre no merge — e a CA3 (proibir push direto) fecha o
outro caminho. Se estiver ligado a outra coisa, a ordenação precisa ser reprojetada. **Confirmar no
painel do Railway antes de implementar.** É a única incógnita bloqueante.

**O que a sequência acima NÃO cobre, e é honesto admitir:** redeploy manual, rollback e trigger
direto pelo painel do Railway continuam podendo publicar um commit que o CI nunca viu. Fechar isso é
"deploy governado por CI", explicitamente fora de escopo. A CA4 vale para o caminho do merge — que é
o caminho por onde o código normalmente anda, e por isso vale a pena — mas não é "nada não verificado
chega em produção".

### Branch protection: as opções que decidem se é gate ou sugestão

Ligar a proteção não basta; o default deixa buracos que anulam o propósito:

- **Bloquear bypass.** Se administradores (ou apps/tokens com permissão) podem mergear por cima do
  check, o gate é sugestão para quem tem mais poder de quebrá-lo. Num projeto solo isso é
  especialmente traiçoeiro: o único que pode atravessar é o único que vai atravessar, às pressas.
- **Exigir branch atualizada com a base.** Sem isso, um check verde em SHA antigo aprova um merge cujo
  resultado ninguém testou — verde legítimo, conclusão inválida.
- **Nomear o check certo.** A proteção referencia o contexto por nome. Nome errado (ou renomeado
  depois) faz a proteção exigir um check que nunca chega, ou nenhum. O nome do job passa a ser
  contrato: mudar depois quebra o gate silenciosamente.

## Escopo do workflow

```
gatilhos:  pull_request → develop        (NUNCA pull_request_target)
           push         → develop        (rede para o que entrar fora de PR enquanto a proteção não existe)
           schedule     → 0 9 * * 1-5    (mesmo horário do front; detecta apodrecimento sem depender de PR)
runner:    ubuntu-latest                 (traz Docker; obrigatório para Testcontainers)
java:      21, distribuição temurin
cache:     ~/.m2 por hash de pom.xml
comando:   ./mvnw clean verify
permissions: contents: read              (mínimo; não herdar o default amplo)
timeout:   teto explícito no job         (senão uma trava consome minutos até o limite da plataforma)
concurrency: cancel-in-progress por ref
actions:   fixadas por SHA de commit, versão em comentário (CA9)
artefatos: relatórios do Surefire/Failsafe publicados mesmo em falha
```

**A execução agendada não é enfeite.** O defeito que originou esta change foi um `*IT` vermelho por
2,5 meses *porque nada o executava*. Um CI que só roda em PR tem exatamente a mesma cegueira em
períodos sem PR, e falha por causa externa — imagem que sai do ar, dependência removida, limite de
pull — não gera nenhum sinal. O agendamento é o que fecha o modo de falha específico desta change,
não uma boa prática genérica.

**Publicar os relatórios importa mais do que parece.** Um job único que só devolve "falhou" é caixa
preta: não distingue quebra de Maven, de Docker, de Testcontainers ou de asserção. Como este é o
primeiro CI do repositório, a primeira falha vermelha vai ser diagnosticada por alguém sem
familiaridade com o log — anexar os relatórios é o que evita que a resposta seja "roda de novo".

**`verify`, não `test`** — é o ponto inteiro. `test` para na fase Surefire e não executa nenhum dos
11 `*IT`, que é precisamente como o defeito de 2,5 meses sobreviveu. Um CI rodando `test` reproduziria
o problema com aparência de solução.

**Um job só, para começar.** A versão anterior deste texto justificava isso dizendo que separar
"criaria a tentação de exigir só o job rápido como obrigatório". **Esse argumento não sobrevive ao
front:** `enable-frontend-ci` rodou dois jobs (`Lint, build e testes` + `E2E (Playwright)`) e exigiu
**os dois** na branch protection. A tentação existe, mas é uma escolha de configuração, não uma
consequência de dividir.

A razão real é econômica e específica do Maven. No front, os dois jobs são **disjuntos**: o E2E
precisa do browser, o lint não. Aqui não seriam: `verify` inclui a fase `test`, então um job "só
unitários" + um job `verify` **rodam os 2311 unitários duas vezes**, cada um pagando seu próprio
`checkout`, cache frio de `~/.m2` e compilação. Paga-se o dobro para antecipar o feedback de um
subconjunto — troca ruim a 1min55s de baseline.

Dividir continua sendo a resposta disponível **se** a medição da CA6 mostrar que o tempo dói; nesse
caso a forma correta é `mvn test` + `mvn verify -DskipUTs` encadeados por `needs`, com **ambos**
obrigatórios. Decisão a tomar com o número na mão, não por antecipação nem por simetria com o front.

## Alternativas consideradas

| Opção | A favor | Contra | Veredito |
|---|---|---|---|
| **Actions + `verify` + branch protection** | gate real; runner já tem Docker; zero secret | ~2–8 min por PR | **escolhida** |
| Actions rodando só `test` | rápido | não roda `*IT` — recria o bug que originou a change | rejeitada |
| Workflow sem branch protection | menos configuração | build vira relatório; deploy segue sem gate | rejeitada — é o problema atual com mais YAML |
| Hook local (`pre-push`) | sem infra | depende de cada máquina e é contornável com `--no-verify` | rejeitada |
| Esperar para fazer os 3 repos juntos | consistência | triplica a superfície de decisão; o backend é o que tem `*IT` apodrecendo | rejeitada |

## Riscos

| Risco | Mitigação |
|---|---|
| **Flakiness aflorando em runner de 2 vCPU.** `fix-tsb-recalculo-resiliente` registrou causa raiz **não** identificada e mitigação por hipótese (pausa de 50ms). Contenção de CPU é o ambiente que faz isso aparecer | Se aparecer, **investigar, não mascarar**. Retry automático transforma teste instável em ruído tolerado — e tolerar ruído é o hábito que esta change existe para acabar |
| CI nasce vermelho e a equipe aprende a ignorá-lo | Ligar **enquanto** `verify` está verde. Se ficar vermelho no dia 1, o gate é revertido e o defeito é corrigido antes de religar — nunca marcado como "known issue" |
| Tempo de PR dói mais que o previsto | CA6 exige medir. Divisão em jobs fica disponível como resposta a dado, não a palpite |
| **Limite de pull anônimo do Docker Hub** (ordem de 100/6h por IP; runners do GitHub saem por IPs compartilhados). Derruba **todos** os `*IT` de uma vez, com erro que não se parece com falha de teste | Reconhecer o sintoma antes de investigar teste. Resposta: autenticar o pull ou espelhar a imagem — com o erro na mão, não por antecipação |
| **A hermeticidade é hipótese, não fato.** O verde local roda com cache do Maven, imagens já baixadas e ambiente do dev | Task 1.2 existe para provar num runner limpo. Se cair, o que for necessário vira decisão documentada — não secret adicionado no susto |
| **Bypass da branch protection** por admin, app ou token, ou check verde em SHA desatualizado | CA7: bloquear bypass e exigir branch atualizada. Sem isso a proteção é sugestão |
| Nome do check muda e a proteção passa a exigir algo que não chega | O nome do job é contrato; alterá-lo exige atualizar a proteção no mesmo PR |
| Minutos de Actions em repositório privado | Premissa a confirmar antes de ligar em push, PR **e** agendamento |

## Documentação a atualizar junto

**Corrigido em 2026-08-09.** A versão anterior desta seção dizia que o `CLAUDE.md` da raiz descrevia
proteção em `develop` **e `main`** com ≥1 approval, e que nada disso existia. Isso **já foi
consertado** por `enable-frontend-ci`: o documento hoje tem uma tabela com o estado real
(`menthoros-front` protegido desde 2026-08-04, `menthoros-backend` ainda não, com link para esta
change), a nota de que `main` não existe em nenhum dos repositórios, a justificativa de **zero
approvals** (o GitHub não deixa aprovar o próprio PR, então exigir 1 travaria todo merge num projeto
solo) e a saída de emergência via `gh api`.

O trabalho que resta aqui é **uma linha**: virar a coluna do `menthoros-backend` de ❌ para ✅ com a
data e os checks obrigatórios reais. Reescrever o resto arrisca reintroduzir a divergência que a
change gêmea acabou de fechar.

**Rollback.** O procedimento de emergência já está documentado no `CLAUDE.md` da raiz (desobrigar um
check específico com `PATCH .../protection/required_status_checks`; remover a proteção inteira com
`DELETE .../protection`). Esta change não cria um segundo procedimento — usa aquele.
