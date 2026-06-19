**Tamanho · Trilha:** M · Full

## Why

O treinador não precisa de mais uma tela cheia de métricas; ele precisa saber rapidamente **quais atletas exigem ação e por quê**. Hoje o Menthoros já calcula os sinais que importam — fadiga/forma (`FaixaTsb`), sobrecarga/progressão (`PlanoMetaDados.alerta*`), aderência (`TreinoExecucaoStatus.PERDIDO`), inatividade (`lastActivity`), zonas vencidas (`Atleta.precisaAtualizarTestes()`) — mas eles ficam **dispersos** por entidades e endpoints diferentes. Não há uma visão operacional única e priorizada.

O `CoachDashboardController` já antecipa esta change: a flag `CoachCalendarioDto.TreinoAgendado.hasAlert` está **fixa em `false` aguardando a fonte de atenção** (esta change). A fila de atenção é o **hook diário** do treinador — fecha o valor visível da shell do coach (Sprints 6/6b) transformando dado em ação.

Esta change é o **primeiro consumidor concreto** de um contrato de motivo/evidência. Por decisão de sequência, ela define esse contrato **inline e mínimo** agora; a change irmã `add-recommendation-explainability` generaliza-o depois contra ≥2 consumidores reais (fila + prescrição).

## What Changes

Uma capability `coach-attention-queue` que **consolida e prioriza, on-demand e read-only**, sinais que o backend **já produz hoje** — sem cálculo de sinal novo e **sem tabela nova** (v1):

1. **Agregação on-demand** sobre o roster do tenant (`AtletaRepository.findAllByTenantId…`), lendo sinais existentes:
   - **Fadiga/forma:** `FaixaTsb` derivada de `PlanoMetaDados.tsbAtual` (níveis CRITICO/ALTO/ATENCAO).
   - **Sobrecarga/progressão:** `PlanoMetaDados.alertaSobrecarga / alertaRampAlto / alertaDiasConsecutivos / alertaNecessitaDescanso`.
   - **Aderência:** treinos `PERDIDO`/subexecução recentes (`TreinoExecucaoStatus`).
   - **Inatividade:** `lastActivity` ≥ 7/14 dias (mesma regra já em `CoachDashboardServiceImpl.deriveStatus`).
   - **Zonas vencidas:** `Atleta.precisaAtualizarTestes()` (3+ meses sem teste).
   - **Sem plano ativo:** atleta sem `PlanoMetaDados` → item próprio (`SEM_PLANO`), para não sumir silenciosamente da fila (decisão de produto).
2. **Item acionável** com contrato mínimo: atleta, `severity`, `priorityScore`, `primaryReason`, `suggestedAction`, `generatedAt` e **`evidence[]` tipado** (lista de `{label, value}`) — não um blob `evidenceJson`.
3. **Priorização determinística:** `severity` (derivada do nível do sinal) → `priorityScore` → recência do sinal.
4. **Corte de severidade (v1):** a fila **expõe apenas `severity ≥ ALTA`** (ALTA/CRITICA) para manter a triagem enxuta. Sinais que mapeiam para MEDIA (zonas vencidas, `alertaRampAlto`/`alertaDiasConsecutivos`, aderência leve 1-2 perdidos, inatividade 7-13d) são **derivados mas não exibidos** na v1 — gancho para um toggle/inbox futuro. Cap de segurança de N itens por tenant.
5. **Deduplicação:** um item por atleta por `primaryReason` agregado; múltiplos sinais do mesmo motivo consolidam evidências no mesmo item.
6. **`suggestedAction` por template determinístico** (um por `MotivoAtencao`, ver abaixo).
7. **Endpoint:** `GET /api/v1/coach/attention-queue` → `List<CoachAttentionItemOutputDto>`, tenant-scoped.
8. **Integração:** preencher a flag `hasAlert` do `CoachCalendarioDto` a partir da fila (o stub que esta change existe para alimentar).

### Templates de `suggestedAction` por motivo (v1)

