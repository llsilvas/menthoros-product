---
name: weekly-feedback
description: Holistic post-week analysis generating personalized narrative feedback with adaptive tone, grade classification, key achievements, and next-week guidance
version: 1.0.0
language: en-US
tags: [feedback, weekly-review, adherence, motivation, athlete-engagement]
---

# Weekly Feedback

## Purpose

Analyze a completed training week holistically and generate personalized feedback for the athlete, covering:
- Overall week classification and score
- Personalized narrative with tone adapted to how the week went
- Key achievements worth celebrating
- Main challenge surfaced with context
- Specific, actionable guidance for the coming week
- Motivational closing message

This skill bridges data and human connection. The numbers are the input; the output is something the athlete actually wants to read.

**Output is written in Brazilian Portuguese.** Internal reasoning may be in English.

---

## Input Schema

```json
{
  "week_summary": {
    "week_number": "integer",
    "week_start_date": "YYYY-MM-DD",
    "week_end_date": "YYYY-MM-DD",
    "planned_workouts_count": "integer",
    "completed_workouts_count": "integer",
    "planned_volume_km": "number",
    "actual_volume_km": "number",
    "planned_tss": "number",
    "actual_tss": "number"
  },
  "completed_workouts": [
    {
      "workout_type": "LONG_RUN | INTERVAL | TEMPO | RECOVERY | EASY",
      "planned_distance_km": "number (optional)",
      "actual_distance_km": "number",
      "planned_rpe": "integer 1-10 (optional)",
      "actual_rpe": "integer 1-10 (optional)",
      "execution_score": "integer 1-10 (optional, from workout-analyzer)",
      "primary_cause": "string (optional, from workout-analyzer)",
      "day_of_week": "MON | TUE | WED | THU | FRI | SAT | SUN"
    }
  ],
  "missed_workouts": [
    {
      "workout_type": "string",
      "planned_distance_km": "number",
      "day_of_week": "string",
      "reason": "string (optional)"
    }
  ],
  "athlete_context": {
    "name": "string",
    "athlete_level": "BEGINNER | INTERMEDIATE | ADVANCED | ELITE",
    "primary_goal": "string",
    "tsb_start_of_week": "number",
    "tsb_end_of_week": "number",
    "ctl_end_of_week": "number",
    "consecutive_weeks_training": "integer"
  },
  "computed_metrics": {
    "adherence_rate": "number 0.0-1.0",
    "volume_completion_rate": "number 0.0-1.0",
    "tss_completion_rate": "number 0.0-1.0",
    "avg_execution_score": "number 1-10 (optional)",
    "quality_sessions_completed": "integer",
    "tsb_delta": "number (end - start)",
    "week_score": "integer 0-100"
  }
}
```

---

## Analysis Framework

### Step 1: Classify the Grade

Use `week_score` from `computed_metrics` (calculated by `calculate_week_metrics.py`):

| Grade | week_score | Meaning |
|-------|-----------|---------|
| EXCEPTIONAL | ≥ 90 | Outstanding week — high adherence, quality execution |
| GOOD | 75–89 | Solid week — minor gaps, consistent effort |
| SOLID | 60–74 | Decent week — some missed sessions, acceptable quality |
| CHALLENGING | 40–59 | Difficult week — significant gaps or poor execution |
| DIFFICULT | < 40 | Hard week — most sessions missed or signs of overreaching |

**Adjust grade down by one level if:**
- `avg_execution_score` < 6.0 (even with high adherence, poor quality matters)
- `primary_cause = ACCUMULATED_FATIGUE` appears in 2+ workouts
- `tsb_delta` < -15 (severe fatigue accumulation during the week)

**Adjust grade up by one level if:**
- Athlete completed a personal record distance or volume this week
- All quality sessions (INTERVAL, TEMPO, LONG_RUN) were completed despite misses in easy runs
- `tsb_delta` > +10 with high adherence (athlete managed load perfectly)

---

### Step 2: Identify Key Achievements (max 3)

Look for genuinely notable positives. Prioritize in this order:

1. **Consistency achievements** — "5/5 sessions completed", "8 consecutive weeks"
2. **Performance highlights** — specific sessions with high execution scores or PRs
3. **Load management** — positive TSB trend, good recovery pattern
4. **Resilience** — completing a session despite fatigue or difficulty

**For DIFFICULT weeks:** Only list achievements if they are genuinely real. An empty list is better than a forced positive. Exception: "TSB recovered X points" is always valid if `tsb_delta > 5`.

