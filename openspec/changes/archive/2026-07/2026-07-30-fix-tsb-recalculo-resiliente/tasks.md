# Tasks — fix-tsb-recalculo-resiliente (M · Full · backend · 26 tasks, 26 concluídas)

> Fechar cada bloco com `./mvnw clean test`. `verify:` = como saber que funcionou.
> A suíte precisa de Docker no ar (Testcontainers) e `POSTGRES_DB=localhost` para os testes de
> contexto — ver nota no fim.
>
> **Anchors revalidados em 2026-07-28** contra `develop` @ `9bd32ff` (`TsbServiceImpl.java`,
> 643 linhas). Os números abaixo são os reais.

## 0. Pré-requisitos

- [x] 0.0 **Baseline definida: `develop`.** A baseline anterior (`f9e754b`, branch
  `feature/testes-carga-referencia`) foi **descartada com evidência**: sem `@Transactional`, o método
  lança `LazyInitializationException` para todo atleta — 5 erros de 5 no
  `TsbRecalculoEquivalenciaIT`, contra 5 verdes em `develop`. Aquele commit não deixou meio caminho
  andado; deixou um método que apaga e aborta. Ponto de partida real:
  `recalcularHistoricoCompleto` (`:349`) é `@Transactional` (`:348`) — transação única de 400+ dias
- [x] 0.1 Branch `feature/fix-tsb-recalculo-resiliente` criada a partir de `develop` (`9bd32ff`).
  `f9e754b` segue alcançável em `feature/testes-carga-referencia`, caso precise de arqueologia
- [x] 0.2 **Rede de segurança antes de tocar no código**: teste de equivalência que congela o
  resultado atual — **90 dias** conforme `reference-dataset.md`, asserção dia a dia sobre CTL/ATL/TSB
  **e `rampRate`** — [CA5]
  - ⚠️ **Os `RefCarga*Test` da branch descartada NÃO serviriam como rede de segurança.** Eles
    reimplementam as fórmulas EWMA dentro do próprio arquivo de teste e assertam contra si mesmos —
    nunca chamam `TsbServiceImpl`. Passariam verdes mesmo se o chunking corrompesse o recálculo. Não
    vieram para a baseline `develop`; o teste do CA5 exercita o **serviço real** contra banco
  - dataset cruza as fronteiras de bloco em **D-1 e D-7** (`rampRate` lê `data.minusDays(7)` em
    `:227`), inclui dias sem treino e atleta com `ctlTimeConstant`/`atlTimeConstant` customizados
  - **Entregue:** `TsbRecalculoEquivalenciaIT` (commit `d3fcaab`), não-`@Transactional`.
    TSS controlado de forma exata via `TipoTreino.FACIL` (fatorImpacto 1.0) + RPE 8 (IF 1.0) ⇒
    `TSS = duracaoMin × 100 / 60`. Cobre τ=42/7 e τ=30/5, mais o `rampRate` do dia 61 lendo D-7
    através da fronteira de bloco
  - ✅ verify: `./mvnw test -Dtest=TsbRecalculoEquivalenciaIT` ⇒ **5/5 verdes** em `develop`, sem
    nenhuma alteração de produção. É o baseline que todas as tasks seguintes têm de manter verde sem
    tocar nas asserções
  - ⚠️ **Tolerância é 0.02, não 0.01.** O desvio máximo medido entre o gabarito e a semântica de
    arredondamento do código é exatamente `0.0100` — 0.01 fica na fronteira. A garantia forte de
    equivalência vem do `snapshot()` exato, sem tolerância, que inclui `rampRate`
- [x] 0.2b Teste de idempotência: `recalcularHistoricoCompleto` 2x consecutivas sobre o mesmo
  dataset, valores idênticos nas duas execuções — [CA5]
  - ✅ verify: `idempotente()` compara os dois snapshots com `containsExactly` — igualdade **exata**,
    sem tolerância, sobre CTL/ATL/TSB/rampRate dos 90 dias
- [x] 0.3 Teste de atleta sem histórico: `recalcularHistoricoCompleto` com atleta sem treino nem
  métricas → `PlanoMetaDados` zerado, zero escritas em `metricasDiariasRepository` — [CA6]
  - ⚠️ `zerarMetaDadosSemHistorico` (`:468`) faz `orElseThrow` se **não existir** linha de
    `PlanoMetaDados` para o atleta. O teste cria o atleta **com** metadados, senão testaria a
    exceção em vez do zeramento. O caso "atleta sem metadados" é bug pré-existente — registrado nos
    Fora de escopo, não corrigido aqui
  - ✅ verify: `semHistoricoZeraMetadados()` — `ctlAtual`/`atlAtual`/`tsbAtual` zerados e nenhuma
    métrica criada

