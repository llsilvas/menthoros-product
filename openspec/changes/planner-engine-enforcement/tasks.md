# Tasks — planner-engine-enforcement (parte 2/2: skeleton vinculante)

> Backend + frontend minimo (superficie de review — design.md Decisao 8). Ordem: flags/contratos (1) -> SessionSlot prescritivo (2) -> prompt (3) -> estagio 1 (4) -> estagio 2 (5) -> batch (6) -> superficie de review (7) -> verificacao final (8).
> Validacao: `./mvnw clean test` a cada etapa; golden set da parte 1 permanece bloqueante; frontend `npm run lint && npm run build`.
> **Pre-requisitos:** `deterministic-planner-engine` (parte 1) mergeada — hard. `refactor-iaservice-decomposition` mergeada — recomendado (estagio 1 entra em `PlanoLlmValidator`); se nao estiver, confirmar com o usuario antes da secao 4 se implementa contra o `IaServiceImpl` atual.
> **Gate de rollout (CA11):** taxa de divergencia de fase do shadow <= 2% em janela >= 2 semanas com >= 30 planos gerados (divergencias acima disso: explicadas e registradas aqui); metrica indisponivel = **nao liga** `enabled=true` (design.md Decisao 5; medicao na task 8.4).

## 1. Flags e contratos de enforcement