**Format:** Short, specific, concrete. Avoid vague praise.
- ✅ "Longão de 22km em negative split (-12s/km)"
- ❌ "Bom treino na quinta-feira"

---

### Step 3: Identify the Main Challenge

Surface the single most significant difficulty, explained with physiological or contextual reasoning.

**Selection priority:**
1. Safety-relevant: `ACCUMULATED_FATIGUE` pattern, consecutive missed sessions, severe TSB drop
2. Goal-relevant: missed the week's most important session for the primary goal
3. Structural: missed workout type that will affect next week's plan
4. Contextual: if reason was provided (work, fatigue), acknowledge it directly

**For EXCEPTIONAL weeks:** `main_challenge` = null. Do not manufacture a problem.

**Format:** 1-2 sentences, empathetic, never accusatory.

---

### Step 4: Generate the Week Narrative

Write 2-3 paragraphs. Tone must match the grade exactly.

**EXCEPTIONAL — Celebratory and energizing:**
```
Reinforce specifically what worked. Use specific data points.
Acknowledge the athlete by name. Project forward with confidence.
Avoid generic compliments — make it feel personal.
```

**GOOD — Encouraging and forward-looking:**
```
Acknowledge the effort honestly. Name what was positive specifically.
Mention the gap without dwelling on it. End on momentum.
```

**SOLID — Balanced and constructive:**
```
Be honest about the gap without being harsh.
Reframe missed sessions as information, not failure.
Find at least one genuine positive. End with a path forward.
```

**CHALLENGING — Empathetic and normalizing:**
```
Lead with empathy, not data. Hard weeks happen.
Normalize the difficulty with context (fatigue cycle, life demands).
Find something real to hold onto. Do NOT minimize the impact.
End with a clear, simple message: what matters now is next week.
```

**DIFFICULT — Compassionate and recovery-focused:**
```
No performance pressure whatsoever.
Acknowledge what happened. Do not moralize.
Focus entirely on recovery and rebuilding.
If TSB improved (body rested), frame that as the win.
End with hope, not obligation.
```

**Language rules:**
- Always in Brazilian Portuguese
- Address athlete by first name
- Use "você" (not "tu")
- Keep sentences clear and direct — not clinical, not overly poetic
- Specific numbers > vague adjectives ("22km" > "longa distância")
- Avoid: "parabéns", "muito bem" (generic) → prefer: "impressionante", "exatamente o que precisamos"

---

### Step 5: Generate Next Week Guidance (max 3 items)

Each item must be:
- **Specific:** "Mantenha 60km" not "mantenha o volume"
- **Actionable:** Something the athlete can do, not observe
- **Sequenced by priority:** HIGH first, then MEDIUM, then LOW

**Grade-specific defaults:**

| Grade | Guidance focus |
|-------|---------------|
| EXCEPTIONAL | Consolidation or smart progression |
| GOOD | Protect the gains, address the gap |
| SOLID | Volume maintenance, session priority order |
| CHALLENGING | Volume reduction, prioritize key sessions |
| DIFFICULT | Recovery week prescription, minimal obligation |

**If `tsb_end_of_week < -20`:** First item MUST be a recovery recommendation regardless of grade.

**If `tsb_end_of_week > 0`:** May suggest slight progression if grade is EXCEPTIONAL or GOOD.

---

### Step 6: Write the Motivation Message

One short, punchy sentence. Like the last thing a coach says at the end of a debrief. Max 120 characters.

**Tone by grade:**
- EXCEPTIONAL: Pride, momentum, looking forward
- GOOD: Acknowledgement, continuity
- SOLID: Encouragement, normalization
- CHALLENGING: Compassion, perspective
- DIFFICULT: Rest, it's okay, rebuild

**Examples:**
- EXCEPTIONAL: "9 semanas sem parar. Isso não é sorte, é consistência."
- GOOD: "Semana sólida. Você está construindo algo real aqui."
- SOLID: "Imperfeito não é o contrário de bom. Você foi."
- CHALLENGING: "Semanas difíceis revelam caráter. Você apareceu quando pôde."
- DIFFICULT: "Descanso não é fracasso. É parte do plano."

---

## Output Schema

```json
{
  "grade": "EXCEPTIONAL | GOOD | SOLID | CHALLENGING | DIFFICULT",
  "week_score": "integer 0-100",
  "week_summary": "string (2-3 paragraphs, pt-BR)",
  "key_achievements": ["string", "string", "string"],
  "main_challenge": "string or null",
  "next_week_guidance": [
    {
      "recommendation": "string (specific, actionable, pt-BR)",
      "priority": "HIGH | MEDIUM | LOW"
    }
  ],
  "motivation_message": "string (max 120 chars, pt-BR)",
  "stats_highlight": {
    "adherence_percent": "integer",
    "volume_km": "number",
    "tss_completed": "number",
    "quality_sessions": "integer",
    "tsb_delta": "string (e.g. '-12 → -6')"
  }
}
```

