**Tamanho:** M · **Trilha:** Full

> Full porque cria a fundacao do nucleo de dominio deterministico (`domain/planner`), adiciona migration (V58) e integra em `PlanoServiceImpl` — mas em **shadow mode apenas**: zero mudanca no prompt, no plano gerado ou na experiencia do coach. Parte 1 de 2; o enforcement esta em `planner-engine-enforcement`.

## Split (2026-07-14)

Esta change nasceu como um unico L cobrindo motor + enforcement. Foi dividida apos replanejamento:

- **`deterministic-planner-engine` (esta, M)** — motor deterministico completo + `SkeletonComplianceChecker` como logica pura + shadow mode + auditoria V58 + fundacao do pacote `domain/`. **Sem dependencia de nenhuma change ativa** — o shadow engancha em `PlanoServiceImpl` apos a geracao legada, codigo que nenhuma change-irma toca.
- **`planner-engine-enforcement` (M)** — skeleton no prompt, compliance em dois estagios com retry, `SessionSlot` prescritivo, flags `enabled`/`fail-open`. Depende desta e, idealmente, de `refactor-iaservice-decomposition`.

Motivos do split: (1) quebra a dependencia de sequenciamento — o SPRINTS coloca esta change na sprint 17-18 e o refactor so na 24; (2) o shadow coleta dados reais de calibracao (distribuicao de fases, taxa de `requiresCoachReview`, violacoes hipoteticas) **antes** de os thresholds virarem enforcement; (3) cada metade e mergeavel e util sozinha.

## Why

Hoje a logica de periodizacao, progressao de carga e prevencao de lesoes esta implicita no prompt enviado ao LLM (GPT-4o). Isso viola o principio arquitetural "camada deterministica primeiro" ja estabelecido no Menthoros e traz tres problemas:

1. **Custo e latencia**: pedir ao LLM para "descobrir" em qual fase de periodizacao o atleta esta, calcular rampa de carga segura e avaliar risco de lesao gasta tokens em raciocinio que e aritmetica e regras de negocio auditaveis.
2. **Auditabilidade**: decisoes de seguranca (ex: "essa semana nao pode subir mais de X TSS") nao podem depender de um LLM "lembrar" de aplicar a regra corretamente a cada geracao.
3. **Consistencia do moat**: o diferencial do Menthoros e o loop `SugestaoCoach` (PENDING -> ACCEPTED/MODIFIED/REJECTED) capturando o delta entre IA e treinador. Se a proposta de periodizacao ja nasce sem lastro deterministico, o sinal de aprendizado fica ruidoso.

**Estende `progressao-treinos` (Sprint 14 ja mergeada):** esta change nao substitui nem reimplementa o `ProgressaoTreinoService`. Ela consome `DecisaoProgressao` como input direcional e adiciona periodizacao por fase, taper, avaliacao de risco e validacao de constraints.

**Fundacao do nucleo de dominio:** a auditoria de codigo (2026-07-14) mostrou a inteligencia deterministica espalhada por `services/prompt` (formatters que calculam E renderizam), `services/helper` e `skills/` (com codigo orfao). Esta change inaugura o pacote `br.com.menthoros.backend.domain/` — nucleo puro, sem JPA/Spring-IO, fiscalizado por teste ArchUnit — onde o `PlannerEngine` nasce e para onde a logica preciosa migra nas proximas changes (ver design.md Decisao 3).

## What Changes

### Backend — nucleo `domain/planner` + motor deterministico

- **Pacote `domain/planner`** — primeiro morador do nucleo de dominio. Regra dura: `domain/..` nao importa `entity/`, `repository/`, `org.springframework.web`, spring-ai. Records in/out, deterministico, sem `LocalDate.now()` interno. Fiscalizado por `DomainBoundaryArchTest` (ArchUnit, escopo de teste).
- **PeriodizationPlanner** — resolve TrainingPhase (BASE/BUILD/CALIBRATION/PEAK/TAPER/RACE_WEEK/RECOVERY/RETURN_TO_TRAINING/POST_RACE — `CALIBRATION` reservado, nao emitido pela logica desta change; ver "Impact" para a dependencia de `athlete-onboarding-baseline`). Prova marcada como `isProvaAlvo()` vence; se nao houver alvo, prioriza a prova futura mais proxima e desempata por distancia mais longa. **Implementacao propria** — nao reusa `PlanoServiceImpl.buscarProximaProva`/`CoachAthleteProfileServiceImpl.getProximaProva`, que hoje so ordenam por data. `PeriodizacaoPromptFormatter` **nao e alterado** nesta change (shadow nao muda o prompt); a unificacao ocorre em `planner-engine-enforcement` (design.md Decisao 12).
- **LoadTargetResolver** — **fonte unica** de TSS-alvo, step-back e ramp-rate: combina `DecisaoProgressao` ja calculada, fase, taper, risco e constraints para resolver o `WeeklyLoadTarget`. Nao recalcula a direcao de progressao; respeita `REDUZIR`/`MANTER`/`PROGREDIR_LEVE`/`PROGREDIR` como input.
- **TaperStrategy** — reducao exponencial de volume (40-60% de TSS) mantendo intensidade nas semanas pre-prova. Duracao por distancia: 5-10K -> 4-7d, 21K -> 10-14d, 42K/Ironman -> 14-21d.
- **InjuryRiskEvaluator** — usa o modelo TSB/CTL/ATL ja canonico (ADR-2, linhagem Friel), consumindo `ProgressaoHistoricoResumo.tsbAtual/ctlAtual/atlAtual` (ja calculados por `TsbService`, sem nova entidade): zona segura TSB > -10, WARNING -10 a -30, HIGH_RISK < -30. Monotonia (media/desvio-padrao da TSS diaria em janela de 7 dias, via `TreinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween`, ja existente) > 2.0 -> WARNING. lesaoAtiva forca RECOVERY. **Nao introduz ACWR nem `AthleteLoadHistory`** (design.md Decisao 15).
- **ConstraintValidator** — valida dias disponiveis, maximo de sessoes, duracao maxima, restricoes de equipamento contra o WeeklyLoadTarget.
- **SkeletonComplianceChecker** — logica **pura de dominio** (`domain/compliance`), com os dois metodos (`checkPreRedistribution`, `checkPostRedistribution`) e `PlannerViolation` proprio (nao estende `PlanQualityChecker`/`ConstraintKey`). **Nesta change roda apenas em shadow** (compliance hipotetico sobre o plano legado, para metricas); o wiring de enforcement/retry e escopo de `planner-engine-enforcement`.

