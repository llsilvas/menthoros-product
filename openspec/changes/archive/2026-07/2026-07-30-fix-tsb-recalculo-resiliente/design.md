# Design — fix-tsb-recalculo-resiliente

> Anchors verificados em 2026-07-28 na branch **`develop`** (`9bd32ff`), repo `menthoros-backend`.
> `TsbServiceImpl.java` tem 643 linhas. A change foi **rebaselinada em `develop`** nessa data — a
> baseline anterior (`f9e754b`) foi descartada por deixar o método quebrado; ver "Estado da baseline"
> no `proposal.md`.

## Anchors reais

- `TsbServiceImpl.recalcularHistoricoCompleto` (`:349`) — **`@Transactional` (`:348`)**. Transação
  única cobrindo todo o período; a classe (`:31`) não tem anotação.
- `TsbServiceImpl.recalcularPeriodoComProgresso` (`:445`) — laço `while` dia a dia. **Não há chunk,
  `flush` nem `clear`.**
- `TsbServiceImpl.atualizarTsbDia(UUID, LocalDate)` (`:47`) tem `@Transactional` (`:46`), mas o laço
  chama a sobrecarga **privada** de 3 argumentos (`:457` → `:51`): auto-invocação, sem proxy, sem
  transação própria.
- Delete antecipado: `deleteByAtletaId` + `flush` em `:361-362`, antes de qualquer reconstrução.
- `backup` carregado em `:355` e passado a `determinarIntervaloRecalculo` (`:366`), onde define
  `primeiraMetrica`/`ultimaMetrica` (`:417-418`). **Não** serve para restaurar, mas **delimita** o
  intervalo — não pode ser removido sem substituir essa consulta.
- Javadoc e log a corrigir: "backup automático e rollback" (`:342`), "restaurados do backup" (`:346`),
  "a transação será revertida e o banco voltará ao estado anterior" (`:388`), "A transação foi
  revertida" (`:393`).
- Fase pós-blocos: `atualizarMetaDados` (`:380`) e `recalcularSemanasProgressao` (`:383`);
  `zerarMetaDadosSemHistorico` em `:468`.
- `rampRate` lê D-7 em `:227`.
- Chamadores: `AtletaServiceImpl.recalcularMetricasAtleta` (`:237`, sem `@Transactional`) via
  `AtletaController:144`; e `BaselineCalculatorImpl.calcular` (`:62`, classe sem `@Transactional`),
  chamado por `OnboardingServiceImpl.montarContexto` (`:99`, **`@Transactional`**) e por
  `CalibrationServiceImpl` (`:72`).

## Decisão 1 — fronteira transacional em colaborador próprio, não em método privado

`Propagation.REQUIRES_NEW` só vale através do proxy do Spring. Um método privado (ou público chamado
de dentro da mesma classe) não passa pelo proxy — é exatamente o defeito que já existe hoje com
`atualizarTsbDia`. Repetir o padrão faria a change parecer entregue sem mudar nada.

Portanto: o bloco de 30 dias vira um **bean colaborador** (ex.: `TsbRecalculoExecutor`), com o método
anotado `@Transactional(propagation = REQUIRES_NEW)`, injetado no `TsbServiceImpl`.

**Teste que fecha essa porta:** verificar a propagação real (bloco comita mesmo com o chamador
marcando rollback), não a presença da anotação.

## Decisão 2 — delete por bloco, dentro da transação que reconstrói

Hoje: apaga tudo → reconstrói. Uma falha deixa o intervalo não reconstruído **apagado**.

Passa a ser, por bloco: `delete(intervalo do bloco)` + `recalcula(intervalo do bloco)` na **mesma**
transação. Assim, para qualquer bloco, ou o intervalo está reconstruído ou continua com o dado antigo —
nunca vazio.

Consequência sobre o `backup`: ele deixa de ser necessário **como rede de restauração** (que nunca
foi), mas **não pode simplesmente sair** — hoje ele delimita o intervalo via `primeiraMetrica`/
`ultimaMetrica`. Substituir por uma consulta de limites (`min(data)`/`max(data)` das métricas do
atleta) preserva o comportamento sem carregar a lista inteira em memória, que é o ganho real.

