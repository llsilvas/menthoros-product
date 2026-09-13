**Tamanho:** M · **Trilha:** Full

# Modelo de carga do cold-start e redução de RECOVERY no planner

**Change-id:** `fix-cold-start-load-model`
**Estado:** proposta pronta para implementação (DoR fechado — grilling 2026-09-12 + ADR-0012).
**Data:** 2026-09-12.
**Origem:** split de `fix-cold-start-calibration-plan-generation` (o slice de modelo de carga, fechado;
o restante — invariantes de etapas/§13.4 — permanece na change original, aguardando decisão de produto).

## Why

Com `planner-engine-enforcement` ligado num piloto local (atletas Hugo/Maria zerados), o alvo semanal
do planner (`targetTss = ctlAtual × 7` no `LoadTargetResolver`) mostrou três defeitos que reprovavam
ou distorciam o plano de atleta novo:

1. **Cold-start colapsa a zero.** Sem PMC (`tb_metricas_diarias` vazio) → `ctlAtual = 0` →
   `targetTss = 0` → faixa `[0,0]` → todo plano cai fora (`TSS_FORA_DA_FAIXA`).
2. **Saltar para o maintenance de uma autodeclaração é agressivo.** Mesmo usando o CTL estimado do
   onboarding (`BaselineCalculator`, heurística por nível), `ctl×7` prescreve fitness não observada.
3. **RECOVERY não reduz.** Lesionado cai em RECOVERY (override correto), mas o resolver só faz
   `min(target, baseline)` — não reduz; o `TaperStrategy` só reduz por proximidade de prova.

Além disso, no modo `PROXIMA_SEMANA` a alocação de dias do skeleton (`SessionDayAllocator`) não é
aplicada (a redistribuição só roda em `SEMANA_ATUAL`) — a ordem vem do LLM (ex.: REGENERATIVO antes do
LONGO, dia disponível ocioso).

Decisões fechadas via grilling e registradas no **ADR-0012**.

## What Changes

- **Regime cold-start** no `LoadTargetResolver`, ativo enquanto o atleta está **em calibração** (stage
  até graduar): CTL do baseline blendado **capado ≤ 40**, **rampa por `CalibrationStage`**
  (OBSERVATION 0,60 · CALIBRATION 0,75 · STABILIZATION 0,90), **piso 120** TSS/sem só em fase
  progressiva, **banda ±25%** (soft). Ao graduar → resolver normal (PMC, ±10%).
- **Redução ×0,5** de RECOVERY/POST_RACE no resolver, multiplicativa com a rampa, distinta do
  `TaperStrategy`. Sem piso em contenção.
- **Estender a alocação de dias ao `PROXIMA_SEMANA`**, gated por `enabled=true` (flag off = dias do
  LLM, preserva CA9).
- **Plumbing:** threadar `CalibrationStage` + CTL de calibração ao `OnboardingContext`/
  `PlannerInputSnapshot`, resolvidos antes do prompt.

Fórmula: `targetTss = min(ctlBaseline, 40) × 7 × rampa(stage) × (RECOVERY|POST_RACE ? 0,5 : 1)`.

## Non-goals

- Não recalibra a fisiologia do `BaselineCalculator` (tabela de CTL por nível permanece).
- Não altera os invariantes de etapas/triângulo (§13.4 da change original) — slice separado.
- Não liga o flag: `planner-engine.enabled` continua default `false`; enable é por ambiente.

## Capabilities

### New Capabilities

- `cold-start-load-model`: contrato do alvo de carga para atleta em calibração e da redução de
  contenção por RECOVERY/POST_RACE, com a extensão da alocação de dias ao próxima-semana. Delta em
  [specs/cold-start-load-model/spec.md](specs/cold-start-load-model/spec.md).

## Acceptance Criteria (testáveis)

- **CA1 — Rampa por estágio:** cold-start em OBSERVATION/CALIBRATION/STABILIZATION → `targetTss` =
  `min(ctlBaseline,40)×7 ×` {0,60 / 0,75 / 0,90}, respectivamente.
- **CA2 — Cap do CTL:** atleta AVANÇADO (CTL estimado 55) em cold-start usa CTL 40 (não 55) até
  graduar; graduado (`ctlAtual`(PMC)>0) ignora rampa/cap e usa o PMC.
- **CA3 — Piso e banda:** piso 120 TSS/sem em fase progressiva (ausente em contenção); banda de
  tolerância ±25% no cold-start (vs ±10% padrão), mantida soft (estágio 2).
- **CA4 — RECOVERY/POST_RACE ×0,5:** alvo dessas fases = ~0,5 × baseline; num cold-start lesionado o
  fator empilha com a rampa (rampa × 0,5); taper por prova (`TaperStrategy`) inalterado.
- **CA5 — Ordenação PROXIMA_SEMANA:** com `enabled=true`, o plano final respeita a alocação do
  `SessionDayAllocator` (longão ancorado, duras não-adjacentes, leve pós-dura); com `enabled=false`,
  dias do LLM byte-a-byte (CA9 do enforcement preservado).
- **CA6 — Fail-open:** divergência residual de carga no cold-start segue a **Decisão 3** do
  enforcement — `FAILED` + `requiresCoachReview` com `fail-open=true` (default), erro de domínio (422)
  com `fail-open=false`. Não há exceção à matriz.

## Dependências

- `planner-engine-enforcement` §1–§8 **mergeado em develop** (#109) e calibração do enforcement
  **mergeada em develop** (#113, 2026-09-12) — dependência estrutural **resolvida**.
- Bugs legados #111/#112 mergeados (não bloqueiam este slice).

## Rollback

Desligar `planner-engine.enabled` (default já é `false`). Sem migration; nenhuma coluna nova.

## Status

- **2026-09-13 — Entregue e arquivada.** `menthoros-backend` PR **#114** mergeado em `develop`
  (CI verde, 2 checks). Piloto real no homelab (Hugo/Maria zerados, `enabled=true`): planos
  coerentes, progressivos, distâncias > 0, ordem sensata; divergência residual de TSS tratada
  corretamente pelo fail-open (`FAILED` + revisão do coach) — sem `[0,0]`.
  `./mvnw clean verify`: 3352 unit (0 falhas) + 181/182 IT (a 1 falha é `PlanoGeracaoConcorrenteIT`,
  bug de concorrência pré-existente e já documentado, não desta change).
  `/qa` (duas rodadas, Claude + Codex): 2 Critical e 1 Important corrigidos antes do merge —
  skeleton pré-prompt não recebia o `OnboardingContext` (regime cold-start só auditava, nunca guiava
  a IA); `TaperStrategy` sobrescrevia a banda ±25% do cold-start com ±10% fixo em TAPER/RACE_WEEK;
  atleta graduado com tier≠A reiniciava a calibração no ciclo seguinte. Um Important aceito como
  débito conhecido (não corrigido nesta change): `LoadTargetResolver.resolveColdStart` pode colapsar
  para `target=min=max=0` quando `ctlBaseline=0` em fase de contenção (TAPER/RACE_WEEK/
  RETURN_TO_TRAINING) — candidato a follow-up.
