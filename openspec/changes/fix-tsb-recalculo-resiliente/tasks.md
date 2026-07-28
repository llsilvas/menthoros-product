# Tasks — fix-tsb-recalculo-resiliente (M · Full · backend · 17 tasks)

> Fechar cada bloco com `./mvnw clean test`. `verify:` = como saber que funcionou.
> A suíte precisa de Docker no ar (Testcontainers) e `POSTGRES_DB=localhost` para os testes de
> contexto — ver nota no fim.

## 0. Pré-requisitos

- [ ] 0.0 **Confirmar a baseline antes de tudo.** A branch `feature/testes-carga-referencia` tem uma
  alteração **não commitada** re-adicionando `@Transactional` a `recalcularHistoricoCompleto`. Decidir
  se ela entra (revert do `f9e754b`) ou sai — o ponto de partida muda, o alvo não
- [ ] 0.1 Criar branch `feature/fix-tsb-recalculo-resiliente` **a partir de
  `feature/testes-carga-referencia`**, não de `develop`
- [ ] 0.2 **Rede de segurança antes de tocar no código**: teste de equivalência que congela o
  resultado atual — histórico de >60 dias, asserção dia a dia sobre CTL/ATL/TSB. É o CA5, e precisa
  existir **antes** do refactor para provar que nada mudou — [CA5]
  - dataset precisa cruzar as fronteiras de bloco em **D-1 e D-7** (`rampRate` usa D-7), incluir dias
    sem treino e um atleta com `ctlTimeConstant`/`atlTimeConstant` customizados — [CA5]
  - verify: teste verde contra o código atual, sem nenhuma alteração de produção
- [ ] 0.2b Teste de idempotência: rodar `recalcularHistoricoCompleto` 2x consecutivas sobre o mesmo
  dataset e confirmar que os 90 valores de CTL/ATL/TSB são idênticos nas duas execuções — [CA5]
  - verify: segunda execução produz os mesmos checkpoints do dataset de referência. Nenhum dia
    diverge > 0.01
- [ ] 0.3 Teste de atleta sem histórico: `recalcularHistoricoCompleto` com atleta que não possui
  nenhum treino nem métricas → `PlanoMetaDados` zerado (CTL=0, ATL=0, TSB=0), zero escritas em
  `metricasDiariasRepository` — [CA6]
  - verify: `planoMetaDadosRepository.findByAtletaId` retorna entidade com `ctlAtual=0.0`,
    `atlAtual=0.0`, `tsbProntidaoAtual=0.0`; `metricasDiariasRepository.count()` inalterado

## 1. Fronteira transacional do bloco

- [ ] 1.1 Colaborador `TsbChunkRecalculador` com método `@Transactional(propagation = REQUIRES_NEW)`
  que apaga e reconstrói **um** intervalo. Bean próprio porque `REQUIRES_NEW` exige proxy — método
  privado repetiria o defeito atual do `atualizarTsbDia` — [CA1, CA2]
  - verify: teste de **propagação real** — o bloco comita mesmo com o chamador marcando rollback.
    Não basta assertar a presença da anotação
- [ ] 1.2 `recalcularPeriodoComProgresso` passa a iterar em blocos de 30 dias delegando ao
  colaborador, com `flush`/`clear` ao fim de cada bloco. **Ordem sequencial é obrigatória** — o CTL/ATL
  de um dia depende do anterior — [CA1]
  - verify: histórico de 400 dias ⇒ 14 blocos; nenhuma transação abrange mais de 30 dias
- [ ] 1.3 `./mvnw clean test` verde — **inclusive o 0.2 sem alteração de asserção** [CA5]

## 2. Delete por bloco

- [ ] 2.1 Remover o `deleteByAtletaId` + `flush` antecipados (`:364-365`); o delete do intervalo passa
  a acontecer dentro da transação do bloco que o reconstrói — [CA3]
  - verify: falha injetada no bloco N ⇒ blocos 1..N-1 comitados e **nenhum dia apagado sem
    reconstrução** (asserção sobre o intervalo do bloco N: mantém o dado antigo, não fica vazio)
- [ ] 2.2 Trocar a lista `backup` por uma **consulta de limites** (`min(data)`/`max(data)` das métricas
  do atleta). Ela não serve para restaurar, mas **delimita** o intervalo via `primeiraMetrica`/
  `ultimaMetrica` (`:421-425`) — remover sem substituir quebra o recálculo de dias de descanso
  posteriores ao último treino — [CA7]
  - verify: atleta com último treino em D e métricas materializadas até D+20 ⇒ o intervalo continua
    indo até D+20; sem carregar a lista inteira em memória
- [ ] 2.3 `./mvnw clean test` verde

## 3. Semântica de falha honesta

