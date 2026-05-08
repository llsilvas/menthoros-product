# Design — Comprehensive Killer-Level Test Suite para Pace & FC Validation

**Data:** 2026-05-08  
**Status:** Backlog items P2-A, P2-B, P3-A, P3-B já estão **implementados no código**  
**Objetivo:** Validar implementations com cenários reais e edge cases exhaustivos

---

## Executive Summary

O projeto Menthoros possui assertividade na geração de treinos como principal diferencial competitivo. Este documento especifica uma estratégia de testes **killer-level** para validar que as 5 features de validação de FC e Pace funcionam corretamente em:

- **12 atletas fictícios** com profiles realísticos
- **168 treinos individuais** (12 atletas × 14 tipos, incluindo edge cases)
- **5 planos semanais** com distribuição de carga variada
- **Cenários cross-feature** testando interações entre validações
- **Pathological cases** explorando limites fisiológicos

**Investimento:** $55-62 em LLM calls (primeira execução), zero custos em testes subsequentes (fixtures reutilizáveis)

---

## 1. Status Atual das Features

Todas as 5 features estão **implementadas e integradas** no pipeline de validação:

| Feature | Arquivo | Método | Integração | Status |
|---------|---------|--------|-----------|--------|
| P2-A: PaceValidator floor | `PaceValidator.java` | `validar(ritmoAlvo, teto, piso)` | `IaServiceImpl:393` | ✅ Ativo |
| P2-B: Triângulo pace×dist×dur | `IaServiceImpl.java` | `validarTrianguloPaceDuracaoDistancia()` | `IaServiceImpl:417` | ✅ Ativo |
| P3-A: REGENERATIVO struct | `IaServiceImpl.java` | `validarTreinoRegenerativo()` | `IaServiceImpl:359` | ✅ Ativo |
| P3-A: CONTINUO struct | `IaServiceImpl.java` | `validarTreinoContinuo()` | `IaServiceImpl:362` | ✅ Ativo |
| P3-A: TEMPO_RUN struct | `IaServiceImpl.java` | `validarTreinoTempoRun()` | `IaServiceImpl:365` | ✅ Ativo |
| P3-B: Carga semanal | `IaServiceImpl.java` | `validarDistribuicaoCargaSemanal()` | `IaServiceImpl:423` | ✅ Ativo |

**Observação crítica:** O documento backlog original marcava estes como "pendentes", mas estão totalmente implementados. Este design valida se as implementações funcionam corretamente em cenários reais.

---

## 2. Test Athlete Profiles (12 atletas)

Cada atleta representa um padrão fisiológico e comportamental distinto:

### Tier 1: Baseline + Extremos

| ID | Nome | Nível | FCmax | Pace Limiar | Caso de Uso Principal |
|----|------|-------|-------|-------------|----------------------|
| **A1** | Alex | Muito Iniciante | 190 | 7:00/km | Extremo lento (testa floor mínimo) |
| **A2** | Bruno | Intermediário | 180 | 5:30/km | Baseline realístico |
| **A3** | Carla | Avançado | 175 | 4:30/km | Avançado comum |
| **A4** | Diana | Intermediário | 185 | 6:00/km | FC variável, múltiplas zonas |
| **A5** | Eric | Avançado | 178 | 5:00/km | Threshold entre zonas |
| **A6** | Fátima | Elite | 170 | 4:00/km | Extremo rápido (testa ceiling máximo) |

### Tier 2: Edge Cases Patológicos

| ID | Nome | Nível | FCmax | Pace Limiar | Caso de Uso Principal |
|----|------|-------|-------|-------------|----------------------|
| **A7** | Gabriel | Sedentário | 195 | 8:00/km | Extremo lento absoluto (floor absoluto) |
| **A8** | Helena | Master (50+) | 175 | 5:30/km | Idade avançada, recuperação lenta |
| **A9** | Igor | Jovem (18-25) | 185 | 4:45/km | FCmax alto, jovem |
| **A10** | Júlia | Variável | 188 | 6:30/km | Inconsistente: performance flutua |
| **A11** | Kevin | Transição | 192 | 7:30/km | Sedentário→Ativo, melhora rápida |
| **A12** | Laura | Especialista Ultra | 175 | 5:00/km | Ultra-longo extremo (200+km) |