## 1. Fronteira transacional do bloco

- [x] 1.1 Colaborador `TsbRecalculoExecutor` com método `@Transactional(propagation = REQUIRES_NEW)`
  que apaga e reconstrói **um** intervalo. Bean próprio porque `REQUIRES_NEW` exige proxy — método
  privado repetiria o defeito atual do `atualizarTsbDia` — [CA1, CA2]
  - verify: teste de **propagação real** — o bloco comita mesmo com o chamador marcando rollback
    (`TestTransaction` ou chamador `@Transactional` que lança depois). Não basta assertar a presença
    da anotação; é exatamente esse o erro que a change existe para não repetir
- [x] 1.2 `recalcularPeriodoComProgresso` (`:448`) passa a iterar em blocos de 30 dias delegando ao
  colaborador, com `flush`/`clear` ao fim de cada bloco. **Ordem sequencial é obrigatória** — o
  CTL/ATL de um dia lê D-1 do repositório (`:107-110`), então o bloco N+1 só é correto se o N já
  comitou — [CA1]
  - verify: histórico de 400 dias ⇒ 14 blocos; nenhuma transação abrange mais de 30 dias. Espionar a
    contagem de invocações do colaborador, não só o resultado final
- [x] 1.3 `./mvnw clean test` verde — **inclusive o 0.2 sem alteração de asserção** [CA5]

## 2. Delete por bloco

- [x] 2.1 Remover o `deleteByAtletaId` + `flush` antecipados (`:364-365`); o delete do intervalo passa
  a acontecer dentro da transação do bloco que o reconstrói — [CA3]
  - ⚠️ **Diferença de comportamento a decidir explicitamente:** hoje `deleteByAtletaId` apaga **todas**
    as métricas do atleta, inclusive as de data futura — `dataFim` é clampado em `LocalDate.now()`
    (`:437-439`), então métricas depois de hoje são apagadas e nunca reconstruídas. Com delete por
    bloco elas sobrevivem. É provavelmente uma correção, mas muda resultado observável: confirmar e
    registrar, não deixar acontecer por acidente
  - verify: falha injetada no bloco N ⇒ blocos 1..N-1 comitados e **nenhum dia apagado sem
    reconstrução** (asserção sobre o intervalo do bloco N: mantém o dado antigo, não fica vazio)
- [x] 2.2 Trocar a lista `backup` (`:358-359`) por uma **consulta de limites**. Ela não restaura, mas
  **delimita** o intervalo via `primeiraMetrica`/`ultimaMetrica` (`:420-421`) — remover sem substituir
  quebra o recálculo de dias de descanso posteriores ao último treino — [CA7]
  - 2.2a Adicionar `findDataPrimeiraMetrica`/`findDataUltimaMetrica` (ou uma projeção `min/max`) em
    `MetricasDiariasRepository`; `determinarIntervaloRecalculo` (`:415`) deixa de receber
    `List<MetricasDiarias>` e passa a receber (ou consultar) as duas datas
  - verify: atleta com último treino em D e métricas materializadas até D+20 ⇒ o intervalo continua
    indo até D+20; e o método não carrega mais a lista inteira em memória (é o ganho real)
- [x] 2.3 `./mvnw clean test` verde

## 3. Semântica de falha honesta

- [x] 3.1 A exceção passa a informar o intervalo efetivamente reconstruído e o ponto de parada, em vez
  de alegar reversão (`:394-396`) — [CA4]
  - verify: falha no bloco N ⇒ mensagem contém o intervalo reconstruído e **não** contém "revertida"
    nem "estado anterior"
- [x] 3.2 Corrigir javadoc e log. Saem: `@throws RuntimeException ... (dados são restaurados do
  backup)` (`:348`), "Faz backup automático e rollback em caso de erro" (`:344`), e "A transação será
  revertida e o banco voltará ao estado anterior" (`:391`). Reescrever o comentário `BUG-TEC-002`
  (`:350-351`), que hoje descreve chunks que não existiam — [CA4]
  - ✅ verify: sumiram "revertida", "restaurados do backup" e "rollback em caso de erro". "estado
    anterior" ainda aparece 2x (`:408`, `:421`), mas agora em sentido **verdadeiro**: descreve os
    metadados ficando stale quando a consolidação falha, que é exatamente a Decisão 7 — não uma
    promessa de reversão. O javadoc passou a declarar explicitamente que não há rollback global
- [x] 3.3 Resolver o `@Transactional` morto de `atualizarTsbDia` (`:46`): o laço chama a sobrecarga
  privada de 3 args (`:51`), auto-invocação não passa pelo proxy. Documentar por que não vale no
  fluxo de recálculo, ou remover se não valer em nenhum caminho
  - verify: mapear os chamadores da sobrecarga pública antes de remover — se algum chamador externo
    depende da transação por dia, a anotação fica e ganha comentário; se não, sai
