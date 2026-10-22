# Tasks — fix-tsb-rest-days-materialization

Repo: `apps/menthoros-backend`, branch `fix/tsb-rest-days-materialization` a partir de `develop`.
Validação por bloco: `./mvnw clean test -Dtest=...`; **gate de entrega: `./mvnw clean verify`** (os
`*IT` só rodam nele). O design vigente é `design.md` com as seções "Revisões do pre-mortem" (R1–R9) e
"Mecânica transacional" — **elas precedem D1–D5**. Pre-mortem Codex e DoR feitos (2026-10-20). QA
(code-reviewer + security-reviewer + test-master) antes do PR.

Ordem de execução = ordem dos blocos (cada um depende do anterior).

## 1. Assinatura e "hoje" do atleta (R4)

- [x] 1.1 `TsbServiceImpl`: nova `recalcularDesde(atletaId, inicio, fim)`; a antiga delega com `fim = hojeDe(atleta)` (`AtletaHojeResolver.hojeDe(Atleta)`). Remover `LocalDate.now()` dos limites do laço.
- [x] 1.2 `TsbServiceImpl.validarEntrada` e `TsbDiaPersister.validarEntrada` (L102): barrar data futura contra `hojeDe(atleta)`, não `LocalDate.now()` do servidor.
- [x] 1.3 `TsbServiceImplTest`: `fim` explícito respeitado; atleta em fuso à frente do servidor aceita `fim = hoje do atleta`.
      *verify:* `./mvnw clean test -Dtest=TsbServiceImplTest`

## 2. Laço transacional + lock + fecha o buraco (R1, R2, D1)

- [x] 2.1 `MetricasDiariasRepository`: `@Query(nativeQuery = true) void lockAtleta(UUID atletaId)` → `SELECT pg_advisory_xact_lock(hashtext(CAST(:atletaId AS text)))` (precedente de nativeQuery: `UsuarioRepository:99`; exige transação ativa).
- [x] 2.2 Novo bean `TsbRecalculoTransacional.recalcularIntervalo(atletaId, inicio, fim, paceResolvido)` com `@Transactional`: ordem **lock → ler treinos → ler métricas → laço do persister**. `recalcularDesde` segue **sem** `@Transactional` e resolve o pace antes, fora de transação; depois delega a este bean.
- [x] 2.3 D1 dentro do bean: `inicio = (ultimoDia != null && ultimoDia.plusDays(1).isBefore(data)) ? ultimoDia.plusDays(1) : data`; só o último dia **e somente se `fim == hoje do atleta`** grava metadados (`atualizarMetaDadosHoje`); bloco intermediário não grava. Javadoc: semântica "fecha o buraco desde a última métrica".
- [x] 2.4 Unit (`TsbServiceImplTest`/novo teste do bean): sem métrica (`inicio = data`), retroativo (`data < ultimoDia`), pós-buraco (`inicio = ultimoDia + 1`, intermediários com `atualizarMetaDadosHoje = false`, só o último `true`).
- [x] 2.5 IT (`*IT`, Postgres via `AbstractIntegrationTest`): **rollback** — falha injetada no meio do intervalo → nenhuma linha alterada.
- [x] 2.6 IT de **concorrência** com barreira (`CountDownLatch`): thread A (ingestão) segura o lock após inserir o treino e antes do commit; thread B (recálculo) dispara e bloqueia; ao liberar A, a métrica final reflete o treino, nunca o TSS antigo. Asserção de que B realmente esperou (tempo/ordem de eventos), para a barreira não passar por acidente.
      *verify:* `./mvnw clean verify -Dit.test=TsbRecalculo*IT`

## 3. Detecção por buraco e blocos (R3, R7, R9)

