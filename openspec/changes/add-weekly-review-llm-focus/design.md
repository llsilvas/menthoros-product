## Context

Fatia 2 de 3 do `weekly-athlete-review`. A Fatia 1 (`add-weekly-review-consolidation`) já entrega a revisão determinística congelada (`recommendationType`, `adherenceStatus`, `dadosSuficientes`) em `tb_revisao_semanal`, 1:1 com o `PlanoSemanal` — **sem narrativa**. Esta fatia adiciona a narrativa `nextWeekFocus` (LLM atrás de flag), injeta a revisão na geração do próximo plano e captura o sinal de aprendizado.

## Code Anchors (reancorados contra a F1 entregue — 2026-07-25)

- **Ponto de extensão da F1 (o que esta fatia estende).** A geração da revisão **não** está em `EncerramentoSemanaService` — ele apenas publica `SemanaEncerradaEvent`. Quem gera é `RevisaoSemanalListener.aoEncerrarSemana` (`RevisaoSemanalListener.java:25`, `@TransactionalEventListener(phase = AFTER_COMMIT)`, com `try/catch` que engole a falha para não desfazer o encerramento) → `RevisaoSemanalService.gerarNoEncerramento(planoId, tenantId)` (impl `RevisaoSemanalServiceImpl.java:83`), que é idempotente por insert-if-absent (`:88`) e preserva o congelamento do ADR-0006. A consolidação determinística vive em `RevisaoSemanalCalculator`. Entidade `RevisaoSemanal.java` (campos atuais: `recommendationType`, `adherenceStatus`, `percentualRealizacao`, `dadosSuficientes`, `geradaEm`) — as colunas desta fatia são aditivas nela. Leitura pelo coach: `RevisaoSemanalServiceImpl.buscarUltima` (`:99`) → `CoachRevisaoSemanalController`.
- **Precedente de LLM assíncrono.** `WorkoutAnalysisListener` (`:72`) usa `@Async("workoutAnalysisExecutor")` sobre um listener de evento para chamada LLM, com executor dedicado em `config/external/WorkoutAnalysisAsyncConfig.java:17`. É o padrão a replicar (ver D8).
- **Captura do `focusOutcome`.** Aprovação do plano pelo coach: `PlanoReviewServiceImpl.aprovarPlano(planoId, tenantId)` (`:68`), exposto por `CoachPlanoReviewController:95`. Geração: `PlanoServiceImpl.java:129` (unitário) e `BatchPlanProcessor.java:80` (lote).
- **Integração da geração de plano.** `IaService.geraPlanoSemanalAvancado(Atleta, PlanoMetaDados, Prova, ModoGeracaoPlano, @Nullable DecisaoProgressao)` (`IaService.java:22`, impl `IaServiceImpl.java:309`) → `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` (`:171`), que acumula `historicoFinal` e retorna `PromptGerado(String, List<Constraint>)` (`:336`). O insumo da revisão entra como novo bloco `historicoFinal.append(...)` / novo formatter (padrão de ~10 formatters injetados) ou parâmetro extra. Caminho unitário síncrono `@Transactional` (`PlanoServiceImpl.java:129`); lote `@Async` (`BatchPlanProcessor.java:80`).
- **Feature flag.** Padrão `@Value("${...enabled:true}")` + `@ConditionalOnProperty` (ex.: `EncerramentoSemanaScheduler.java:41`). Usar `menthoros.weekly-review.llm.enabled`.
- **Custo LLM.** `CostTrackingAdvisor` (`ai/cost/CostTrackingAdvisor.java`) publica contadores Micrometer (`llm.tokens.*`, `llm.cost.estimated.usd`) com tags `model`+`route` em toda chamada roteada (`MultiModelConfig.java:52`); preços em `llm-pricing.yml`; log `[llm-usage]` via `LlmUsageLogger`. Para custo por atleta/mês, estender tags (cardinalidade) ou persistir por chamada (precedente `SkillExecution`).

## Goals / Non-Goals

**Goals:**
- narrativa `nextWeekFocus` por IA, restrita pelo `recommendationType`, atrás de flag
- revisão como insumo da geração do próximo plano
- captura de `focusOutcome` como sinal de aprendizado

**Non-Goals:**
- recalcular números no LLM (a consolidação é da Fatia 1, determinística)
- superfície visual (Fatia 3); métricas `.fit`; notificação ao atleta

## Decisions

### D5: Narrativa LLM restrita pelo `recommendationType`, atrás de flag (kill-switch)