- [x] 3.4 `./mvnw clean test` verde

## 3b. Estado além do histórico diário

- [x] 3b.1 `PlanoMetaDados` conforme a **Decisão 7**: blocos comitados + falha em `atualizarMetaDados`
  (`:383`) / `recalcularSemanasProgressao` (`:386`) ⇒ exceção informa o intervalo reconstruído e que
  os metadados ficaram no **estado anterior**, explicitamente stale. Sem campo de status, sem
  migration — [CA8]
  - verify: falha injetada após o último bloco ⇒ mensagem nomeia o intervalo reconstruído e o estado
    dos metadados; histórico diário novo permanece comitado
- [x] 3b.2 Invalidar o cache `metadados-atleta` ao fim do recálculo — o recálculo escreve direto pelo
  repository (`:242-272`, `:627-634`) e a geração de plano lê pelo serviço cacheado
  (`PlanoServiceImpl:707-716`) — [CA9]
  - ✅ verify: `TsbRecalculoObservabilidadeIT.recalculoInvalidaCache` — popula o cache pelo mesmo
    caminho da geração de plano, recalcula, e a entrada some. Cobre também o caminho sem histórico.
    A invalidação vive em `TsbRecalculoExecutor.invalidarCacheMetadados`, com a chave replicando a
    do `@Cacheable` (`atletaId + '_' + tenantId`)
- [x] 3b.3 Documentar o contrato da **janela de histórico misto** conforme a **Decisão 6**: os cinco
  leitores — PMC (`AtletaProgressServiceImpl:87-96`), home (`:222-225`), dashboard do coach
  (`CoachDashboardServiceImpl:236-256`), fila de atenção (`CoachAttentionQueueServiceImpl:122-129`) e
  agregados semanais (`MetricasAgregadasServiceImpl:71-80`) — **servem o dado disponível, sem
  bloqueio**. Nenhum dos cinco é alterado
  - ✅ verify: contrato no javadoc de `recalcularHistoricoCompleto`; **zero diff nos cinco serviços**
- [x] 3b.3a Teste de leitura concorrente: disparar `recalcularHistoricoCompleto` em thread A e, com os
  blocos em andamento, ler os 5 endpoints em thread B. É o teste que **prova** a Decisão 6 — [CA3]
  - ✅ verify: `TsbRecalculoJanelaMistaIT` — thread B lê os 5 endpoints em laço enquanto o
    recálculo de 90 dias roda na thread A; nenhuma exceção coletada, e o contador de leituras
    concluídas é positivo (prova que houve sobreposição real)
- [x] 3b.5 Instrumentação da **Decisão 8**: contador Micrometer de recálculos abortados, tagueado com
  o bloco de parada, + log estruturado do intervalo efetivamente reconstruído. É o que torna a
  métrica de sucesso mensurável
  - ✅ verify: `TsbRecalculoObservabilidadeIT.falhaEmBlocoIncrementa` — `tsb.recalculo.abortado`
    com `tag(fase)` incrementa em 1. Duas fases instrumentadas: `blocos` e `metadados`
- [x] 3b.4 `./mvnw clean test` verde
  - ✅ 2215/2215 na suíte principal; os 4 ITs de TSB 13/13 (Failsafe: `*IT` não roda em
    `mvn test`, só em `verify` — rodados explicitamente)

## 4. Validação final

- [x] 4.1 `./mvnw clean test` verde
  - ✅ 2215/2215. Os ITs rodam só em `mvn verify` (Failsafe inclui `*IT`, Surefire inclui `*Test`)
    — rodados explicitamente: 15/15 em três execuções consecutivas
  - ⚠️ `./mvnw verify` está vermelho na `develop` por defeito **pré-existente** em
    `Task5p1ControllerIT` (14 falhas, 403 onde se espera 200/400). Não é regressão desta change
- [x] 4.2 ~~Teste manual~~ **automatizado**: recalcular pelos **dois** caminhos e confirmar resultado
  idêntico — é a diferença que originou o bug, então merece regressão permanente
  - ✅ verify: `TsbRecalculoCaminhosIT.doisCaminhosMesmoResultado` — dois atletas com calendário
    idêntico; um via `AtletaService.recalcularMetricasAtleta` (sem transação ambiente), outro dentro
    de `TransactionTemplate` (como `montarContexto`). Igualdade **exata** dia a dia [CA2]
