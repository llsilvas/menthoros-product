**Tamanho:** M · **Trilha:** Full

## Why

A geração de plano (`PlanoServiceImpl.gerarPlanoTreino`) é `@Transactional`, e a chamada ao LLM
acontece **dentro** da transação. Enquanto o modelo pensa — ~80s típicos na rota `PLANO` —, uma
conexão do pool do Hikari fica presa sem fazer nada.

O pool é o **default de 10** (não há configuração de Hikari no `application.yml`) e o lote roda 4
gerações em paralelo (`app.batch-plan.llm-concorrencia`). Ou seja, durante um lote, **4 das 10
conexões ficam fixadas** em espera de rede. O que sobra atende o resto do app inteiro: login, telas
do atleta, dashboard do coach.

Hoje isso não dói porque as assessorias são pequenas. **A conta quebra com o crescimento**, e dá
para calcular onde:

- Duração do lote = `N ÷ 4 × 80s` = **N × 20s**.
- 50 atletas → ~17 min. 90 atletas → **30 min**. 200 atletas → ~67 min.
- O `app.batch-plan.recovery-limite-min` é **30**, com o comentário no `application.yml`: *"nenhum
  lote real dura tanto"*. A partir de ~90 atletas essa premissa deixa de valer e um lote **saudável**
  passa a ser classificado como órfão pelo recovery de startup.

E há uma armadilha de operação: a reação natural a "o lote está lento" é aumentar
`BATCH_PLAN_LLM_CONCORRENCIA` (é env var, ajustável em produção sem deploy). Subir de 4 para 8
dobra a vazão do lote **e** fixa 8 das 10 conexões — o acoplamento sai de latente para incidente, e
quem fizer o ajuste não tem como saber disso pela config.

O timeout entregue por `add-external-call-resilience` (ADR-0008) limita a **duração** de cada posse,
mas não desfaz o acoplamento: com timeout de 120s, a posse continua sendo de até 120s por chamada.
Ele torna o problema sobrevivível, não resolvido.

## Precedente no próprio código

A casa já decidiu isso duas vezes, em direções opostas e com critério explícito:

- **Fora da transação** — `intervals-icu-activity-ingestion` (`design.md`): "a chamada HTTP fica FORA
  da `@Transactional`". É o padrão a seguir aqui.
- **Dentro da transação** — `assessoria-billing-asaas` (`design.md`, Decisão 9): deliberado, porque
  a atomicidade lógica entre o local e o Asaas valia mais que o custo, com janela residual coberta
  por reconciliação via webhook.

A diferença é que no billing a chamada externa **muda estado de terceiro** e precisa reverter junto;
aqui o LLM é uma função pura do ponto de vista de efeito colateral — ele não muda nada lá fora, só
devolve texto. Não existe atomicidade a preservar entre a chamada e o commit, então o argumento que
justificou o billing não se aplica.

## What Changes

Quebrar `gerarPlanoTreino` em três fases, com transação só nas pontas:

1. **Ler** (transação curta): atleta, metadados, histórico, decisão de progressão, revisão
   consumida — tudo que hoje é carregado antes da chamada.
2. **Chamar o LLM** (**sem** transação): nenhuma conexão de banco em posse.
3. **Persistir** (transação curta): validar, montar e salvar o plano.

O ponto sensível é a fase 1: hoje ela devolve entidades JPA que continuam sendo usadas depois
(`dadosPlano.atleta()`, `metaDados`), inclusive com `Hibernate.initialize` explícito para lazy
loading. Fora da transação, esses objetos ficam detached e qualquer acesso lazy não inicializado
estoura `LazyInitializationException`. É o principal risco de regressão e o que o `design.md` precisa
resolver: quais dados atravessam a fronteira e em que formato.

Verificações de invariante que hoje moram na mesma transação (`existePlanoAtivoNaSemana`) passam a
acontecer numa transação diferente da que persiste — abre janela para geração concorrente do mesmo
plano. O índice único parcial da V52 já existe como rede, mas o comportamento sob conflito precisa
ser decidido, não herdado por acidente.