- [x] 3.1 `MetricasDiariasRepository.findSeriePorAtleta()` — nativa; devolve `SerieMetricasAtleta(atletaId, ultimaData, primeiroBuraco)` (`generate_series` só para quem tem menos linhas que dias). O pendente sai de `SerieMetricasAtleta.primeiroDiaPendente(hoje)` (buraco vence; senão `ultima+1` se `ultima < hoje`); o "hoje" por fuso é resolvido no job (`hojeDe(Atleta)`), não na query.
- [x] 3.2 IT da query: buraco no meio da série; série densa com `MAX < hoje`; série densa e em dia (não retorna).
- [x] 3.3 Teto de 400 dias **novos** (além da última métrica) por execução, em `TsbRecalculoTransacional` — vale para ingestão e job; reescrever linhas existentes (retroativo) não conta e não é cortado, para não deixar linhas seguintes com seed velho numa série densa. Teste: atraso de 900 dias converge em 3 execuções; ingestão com buraco de 400+ dias não falha e `registrar` fica dentro de um limite fixado no teste (definir ao medir; registrar o valor no IT).
      *verify:* `./mvnw clean test -Dtest=TsbServiceImplTest`

## 4. Seed defensivo (R6, D3)

- [x] 4.1 `MetricasDiariasRepository`: `findTopByAtletaIdAndDataBeforeOrderByDataDesc(UUID, LocalDate)`.
- [x] 4.2 `TreinoRealizadoRepository`: consulta de **existência de treino contabilizável num intervalo exclusivo `(de, ate)`** para `(atletaId, de, ate)` (o `findQueContamByAtletaIdAndDataTreino` atual é por dia).
- [x] 4.3 `TsbDiaPersister.buscarMetricasDiaAnterior` usa 4.1; `calcularEAtualizarMetricas` recebe `k` e decai `k-1` vezes com TSS 0 (extrair `decairAte(anterior, k)`), **somente se** 4.2 devolve falso; senão `WARN` com atleta/intervalo e seed zero.
- [x] 4.4 `TsbDiaPersisterTest`: `k = 1` idêntico ao atual; `k = 3` sem treino no intervalo → seed decaído 2×; `k = 3` com treino no intervalo → seed zero + `WARN`; borda do intervalo exclusivo (treino exatamente em D-3 ou em D não conta); sem linha anterior → zero.
      *verify:* `./mvnw clean test -Dtest=TsbDiaPersisterTest`

## 5. Job horário (R4, R5, R7, R8, D2)

- [x] 5.1 `scheduler/TsbDecaimentoDiarioScheduler` (molde `SyncPullLogPurgeScheduler`): `@Scheduled(cron = "0 30 * * * *", zone = "America/Sao_Paulo")`; para cada `(atletaId, primeiroDia)` de 3.1: carrega o `Atleta` (fuso + tenant), `TenantContext.setTenantId` com `finally clear()` (precedente `AthleteInvoiceRenewalScheduler:57`), `hojeDe(atleta)`, pula quem está em dia, chama `recalcularDesde(atletaId, primeiroDia, hoje)` (o corte de 400 dias **novos** é do `TsbRecalculoTransacional`; cortar `fim` aqui deixaria linhas já existentes após o bloco com seed velho); try/catch por atleta; log final `processados/pulados/falhas`.
- [x] 5.2 Gauge `tsb.atletas_defasados` (`MeterRegistry`): atletas com `MAX(data) < hoje - 1` ao fim da execução.
- [x] 5.3 `TsbDecaimentoDiarioSchedulerTest`: em dia não chama; atrasado chama com o intervalo certo; atraso de 900 dias passa o intervalo inteiro (corte no recálculo); exceção num atleta não impede o seguinte; "hoje" vem do fuso do atleta; dois tenants consecutivos sem vazar contexto e **fonte de limiar `MELHOR_ESFORCO` preservada**; gauge atualizado (CA4/CA5).
      *verify:* `./mvnw clean test -Dtest=TsbDecaimentoDiarioSchedulerTest`; `TsbDecaimentoDiarioSchedulerIT` (900 dias em 3 execuções; tenant visto pela busca de melhor esforço, com mutação conferida)
