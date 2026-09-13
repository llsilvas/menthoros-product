# Cold-start load model

Contrato do alvo de carga semanal para atleta em calibração e da redução de contenção por
RECOVERY/POST_RACE, além da extensão da alocação de dias ao modo próxima-semana. Números canônicos no
ADR-0012. Tudo atrás de `planner-engine.enabled` (default false); carga/distribuição são soft (estágio
2) por `planner-engine-enforcement`.

## ADDED Requirements

### Requirement: Alvo de carga rampado no cold-start (CA1, CA2, CA3)

O sistema SHALL, para atleta em calibração (com `CalibrationStage` presente), derivar o alvo semanal
como `targetTss = min(ctlBaseline, 40) × 7 × rampa(stage) × fatorContencao`, onde `ctlBaseline` é o CTL
do baseline blendado, `rampa` é 0,60 (OBSERVATION) / 0,75 (CALIBRATION) / 0,90 (STABILIZATION), e
`fatorContencao` é 0,5 em RECOVERY/POST_RACE e 1 nas demais. SHALL aplicar piso de 120 TSS/sem apenas
em fase progressiva e banda de tolerância ±25% (min/max) no cold-start. SHALL, ao graduar da
calibração, usar o caminho normal (CTL de PMC, banda ±10%, sem rampa/cap).

#### Scenario: Rampa por estágio
- **Given** um atleta em calibração no estágio CALIBRATION com CTL de baseline 30
- **When** o alvo de carga é resolvido em fase BASE
- **Then** `targetTss` = min(30,40) × 7 × 0,75 = 157,5 (± banda de 25%)

#### Scenario: Cap do CTL protege contra autodeclaração inflada
- **Given** um atleta AVANÇADO em calibração com CTL de baseline estimado 55
- **When** o alvo é resolvido
- **Then** o cálculo usa CTL 40 (não 55) enquanto não graduar

#### Scenario: Graduado ignora rampa e cap
- **Given** um atleta que concluiu a calibração e tem CTL de PMC 45
- **When** o alvo é resolvido
- **Then** usa 45 × 7, banda ±10%, sem rampa nem cap

#### Scenario: Piso só em fase progressiva
- **Given** um alvo rampado que resultaria abaixo de 120 TSS em fase BASE
- **When** o alvo é resolvido
- **Then** o alvo é elevado ao piso de 120; em RECOVERY o piso não se aplica

### Requirement: Redução de RECOVERY/POST_RACE (CA4)

O sistema SHALL reduzir o alvo de carga em RECOVERY e POST_RACE por um fator 0,5 sobre o baseline,
multiplicativo com a rampa do cold-start e distinto do taper por prova (`TaperStrategy`), sem aplicar
piso de contenção.

#### Scenario: RECOVERY reduz de verdade
- **Given** um atleta com baseline 280 em fase RECOVERY (fora de calibração)
- **When** o alvo é resolvido
- **Then** `targetTss` ≈ 140 (0,5 × 280)

#### Scenario: Cold-start lesionado empilha rampa e redução
- **Given** um atleta em calibração (STABILIZATION) e lesão ativa (fase RECOVERY), CTL baseline 40
- **When** o alvo é resolvido
- **Then** `targetTss` = 40 × 7 × 0,90 × 0,5

### Requirement: Alocação de dias no PROXIMA_SEMANA sob enforcement (CA5)

O sistema SHALL, com `planner-engine.enabled=true`, aplicar a alocação de dias do skeleton
(`SessionDayAllocator`: longão ancorado, sessões duras não-adjacentes, leve pós-dura) também no modo
PROXIMA_SEMANA, e SHALL, com `enabled=false`, preservar os dias gerados pelo LLM byte-a-byte.

#### Scenario: Ordem aplicada com flag ligado
- **Given** `enabled=true` e um plano PROXIMA_SEMANA com longão e duas sessões duras
- **When** o plano é montado
- **Then** o longão fica no dia preferido/ancorado e as duras não ficam em dias consecutivos

#### Scenario: Flag desligado preserva o legado
- **Given** `enabled=false`
- **When** um plano PROXIMA_SEMANA é montado
- **Then** os dias são os gerados pelo LLM, sem redistribuição

### Requirement: Precedência da matriz fail-open (CA6)

O sistema SHALL tratar divergência residual de carga/distribuição no cold-start como violação **soft**
segundo a Decisão 3 de `planner-engine-enforcement`: com `fail-open=true` (default) persiste `FAILED` +
`requiresCoachReview`; com `fail-open=false` retorna erro de domínio (422) sem persistir. SHALL NOT
criar exceção à matriz; invariante obrigatória (hard) permanece fail-closed.

#### Scenario: Divergência soft com fail-open ligado
- **Given** `fail-open=true` e um plano cold-start fora da faixa de carga
- **When** o estágio 2 avalia
- **Then** o plano persiste com `compliance_status=FAILED` e `requiresCoachReview=true`, sem 422

#### Scenario: Divergência soft com fail-open desligado
- **Given** `fail-open=false` e o mesmo plano
- **When** o estágio 2 avalia
- **Then** retorna erro de domínio (422) e nada é persistido
