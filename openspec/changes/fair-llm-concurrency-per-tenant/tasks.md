# Tasks — fair-llm-concurrency-per-tenant (S · Fast · backend)

> Trilha Fast: sem `design.md` — as decisões estão no `proposal.md` (vindas do grilling de
> 2026-09-01 e do design de `refactor-llm-call-outside-transaction`, D0/D6). Fechar cada bloco com
> `./mvnw clean test`. Régua de justiça: `LotePlanosFundadorasIT` (baseline 2,6× medido em
> 2026-09-01).

## Anchors reais (verificados em 2026-09-01)

- `LlmConcurrencyLimiter` (`services/helper`): `Semaphore(llm-concorrencia)` não-justo, método
  único `executar(Supplier)`.
- `BatchPlanProcessor.processarAtleta` L161: `llmConcurrencyLimiter.executar(() -> planoService.gerarPlanoTreino(...))`,
  permit adquirido fora de transação (as transações vivem no loader/persister desde o refactor).
- `PlanoServiceImpl.gerarPlanoSemanal`: fase 2, único ponto que chama `iaService` — onde entra o
  wrap interativo.
- `PlanoTreinoController` → `planoService.gerarPlanoTreino` direto, sem limiter.
- `application.yml` `app.batch-plan.*` (L289+): onde nascem as duas chaves novas.

## 1. Limiter com três faixas (TDD)

- [ ] 1.1 Testes primeiro (`LlmConcurrencyLimiterTest`): cap por tenant limita um tenant sem
  limitar outro; ordem tenant→global na aquisição; reserva interativa indisponível para o lote;
  interativo usa capacidade ociosa do lote; reentrância por thread (lote não re-adquire);
  release em erro (todas as faixas) — [CA2] [CA3]
- [ ] 1.2 Implementar `executarLote(UUID tenantId, Supplier)` e `executarInterativo(Supplier)`;
  `executar(Supplier)` legado delega para o interativo e é deprecado
  - verify: `./mvnw test -Dtest=LlmConcurrencyLimiterTest*` verde
- [ ] 1.3 Chaves `llm-concorrencia-por-tenant: ${BATCH_PLAN_LLM_CONCORRENCIA_POR_TENANT:2}` e
  `llm-reserva-interativa: ${BATCH_PLAN_LLM_RESERVA_INTERATIVA:1}` no `application.yml`, com
  comentário no padrão do `llm-concorrencia` (o que controla, o que não controla)
- [ ] 1.4 `./mvnw clean test` verde

## 2. Ligar os dois chamadores

- [ ] 2.1 `BatchPlanProcessor.processarAtleta` → `executarLote(tenantId, ...)`
  - verify: `BatchPlanProcessorTest` verde sem alteração de asserção (o stub do limiter muda de
    método, não de comportamento)
- [ ] 2.2 Wrap interativo na fase 2 (`PlanoServiceImpl.gerarPlanoSemanal`), em volta SÓ da chamada
  ao LLM — [CA3]
  - verify: teste em `PlanoServiceImplTest` — geração interativa adquire permit interativo; vinda
    do lote (permit já em posse na thread), nenhum permit novo
- [ ] 2.3 `./mvnw clean test` verde

## 3. Prova de justiça (régua)

- [ ] 3.1 Estender `LotePlanosFundadorasIT`: com cap 2 e global 10, afirmar ≥ 5 assessorias com
  geração em voo simultânea (medido no stub do LLM) e razão última/primeira ≤ 1,6× — [CA1]
  - verify: IT verde; registrar no log o antes/depois (2,6× → medido)
- [ ] 3.2 Teste do CA2 no mesmo IT: lote saturado + um `gerarPlanoTreino` interativo entra no LLM
  em ≤ 2 s (permit reservado livre) — [CA2]
- [ ] 3.3 `PlanoGeracaoConcorrenteIT` e demais ITs de plano verdes; `./mvnw clean verify` — [CA4]

## 4. Encerramento

- [ ] 4.1 Atualizar este `tasks.md` e arquivar conforme o `CLAUDE.md` raiz