### Shadow mode (o modo de operacao desta change)

- Flag `planner-engine.shadow` (default `false`). Quando `true`: apos a geracao legada em `PlanoServiceImpl`, calcula `WeekPlanSkeleton` + compliance hipotetico + metricas + auditoria. **Nunca** altera prompt, plano ou persistencia do treino; **nunca** chama o LLM de novo.
- **Falha do shadow jamais afeta a geracao**: qualquer excecao vira log estruturado + metrica (`planner.shadow.error.count`), nunca erro ao coach; em lote, nunca aborta nem marca erro individual.
- **Metrica de divergencia**: enquanto `PeriodizacaoPromptFormatter` mantem sua propria logica de fase, o shadow compara `skeleton.phase()` com a fase do formatter e conta divergencias (`planner.phase.divergence.count`) — insumo direto para a unificacao na change de enforcement.

### Auditoria e observabilidade

- **Migration `V58__Add_planner_metadata_to_plano_semanal.sql`** — colunas nullable em `tb_plano_semanal`: `planner_enabled`, `planner_version`, `planner_phase`, `planner_requires_coach_review`, `planner_skeleton_hash`, `planner_compliance_status`, `planner_metadata_json`. Em shadow, persiste com `planner_enabled=false` — a segmentacao ja funciona antes do enforcement.
- **Metricas Micrometer** — `planner.generated.count`, `planner.requires_coach_review.count`, `planner.compliance.hypothetical_failure.count`, `planner.shadow.error.count`, `planner.phase.divergence.count`, tagueadas por `phase`, `plannerVersion`, `batch`.

### ADRs

- **ADR-1:** Motor 100% deterministico em Java, sem LLM na camada de periodizacao.
- **ADR-2:** Modelo canonico unico TSS/CTL/ATL/TSB (linhagem Friel) — usado por `LoadTargetResolver` e `InjuryRiskEvaluator` (risco por TSB, nao ACWR). `ProgressaoTreinoService` permanece dono da direcao de progressao.
- **ADR-3:** requiresCoachReview como gate binario estrutural, nao sugestao textual.
- **ADR-4:** WeekPlanSkeleton e esqueleto ("quanto e quando"), nunca prescricao final ("o que").
- **ADR-5:** Regras versionadas em planner-rules.yml (thresholds nascem como constantes).
- **ADR-6:** Compliance em dois estagios com politicas distintas (definido aqui como logica; wiring em `planner-engine-enforcement`).
- **ADR-7:** Nucleo `domain/` com fronteira fiscalizada por ArchUnit — logica deterministica nova nasce nele; codigo velho migra quando tocado.

## Criterios de aceite

