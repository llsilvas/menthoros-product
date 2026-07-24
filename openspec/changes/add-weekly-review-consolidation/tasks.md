# Tasks — add-weekly-review-consolidation (M · Full · backend, determinístico)

> Fatia 1 de 3. Sem LLM. Cada bloco fecha com `./mvnw clean test` no `apps/menthoros-backend`. Rastreabilidade de CA entre colchetes.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Aderência/criticidade — `MetricasAdesaoService` (count/TSS) + proxy `TipoTreino.getFatorImpacto()`; sem "treino-chave". Ver Code Anchors — [A3]

## 1. Modelo & migration

- [ ] 1.1 Migration aditiva `tb_revisao_semanal`, unicidade `(tenant_id, atleta_id, semana_inicio)` — [CA6, CA7]
- [ ] 1.2 Entidade + DTO: janela, `adherenceSummary`, `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `recommendationType`, `weekOverWeekDelta`, `nextWeekFocus` (template), `confidence`, `generatedAt` — [CA1]
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Consolidação determinística

- [ ] 2.1 Aderência via `MetricasAdesaoService` + carga (TSS realizado vs planejado) — [CA1]
- [ ] 2.2 Fadiga (TSB final + delta) e evolução a partir do PMC — [CA1]
- [ ] 2.3 `recommendationType` determinístico (baixa aderência ou `confidence = BAIXA` ⇒ nunca PROGRESS) — [CA2]
- [ ] 2.4 `confidence = BAIXA` no limiar (<2 treinos OU sem PMC/TSB válido) — [CA3]
- [ ] 2.5 `weekOverWeekDelta` vs. revisão anterior; `PRIMEIRA_SEMANA` sem anterior — [CA9]
- [ ] 2.6 `nextWeekFocus` template por `recommendationType` — [CA1]
- [ ] 2.7 Validação: `./mvnw clean test`

## 3. Persistência & leitura

- [ ] 3.1 Persistir idempotente por janela (upsert `(tenant, atleta, semanaInicio)`) sob `TenantContext` — [CA6, CA7]
- [ ] 3.2 Endpoint `GET` read-only coach-only da revisão — [CA7]
- [ ] 3.3 Validação: `./mvnw clean test`

## 4. Testes (rastreados a CA)

- [ ] 4.1 Contrato mínimo completo [CA1]
- [ ] 4.2 Baixa aderência → `status = BAIXA` e `recommendationType ∈ {RECOVERY, MAINTAIN}` [CA2]
- [ ] 4.3 <2 treinos ou sem PMC/TSB → `confidence = BAIXA`, `recommendationType ≠ PROGRESS` [CA3]
- [ ] 4.4 Idempotência por janela (regenerar não duplica) [CA6]
- [ ] 4.5 Isolamento multi-tenant + endpoint coach-only [CA7]
- [ ] 4.6 `weekOverWeekDelta` vs. anterior; `PRIMEIRA_SEMANA` sem anterior [CA9]
- [ ] 4.7 Validação final: `./mvnw clean test`