### Justificativa de Cobertura

- **Extremos (Gabriel, Fátima):** Validam limites de floor/ceiling
- **Variáveis (Júlia, Kevin):** Testam robustez com inconsistência
- **Especialistas (Helena, Laura):** Cobrem demografias especiais
- **Múltiplas zonas (Diana):** Exploit boundary conditions entre Z1-Z5

---

## 3. Training Types Coverage (14 tipos por atleta)

### Tier 1: Tipos Padrão (8)

1. **REGENERATIVO** — 20-45 min, Z1-Z2, recuperação
2. **CONTINUO** — 3 etapas, ≥5km, Z2-Z3
3. **FARTLEK** — variação pace, Z2-Z4
4. **TEMPO_RUN** — limiar, Z3-Z4, ≥15 min principal
5. **INTERVALADO** — alta intensidade, Z4-Z5
6. **TIRO** — máxima intensidade, Z5
7. **LONGO** — endurance, validação estrutural
8. **FACIL** — baixa intensidade, recuperação

### Tier 2: Edge Cases (6)

| ID | Tipo | Descrição | Validação Esperada |
|----|------|-----------|-------------------|
| **E1** | REGENERATIVO_CURTO | 10 min (< 20 min mínimo) | Alerta ou falha? |
| **E2** | CONTINUO_CURTO | 2 km (< 5 km mínimo) | Alerta ou falha? |
| **E3** | TEMPO_RUN_CURTO | Principal 10 min (< 15 min) | Alerta ou falha? |
| **E4** | LONGO_EXTREMO | 35+ km (ultra-endurance) | Passa sem alerta? |
| **E5** | INTERVALO_VOLUMOSO | Múltiplos tiros seguidos | Carga semanal alerta? |
| **E6** | TIRO_SEM_DESAQ | Sem etapa DESAQUECIMENTO | Falha estrutural? |

### Total de Cenários Individuais

12 atletas × 14 tipos = **168 treinos individuais**

**Distribuição por atleta:**
- 5 atletas baseline (A1-A5): 8 tipos padrão = 40 treinos
- 1 atleta elite (A6): 8 tipos + 2 edge cases = 10 treinos
- 6 atletas edge (A7-A12): 8 tipos + 4 edge cases cada = 72 treinos
- **Total:** 40 + 10 + 72 = 122 treinos base + 46 edge cases = **168**

---

## 4. Weekly Planning Scenarios (5 planos)

Testes específicos para **P3-B (Distribuição de Carga Semanal)**

### W1 — Ideal Balance

```
SEG: REGENERATIVO      (Z1-Z2, recovery)
TER: TEMPO_RUN         (Z3-Z4, threshold)
QUA: FACIL             (Z1-Z2, easy)
QUI: INTERVALADO       (Z4-Z5, hard)
SEX: FACIL             (Z1-Z2, easy)
SAB: LONGO             (Z2-Z3, aerobic endurance)
DOM: REST              (repouso)
```

**Esperado:** Sem alertas, distribuição balanciada

### W2 — Consecutive Hard (2 dias)

```
SEG: TEMPO_RUN         (hard)
TER: INTERVALADO       (hard) ← consecutivo
QUA: FACIL             (easy)
QUI: REST
...
```

**Esperado:** Alerta de dias duros consecutivos (P3-B)

### W3 — Back-to-Back (3 dias)

```
TER: INTERVALO         (hard)
QUA: TIRO              (hard) ← consecutivo
QUI: TEMPO_RUN         (hard) ← consecutivo
FRI: FACIL             (easy)
...
```

**Esperado:** Alerta crítico (3 duros em sequência)

### W4 — Overload (5 duros em 5 dias)

```
SEG: LONGO             (hard)
TER: INTERVALO         (hard)
QUA: TEMPO_RUN         (hard)
QUI: TIRO              (hard)
SEX: LONGO             (hard)
SAB: REST
DOM: REST
```

**Esperado:** Múltiplos alertas críticos (overtraining risk)

### W5 — Underload (sem estímulo intenso)

```
TER: FACIL             (easy)
QUI: FACIL             (easy)
SAB: FACIL             (easy)
```

**Esperado:** Alerta de volume insuficiente (hipótese: implementação detecta isso?)

---

## 5. Cross-Feature Interaction Scenarios

