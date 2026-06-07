## Context

A `RaceEvaluationSkill` segue o contrato de skills de `introduce-domain-skills-architecture`. É disparada automaticamente via Spring `ApplicationEventPublisher` após o atleta registrar o resultado de uma prova. Toda a matemática é determinística (< 50ms); o LLM (Claude Haiku 4) gera apenas narrativa textual a partir dos cálculos prontos.

Stack: Spring Boot 3.5.4 / Java 21 / Spring AI / PostgreSQL.

## Goals

- Calcular automaticamente splits, distribuição de FC, TSB, desvio de meta e detecção de largada quente em < 50ms
- Gerar narrativa de avaliação em pt-BR via Claude Haiku com base nos dados calculados
- Entregar output ao coach para revisão antes de liberar ao atleta
- Funcionar mesmo com dados parciais (sem splits, sem HR) com graceful degradation
- Latência P95 total < 2.5s; custo < $0.0008 por chamada

## Non-Goals

- Ingestão automática de splits via Garmin/Strava (v0.2)
- Edição de narrativa pelo coach antes de liberar (v1.0)
- Reação do atleta ao feedback (v1.0)
- Comparação automática com provas anteriores da mesma distância (v0.3)

## Decisions

### D1: Camada determinística executa sempre — LLM é opcional

Se o LLM (Haiku + Sonnet fallback) falhar, o output é entregue com os dados determinísticos e `narrative_status = PENDING`. O coach pode acionar regeneração via `POST /regenerate`. Isso garante que o coach sempre recebe pelo menos os números — nunca bloqueia o fluxo.

### D2: Trigger via Spring ApplicationEvent — desacoplado do request de registro

O controller que recebe `POST /api/provas/{provaId}/resultado` publica um `RaceResultRegisteredEvent`. A `RaceEvaluationSkill` é um `@EventListener` assíncrono (`@Async`). Assim o request do atleta responde imediatamente; a avaliação é gerada em background.

### D3: Splits ausentes → avaliação parcial, não bloqueada

Atleta sem splits por km recebe avaliação com `pace_analysis = null`, badge `DATA_QUALITY: PARTIAL`, e `coach_note` indicando dados insuficientes para análise de pace. Distribuição de HR é estimada linearmente se disponível. `oq_001` resolvido: avaliação parcial com badge.

### D4: HR ausente → estimativa conservadora com flag

Se `hr_avg = null` em todos os splits: distribuição de zonas marcada como `estimated_only = true`, valores estimados conservadoramente (assume ~Z3 médio). `coach_note` inclui flag `missing_hr_data`. Nunca bloquear a skill por ausência de HR.

### D5: Split type classificado por threshold fixo

- FADE: segunda metade > primeira em mais de 5%
- POSITIVE: segunda metade > primeira entre 0% e 5%
- EVEN: diferença < 3% (bidirecional)
- NEGATIVE: primeira metade > segunda em mais de 3%

Threshold de 5% para FADE é robusto para provas de rua; pode ser revisto para trail (elevação) em v0.2.

### D6: TSB_ASSESSMENT com quatro estados, regras simétricas

- OPTIMAL: TSB entre -5 e +10 (range de peak performance)
- FATIGUED: TSB < -10 (fadiga residual)
- UNDERTAPERED: TSB > +15 (excesso de descanso, perda de fitness agudo)
- FRESH: TSB entre +10 e +15 (descansado mas dentro do aceitável)

Nota: TSB entre -10 e -5 não tem categoria explícita — cai em OPTIMAL pelo limite inferior. Verificar com dados reais do piloto.

### D7: coach_note é exclusivamente para o coach — nunca exposto ao atleta

A rota `athlete-view` nunca retorna `coach_note`. O DTO de view do atleta (`AthleteRaceEvaluationView`) é construído explicitamente sem o campo — não é um `@JsonIgnore` num shared DTO para evitar acidente de exposição.

### D8: Uma avaliação por atleta/prova — regeneração substitui

Constraint `UNIQUE (atleta_id, prova_id)` em `tb_race_evaluation`. `POST /regenerate` apaga o registro anterior e cria um novo. O histórico de regenerações não é mantido na v0.1 (append-only é custo sem benefício claro nesta fase).

### D9: Detecção de largada quente por desvio do primeiro km

`hot_start = primeiro_km_pace > target_pace * (1 - 0.05)`. Condição só avaliada se `goal.target_pace_sec_per_km` for fornecido. Se não há meta de pace, `hot_start = null` (não calculável).

### D10: Coach deve revisar explicitamente — sem auto-aprovação

`coach_reviewed` nunca é setado automaticamente. Coach chama `POST /review` para marcar. Enquanto `coach_reviewed = false`, atleta não tem acesso a nada. Sem timeout ou fallback de aprovação automática.

## Architecture