- [ ] 1.1 Config: `planner-engine.enabled=false` e `planner-engine.fail-open=true` em `application.yml` (o `shadow` da parte 1 permanece independente).
- [ ] 1.2 Estender `PlannerComplianceStatus` se necessario para o ciclo completo (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`) e documentar a matriz fail-open (design.md Decisao 3) no javadoc.
- [ ] 1.3 **verify:** `./mvnw -q compile` verde; com ambos os flags default, `./mvnw clean test` sem regressao.

## 2. SessionSlot prescritivo (dia + TSS + zonas)

- [ ] 2.1 TDD: `SessionSlotAllocationTest` — alocacao de dias no `PlannerEngine`: longao ancorado no dia preferido/inferido, intensos nunca adjacentes, leves preenchem, dias indisponiveis respeitados (regras absorvidas da `WeeklyDistributionSkill` orfa — design.md Decisao 4). **verify:** testes vermelhos.
- [ ] 2.2 Absorver a logica de alocacao em `domain/planner` (sem depender do registry de skills); decidir destino da `WeeklyDistributionSkill` original (aposentar ou wrapper fino) e registrar a decisao. **verify:** `SessionSlotAllocationTest` verde + `DomainBoundaryArchTest` verde.
- [ ] 2.3 TDD: reparticao de TSS por slot — `duracao x IF^2 x 100/60`, soma respeita `WeeklyLoadTarget` +-10%, tolerancia por slot +-20%. **verify:** vermelho -> verde.
- [ ] 2.4 Incluir `zonaFc`/`faixaPace` por slot (recorte das zonas de `ZonaTreinoService`/`PaceZoneCalculator`, calculadas na camada de service e passadas via snapshot). **verify:** teste unitario dos slots completos.
- [ ] 2.5 Estender o golden set da parte 1 com casos de alocacao (semana com prova, atleta 3 dias disponiveis, longao inferido do historico). **verify:** `PlannerEngineGoldenSetTest` 100% verde.

## 3. Skeleton no prompt + formatter como renderer

- [ ] 3.1 TDD: golden-master do prompt — com `enabled=true`, o prompt contem o bloco mandatorio de slots (dia, tipo, TSS, zonas); com `enabled=false`, prompt identico ao legado. **verify:** testes vermelhos.
- [ ] 3.2 Injetar `WeekPlanSkeleton` no contexto do prompt em `PlanoServiceImpl`/`PlanoTreinoPromptBuilder` (bloco mandatorio, padrao do bloco [1] de Constraints). **verify:** golden-master verde.
- [ ] 3.3 Reduzir `PeriodizacaoPromptFormatter` a renderer da saida do planner (remove calculo de fase/TSS-alvo/step-back/tipo de semana; classe preservada — design.md Decisao 5). Remover a metrica `planner.phase.divergence.count` da parte 1. **verify:** `./mvnw clean test` sem regressao; golden-master do prompt legado (flag off) intacto.
- [ ] 3.4 Alinhar template x schema (3-5 treinos, minimo de etapas) — design.md Decisao 7. **verify:** golden-master atualizado deliberadamente.

## 4. Estagio 1 — compliance pre-redistribuicao com retry existente

- [ ] 4.1 TDD: violacao de skeleton (fase, sessionCount, TSS, longo, intensidade, prova-na-semana, slot) lanca a mesma excecao de `validarENormalizarPlanoGerado` e aciona `PlanoResilienceService` (`MAX_TENTATIVAS=2`), com as `PlannerViolation` no feedback estruturado. **verify:** testes vermelhos.
- [ ] 4.2 Implementar wrapper na camada de service (em `PlanoLlmValidator` pos-refactor, ou `IaServiceImpl` — confirmar com o usuario se o refactor nao estiver mergeado) que roda `checkPreRedistribution` dentro da funcao `validar`; converter violacoes em excecao + `planner.compliance.failure.count{stage=PRE}` + `planner.retry.count`. **verify:** teste de integracao com retry disparado por violacao.
- [ ] 4.3 Fail-open do estagio 1: retry esgotado com `fail-open=true` -> pipeline legado inteiro + `compliance_status=FALLBACK` + `planner.fallback_legacy.count`; com `fail-open=false` -> erro de dominio. **verify:** os 2 caminhos testados.

## 5. Estagio 2 — compliance pos-redistribuicao, terminal

- [ ] 5.1 TDD: apos `redistribuicaoHelper.redistribuirTreinos`, violacao (dia indisponivel, pesado perto de prova, taper) e detectada **sem retry**; `fail-open=true` -> persiste com `FAILED` + `requiresCoachReview=true`; `fail-open=false` -> erro de dominio, nada persistido. Caso complementar: redistribuicao corrige violacao do estagio 1 -> estagio 2 passa e status final reflete `RETRIED_PASSED`. **verify:** testes vermelhos.
- [ ] 5.2 Implementar estagio 2 em `PlanoServiceImpl` usando o `referenceDate` do snapshot (nao `LocalDate.now()` — design.md Decisao 2); persistir `compliance_status` final = pior dos estagios + `skeletonHash`. **verify:** testes de 5.1 verdes + teste de persistencia.
- [ ] 5.3 Redistribuicao recebe os dias-alvo dos `SessionSlot` (mudanca minima no `RedistribuicaoTreinoHelper`: origem do dia-alvo, sem alterar o algoritmo de fallback). **verify:** teste cobrindo modo SEMANA_ATUAL com slots.

## 6. Batch

- [ ] 6.1 TDD: `BatchPlanProcessorTest` — com `enabled=true`, um atleta falhando compliance apos retry vira erro individual sanitizado; o outro conclui; job `CONCLUIDO_COM_ERROS`; detalhe tecnico so em log estruturado. **verify:** vermelho -> verde.

## 7. Superficie minima de review (design.md Decisao 8)

- [ ] 7.1 Backend: expor `plannerComplianceStatus`, `plannerRequiresCoachReview` e resumo legivel
      das `PlannerViolation` (do `planner_metadata_json`) no DTO da visao do coach — leitura
      apenas. TDD do mapeamento, incluindo plano legado sem metadata (campos nulos, sem NPE).
      **verify:** `./mvnw clean test` verde.
- [ ] 7.2 Frontend: badge "Revisao obrigatoria" + motivos na aba de plano do coach quando
      `requiresCoachReview=true` ou `compliance_status=FAILED`; plano `PASSED`/legado sem
      destaque; visao do atleta intacta (CA12). Logica no hook/adapter, componente so
      apresentacao. **verify:** `npm run lint && npm run build` + testes do repo front.

## 8. Verificacao final e DoD

- [ ] 8.1 **verify:** `enabled=false` (default): `./mvnw clean test` BUILD SUCCESS, pipeline byte-a-byte legado (golden-master), zero regressao (CA9).
- [ ] 8.2 **verify:** `enabled=true`: suite completa + golden set verdes; matriz fail-open (CA4) coberta.
- [ ] 8.3 CA1-CA12 verificados em teste automatizado (CA11 e gate operacional — ver 8.4).
- [ ] 8.4 **Gate de rollout (CA11):** medir a taxa de divergencia de fase do shadow
      (`planner.phase.divergence.count / planner.generated.count`) em janela >= 2 semanas com
      >= 30 planos gerados; registrar AQUI o valor, a janela e o veredito. <= 2% (ou divergencias
      explicadas caso a caso) libera `enabled=true`; metrica indisponivel ou amostra insuficiente
      = **nao liga** (fail-closed). Nenhum flip em ambiente compartilhado antes deste registro.
- [ ] 8.5 Registrar follow-ups: fila/filtro de planos marcados para review (frontend),
      "prescription stamping" (candidata), gerador de estrutura de treino (v2).
- [ ] 8.6 PRs backend e frontend abertos; CI verde.