Testes validando múltiplas features em conjunto:

| ID | Nome | Features | Descrição | Validação |
|----|------|----------|-----------|-----------|
| **C1** | Floor + Triangle | P2-A + P2-B | TEMPO_RUN com pace no floor **E** triângulo desbalanceado | Ambas validações acionam? Corretamente? |
| **C2** | Structure + Load | P3-A + P3-B | TEMPO_RUN principal muito curto **E** consecutivo com INTERVALO | Estrutura falha? Carga alerta? |
| **C3** | Triangle + Structure | P2-B + P3-A | CONTINUO com triângulo inconsistente **E** distância < 5km | Triângulo alerta? Estrutura falha? |
| **C4** | Multiple Structures | P3-A | REGEN > 45 min **E** CONTINUO < 5km no mesmo plano semanal | Ambos alertam independentemente? |
| **C5** | Full Integration | P2-A + P2-B + P3-A + P3-B | Plano W4 (overload) **COM** treinos com triângulos desbalanceados **E** estruturas borderline | Cascata de validações funciona? |

---

## 6. Pathological Edge Cases (8 casos)

Cenários que exploram limites da implementação:

### E1: Atleta muito lento em treino rápido

**Setup:** Gabriel (8:00/km limiar) prescrito em INTERVALADO (deveria ser 4:30-5:30/km)

**Validações:**
- P2-A: Floor bloqueia? (ritmoAlvo < floor)
- P3-A: Estrutura de INTERVALO válida? (etapas corretas?)
- **Esperado:** Floor bloqueia OU alerta crítico

### E2: Atleta elite em treino fácil

**Setup:** Fátima (4:00/km limiar) prescrita em REGENERATIVO (deveria ser Z1-Z2, ~6:00-7:00/km)

**Validações:**
- P2-B: Triângulo OK (pode ser rápido em qualquer treino)
- P3-A: REGEN estrutura OK
- **Esperado:** Passa sem alerta (não há limite inferior fisiológico para rápido em fácil)

### E3: Atleta especialista ultra em treino explosivo

**Setup:** Laura (ultra 200+ km) prescrita em TIRO (contraindicado fisiologicamente)

**Validações:**
- P3-A: TIRO estructura OK
- **Esperado:** Passa na validação (LLM poderia ter razão em casos edge raros)

### E4: Atleta com FC inconsistente

**Setup:** Júlia: primeira leitura FCmax=188, segunda=185, terceira=190

**Validações:**
- Zonas FC: Como calcula com FCmax inconsistente?
- P2-A: Floor/ceiling mudam? Piso/teto recalculam?
- **Esperado:** Usa última leitura OU média OU conservador (máximo FCmax)

### E5: Atleta em transição rápida

**Setup:** Kevin: Dia 1 prescreve 7:30/km (sedentário), Dia 8 prescreve 6:00/km (ativo agora)

**Validações:**
- P2-A: Floor e teto recalculam com histórico em movimento?
- **Esperado:** Piso/teto ajustam conforme progresso detectado

### E6: Treino sem etapa PRINCIPAL

**Setup:** TreinoPlanejadoLlmDto com etapas = [AQUECIMENTO, DESAQUECIMENTO] (2 etapas)

**Validações:**
- P3-A: CONTINUO/REGEN/TEMPO_RUN estrutura falha? (esperado 3)
- **Esperado:** Falha com exceção LLMException

### E7: Triângulo matemático impossível

**Setup:** Ritmo=0 km, duração=0 min (parser robustez)

**Validações:**
- P2-B: Parser não crasha em 0/0?
- **Esperado:** Valida sem exceção, maybe warning apenas

### E8: FC prescrita fora de todas as zonas

**Setup:** Atleta com zonas [Z4=150-160 bpm], treino prescreve 175 bpm

**Validações:**
- P2-A (floor/ceiling): 175 > Z5max? 
- Sobreposição 50%: Suficiente ou deve ser 70% para Z5?
- **Esperado:** Alerta se fora de sobreposição mínima

---

## 7. Fixture Structure

