# Tasks — planner-engine-enforcement (parte 2/2: skeleton vinculante)

> Backend + frontend minimo (superficie de review — design.md Decisao 8). Ordem: flags/contratos (1) -> SessionSlot prescritivo (2) -> prompt (3) -> estagio 1 (4) -> estagio 2 (5) -> batch (6) -> superficie de review (7) -> verificacao final (8).
> Validacao: `./mvnw clean test` a cada etapa; golden set da parte 1 permanece bloqueante; frontend `npm run lint && npm run build`.
> **Pre-requisitos:** `deterministic-planner-engine` (parte 1) mergeada — hard. `refactor-iaservice-decomposition` mergeada — recomendado (estagio 1 entra em `PlanoLlmValidator`); se nao estiver, confirmar com o usuario antes da secao 4 se implementa contra o `IaServiceImpl` atual.
> **Gate de rollout (CA11) em DUAS PORTAS (design Decisao 5):** porta 1 (piloto) = divergencia do shadow <= 2% (>= 2 semanas, >= 30 planos) + defaults seguros; porta 2 (promocao geral) = metricas do piloto por coorte/fase (retry < 15%, FAILED < 5%, fallback < 5%, rejeicao do coach nao pior que baseline). Fail-closed em qualquer porta. Medicao na task 8.4 antes de cada porta.

> **Revisao DoR (2026-09-08, Codex NOT READY):** incorporados design Decisao 2 (check final apos TODAS
> as transformacoes, inclusive `garantirProvasNaSemana`), Decisao 3 (precedencia fail-closed das
> invariantes obrigatorias sobre o fail-open) e Decisao 3b (orcamento unico por requisicao, que o
> cold-start reusa). Tasks 1.4, 4.3, 5.1/5.2, 7.1 e 8.4 ajustadas abaixo.

## 1. Flags e contratos de enforcement

