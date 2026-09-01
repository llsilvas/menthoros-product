# Tasks — refactor-llm-call-outside-transaction (M · Full · backend)

> Trilha Full: **`design.md` é pré-requisito** — a fronteira da transação (o que atravessa e em que
> formato) é a decisão que define o resto. Não começar pelo código.
> Fechar cada bloco com `./mvnw clean test`. `verify:` = como saber que funcionou.

## Anchors reais (verificados em 2026-07-26)

- **Fluxo:** `PlanoServiceImpl.gerarPlanoTreino` (`@Transactional`) → `getPreparaDadosPlano` (lê) →
  `gerarPlanoSemanal` → `iaService.geraPlanoSemanalAvancado` (**LLM, dentro da transação**) →
  `persistirPlanoCompleto` (escreve).
- **Lazy loading explícito:** `Hibernate.initialize(dadosPlano.atleta().getProvas())` logo no início
  — sinal de que o grafo do atleta é usado depois e nem tudo vem carregado.
- **Invariante na mesma transação:** `planoSemanalRepository.existePlanoAtivoNaSemana` dentro de
  `persistirPlanoCompleto`; rede de segurança é o índice único parcial da **V52**.
- **Lote:** `BatchPlanProcessor` chama o mesmo `gerarPlanoTreino` público, com virtual threads +
  `LlmConcurrencyLimiter` (`Semaphore`, `app.batch-plan.llm-concorrencia:4`, por JVM).
- **Pool:** ~~sem config ⇒ default 10~~ **corrigido em 2026-09-01:** `application-cloud.yml` e
  `application-dev.yml` configuram `maximum-pool-size: 5` (Railway free tier). Com
  `llm-concorrencia = 4`, o lote fixa **4 de 5** conexões (`design.md` D0).
- **Rede de teste existente:** `PlanoServiceImplTest` (33 testes) e o golden-master do prompt.

## 0. Pré-requisitos

- [ ] 0.1 Confirmar o tamanho real do pool em produção — **parcial (2026-09-01):** o profile `cloud`
  fixa 5 no repo (`design.md` D0); falta só um `printenv | grep HIKARI` no serviço Railway para
  confirmar que nenhuma env sobrescreve
- [ ] 0.2 Recalcular o ponto de ruptura com o p95 real da rota `PLANO`, quando o `Timer` de
  `add-external-call-resilience` tiver ~2 semanas de dado (a conta atual usa os ~80s de um
  comentário de código)
- [x] 0.3 Verificar se `WorkoutAnalysisListener` e `WeeklyFocusNarrativeService` têm o mesmo
  acoplamento — **sim, os dois** (`@Async` + `@Transactional(REQUIRES_NEW)` em volta do LLM).
  Ficam fora desta change, como follow-up XS (`design.md` D6)
- [ ] 0.4 Criar branch `feature/refactor-llm-call-outside-transaction`
- [x] 0.5 Tier da chave OpenAI em produção — **tier 3** (founder, 2026-09-01): o provedor não é o
  gargalo; `llm-concorrencia` pode subir para 8–10 depois do merge (`design.md` D0)
- [x] 0.6 Grilling do `design.md` (2026-09-01): Q1–Q13 decididas pelo founder; `CONTEXT.md` ganhou
  **Lote de planos**, **Plano ativo** e **Revisão consumida**; três follow-ups XS no D6

## 1. Design (bloqueia a implementação)

- [x] 1.1 `design.md` (D2 — detached para ler, recarga por id para escrever):: decidir **o que atravessa a fronteira** — entidades detached, records de
  leitura, ou recarregar na fase de escrita. É a decisão que define o risco de
  `LazyInitializationException` e o tamanho do diff
- [x] 1.2 `design.md` (D3 — checar na fase 1, re-checar na fase 3, índice V52 decide, `DataIntegrityViolationException` vira `PlanoJaExistenteException` no orquestrador):: decidir o **comportamento sob conflito** — `existePlanoAtivoNaSemana` passa a
  rodar em transação diferente da que persiste, abrindo janela para geração concorrente do mesmo
  plano. Hoje o índice único da V52 é a rede; definir se o tratamento é falhar limpo ou re-checar
- [x] 1.3 `design.md` (tabela do D2; resta confirmar `treinoHistoricoProvider.prepararContexto` pelo teste do CA5):: mapear todo acesso a entidade JPA **depois** da chamada ao LLM (candidatos a
  estourar detached) — varredura em `persistirPlanoCompleto`, `criarPlanoComTreinos`,
  `prepararMetadados`, `plannerShadowService.aplicarShadow`
- [ ] 1.4 Pre-mortem (trilha Full) sobre o design escolhido

## 2. Separar leitura da chamada externa

- [ ] 2.0 Confirmar que nenhuma tela usa `PlanoMetaDados.dataUltimaAtualizacao` como "última vez que
  calculei" — o metadado passa a poder existir sem plano (`design.md` D1, riscos)
- [ ] 2.1 Extrair a fase de leitura para transação própria e curta, devolvendo o que o design definiu
  - verify: teste que executa a leitura e acessa todos os campos usados adiante **sem transação
    ativa** — se estourar `LazyInitializationException`, a fronteira está errada — [CA5]
- [ ] 2.2 Tirar `gerarPlanoTreino` do `@Transactional` (ou reduzir a propagação), com a chamada ao
  LLM fora de qualquer transação — [CA1]
  - verify: teste com pool reduzido (ex.: Hikari max 2) gera plano normalmente; hoje, com o LLM
    dentro da transação, mais gerações concorrentes que o pool travam
- [ ] 2.3 `./mvnw clean test` verde

## 3. Persistência em transação curta

- [ ] 3.1 `persistirPlanoCompleto` em transação própria, iniciada só depois da resposta do LLM
  - verify: `PlanoServiceImplTest` (33) verde sem alteração de asserção — o comportamento observável
    não muda — [CA3]
- [ ] 3.2 Tratamento do conflito concorrente conforme decidido em 1.2 — [CA4]
  - verify: teste concorrente (duas gerações para o mesmo atleta/semana) ⇒ uma falha com
    `PlanoJaExistenteException`, nenhuma linha duplicada (Testcontainers, Postgres real — o índice
    parcial da V52 só existe no banco)
- [ ] 3.3 `./mvnw clean test` verde

## 4. Prova do ganho

- [ ] 4.1 Métrica/asserção de que conexões ativas não escalam com `llm-concorrencia` — [CA2]
  - verify: lote simulado com concorrência 4 e LLM lento (WireMock `withFixedDelay`) ⇒ conexões
    ativas permanecem baixas; antes da change, 4
- [ ] 4.2 Golden test do plano gerado inalterado — [CA3]
- [ ] 4.3 `./mvnw clean test` + `./mvnw verify` verdes

## 5. Validação final

- [ ] 5.1 Teste manual: lote com LLM artificialmente lento, confirmando que o app segue respondendo
  (login e telas do atleta) durante o lote inteiro — é o sintoma que motiva a change
- [ ] 5.2 Reavaliar `BATCH_PLAN_LLM_CONCORRENCIA`: depois desta change ele volta a ser ajuste sobre
  custo/429 do provedor, não sobre pool de conexão. Documentar isso no `application.yml`, onde hoje
  o comentário não menciona o efeito colateral
- [ ] 5.3 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar conforme o `CLAUDE.md` raiz
