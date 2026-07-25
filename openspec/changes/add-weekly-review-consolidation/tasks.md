# Tasks — add-weekly-review-consolidation (M · Full · backend, determinístico)

> Fatia 1 de 3. Sem LLM. Ancorada 1:1 ao `PlanoSemanal`, gerada no encerramento (ver ADR-0006). Cada bloco fecha com `./mvnw clean test`. `verify:` = como saber que funcionou. CA entre colchetes.

## Plano de execução — anchors reais (backend, 2026-07-24)

- **Migration V71** (última V70). Entidade padrão `@Entity` + `@Table(name="tb_...")` + `@Column(name="snake_case")`.
- **`PlanoSemanal`** já tem `semana_inicio/fim`, `tsb_inicio/fim`, volumes, `status` (`PlanoStatus.CONCLUIDO`) — reusar via join, não duplicar.
- **Encerramento:** hook em `EncerramentoSemanaService.encerrarPlanosElegiveis` (dispara manual + fallback `EncerramentoSemanaScheduler`).
- **Aderência:** contagem via `treinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo(atletaId, tenantId, semanaInicio, semanaFim)` na janela do plano (**NÃO** `getAdesaoSemana`). Criticidade `TipoTreino.getFatorImpacto() ≥ 1.15`.
- **Coach-only:** `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`; tenant `TenantContext.getTenantId()`.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Ancoragem ao `PlanoSemanal`, aderência por contagem, gatilho no encerramento — confirmados em grelhagem (ADR-0006, glossário "Revisão Semanal") — [D1–D5]

## 1. Modelo & migration

- [x] 1.1 Migration **V71** aditiva `tb_revisao_semanal` com FK **única** `plano_semanal_id` — [CA6]
  - verify: ✅ `RevisaoSemanalRepositoryTest` (Testcontainers) — Flyway V71 aplica; `uk_revisao_semanal_plano` barra duplicata.
- [x] 1.2 Entidade + DTO: `planoSemanalId`, `recommendationType`, `adherenceStatus`, `percentualRealizacao`, `dadosSuficientes`, `geradaEm` — [CA1]
  - verify: ✅ round-trip dos campos/enums contra o schema real (enums novos `RecommendationType`, `NivelAderencia`).
- [x] 1.3 Validação: ✅ `./mvnw test -Dtest=RevisaoSemanalRepositoryTest` — 3/3 verde.

## 2. Consolidação determinística

- [x] 2.1 `adherenceStatus` por contagem na janela exata `[semanaInicio, semanaFim]` reusando **`findComRealizadoByAtletaAndPeriodo`** (existente) + filtro em memória `dataTreino ≤ semanaFim` (não expande a API do repositório compartilhado): ALTA ≥90% / MEDIA 60-89% / BAIXA <60% ou treino crítico (`fatorImpacto ≥1.15`) faltando — [CA1b]
  - verify: ✅ `RevisaoSemanalCalculatorTest` (cortes + crítico→BAIXA) + `RevisaoSemanalServiceImplTest` (contagem + corte da janela: treino de semana futura é ignorado).
- [x] 2.2 `dadosSuficientes = false` no limiar (<2 treinos realizados OU sem ponto PMC/TSB válido, inclui `tsb_fim` nulo) — [CA3]
  - verify: ✅ `RevisaoSemanalCalculatorTest.DadosSuficientes` (poucos treinos + `tsb_fim` nulo).
- [x] 2.3 `recommendationType` (árvore D5, TSB de `PlanoSemanal.tsb_fim`): se `tsb_fim` nulo ⇒ MAINTAIN (ramos numéricos não se aplicam); senão RECOVERY se `tsb_fim≤−25` ou (`BAIXA` e `tsb_fim≤−10`); PROGRESS se `ALTA` e `tsb_fim≥−10` e `dadosSuficientes` e sem crítico faltando; senão MAINTAIN — [CA2, CA2b, CA2c, CA3b]
  - verify: ✅ `RevisaoSemanalCalculatorTest.Arvore` (12 casos: 3 ramos + default + `tsb_fim` nulo). Lógica pura em `RevisaoSemanalCalculator`.

## 3. Geração no encerramento & congelamento