```
apps/menthoros-backend/src/test/resources/fixtures/
├── athletes/
│   ├── a1-alex-muito-iniciante.json      (190 FCmax, 7:00 limiar)
│   ├── a2-bruno-intermediario.json       (180 FCmax, 5:30 limiar)
│   ├── ... (12 total)
│   └── a12-laura-especialista-ultra.json (175 FCmax, 5:00 limiar)
│
├── training-plans/
│   ├── individual/
│   │   ├── a1-regenerativo.json          (LLM response, gravado uma vez)
│   │   ├── a1-continuo.json
│   │   ├── a6-longo-extremo.json         (edge case)
│   │   ├── a7-gabriel-intervalo.json     (pathological)
│   │   └── ... (168 total)
│   │
│   └── weekly-plans/
│       ├── w1-ideal-balance.json         (plano semanal ideal)
│       ├── w2-consecutive-hard.json      (2 dias duros)
│       ├── w3-back-to-back.json          (3 dias duros)
│       ├── w4-overload-critical.json     (5 dias duros)
│       └── w5-underload.json             (sem estímulo)
│
├── validation-matrix.json                 # Mapeamento: cenário → assertions esperadas
│   {
│     "a1-regenerativo": {
│       "expectedPasses": ["P3A-REGENERATIVO-STRUCTURE"],
│       "expectedAlerts": ["P2A-FLOOR-ADJUSTED"],
│       "expectedFailures": []
│     },
│     ...
│   }
│
└── edge-cases-pathological.json           # Catalogo de edge cases
    {
      "e1-atlas-lento-em-intervalo": {
        "athlete": "a7-gabriel",
        "trainingType": "INTERVALADO",
        "expectedValidationFailure": true,
        "reason": "Floor validation should block or alert"
      },
      ...
    }
```

---

## 8. Test Class Organization

Novo arquivo: `IaServiceImplRealWorldScenariosTest.java`

### Structure

