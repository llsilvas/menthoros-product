# Implementation Plan — add-race-projection-skill

## Summary

| Métrica | Valor |
|---|---|
| **Change ID** | `add-race-projection-skill` |
| **Total de Grupos** | 12 |
| **Total Story Points** | 41 pts |
| **Complexidade Geral** | Alta |
| **Waves de Execução** | 6 |
| **Dependência Crítica** | Grupo 1 (Fundação) bloqueia todos os demais |

---

## Status de Conclusão

| Grupo | Descrição | Status | Concluído em |
|---|---|---|---|
| 1 | Fundação — DTOs + Mapper | Pendente | — |
| 2 | Camada 1 — Regressão OLS | Pendente | — |
| 3 | Camada 2 — Riegel | Pendente | — |
| 4 | Camada 3 — Periodização/TSB | Pendente | — |
| 5 | Cálculo Final + Assembler | Pendente | — |
| 6 | Narrativa LLM (Haiku) | Pendente | — |
| 7 | Persistência + Migration | Pendente | — |
| 8 | RaceProjectionSkill — Orquestração | Pendente | — |
| 9 | APIs REST | Pendente | — |
| 10 | UI — Entry points Frontend | Pendente | — |
| 11 | Observabilidade | Pendente | — |
| 12 | Documentação + Arquivamento | Pendente | — |

---

## Ordem de Execução (Topológica)

| # | Grupo | Descrição | Pts | Risco | Depende de |
|---|---|---|---|---|---|
| 1 | 1 | Fundação — DTOs + Mapper | 3 | Baixo | — |
| 2 | 2 | Camada 1 — Regressão OLS (commons-math3) | 5 | Alto | 1 |
| 3 | 3 | Camada 2 — Riegel | 3 | Médio | 1 |
| 4 | 4 | Camada 3 — Periodização/TSB | 2 | Baixo | 1 |
| 5 | 6 | Narrativa LLM (Haiku/Sonnet fallback) | 3 | Médio | 1 |
| 6 | 7 | Persistência — Migration + Entity + Repo | 3 | Baixo | 1 |
| 7 | 5 | Cálculo Final + Assembler | 3 | Médio | 2, 3, 4 |
| 8 | 8 | RaceProjectionSkill — Orquestração | 5 | Alto | 5, 6, 7 |
| 9 | 9 | APIs REST | 3 | Baixo | 8 |
| 10 | 11 | Observabilidade (Micrometer + logs) | 2 | Baixo | 8 |
| 11 | 10 | UI — Entry points Frontend | 8 | Alto | 9 |
| 12 | 12 | Documentação + Arquivamento | 1 | Baixo | 11 |

---

## Estratégia de Execução Paralela

### Wave 1 — Fundação (3 pts) · Sequencial

| Grupo | Descrição | Pts | Agente |
|---|---|---|---|
| 1 | DTOs (`WorkoutSummary`, `TrainingHistory`, `LoadProjection`, `PastRace`, `AthleteProfile`, `CoachGoalOverride`, `RaceProjectionInput`, `RaceProjection`, `GoalGapAnalysis`, `CTLForecast`, `RaceProjectionOutput`) + enums + `AthleteProfileMapper` | 3 | backend |

> **Critério de saída:** `./mvnw clean compile` passa sem erros.

---

### Wave 2 — Camadas + LLM + Persistência (16 pts) · Paralelo

| Grupo | Descrição | Pts | Agente | Notas |
|---|---|---|---|---|
| 2 | `PaceRegressionCalculator` + `RegressionResult` + testes | 5 | backend | Adicionar `commons-math3:3.6.1` ao `pom.xml` (item 2.1 primeiro) |
| 3 | `RiegelCalculator` + `RiegelResult` + testes | 3 | backend | — |
| 4 | `PeriodizationAdjuster` + `AdjustmentResult` + testes | 2 | backend | — |
| 6 | `RaceProjectionNarrativeGenerator` (Haiku 4 + Sonnet fallback) + `SKILL.md` + testes com mock | 3 | backend | Spring AI Anthropic já configurado no `pom.xml` |
| 7 | Migration `V27__Create_tb_race_projection_snapshot.sql` + `RaceProjectionSnapshot` entity + `RaceProjectionSnapshotRepository` + testes de repositório | 3 | backend | Próxima migration é **V27** (última aplicada é V26) |

