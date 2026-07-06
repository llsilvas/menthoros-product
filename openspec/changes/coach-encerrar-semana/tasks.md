# Tasks — coach-encerrar-semana

Trilha Full · backend (`apps/menthoros-backend`). Validação por bloco: `./mvnw clean test`.
TDD: escrever o teste do bloco antes da implementação.

### Âncoras de código (verificado contra o repo em `feature/coach-encerrar-semana`, base `c87da09`)

- **Próxima migration Flyway: `V51`** (última = `V50__Create_tb_kudos.sql`). Task 2b.1 → `V51__add_origem_encerramento_plano_semanal.sql`.
- **Reuso de domínio**: `TreinoServiceImpl.marcarTreinoPerdido()` (`:369-392`) e `atualizarStatusDoPlano()` (`:193-215`) — existentes; orquestrar, não reimplementar.
- **Fonte de atletas do tenant (lote)**: `AtletaRepository.findAllAtletas(tenantId)` ou `findAllByTenantIdOrderByNome(tenantId)` (ambas `WHERE atl.assessoria.id = :tenantId`).
- **Fonte de tenants (scheduler)**: `AssessoriaRepository.findByAtivoTrue()` — **confirmado que existe** (`:51-52`).
- **Padrão de scheduler multi-tenant**: `StravaActivitySyncScheduler` (`set`/`clear` do `TenantContext` por iteração).
- **Endpoints coach**: controller dedicado novo (ex.: `CoachEncerramentoSemanaController`) — não há `CoachPlanoController` genérico; controllers vizinhos: `CoachPlanoReviewController`, `PlanoTreinoController`.
- **Entidade**: `PlanoSemanal` expõe tenant via `assessoria` (não `tenantId`); `PlanoStatus.CONCLUIDO` e `TreinoExecucaoStatus.{PENDENTE,PERDIDO}` existentes.

## 1. Núcleo de domínio: regra de encerramento

- [x] 1.0 **Fonte de `hoje` (fuso)**: introduzir `Clock` injetável em `America/Sao_Paulo` (ou usar `CURRENT_DATE` nas queries) e derivar `hoje` de um único ponto — nunca `LocalDate.now()` sem zona (risco T2). Cobrir com o critério 16.
- [x] 1.1 Query `findPendentesAteHojeDoPlano(planoId, hoje)` em `TreinoPlanejadoRepository` (status `PENDENTE` e `dataTreino <= hoje`).
- [x] 1.2 `EncerramentoSemanaService` (interface) + `EncerramentoSemanaServiceImpl` com `encerrarSemana(planoId)` e helper `finalizarPendentes(plano, hoje)`, delegando a marcação unitária a `TreinoService.marcarTreinoPerdido()` (reuso — não reimplementar a regra).
- [x] 1.2b **Resiliência a corrida** (risco T4): no núcleo, **pular** (não lançar) treino que já não está `PENDENTE` no momento do update; contabilizar como "ignorado".
- [x] 1.3 Documentar cada método público (Idempotent/Side Effects/Tenant-aware) conforme o CLAUDE.md do backend.
- [x] 1.4 Validação: teste unitário cobrindo critérios 1, 2, 4, 5, 16 e 18 (finaliza `<= hoje` incl. domingo; fuso; não toca REALIZADO/PARCIAL/futuro; idempotência; ignora corrida). `./mvnw clean test`.

## 2. Fechamento do plano + evento

- [x] 2.1 **Verificar** que `TreinoService.atualizarStatusDoPlano()` existe e é idempotente (mapa do domínio: `TreinoServiceImpl:193-215`) e **reusá-lo** (não reimplementar). Após finalizar os pendentes, garantir que leva a `CONCLUIDO` quando todos finalizados; compor `EncerramentoSemanaResultado` (nº finalizados, ids perdidos, `prontoParaProximaSemana`).
- [x] 2.1b **Plano sem elegíveis / vazio** (risco T6): quando o plano já passou e não há `PENDENTE <= hoje` a finalizar, fechar `CONCLUIDO` explicitamente (evitar reprocesso perpétuo); no on-demand no meio da semana (`semanaFim > hoje`), não fechar e devolver `aviso`. Cobre critérios 15 e 17.
- [x] 2.2 Definir `SemanaEncerradaEvent` (record, com `origem: OrigemEncerramento` = `ON_DEMAND`/`AUTOMATICO`) e publicá-lo; o contrato SHALL ser consumido em `@TransactionalEventListener(AFTER_COMMIT)` (risco T5). Cada gatilho informa sua `origem` (on-demand/lote → `ON_DEMAND`; scheduler → `AUTOMATICO`). **Sem listener que gere plano** nesta change.
- [x] 2.3 Validação: teste dos critérios 3 (plano → `CONCLUIDO`), 15 (aviso meio-de-semana), 17 (plano vazio fecha) e verificação da publicação do evento (payload + origem). `./mvnw clean test`. **Nota:** critério 26 (AFTER_COMMIT) coberto por contrato — publicação dentro da TX + JavaDoc no `SemanaEncerradaEvent` exigindo `@TransactionalEventListener(AFTER_COMMIT)`; sem consumidor nesta change, seguindo a convenção do `TreinoRegistradoEvent`.

