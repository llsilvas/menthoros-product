# Tasks — fix-cold-start-load-model

> Backend (Java/Spring). Trilha Full. Tudo atrás de `planner-engine.enabled` (default false).
> Dependência **resolvida**: enforcement §1–§8 (#109) + calibração (#113) já em `develop`.
> Validar `./mvnw clean verify` antes de entregar. TDD por item.

## 1. Plumbing do estágio de calibração no snapshot

- [x] 1.1 Threadar `CalibrationStage` + o CTL de calibração (baseline blendado, capado ≤ 40) ao
      `OnboardingContext` e ao `PlannerInputSnapshot`, resolvidos antes do prompt. **verify:** teste do
      snapshot com atleta em calibração (stage presente) vs graduado (ausente); sem calibração o campo
      é nulo e o resolver cai no caminho normal (PMC).

## 2. Regime cold-start no LoadTargetResolver (CA1, CA2, CA3)

- [ ] 2.1 TDD: rampa por `CalibrationStage` — `targetTss = min(ctlBaseline,40) × 7 × rampa(stage)`,
      com OBSERVATION 0,60 / CALIBRATION 0,75 / STABILIZATION 0,90. Ajustar o `ctlFallback` (commit
      `463b0c8`) para o **CTL de calibração capado** em vez do onboarding puro. **verify:** os 3
      estágios; AVANÇADO (55) usa 40; graduado (PMC>0) ignora rampa/cap.
- [ ] 2.2 TDD: piso 120 TSS/sem **só em fase progressiva** (ausente em contenção) + banda **±25%** no
      cold-start (min/max do `WeeklyLoadTarget`), mantida soft. **verify:** piso aplica em BASE/BUILD e
      não em RECOVERY/TAPER; banda ±25% vs ±10% do caminho normal.

## 3. Redução de RECOVERY/POST_RACE (CA4)

- [ ] 3.1 TDD: fator **×0,5** para RECOVERY/POST_RACE no `LoadTargetResolver` — reduz, não só capa;
      multiplicativo com a rampa; distinto do `TaperStrategy`; sem piso em contenção. **verify:**
      RECOVERY ≈ 0,5×baseline; cold-start lesionado = rampa×0,5; taper por prova inalterado.

## 4. Ordenação no PROXIMA_SEMANA (CA5)

- [ ] 4.1 Estender a alocação de dias ao `PROXIMA_SEMANA`, **gated por `enabled=true`**:
      `obterTreinosParaPlano` roda a redistribuição em ambos os modos com o `diasAlvoPorTipo` do
      skeleton; `enabled=false` mantém os dias do LLM. **verify:** enabled=true aplica ordem (longão
      ancorado, duras não-adjacentes, leve pós-dura); enabled=false byte-a-byte (CA9).

## 5. Matriz fail-open (CA6)

- [ ] 5.1 TDD dos dois caminhos de `fail-open` para divergência soft de carga no cold-start:
      `fail-open=true` → `FAILED` + `requiresCoachReview`, persiste; `fail-open=false` → erro de
      domínio (422), nada persistido (Decisão 3 do enforcement — sem exceção). **verify:** ambos os
      caminhos + hard invariante sempre 422.

## 6. Spec delta e validação

- [ ] 6.1 Escrever/atualizar `specs/cold-start-load-model/spec.md` com os cenários (Given/When/Then)
      de CA1–CA6. **verify:** `openspec validate` (se aplicável) + revisão.
- [ ] 6.2 **verify:** `./mvnw clean verify` verde (inclui `*IT`), com `enabled=false` (default) sem
      regressão (golden-master do prompt intacto — CA9).
- [ ] 6.3 Piloto (Hugo/Maria zerados, `enabled=true`): cold-start com plano coerente vira `PASSED`,
      distâncias > 0, ordem sensata; divergência residual = `FAILED`+revisão (fail-open=true).
      **verify:** veredito no banco (compliance_status, faixa real) + inspeção dos treinos.

## 7. Gates e entrega

- [ ] 7.1 `/qa` (code-reviewer + security-reviewer + clean-code) sem finding Critical.
- [ ] 7.2 PR `feature/fix-cold-start-load-model → develop`; CI verde; **não** commitar
      `application.yml` com `enabled:true` (enable é por env).
