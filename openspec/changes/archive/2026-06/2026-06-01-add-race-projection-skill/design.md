## Context

A `RaceProjectionSkill` segue o contrato de skills definido em `introduce-domain-skills-architecture`. É acionada on-demand pelo coach, executa uma pipeline determinística de 3 camadas e delega ao LLM apenas a geração de texto narrativo. O modelo LLM principal é Claude Haiku 4 (custo mínimo, latência baixa); fallback para Claude Sonnet 4.

Stack: Spring Boot 3.5.14 / Java 21 / Spring AI / PostgreSQL / commons-math3 3.6.1.

**Pacote base da skill:** `br.com.menthoros.backend.skills.race`

## Goals

- Projetar tempos para 5k, 10k, 21k, 42k (e distâncias customizadas) com 3 camadas determinísticas auditáveis
- Sinalizar confiança explícita (LOW/MEDIUM/HIGH) baseada em qualidade dos dados de entrada
- Persistir cada projeção como snapshot imutável (`tb_race_projection_snapshot`)
- Permitir ao coach marcar uma projeção como "oficial" para que o atleta visualize a evolução
- Entregar gap analysis coach-only comparando projeção vs meta definida pelo coach
- Latência P95 < 2.5s; custo < $0.0007 por chamada

## Non-Goals

- Projeções automáticas/agendadas (trigger é sempre on-demand pelo coach na v0.1)
- Sugestão de ajuste de meta ao atleta (coach decide — sistema só reporta o gap)
- Ingestão automática de splits via Garmin/Strava (v0.2)
- Simulação Monte Carlo / Digital Twin (v1.0)
- Modelo de ML para refinamento de expoente de Riegel por atleta (v1.0)

## Decisions

### D1: Todo o cálculo numérico é determinístico — LLM gera apenas texto

A pipeline não pede ao LLM que projete tempos. Os números são calculados nas 3 camadas e passados como contexto estruturado para o LLM, que retorna somente `progression_narrative`, `key_assumptions`, e `coach_note`. Isso garante auditabilidade e elimina alucinação numérica.

### D2: Confiança é o mínimo entre Camada 1 e Camada 2

`overall_confidence = min(confidence_regression, confidence_riegel_calibration)`

- Camada 1 (regressão): HIGH se R² ≥ 0.7; MEDIUM se R² ≥ 0.4; LOW se R² < 0.4 ou < 6 sessões
- Camada 2 (Riegel): CALIBRATED se 2+ provas históricas em distâncias distintas; DEFAULT (reduz confiança em 1 nível) se apenas expoente padrão 1.06

Confiança LOW não bloqueia a skill — o coach decide se usa a projeção mesmo assim.

### D3: Riegel com calibração opcional por histórico de provas

Expoente padrão `1.06`. Se o atleta tem 2+ provas em distâncias distintas, calibrar via `exponent = log(t2/t1) / log(d2/d1)` com média ponderada por recência (provas < 12 meses têm peso 2x). Isso é opcional — sem histórico, expoente padrão com sinalizador `riegel_calibrated=false`.

### D4: Camada 3 aplica fator multiplicativo ao tempo projetado

Seis cenários mapeados diretamente a fases de periodização e faixas de TSB projetado. Fator mais agressivo: TAPER ótimo (0.975 = ganho 2.5%). Fator mais conservador: TSB < -15 / FATIGUED (1.08 = penalidade 8%). Os fatores são explicitados na `coach_note` para transparência.

### D5: Snapshots append-only — nenhuma projeção é descartada

`tb_race_projection_snapshot` nunca tem UPDATE ou DELETE. Cada chamada gera um novo registro. Coach marca uma projeção como oficial (`is_official=true`). A regra "no máximo uma oficial por atleta/prova" é garantida **exclusivamente via código**: antes de marcar uma nova projeção como oficial, executar `UPDATE ... SET is_official=false WHERE athlete_id=X AND race_id=Y AND is_official=true`. Não há constraint UNIQUE declarativa — ver `tasks.md` item 7.1 e 7.4.

### D6: Atleta vê apenas projeções oficiais revisadas pelo coach

Dois predicados obrigatórios para expor ao atleta: `is_official=true` AND `coach_reviewed_at IS NOT NULL`. A view do atleta omite confiança numérica, gap de meta e coach_note. Dashboard mostra evolução temporal das projeções oficiais com delta visual (negativo = melhora).

### D7: Atleta sem dados de FC usa pace bruto com confiança LOW

Não bloquear a skill. Registrar `key_assumption`: "Normalização de pace por FC não disponível — projeção baseada em pace bruto. Confiança reduzida." Confiança forçada para LOW independente do R². Documentado em resposta a `oq_004`.

