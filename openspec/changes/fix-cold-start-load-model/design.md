# Design — modelo de carga do cold-start e RECOVERY

Fecha as decisões que o piloto local (`enabled=true`, atletas zerados) expôs no `LoadTargetResolver`.
Números canônicos e justificativa no **ADR-0012**. Tudo atrás do flag `planner-engine.enabled`;
carga/distribuição já são **soft** (estágio 2) por `planner-engine-enforcement`.

## 1. Regime cold-start (ativo enquanto o atleta está EM calibração — até graduar)

- **CTL usado:** o do `BaselineCalculator` (blend real+heurística por `proporcaoHeuristica`), **capado
  a ≤ 40** (INTERMEDIÁRIO) até graduar — um "AVANÇADO/ELITE" autodeclarado não recebe carga de elite
  sem dado observado.
- **Rampa por `CalibrationStage`:** `OBSERVATION → 0,60` · `CALIBRATION → 0,75` · `STABILIZATION → 0,90`.
- **Fórmula:** `targetTss = min(ctlBaseline, 40) × 7 × rampa(stage) × (RECOVERY|POST_RACE ? 0,5 : 1)`.
- **Piso:** 120 TSS/sem, **apenas em fase progressiva** (BASE/BUILD/PEAK/…); não em contenção.
- **Banda de tolerância:** **±25%** no cold-start (vs ±10% padrão) — alvo e CTL são ambos estimativas;
  exigir ±10% de um número estimado gera `FAILED` espúrio. Mantida **soft**.
- **Gatilho do regime = estar em calibração** (não "sem PMC"): durante a calibração usa o baseline
  blendado (PMC imaturo suavizado pela heurística), direção conservadora. Ver ADR-0012, opção (b).
- **Saída:** ao graduar da calibração → `LoadTargetResolver` normal (PMC `ctlAtual`, ±10%, sem
  rampa/cap).

## 2. Redução de RECOVERY/POST_RACE (transversal, qualquer causa)

Fator **×0,5** no `LoadTargetResolver` para essas fases — reduz, não só capa no baseline. Distinto do
`TaperStrategy` (taper por `diasParaProva`); **multiplicativo** com a rampa do cold-start (novato
lesionado = `rampa × 0,5`). Sem piso em contenção.

## 3. Ordenação no `PROXIMA_SEMANA`

Com `enabled=true`, a redistribuição/`SessionDayAllocator` roda em **ambos** os modos (hoje só
`SEMANA_ATUAL`), aplicando a ordem prescrita (longão ancorado, duras não-adjacentes, leve pós-dura) via
`diasAlvoPorTipo` do skeleton. `enabled=false` mantém os dias do LLM (preserva CA9 do enforcement).

## 4. Plumbing

Threadar `CalibrationStage` + o CTL de calibração (baseline capado) ao `OnboardingContext`/
`PlannerInputSnapshot`, resolvidos antes do prompt. O `ctlFallback` já introduzido (commit `463b0c8`,
branch `chore/planner-composition-calibration`) é a 1ª fatia — ajustar para o baseline capado em vez
do onboarding puro.

## 5. Interação com o enforcement e a matriz fail-open

Após 1–3, o cold-start com plano coerente vira `PASSED`; divergência residual continua **soft**.

**Precedência da Decisão 3 do enforcement (esclarecimento — Codex/spec-reviewer DoR 2026-09-12):**
"soft → `FAILED` + `requiresCoachReview`, sem 422" vale sob **`fail-open=true`** (o default vigente).
Com `fail-open=false`, uma violação soft vira **erro de domínio (422, nada persistido)**, conforme a
Decisão 3 — este slice **não** cria exceção à matriz. Invariante **obrigatória (hard)** segue
fail-closed (422) acima do flag. Portanto "nunca 422" no cold-start é consequência do default, não uma
garantia independente. Os testes (CA6) cobrem as duas combinações de `fail-open`.

## 6. Dependência (estado real)

`planner-engine-enforcement` §1–§8 está em **develop** (#109); a calibração do enforcement
(teto de intensidade `max(targetTss×0,40, 60)`, gate de dura `targetTss<220`, carga/distribuição soft
no estágio 2) está em **develop** (#113, 2026-09-12). A dependência estrutural está **resolvida** — a
implementação deste slice parte de `develop`.

## 7. Revisão / calibração dos números

Rampa, cap 40, ×0,5, piso 120 e banda ±25% são um ponto de partida seguro, calibrado sobre 2 atletas
semeados. Refinamento dirigido pelas métricas do shadow na **porta 1 do rollout** (ADR-0012, plano de
revisão): gatilho de reavaliação = `FAILED` de cold-start > 30% após o regime, ou coach rejeitando
sistematicamente por carga.
