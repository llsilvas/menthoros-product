**Tamanho:** L · **Trilha:** Full

> Full porque introduz um novo servico de dominio com 5 subcomponentes, altera o pipeline de geracao de plano (breaking change no prompt), e requer feature flag + teste A/B para rollout seguro. Zero novos endpoints REST.

## Why

Hoje a logica de periodizacao, progressao de carga e prevencao de lesoes esta implicita no prompt enviado ao LLM (GPT-4o). Isso viola o principio arquitetural "camada deterministica primeiro" ja estabelecido no Menthoros e traz tres problemas:

1. **Custo e latencia**: pedir ao LLM para "descobrir" em qual fase de periodizacao o atleta esta, calcular rampa de carga segura e avaliar risco de lesao gasta tokens em raciocinio que e aritmetica e regras de negocio auditaveis.
2. **Auditabilidade**: decisoes de seguranca (ex: "essa semana nao pode subir mais de X TSS") nao podem depender de um LLM "lembrar" de aplicar a regra corretamente a cada geracao.
3. **Consistencia do moat**: o diferencial do Menthoros e o loop WeekSuggestion (PENDING -> ACCEPTED/MODIFIED/REJECTED) capturando o delta entre IA e treinador. Se a proposta de periodizacao ja nasce sem lastro deterministico, o sinal de aprendizado fica ruidoso.

**Estende `progressao-treinos` (Sprint 14 ja mergeada):** esta change nao substitui nem reimplementa o `ProgressaoTreinoService`. Ela consome `DecisaoProgressao` como input direcional e adiciona periodizacao por fase, taper, avaliacao de risco, validacao de constraints e compliance pos-LLM.

## What Changes

### Backend — novo servico de dominio PlannerEngine

- **PeriodizationPlanner** — resolve TrainingPhase (BASE/BUILD/PEAK/TAPER/RACE_WEEK/RECOVERY/RETURN_TO_TRAINING/POST_RACE) reaproveitando a logica hoje concentrada em `PeriodizacaoPromptFormatter`. Prova marcada como `isProvaAlvo()` vence; se nao houver alvo, usa a proxima futura. Provas preparatorias dentro da semana viram constraint estrutural. BASE_FITNESS sem prova -> fase BASE mantida.
- **LoadTargetResolver** — combina `DecisaoProgressao` ja calculada, fase, taper, risco e constraints para resolver o `WeeklyLoadTarget`. Nao recalcula a direcao de progressao; respeita `REDUZIR`/`MANTER`/`PROGREDIR_LEVE`/`PROGREDIR` como input.
- **TaperStrategy** — reducao exponencial de volume (40-60% de TSS) mantendo intensidade nas semanas pre-prova. Duracao por distancia: 5-10K -> 4-7d, 21K -> 10-14d, 42K/Ironman -> 14-21d.
- **InjuryRiskEvaluator** — ACWR (7d/28d, zona segura 0.8-1.3, WARNING 1.3-1.5, HIGH_RISK >1.5), monotonia (>2.0 -> WARNING), strain como sinal composto. lesaoAtiva forca RECOVERY.
- **ConstraintValidator** — valida dias disponiveis, maximo de sessoes, duracao maxima, restricoes de equipamento contra o WeeklyLoadTarget.
- **SkeletonComplianceChecker** — pos-geracao: valida que o plano final respeita o `WeekPlanSkeleton` em estrutura, nao so em soma: fase, contagem, dias disponiveis, TSS alvo, teto de longo, distribuicao de intensidade, prova na semana, taper e constraints duras. Reusa o padrao de `PlanQualityChecker`/`ViolacaoQualidade` e alimenta o fluxo existente de retry (`PlanoResilienceService`).

### Saida: WeekPlanSkeleton

record WeekPlanSkeleton(TrainingPhase phase, WeeklyLoadTarget loadTarget, int sessionCount, ...)

### Contratos de entrada

- **DadosPlanoDto — intocado.** O DTO existente nao e alterado.
- **OnboardingContext opcional** — novo record com AthleteBaseline, confidenceScore, PlanningPolicy, AthleteConstraints. A assinatura do planner recebe `Optional<OnboardingContext>`: atletas legados rodam em modo `LEGACY_CONTEXT` usando `DadosPlanoDto + DecisaoProgressao + Atleta/PlanoMetaDados`; ausencia de onboarding nao bloqueia geracao.


### Auditoria e observabilidade

- **Persistencia minima por plano** — `tb_plano_semanal` ganha metadados nullable do planner: `planner_enabled`, `planner_version`, `planner_phase`, `planner_requires_coach_review`, `planner_skeleton_hash`, `planner_compliance_status`, `planner_metadata_json`. Isso permite medir `MODIFIED/REJECTED` por versao/fase e debugar regressao sem reconstruir o contexto.
- **Metricas Micrometer** — `planner.generated.count`, `planner.compliance.failure.count`, `planner.requires_coach_review.count`, `planner.fallback_legacy.count`, todas tagueadas por `phase`, `plannerVersion` e `reason` quando aplicavel.
- **Batch generation** — em `coach-batch-plan-generation`, falha de compliance/retry de um atleta vira erro individual do job, sem abortar o lote.
- **Shadow mode** — `planner-engine.shadow=true` calcula skeleton, compliance hipotetico e metricas, mas nao altera prompt nem persistencia do plano; permite calibrar distribuicao de fases/fallback antes do rollout real.
- **Escopo v1 running-first** — v1 trata running como modalidade primaria. Multisport/triathlon usa TSS agregado apenas como guardrail conservador; prescricao por esporte e CTL separado por modalidade ficam fora do escopo.
- **Lesao recente** — `temLesao=true` forca RECOVERY; `dataUltimaLesao` recente sem flag ativa gera `RETURN_TO_TRAINING`/requiresCoachReview; descricao de lesao sem flag/data nao e interpretada por NLP, apenas sinaliza review.
- **Compliance apos redistribuicao** — quando `PlanoServiceImpl` redistribui treinos, o checker final roda sobre o plano efetivamente persistivel, nao apenas sobre o DTO bruto do LLM.