Consequência a aceitar: durante o recálculo, o histórico fica **misto** — blocos novos e blocos ainda
antigos convivendo. Antes, no caminho transacional, essa mistura ficava invisível. É o preço do
chunking, e é preferível a um intervalo vazio.

## Decisão 3 — falha informa o progresso, não alega reversão

O `catch` atual relança dizendo "A transação foi revertida". Com chunking isso é falso por construção.

A exceção passa a carregar o intervalo efetivamente reconstruído e o ponto de parada. O javadoc perde
`@throws RuntimeException se falhar durante recálculo (dados são restaurados do backup)` e o log perde
"o banco voltará ao estado anterior".

Sem isso, o chunking apenas troca "perde tudo, e você é avisado errado" por "perde um pedaço, e você
é avisado errado".

## Decisão 4 — REQUIRES_NEW e o pool de conexões

Chamado de `OnboardingServiceImpl.montarContexto`, que já está `@Transactional`, cada bloco mantém
**duas** conexões alocadas: a do chamador (suspensa, mas não devolvida ao pool) e a do bloco. Com
Hikari default de 10, um recálculo consome 2 durante toda a sua duração.

Três saídas, em ordem de preferência:

1. **Aceitar e medir** — 2 conexões por recálculo concorrente. Onboarding não é operação de alto
   volume. Exige registrar a premissa e instrumentar.
2. **Tirar o recálculo de dentro da transação do onboarding** — resolve na raiz e converge com
   `refactor-llm-call-outside-transaction`, mas amplia o escopo para o fluxo de onboarding.
3. **Dimensionar o pool** — trata o sintoma; não é decisão desta change.

Recomendação: **(1)**, com a premissa registrada no `proposal.md` e gatilho de reavaliação se o
onboarding passar a rodar em lote.

**Porém — o pre-mortem mostrou que pool não é o pior efeito aqui.** Com `REQUIRES_NEW`, um recálculo
que comita e um onboarding que falha depois (`OnboardingServiceImpl:116-121`) deixam TSB novo **sem**
o baseline correspondente. Isso é quebra de atomicidade de um fluxo que hoje é atômico, e é uma
decisão de produto disfarçada de detalhe técnico: o atleta fica num estado que o onboarding não
sabe representar.

Se essa quebra não for aceitável, a saída (2) deixa de ser alternativa e vira requisito — o recálculo
sai de dentro da transação do onboarding, e a change cresce para tocar aquele fluxo.

## Decisão 5 — equivalência numérica é o critério que trava tudo

Esta change não pode mudar nenhum número. O risco real de chunking é sutil: o cálculo de CTL/ATL de um
dia depende do dia anterior, então cortar o período em blocos **só é seguro se cada bloco enxergar o
estado deixado pelo bloco anterior**. Com blocos sequenciais e comitados em ordem, isso vale — mas é
o ponto onde a implementação pode errar silenciosamente.

Por isso o CA5 (equivalência antes/depois) é o critério mais importante da change, e o teste precisa
ser sobre valores concretos dia a dia, não sobre "rodou sem exceção".

**Não é só D-1.** O `rampRate` busca **D-7** (`:225-236`), e as constantes de tempo vêm do atleta
(`:517-568`). Um teste com histórico curto e atleta default passaria sem exercitar nenhuma borda de
bloco relevante. O dataset precisa cruzar D-1 e D-7 nas fronteiras, incluir dias sem treino e um
atleta com `ctlTimeConstant`/`atlTimeConstant` customizados.

**Ponto de atenção específico:** o `flush`/`clear` entre blocos descarta o contexto de persistência.
Se o cálculo do primeiro dia de um bloco depender de uma entidade carregada no bloco anterior, ela
virá do banco de novo — correto, desde que o bloco anterior já tenha comitado. A ordem sequencial não
é opcional; paralelizar blocos quebraria o cálculo.

## Decisão 6 — janela de histórico misto: servir, não bloquear

Fechada no gate de DoR (2026-07-28). Os cinco leitores da janela — PMC
(`AtletaProgressServiceImpl:87-96`), home do atleta (`:222-225`), dashboard do coach
(`CoachDashboardServiceImpl:236-256`), fila de atenção (`CoachAttentionQueueServiceImpl:122-129`) e
agregados semanais (`MetricasAgregadasServiceImpl:71-80`) — **continuam respondendo normalmente
durante o recálculo, com o dado que houver**.

