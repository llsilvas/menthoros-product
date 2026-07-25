## Context

Fatia 1 de 3 do `weekly-athlete-review`: o núcleo determinístico, **ancorado 1:1 ao `PlanoSemanal`**. Desenho consolidado em grelhagem 2026-07-24 contra os domain docs do backend (ver `CONTEXT.md` → "Revisão Semanal" e **ADR-0006**). As Fatias 2 (`add-weekly-review-llm-focus`) e 3 (`add-weekly-review-coach-card`) dependem desta.

## Code Anchors (backend, 2026-07-24)

- **`PlanoSemanal`** (`tb_plano_semanal`) já carrega `semana_inicio`/`semana_fim`, `tsb_inicio`/`tsb_fim`, `volume_planejado_km`/`volume_realizado_km`/`volume_alvo_km`, `status` (`PlanoStatus.CONCLUIDO`), `review_status`, `objetivo_semana`. A revisão **reusa** esses campos; não os duplica.
- **Encerramento:** `EncerramentoSemanaService.encerrarPlanosElegiveis(...)` fecha o plano (`CONCLUIDO`), disparado pelo coach (manual) ou pelo `EncerramentoSemanaScheduler` (fallback diário, `menthoros.encerramento-semana.enabled`). Ponto de hook da geração da revisão.
- **Aderência:** contagem realizados/planejados na janela exata do plano via `treinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo(atletaId, tenantId, semanaInicio, semanaFim)`. **NÃO** usar `MetricasAdesaoService.getAdesaoSemana` (semana domingo–sábado, incompatível com o segunda–domingo do plano) nem equiparar ao `aderenciaPercentual` do roster (rolante de 4 semanas) — são métricas distintas. Criticidade: `TipoTreino.getFatorImpacto()`.
- **Multi-tenant:** `TenantContext.getTenantId()` (UUID). Coach-only: `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` (padrão do `CoachDashboardController`).

## Goals / Non-Goals

**Goals:**
- congelar, no encerramento, o sinal estruturado do que foi proposto (`recommendationType`, `adherenceStatus`, `dadosSuficientes`)
- aderência por contagem na janela exata do plano; `recommendationType` determinístico sobre `tsb_fim`
- `weekOverWeekDelta` computado; leitura coach-only

**Non-Goals (desta fatia):**
- narrativa `nextWeekFocus` por LLM, `focusOutcome`, insumo na geração de plano (Fatia 2)
- card no shell do coach (Fatia 3)
- métricas `.fit`, tendência multi-semana, notificação ao atleta, cron próprio

## Decisions

### D1: Ancorar 1:1 ao `PlanoSemanal`

**Decisão:** A revisão é 1:1 com um `PlanoSemanal` (FK única `plano_semanal_id`), reusando janela, TSB e volumes do plano. Não há conceito de "semana" independente.

**Rationale:** É a unidade semanal canônica do domínio (o glossário avisa contra inventar um "week" paralelo). `tsb_inicio/tsb_fim` já dão o TSB e o delta da semana — elimina "qual TSB usar" (PMC vs baseline estimado durante `CALIBRATION`): usa-se o que o plano registrou.

### D2: Persistir congelado — só o rule-dependent (ADR-0006)

**Decisão:** `tb_revisao_semanal` congela no encerramento apenas o sinal que depende de **regra mutável**: `recommendationType`, `adherenceStatus`, `dadosSuficientes` (+ `percentualRealizacao` exibido, `geradaEm`). TSB/volumes ficam no `PlanoSemanal` (congelados por `CONCLUIDO`); `weekOverWeekDelta` é **computado** na leitura.

**Rationale:** Os limiares (`−25`/`−10`/`90%`) são ajustáveis. Recomputar reescreveria "o que foi proposto ao coach", corrompendo o moat (proposta-IA vs. edição-do-coach). Congelar preserva ground-truth para o moat e análises LLM/RAG. O que não depende de regra (TSB, volumes, delta) não é congelado — é recomputável e estável.

### D3: Gerar/congelar no encerramento da semana

**Decisão:** Hook em `EncerramentoSemanaService` — a revisão nasce quando o `PlanoSemanal` vira `CONCLUIDO` (manual ou fallback automático). Sem scheduler novo. Upsert idempotente por `plano_semanal_id`. Antes do `CONCLUIDO`, o `GET` retorna "não disponível".

**Rationale:** É quando `tsb_fim`/`volume_realizado_km` ficam finais — congelamento fiel, sem race. Espelha o padrão "Semana de Calibração" do domínio (hook no fluxo existente, não cron próprio).

### D4: Aderência por contagem na janela exata do plano