### ADRs

- **ADR-1:** Motor 100% deterministico em Java, sem LLM na camada de periodizacao.
- **ADR-2:** Modelo canonico unico TSS/CTL/ATL/TSB (linhagem Friel) com interfaces plugaveis. `ProgressaoTreinoService` permanece dono da direcao de progressao.
- **ADR-3:** requiresCoachReview como gate binario estrutural, nao sugestao textual.
- **ADR-4:** WeekPlanSkeleton e esqueleto ("quanto e quando"), nunca prescricao final ("o que").
- **ADR-5:** Regras versionadas em planner-rules.yml (thresholds nascem como constantes).

## Criterios de aceite

- **CA1 — Rampa de CTL segura:** atleta com CTL 40 nao recebe TSS-alvo que implique rampa > 8 pontos/semana.
- **CA2 — Step-back:** na 4a semana consecutiva de progressao, TSS-alvo cai 15-25%.
- **CA3 — Bloqueio por ACWR:** ACWR > 1.5 -> requiresCoachReview = true.
- **CA4 — Lesao ativa:** activeInjury = true -> fase RECOVERY independente do calendario.
- **CA5 — Taper:** prova 21K a 10 dias -> TSS-alvo cai 40-60% do pico, intensidade preservada.
- **CA6 — Compliance pos-LLM:** SkeletonComplianceChecker rejeita saida do LLM que viola contrato.
- **CA7 — Atleta legado suportado:** sem `OnboardingContext`, planner opera em `LEGACY_CONTEXT` ou cai no pipeline antigo por feature flag; nunca lança erro por ausencia de onboarding.
- **CA8 — Golden set deterministico:** 30-50 casos em CI; regressao bloqueante.
- **CA9 — Hierarquia com progressao existente:** se `DecisaoProgressao.REDUZIR`, o `WeeklyLoadTarget` nao pode aumentar volume/intensidade por causa da fase.
- **CA10 — Prova-alvo explicita:** `Prova.isProvaAlvo()` vence sobre heuristica de proximidade/distancia; prova preparatoria na semana ajusta a estrutura sem substituir a prova-alvo.
- **CA11 — Compliance estrutural:** checker reprova plano que respeita TSS total mas viola dia disponivel, long-run cap, prova na semana, taper ou intensidade maxima permitida.
- **CA12 — Auditoria mensuravel:** plano gerado com planner persiste metadados minimos (`planner_version`, `phase`, `skeletonHash`, `complianceStatus`) suficientes para segmentar taxa MODIFIED/REJECTED.
- **CA13 — Batch isolado:** em geracao em lote, falha de planner/compliance em um atleta vira erro individual; demais atletas continuam.
- **CA14 — Retry/resilience:** violacao de skeleton usa o fluxo existente de retry com feedback estruturado; nao cria um segundo mecanismo de resiliencia.
- **CA15 — Shadow mode:** com `planner-engine.shadow=true`, skeleton e metricas sao calculados, mas o plano gerado/persistido continua vindo do pipeline legado.
- **CA16 — Running-first:** v1 nao promete CTL por modalidade nem prescricao triathlon completa; quando modalidade nao-running aparece, o planner usa TSS agregado como guardrail e marca limitacao no metadata.
- **CA17 — Lesao recente:** `temLesao=true` forca RECOVERY; `dataUltimaLesao` recente sem lesao ativa gera RETURN_TO_TRAINING ou requiresCoachReview.
- **CA18 — Compliance apos redistribuicao:** se a redistribuicao move um treino para dia indisponivel ou viola prova/taper, compliance final falha.

## Metrica de sucesso

Taxa MODIFIED/REJECTED das WeekSuggestion com PlannerEngine <= taxa sem ele, segmentada por `planner_version`, `planner_phase` e `compliance_status` persistidos no plano. Sem esses metadados, a metrica nao e considerada implementada.

## Impact

- **Depende de:** calculadora TSS/CTL/ATL/TSB (ja existe), WeekSuggestion state machine (ja existe)
- **Repos:** menthoros-backend (zero frontend)
- **Escopo v1:** running-first; multisport/triathlon completo fica para follow-up depois de dados por modalidade
- **Nao bloqueia nem altera:** add-aerobic-decoupling, bloco de seguranca
- **Estende:** `progressao-treinos` (ja mergeada e arquivada; `DecisaoProgressao` vira input do planner)
- **Reordenacao:** llm-code-switching adiado para pos-estabilizacao do novo prompt

## Open Questions & Assumptions

- ✅ **Multi-prova** — definido: prioriza a mais proxima com distancia mais longa (decisao CPO 2026-07-13)
- ✅ **Fonte da carga** — motor consome TreinoRealizado (executado), nao TreinoPlanejado
- ✅ **Rejeicao com recalibracao** — v2; v1 trata rejeicao como fluxo manual do coach
- ✅ **OnboardingContext vs DadosPlanoDto** — composicao, nao inchaco (decisao founder 2026-07-13)
- **planner-rules.yml** — thresholds nascem como constantes; extracao para config com dado real
