## Context

Fatia 1 de 3 do `weekly-athlete-review`: o núcleo determinístico. Consolida a semana do atleta a partir de dados já persistidos (planejado/realizado, PMC/TSB) e expõe por endpoint. Sem LLM. As Fatias 2 (`add-weekly-review-llm-focus`) e 3 (`add-weekly-review-coach-card`) dependem desta.

## Code Anchors (confirmados no backend — 2026-07-24)

- **Aderência / criticidade.** NÃO existe "treino-chave" no backend. Aderência é count/TSS-based:
  - `MetricasAdesaoService.calcularSemana(Atleta, LocalDate)` / `getAdesaoSemana(String, LocalDate)` — % realizados/planejados (aceita data arbitrária). **Fonte primária da consolidação.**
  - Roster: `CoachDashboardServiceImpl.java:257`. Fila: `CoachAttentionSignalEvaluator.avaliarAderencia(...)` (`:108`).
  - Proxy de criticidade: `TipoTreino.getFatorImpacto()` (LONGO 1.15, INTERVALADO 1.4, TIRO 1.5, SUBIDA 1.6). `percepcaoEsforcoEsperada` (`TreinoPlanejado.java:45`) é RPE alvo, não criticidade.
- **PMC/TSB.** `PmcPontoDto` (ctl/atl/tsb/tss) já calculado — fonte de fadiga/evolução.

## Goals / Non-Goals

**Goals:**
- consolidar aderência, carga, fadiga e evolução de forma determinística
- derivar `recommendationType` e `weekOverWeekDelta` determinísticos
- persistir por janela idempotente e expor por endpoint read-only coach-only

**Non-Goals (desta fatia):**
- narrativa por LLM e insumo na geração de plano (Fatia 2)
- superfície visual no shell do coach (Fatia 3)
- métricas `.fit`, tendência multi-semana com gráfico, notificação ao atleta, job automático

## Decisions

### D1: Consolidação determinística + `recommendationType`

**Decisão:** Aderência, carga, fadiga e evolução são calculadas deterministicamente. `recommendationType ∈ {RECOVERY, MAINTAIN, PROGRESS}` também é determinístico: baixa aderência (TSS <60% do planejado OU ≥1 treino de criticidade `≥1.15` não realizado) OU `confidence = BAIXA` ⇒ nunca `PROGRESS`.

**Rationale:** O campo estruturado torna CA2/CA3 testáveis por JUnit sem depender de LLM. É o contrato que a Fatia 2 vai consumir para restringir a narrativa.

**Limiar de `confidence = BAIXA`:** janela com <2 treinos realizados OU sem ponto de PMC/TSB válido (default v1, ajustável).

### D2: `nextWeekFocus` template nesta fatia

**Decisão:** Nesta fatia, `nextWeekFocus` é um **template determinístico** derivado do `recommendationType` (ex.: RECOVERY → "Semana de recuperação: reduza volume ~20%…"). A narrativa por LLM entra na Fatia 2, substituindo o template atrás de flag.

**Rationale:** Permite a Fatia 3 (leitura pelo coach) já mostrar um foco útil sem esperar a camada de IA nem o gate de custo.

### D3: Janela fechada + idempotência

**Decisão:** Revisão por janela explícita (`semanaInicio`/`semanaFim`), unicidade `(tenant, atleta, semanaInicio)`, upsert in-place. Geração/consulta sob `TenantContext`; endpoint de leitura coach-only.

### D4: `weekOverWeekDelta`

**Decisão:** `weekOverWeekDelta` calculado contra a revisão imediatamente anterior persistida (Δaderência, ΔTSS, ΔTSB, transição de `recommendationType`). Sem anterior ⇒ `PRIMEIRA_SEMANA`.

**Rationale:** Linhas já acumulam por janela; custo é 1 query. Transforma "foto" em "trajetória".

## Technical Notes

### Contrato (Fatia 1)

```text
WeeklyAthleteReview
- tenantId · atletaId
- semanaInicio · semanaFim          (unicidade (tenant, atleta, semanaInicio))
- adherenceSummary                  (ALTA|MEDIA|BAIXA + %)         ← determinístico
- trainingLoadSummary               (TSS realizado vs planejado)   ← determinístico
- fatigueSummary                    (TSB final + delta)            ← determinístico
- progressionSummary                                               ← determinístico
- recommendationType                (RECOVERY|MAINTAIN|PROGRESS)   ← determinístico
- weekOverWeekDelta                 (Δs; PRIMEIRA_SEMANA se nulo)  ← determinístico
- nextWeekFocus                     (TEMPLATE por recommendationType — LLM na Fatia 2)
- confidence                        (ALTA|BAIXA)
- generatedAt
```

> Campos `focusOutcome` e a substituição LLM de `nextWeekFocus` são adicionados pela Fatia 2 (migration aditiva própria).

## Risks / Trade-offs

- **[Risco] Template de foco genérico demais** → aceitável nesta fatia; a Fatia 2 substitui por narrativa por atleta.
- **[Risco] Vazamento multi-tenant** → geração/consulta sob `TenantContext`, unicidade inclui tenant, endpoint coach-only (CA7).
- **[Risco] Progressão em semana ruim/incompleta** → `confidence = BAIXA`/baixa aderência bloqueiam `PROGRESS` (CA2/CA3).

## Migration Plan

1. Migration aditiva `tb_revisao_semanal` com unicidade `(tenant, atleta, semanaInicio)`
2. Consolidação determinística + `recommendationType` + `weekOverWeekDelta`
3. Endpoint `GET` read-only coach-only

## Rollback

Migration aditiva, sem rollback de schema. A fatia não altera nenhum fluxo existente (só adiciona leitura), então desativar = não expor o endpoint.

## Open Questions

- Nenhuma bloqueante nesta fatia. A1 (custo LLM) não se aplica (sem LLM).
