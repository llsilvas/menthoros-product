# Tasks: intervals-icu-push-hardening

> Trilha Fast. Backend-only. Validação de cada bloco: `./mvnw clean test`.
> Referências: `IntervalsIcuPushProcessor`, `IntervalsIcuPushListener`,
> `IntervalsIcuRetrySchedulerImpl`, `IntervalsIcuAdapter`/`WorkoutChannel` — todos entregues
> pela change-mãe (archive/2026-07/2026-07-15-intervals-icu-workout-push).
>
> **Refinado contra o código real em 2026-07-15 (`/implement init`, branch
> `feature/intervals-icu-push-hardening`, base `1dfbf01` = merge do PR #40):**
> - `Processor.processar(TreinoPlanejado, IntegracaoExterna)` (linha 86) roda HOJE na TX do
>   chamador (sem @Transactional próprio); o reload fresco está no listener (linha 136) —
>   a task 1.1 muda a assinatura para `processar(UUID treinoId, IntegracaoExterna conexao)`.
> - Listener: `@Transactional(REQUIRES_NEW)` no método do lote (linha 73) — vira orquestração
>   sem TX de escrita; o acumulador `ResultadoLote` (linha 176) ganha a contagem de criados
>   para a task 2.1.
> - Scheduler: `@Transactional` no método do lote (linha 61) — mesma mudança.
> - `PushResult` NÃO tem flag de criação — task 2.1 adiciona `criadoNovo` (boolean) preenchido
>   pelo adapter no caminho POST (os dois caminhos de PUT ficam false).

## 1. TX por treino (CA1)

- [x] 1.1 Mover o reload fresco do treino para DENTRO de `IntervalsIcuPushProcessor.processar`
      (recebe `treinoId` + conexão; abre `@Transactional(REQUIRES_NEW)`; recarrega por
      id+tenant; claim; push; marcação — tudo na TX própria). Listener e scheduler viram
      orquestradores sem TX de escrita no loop (leitura do plano/janela em TX read-only ou
      chamadas de repositório avulsas). Atenção: processor é bean separado — proxy AOP cobre;
      NUNCA self-invocation.
      verify: testes existentes do listener (15) e scheduler (26) verdes sem afrouxar asserções.
- [x] 1.2 Teste de integração do CA1 (padrão `AbstractIntegrationTest`/Testcontainers): lote de
      2 treinos, `OptimisticLockingFailureException` forçada no claim do 1º (ex.: update
      concorrente da versão via segundo EntityManager) → 2º `SINCRONIZADO` persistido em TX
      nova; 1º intacto/elegível a retry.
      verify: `./mvnw test -Dtest=IntervalsIcuPushTxIT` (nomear *Test se surefire não pegar *IT).
      Evidência: `IntervalsIcuPushTxTest` criado (`src/test/java/br/com/menthoros/backend/services/impl/`)
      — `@MockitoSpyBean` no `IntervalsIcuWorkoutConverter` real injeta um UPDATE concorrente via
      `JdbcTemplate` exatamente entre o `find` e o `saveAndFlush` da TX-A do treino1, provocando
      `OptimisticLockingFailureException` real; treino1 fica `CLAIM_PERDIDO`/intacto e treino2
      termina `SINCRONIZADO` persistido (consulta nova pós-listener) — `./mvnw clean test` verde
      (868 testes, 0 falhas).

## 2. Nudge anti-debounce do uploader Garmin (CA2)

- [x] 2.1 `WorkoutChannel.tocarEvento(conexao, eventId)` (ou reuso de `atualizarEvento` com
      payload mínimo de nome) + chamada no listener ao fim do lote quando `criadosViaPost >= 2`,
      no ÚLTIMO evento criado; best-effort (try/catch + log, nunca altera estado de treino).
      Contabilizar POST×PUT no `PushResult` ou no retorno do processor (campo `criadoNovo`).
      Testes: 2+ POSTs → 1 nudge no último; 1 POST → zero; só PUTs → zero; nudge falhando →
      estados intactos.
      verify: `./mvnw test -Dtest='IntervalsIcuPushListenerTest,IntervalsIcuAdapterTest'`.

## 3. Último push fiel no retry (CA3)

- [x] 3.1 Scheduler grava `ultimaSincronizacao` na(s) conexão(ões) com ≥1 treino `SINCRONIZADO`
      no ciclo (agrupar por atleta; 1 save por conexão afetada). Testes: sucesso → gravado;
      ciclo todo-falha → não gravado.
      verify: `./mvnw test -Dtest=IntervalsIcuRetrySchedulerImplTest`.

## 4. Gate final

- [ ] 4.1 (PARCIAL — falta só o smoke, dependente do ambiente/founder)
      FEITO: `./mvnw clean test` 1589 verde (CA4); QA Fast (code-reviewer) aprovado sem
      Critical — CA1-CA4 verificados na matriz do review; invariante do nudge documentada.
      PENDENTE: smoke com plano de 2+ treinos: aprovar e
      confirmar `icu_garmin_last_upload` POSTERIOR à criação do último evento (valida a
      premissa do nudge de ponta a ponta); atualizar este tasks.md; QA `/review` + PR.