- [ ] 3.1 A exceção passa a informar o intervalo efetivamente reconstruído e o ponto de parada, em vez
  de alegar reversão — [CA4]
  - verify: falha no bloco N ⇒ mensagem contém o intervalo reconstruído e **não** contém "revertida"
    nem "estado anterior"
- [ ] 3.2 Corrigir javadoc e log: sai `@throws RuntimeException ... (dados são restaurados do backup)`
  e "a transação será revertida e o banco voltará ao estado anterior". Atualizar o comentário
  `BUG-TEC-002` (`:350`), que hoje descreve chunks que não existiam — [CA4]
  - verify: leitura do javadoc não promete nada que o código não faça
- [ ] 3.3 Resolver o `@Transactional` morto de `atualizarTsbDia` (`:46`): documentar por que não vale
  no fluxo de recálculo, ou remover se não valer em nenhum
  - verify: nenhuma anotação transacional no arquivo sugere garantia que a auto-invocação anula
- [ ] 3.4 `./mvnw clean test` verde

## 3b. Estado além do histórico diário

- [ ] 3b.1 `PlanoMetaDados` em fase transacional própria, com semântica de falha explícita: blocos
  comitados + falha em `atualizarMetaDados`/`recalcularSemanasProgressao` não pode deixar metadados
  silenciosamente dessincronizados do histórico — [CA8]
  - verify: falha injetada após o último bloco ⇒ estado dos metadados é observável, não ambíguo
- [ ] 3b.2 Invalidar o cache `metadados-atleta` ao fim do recálculo — hoje o recálculo escreve direto
  pelo repository (`:242-272`, `:627-634`) e a geração de plano lê pelo serviço cacheado
  (`PlanoServiceImpl:707-716`) — [CA9]
  - verify: recálculo seguido de geração de plano usa CTL/TSB novos, não o valor de cache anterior
- [ ] 3b.3 Decidir e implementar a política da **janela de histórico misto**: leitores concorrentes
  reais são PMC (`AtletaProgressServiceImpl:87-96`), home (`:222-225`), dashboard do coach
  (`CoachDashboardServiceImpl:236-256`), fila de atenção (`CoachAttentionQueueServiceImpl:122-129`) e
  agregados semanais (`MetricasAgregadasServiceImpl:71-80`)
  - verify: contrato explícito por endpoint (bloquear, servir anterior, ou aceitar misto) — não "aceito
    o risco" implícito
- [ ] 3b.3a Teste de leitura concorrente durante recálculo: disparar `recalcularHistoricoCompleto` em
  thread A e, enquanto os blocos estão sendo processados, executar leituras em thread B nos 5 endpoints
  reais (PMC, home, dashboard, fila de atenção, agregados). Nenhuma leitura pode lançar exceção
  (`NullPointerException`, `EntityNotFoundException`) — o contrato mínimo é "dado disponível, mesmo
  que parcial" — [CA3]
  - verify: 5 chamadas de leitura durante recálculo retornam HTTP 200. Se o endpoint optar por
    bloquear (HTTP 423 ou retry), o contrato é explícito. Se optar por servir dado misto, o response
    body é válido. Nenhum stack trace 500.
- [ ] 3b.4 `./mvnw clean test` verde

## 4. Validação final

- [ ] 4.1 `./mvnw clean test` verde
  - ⚠️ `./mvnw verify` está vermelho na `develop` por defeito **pré-existente** em
    `Task5p1ControllerIT` (14 falhas, 403 onde se espera 200/400) — confirmado em worktree de
    `origin/develop` durante a `add-external-call-resilience`. Não é regressão desta change
- [ ] 4.2 Teste manual: recalcular um atleta com histórico longo pelos **dois** caminhos (endpoint do
  controller e onboarding) e confirmar que o resultado é o mesmo — é a diferença que originou o bug
- [ ] 4.2b Cenário de atomicidade do onboarding: falha após o recálculo e antes de persistir o
  snapshot de baseline ⇒ o sistema não pode ficar com TSB novo e baseline ausente sem sinal — [CA8]
- [ ] 4.3 Atualizar este `tasks.md` (implementado vs. adiado) e arquivar conforme o `CLAUDE.md` raiz

## Notas de execução

- **Docker + Testcontainers:** a suíte exige Docker no ar. Se cair no meio, os testes de integração
  falham em massa com `Could not find a valid Docker environment` — é ambiente, não regressão.
  `POSTGRES_DB=localhost` é necessário para os testes de contexto.
- **Não paralelizar os blocos.** É a otimização óbvia e quebra o cálculo: cada bloco depende do estado
  comitado pelo anterior.

## Fora de escopo — abrir como change própria se doer

- Recálculo assíncrono (o endpoint é síncrono e lento mesmo com chunking).
- Tirar o recálculo de dentro da transação do onboarding — converge com
  `refactor-llm-call-outside-transaction`. Vira necessário se a premissa das 2 conexões por recálculo
  não se sustentar.