```
Atleta registra resultado de prova
        │
        ▼
TreinoRealizadoController.registrarResultado()
        │
        └── ApplicationEventPublisher.publishEvent(RaceResultRegisteredEvent)
                        │
                        ▼ (async @EventListener)
        RaceEvaluationSkill.onRaceResultRegistered(event)
                │
                ├── [Determinístico < 50ms]
                │   ├── PaceAnalyzer.analyze(splits)
                │   │   └── → PaceAnalysisResult (split_type, fade_pct, etc.)
                │   ├── HRZoneDistributor.distribute(splits, hrZones)
                │   │   └── → HRZoneDistributionResult (pct_z1..z5, dominant_zone)
                │   ├── LoadContextAnalyzer.analyze(tsb, phase)
                │   │   └── → LoadContextResult (tsb_assessment, delta_from_ideal)
                │   ├── GoalDeviationCalculator.calculate(result, goal)
                │   │   └── → GoalDeviationResult (nullable se sem meta)
                │   └── HotStartDetector.detect(splits[0], goal)
                │       └── → HotStartResult (nullable se sem meta de pace)
                │
                ├── [LLM — Claude Haiku 4]
                │   ├── serializar todos os resultados determinísticos → JSON
                │   ├── chamar SKILL.md prompt com contexto estruturado
                │   └── → NarrativeResult (overall_assessment, strengths,
                │                          improvement_areas, coach_note)
                │       fallback: Claude Sonnet 4
                │       fallback final: narrative_status = PENDING
                │
                └── [Persistence]
                    └── save(tb_race_evaluation) → coach notificado
```

## Key Interfaces

```java
// Orquestrador da skill
public class RaceEvaluationSkill {
    @EventListener
    @Async
    public void onRaceResultRegistered(RaceResultRegisteredEvent event) { ... }
    
    public RaceEvaluationOutput evaluate(RaceEvaluationInput input) { ... }
}

// Calculadores determinísticos (cada um testável isoladamente)
public class PaceAnalyzer {
    public PaceAnalysisResult analyze(List<KmSplit> splits) { ... }
}

public class HRZoneDistributor {
    public HRZoneDistributionResult distribute(List<KmSplit> splits, HRZones zones) { ... }
}

public class LoadContextAnalyzer {
    public LoadContextResult analyze(Double tsb, PeriodizationPhase phase) { ... }
}

public class GoalDeviationCalculator {
    public Optional<GoalDeviationResult> calculate(RaceResult result, RaceGoal goal) { ... }
}

public class HotStartDetector {
    public Optional<HotStartResult> detect(KmSplit firstKm, RaceGoal goal) { ... }
}

// Gerador de narrativa LLM
public class RaceEvaluationNarrativeGenerator {
    public NarrativeResult generate(RaceEvaluationNarrativeContext ctx) { ... }
}
```

## Data Model

```sql
CREATE TABLE tb_race_evaluation (
    id                          BIGSERIAL PRIMARY KEY,
    atleta_id                   BIGINT NOT NULL REFERENCES tb_atleta(id),
    prova_id                    BIGINT NOT NULL REFERENCES tb_prova(id),
    tenant_id                   BIGINT NOT NULL,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result_json                 JSONB NOT NULL,         -- snapshot do resultado original
    deterministic_output_json   JSONB NOT NULL,         -- output das 5 calculadoras
    llm_output_json             JSONB,                  -- null se LLM falhou (PENDING)
    narrative_status            VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | DONE | FAILED
    coach_reviewed              BOOLEAN NOT NULL DEFAULT FALSE,
    coach_reviewed_at           TIMESTAMPTZ,
    coach_id                    BIGINT,
    model_used                  VARCHAR(100),
    deterministic_version       VARCHAR(20) NOT NULL,   -- para rastrear mudanças de lógica
    data_quality                VARCHAR(20) NOT NULL,   -- FULL | PARTIAL (sem splits)
    UNIQUE (atleta_id, prova_id)
);

CREATE INDEX idx_race_evaluation_atleta_prova
    ON tb_race_evaluation (atleta_id, prova_id);
```

## Prompt Template

```
src/main/resources/skills/race/evaluation/SKILL.md
```

Inputs passados ao LLM (calculados, nunca recalcular):
- `{pace_analysis_json}` — split_type, fade_pct, fastest/slowest km, variabilidade
- `{hr_zone_json}` — pct_z1..z5, dominant_zone, time_above_z4
- `{load_context_json}` — tsb_assessment, delta_from_ideal, periodization_phase
- `{goal_deviation_json}` — time_delta, goal_achieved, deviation_pct (null se sem meta)
- `{athlete_profile_json}` — nome, idade, vo2max estimado

Output esperado (strict JSON):
```json
{
  "overall_assessment": "...",
  "strengths": ["...", "...", "..."],
  "improvement_areas": [
    { "area": "...", "observation": "...", "suggested_focus": "..." }
  ],
  "coach_note": "..."
}
```

## Open Questions

- **oq_001**: Atleta sem splits → RESOLVIDO (D3): avaliação parcial com badge DATA_QUALITY: PARTIAL
- **oq_002**: `coach_note` em PDF/relatório futuro → escopo v1.0; v0.1 apenas via dashboard
- **oq_003**: Mínimo de histórico para ativar skill → avaliação executa sempre; flag de confiança LOW em `load_context` quando < 4 semanas
