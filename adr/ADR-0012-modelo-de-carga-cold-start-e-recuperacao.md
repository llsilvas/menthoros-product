# ADR 0012 - Modelo de carga do cold-start e reducao de RECOVERY no planner

## Status
Aceito

## Data
2026-09-12

## Decisores
Founder (Leandro), via grilling (grill-with-docs) sobre evidencia de piloto local

## Contexto

Com `planner-engine-enforcement` ligado (`planner-engine.enabled=true`) num piloto local, atletas
**sem historico de treino** (cold-start, em calibracao) tiveram todo plano reprovado, e um atleta
lesionado recebeu carga alta demais. A causa raiz esta no `LoadTargetResolver`, que deriva o alvo
semanal como `targetTss = ctlAtual × 7`:

1. **Cold-start colapsa a zero.** Sem PMC (`tb_metricas_diarias` vazio), `ctlAtual = 0` →
   `targetTss = 0` → faixa `[0,0]` → **todo** plano cai fora (`TSS_FORA_DA_FAIXA`), embora o
   onboarding ja estime um CTL por nivel (`BaselineCalculator`: INICIANTE 25, INTERMEDIARIO 40,
   AVANCADO 55, ELITE 70 — heuristica da **autodeclaracao**, com ATL=CTL/TSB=0).
2. **Saltar para o maintenance de uma autodeclaracao e agressivo.** Mesmo corrigindo (1) com o CTL
   estimado, `ctl×7` prescreve o *maintenance* de uma fitness **nao observada** (ex.: "AVANCADO" →
   385 TSS/sem). A calibracao existe justamente para observar antes de confiar; o LLM, deixado livre,
   gerou ~50% disso (mais seguro).
3. **RECOVERY nao reduz.** Um lesionado cai em RECOVERY (override de lesao, correto), mas o
   `LoadTargetResolver` para fase de contencao so faz `min(target, baseline)` — nao **reduz**. O
   `TaperStrategy` so reduz por proximidade de prova, nao por RECOVERY/lesao.

Os numeros de carga por fase/cold-start nao estavam especificados; este ADR os fixa (calibraveis,
dirigidos depois pelas metricas do shadow numa coorte real). Escopo:
`fix-cold-start-load-model` (split de `fix-cold-start-calibration-plan-generation`). Tudo atras do
flag `planner-engine.enabled` (default false), com carga/distribuicao ja **soft** (estagio 2 →
`FAILED` + `requiresCoachReview`) — ver `planner-engine-enforcement`.

**Precedencia da matriz fail-open (Decisao 3 do enforcement):** "soft → `FAILED` + revisao, sem 422"
vale sob `fail-open=true` (o **default vigente**). Com `fail-open=false`, uma violacao soft vira erro
de dominio (422, nada persistido), conforme a Decisao 3 — este ADR **nao** cria excecao a ela. A
invariante **obrigatoria (hard)** continua fail-closed (422) acima do flag. Portanto "nunca 422" no
cold-start e uma consequencia do default `fail-open=true`, nao uma garantia independente.

## Opções consideradas

1. **Piso fixo no `targetTss`** (ex.: min 150) quando `ctlAtual` colapsa. Simples, mas ignora a
   autodeclaracao (mesma carga p/ iniciante e avancado) e nao trata RECOVERY.
2. **Maintenance do CTL estimado** (`ctlEstimado × 7`, sem rampa). Usa o sinal da autodeclaracao, mas
   prescreve carga de fitness nao observada — risco de lesao no publico exato da calibracao.
3. **Regime cold-start com rampa por estagio de calibracao + cap + reducao de RECOVERY** (escolhida).

## Decisão

Um **regime cold-start** no `LoadTargetResolver`, ativo enquanto o atleta esta **em calibracao**
(stage `OBSERVATION`/`CALIBRATION`/`STABILIZATION`, ate graduar), e uma **reducao de RECOVERY**
transversal.

**Regime cold-start:**
- **CTL usado:** o do `BaselineCalculator` (blend real+heuristica por `proporcaoHeuristica`),
  **capado a ≤ 40** (INTERMEDIARIO) enquanto nao graduou — um "AVANCADO/ELITE" autodeclarado nao
  recebe carga de elite sem dado observado.