> **Critério de saída:** `./mvnw clean test` passa em cada grupo individualmente.

---

### Wave 3 — Cálculo Final + Orquestração (8 pts) · Sequencial entre si

| Grupo | Descrição | Pts | Agente | Notas |
|---|---|---|---|---|
| 5 | `ConfidenceCalculator` + `RaceProjectionAssembler` | 3 | backend | Depende dos resultados das 3 camadas |
| 8 | `RaceProjectionSkill.execute()` + validações + testes de integração com mock LLM (sc_001–sc_005) | 5 | backend | Depende do Grupo 5 + todos os da Wave 2 |

> Grupo 5 pode ser iniciado assim que Wave 2 concluir; Grupo 8 depende do Grupo 5.

---

### Wave 4 — APIs + Observabilidade (5 pts) · Paralelo

| Grupo | Descrição | Pts | Agente | Notas |
|---|---|---|---|---|
| 9 | `RaceProjectionController` (5 endpoints `/api/v1/atletas/{id}/projecoes-prova`) + `AthleteProjectionView` DTO + testes de controller | 3 | backend | — |
| 11 | Logs estruturados por invocação + métricas Micrometer (`race_projection_executions_total`, `race_projection_duration_ms`) + alerta P95 > 2500ms | 2 | backend | — |

> **Critério de saída:** `./mvnw clean test` passa + build do frontend não quebra.

---

### Wave 5 — UI Frontend (8 pts) · Sequencial

| Grupo | Descrição | Pts | Agente | Notas |
|---|---|---|---|---|
| 10 | Botão "Gerar Projeção" no perfil + modal + tela de resultado (badge LOW/MEDIUM/HIGH) + botão "Marcar Oficial" + dashboard com evolução temporal | 8 | frontend | Depende dos endpoints de Wave 4 |

> **Notas de UI:**
> - Badge de confiança: LOW=vermelho, MEDIUM=amarelo, HIGH=verde
> - Ocultar `confidence` numérica, `gap_analysis` e `coach_note` no dashboard do atleta
> - Confirmar antes de "Marcar como Oficial" (substitui projeção anterior)

---

### Wave 6 — Encerramento (1 pt) · Sequencial

| Grupo | Descrição | Pts | Agente |
|---|---|---|---|
| 12 | `SKILL.md` final + arquivar `add-race-time-prediction` + documentar oq_001–oq_005 no `design.md` | 1 | qualquer |

---

## Recomendações de Agente

| Tipo de trabalho | Agente recomendado |
|---|---|
| DTOs, records, enums, mappers | backend |
| Cálculo numérico (regressão, Riegel, TSB) | backend |
| Integração Spring AI / LLM | backend |
| Migration Flyway + JPA entity | backend |
| Controller REST + testes | backend |
| Métricas Micrometer | backend |
| React components + hooks | frontend |
| Testes de integração da skill | backend |

---

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| `commons-math3` já presente como transitiva — conflito de versão | Baixa | Médio | Verificar `mvn dependency:tree` antes de adicionar explicitamente (item 2.1) |
| `LazyInitializationException` ao chamar skill fora da transação | Média | Alto | `AthleteProfileMapper` resolve — nunca passar `Atleta` direto |
| Regressão OLS com < 6 sessões → confiança LOW não bloqueante | Alta | Baixo | Cobertura de teste sc_002 obrigatória (item 8.4) |
| LLM Haiku timeout > 2s | Baixa | Médio | Fallback para Sonnet configurado (item 6.4); alerta P95 em 11.3 |
| Migration V27 com coluna `projections_json JSONB` sem suporte H2 | Alta | Médio | Usar `@JdbcTypeCode(SqlTypes.JSON)` + testes de repositório só via Testcontainers |

---

## Links

- **Proposal:** `menthoros-product/openspec/changes/add-race-projection-skill/proposal.md`
- **Design:** `menthoros-product/openspec/changes/add-race-projection-skill/design.md`
- **Tasks:** `menthoros-product/openspec/changes/add-race-projection-skill/tasks.md`
- **CLAUDE.md Backend:** `apps/menthoros-backend/CLAUDE.md`