## Non-Goals

- Aumentar o pool do Hikari. Trata o sintoma e continua desperdiçando conexão em espera de rede.
- Tornar a geração assíncrona / mudar o contrato do endpoint. O coach continua esperando a resposta;
  o que muda é o que fica preso enquanto ele espera.
- Rever a concorrência do lote. Depois desta change, subir `llm-concorrencia` deixa de ser perigoso —
  esse ajuste é decisão de operação, não escopo daqui.

## Critérios de aceite

- **CA1** — Dada uma geração de plano em andamento, quando o LLM está processando, então **nenhuma**
  conexão do pool está em posse por essa requisição (verificável por métrica de conexões ativas ou
  teste com pool reduzido).
- **CA2** — Dado um lote de N atletas com `llm-concorrencia = 4`, quando ele roda, então o número de
  conexões ativas não escala com a concorrência do LLM.
- **CA3** — Dado o fluxo de geração completo, quando ele termina, então o plano persistido é
  idêntico ao de hoje (regressão zero — golden test do plano gerado).
- **CA4** — Dadas duas gerações concorrentes para o mesmo atleta e semana, quando ambas tentam
  persistir, então uma falha com `PlanoJaExistenteException` e nenhuma linha duplicada é criada.
- **CA5** — Dado qualquer acesso a dado do atleta após a chamada ao LLM, quando o código executa,
  então não ocorre `LazyInitializationException` (cobertura de teste sem transação ativa).

## Métrica de sucesso

Conexões ativas do pool durante um lote deixam de escalar com `llm-concorrencia` — hoje é 1:1.
Efeito prático: uma assessoria pode crescer para centenas de atletas sem que o lote noturno degrade
o app para todo mundo, e `BATCH_PLAN_LLM_CONCORRENCIA` volta a ser um ajuste sobre custo/429 do
provedor, que é o que a config diz que ele é.

## Impact

**Código alterado:** `PlanoServiceImpl` (`gerarPlanoTreino`, `persistirPlanoCompleto`,
`getPreparaDadosPlano`), possivelmente `DadosPlanoDto` (se os dados passarem a atravessar como
record em vez de entidade), `BatchPlanProcessor` (se a fronteira de transação mudar de lugar).

**Sem contrato de API alterado.** Sem migration.

**Risco:** mexe no fluxo mais crítico e mais caro do produto. Mitigação: o golden test do plano
gerado (`PlanoTreinoPromptBuilderGoldenTest`) e a suíte do `PlanoServiceImplTest` já cobrem o
comportamento atual — a regressão aparece.

**Dependência:** nenhuma técnica. Faz sentido **depois** de `add-external-call-resilience`, para não
mexer duas vezes no mesmo fluxo — mas o timeout não é pré-requisito.

## Open Questions & Assumptions

- **Premissa:** os ~80s são estimativa em comentário de código, não p95 medido. O `Timer` de
  `add-external-call-resilience` vai substituir esse número por dado real — e a conta de "quando
  quebra" deve ser refeita com ele.
- **Premissa:** o pool é o default de 10 porque não há config. Confirmar se o Railway não injeta
  outro valor por variável de ambiente.
- **Em aberto:** o que atravessa a fronteira da transação — entidades detached, records, ou
  recarregar na fase 3. Decisão do `design.md`.
- **Em aberto:** comportamento sob conflito no CA4 — falhar limpo é o esperado, mas confirmar que a
  mensagem chega ao coach de forma útil no caminho do lote.
- **Em aberto:** a análise de treino (`WorkoutAnalysisListener`) e o foco semanal têm o mesmo
  acoplamento? São `@Async`, fora do request, mas se abrirem transação em volta da chamada o
  problema é o mesmo em menor escala. Verificar no `design.md`.