- [x] 5.4 Tabela de schedulers: não há no `CLAUDE.md`/README do backend — n/a.

## 6. Remover código morto (D4)

- [x] 6.1 Remover `TsbServiceImpl.processarDiasDescanso` e a menção no Javadoc de `atualizarTsbDia` (L84–89, "código morto… se reativado…"); `grep` em `src/main` e `src/test` sem callers.
      *verify:* `./mvnw clean test`

## 7. Integração ponta a ponta

- [x] 7.1 `TsbDiasDescansoPmcIT` (classe própria: `TsbRecalculoJanelaMistaIT` trata de leitura durante o recálculo, outro contrato): CA1 — métricas até D0, ingestão em D0+5 → linhas D0+1..D0+5, TSS 0 em D0+1..D0+4, CTL estritamente decrescente nesses dias, CTL(D0+5) > CTL(D0+4); nenhum valor igual ao seed zero.
- [x] 7.2 CA7: IT real (Postgres) sobre `getHistoricoPmc` (camada de serviço; o controller só repassa) do atleta do cenário 7.1 — um ponto por dia entre a primeira métrica e hoje. (`@WebMvcTest` com service mockado não prova densidade; não usar.)
      *verify:* `./mvnw clean verify`

## 8. Reparo (homelab) e fechamento

- [x] 8.1 `docs/ops/tsb-rest-days-repair.sql` (criar o diretório se não existir): diagnóstico (atletas com buraco **e** com `MAX(data) < hoje`, não só `COUNT(*) < MAX-MIN+1`) e roteiro de reparo via `recalcularDesde` com fim = hoje do atleta. `recalcularHistoricoCompleto` **não** faz parte do reparo (blocos de 30 dias, sem rollback global).
- [x] 8.2 Evidência: relatório antes/depois (CTL por atleta tocado) em `docs/ops/` e validação de ≥ 2–3 atletas contra o decaimento esperado (τ = 42), tolerância = arredondamento de 1 casa; resultado registrado. Registrado em `apps/menthoros-backend/docs/ops/tsb-rest-days-repair-report.md`: o job já havia rodado no homelab às 07:30 de 2026-10-21 (21 linhas criadas, 2 atletas); o "antes" foi reconstruído por `created_at`. 2 atletas validados (0 buracos, 0 seeds fora, maior desvio 0,005 contra exp(-1/42)).
- [x] 8.3 QA Full (code-reviewer, security-reviewer, clean-code-reviewer + Codex review e adversarial); achados corrigidos em `eb5fef9` (lock antes da leitura de treinos na ingestão, gauge -1 em falha, teste dependente de fuso). Aceitos/registrados: reescrita retroativa longa numa transação (primeiro deploy), `findById` por atleta a cada hora, `recalcularHistoricoCompleto` e `atualizarTsbDia` sem o lock (fora de escopo, uso só em migração), gauge no dia de São Paulo.
- [ ] 8.4 (ADIADO ao arquivar) Deploy na base do homelab (a configurada no `.env`; **não há atletas em produção**, então sem reparo em produção nem comunicação a assessorias); executar 8.1; validar no dashboard que o PMC voltou denso (sem área `missing`), que CTL em 19/10 bate com o decaimento desde 29/09 e que `tsb.atletas_defasados` = 0 após o job. Adiado: PR #188 mergeado em 2026-10-21; falta conferir log `[tsb-decaimento] ... falhas=0` e gauge = 0 com a versão final rodando no homelab (a base já foi reparada pelo job, ver 8.2).
- [x] 8.5 Atualizar `openspec/specs/athlete-training-load/spec.md` com os requirements desta change e arquivar. Spec canônica `openspec/specs/athlete-training-load/spec.md` criada (a capability não existia; texto do delta, cabeçalho `## Requirements`). Arquivada em 2026-10-22.
      *verify:* `./mvnw clean verify` verde no PR; gráfico sem "Sem dado no período" na base do homelab.