Motivo: bloquear a leitura durante um recálculo de 400 dias degradaria o dashboard do coach por
minutos, trocando um dado parcialmente desatualizado por um erro visível. O dado misto é
numericamente válido — cada dia individual está correto, uns na versão nova e outros na antiga.

Consequência: **nenhum dos cinco serviços é alterado**. A task 3b.3 vira documentação do contrato +
o teste 3b.3a, que passa a ser o que prova a decisão: leitura concorrente não pode lançar exceção
nem retornar 500.

## Decisão 7 — falha nos metadados: exceção informativa, metadados no estado anterior

Fechada no gate de DoR (2026-07-28). Se os blocos comitarem e `atualizarMetaDados` ou
`recalcularSemanasProgressao` falhar depois, a exceção propaga informando o intervalo efetivamente
reconstruído e que **os metadados permaneceram no estado anterior** — explicitamente stale, não
silenciosamente dessincronizados.

Motivo: não exige migration, o que mantém a promessa de "sem mudança de schema" do `proposal.md`, e
é coerente com a Decisão 3 (falha informa progresso, não alega reversão). O recálculo é idempotente,
então o caminho de recuperação é re-disparar — não há estado a reparar manualmente.

Descartado: campo de status persistido no `PlanoMetaDados` marcando "dessincronizado". É mais
detectável depois do fato, mas puxa migration e amplia o escopo. Se a detecção pós-fato virar
necessidade, é change própria.

## Decisão 8 — instrumentação: log estruturado + contador Micrometer

Fechada no gate de DoR (2026-07-28). A métrica de sucesso do `proposal.md` ("zero atletas com
histórico parcial silencioso") só é mensurável se o estado deixar de ser silencioso. O sinal:

- **Contador Micrometer** de recálculos abortados, tagueado com o bloco onde parou.
- **Log estruturado** com o intervalo efetivamente reconstruído e o ponto de parada.

Reaproveita o registry Micrometer/Prometheus que a `add-external-call-resilience` já estabeleceu, sem
schema novo. É o que transforma a métrica de sucesso de afirmação em consulta.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Chunking altera valores por dependência entre dias | CA5 com asserção dia a dia, sobre histórico longo (>60 dias, ≥3 blocos) |
| `REQUIRES_NEW` sem proxy (repetir o bug atual) | Colaborador separado + teste de propagação real |
| Duas conexões por recálculo esgotarem o pool | Premissa registrada; reavaliar se onboarding virar lote |
| Histórico misto visível durante o recálculo | Aceito e documentado; alternativa (vazio) é pior |
| Blocos paralelizados por engano num refactor futuro | Comentário explícito + teste de ordem sequencial |
| Onboarding perde atomicidade (TSB novo sem baseline) | CA8; se inaceitável, tirar o recálculo da transação do onboarding |
| `PlanoMetaDados` dessincronizado do histórico | Decisão 7 — exceção informa o intervalo; metadados ficam no estado anterior, explicitamente stale |
| Cache `metadados-atleta` servindo valor pré-recálculo | Invalidar ao fim do recálculo; CA9 |
| Leitor concorrente decidindo com histórico misto | Decisão 6 — servir o dado disponível, sem bloqueio; provado pelo teste 3b.3a |
| Falha de recálculo continuar indetectável | Decisão 8 — contador Micrometer + log estruturado do intervalo reconstruído |
| Remover `backup` quebrar o intervalo de dias de descanso | CA7; trocar a lista por consulta de limites |

## Alternativas descartadas

- **Backup/restore real** — guardar cópia das métricas e restaurar no `catch`. Resolve o problema 2
  sem chunking, mas mantém a transação longa e adiciona um caminho de escrita que só roda em falha
  (portanto raramente testado em produção). O delete por bloco elimina a necessidade.
- **Recálculo assíncrono com job** — resolve timeout e pool de uma vez, mas muda o contrato do
  endpoint e a experiência do treinador. Fora de escopo; vira change própria se a lentidão incomodar.
- **`@Transactional(REQUIRES_NEW)` no `atualizarTsbDia` existente** — uma transação por **dia**, não
  por bloco. 400 transações em vez de 14, e ainda exigiria mover o método para um colaborador.