```java
@ExtendWith(MockitoExtension.class)
@DisplayName("IaServiceImpl — Real-World Scenario Validation (Killer-Level)")
class IaServiceImplRealWorldScenariosTest {

    private IaServiceImpl service;
    private Map<String, AtletaFixture> atletas;
    private Map<String, TreinoPlanejadoLlmDto> treinos;

    @BeforeEach
    void setUp() {
        // Load all 12 athlete fixtures
        atletas = loadAthletesFromFixtures();
        // Load all 168 training plans
        treinos = loadTrainingPlansFromFixtures();
    }

    // ===== P2-A: Floor Validation =====
    
    @Nested
    @DisplayName("P2-A: PaceValidator Floor (Piso)")
    class P2AFloorValidationKiller {

        @ParameterizedTest(name = "{0} em {1}")
        @CsvSource({
            "a1,TEMPO_RUN",          // Iniciante lento em tempo
            "a7,INTERVALO",          // Gabriel extremo lento em intervalo (deve falhar)
            "a3,FARTLEK",            // Avançado em fartlek
            "a6,REGENERATIVO"        // Elite em regen (muito rápido para regen?)
        })
        @DisplayName("Validar piso não força pace acima do real")
        void pisoNaoForcaPaceAcimaDoReal(String atletaId, String tipoTreino) {
            // Load athlete + training
            // Assert: pace mantém mínimo realista
        }

        @Test
        @DisplayName("Gabriel (extremo lento 8:00/km) em INTERVALO → alerta crítico")
        void gabrielEmIntervalado_alertaCritico() {
            // Should trigger P2-A floor validation
            // pace may be adjusted OR exception thrown
        }

        @Test
        @DisplayName("Kevin em transição → piso recalcula com progresso")
        void kevinEmTransicao_pisoRecalcula() {
            // Day 1: 7:30/km limiar
            // Day 8: 6:00/km (progresso detectado?)
            // Assert: piso ajustado
        }

        @Test
        @DisplayName("Piso absoluto >= 0:30/km (nunca menos)")
        void pisoAbsolutoNuncaMenosQue030kmMin() {
            // Even for extremamente slow athletes
        }
    }

    // ===== P2-B: Triangle Validation =====
    
    @Nested
    @DisplayName("P2-B: Triangle Pace × Distance × Duration")
    class P2BTriangleValidationKiller {

        @ParameterizedTest(name = "{0} {1}: {2}")
        @CsvSource({
            "a2,CONTINUO,consistent",      // Dentro 20%
            "a2,CONTINUO,plus20pct",       // +20% desvio
            "a2,CONTINUO,minus20pct"       // -20% desvio
        })
        void validarTrianguloPaceDuracaoDistancia(String atletaId, String tipo, String variacao) {
            // Load and validate
            // Assert: dentro 20% passa, fora alerta
        }

        @Test
        @DisplayName("Zero km × indefinido min → parser robusto (E7)")
        void triangleZeroKm_parserRobusto() {
            // Should not crash
        }

        @Test
        @DisplayName("Fracionários em minutos processados com precisão")
        void fractionalMinutesProcessedPrecisely() {
            // E.g., "12:30" = 12.5 min
        }
    }

    // ===== P3-A: Structural Validation =====
    
    @Nested
    @DisplayName("P3-A: Structural Validation (REGEN, CONTINUO, TEMPO_RUN)")
    class P3AStructuralValidationKiller {

        @Test
        @DisplayName("REGENERATIVO: 3 etapas, 20-45 min, Z1-Z2")
        void regenerativoEstruturaPerfeit() {
            // a2-regenerativo fixture
            // Assert: 3 stages, duration 20-45, FC in Z1-Z2
        }

        @Test
        @DisplayName("REGENERATIVO: acima 45 min → alerta (E1)")
        void regenerativoAcima45Min_alerta() {
            // Should warn if duration > 45 min
        }

        @Test
        @DisplayName("REGENERATIVO: sem PRINCIPAL → falha (E6)")
        void regenerativoSemPrincipal_falha() {
            // Should throw LLMException
        }

        @Test
        @DisplayName("CONTINUO: 3 etapas, >= 5 km")
        void continuoEstrAturaPerfeita() {
        }

        @Test
        @DisplayName("CONTINUO: abaixo 5 km → alerta (E2)")
        void continuoAbaixo5km_alerta() {
        }

        @Test
        @DisplayName("TEMPO_RUN: PRINCIPAL >= 15 min, FC em Z3-Z4, ritmo ±10% limiar")
        void tempoRunEstruturaPerfeit() {
        }

        @Test
        @DisplayName("TEMPO_RUN: PRINCIPAL < 15 min → alerta (E3)")
        void tempoRunPrincipalMenos15min_alerta() {
        }

        @Test
        @DisplayName("TEMPO_RUN: ritmo > 10% acima limiar → alerta")
        void tempoRunRitmoAcimaLimiar10pct_alerta() {
        }
    }

    // ===== P3-B: Weekly Load Distribution =====
    
    @Nested
    @DisplayName("P3-B: Weekly Load Distribution")
    class P3BWeeklyLoadDistributionKiller {

        @Test
        @DisplayName("W1 Ideal: sem alertas")
        void w1Ideal_semAlertas() {
            // Load w1-ideal-balance.json weekly plan
            // Assert: no alerts
        }

        @Test
        @DisplayName("W2 Consecutive: 2 dias duros consecutivos → alerta")
        void w2ConsecutiveHard_alerta() {
            // TER: TEMPO_RUN (hard)
            // QUA: INTERVALO (hard) ← consecutivo
            // Assert: alert triggered
        }

        @Test
        @DisplayName("W3 BackToBack: 3 dias duros consecutivos → alerta crítico")
        void w3BackToBack_alertaCritico() {
            // TER-QUA-QUI: INTERVALO, TIRO, TEMPO_RUN
            // Assert: critical alert
        }

        @Test
        @DisplayName("W4 Overload: 5 duros em 5 dias → múltiplos alertas")
        void w4Overload_multiplasAlertas() {
            // SEG-QUI: all hard trainings
            // Assert: multiple alerts, overtraining risk flagged
        }

        @Test
        @DisplayName("W5 Underload: sem estímulo intenso → alerta volume")
        void w5Underload_alertaVolume() {
            // Only FACIL trainings
            // Assert: volume alert (if implemented)
        }
    }

    // ===== Cross-Feature Interactions =====
    
    @Nested
    @DisplayName("Cross-Feature Interactions")
    class CrossFeatureInteractionKiller {

        @Test
        @DisplayName("C1: Floor + Triangle juntos")
        void c1_floorAndTriangleTogether() {
            // TEMPO_RUN: pace no floor AND triângulo inconsistente
            // Assert: ambas validações disparam corretamente
        }

        @Test
        @DisplayName("C2: Structure + Load juntos")
        void c2_structureAndLoadTogether() {
            // TEMPO_RUN principal curto E consecutivo com INTERVALO
            // Assert: estrutura e carga alertam independentemente
        }

        @Test
        @DisplayName("C5: Full integration (W4 + triangles + structures)")
        void c5_fullIntegration() {
            // W4 overload plan COM treinos desbalanceados COM estruturas borderline
            // Assert: cascata de validações funciona
        }
    }

    // ===== Pathological Cases =====
    
    @Nested
    @DisplayName("Pathological Edge Cases")
    class PathologicalEdgeCases {

        @Test
        @DisplayName("E1: Gabriel (8:00/km) em INTERVALO → floor bloqueia")
        void e1_gabrielEmIntervalo() {
        }

        @Test
        @DisplayName("E2: Fátima (4:00/km elite) em REGEN → passa OK")
        void e2_fatimaEmRegen() {
        }

        @Test
        @DisplayName("E4: Júlia inconsistente (FCmax 185-190) → zona robusta")
        void e4_juliaInconsistente() {
        }

        @Test
        @DisplayName("E5: Kevin em transição → piso/teto recalculam")
        void e5_kevinEmTransicao() {
        }

        @Test
        @DisplayName("E7: Triângulo 0/0 → parser não crasha")
        void e7_trianguloZero() {
        }

        @Test
        @DisplayName("E8: FC fora de zonas → alerta sobreposição")
        void e8_fcForaDasZonas() {
        }
    }
}
```