- [x] 3.1 Hook via `RevisaoSemanalListener` (`@TransactionalEventListener AFTER_COMMIT` no `SemanaEncerradaEvent`) → `RevisaoSemanalService.gerarNoEncerramento` (insert-if-absent por `plano_semanal_id`, gate de status `CONCLUIDO`, tenant-scoped) — [CA1, CA6, CA7]
  - verify: ✅ `RevisaoSemanalGeracaoIT` (Testcontainers) — CONCLUIDO gera 1 revisão; reexecutar → segue 1; não-CONCLUIDO/tenant errado → nenhuma. + `RevisaoSemanalListenerTest` (delega + engole exceção).
- [x] 3.2 Congelamento — lado da **geração**: insert-if-absent não sobrescreve a revisão já congelada (preserva o valor gravado no encerramento) — [CA-Congelamento]
  - verify: ✅ idempotência de `gerarNoEncerramento` (`RevisaoSemanalGeracaoIT`). O lado da **leitura** (devolver o persistido sem recomputar, mesmo com regra mudada) é testado no bloco 4 (5.7), onde o endpoint existe.
- [x] 3.3 Validação: ✅ `./mvnw test -Dtest='RevisaoSemanal*'` — 44/44 verde.

## 4. Leitura

- [x] 4.1 Endpoint `GET /api/v1/coach/atletas/{atletaId}/revisao-semanal` read-only, `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` + `@RequireTenant(0)`; sem revisão → **HTTP 404** via `DomainNotFoundException` (corpo = erro padrão do `GlobalExceptionHandler`, não vazio — convenção do módulo) — [CA1, CA7]
  - verify: ✅ `CoachRevisaoSemanalControllerTest` (@WebMvcTest) — 200 + 404. **403 ATLETA não é tecível no slice** (@PreAuthorize não é tecido com `addFilters=false`) — mesma limitação/débito documentado em `CoachKudosControllerTest`; anotação verificada por leitura.
- [x] 4.2 `weekOverWeekDelta` computado na leitura (top-2 por `semanaInicio`; `semAnterior()` sem anterior) — [CA9]
  - verify: ✅ `RevisaoSemanalLeituraIT` (com delta + primeira semana).
- [x] 4.3 Validação: ✅ `./mvnw test -Dtest='RevisaoSemanal*,CoachRevisaoSemanalControllerTest'` — 50/50.

## 5. Testes (rastreados a CA) — cobertos inline nos blocos 1–4

- [x] 5.1 Geração no encerramento cria RevisaoSemanal 1:1 completa [CA1] — `RevisaoSemanalGeracaoIT`
- [x] 5.2 Cortes de aderência ALTA/MEDIA/BAIXA por contagem + crítico faltando [CA1b] — `Calculator`/`ServiceImpl`Test
- [x] 5.3 RECOVERY em `tsb_fim ≤ −25` e em (`BAIXA` e `tsb_fim ≤ −10`) [CA2] — `CalculatorTest.Arvore`
- [x] 5.4 PROGRESS só com `ALTA` + `tsb_fim ≥ −10` + `dadosSuficientes` + sem crítico faltando [CA2b] — `Calculator`/`ServiceImpl`Test
- [x] 5.5 MAINTAIN no default (intermediário, `dadosSuficientes = false`, e `tsb_fim` nulo → MAINTAIN) [CA2c, CA3b] — `CalculatorTest.Arvore`
- [x] 5.6 `dadosSuficientes = false` → `recommendationType ≠ PROGRESS` [CA3] — `CalculatorTest.DadosSuficientes`
- [x] 5.7 **Congelamento**: leitura devolve `recommendationType` persistido mesmo contradizendo a regra atual (sem recompute) [CA-Congelamento] — `RevisaoSemanalLeituraIT.congelamento`
- [x] 5.8 Idempotência: re-encerrar não duplica [CA6] — `RevisaoSemanalGeracaoIT.idempotente` + `RepositoryTest` unicidade
- [x] 5.9 Isolamento multi-tenant + endpoint coach-only [CA7] — `RepositoryTest` (isolamento) + `GeracaoIT` (tenant errado) + `ControllerTest` (403 = débito)
- [x] 5.10 `weekOverWeekDelta` computado vs. anterior; `semAnterior()` sem anterior [CA9] — `RevisaoSemanalLeituraIT`
- [x] 5.11 Validação final (suíte completa): ✅ `./mvnw clean test` — **2134/2134 verde** (inclui `DomainBoundaryArchTest`).