## 2b. Persistência da origem de encerramento (métrica-farol)

- [x] 2b.1 Migration `V51__add_origem_encerramento_plano_semanal.sql`: `ALTER TABLE tb_plano_semanal ADD COLUMN origem_encerramento VARCHAR(15)` (nullable, sem default).
- [x] 2b.2 Mapeamento `@Enumerated(STRING)` em `PlanoSemanal` + setter no service: on-demand/lote → `ON_DEMAND`; scheduler → `AUTOMATICO`. Setar **antes** do `save`, dentro da mesma TX.
- [x] 2b.3 Expor `origemEncerramento` nos DTOs que já trazem `PlanoSemanal` (roster, perfil) — sem endpoint dedicado.
- [x] 2b.4 Validação: teste que verifica coluna populada com a origem correta após encerramento on-demand e automático (critérios 19–20), planos pré-existentes com `null` (critério 21), e a query de métrica `GROUP BY origem_encerramento` retornando as contagens segmentadas (critério 23). `./mvnw clean test`.

## 2c. Carência parametrizável via property

- [x] 2c.1 Property `menthoros.encerramento-semana.carencia-dias` (default `3`); injetar via `@Value` no scheduler.
- [x] 2c.2 Passar `hoje.minusDays(carenciaDias)` ao `findElegiveisFallback` (query já recebe `:limiteCarencia`).
- [x] 2c.3 Validação (critério 22): teste com carência customizada (5 dias) — plano com `semanaFim` há 4 dias NÃO é encerrado; há 5+ dias SIM; default da property é 3. `./mvnw clean test`.

## 3. Endpoint on-demand do treinador

- [x] 3.1 `EncerramentoSemanaOutputDto` (record, `@JsonInclude(NON_NULL)`, `@Schema`) em `dto/output/`.
- [x] 3.2 `POST /api/v1/coach/planos/{planoId}/encerrar-semana` no controller de plano do coach: injeta só a interface do service, `@PreAuthorize` coach/admin, `@RequireTenant(resourceParamIndex = 0)`, `@Operation` + `@ApiResponses` (200/403/404), retorna `ResponseEntity<EncerramentoSemanaOutputDto>`.
- [x] 3.3 Chamada on-demand **não aplica carência** (critério 2).
- [x] 3.4 Validação: teste do controller (200 com resumo mapeado; propagação de 404) + teste de serviço do critério 2. `./mvnw clean test`. **Nota:** 403 (critério 10) é declarativo via `@PreAuthorize(TECNICO/ADMIN)` e 404 (critério 27) via `@RequireTenant`+`GlobalExceptionHandler` — não `@WebMvcTest` (não adotado no módulo), seguindo a convenção dos demais coach controllers.

## 4. Encerramento em lote da assessoria

- [x] 4.0 **Fronteira transacional** (risco T1): extrair `EncerramentoAtletaTransacional` (bean separado, `@Transactional(REQUIRES_NEW)`) ou usar `TransactionTemplate` — commit/rollback por atleta. O método do loop **não** é `@Transactional`.
- [x] 4.1 `EncerramentoLoteOutputDto` + `FalhaAtleta` (records tipados; não `List<String>`) com baldes processado/sem-plano/falha (risco T8).
- [x] 4.2 Query **tenant-scoped** da semana corrente em `PlanoSemanalRepository` (`ps.assessoria.id = :tenantId`, `ORDER BY semanaInicio DESC`, primeiro resultado — resiliente a sobreposição; risco T3). **Não** usar `findByAtletaIdAndSemana` (não é tenant-scoped).
- [x] 4.3 `encerrarSemanaLoteAssessoria(hoje)` no service: atletas via `AtletaRepository` **tenant-scoped**; para cada, resolve a semana corrente (4.2) e encerra via bean transacional (4.0); falha por atleta vira `FalhaAtleta`, lote continua.
- [x] 4.4 `POST /api/v1/coach/semanas/encerrar-lote`: `@PreAuthorize` coach/admin, **sem** `@RequireTenant`, `@Operation` + `@ApiResponses` (200/403), retorna `ResponseEntity<EncerramentoLoteOutputDto>`.
- [x] 4.5 **Preview/dry-run** (produto P1): `POST /api/v1/coach/semanas/encerrar-lote/preview` (`readOnly`, não persiste) retornando o impacto projetado no mesmo shape.
- [x] 4.6 Validação: testes dos critérios 11 (resumo + totais), 12 (fonte tenant-scoped), 13 (falha parcial: N-1 em resultados, 1 em falhas) e 14 (preview não marca nem salva). `./mvnw clean test`. **Nota:** o isolamento de commit por atleta é estrutural (`TransactionTemplate` REQUIRES_NEW); o teste unitário cobre a orquestração (falha isolada), não o commit real de N-1 num DB (exigiria IT dedicado).