---

## 9. Fixture Generation Process (One-Time)

### Phase 1: Create Athlete Fixtures

**Input:** 12 athlete profiles (FCmax, pace limiar, nível, etc)

**Output:** `fixtures/athletes/*.json`

```json
{
  "athleteId": "a1-alex",
  "name": "Alex",
  "level": "MUITO_INICIANTE",
  "fcMax": 190,
  "paceLimiar": "7:00/km",
  "fcLthr": 152,
  "zonas": [
    {"zona": 1, "label": "Z1", "min": 120, "max": 144},
    ...
  ]
}
```

**Cost:** $0 (manual input)  
**Time:** 1h

### Phase 2: Generate Training Plans via LLM

**Process:**
1. For each athlete (12) × type (14): Call OpenAI GPT-4 mini
2. Prompt template:
   ```
   Gere um treino de tipo {TIPO} para atleta com:
   - FCmax: {FCMAX}
   - Pace limiar: {PACE_LIMIAR}
   - Nível: {NIVEL}
   
   Retorne JSON: TreinoPlanejadoLlmDto
   ```
3. Save response as fixture

**Total calls:** 168 (12 × 14)  
**Model:** GPT-4 mini (cheaper than GPT-4, still high quality)  
**Cost:** ~$45-50 (est. $0.30 per call)  
**Time:** ~30 min (parallelizable)

### Phase 3: Generate Weekly Plans via LLM

**Process:**
1. For each weekly scenario (5): Call LLM with 7-day weekly structure
2. Prompt template:
   ```
   Gere um plano semanal para atleta {ID} com estrutura:
   {W1|W2|W3|W4|W5}
   
   Retorne JSON: PlanoSemanalLlmDto
   ```

**Total calls:** 5  
**Cost:** ~$10-12  
**Time:** ~15 min

---

## 10. Budget & Timeline

| Phase | Action | Cost | Time | Parallelizable |
|-------|--------|------|------|---|
| **1** | Create 12 athlete fixtures | $0 | 1h | N/A |
| **2** | Generate 168 training plans (LLM) | $45-50 | 30 min | ✅ Yes (batch) |
| **3** | Generate 5 weekly plans (LLM) | $10-12 | 15 min | ✅ Yes |
| **4** | Create test class + assertions | $0 | 2-3h | N/A |
| **5** | Validation + debugging | $0 | 1-2h | N/A |
| **6** | Documentation + review | $0 | 1h | N/A |
| **TOTAL** | | **$55-62** | **5.5-7.5h** | ~5h actual |

---

## 11. Success Criteria

A test é considerada **passed** quando:

