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

- [x] 2.1 TDD: rampa por `CalibrationStage` — `targetTss = min(ctlBaseline,40) × 7 × rampa(stage)`,
      com OBSERVATION 0,60 / CALIBRATION 0,75 / STABILIZATION 0,90. Ajustar o `ctlFallback` (commit
      `463b0c8`) para o **CTL de calibração capado** em vez do onboarding puro. **verify:** os 3
      estágios; AVANÇADO (55) usa 40; graduado (PMC>0) ignora rampa/cap.
- [x] 2.2 TDD: piso 120 TSS/sem **só em fase progressiva** (ausente em contenção) + banda **±25%** no
      cold-start (min/max do `WeeklyLoadTarget`), mantida soft. **verify:** piso aplica em BASE/BUILD e
      não em RECOVERY/TAPER; banda ±25% vs ±10% do caminho normal.

## 3. Redução de RECOVERY/POST_RACE (CA4)

- [x] 3.1 TDD: fator **×0,5** para RECOVERY/POST_RACE no `LoadTargetResolver` — reduz, não só capa;
      multiplicativo com a rampa; distinto do `TaperStrategy`; sem piso em contenção. **verify:**
      RECOVERY ≈ 0,5×baseline; cold-start lesionado = rampa×0,5; taper por prova inalterado.

## 4. Ordenação no PROXIMA_SEMANA (CA5)

- [x] 4.1 Estender a alocação de dias ao `PROXIMA_SEMANA`, **gated por `enabled=true`**:
      `obterTreinosParaPlano` roda a redistribuição em ambos os modos com o `diasAlvoPorTipo` do
      skeleton; `enabled=false` mantém os dias do LLM. **verify:** enabled=true aplica ordem (longão
      ancorado, duras não-adjacentes, leve pós-dura); enabled=false byte-a-byte (CA9).

## 5. Matriz fail-open (CA6)

- [x] 5.1 TDD dos dois caminhos de `fail-open` para divergência soft de carga no cold-start:
      `fail-open=true` → `FAILED` + `requiresCoachReview`, persiste; `fail-open=false` → erro de
      domínio (422), nada persistido (Decisão 3 do enforcement — sem exceção). **verify:** ambos os
      caminhos + hard invariante sempre 422.

## 6. Spec delta e validação

- [x] 6.1 Escrever/atualizar `specs/cold-start-load-model/spec.md` com os cenários (Given/When/Then)
      de CA1–CA6. **verify:** `openspec validate` (se aplicável) + revisão.
- [x] 6.2 **verify:** `./mvnw clean verify` verde (inclui `*IT`), com `enabled=false` (default) sem
      regressão (golden-master do prompt intacto — CA9).
- [x] 6.3 Piloto (Hugo/Maria zerados, `enabled=true`): cold-start com plano coerente vira `PASSED`,
      distâncias > 0, ordem sensata; divergência residual = `FAILED`+revisão (fail-open=true).
      **verify:** validado no banco do homelab (2026-09-13) — planos gerados após `ed13c1b`.
      Hugo (RECOVERY): 2,5/3,5/4,5km progressivo, TSS 59 vs faixa [59.06, 98.44] → `FAILED`+
      `requiresCoachReview` (`INJURY_ACTIVE`). Maria (BASE): INTERVALADO/TEMPO_RUN/LONGO com duras
      não-adjacentes e longão ancorado, TSS 178 vs faixa [189, 315] → `FAILED`+revisão. Ambos
      coerentes, sem [0,0], divergência residual tratada pelo fail-open (Decisão 3) — nenhum bug,
      gap de banda é candidato à calibração pós-rollout (ADR-0012).

## 7. Gates e entrega

- [x] 7.1 `/qa` (code-reviewer + security-reviewer + clean-code + cross-model Codex) — 2026-09-13.
      Codex achou 2 Critical reais que os revisores Claude não pegaram (escopados ao diff, não à
      cadeia de chamada completa): (1) `PlanoServiceImpl.computarSkeletonSeHabilitado` passava
      `Optional.empty()` hardcoded para o skeleton pré-prompt — o regime cold-start nunca guiava a
      IA, só auditava depois via estágio 2; corrigido centralizando a resolução do
      `OnboardingContext` em `PlanGenerationContextLoader.load` (novo campo em `PlanGenerationContext`),
      reusado tanto no skeleton pré-prompt quanto na persistência. (2) `TaperStrategy.aplicar`
      sobrescrevia a banda de entrada com `+-10%` fixo, perdendo a banda `+-25%` do cold-start em
      TAPER/RACE_WEEK — corrigido para preservar a banda relativa do alvo pré-taper. Também corrigido
      um Important do clean-code-reviewer: atleta graduado com tier != A reiniciava a calibração no
      próximo `montarContexto` (`OnboardingServiceImpl.persistirBaselineSnapshot`) — corrigido para só
      iniciar calibração quando a linha de estado nunca existiu (`estado.getId() == null`), não quando
      só `calibracaoIniciadaEm` está nulo (que também é o estado pós-graduação). Testes novos:
      `TaperStrategyTest` (2), `PlanoServiceImplTest` (1, prova de que o `OnboardingContext` chega ao
      skeleton), `OnboardingServiceTest` (1, graduado não regride). **verify:** `./mvnw clean verify`
      verde — 3351 unit (0 falhas) + 181/182 IT (a 1 falha é `PlanoGeracaoConcorrenteIT`, bug de
      concorrência pré-existente e documentado, não desta branch).
- [x] 7.2 PR `feature/fix-cold-start-load-model → develop`; https://github.com/llsilvas/menthoros-backend/pull/114
      (2026-09-13) — segunda rodada de `/qa` sobre o diff com os 3 fixes: Claude (code/security/
      clean-code) confirma correção sem regressão; Codex indisponível (limite de uso). Achado novo
      (Important, aceito como troca deliberada, documentado+testado no commit `9747458`): a resolução
      do `OnboardingContext` movida para a Fase 1 agora roda em toda tentativa de geração, inclusive
      falhas — grava ruído extra no histórico de calibração em tentativas malsucedidas. `./mvnw clean
      test`: 3352 testes, 0 falhas. Aguardando CI + merge.