**Decisão:** O `nextWeekFocus` é redigido por LLM sobre os sinais já consolidados, recebendo o `recommendationType` como restrição (a narrativa não pode contrariar o tipo determinístico). A geração fica atrás de `menthoros.weekly-review.llm.enabled`; desligada, usa um **template determinístico derivado do `recommendationType`** (fallback desta fatia — a F1 não tem template). Uma segunda flag controla a injeção da revisão na geração de plano.

**Rationale:** Isola custo/qualidade de LLM; permite implementar sem esperar o gate A1 (aferido em canary) e rollback imediato sem perder o núcleo determinístico.

### D8: Chamada LLM fora da thread do encerramento (`@Async` + timeout/retry)

**Decisão:** A narrativa é gerada em `@Async` com executor dedicado (padrão `WorkoutAnalysisListener` + `WorkoutAnalysisAsyncConfig`), **não** na thread do `RevisaoSemanalListener`. A chamada LLM tem timeout de resposta e retry só de falha transitória, conforme a seção *External Call Resilience* do `apps/menthoros-backend/CLAUDE.md`. A revisão é **persistida primeiro** (sinal determinístico da F1, intacto) e o `nextWeekFocus` é gravado depois, num update do mesmo registro.

**Rationale:** O listener roda na thread que comitou o encerramento — que é tanto o clique manual do coach quanto o `EncerramentoSemanaScheduler`, que encerra N planos em lote. Uma chamada LLM síncrona ali serializaria N chamadas no job e seguraria a resposta do coach. Consequência aceita: existe uma janela em que a revisão existe sem narrativa; o card da F3 já trata campo ausente, e a flag desligada preenche o template determinístico de imediato.

**Consequência de falha:** falha do LLM deixa a revisão com o **template determinístico** (nunca sem `nextWeekFocus`), sem desfazer nada — mesma filosofia do `try/catch` do listener da F1.

### D9: `focusOutcome` por heurística automática (sem superfície nova)

**Decisão:** O `focusOutcome` é **inferido pelo backend**, não escolhido explicitamente pelo coach. Regra: ao gerar/aprovar o próximo plano do atleta, o sistema compara o que aconteceu com a revisão consumida — `MANTIDO` quando o `nextWeekFocus` entrou no insumo e o plano foi aprovado sem edição do coach; `EDITADO` quando entrou no insumo e o plano aprovado tem treinos com `editadoPeloCoach`/`adicionadoPeloCoach`; `DESCARTADO` quando o plano seguinte foi gerado sem consumir a revisão (flag de injeção desligada, revisão ausente no insumo) ou o plano foi rejeitado.

**Rationale:** A Fatia 3 (`add-weekly-review-coach-card`) **já foi mergeada** exibindo apenas os campos determinísticos da F1 — não há controle de UI para o coach declarar a decisão, e criar um endpoint sem consumidor deixaria o CA8 sem loop fechado. A heurística reusa sinais que já existem no domínio (`PlanoReviewStatus`, `editadoPeloCoach` de `coach-edit-planned-workout`, `adicionadoPeloCoach` de `coach-add-workout-to-plan`) e mantém a fatia backend-only, como o proposal declara.

**Vínculo plano→revisão (obrigatório para a heurística funcionar):** a `RevisaoSemanal` é 1:1 com o `PlanoSemanal` **antigo** (o revisado), e o `PlanoSemanal` não tem hoje nenhum campo apontando para a semana anterior. Sem um vínculo durável, `aprovarPlano` não teria como saber qual revisão atualizar — "a mais recente do atleta" é frágil (revisão regerada, mais de um plano no intervalo, aprovação em lote). Portanto: o plano **novo** ganha `revisao_semanal_id` (FK nullable), gravado **no momento da geração**, no mesmo ponto em que a revisão entra no insumo e o `RevisaoConsumidaEvent` é publicado. `aprovarPlano` lê esse FK; FK nulo ⇒ a revisão não foi consumida ⇒ `DESCARTADO`. O `RevisaoConsumidaEvent` passa a carregar `revisaoId` + `planoId` (o payload original `{tenant, atleta, semanaInicio}` não bastava como registro do vínculo).

**Auto-approve não conta como `MANTIDO`:** `aprovarTransicao` é compartilhado entre o clique do coach e o auto-approve (`aplicarAutoApproveSeElegivel`, `OrigemAprovacao.AUTO_CONFIANCA_ALTA`), onde nunca há edição do coach. Registrar a heurística no caminho compartilhado inflaria `MANTIDO` com planos que nenhum coach revisou. Regra: a heurística só roda quando a aprovação tem origem no coach; auto-approve mantém a revisão em `PROPOSTO`.