1. ✅ Todos os 168 treinos individuais + 5 weekly plans carregam fixtures sem erro
2. ✅ P2-A (floor): Gabriel em INTERVALO dispara alerta/falha; atletas normais passam
3. ✅ P2-B (triangle): Desvios > 20% geram alertas; < 20% passam
4. ✅ P3-A (structure): Etapas corretas passam; ausentes/fora de ordem falham
5. ✅ P3-B (load): W1 sem alertas; W2-W4 geram alertas progressivos; W5 detecta underload
6. ✅ Cross-feature: Múltiplas validações disparam corretamente juntas
7. ✅ Edge cases: Nenhum crash em casos patológicos; comportamento documentado
8. ✅ Fixtures reutilizáveis: Testes rodabm sem custo após geração inicial

---

## 12. Scope & Non-Scope

### In Scope

- ✅ Validação de 5 features (P2-A, P2-B, P3-A, P3-B, P3-A variantes)
- ✅ 12 atletas fictícios realísticos
- ✅ 168 treinos individuais + 5 weekly plans
- ✅ Edge cases patológicos
- ✅ Fixtures reutilizáveis
- ✅ Testes paramétricos integrados

### Out of Scope (Next Phase)

- ❌ Performance testing (1000+ treinos simultâneos)
- ❌ Stress testing (LLM failure modes)
- ❌ Integração com Strava/dashboard
- ❌ Geração automática de athletes (manual agora)
- ❌ Teste de custo/performance de LLM

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM gera treinos inválidos | Testes baseados em lixo | Valide fixtures antes de usar; regenre se necessário |
| Fixtures muito grandes | Slow test suite | Compress fixtures; use `@TempDir` cache |
| Cross-feature failures | Debugging complexo | Testes isolados por feature + cross-feature separado |
| Zone boundary cases | Validação imprecisa | Testa athletes em threshold entre zonas (Diana, Eric) |
| Floating point precision | Pace/duração inconsistência | Use BigDecimal; test rounding cases |

---

## 14. Next Steps (After Approval)

1. **Writing-Plans skill** → detailed implementation plan
2. **Execution:**
   - Phase 1-3: Generate fixtures ($55-62, 2h)
   - Phase 4-6: Build test suite (4-5h)
3. **Validation:** Run full test suite; document results
4. **Integration:** Merge to develop branch (feature/pace-fc-validation-comprehensive-tests)
5. **Deployment:** Fixtures become permanent reference

---

## Appendix A: Athlete Profiles (Detailed)

### A1: Alex (Muito Iniciante)

```json
{
  "athleteId": "a1-alex",
  "name": "Alex",
  "age": 35,
  "experience": "MUITO_INICIANTE",
  "fcMax": 190,
  "restingHR": 70,
  "fcLthr": 152,
  "paceLimiar": "7:00/km",
  "recentBests": {
    "5km": "8:30/km",
    "10km": "8:15/km",
    "21km": "8:00/km"
  },
  "trainingDays": 3,
  "notes": "Retornando ao treinamento, zona confortável é Z1-Z2"
}
```

_(Similar detailed fixtures for A2-A12)_

---

## Appendix B: Validation Matrix (Sample)

```json
{
  "a1-regenerativo": {
    "athleteId": "a1-alex",
    "trainingType": "REGENERATIVO",
    "trainingFile": "fixtures/training-plans/individual/a1-regenerativo.json",
    "expectedValidations": {
      "P3A_REGENERATIVO_STRUCTURE": "PASS",
      "P3A_DURATION_20_45": "PASS",
      "P3A_FC_IN_Z1_Z2": "PASS",
      "P2A_FLOOR": "PASS",
      "P2B_TRIANGLE": "PASS"
    },
    "expectedAlerts": [],
    "expectedFailures": []
  },
  "a7-gabriel-intervalo": {
    "athleteId": "a7-gabriel",
    "trainingType": "INTERVALADO",
    "trainingFile": "fixtures/training-plans/individual/a7-gabriel-intervalo.json",
    "expectedValidations": {
      "P3A_INTERVALO_STRUCTURE": "PASS"
    },
    "expectedAlerts": [
      "P2A_FLOOR_VIOLATION: Gabriel pace limiar too slow for INTERVALO"
    ],
    "expectedFailures": [
      "P2A: pace must be adjusted or exception thrown"
    ]
  }
}
```

---

**Documento aprovado em:** _(aguardando)_  
**Versão:** 1.0  
**Autor:** Claude Code  
**Data de Criação:** 2026-05-08
