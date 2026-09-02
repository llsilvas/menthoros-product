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

- [x] 1.1 Testes primeiro (`LlmConcurrencyLimiterTest`): cap por tenant limita um tenant sem
  limitar outro; ordem tenant→global na aquisição; reserva interativa indisponível para o lote;
  interativo usa capacidade ociosa do lote; reentrância por thread (lote não re-adquire);
  release em erro (todas as faixas) — [CA2] [CA3]
- [x] 1.2 Implementar `executarLote(UUID tenantId, Supplier)` (cadeia tenant → capacidade →
  global, sempre nesta ordem; release inverso) e `executarInterativo(Supplier)` (só global);
  `executar(Supplier)` legado delega para o interativo e é deprecado
  - verify: `./mvnw test -Dtest=LlmConcurrencyLimiterTest*` verde
- [x] 1.3 Chaves `llm-concorrencia-por-tenant: ${BATCH_PLAN_LLM_CONCORRENCIA_POR_TENANT:2}` e
  `llm-reserva-interativa: ${BATCH_PLAN_LLM_RESERVA_INTERATIVA:1}` no `application.yml`, com
  comentário no padrão do `llm-concorrencia` (o que controla, o que não controla)
- [x] 1.4 `./mvnw clean test` verde — 12/12 no `LlmConcurrencyLimiterTest`

## 2. Ligar os dois chamadores

- [x] 2.1 `BatchPlanProcessor.processarAtleta` → `executarLote(tenantId, ...)`
  - verify: `BatchPlanProcessorTest` verde sem alteração de asserção (o stub do limiter muda de
    método, não de comportamento)
- [x] 2.2 Wrap interativo na fase 2 (`PlanoServiceImpl.gerarPlanoSemanal`), em volta SÓ da chamada
  ao LLM — [CA3]
  - verify: teste em `PlanoServiceImplTest` — geração interativa adquire permit interativo; vinda
    do lote (permit já em posse na thread), nenhum permit novo
- [x] 2.3 `./mvnw clean test` verde — 2951 testes, 0 falhas

## 3. Prova de justiça (régua)

- [x] 3.1 Estender `LotePlanosFundadorasIT`: com cap 2 e global 10, afirmar por contadores no stub
  do LLM que nenhum tenant passa de 2 em voo E que ≥ 5 assessorias distintas ficam em voo
  simultaneamente; a razão última/primeira é reportada no log, não assertada — [CA1]
  - verify: IT verde — cap respeitado (pico por tenant = 2), ≥5 assessorias simultâneas, razão
    última/primeira **1,25×** (baseline 2,6×); pico do lote = 9 (global − reserva, como esperado)
- [x] 3.2 Teste do CA2 no mesmo IT: lote saturado + um `gerarPlanoTreino` interativo entra no LLM
  em ≤ 2 s (permit reservado livre) — [CA2] — entrou em ~48 ms; o teste drena os lotes `@Async`
  antes de terminar (aprendizado: sem isso, uma geração vazou para o teste seguinte)
- [x] 3.3 `PlanoGeracaoConcorrenteIT` e demais ITs de plano verdes; `./mvnw clean verify` — [CA4] —
  **2951 unitários + 162 ITs, 0 falhas** (2026-09-01, pós-correções do QA)

## 3b. Gate de QA (2026-09-01)

- [x] 3b.1 `code-reviewer` (sem Critical/Important), `security-reviewer` (sem High),
  `clean-code-reviewer` + Codex. Absorvidos: os três semáforos viram **justos** (Codex — elimina
  barging teórico; o argumento da proposal contra FIFO era sobre semáforo justo *sem* cap);
  `executar` deprecado removido (convergência clean-code + code-reviewer — nenhum call site);
  ThreadLocal com `remove()`; JavaDoc Idempotent/Side Effects nos métodos novos; risco aceito da
  faixa interativa sem cap por tenant documentado no JavaDoc (security); latch no lugar do
  sleep-poll no teste da reserva (clean-code). De carona: parágrafo do `CLAUDE.md` do backend sobre
  "LLM dentro da transação" estava obsoleto desde o refactor — corrigido.
- [x] 3b.2 Revalidação: limiter 12/12, `PlanoServiceImplTest` 43, ITs 4/4; justiça **1,19×**
  (baseline 2,6×), interativo em 71 ms com o lote saturado

## 4. Encerramento

- [x] 4.1 Atualizar este `tasks.md` e arquivar conforme o `CLAUDE.md` raiz — PR mergeado em
  `develop` em 2026-09-02; arquivada em `changes/archive/2026-09/2026-09-02-fair-llm-concurrency-per-tenant/`