**Trade-off aceito:** o sinal é mais ruidoso que uma escolha explícita — uma edição de treino por motivo alheio ao foco conta como `EDITADO`. Aceitável porque o uso é agregado (taxa mantido vs. editado/descartado), não decisão individual. Uma superfície explícita pode substituir a heurística depois, sem mudar o contrato da coluna.

### D6: Coach-in-the-loop — insumo, nunca aplicação automática

**Decisão:** A revisão alimenta o contexto da geração do próximo plano, mas não altera o plano automaticamente, e não é exposta ao atleta.

### D7: Loop de aprendizado — `focusOutcome`

**Decisão:** Ao gerar/aprovar o próximo plano, registrar se o `nextWeekFocus` proposto foi mantido, editado ou descartado (`focusOutcome`). Coluna aditiva em `tb_revisao_semanal` (a tabela da Fatia 1).

**Rationale:** Sinal proposta-IA vs. correção-do-coach — o moat que compõe com o sinal de revisão de plano do coach (`PlanoReviewStatus`/`origemAprovacao`).

### D10: Consistência da narrativa verificada por checker determinístico

**Decisão:** A saída do LLM passa por um checker determinístico antes de ser persistida — no espírito do `PlanQualityChecker` (`services/quality/PlanQualityChecker.java`), que já é o padrão do módulo para validar saída de LLM offline. O checker reprova a narrativa quando ela sugere progressão (aumento de volume/intensidade/carga) e o `recommendationType` é `RECOVERY` ou `MAINTAIN`. **Narrativa reprovada ⇒ fallback para o template determinístico** (nunca persiste narrativa inconsistente), com contador Micrometer da reprovação.

**Rationale:** Sem isso o CA-LLM não é testável — "narrativa consistente" viraria julgamento subjetivo. Com o checker, o teste é determinístico em dois níveis: (a) unitário do checker sobre textos fixos; (b) do fluxo, com o `ChatClient` mockado devolvendo uma narrativa que contraria o tipo e assertando que o resultado persistido é o template.

## Technical Notes

### Delta de contrato — colunas aditivas em `tb_revisao_semanal`

```text
tb_revisao_semanal (F1)
+ next_week_focus   TEXT     → narrativa (LLM atrás de flag; template determinístico como fallback)
+ focus_outcome     VARCHAR  (PROPOSTO|MANTIDO|EDITADO|DESCARTADO)

tb_plano_semanal
+ revisao_semanal_id UUID NULL REFERENCES tb_revisao_semanal(id) ON DELETE SET NULL
                             → revisão consumida na geração deste plano (vínculo da D9)

                             ← tudo na migration aditiva V72
```

> **Estado inicial:** `focus_outcome` nasce `PROPOSTO` junto com a revisão (nullable na coluna apenas para as linhas já existentes da F1, que não têm foco). Os três estados terminais (`MANTIDO`/`EDITADO`/`DESCARTADO`) são escritos depois, pela heurística da D9. Os artefatos usam esse enum de 4 valores; os CA falam dos 3 terminais porque `PROPOSTO` é ausência de desfecho, não desfecho.

> A geração de `next_week_focus` roda no encerramento (mesmo hook da F1), atrás de flag. `focus_outcome` é escrito depois, na geração/aprovação do próximo plano.

## Risks / Trade-offs

- **[Risco] Custo LLM fora do envelope** → flag desligada mantém template (Fatia 1); gate A1 em canary.
- **[Risco] Narrativa contraria o tipo determinístico** → `recommendationType` como restrição no prompt + teste (CA-LLM).
- **[Risco] Revisão vira ruído se ninguém consome** → `RevisaoConsumidaEvent` + `focusOutcome` detectam adoção baixa cedo.

## Migration Plan

1. V72 aditiva: `next_week_focus` + `focus_outcome` em `tb_revisao_semanal`; `revisao_semanal_id` (FK nullable) em `tb_plano_semanal`
2. Template determinístico + geração LLM de `nextWeekFocus` atrás de flag (assíncrona, D8)
3. Injeção na geração do próximo plano: grava `revisao_semanal_id` no plano novo + `RevisaoConsumidaEvent{tenant, atleta, semanaInicio, revisaoId, planoId}`
4. Heurística de `focusOutcome` na aprovação/rejeição/geração (D9), lendo o FK

## Rollback

- Flag da narrativa desligada ⇒ `nextWeekFocus` é o template determinístico (fallback desta fatia); a F1 segue intacta.
- Flag de injeção desligada ⇒ a revisão para de alimentar o plano, sem afetar planos existentes. Migration aditiva.

## Open Questions

- **A1 (gate de rollout)** — custo LLM real por atleta/mês vs. R$1,10; critério no proposal (§Gate do founder). Não bloqueia `/implement init`.
