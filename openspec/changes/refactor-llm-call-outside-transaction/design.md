# Design — refactor-llm-call-outside-transaction

> Anchors verificados em 2026-09-01 contra `develop` do backend (`PlanoServiceImpl`,
> `BatchPlanProcessor`, `DadosPlanoDto`, `application*.yml`, V52). Precedente seguido:
> `intervals-icu-activity-ingestion` (D3 — "a chamada HTTP fica FORA da `@Transactional`; método
> público não-transacional orquestra; persistência em colaborador transacional").

## D0 — A conta é pior do que a proposal diz: o pool é 5, não 10

A proposal assume o default do Hikari (10) porque `application.yml` não configura o pool. Mas os
profiles que rodam de verdade configuram:

```yaml
# application-cloud.yml L21-26 (idêntico em application-dev.yml L24-29)
hikari:
  maximum-pool-size: 5        # Railway free tier limita conexões simultâneas
  minimum-idle: 1
  connection-timeout: 30000
```

Com `llm-concorrencia = 4` (default), **um lote fixa 4 das 5 conexões** durante toda a sua duração.
Sobra **uma** conexão para login, telas do atleta, dashboard do coach e para o próprio
`existePlanoParaSemana` do lote. Não é um problema de "quando crescer": é uma degradação que já
acontece em todo lote, mascarada só porque as assessorias atuais são pequenas e o lote termina
rápido. Subir `BATCH_PLAN_LLM_CONCORRENCIA` para 5 em produção hoje **zera o pool** para o resto do
app enquanto o lote roda.

Isso responde a task 0.1 (a config está no repo, não em env do Railway — ainda vale um
`printenv | grep HIKARI` no serviço para confirmar que nada sobrescreve) e reforça a prioridade: o
ponto de ruptura por `recovery-limite-min` continua em ~90 atletas, mas a degradação do app durante o
lote é imediata e independe do tamanho da assessoria.

### O cenário das fundadoras: 100 planos na mesma janela

Com `convite-assessorias-fundadoras`, o regime passa a ser **10 assessorias × 10 atletas = 100
planos por semana**, e o padrão provável é o pior: os 10 treinadores disparam o lote na mesma
janela (domingo à noite), porque o ciclo semanal é o mesmo para todos. Contra o código de hoje:

- `LlmConcurrencyLimiter` é **um semáforo por JVM**, não por assessoria, e não-justo. Dez lotes
  disputam 4 permits: 100 × 80s ÷ 4 ≈ **33 minutos** até a última assessoria terminar — o
  treinador que clicou por último espera meia hora sem saber por quê, e o `recovery-limite-min`
  (30) já foi ultrapassado.
- O **"gerar" individual não passa pelo limiter** (`PlanoTreinoController` → `planoService`
  direto). Hoje 5 cliques simultâneos esgotam o pool de 5 sozinhos; depois desta change o pool
  para de importar, mas a concorrência contra o provedor fica ilimitada.
- **O provedor não é o gargalo.** A chave OpenAI de produção está no **tier 3** (confirmado pelo
  founder em 2026-09-01: 800k TPM para o gpt-4o). Com ~10k tokens por plano de 80s, a concorrência
  sustentável passa de 100 — o limite real de `llm-concorrencia` vira custo e comportamento do
  lote, não 429.
- **Um lote órfão é barato de retomar:** `processarAtleta` já tem o fast-path
  `existePlanoParaSemana`, então clicar de novo pula os atletas prontos. Não precisamos de um lote
  que nunca morre; precisamos de um que morre limpo e recomeça de onde parou.

Decisões do founder (grilling de 2026-09-01), em ordem de execução:

1. **Esta change primeiro** — sem ela, subir a concorrência derruba o app para todo mundo.
2. **`llm-concorrencia` sobe para 8–10** depois do merge, por decisão de operação (task 5.2).
   Com tier 3, 100 planos cabem em ~15 minutos.
3. **Cap por assessoria dentro do cap global + faixa reservada para o clique individual** — change
   XS própria, `fair-llm-concurrency-per-tenant` (ver D6). Com 10 lotes e global 10, cada
   assessoria anda a 2 por vez e todas terminam em ~7 min, em vez de a primeira em 3 e a última em
   33. Semáforo justo (FIFO) não resolve: o primeiro lote enfileira 10 de uma vez.
4. **Recovery por estado, não por idade** — change XS própria (ver D6).
5. **Lote agendado (cron) fica fora** — resolveria a coincidência de horário, mas tira do
   treinador o ato de disparar, e o produto é coach-in-the-loop. Reavaliar com ~30 assessorias.

## D1 — Fronteira: três fases, orquestrador sem transação, colaboradores transacionais

`gerarPlanoTreino` perde o `@Transactional` e vira um orquestrador que só encadeia:

```
PlanoServiceImpl.gerarPlanoTreino(atletaId, modo)              ← SEM transação
  1. ctx = contextLoader.load(atletaId, modo)                  ← @Transactional (curta)
  2. planoDto = gerarPlanoSemanal(ctx, ...)                    ← LLM, nenhuma conexão em posse
  3. return persister.persist(ctx, planoDto, modo)             ← @Transactional (curta)
```

**Colaborador, não self-injection.** O `@Transactional` do Spring é por proxy: chamar
`this.getPreparaDadosPlano()` de dentro da mesma classe não abre transação nenhuma. O precedente
(`IntervalsIcuPushProcessor`) já escolheu colaborador para evitar o `@Lazy @Autowired self`; aqui
seguimos o mesmo. Nascem duas classes em `services/impl/` (ou `services/helper/`, onde já mora
`LlmConcurrencyLimiter`), **nomeadas em inglês** — a regra de 2026-07-25 do `CLAUDE.md` do backend
("tipos novos nascem em inglês") e as classes mais recentes do mesmo pacote
(`ConsumedReviewOutcomeResolver`, `WeeklyReviewPromptProvider`) decidem o idioma:

- **`PlanGenerationContextLoader.load(atletaId, modo)`** — `@Transactional` (não `readOnly`,
  porque `planoMetadadosService.buscarOuCriarMetadados` pode inserir). Absorve o que hoje é
  `getPreparaDadosPlano` (L710-743) **mais** tudo que roda antes da chamada ao LLM e lê banco:
  `Hibernate.initialize(atleta.getProvas())` (L143), `calcularDecisaoProgressao` (L145),
  `calcularSemanaInicio` (L157), `weeklyReviewPromptProvider.resolverParaGeracao` (L158-159) e
  `buscarProximaProva` (hoje dentro de `gerarPlanoSemanal`, L777 — lê `getProvas()`).
- **`PlanGenerationPersister.persist(ctx, planoDto, modo)`** — `@Transactional`. Absorve
  `persistirPlanoCompleto` (L209-286) inteiro: re-checagem de duplicidade, redistribuição,
  `prepararMetadados`, `criarPlanoComTreinos`, shadow do planner, auto-approve, calibração do
  onboarding, revisão consumida e `publicarRevisaoConsumida`. Os `@Transactional` de
  `OnboardingServiceImpl` e `PlanoReviewService` continuam participando da mesma transação
  (`REQUIRED`), como hoje.

O `try/catch` que hoje mapeia `IllegalArgumentException`/`Exception` para `LLMException`
(L170-182) fica no orquestrador, envolvendo as três fases — o contrato de erro do controller e do
lote não muda.

**O que muda de semântica, de propósito.** Hoje, se o LLM falha, o `INSERT` de
`buscarOuCriarMetadados` sofre rollback. Com a fase 1 commitada, o metadado **fica**. É desejável:
`buscarOuCriar` é idempotente, e foi exatamente esse rollback tardio que causou o incidente de
2026-08-15 (cache devolvendo entidade de transação revertida — `PlanoMetadadosCacheIT`). Aquele IT
foi escrito assumindo que "a transação de `gerarPlanoTreino` leva ~50s e é provável reverter"; a
premissa deixa de existir e o teste precisa ser reescrito para o novo contrato (o metadado criado na
fase 1 sobrevive a uma falha do LLM), não apagado.

## D2 — O que atravessa a fronteira: entidades detached, com recarga na escrita

Três opções foram consideradas:

| Opção | Diff | Risco de `LazyInitializationException` | Toca o prompt/golden? |
|---|---|---|---|
| A. Records puros (`Atleta` → `AtletaSnapshot`) | grande — `IaService.geraPlanoSemanalAvancado` recebe `Atleta` e `PlanoMetaDados`, e o `PlanoTreinoPromptBuilder` lê a entidade | zero | sim |
| B. Entidades detached, sem mais nada | mínimo | alto e difuso — cada `get` lazy é uma bomba | não |
| **C. Detached para ler, recarga para escrever** | médio | contido num único lugar | não |

**Decisão: C.** A fase 1 devolve um record `PlanGenerationContext` que substitui `DadosPlanoDto`
(mesmos campos + `decisaoProgressao`, `semanaInicio`, `revisaoConsumida`, `proximaProva`), carregando
as entidades **já inicializadas em todos os caminhos lazy que o fluxo usa**:

| Caminho lazy | Onde é lido depois do LLM | Como fica |
|---|---|---|
| `atleta.getProvas()` | `buscarProximaProva` (L777) | lido **antes** do LLM, na fase 1; `proximaProva` vira campo do contexto |
| `atleta.getDiasDisponiveis()` | `obterTreinosParaPlano` (L443) | `Hibernate.initialize` na fase 1 |
| `atleta.getAssessoria()` | `criarPlanoEntity` (L596) | `Hibernate.initialize` na fase 1 (ou `getAssessoria().getId()` já resolvido no contexto) |
| `atleta.getDiaPreferidoLongo()` | `inferirDiaPrioritarioLongo` (L235) | coluna simples, sem risco |
| `metaDados` | `prepararMetadados` (L636-650) | **já é re-buscado** por `findByIdAndTenantId` (L643-650) por causa do incidente do cache — a fase 3 mantém isso e passa a ser a regra, não a exceção |
| `revisaoConsumida` | `plano.setConsumedReview` (L301), leitura em L322 | fase 3 reanexa por `getReferenceById`/`findById` |
| `treinoHistoricoProvider.prepararContexto(atleta)` | dentro de `IaServiceImpl.validarENormalizarPlanoGerado` (L360-370), entre retries | **verificar na task 1.3**: o `atleta` ali vem de um `findByIdAndTenantId` próprio (L360), então é gerenciado só durante a query do repository — qualquer lazy depois disso já estoura hoje ou não é usado; confirmar com o teste do CA5 |

Regra que vale para a fase 3: **nada que vai ser salvo ou associado usa a instância detached** —
`atleta`, `metaDados` e `revisaoConsumida` são recarregados por id dentro da transação de escrita e
são essas instâncias que entram no `PlanoSemanal`. A detached serve para ler valores e montar o
prompt. É a mesma disciplina que `prepararMetadados` já pratica sozinho hoje.

**Por que não A.** É a resposta certa a longo prazo (o `CLAUDE.md` do backend já proíbe entidade
JPA atravessando para a lógica de skill, e `DadosPlanoDto` viola isso desde sempre), mas custa
reescrever a assinatura de `IaService` e o `PlanoTreinoPromptBuilder` — o golden test mudaria por
razão estrutural, e perderíamos a rede que prova o CA3. Fica registrado como follow-up no Radar:
"snapshot do atleta para o prompt", a fazer quando o prompt builder for tocado por outro motivo.

**Por que não B.** O diff seria de meia dúzia de linhas e o risco ficaria invisível até o primeiro
`get` lazy novo. O teste do CA5 (D5) é o que torna C sustentável: ele falha quando alguém adiciona
um acesso lazy depois da fronteira.

## D3 — Conflito concorrente: checar cedo, checar de novo, e o índice decide

`existePlanoAtivoNaSemana` roda hoje **depois** do LLM (L222-228), na mesma transação que persiste.
Com a fronteira aberta, ele passa a rodar em transação diferente e a janela TOCTOU cresce de
milissegundos para a duração da chamada. Três camadas, cada uma com um papel:

1. **Fase 1 — checagem barata antes de gastar.** `existePlanoAtivoNaSemana` entra no
   `contextLoader`, logo depois de `calcularSemanaInicio`. Se já existe, `PlanoJaExistenteException`
   **antes** da chamada ao LLM — hoje o lote tem esse fast-path (`BatchPlanProcessor` L157), o
   endpoint do coach não tem, e paga ~80s e o custo do modelo para receber um 422.
2. **Fase 3 — re-checagem dentro da transação de escrita.** Mantida onde está. Fecha a janela para
   o caso comum (duas gerações que não se sobrepõem no commit).
3. **Índice parcial da V52 — a autoridade.** `uk_plano_semanal_atleta_semana_ativo` sobre
   `(atleta_id, semana_inicio) WHERE review_status <> 'REJEITADO'`. Quando duas gerações passam
   pelas checagens 1 e 2 e commitam juntas, a segunda recebe `DataIntegrityViolationException`
   **no commit** — ou seja, fora do `persister`, e por isso só é capturável no orquestrador, que
   agora **não é transacional**. É o padrão que o `CLAUDE.md` do backend já documenta ("catching
   `DataIntegrityViolationException` requires a NON-`@Transactional` method").

**A checagem cedo não bloqueia nenhum caso legítimo.** Não existe fluxo de "regerar": para uma
semana com plano ativo, o treinador só gera de novo depois de rejeitar o plano (só em
`AGUARDANDO_REVISAO`) ou deletá-lo (`DELETE /planos/{id}`, único caminho para plano `APROVADO`).
Em ambos o plano deixa de ser ativo antes da nova geração, então a fase 1 devolve o mesmo 422 de
hoje — só que antes de gastar ~80s e uma chamada de LLM. Se "regerar" um dia existir, ele passa por
rejeitar/deletar primeiro, não por relaxar a checagem.

**Decisão sobre o comportamento sob conflito:** o orquestrador captura
`DataIntegrityViolationException` vinda da fase 3 e a converte em `PlanoJaExistenteException`
**somente quando a causa raiz cita `uk_plano_semanal_atleta_semana_ativo`** (o Postgres devolve o
nome da constraint no `SQLException`); qualquer outra violação de integridade segue como 409 — não
se mascara uma constraint desconhecida com mensagem de plano duplicado. Efeito:

- **Endpoint do coach:** 422 com a mensagem de domínio ("já existe plano ativo para esta semana"),
  em vez do 409 genérico "conflito de dados" do `GlobalExceptionHandler` (L181-189). O coach entende
  o que aconteceu.
- **Lote:** `BatchPlanProcessor` já trata as duas exceções como `MOTIVO_PLANO_JA_EXISTE` (L166-171);
  nada muda, mas a conversão deixa de depender disso.

**Não re-tentar, não "adotar" o plano vencedor.** A geração perdedora gastou uma chamada de LLM
que será descartada — é o custo de uma corrida que só existe se o mesmo atleta for gerado duas
vezes ao mesmo tempo (coach clicando durante o lote). Falhar limpo é o comportamento correto; a
checagem 1 é o que reduz a frequência.

## D4 — O lote: o semáforo continua em volta do LLM, e só dele

`BatchPlanProcessor.processarAtleta` já não é transacional e adquire o permit do
`LlmConcurrencyLimiter` **fora** de qualquer transação (L161); o que ele não controlava era o
proxy de `PlanoService` abrindo a transação dentro do supplier. Com D1, dentro do permit rodam a
fase 1 (transação de milissegundos), a chamada ao LLM e a fase 3 (idem). As conexões em posse
durante o lote passam a ser **transientes** — o CA2 vira consequência estrutural, não ajuste.

Não movemos a fase 3 para fora do permit: seria otimização de milissegundos e mudaria a ordem em que
o lote observa `PlanoJaExistenteException`. Fora de escopo, como a proposal já diz.

`BatchPlanServiceImpl.iniciarLote` (afterCommit → `processarLote`) e `BatchPlanRecoveryService`
não mudam. O limite de 30 min do recovery continua sendo a premissa "nenhum lote real dura tanto";
com o pool livre, ela volta a ser só uma questão de N × 20s, e a task 0.2 recalcula com o p95 real.

## D5 — Como se prova: quatro testes, um por risco

| CA | Teste | Onde | O que prova |
|---|---|---|---|
| CA5 | `PlanoGeracaoContextoDetachedTest` | unit + `@DataJpaTest`, sem transação ativa no corpo (`@Transactional(propagation = NOT_SUPPORTED)`) | carrega o contexto pelo `contextLoader` real, fecha a sessão, e percorre **todos** os acessos da tabela do D2 — se alguém adicionar um `get` lazy depois da fronteira, este teste é o que quebra |
| CA1 | `PlanoServiceTransactionBoundaryIT` | `@SpringBootTest` + WireMock com `withFixedDelay`, LLM stubado | dentro do stub do LLM, `TransactionSynchronizationManager.isActualTransactionActive()` é **false** e o `HikariPoolMXBean.getActiveConnections()` é **0** para a thread da geração |
| CA2 | `BatchPlanPoolIT` | idem, `hikari.maximum-pool-size: 2` no profile de teste, `llm-concorrencia: 4` | 4 gerações concorrentes com LLM lento completam; antes da change, com pool 2, travariam em `connection-timeout` |
| CA4 | `PlanoGeracaoConcorrenteIT` | Testcontainers Postgres (o índice parcial só existe no banco real) | duas gerações para o mesmo atleta/semana, LLM sincronizado por `CountDownLatch` para commitarem juntas ⇒ uma `PlanoJaExistenteException`, `count = 1` |
| CA3 | `PlanoServiceImplTest` (33) + `PlanoTreinoPromptBuilderGoldenTest` | existentes | verdes **sem alteração de asserção** — o `MockedStatic<Hibernate>` em volta de cada chamada sai, porque o `initialize` migra para o `contextLoader` (que é mockado) |

`PlanoMetadadosCacheIT` é reescrito conforme o D1.

## D6 — Os outros dois pontos com LLM em transação ficam fora, com data marcada

A task 0.3 está respondida: **os dois têm o mesmo acoplamento**.

- `WorkoutAnalysisListener.onTreinoRegistrado` — `@Async` + `@Transactional(REQUIRES_NEW)` em
  volta de **2 a 3 chamadas** (Sonnet, tradutor, bloco do atleta).
- `WeeklyFocusNarrativeService.gerarNarrativa` — `@Async` + `@Transactional(REQUIRES_NEW)` em volta
  de `modelClient.redigirFoco`.

Cada execução segura uma conexão pelo tempo da chamada. Os executores limitam a posse simultânea:
`workoutAnalysisExecutor` roda efetivamente com **2 threads** (core 2, só cresce para 4 com 50
tarefas na fila) e `weeklyFocusExecutor` com **1**. São até **3 conexões a mais** fixadas em LLM —
somadas às 4 do lote, passam do pool de 5. **Decisão do founder: fora desta change**, por dois
motivos — o refactor do plano é o fluxo mais caro do produto e merece um PR que se lê sozinho; e o
padrão que sai daqui (loader + persister) é o que os dois vão reutilizar, então fazê-los depois é
mais barato que junto. Mas o follow-up não é cosmético: é a diferença entre "sobra 1 conexão" e
"pool esgotado com `connection-timeout` de 30s".

Três changes XS nascem deste design, todas pré-condicionadas a esta:

| Change | Escopo | Por quê separada |
|---|---|---|
| `refactor-async-llm-listeners-outside-transaction` | `WorkoutAnalysisListener` e `WeeklyFocusNarrativeService` com o padrão loader/persister | reutiliza o padrão; PR do plano se lê sozinho |
| `fair-llm-concurrency-per-tenant` | `LlmConcurrencyLimiter` ganha cap por assessoria dentro do cap global (ex.: 2 em voo por tenant) **e** o "gerar" individual passa pelo limiter com 1–2 permits reservados para interativo | comportamento novo, só no limiter, teste próprio (10 lotes simulados ⇒ interleaving; interativo nunca espera o lote) |
| `batch-plan-recovery-by-state` | no startup, todo job `EM_PROGRESSO` é órfão (as virtual threads morreram com a JVM); status "interrompido — clique para continuar", porque o fast-path já retoma | o limite de 30 min por `criadoEm` não protege contra nada com uma réplica e marca lote longo saudável como erro; ressalva se houver mais de uma réplica |

## D7 — Operação e rollback

- **Sem migration, sem contrato de API alterado.** Rollback é reverter o PR.
- `application.yml` L289-295: o comentário de `llm-concorrencia` passa a dizer o que ele controla
  (custo/429 do provedor) e o que **deixou** de controlar (conexões do pool). Hoje o comentário não
  menciona o efeito colateral, e quem sobe o valor em produção não tem como saber (task 5.2).
- **Como a métrica de sucesso é observada.** O Hikari é exportado (`hikaricp_connections_active`),
  mas só em `/actuator/prometheus`, autenticado e **sem nenhum scraper** — nada coleta, grava ou
  alerta. A prova reproduzível é o teste do CA2; a validação operacional é um `curl` autenticado em
  `/actuator/prometheus` durante um lote real, uma vez, registrado na task 5.1. Coleta de métricas
  (Prometheus/Grafana) é change própria, se um dia valer o custo — não entra aqui.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Acesso lazy esquecido depois da fronteira | teste do CA5 percorre a lista do D2; a lista vive no `contextLoader`, num único lugar |
| `prepararMetadados`/`criarPlanoEntity` usam a instância detached para salvar → `detached entity passed to persist` | regra do D2: a fase 3 recarrega por id tudo que vai ser associado; revisão de código com essa checklist |
| Metadado criado na fase 1 sobrevive à falha do LLM | desejado (D1); `PlanoMetadadosCacheIT` reescrito para o novo contrato. A linha nasce com métricas nulas e `dataUltimaAtualizacao = hoje` (a UI lê como "COLETANDO DADOS") — mesmo estado que já existe entre criação e primeiro cálculo. Task de verificação: nenhuma tela usa `dataUltimaAtualizacao` como "última vez que calculei" |
| `RevisaoConsumidaEvent` publicado dentro do `persister` | **não é risco:** `resolverParaGeracao` só lê, o vínculo é setado em memória antes do save, e o evento **não tem nenhum consumidor** no código. Fica onde está; evento sem listener é débito anotado, não decisão desta change |
| Coach clica "gerar" durante o lote e recebe 422 | comportamento correto (D3); a checagem cedo faz isso acontecer antes de gastar LLM |
| Diff grande no arquivo mais crítico | as duas classes novas são extração mecânica; a suíte de 33 testes é a rede; PR único, revisado com `code-reviewer` + Codex adversarial |

## Follow-ups (Radar)

- As três changes XS da tabela do D6: `refactor-async-llm-listeners-outside-transaction`,
  `fair-llm-concurrency-per-tenant`, `batch-plan-recovery-by-state`.
- Snapshot do atleta para o prompt (opção A do D2) — quando o `PlanoTreinoPromptBuilder` for
  tocado por outro motivo.
- `RevisaoConsumidaEvent` sem consumidor — decidir se ganha listener ou sai.
- Confirmar por `printenv` no serviço Railway que nenhuma `SPRING_DATASOURCE_HIKARI_*` sobrescreve
  o pool 5 do profile (task 0.1).

## Glossário

Termos registrados no `CONTEXT.md` a partir deste design: **Lote de planos**, **Plano ativo**,
**Revisão consumida**.
