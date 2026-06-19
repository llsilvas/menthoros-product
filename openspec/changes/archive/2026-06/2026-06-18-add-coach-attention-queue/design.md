## Context

O backend **já produz** os sinais relevantes de forma determinística e tenant-scoped, mas dispersos:

| Sinal | Fonte existente (file) | Tipo |
|-------|------------------------|------|
| Fadiga/forma | `FaixaTsb` ← `PlanoMetaDados.tsbAtual` (`enums/FaixaTsb`, `entity/PlanoMetaDados`) | enum c/ `nivelAlerta` CRITICO/ALTO/ATENCAO/INFO |
| Sobrecarga/progressão | `PlanoMetaDados.alertaSobrecarga / alertaRampAlto / alertaDiasConsecutivos / alertaNecessitaDescanso` + `semanasProgressaoContinua`/`diasConsecutivosTreino` | flags boolean + contadores |
| Aderência | `TreinoExecucaoStatus.PERDIDO`/`PARCIAL` em treinos do período (`entity/TreinoPlanejado`,`TreinoRealizado`) | enum de status |
| Inatividade | `lastActivity` (já em `CoachDashboardServiceImpl.deriveStatus`) | data |
| Zonas vencidas | `Atleta.precisaAtualizarTestes()` (3+ meses) | boolean derivado |

`CoachDashboardServiceImpl.deriveStatus()` já faz uma versão embrionária disso (`danger`: TSB ≤ -20 ou inatividade ≥ 14d; `warning`: TSB ≤ -10 ou inatividade ≥ 7d). A fila **generaliza e prioriza** esses sinais num contrato acionável — não recalcula nada.

## Goals / Non-Goals

**Goals:**
- consolidar sinais existentes do roster em uma fila curta, priorizada e acionável (motivo + ação + evidência);
- ser determinística (mesmo estado ⇒ mesma fila/ordem) e testável sem LLM;
- alimentar a flag `hasAlert` do calendário do coach.

**Non-Goals:**
- substituir o dashboard analítico;
- persistir itens ou estado "resolvido/snooze" (é da `add-coach-suggestion-inbox`);
- criar a abstração genérica de explicabilidade (é da `add-recommendation-explainability`);
- consumir readiness subjetivo ou debrief por IA na v1.

## Decisions

### D1: On-demand, read-only, sem tabela nova (v1)
**Decisão:** a fila é computada **por request**, agregando sinais já persistidos; **nenhuma migration**, nenhuma escrita.
**Rationale:** todos os sinais já estão calculados/armazenados; materializar adicionaria job + tabela + risco de staleness sem ganho na v1. Resolve a Open Question "materializada vs on-demand". Materializar vira follow-up se medirmos gargalo em rosters grandes.

### D2: Contrato tipado (sem `evidenceJson` blob)
**Decisão:** `evidence` é `List<Evidencia(label, value)>` tipada, não um JSON livre.
**Rationale:** alinhado às DTO Standards (records tipados); é a **semente** que `add-recommendation-explainability` generaliza. JSON livre quebraria tipagem do cliente do front e auditabilidade.

```text
CoachAttentionItemOutputDto (record, @JsonInclude(NON_NULL))
- atletaId: UUID
- athleteName: String
- severity: Severidade            // CRITICA | ALTA | MEDIA
- priorityScore: int             // determinístico, p/ ordenar dentro da mesma severidade
- primaryReason: MotivoAtencao   // enum (FADIGA, SOBRECARGA, ADERENCIA, INATIVIDADE, SEM_PLANO, ZONAS_VENCIDAS)
- suggestedAction: String        // template determinístico por motivo (tabela na proposal)
- generatedAt: Instant
- evidence: List<Evidencia>      // [{label, value}], ao menos 1
```