## 5. Fechamento automático com carência (scheduler)

- [x] 5.1 Query `findElegiveisFallback(tenantId, limiteCarencia)` em `PlanoSemanalRepository` via `@Query` com `ps.assessoria.id = :tenantId` e `ps.status <> CONCLUIDO` e `ps.semanaFim <= :limiteCarencia` (`= hoje - 3d`) — **não** método derivado por `tenantId` (risco T3).
- [x] 5.2 `encerrarPlanosElegiveis(tenantId, hoje)` no service: seleciona planos fora da carência e aplica o encerramento por atleta (bean transacional 4.0). Fonte única de tenant (parâmetro explícito, sem `TenantContext` redundante; risco T7).
- [x] 5.3 `EncerramentoSemanaScheduler` com `@Scheduled(cron = "${menthoros.encerramento-semana.cron:0 30 3 * * *}", zone = "America/Sao_Paulo")`, flag `menthoros.encerramento-semana.enabled` (default true); tenants via `AssessoriaRepository.findByAtivoTrue()`, `TenantContext.set` no `try` / `clear` no `finally` por iteração; falha por tenant isolada; pool dedicado (não compartilhar a thread única com a sync do Strava — risco T7).
- [x] 5.4 Validação: testes dos critérios 6 (carência bloqueia), 7 (fecha após carência) e 8 (isolamento multi-tenant, **incluindo** iteração que lança antes do `clear()` e a seguinte roda com o tenant certo). `./mvnw clean test`.

## 6. Reversibilidade PERDIDO → REALIZADO

- [x] 6.1 Ajustar a promoção de status no registro retroativo (`registrarTreinoManualAtleta` / `marcar-realizado`) para aceitar origem `PERDIDO`, não só `PENDENTE/PARCIAL/LIVRE`; recalcular status do plano.
- [x] 6.2 Validação: teste do critério 9 (treino `PERDIDO` volta a `REALIZADO`, vincula ao realizado, plano recalculado). `./mvnw clean test`.

## 7. Fechamento

- [x] 7.1 Rodar suíte completa: `./mvnw clean test` (verde, sem regressão).
- [x] 7.2 Entregue: seções 1–6 completas (núcleo, fechamento+evento, persistência de origem, endpoint on-demand, lote+preview, fallback+carência, reversibilidade). **Adiado (fora do escopo backend, documentado no proposal):** frontend (botões + confirmação do preview) = change `coach-encerrar-semana-ui`; digest/notificação do fallback = `add-weekly-athlete-review`; teste de integração de commit-real do lote e de rollback AFTER_COMMIT (cobertos estruturalmente/por contrato). Suíte: 1201 testes, 0 falhas.

## QA gate (/qa)

3 reviewers em paralelo (code-reviewer, security-reviewer, clean-code-reviewer). Achados aplicados no commit `e19ca60`:
- **Critical** — C1: N+1 no encerramento (marcarTreinoPerdido por treino) → `TreinoService.marcarTreinosPerdidos` (lote + 1 recálculo). C2: `findPendentesAteHojeDoPlano` sem filtro de tenant → adicionado `tp.tenantId`.
- **High** — H-1: `FalhaAtleta.motivo` vazava `e.getMessage()` raw (schema do banco) → sanitizado (só erros de domínio propagam).
- **Important** — evento publicado em replay idempotente → condicional (`fechouAgora || !perdidos`); `FalhaAtleta` exposto no DTO → `EncerramentoFalhaAtletaOutputDto` com `@Schema`; métodos core `private`; `@ApiResponse` 409.
- **Minor** — helpers de DRY (`novaTransacaoRequiresNew`, `iterarAtletasComPlanoCorrente`), log de sobreposição de semanas, comentários de `@RequireTenant`/pool, cobertura de branches (never-publishEvent, falha no fallback), `@Nested` no scheduler.
- **Sem Critical remanescente.** Suíte: 1201 testes, 0 falhas.