- **Rampa por `CalibrationStage`:** `OBSERVATION → 0,60` · `CALIBRATION → 0,75` · `STABILIZATION → 0,90`.
- **Formula:** `targetTss = min(ctlBaseline, 40) × 7 × rampa(stage) × (RECOVERY|POST_RACE ? 0,5 : 1)`.
- **Piso:** 120 TSS/sem, **apenas em fase progressiva** (BASE/BUILD/PEAK/…); nao em contencao.
- **Banda de tolerancia:** **±25%** no cold-start (vs ±10% padrao) — alvo e CTL sao ambos
  estimativas; exigir ±10% de um numero estimado gera `FAILED` espurio. Mantida **soft**.
- **Saida:** ao graduar da calibracao → `LoadTargetResolver` normal (PMC `ctlAtual`, ±10%, sem
  rampa/cap).

**Reducao de RECOVERY/POST_RACE (qualquer atleta, qualquer causa):** fator **×0,5** sobre o baseline
no `LoadTargetResolver`, **distinto** do `TaperStrategy` (taper por `diasParaProva`) e **multiplicativo**
com a rampa do cold-start (novato lesionado = `rampa × 0,5`). Sem piso em contencao.

**Ordenacao no `PROXIMA_SEMANA`:** com `enabled=true`, a redistribuicao/`SessionDayAllocator` roda em
**ambos** os modos (nao so `SEMANA_ATUAL`), aplicando a ordem prescrita (longao ancorado, duras
nao-adjacentes, leve pos-dura); com `enabled=false`, mantem os dias do LLM (preserva CA9).

Justificativa: a rampa por estagio evita o salto abrupto para o maintenance; o cap protege contra
autodeclaracao inflada; a banda ±25% reconhece a incerteza da estimativa sem virar trava dura (a
divergencia continua soft, revisavel pelo coach); a reducao de RECOVERY torna a semana de descarga
real. Os numeros sao um ponto de partida seguro, refinaveis pelas metricas do shadow.

## Consequências

### Positivas
- Cold-start **gera plano coerente** (faixa real, nao `[0,0]`), conservador e progressivo.
- Lesionado recebe semana leve de verdade (RECOVERY reduzida).
- Autodeclaracao inflada nao vira carga perigosa (cap ≤ 40 ate haver dado observado).
- `enabled=false` inalterado (CA9); divergencia continua soft (coach-in-the-loop).

### Negativas / Trade-offs
- Numeros calibrados "no gabinete" (2 atletas semeados): podem sub/superprescrever ate a coorte real
  validar via shadow.
- Durante a calibracao, um atleta que treina forte (PMC imaturo alto) e **sub**-prescrito de proposito
  (direcao segura) ate graduar.
- Rampa por estagio exige threadar `CalibrationStage` + CTL de calibracao ao snapshot do planner
  (`OnboardingContext`) — acoplamento novo entre onboarding e planner.
- O cap fixo em 40 achata a diferenca entre INTERMEDIARIO/AVANCADO/ELITE no cold-start.

## Plano de revisão
Revisar apos a **porta 1 do rollout** (piloto, coorte restrita, ≥ 2 semanas / ≥ 30 planos): calibrar
rampa, cap, ×0,5 e banda ±25% pelas metricas do shadow (`planner.compliance.failure` PRE/POST,
`planner.fallback_legacy`, taxa de `FAILED`/`PASSED` por coorte/fase) e pela rejeicao do coach. Gatilho
de reavaliacao: `FAILED` de cold-start > 30% apos o regime, ou coach rejeitando sistematicamente por
carga.

## Referências
- OpenSpec: `openspec/changes/fix-cold-start-calibration-plan-generation/` (proposal/design/tasks)
- ADR-0011 (composicao deterministica de sessoes por fase) — modelo de carga LINEAR por slot
- `planner-engine-enforcement` (estagios 1/2, matriz fail-open, CA9)
- Evidencia: piloto local 2026-09-11/12 (atletas Hugo/Maria zerados no homelab)