### D3: Severidade e priorityScore determinísticos
**Decisão:** mapear cada fonte → `Severidade` (CRITICA/ALTA/MEDIA) e somar um `priorityScore` por pesos fixos por motivo.
- `FaixaTsb.nivelAlerta`: CRITICO→CRITICA, ALTO→ALTA, ATENCAO→MEDIA.
- `alertaSobrecarga`/`alertaNecessitaDescanso`→ALTA; `alertaRampAlto`/`alertaDiasConsecutivos`→MEDIA.
- inatividade ≥14d→ALTA, ≥7d→MEDIA; treinos PERDIDO ≥3 na janela→ALTA, 1-2→MEDIA; zonas vencidas→MEDIA.
- **sem `PlanoMetaDados` ativo → `SEM_PLANO` (ALTA)** — não pode sumir da fila (pre-mortem).
**Rationale:** reusa os limiares já existentes em `deriveStatus`; nada de heurística nova não-testável.

### D3b: Corte de severidade na v1 (decisão de produto)
**Decisão:** a fila **expõe apenas `severity ≥ ALTA`** (ALTA/CRITICA). Itens MEDIA são computados (e testados) mas **filtrados da resposta** na v1. Cap de segurança `N=20` por tenant; janela dos sinais de aderência = 14 dias.
**Rationale:** roster de 20-30 atletas com tudo exibido vira painel e gera fadiga de alerta. ALTA/CRITICA mantém a fila como triagem real. O cálculo MEDIA fica pronto para um toggle/inbox futuro sem retrabalho. **Consequência consciente:** zonas vencidas, ramp alto, aderência leve (1-2) e inatividade 7-13d **não aparecem na v1**.

### D4: Um item por atleta por motivo agregado (dedup)
**Decisão:** agrupar sinais por `(atletaId, primaryReason)`; consolidar evidências; quando um atleta tem motivos diferentes, escolher o **motivo principal** = maior severidade (desempate por `priorityScore`), mantendo os demais como evidências/secundários do mesmo item.
**Rationale:** a fila é "quem precisa de mim e por quê", não um feed de alertas brutos.

### D5: Ordenação
`severity` desc → `priorityScore` desc → sinal mais recente (`generatedAt`/data do sinal). Top-N por tenant (ver Q1).

## Technical Notes

### Camadas
- `CoachAttentionQueueController` → `GET /api/v1/coach/attention-queue` (`@Tag` ASCII `coach-attention-queue`; sem `@RequireTenant` — resolve o roster do tenant via `TenantContext`, documentar a omissão como nos demais coach endpoints).
- `CoachAttentionQueueService`/`Impl`: orquestra — carrega roster tenant-scoped, deriva sinais por atleta, mapeia → itens, dedup, ordena, top-N.
- Helpers de derivação por sinal (puros, testáveis isolados) — candidatos a `services/helper`. Manter o Impl como orquestrador fino (Service Standards).
- `CoachDashboardServiceImpl`: passa a consultar a fila p/ marcar `hasAlert` por dia/atleta no calendário.

### Fontes elegíveis na v1 (somente determinísticas e já existentes)
fadiga/forma · sobrecarga/progressão · aderência (PERDIDO/subexecução) · inatividade · zonas vencidas.
**Fora da v1:** readiness subjetivo (`add-daily-readiness-checkin`), debrief por IA (`AnaliseWorkout`, assíncrono).

## Risks / Trade-offs
- **Ruído** → severity + dedup + top-N.
- **Custo on-demand** → consultas tenant-scoped enxutas; materializar é follow-up.
- **Divergência futura do contrato de evidência** → manter mínimo e estável (semente da explicabilidade).

## Migration Plan
Nenhuma migration (read-only). Passos de implementação: (1) DTO+enums; (2) helpers de derivação por sinal + testes; (3) service de consolidação/priorização/dedup + testes; (4) controller + `@WebMvcTest`; (5) ligar `hasAlert` no calendário.

## Open Questions (resolvidas no review de produto)
- **Q1 (resolvida):** corte de severidade = **só ALTA/CRITICA** na v1; cap `N=20`; janela de aderência = 14 dias.
- **Q2 (resolvida):** `suggestedAction` = **template determinístico** por motivo (tabela na proposal). Deeplink navegável fica para depois.
- **Q3 (resolvida, pre-mortem):** atleta sem plano ativo → item `SEM_PLANO` (ALTA).
- **Limitação conhecida da v1:** sem estado "resolvido" — item repetido no dia seguinte enquanto o sinal persistir (estado é da `add-coach-suggestion-inbox`).