### D8: Gap analysis é coach-only e factual — sem sugestão de ajuste de meta

`GoalGapAnalysis` é retornado apenas quando `coach_goal_override` é fornecido. Thresholds:
- ON_TRACK: gap ≤ 2% (dentro da margem de erro da projeção)
- REACHABLE: gap 2–5% (possível com boa preparação)
- STRETCH: gap 5–10% (exige tudo correr bem)
- UNLIKELY: gap > 10% (gap significativo vs forma atual)

Tom do `coach_note_gap`: factual. Exemplo: "Projeção atual: 1h52. Meta: 1h45 (gap 6.3% — STRETCH)." Sem recomendação de ajuste.

### D9: Anchor time da Camada 2 em ordem de prioridade

1. Pace projetado pela Camada 1 × distância-alvo mais próxima treinada
2. Melhor prova recente (< 12 meses) na distância mais próxima
3. Pace de treino TEMPO × fator conservador 1.05

Primeira fonte disponível vence. Registrado em `metadata.anchor_source` para auditoria.

### D10: commons-math3 para regressão OLS

`OLSMultipleLinearRegression` do `commons-math3:3.6.1` para regressão linear simples (x=semana_ordinal, y=normalized_pace). Já pode estar no classpath via Spring; se não, adicionar dependência. Alternativa (`SimpleRegression` do mesmo pacote) também válida para univariada.

## Architecture

```
Coach aciona "Gerar Projeção de Prova"
        │
        ▼
RaceProjectionSkill.execute(RaceProjectionInput)
        │
        ├── [Camada 1] PaceRegressionCalculator
        │   ├── filtrar treinos TEMPO + LONG (mín 6 sessões, 8–12 semanas)
        │   ├── normalizar pace: pace / (avg_hr / lactate_threshold_hr)
        │   ├── OLSMultipleLinearRegression → slope, r_squared, projected_pace
        │   └── → RegressionResult (confidence_layer1)
        │
        ├── [Camada 2] RiegelCalculator
        │   ├── calibrar expoente (se 2+ provas históricas)
        │   ├── anchor_time via prioridade D9
        │   ├── t2 = t1 * (d2/d1)^exponent para cada target_distance
        │   └── → Map<distance, base_time_sec> + calibration_quality
        │
        ├── [Camada 3] PeriodizationAdjuster
        │   ├── mapear (phase, tsb_projected) → factor + rationale_key
        │   └── → Map<distance, adjusted_time_sec> + adjustment_factor
        │
        ├── [LLM] RaceProjectionNarrativeGenerator (Claude Haiku 4)
        │   ├── input: JSON com resultados das 3 camadas + perfil
        │   ├── output: progression_narrative + key_assumptions + coach_note
        │   └── fallback: Claude Sonnet 4
        │
        ├── [Persistence] RaceProjectionSnapshotRepository
        │   └── save(tb_race_projection_snapshot) — append-only
        │
        └── → RaceProjectionOutput
                ├── projections: Map<distance, RaceProjection>
                ├── progression_narrative, key_assumptions, coach_note
                ├── ctl_forecast, goal_gap_analysis (if override provided)
                └── metadata (embutido no snapshot)
```

## Key Interfaces

```java
// Pacote: br.com.menthoros.backend.skills.race

// Contrato da skill
public class RaceProjectionSkill {
    public RaceProjectionOutput execute(RaceProjectionInput input) { ... }
}

// Camada 1
public class PaceRegressionCalculator {
    public RegressionResult calculate(List<WorkoutSummary> workouts, Integer maxHr) { ... }
}

// Camada 2
public class RiegelCalculator {
    public RiegelResult calculate(RegressionResult regression,
                                  List<PastRace> raceHistory,
                                  List<Integer> targetDistances) { ... }
}

// Camada 3
public class PeriodizationAdjuster {
    public AdjustmentResult adjust(Map<Integer, Long> baseTimes,
                                   PeriodizationPhase phase,
                                   Double projectedTsb) { ... }
}

// Gerador de narrativa LLM
public class RaceProjectionNarrativeGenerator {
    public NarrativeResult generate(RaceProjectionNarrativeContext ctx) { ... }
}
```

## Data Model