**Decisão:** `adherenceStatus` deriva de uma contagem realizados/planejados na janela **exata** do plano `[PlanoSemanal.semanaInicio, PlanoSemanal.semanaFim]` (segunda–domingo), reusando o repositório de casamento planejado-vs-realizado do roster (`treinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo`) escopado a essa única semana. Cortes `ALTA ≥90%` / `MEDIA 60–89%` / `BAIXA <60%`, com override: ≥1 treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) não realizado ⇒ `BAIXA`.

**Rationale:** Contagem (não TSS) para reusar a mesma *lógica de casamento* do roster, sem inventar uma segunda métrica de esforço. **Correção (re-gate 2026-07-24):** o número **NÃO** é igual ao `aderenciaPercentual` do roster — o roster é uma janela **rolante de 4 semanas** (`inicioSemana.minusWeeks(3)`), esta é a semana do plano; e `MetricasAdesaoService.getAdesaoSemana` usa semana domingo–sábado, incompatível com o segunda–domingo do `PlanoSemanal`. Por isso **não** se usa `getAdesaoSemana`: conta-se direto na janela do plano. São métricas distintas por design (per-semana vs. tendência de 4 semanas). O override de criticidade cobre "fez os fáceis, pulou o tiro".

### D5: `recommendationType` determinístico sobre `tsb_fim`

**Decisão (árvore, nesta ordem):**
1. `RECOVERY` — `tsb_fim ≤ −25` **ou** (`adherenceStatus = BAIXA` **e** `tsb_fim ≤ −10`)
2. `PROGRESS` — `adherenceStatus = ALTA` **e** `tsb_fim ≥ −10` **e** `dadosSuficientes` **e** sem crítico faltando
3. `MAINTAIN` — caso contrário (default; inclui `dadosSuficientes = false`)

**`dadosSuficientes`** = `false` se <2 treinos realizados **ou** sem ponto de PMC/TSB válido na janela ⇒ nunca `PROGRESS`. (Nome escolhido para não colidir com `ConfidenceTier` — ex-`confidence`.)

**TSB ausente:** `PlanoSemanal.tsb_fim` é nullable. Se for `null`, `dadosSuficientes = false` e os ramos numéricos (RECOVERY/PROGRESS, que comparam `tsb_fim`) **não se aplicam** ⇒ `MAINTAIN`. A checagem de `tsb_fim` nulo precede qualquer comparação numérica na árvore.

**Rationale:** `tsb_fim` é o estado ao fim da semana — o que orienta a próxima. Limiar `−25` ancorado no piso já usado por `RecoveryCargaSkill`/retention-radar.

## Technical Notes

### Contrato — `tb_revisao_semanal` (só o congelado)

```text
RevisaoSemanal
- id
- planoSemanalId          (FK única → tb_plano_semanal)
- recommendationType      (RECOVERY|MAINTAIN|PROGRESS)   ← congelado
- adherenceStatus         (ALTA|MEDIA|BAIXA)             ← congelado
- percentualRealizacao    (contagem, como-exibido)       ← congelado
- dadosSuficientes         (boolean)                      ← congelado
- geradaEm
```

> Janela, TSB, volumes → `PlanoSemanal` (join). `weekOverWeekDelta` → computado na leitura (current vs. `PlanoSemanal` anterior). `nextWeekFocus`/`focusOutcome` → Fatia 2 (tabela/coluna própria 1:1 com o mesmo `PlanoSemanal`).

### Leitura e congelamento

O endpoint lê a coluna `recommendation_type` persistida e **nunca** recomputa — é isso que garante o congelamento (CA-Congelamento). O teste de congelamento (5.7) constrói uma `RevisaoSemanal` cujo `recommendationType` persistido **contradiz** o que a regra atual produziria para aquele `PlanoSemanal`, e assevera que a leitura devolve o valor **persistido** — sem depender de externalizar limiares. Os limiares (`−25`/`−10`/`90%`) são constantes Java na v1. Antes do `CONCLUIDO` não há linha ⇒ HTTP **404** com corpo vazio (contrato de "não disponível").

## Risks / Trade-offs

- **[Risco] Aderência por contagem trata todo treino igual** → override de criticidade mitiga; consistência com o roster vale mais que a granularidade de TSS na v1.
- **[Risco] Sem encerramento (flag off + coach não fecha) → sem revisão** → aceitável: sem semana fechada, não há o que revisar.
- **[Risco] Vazamento multi-tenant** → geração/consulta sob `TenantContext`; endpoint coach-only (CA7).

## Migration Plan

1. Migration **V71** aditiva `tb_revisao_semanal` (FK única `plano_semanal_id`)
2. Consolidação determinística + hook no `EncerramentoSemanaService`
3. Endpoint `GET` read-only coach-only

## Rollback

Migration aditiva, sem rollback de schema. A fatia não altera fluxo existente além de **adicionar** um passo no encerramento (protegível por flag se necessário) e um endpoint de leitura.

## Open Questions

- Nenhuma bloqueante. A1 (custo LLM) não se aplica (sem LLM).