---

## Complete Examples

### Example 1: EXCEPTIONAL Week

**Input summary:** Week 9, BUILD phase, ADVANCED athlete (Carlos), 5/5 sessions, 61.5km, avg execution score 9.2, TSB -12 → -6.

**Expected Output:**
```json
{
  "grade": "EXCEPTIONAL",
  "week_score": 96,
  "week_summary": "Carlos, que semana! Você completou todas as 5 sessões planejadas com uma qualidade de execução excepcional. O intervalado de terça foi especialmente impressionante — pace controlado do início ao fim, com decaimento mínimo. Isso mostra que sua base aeróbica está respondendo muito bem ao bloco BUILD.\n\nO longão de sábado (22km) foi executado em negative split, exatamente o que precisamos para treinar seu sistema para a maratona. A recuperação ao longo da semana também foi eficiente — o TSB subiu 6 pontos, o que indica que você absorveu bem a carga sem acumular fadiga excessiva.\n\nVocê está em uma trajetória sólida para o sub-3h30. Continue exatamente assim.",
  "key_achievements": [
    "100% de aderência — 5/5 sessões completadas",
    "Longão de 22km em negative split (-12s/km na segunda metade)",
    "CTL de 58 — recorde histórico pessoal neste ciclo"
  ],
  "main_challenge": null,
  "next_week_guidance": [
    {
      "recommendation": "Mantenha o mesmo volume desta semana (60-62km). Não aumente — semana 10 deve consolidar a adaptação antes do próximo bloco.",
      "priority": "HIGH"
    },
    {
      "recommendation": "No intervalado, tente pace 3-5s/km mais rápido que o desta semana. Você tem capacidade agora.",
      "priority": "MEDIUM"
    },
    {
      "recommendation": "Hidrate bem nos dias anteriores ao longão — previsão de calor para o fim de semana.",
      "priority": "LOW"
    }
  ],
  "motivation_message": "9 semanas sem parar. Isso não é sorte, é consistência. Continue.",
  "stats_highlight": {
    "adherence_percent": 100,
    "volume_km": 61.5,
    "tss_completed": 525,
    "quality_sessions": 2,
    "tsb_delta": "-12 → -6"
  }
}
```

---

### Example 2: CHALLENGING Week

**Input summary:** Week 6, BASE phase, ADVANCED athlete (Carlos), 2/5 sessions, 18km, missed INTERVAL/TEMPO/LONG_RUN, TSB -18 → -8.

**Expected Output:**
```json
{
  "grade": "CHALLENGING",
  "week_score": 44,
  "week_summary": "Carlos, foi uma semana difícil — você completou 2 das 5 sessões planejadas. Isso acontece, especialmente em períodos de alta demanda no trabalho. O mais importante é reconhecer o que aconteceu sem se julgar.\n\nA boa notícia: as 2 sessões que você fez foram bem executadas, e o seu TSB subiu 10 pontos (de -18 para -8). Seu corpo aproveitou o volume reduzido para recuperar. Isso pode até ter sido um alívio bem-vindo antes do próximo bloco de carga.\n\nSemanas assim fazem parte do processo. O que importa é o padrão de longo prazo — e você tem 6 semanas sólidas de histórico. Uma semana não desfaz isso.",
  "key_achievements": [
    "TSB recuperou 10 pontos — corpo descansou bem",
    "As 2 sessões completadas tiveram boa execução (score médio 7.5)"
  ],
  "main_challenge": "3 sessões perdidas por conta de trabalho e fadiga acumulada. O longão de sábado era a sessão mais importante para o objetivo de maratona — sua ausência vai precisar ser compensada nas próximas semanas.",
  "next_week_guidance": [
    {
      "recommendation": "Retome com volume moderado — planeje 40-45km, não tente compensar as sessões perdidas. Aumentar demais agora aumenta o risco de lesão.",
      "priority": "HIGH"
    },
    {
      "recommendation": "Priorize o longão como sessão inegociável da semana. Se precisar cortar algo, corte o intervalado — não o longo.",
      "priority": "HIGH"
    },
    {
      "recommendation": "Revise a agenda da próxima semana com antecedência e bloqueie os horários de treino como compromissos fixos.",
      "priority": "MEDIUM"
    }
  ],
  "motivation_message": "Semanas difíceis revelam caráter. Você apareceu quando pôde. Próxima semana, é recomeço.",
  "stats_highlight": {
    "adherence_percent": 40,
    "volume_km": 18,
    "tss_completed": 120,
    "quality_sessions": 0,
    "tsb_delta": "-18 → -8"
  }
}
```

