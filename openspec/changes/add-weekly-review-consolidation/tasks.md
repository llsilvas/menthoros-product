# Tasks — add-weekly-review-consolidation (M · Full · backend, determinístico)

> Fatia 1 de 3. Sem LLM. Cada bloco fecha com `./mvnw clean test` no `apps/menthoros-backend`. Rastreabilidade de CA entre colchetes. `verify:` = como saber que a task funcionou.

## Plano de execução — anchors reais (backend, 2026-07-24)

- **Migration:** próxima é **V71** (`src/main/resources/db/migration/`, última V70). Convenção de entidade: `@Entity` + `@Table(name = "tb_...")` + `@Column(name = "snake_case")` (ref. `entity/AsaasWebhookEventoProcessado.java`).
- **Aderência:** `MetricasAdesaoService.getAdesaoSemana(String atletaId, LocalDate dataRef)` → `SemanaAdesaoDto` é **count-based** (`treinosPlanejados`/`treinosRealizados`/`percentualRealizacao`). A spec fixou os cortes por **TSS** — logo o % dos cortes é `Σ TSS realizado / Σ TSS planejado` da janela (somado por treino); usar o serviço/repos de treino só para o **casamento planejado-vs-realizado** e para detectar treino crítico faltando (`TipoTreino.getFatorImpacto() ≥ 1.15`).
- **TSB:** `TsbService` (impl `TsbServiceImpl`) — fonte do TSB/PMC da janela.
- **Multi-tenant:** `TenantContext.getTenantId()` (UUID). **Autorização coach-only:** `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` (mesmo padrão de `CoachDashboardController`).

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Aderência/criticidade — `MetricasAdesaoService` (count/TSS) + proxy `TipoTreino.getFatorImpacto()`; sem "treino-chave". Ver Code Anchors — [A3]

## 1. Modelo & migration

- [ ] 1.1 Migration **V71** aditiva `tb_revisao_semanal`, unicidade `(tenant_id, atleta_id, semana_inicio)` — [CA6, CA7]
  - verify: `./mvnw flyway:validate` ou subir contexto de teste; índice único existe.
- [ ] 1.2 Entidade + DTO: janela, `adherenceSummary` (status + %), `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `recommendationType`, `weekOverWeekDelta`, `nextWeekFocus` (template), `confidence`, `generatedAt` — [CA1]
  - verify: teste de mapeamento entidade↔DTO com todos os campos.
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Consolidação determinística

- [ ] 2.1 Computar `Σ TSS realizado` e `Σ TSS planejado` da janela (casamento planejado-vs-realizado via repos/`MetricasAdesaoService`) + `trainingLoadSummary` — [CA1]
  - verify: teste com treinos fixos → soma de TSS esperada.
- [ ] 2.2 `adherenceSummary.status`: ALTA ≥90% / MEDIA 60-89% / BAIXA <60% (razão TSS) **ou** ≥1 treino crítico (`fatorImpacto ≥1.15`) faltando — [CA1b]
  - verify: teste parametrizado nos 3 cortes + caso de crítico faltando forçando BAIXA.
- [ ] 2.3 `fatigueSummary` (TSB final via `TsbService` + delta) e `progressionSummary` a partir do PMC — [CA1]
  - verify: teste com PMC fixo → TSB e delta esperados.
- [ ] 2.4 `confidence = BAIXA` no limiar (<2 treinos realizados OU sem ponto PMC/TSB válido) — [CA3]
  - verify: teste nos dois gatilhos → `confidence = BAIXA`.
- [ ] 2.5 `recommendationType` (árvore D1: RECOVERY se `TSB≤−25` ou (`BAIXA` e `TSB≤−10`); PROGRESS se `ALTA` e `TSB≥−10` e `confidence ALTA` e sem crítico faltando; senão MAINTAIN) — [CA2, CA2b, CA2c]
  - verify: teste parametrizado cobrindo os 3 ramos + o default.
- [ ] 2.6 `weekOverWeekDelta` vs. revisão anterior persistida; `PRIMEIRA_SEMANA` sem anterior — [CA9]
  - verify: teste com/sem revisão anterior.
- [ ] 2.7 `nextWeekFocus` template por `recommendationType` — [CA1]
  - verify: teste mapeia cada `recommendationType` a um template não-vazio.
- [ ] 2.8 Validação: `./mvnw clean test`

## 3. Persistência & leitura

- [ ] 3.1 Persistir idempotente por janela (upsert `(tenant, atleta, semanaInicio)`) sob `TenantContext` — [CA6, CA7]
  - verify: gerar 2x a mesma janela → `count()==1`.
- [ ] 3.2 Endpoint `GET` read-only da revisão, `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` — [CA7]
  - verify: MockMvc 200 para TECNICO/ADMIN, 403 para ATLETA.
- [ ] 3.3 Validação: `./mvnw clean test`

## 4. Testes (rastreados a CA)

- [ ] 4.1 Contrato mínimo completo (todos os campos presentes, `nextWeekFocus` não-vazio) [CA1]
- [ ] 4.2 Cortes de aderência ALTA/MEDIA/BAIXA por razão TSS + crítico faltando [CA1b]
- [ ] 4.3 RECOVERY em `TSB ≤ −25` e em (`BAIXA` e `TSB ≤ −10`) [CA2]
- [ ] 4.4 PROGRESS só com `ALTA` + `TSB ≥ −10` + `confidence ALTA` + sem crítico faltando [CA2b]
- [ ] 4.5 MAINTAIN no default (intermediário e `confidence = BAIXA`) [CA2c]
- [ ] 4.6 <2 treinos ou sem PMC/TSB → `confidence = BAIXA`, `recommendationType ≠ PROGRESS` [CA3]
- [ ] 4.7 Idempotência por janela (regenerar não duplica) [CA6]
- [ ] 4.8 Isolamento multi-tenant — query filtrada por `TenantContext` [CA7]
- [ ] 4.9 Endpoint read-only coach-only — 200 TECNICO/ADMIN, 403 ATLETA (MockMvc) [CA7]
- [ ] 4.10 `weekOverWeekDelta` vs. anterior; `PRIMEIRA_SEMANA` sem anterior [CA9]
- [ ] 4.11 Validação final: `./mvnw clean test`