| `MotivoAtencao` | Severidade | `suggestedAction` |
|-----------------|-----------|-------------------|
| `FADIGA` | TSB CRITICO→CRITICA, ALTO→ALTA | "Revisar carga: reduzir volume/intensidade ou inserir recuperação até o TSB normalizar." |
| `SOBRECARGA` | sobrecarga/necessita-descanso→ALTA | "Reduzir a progressão da semana ou inserir recuperação ativa; evitar novo aumento de carga." |
| `ADERENCIA` | ≥3 perdidos→ALTA | "Falar com o atleta sobre os treinos perdidos e ajustar o plano à rotina real." |
| `INATIVIDADE` | ≥14d→ALTA | "Contatar o atleta: sem atividade na janela; verificar status e engajamento." |
| `SEM_PLANO` | ALTA | "Atleta sem plano ativo: gerar ou ativar um plano de treino." |
| `ZONAS_VENCIDAS` | MEDIA (não exibido na v1) | "Reagendar teste de FC/pace: zonas com 3+ meses podem prescrever mal." |

## Critérios de aceite

- **CA1 — Contrato mínimo do item** — *Given* um atleta com sinal relevante, *When* a fila é gerada, *Then* cada item contém `atletaId`, `severity`, `priorityScore`, `primaryReason`, `suggestedAction` e ao menos uma `evidence{label,value}`.
- **CA2 — Fadiga/forma** — *Given* um atleta cujo `tsbAtual` cai em faixa de alerta (`FaixaTsb` CRITICO/ALTO/ATENCAO), *When* a fila é gerada, *Then* ele aparece com `primaryReason` de fadiga/forma e evidência do valor de TSB e da faixa.
- **CA3 — Sobrecarga/progressão** — *Given* um `PlanoMetaDados` com `alertaSobrecarga`/`alertaRampAlto`/`alertaDiasConsecutivos`/`alertaNecessitaDescanso` ativo, *Then* o atleta aparece com motivo e ação correspondentes e evidência da flag/contagem.
- **CA4 — Aderência e inatividade** — *Given* ≥3 treinos `PERDIDO` recentes **ou** `lastActivity` ≥ 14 dias, *Then* o atleta é sinalizado (ALTA) com motivo de aderência/inatividade.
- **CA5 — Atleta sem plano** — *Given* um atleta sem `PlanoMetaDados` ativo, *Then* ele aparece com `primaryReason = SEM_PLANO` (ALTA), em vez de sumir da fila.
- **CA6 — Corte de severidade (v1)** — *Given* um atleta cujo único sinal mapeia para MEDIA (zonas vencidas, ramp alto, 1-2 perdidos, inatividade 7-13d), *When* a fila é gerada, *Then* ele **não** é exibido na v1 (severity ≥ ALTA); o item é derivável mas filtrado.
- **CA7 — Priorização** — *Given* múltiplos atletas sinalizados, *When* a fila é ordenada, *Then* a ordem é por `severity` desc → `priorityScore` desc → sinal mais recente; determinística (mesmo input ⇒ mesma ordem); cap de N itens.
- **CA8 — Deduplicação por motivo** — *Given* um atleta com múltiplos sinais do mesmo `primaryReason` agregado, *Then* a fila emite **um** item consolidando as evidências; com motivos diferentes, vence a maior severidade.
- **CA9 — Isolamento multi-tenant** — *Given* atletas de outra assessoria, *When* o treinador consulta a fila, *Then* a resposta inclui **apenas** atletas do seu tenant; nenhum vazamento cross-tenant.
- **CA10 — Sem novo schema** — `./mvnw clean test` verde; a fila é read-only/on-demand, **sem migration nova** nem mutação de estado; `hasAlert` do calendário passa a refletir a fila.

## Métrica de sucesso

**KPI de produto (pós-deploy):** **% de atletas em atenção sobre os quais o treinador agiu** (proxy enquanto não há inbox: nº de itens da fila consultados/abertos por dia) e **redução do tempo até identificar o atleta crítico** — o treinador chega ao "quem precisa de mim hoje" sem varrer o roster.
**Métrica de entrega (verificável agora):** testes unitários reproduzem cada fonte de sinal (CA2–CA4), a ordenação determinística (CA5), a dedup (CA6) e o isolamento de tenant (CA7); `hasAlert` deixa de ser fixo.

## Open Questions & Assumptions