```sql
-- =====================================================================
-- Vxx: Cria tb_race_projection_snapshot para snapshots imutáveis de projeção
-- =====================================================================
CREATE TABLE IF NOT EXISTS tb_race_projection_snapshot (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id                  UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    race_id                     UUID REFERENCES tb_prova(id) ON DELETE SET NULL,
    tenant_id                   UUID NOT NULL,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    weeks_to_race_at_generation INTEGER,
    projections_json            JSONB NOT NULL,
    confidence                  VARCHAR(10) NOT NULL,               -- LOW|MEDIUM|HIGH
    is_official                 BOOLEAN NOT NULL DEFAULT FALSE,
    coach_id                    UUID NOT NULL,
    coach_reviewed_at           TIMESTAMPTZ,
    ctl_at_generation           DECIMAL(6,2),
    tsb_at_generation           DECIMAL(6,2),
    regression_r_squared        DECIMAL(5,4),
    riegel_exponent_used        DECIMAL(6,4),
    riegel_calibrated           BOOLEAN NOT NULL DEFAULT FALSE,
    training_weeks_used         INTEGER,
    model_used                  VARCHAR(100)
);

-- Snapshot mais recente por atleta/prova
CREATE INDEX IF NOT EXISTS idx_race_projection_athlete_race
    ON tb_race_projection_snapshot (athlete_id, race_id, generated_at DESC);

-- Todas as projeções de um tenant (acesso multi-tenant)
CREATE INDEX IF NOT EXISTS idx_race_projection_tenant
    ON tb_race_projection_snapshot (tenant_id);

-- No máximo uma projeção oficial por atleta/prova:
-- implementado via UPDATE SET is_official=false antes de marcar nova (sem constraint declarativa)

DO $$
BEGIN
    RAISE NOTICE '✅ Vxx - tb_race_projection_snapshot criada com sucesso';
END$$;
```

## Prompt Template

```
src/main/resources/skills/race/projection/SKILL.md
```

Inputs passados ao LLM (já calculados, nunca recalcular):
- `{projections_json}` — projeções por distância com tempos e confidence
- `{regression_json}` — slope, R², tendência em % de melhora
- `{ctl_json}` — CTL atual, projetado, tendência
- `{periodization_json}` — fase, semanas até prova, fator de ajuste aplicado
- `{athlete_json}` — nome, vo2max estimado (para contexto narrativo)

Output esperado (strict JSON):
```json
{
  "progression_narrative": "...",
  "key_assumptions": ["...", "..."],
  "coach_note": "..."
}
```

## Open Questions — Resoluções

### ✅ oq_001: Range de confiança para atleta ou só coach?

**Resolvido em v0.1:** range exibido apenas no painel do coach (D6). O atleta vê somente o tempo projetado sem intervalo numérico. Reavaliar no piloto se atletas avançados pedirem mais transparência.

**Implementação:** `AthleteProjectionView` (task 9.2) omite `time_range_optimistic_sec` e `time_range_conservative_sec`. Coach vê `RaceProjectionOutput` completo.

---

### ✅ oq_002: CTL projetado — manual ou automático?

**Resolvido em v0.1:** entrada manual pelo coach via `LoadProjection.projectedCtlOnRaceDay`. O coach estima com base no plano que aprovou.

**Pendente para v0.2:** calcular automaticamente a partir das semanas de treino aprovadas no plano, somando TSS planejado e aplicando a fórmula de decaimento exponencial do CTL (constante de tempo 42d).

---

### ✅ oq_003: Lembrete automático de geração de projeção?

**Resolvido em v0.1:** lembrete passivo no dashboard do coach ("X semanas até a prova — gerar projeção?"). Não é job agendado, não envia notificação push. Implementar via badge informativo no card da prova.

**Pendente para v0.2:** se houver integração de notificações, acionar lembrete 8/4/1 semanas antes da prova.

---

### ✅ oq_004: Atleta sem dados de FC?

**Decidido (D7):** não bloquear a skill. Usar pace bruto sem normalização por FC. Forçar `confidence=LOW` independente do R². Adicionar `key_assumption` explícita: "Normalização de pace por FC não disponível — projeção baseada em pace bruto. Confiança reduzida."

**Implementado:** `RaceProjectionSkill` detecta `hr_data_missing=true` e aplica o fallback antes de invocar o `PaceRegressionCalculator`.

---

### ⏳ oq_005: Correção de expoente Riegel por nível do atleta?

**Pendente para v0.2:** literatura indica que atletas de elite têm expoente Riegel mais baixo (~1.04) e atletas amadores mais alto (~1.08). Com dados reais do piloto, investigar se vale calibrar o fallback por `nivelExperiencia` em vez de usar 1.06 fixo para todos.

**Hipótese:** `fallback_exponent = 1.04 + (0.04 × (1 - vo2max_percentile))` — a ser validada com dados do piloto (mínimo 20 atletas × 2 distâncias de prova).