- [x] 4.2b Cenário de atomicidade do onboarding: falha após o recálculo ⇒ a transação do chamador
  reverte mas as métricas permanecem comitadas — [CA8]
  - ✅ verify: `TsbRecalculoCaminhosIT.falhaDoChamadorNaoDesfazHistorico`. É a quebra aceita na
    Decisão 4; o teste existe para que mudá-la seja decisão explícita, não surpresa
- [x] 4.3a Atualizar este `tasks.md` (implementado vs. adiado) — ver "Balanço de entrega"
- [x] 4.3b Arquivada em `changes/archive/2026-07/2026-07-30-fix-tsb-recalculo-resiliente/` após o
  merge do backend PR #54 em `develop` (2026-07-30)

## Balanço de entrega

**Entregue integralmente.** Os 8 critérios de aceite (CA1–CA9) estão cobertos por teste automatizado;
nenhuma task foi adiada por falta de tempo ou escopo cortado. Commits na
`feature/fix-tsb-recalculo-resiliente`, a partir de `develop` @ `9bd32ff`:

| Commit | Escopo |
|---|---|
| `d3fcaab` | rede de segurança do CA5 (`TsbRecalculoEquivalenciaIT`) |
| `cd4afc0` | chunking transacional (`TsbRecalculoExecutor`, blocos de 30 dias, `REQUIRES_NEW`) |
| `5e02c06` | invalidação de cache, contrato da janela mista, telemetria Micrometer |
| `e2bb2c8` | equivalência entre os dois caminhos de entrada do recálculo |

O que **mudou de comportamento observável** e foi decidido explicitamente (não por acidente):

- Métricas de data futura **sobrevivem** ao recálculo. Antes, `deleteByAtletaId` apagava tudo e o
  `dataFim` clampado em `LocalDate.now()` nunca as reconstruía. Correção assumida na task 2.1.
- Falha parcial **não reverte** os blocos já comitados, e a exceção passou a dizer a verdade sobre o
  intervalo reconstruído (CA4). Antes prometia rollback que nunca acontecia.
- `PlanoMetaDados` pode ficar **stale** quando a consolidação falha após os blocos — Decisão 7,
  sem campo de status e sem migration.

Adiado deliberadamente: ver "Fora de escopo" abaixo — nada ali é pré-requisito desta change.

## Achados em aberto

- **Flake não diagnosticada em `TsbRecalculoJanelaMistaIT`.** Numa das ~9 execuções o teste falhou na
  asserção "nenhum leitor pode quebrar na janela de histórico misto". **Não reproduzida** nas 8
  execuções seguintes nem nas 3 finais, e a causa raiz **não foi identificada** — a exceção coletada
  não foi capturada naquela execução. Duas ações tomadas: (a) a asserção passou a reportar classe e
  mensagem das exceções, para que a próxima ocorrência seja acionável; (b) o laço do leitor ganhou
  pausa de 50ms entre ciclos, porque sem ela ele exercita exaustão de pool — o risco da Decisão 4,
  que é premissa a medir — em vez do contrato do teste. **A mitigação (b) é hipótese, não
  diagnóstico.** Se voltar a falhar, o diagnóstico dirá qual leitor e qual exceção, e aí se decide se
  contradiz a Decisão 6.

## Notas de execução

- **Docker + Testcontainers:** a suíte exige Docker no ar. Se cair no meio, os testes de integração
  falham em massa com `Could not find a valid Docker environment` — é ambiente, não regressão.
  `POSTGRES_DB=localhost` é necessário para os testes de contexto.
- **Não paralelizar os blocos.** É a otimização óbvia e quebra o cálculo: cada bloco depende do estado
  comitado pelo anterior.
- **A branch base é `develop` (`9bd32ff`).** O PR desta change sai limpo, sem arrastar commits de
  terceiros — foi um dos ganhos da rebaseline. Os 3 commits de `feature/testes-carga-referencia`
  (`BUG-CONF-001`, `BUG-CONF-002`, `BUG-TEC-002`) ficaram fora e seguem só naquela branch local; se
  `BUG-CONF-001`/`002` tiverem valor próprio, viram change/PR separados.

## Fora de escopo — abrir como change própria se doer

- Recálculo assíncrono (o endpoint é síncrono e lento mesmo com chunking).
- Tirar o recálculo de dentro da transação do onboarding — converge com
  `refactor-llm-call-outside-transaction`. Vira necessário se a premissa das 2 conexões por recálculo
  não se sustentar.
- Campo de status persistido no `PlanoMetaDados` para detecção pós-fato de dessincronização
  (descartado na Decisão 7 por exigir migration).
- `zerarMetaDadosSemHistorico` lançar quando o atleta não tem linha de `PlanoMetaDados` (`:471-475`) —
  bug pré-existente, fora do escopo desta change.