---

### Example 3: DIFFICULT Week — Overreaching Signs

**Input summary:** Week 3, BUILD phase, INTERMEDIATE athlete (Ana), 1/5 sessions, 9km, avg execution score 4.5 (one session with ACCUMULATED_FATIGUE), TSB -32 → -27.

**Expected Output:**
```json
{
  "grade": "DIFFICULT",
  "week_score": 28,
  "week_summary": "Ana, essa foi uma semana muito pesada. Com apenas 1 sessão completada e sinais claros de fadiga acumulada, seu corpo está pedindo para parar. E você precisa ouvir isso.\n\nO TSB de -27 no final da semana está em território de risco. Isso não é fraqueza — é o sinal fisiológico de que as cargas recentes foram maiores do que a recuperação conseguiu absorver. Forçar mais treinamento agora não vai ajudar o seu progresso; vai atrasar.\n\nEsta semana, a única tarefa é recuperar. Caminhadas leves, alongamentos, sono bom, hidratação. Sem obrigação de correr.",
  "key_achievements": [],
  "main_challenge": "Sinais de fadiga acumulada severa: TSB em -27, única sessão completada avaliada com execução muito acima do RPE esperado. O corpo está sobrecarregado e precisa de recuperação antes de retomar carga.",
  "next_week_guidance": [
    {
      "recommendation": "Semana de recuperação obrigatória: apenas caminhadas ou corridas leves de 20-30min em Z1. Nenhuma sessão de qualidade até TSB superar -10.",
      "priority": "HIGH"
    },
    {
      "recommendation": "Durma pelo menos 8 horas por noite. A recuperação acontece no sono, não na esteira.",
      "priority": "HIGH"
    },
    {
      "recommendation": "Na sexta, reavalie como se sente. Se TSB estiver acima de -15, podemos planejar um easy run de 8-10km para o fim de semana.",
      "priority": "MEDIUM"
    }
  ],
  "motivation_message": "Descanso não é fracasso. É parte do plano. Volte mais forte.",
  "stats_highlight": {
    "adherence_percent": 20,
    "volume_km": 9,
    "tss_completed": 45,
    "quality_sessions": 0,
    "tsb_delta": "-32 → -27"
  }
}
```

---

## Implementation Notes

### Processing Sequence

1. **Read `computed_metrics.week_score`** — this is pre-calculated by `calculate_week_metrics.py`
2. **Classify grade** — apply adjustments based on execution scores and TSB delta
3. **Scan `completed_workouts`** — find notable sessions for achievements
4. **Scan `missed_workouts`** — identify what's most goal-relevant missing
5. **Check `tsb_end_of_week`** — if < -20, override first guidance item with recovery
6. **Generate narrative** — grade tone first, then fill with specific data points
7. **Write motivation message last** — it should feel like the natural conclusion of the narrative

### Language and Tone Rules

✅ Always Brazilian Portuguese in output fields
✅ Address athlete by first name (from `athlete_context.name`)
✅ Specific numbers are more powerful than adjectives
✅ Empathy before data in CHALLENGING and DIFFICULT grades
✅ Motivation message must feel earned — don't be cheerful after a DIFFICULT week

❌ Never say "parabéns" or "muito bem" — they feel generic
❌ Never manufacture achievements that aren't real
❌ Never moralize about missed sessions ("você deveria ter...")
❌ Never be vague in `next_week_guidance` — numbers and specific types always

### When workout-analyzer data is unavailable

If `execution_score` or `primary_cause` are missing for some workouts:
- Skip execution quality assessment for those sessions
- Base grade on adherence and TSB data only
- Note in `week_summary` that some sessions lacked data (brief mention)
- Do NOT hallucinate execution quality

### Stats Highlight Format

`tsb_delta` field format: `"{tsb_start} → {tsb_end}"` (e.g. `"-12 → -6"`, `"-5 → -18"`)

Always include even for DIFFICULT weeks — the number tells a story.

---

**This skill runs automatically after the week closes (Monday 6am scheduler or after last workout of the week is registered).**

For athletes with no data from the week (0 completed workouts, no RPE), skip generation and notify coach instead of generating empty feedback.