- **CA1 — Rampa de CTL segura:** atleta com CTL 40 nao recebe TSS-alvo que implique rampa > 8 pontos/semana.
- **CA2 — Step-back:** na 4a semana consecutiva de progressao, TSS-alvo cai 15-25%.
- **CA3 — Bloqueio por TSB:** TSB < -30 (fonte: `ProgressaoHistoricoResumo.tsbAtual`) -> requiresCoachReview = true.
- **CA4 — Lesao ativa:** temLesao = true -> fase RECOVERY independente do calendario.
- **CA5 — Taper:** prova 21K a 10 dias -> TSS-alvo cai 40-60% do pico, intensidade preservada.
- **CA6 — Atleta legado suportado:** sem `OnboardingContext`, planner opera em `LEGACY_CONTEXT`; nunca lanca erro por ausencia de onboarding.
- **CA7 — Golden set deterministico:** 30-50 casos em CI; regressao bloqueante.
- **CA8 — Hierarquia com progressao existente:** se `DecisaoProgressao.REDUZIR`, o `WeeklyLoadTarget` nao pode aumentar volume/intensidade por causa da fase.
- **CA9 — Prova-alvo explicita:** `Prova.isProvaAlvo()` vence sobre proximidade/distancia; prova preparatoria na semana ajusta a estrutura sem substituir a prova-alvo.
- **CA10 — Auditoria em shadow:** com `shadow=true`, todo plano gerado persiste `planner_version`, `planner_phase`, `planner_skeleton_hash`, `planner_compliance_status` (hipotetico) e `planner_enabled=false`.
- **CA11 — Shadow nunca quebra a geracao:** excecao em qualquer componente do planner/shadow vira log+metrica; a geracao legada conclui normalmente; em lote, nenhum atleta ganha erro individual por causa do shadow.
- **CA12 — Shadow nao altera o plano:** com `shadow=true`, prompt, plano gerado e persistencia do treino sao byte-a-byte os do pipeline legado.
- **CA13 — Running-first:** modalidade nao-running usa TSS agregado como guardrail e registra `plannerScope=RUNNING_FIRST` no metadata.
- **CA14 — Lesao recente:** `temLesao=true` -> RECOVERY; `dataUltimaLesao` recente sem flag -> RETURN_TO_TRAINING ou requiresCoachReview.
- **CA15 — Fronteira de dominio:** `DomainBoundaryArchTest` (ArchUnit) reprova qualquer import de `entity/`, `repository/`, `org.springframework.web` ou spring-ai dentro de `domain/..`.
- **CA16 — Divergencia medida:** quando a fase do planner difere da fase do `PeriodizacaoPromptFormatter`, `planner.phase.divergence.count` incrementa com tag de ambas as fases.
- **CA17 — Determinismo:** `PlannerEngine.planWeek(...)` com o mesmo `referenceDate` e inputs produz sempre o mesmo skeleton, independente do relogio da maquina.

> CA de compliance/enforcement (estagio 1 com retry, estagio 2 terminal, fail-open, `SessionSlot` prescritivo) movidos para `planner-engine-enforcement`.

## Metrica de sucesso

**Desta change (calibracao):** com `shadow=true` em staging/producao, 100% dos planos gerados persistem auditoria V58, e os dashboards de metricas respondem: distribuicao de `TrainingPhase`, taxa de `requiresCoachReview`, taxa de violacao hipotetica de skeleton e taxa de divergencia de fase — os quatro insumos que calibram os thresholds antes do enforcement.

**North-star do par (medida em `planner-engine-enforcement`):** taxa MODIFIED/REJECTED das `SugestaoCoach` com PlannerEngine <= taxa sem ele, segmentada por `planner_version`, `planner_phase` e `compliance_status`.

## Impact

- **Depende de:** calculadora TSS/CTL/ATL/TSB (ja existe), `SugestaoCoach` state machine (ja existe). **Nenhuma change ativa** — o shadow engancha em `PlanoServiceImpl`, codigo fora do escopo de `refactor-iaservice-decomposition` e `migrate-plan-prompt-to-skills`.
- **Repos:** menthoros-backend (zero frontend)
- **Escopo v1:** running-first; multisport/triathlon completo fica para follow-up
- **Sequenciamento** (design.md Decisao 16): esta change (sprint 17-18) -> `athlete-onboarding-baseline` (19-22, consome o contrato) -> `refactor-iaservice-decomposition` (24) -> `planner-engine-enforcement` -> `migrate-plan-prompt-to-skills`.
- **`athlete-onboarding-baseline` — dependencia inversa (ele depende desta).** Declara (`proposal.md:3,52,55`): *"Depende de `deterministic-planner-engine` (consome `PlannerEngine`, `TrainingPhase.CALIBRATION`, `OnboardingContext`)"*. Esta change **reserva** o contrato: `TrainingPhase.CALIBRATION` no enum (sem logica que o emita) e `OnboardingContext` com sub-records minimos `AthleteBaseline`/`PlanningPolicy`/`AthleteConstraints` (design.md Decisao 2).
- **Change candidata relacionada (fora deste par):** "prescription stamping" (XS/S) — remover/carimbar campos que o LLM copia/inventa e o backend ja sabe (`tsbInicio/Fim`, `fcAlvo`, `ritmoAlvo`, agregados, `ordem`, `status`). Independente do planner; sequenciar apos `refactor-iaservice-decomposition` (mexe no schema/normalizacao de `IaServiceImpl`).

## Open Questions & Assumptions

- ✅ **Multi-prova** — prioriza a mais proxima, desempate por distancia mais longa (decisao CPO 2026-07-13)
- ✅ **Fonte da carga** — motor consome TreinoRealizado (executado), nao TreinoPlanejado
- ✅ **Rejeicao com recalibracao** — v2; v1 trata rejeicao como fluxo manual do coach
- ✅ **OnboardingContext vs DadosPlanoDto** — composicao, nao inchaco (decisao founder 2026-07-13)
- ✅ **Split shadow-first + nucleo `domain/`** — aprovado pelo founder 2026-07-14
- **planner-rules.yml** — thresholds nascem como constantes; extracao para config com dado real do shadow