- **A1 (assumida):** v1 é **on-demand read-only, sem persistência** de itens nem estado "resolvido". Estado de resolução/snooze pertence à `add-coach-suggestion-inbox` (Sprint 15). Se a fila ficar cara em rosters grandes, materializar é follow-up — não v1.
- **A2 (assumida):** o contrato `primaryReason` + `suggestedAction` + `evidence[]{label,value}` é a **semente inline** que `add-recommendation-explainability` generaliza depois em `RecommendationExplanation`. Não criar a abstração genérica aqui (YAGNI).
- **A3 (assumida):** **readiness subjetivo** (sono/estresse, de `add-daily-readiness-checkin`) e **debrief por IA** (`AnaliseWorkout`, assíncrono) **não** são fontes na v1 — entram quando estáveis. Readiness determinístico atual (TSB+RPE) já é coberto indiretamente via fadiga.
- **D-Triagem (resolvida):** v1 expõe **apenas `severity ≥ ALTA`**; sinais MEDIA são derivados mas não exibidos (gancho futuro). Cap de segurança **N=20** itens por tenant; janela dos sinais de aderência = **14 dias**.
- **D-SemPlano (resolvida, pre-mortem):** atleta sem `PlanoMetaDados` → item `SEM_PLANO` (ALTA), não some.
- **D-Ação (resolvida):** `suggestedAction` = **template determinístico por motivo** (tabela acima); deeplink navegável fica para depois.

## Capabilities

### New Capabilities

- `coach-attention-queue`: consolida e prioriza, on-demand, os sinais existentes do roster em uma fila curta e acionável para o treinador.

## Impact

**Backend (`apps/menthoros-backend`):**
- Novo `CoachAttentionQueueController` (`GET /api/v1/coach/attention-queue`) + `CoachAttentionQueueService`/Impl + `CoachAttentionItemOutputDto` (record, `@JsonInclude(NON_NULL)`).
- Leitura de sinais existentes: `PlanoMetaDados` (TSB + flags de alerta), `Atleta` (testes/inatividade), treinos (`TreinoExecucaoStatus`), reuso de `FaixaTsb`.
- Integração: `CoachDashboardServiceImpl` passa a preencher `CoachCalendarioDto…hasAlert` a partir da fila.
- **Sem migration** (v1 read-only). Última migration atual: `V35`.

**Sem impacto em:** schema de banco, regras de geração de plano, contratos existentes (apenas `hasAlert` deixa de ser fixo).

## Riscos e mitigações

- **Ruído excessivo** (Médio): muitos itens reduzem confiança → `severity`/`priorityScore` + dedup por motivo + top-N (Q1).
- **Custo on-demand em roster grande** (Médio): agregação por request → manter consultas tenant-scoped e enxutas; materializar é follow-up se medir gargalo (A1).
- **Contrato de evidência divergir da explicabilidade** (Médio): risco de retrabalho quando `add-recommendation-explainability` generalizar → manter o contrato inline mínimo e estável (A2), co-revisar os campos.
- **Sinal enganoso** (Baixo): flags determinísticas já validadas em outras changes; a fila só consolida, não recalcula.
- **Isolamento de tenant** (Alto se falhar): toda consulta parte do roster tenant-scoped — coberto por teste negativo (CA9).
- **Item repetido até o inbox** (Médio, limitação conhecida da v1): sem estado "resolvido" (Sprint 15), o treinador que agiu sobre um atleta **verá o mesmo item no dia seguinte** enquanto o sinal persistir. Aceito para a v1 e documentado; mitigação interim (esconder itens vistos na sessão) é opção futura do front, fora do escopo backend.
- **MEDIA invisível na v1** (Baixo): o corte ALTA/CRITICA esconde sinais moderados (inclusive zonas vencidas) — intencional p/ triagem; revisitar quando houver inbox/toggle.

## Relação com outras changes

- **`add-coach-dashboards` / `wire-coach-shell-to-dashboards`** (✅): a fila alimenta `hasAlert`; reusa roster e `FaixaTsb`/status já existentes.
- **`add-recommendation-explainability`** (irmã, **depois desta** por decisão de sequência): generaliza o contrato inline de evidência/motivo desta fila.
- **`add-coach-suggestion-inbox`** (Sprint 15): consome a fila e adiciona o workflow aprovar/ajustar/snooze + estado de resolução (que esta change não persiste).
- **`add-daily-readiness-checkin`**: fonte futura de sinal subjetivo (A3).