- [x] 1.1 Config: `planner-engine.enabled=false` e `planner-engine.fail-open=true` em `application.yml` (o `shadow` da parte 1 permanece independente).
- [x] 1.2 Estender `PlannerComplianceStatus` se necessario para o ciclo completo (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`) e documentar a matriz fail-open + a precedencia hard×soft (design.md Decisao 3) no javadoc.
- [x] 1.3 **verify:** `./mvnw -q compile` verde; com ambos os flags default, `./mvnw clean test` sem regressao.
- [x] 1.4 **Orcamento unico por requisicao (design.md Decisao 3b):** tornar o orcamento de geracao (`MAX_TENTATIVAS`/`DEADLINE_TOTAL`) com escopo de requisicao — objeto/parametro passado a `gerarComResiliencia`, debitado antes da chamada (inclusive em falha), relogio preservado entre etapas, e nenhuma geracao nova quando esgotado. Expor de forma que `fix-cold-start-calibration` consuma o mesmo contador. **verify:** teste — 2 tentativas no estagio 1 + fallback NAO ultrapassa 2 geracoes; relogio nao reinicia; esgotado nao inicia nova geracao.

## 2. SessionSlot prescritivo (dia + TSS + zonas)

> **DESBLOQUEADA (grilling 2026-09-09):** a composicao por fase esta fechada na **Decisao 4b** e no
> **ADR-0011** — modelo de carga LINEAR (`TSS = fatorImpacto × TAXA_BASE × horas`, sem IF²), `targetTss`
> como ancora, tabela de composicao por fase, contrato da PROVA, polarizacao soft, clamps de duracao.
> As tasks abaixo implementam esse contrato; os numeros (TAXA_BASE, faixas, tetos) sao calibraveis.

- [x] 2.0 TDD do **motor de composicao** (novo): dado fase + `WeeklyLoadTarget` + dias + capacidade +
      prova, gera a lista ordenada de `SessionSlot` (tipo/chave) conforme a tabela da Decisao 4b, com
      `sessionCount` e teto de duras por fase. **verify:** golden por fase (BASE/BUILD/PEAK/TAPER/
      RACE_WEEK/RECOVERY/RETURN_TO_TRAINING), incluindo poucos dias e sem historico.
- [x] 2.1 TDD: alocacao de dias no `PlannerEngine`: longao ancorado no dia preferido/inferido, intensos
      nunca adjacentes (inclusive fronteira domingo→segunda), leves preenchem, dias indisponiveis
      respeitados (regras absorvidas da `WeeklyDistributionSkill` orfa — design.md Decisao 4). **verify:** testes vermelhos.
- [x] 2.2 Absorver a logica de alocacao em `domain/planner` (sem depender do registry de skills); decidir destino da `WeeklyDistributionSkill` original (aposentar ou wrapper fino) e registrar a decisao. **verify:** `SessionSlotAllocationTest` verde + `DomainBoundaryArchTest` verde.
- [x] 2.3 TDD: reparticao de TSS por slot pelo modelo LINEAR da Decisao 4b (`TSS = fatorImpacto ×
      TAXA_BASE × horas`; peso do slot = `fatorImpacto`; normaliza ao `targetTss`; duracao derivada e
      clampada aos limites por tipo + `duracaoMaximaMinutos`; residuo redistribuido). **NAO** usar IF².
      **verify:** soma dos slots == `targetTss` (dentro da banda); duracoes dentro dos clamps; vermelho -> verde.
- [x] 2.4 Incluir `zonaFc`/`faixaPace` por slot (recorte das zonas de `ZonaTreinoService`/`PaceZoneCalculator`, calculadas na camada de service e passadas via snapshot). **verify:** teste unitario dos slots completos.
- [x] 2.5 Estender o golden set da parte 1 com casos de alocacao (semana com prova, atleta 3 dias disponiveis, longao inferido do historico). **verify:** `PlannerEngineGoldenSetTest` 100% verde.

## 3. Skeleton no prompt + formatter como renderer

- [x] 3.1 TDD: golden-master do prompt — com `enabled=true`, o prompt contem o bloco mandatorio de slots (dia, tipo, TSS, zonas); com `enabled=false`, prompt identico ao legado. **verify:** testes vermelhos.
- [x] 3.2 Injetar `WeekPlanSkeleton` no contexto do prompt em `PlanoServiceImpl`/`PlanoTreinoPromptBuilder` (bloco mandatorio, padrao do bloco [1] de Constraints). **verify:** golden-master verde.
- [x] 3.3 Reduzir `PeriodizacaoPromptFormatter` a renderer **apenas no caminho `enabled=true`** (remove calculo de fase/TSS-alvo/step-back/tipo de semana); com `enabled=false`, preservar o calculo legado byte-a-byte (CA9). Classe preservada. **Preservar a metrica de divergencia do SHADOW (parte 1)** — o gate de rollout (8.4) depende dela; so a divergencia dual-calc do formatter no caminho enabled some. **verify:** `./mvnw clean test` sem regressao; golden-master do prompt legado (flag off) byte-a-byte; shadow ainda coletando divergencia.
- [x] 3.4 Alinhar template x schema (3-5 treinos, minimo de etapas) — design.md Decisao 7. **verify:** golden-master atualizado deliberadamente.

## 4. Estagio 1 — compliance pre-redistribuicao com retry existente

- [x] 4.1 TDD: violacao de skeleton (fase, sessionCount, TSS, longo, intensidade, prova-na-semana, slot) lanca `LLMException` — a mesma via de `validarENormalizarPlanoGerado` — e aciona o retry do `PlanoResilienceService` (`MAX_TENTATIVAS=2`), com as `PlannerViolation` (key + mensagem) no feedback estruturado. **verify:** `IaServiceImplComplianceEstagio1Test` (3) verde.
- [x] 4.2 Wrapper em `IaServiceImpl` (refactor `PlanoLlmValidator` nao mergeado — decisao: manter em `IaServiceImpl`): metodo privado `aplicarComplianceEstagio1` roda `PlannerShadowService.checkPreRedistribution` dentro da funcao `validar` do `gerarComResiliencia`; converte violacoes em `LLMException` + `planner.compliance.failure.count{stage=PRE}`. O `plano_retry` (feedback) ja e emitido pelo `PlanoResilienceService`. So roda com `skeleton != null` (flag on); flag off = no-op (prompt/geracao legados). **verify:** cenario com/sem violacao + no-op skeleton null testados.
- [x] 4.3 Fail-open **respeitando o orcamento unico (Decisao 3b)**: (i) **planner falha ANTES do LLM**
      com `fail-open=true` -> pipeline legado como 1ª e unica geracao (skeleton null) +
      `planner.fallback_legacy.count`; (ii) **estagio 1 esgota o orcamento** (contagem ou deadline) ->
      `DomainRuleViolationException` (422) do proprio `gerarComResiliencia`, **sem nova geracao** (o
      orcamento ja foi consumido pelo estagio 1); (iii) `fail-open=false` -> erro de dominio antes de
      gerar (flag `planner-engine.fail-open`); (iv) violacao **obrigatoria (hard)** em qualquer ponto ->
      422, ja garantido pelos checks estruturais existentes (`validarEstrutura3Etapas`/intervalado/
      repeticoes) que lancam `LLMException` e esgotam o orcamento -> 422, **independente de fail-open**.
      **verify:** `PlanoServiceImplTest$ComputarSkeletonSeHabilitado` (flag off, fail-open true/false) +
      exaustao coberta pelo caminho de retry existente.

## 5. Estagio 2 — compliance pos-redistribuicao, terminal

- [x] 5.1 TDD: o estagio 2 roda **apos TODAS as transformacoes** (redistribuicao **e**
      `garantirProvasNaSemana` — design.md Decisao 2, Codex blocker 4), **sem retry**. Violacao **soft**
      (dia indisponivel, pesado perto de prova, taper): `fail-open=true` -> persiste `FAILED` +
      `requiresCoachReview=true`; `fail-open=false` -> erro de dominio. Violacao **obrigatoria (hard)**:
      422, nada persistido — nesta change **nao ha key hard no estagio 2** (o `checkPostRedistribution`
      so emite keys soft; as hard sao os checks estruturais do estagio 1, ja fail-closed em `IaServiceImpl`).
      Caso critico: `garantirProvasNaSemana` insere sessao que quebra slot -> o check final pega como
      soft -> `FAILED` + `requiresCoachReview` -> **nao auto-aprova** (nao aprova plano invalido).
      `RETRIED_PASSED` (redistribuicao corrige violacao do estagio 1) fica na §7 (leitura/telemetria) —
      o estagio 2 classifica `PASSED`/`FAILED`. **verify:** `PlanGenerationPersisterProvaTest$EnforcementEstagio2` (3) verde.
- [x] 5.2 Implementar o estagio 2 no `PlanGenerationPersister` (nao `PlanoServiceImpl` — apos o refactor
      loader/persister e onde `garantirProvasNaSemana`/auto-approve/save/eventos vivem) **como ultimo
      passo antes de aprovar/salvar/emitir eventos** (depois de `garantirProvasNaSemana`), com o
      `referenceDate` = `periodo.inicio()` (nao `LocalDate.now()`); grava `compliance_status` final
      (`PASSED`/`FAILED`) + `skeletonHash` (este via `persistirAuditoria` do shadow).
      **Veto a auto-aprovacao (Codex blocker 3):** `aplicarAutoApproveSeElegivel` bail quando o plano
      esta `FAILED` ou `requiresCoachReview=true`. **verify:** `PlanGenerationPersisterProvaTest$VetoAutoAprovacao` (2)
      + suite completa 3307 verde + `*IT` de plano/lote 9 verde.
- [x] 5.3 Redistribuicao recebe os dias-alvo dos `SessionSlot` via novo overload
      `redistribuirTreinos(..., Map<TipoTreino,DiaSemana> diasAlvoPorTipo)`: no loop, tenta o dia
      prescrito primeiro (se valido, livre e sem conflito de adjacencia) e so entao cai no greedy
      existente — **fallback inalterado**; mapa vazio = comportamento legado (CA9). O persister deriva
      o mapa dos slots do skeleton (`computarSkeleton` recomputado antes da redistribuicao — `planWeek`
      e puro/deterministico) so quando `enabled=true`. LONGO segue no `diaPreferidoLongo` existente.
      **verify:** `RedistribuicaoTreinoHelperTest` (2 novos: SEMANA_ATUAL com slots + fallback) verde.

## 6. Batch

- [x] 6.1 TDD: `BatchPlanProcessorTest` — a falha de compliance (estagio 1 esgotado / estagio 2
      fail-closed) chega ao lote como `DomainRuleViolationException`, que o processor **ja** trata:
      erro individual sanitizado (`MOTIVO_ERRO_GERACAO`), o outro atleta conclui, job
      `CONCLUIDO_COM_ERROS`, e o detalhe tecnico (keys/mensagens de `PlannerViolation`) fica **so no
      log estruturado** — nunca no relatorio do job. Nenhuma mudanca de producao: comportamento ja
      correto, travado por teste. Cobre tambem que a falha de compliance conta no corte por falhas
      consecutivas (degradacao real). **verify:** `BatchPlanProcessorTest$ComplianceNoLote` (2) verde.

## 7. Superficie minima de review (design.md Decisao 8)

- [x] 7.1 Backend: `PlannerAuditMetadata` ganhou `List<PlannerViolation> violations` (key + mensagem);
      `persistirAuditoria` grava a lista no `planner_metadata_json` (mesma coluna, sem migration).
      `PlanoSemanalOutputDto` expoe `plannerComplianceStatus` + `plannerRequiresCoachReview` (colunas =
      verdict do enforcement) + `plannerReviewReasons` (mensagens parseadas do JSON) — so leitura, via
      `PlanoSemanalMapper`. Plano legado sem metadata / JSON ilegivel / status desconhecido -> campos
      nulos, sem NPE. **verify:** `PlanoSemanalMapperPlannerTest` (4) verde; suite 3315 verde; motivos
      reais no DTO, nao so a contagem.
- [x] 7.2 Frontend (`menthoros-front`, branch `feature/planner-engine-enforcement`): badge "Revisao
      obrigatoria" + lista de motivos no `PlanoDetalhePanel` (aba de revisao de plano do coach) quando
      `plannerRequiresCoachReview=true` ou `plannerComplianceStatus==='FAILED'`; `PASSED`/legado sem
      destaque; visao do atleta intacta (CA12 — atleta usa outro tipo/endpoint, nao tocado). Logica no
      adapter puro `resolvePlannerReviewBadge`/`resolvePlannerReviewReasons`; componente so apresenta
      (`StatusBadge`). Campos adicionados a mao em `PlanoSemanalDto` (fachada curada; sem regen cega do
      cliente). **verify:** `npm run lint` limpo, `npm run build` verde, `npm run test:run` 1570 verde
      (adapter test 8 + `PlanoDetalhePanel.test` estendido + regressao `AthletePlanPage.test`).
      **E2E DEFERIDO (com justificativa, per CLAUDE.md front):** badge e puramente aditivo de leitura —
      nao altera o fluxo aprovar/rejeitar/editar e so aparece quando o backend seta os campos (flag
      `planner-engine.enabled` default off → inerte em prod). Cobertura de display por teste de
      componente. Adicionar spec E2E junto com o piloto (quando o flag ligar e o badge ficar visivel).

## 8. Verificacao final e DoD

- [x] 8.1 **verify:** `enabled=false` (default): suite unitaria `./mvnw clean test` **3315 verde**;
      todos os `*IT` de planner/plano/lote verdes. (No `verify` completo, `IntervalsIcuCallbackIT` —
      intervals.icu OAuth, sem relacao com planner — falhou por contencao de Testcontainers/Docker no
      boot concorrente de muitos contextos [threshold de carga excedido no 1o, retries puladas nos
      demais]; **passa isolado 11/11** — flake ambiental, nao regressao desta change.) Golden-master do
      prompt (`PlanoTreinoPromptBuilderGoldenTest`) roda pelo overload que delega com `skeleton=null` —
      exatamente o caminho flag-off, congelado byte-a-byte; `PlanoTreinoPromptBuilderSlotBlockTest`
      confirma bloco vazio sem skeleton (CA9). Zero regressao na suite.
- [x] 8.2 **verify:** matriz fail-open (CA4) coberta pelos testes que exercitam `enabled=true` +
      `fail-open` true/false: `IaServiceImplComplianceEstagio1Test` (estagio 1),
      `PlanoServiceImplTest$ComputarSkeletonSeHabilitado` (planner antes do LLM),
      `PlanGenerationPersisterProvaTest$EnforcementEstagio2` (estagio 2). Golden set do motor:
      `PlannerEngineGoldenSetTest`. (Nao ha flip global de flag na suite — cada caminho seta os flags
      explicitamente, que e o teste mais preciso.)
- [x] 8.3 CA1-CA12 em teste automatizado (mapa; CA11 e gate operacional — 8.4; CA12-front e §7.2):
      - CA1 estagio 1 c/ retry → `IaServiceImplComplianceEstagio1Test`
      - CA2 compliance estrutural → `SkeletonComplianceCheckerTest`
      - CA3 estagio 2 terminal → `PlanGenerationPersisterProvaTest$EnforcementEstagio2`
      - CA4 matriz fail-open → os tres testes da 8.2
      - CA5/CA9 flag-off byte-a-byte → `PlanoTreinoPromptBuilderGoldenTest` + `...SlotBlockTest`
      - CA6 dia por slot → `SessionDayAllocatorTest` + `RedistribuicaoTreinoHelperTest` (§5.3)
      - CA7 TSS por sessao → `SessionCompositionResolverTest`
      - CA8 batch isolado → `BatchPlanProcessorTest$ComplianceNoLote`
      - CA10 prompt×schema → `IaServiceImplSchemaTest.promptESchemaAlinhamTetoDeTreinos`
      - CA12 (backend) superficie de review → `PlanoSemanalMapperPlannerTest`
- [ ] 8.4 **Gate de rollout em DUAS PORTAS (CA11 — design Decisao 5):**
      **Porta 1 — entrada no PILOTO (coorte restrita):** registrar a divergencia de fase do shadow
      `planner.phase.divergence.count / planner.generated.count` **<= 2%** (>= 2 semanas, >= 30 planos)
      + defaults seguros (`fail-open=true`). Nao exige as metricas de enforcement (ainda nao existem).
      **Porta 2 — promocao GERAL:** registrar, **por coorte e fase**, as metricas coletadas no piloto —
      retry < 15%, `FAILED` < 5%, fallback < 5% (`planner.compliance.failure` PRE/POST +
      `planner.fallback_legacy`) e `SugestaoCoach` MODIFIED/REJECTED **nao pior** que o baseline
      pre-enforcement. Limiares **fixados** (nao propostos). Qualquer criterio da porta aplicavel acima
      do limiar / metrica indisponivel / amostra insuficiente = **fail-closed**, nao avanca. Registrar
      valor, janela e veredito de cada porta AQUI antes do flip correspondente.
      **STATUS: operacional, sem codigo** — o gate e medido em producao no piloto; nada a
      implementar/testar. Fica aberto ate a medicao das duas portas (defaults seguros: `enabled=false`,
      `fail-open=true` ja garantidos por 8.1). Preencher valor/janela/veredito aqui antes de cada flip.
      **BLOQUEIO DE PORTA 1 (code review 2026-09-11):** nao ligar `enabled=true` antes de resolver os
      itens 8.5.g/8.5.h abaixo — o skeleton do prompt/estagio-1 diverge do de redistribuicao/estagio-2
      (onboarding context diferente), corrompendo justamente a coorte de onboarding/cold-start, e o
      caminho de fallback pode enforcar estagio-2 contra um skeleton que o LLM nao viu.
- [x] 8.5 Follow-ups registrados: (a) **§7.2 frontend** — badge "Revisao obrigatoria" + motivos na aba
      de plano do coach (o backend ja entrega `plannerComplianceStatus`/`plannerRequiresCoachReview`/
      `plannerReviewReasons` no DTO); (b) fila/filtro de planos marcados para review (frontend);
      (c) "prescription stamping" (candidata); (d) gerador de estrutura de treino (v2);
      (e) `RETRIED_PASSED`/`FALLBACK` como status distintos na telemetria (hoje estagio 2 classifica
      so `PASSED`/`FAILED`); (f) skeleton computado ate 3x por geracao no caminho `enabled=true`
      (prompt em `PlanoServiceImpl` + `diasAlvoDaRedistribuicao` + `aplicarShadow`) — colapsavel pelo
      8.5.g.
      **Achados do code review 2026-09-11 (bloqueiam porta 1, nao o merge atras do flag):**
      (g) **[Important] Skeleton unico ponta-a-ponta:** hoje `PlanoServiceImpl.computarSkeletonSeHabilitado`
      computa o skeleton do prompt/estagio-1 com `Optional.empty()` de onboarding, enquanto o persister
      recomputa com o onboarding **real** para redistribuicao e estagio-2 → skeletons divergentes para
      atleta em onboarding (coorte cold-start), gerando retry/`FAILED` espurios. Fix: computar o skeleton
      **uma vez** com o onboarding correto e passa-lo a `iaService` (ja recebe) e ao persister (novo
      parametro, em vez de recomputar em `aplicarShadow`/`diasAlvoDaRedistribuicao`). Resolve tambem (f)
      e metade de (e) (`FALLBACK`). **Decisao de design pendente:** onde a resolucao de onboarding vive
      (hoje so no persister) — cruza com `fix-cold-start-calibration-plan-generation`.
      (h) **[Important] Fallback nao sinaliza o persister:** quando o planner falha ANTES do LLM
      (fail-open → skeleton null, geracao legada), o persister ainda recomputa o skeleton e pode enforcar
      estagio-2 contra um skeleton que o LLM nunca viu → `FAILED` espurio. Fix junto com (g): threa o
      desfecho pre-LLM (skeleton ou sinal explicito de fallback) ao persister; persistir `FALLBACK`.
      (i) **[Minor, aceito]** Wiring do closure de compliance no `gerarComResiliencia` (IaServiceImpl:347)
      nao tem teste dedicado — a parede de fixture da God-class (refactor-iaservice-decomposition) impede
      o teste de pipeline; coberto indiretamente por `IaServiceImplComplianceEstagio1Test` (unidade do
      wrapper) + os `*IT` de plano. Lacuna nomeada aqui conforme aceito no review.
      (j) **[Minor, parcial]** `PlanoSemanalMapper` usa `new ObjectMapper()` estatico em vez do bean
      gerenciado — thread-safe e funcional; risco so se `PlannerAuditMetadata` ganhar `LocalDate`/`Instant`
      sem `JavaTimeModule`. Mitigado: os `catch` agora logam (nao engolem em silencio). Injecao do bean
      fica como follow-up.
      **Resolvidos no proprio review (commit de fixes):**
      - **[Important] ADR-0007 (identificador em ingles):** `plannerReviewMotivos` → `plannerReviewReasons`
        no DTO/mapper/teste, antes do front consumir.
      - **[Minor #5 / seguranca Low] logs de diagnostico:** `catch` do mapper (`resolvePlanner*`) e o
        `catch (DomainRuleViolationException)` do `BatchPlanProcessor` passam a logar (`log.warn`) — sem
        vazar detalhe ao cliente, so observabilidade.
      - **[Important, aceito sem mudanca] crescimento do `IaServiceImpl`:** `aplicarComplianceEstagio1`
        e metodo privado curto e coeso com o call site do `gerarComResiliencia` (retry/LLM); move-lo para
        `PlannerShadowService` acoplaria o shadow a `LLMException`/retry (concern de IaService). Debt
        segue rastreado em `refactor-iaservice-decomposition`.
- [ ] 8.6 PRs backend e frontend abertos; CI verde. (backend: `feature/planner-engine-enforcement-s4`
      pronto para `/pr`; frontend: §7.2, repo `menthoros-front`.)
