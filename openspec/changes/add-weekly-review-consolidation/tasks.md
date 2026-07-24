# Tasks — add-weekly-review-consolidation (M · Full · backend, determinístico)

> Fatia 1 de 3. Sem LLM. Cada bloco fecha com `./mvnw clean test` no `apps/menthoros-backend`. Rastreabilidade de CA entre colchetes.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Aderência/criticidade — `MetricasAdesaoService` (count/TSS) + proxy `TipoTreino.getFatorImpacto()`; sem "treino-chave". Ver Code Anchors — [A3]

## 1. Modelo & migration

- [ ] 1.1 Migration aditiva `tb_revisao_semanal`, unicidade `(tenant_id, atleta_id, semana_inicio)` — [CA6, CA7]
- [ ] 1.2 Entidade + DTO: janela, `adherenceSummary`, `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `recommendationType`, `weekOverWeekDelta`, `nextWeekFocus` (template), `confidence`, `generatedAt` — [CA1]
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Consolidação determinística

- [ ] 2.1 Aderência via `MetricasAdesaoService.getAdesaoSemana(atletaId, dataRef)` + carga (TSS realizado vs planejado) — [CA1]
- [ ] 2.2 `adherenceSummary.status`: ALTA ≥90% / MEDIA 60-89% / BAIXA <60% ou treino crítico (`fatorImpacto ≥1.15`) faltando — [CA1b]
- [ ] 2.3 Fadiga (TSB final + delta) e evolução a partir do PMC — [CA1]
- [ ] 2.4 `confidence = BAIXA` no limiar (<2 treinos OU sem PMC/TSB válido) — [CA3]
- [ ] 2.5 `recommendationType` (árvore D1: RECOVERY se TSB≤−25 ou (BAIXA e TSB≤−10); PROGRESS se ALTA e TSB≥−10 e confidence ALTA e sem crítico faltando; senão MAINTAIN) — [CA2, CA2b, CA2c]
- [ ] 2.6 `weekOverWeekDelta` vs. revisão anterior; `PRIMEIRA_SEMANA` sem anterior — [CA9]
- [ ] 2.7 `nextWeekFocus` template por `recommendationType` — [CA1]
- [ ] 2.8 Validação: `./mvnw clean test`

## 3. Persistência & leitura

- [ ] 3.1 Persistir idempotente por janela (upsert `(tenant, atleta, semanaInicio)`) sob `TenantContext` — [CA6, CA7]
- [ ] 3.2 Endpoint `GET` read-only coach-only da revisão — [CA7]
- [ ] 3.3 Validação: `./mvnw clean test`

## 4. Testes (rastreados a CA)

- [ ] 4.1 Contrato mínimo completo [CA1]
- [ ] 4.2 Cortes de aderência ALTA/MEDIA/BAIXA (incl. treino crítico faltando) [CA1b]
- [ ] 4.3 RECOVERY em `TSB ≤ −25` e em (`BAIXA` e `TSB ≤ −10`) [CA2]
- [ ] 4.4 PROGRESS só com `ALTA` + `TSB ≥ −10` + `confidence ALTA` + sem crítico faltando [CA2b]
- [ ] 4.5 MAINTAIN no default (intermediário e `confidence = BAIXA`) [CA2c]
- [ ] 4.6 <2 treinos ou sem PMC/TSB → `confidence = BAIXA`, `recommendationType ≠ PROGRESS` [CA3]
- [ ] 4.7 Idempotência por janela (regenerar não duplica) [CA6]
- [ ] 4.8 Isolamento multi-tenant — query filtrada por `TenantContext` [CA7]
- [ ] 4.9 Endpoint read-only coach-only — autorização por role (MockMvc) [CA7]
- [ ] 4.10 `weekOverWeekDelta` vs. anterior; `PRIMEIRA_SEMANA` sem anterior [CA9]
- [ ] 4.11 Validação final: `./mvnw clean test`
