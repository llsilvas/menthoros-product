## 1. Fundação — DTOs e estrutura de pacote

- [ ] 1.1 Criar pacote `com.menthoros.skills.race` (compartilhado com `add-race-projection-skill` — verificar se já existe)
- [ ] 1.2 Criar `KmSplit` (km, pace_sec_per_km, hr_avg nullable)
- [ ] 1.3 Criar `RaceResult` (finish_time_seconds, average_pace_sec_per_km, average_hr, max_hr, splits List<KmSplit>, garmin_activity_id nullable, strava_activity_id nullable)
- [ ] 1.4 Criar `TrainingContext` (ctl_on_race_day, atl_on_race_day, tsb_on_race_day, ctl_trend_4w, recent_feedbacks List<WorkoutFeedbackSummary>, periodization_phase)
- [ ] 1.5 Criar `RaceGoal` (target_time_seconds nullable, target_pace_sec_per_km, priority A_RACE/B_RACE/C_RACE)
- [ ] 1.6 Criar `RaceEvaluationInput` agregando: Race, RaceResult, AthleteProfile, TrainingContext, RaceGoal nullable
- [ ] 1.7 Criar `PaceAnalysisResult` (first_half_avg_pace_sec, second_half_avg_pace_sec, split_type NEGATIVE/EVEN/POSITIVE/FADE, fade_pct, fastest_km, slowest_km, pace_variability_cv)
- [ ] 1.8 Criar `HRZoneDistributionResult` (pct_z1..z5, dominant_zone, time_above_z4_pct, estimated_only Boolean)
- [ ] 1.9 Criar `LoadContextResult` (tsb_assessment OPTIMAL/FATIGUED/UNDERTAPERED/FRESH, tsb_delta_from_ideal)
- [ ] 1.10 Criar `GoalDeviationResult` (time_delta_seconds, pace_delta_sec_per_km, goal_achieved, deviation_pct)
- [ ] 1.11 Criar `HotStartResult` (hot_start Boolean, first_km_vs_target_pct Double)
- [ ] 1.12 Criar `ImprovementArea` (area, observation, suggested_focus)
- [ ] 1.13 Criar `RaceEvaluationOutput` (overall_assessment, pace_analysis, hr_zone_distribution, load_context, goal_deviation nullable, hot_start nullable, strengths List<String>, improvement_areas List<ImprovementArea>, coach_note, metadata EvaluationMetadata, narrative_status PENDING/DONE/FAILED, data_quality FULL/PARTIAL)
- [ ] 1.14 Criar `AthleteRaceEvaluationView` — DTO separado para rota athlete-view, sem coach_note e sem goal_deviation

---

## 2. Calculadora 1 — PaceAnalyzer

- [ ] 2.1 Criar `PaceAnalyzer` com método `analyze(List<KmSplit> splits)`
- [ ] 2.2 Dividir splits em primeira e segunda metade; calcular `first_half_avg_pace_sec` e `second_half_avg_pace_sec`
- [ ] 2.3 Classificar split_type: FADE se segunda > primeira em > 5%; POSITIVE se segunda > primeira entre 0–5%; EVEN se diferença < 3%; NEGATIVE se primeira > segunda em > 3%
- [ ] 2.4 Calcular `fade_pct`: `(second_half - first_half) / first_half * 100`
- [ ] 2.5 Identificar `fastest_km` e `slowest_km` por número do km
- [ ] 2.6 Calcular `pace_variability_cv`: desvio padrão / média dos paces de cada km
- [ ] 2.7 Retornar `null` quando `splits` for null ou vazio — caller trata com DATA_QUALITY: PARTIAL
- [ ] 2.8 Testes unitários: sc_001 (fade severo), sc_002 (largada quente + positive split), sc_003 (negative split perfeito), splits ausentes → null sem exceção

---

## 3. Calculadora 2 — HRZoneDistributor

- [ ] 3.1 Criar `HRZoneDistributor` com método `distribute(List<KmSplit> splits, HRZones zones)`
- [ ] 3.2 Para cada split com `hr_avg` válido: calcular a zona correspondente por comparação com `zones.zN.min/max`
- [ ] 3.3 Agregar tempo por zona e calcular percentuais sobre tempo total
- [ ] 3.4 Identificar `dominant_zone` (zona com maior percentual) e `time_above_z4_pct`
- [ ] 3.5 Quando `hr_avg = null` em todos os splits: calcular estimativa conservadora (assume ~Z3 médio), marcar `estimated_only = true`
- [ ] 3.6 Quando parcialmente ausente: interpolar linearmente entre splits com HR válido
- [ ] 3.7 Testes: distribuição completa com HR por km; HR ausente → estimated_only; HR parcial → interpolação

---

## 4. Calculadora 3 — LoadContextAnalyzer

- [ ] 4.1 Criar `LoadContextAnalyzer` com método `analyze(Double tsb, PeriodizationPhase phase)`
- [ ] 4.2 Implementar tabela de estados (D6): OPTIMAL (-5..+10), FATIGUED (< -10), UNDERTAPERED (> +15), FRESH (+10..+15)
- [ ] 4.3 Calcular `tsb_delta_from_ideal`: distância ao range ideal [-5, +10]; 0 se dentro do range
- [ ] 4.4 Testes: cada um dos 4 estados nas bordas e no centro do intervalo; TSB exatamente em -10 (limite FATIGUED/OPTIMAL)

---

## 5. Calculadora 4 — GoalDeviationCalculator

- [ ] 5.1 Criar `GoalDeviationCalculator` com método `calculate(RaceResult result, RaceGoal goal)` retornando `Optional<GoalDeviationResult>`
- [ ] 5.2 Retornar `Optional.empty()` quando `goal = null` ou `goal.target_time_seconds = null`
- [ ] 5.3 Calcular: `time_delta_seconds = finish_time - target_time`; `deviation_pct = time_delta / target_time * 100`; `goal_achieved = time_delta <= 0`
- [ ] 5.4 Calcular `pace_delta_sec_per_km`: diferença de pace médio vs pace alvo
- [ ] 5.5 Testes: meta batida (delta negativo), meta não atingida, sem meta → Optional.empty()

---

## 6. Calculadora 5 — HotStartDetector

- [ ] 6.1 Criar `HotStartDetector` com método `detect(KmSplit firstKm, RaceGoal goal)` retornando `Optional<HotStartResult>`
- [ ] 6.2 Retornar `Optional.empty()` quando `goal.target_pace_sec_per_km = null` ou `firstKm = null`
- [ ] 6.3 Calcular `first_km_vs_target_pct = (target - first_km_pace) / target * 100`; `hot_start = first_km_pace < target_pace * 0.95` (mais rápido que 5% acima do alvo)
- [ ] 6.4 Testes: largada 7% acima do alvo → hot_start=true; largada 3% acima → hot_start=false; sem meta de pace → Optional.empty()

---

## 7. Geração de narrativa via LLM

- [ ] 7.1 Criar `RaceEvaluationNarrativeGenerator` com `ChatClient` configurado para Claude Haiku 4 (temp=0.3, max_tokens=1200)
- [ ] 7.2 Criar `src/main/resources/skills/race/evaluation/SKILL.md` com system prompt em inglês e template de output JSON strict
- [ ] 7.3 Serializar contexto: `pace_analysis_json`, `hr_zone_json`, `load_context_json`, `goal_deviation_json`, `athlete_profile_json`, `periodization_phase`
- [ ] 7.4 Configurar fallback para Claude Sonnet 4; se ambos falharem → retornar `narrative_status = FAILED` sem lançar exceção para cima
- [ ] 7.5 Validar output do LLM: `overall_assessment` ≤ 600 chars; `strengths` ≤ 3 itens; `improvement_areas` ≤ 3 itens; `coach_note` ≤ 400 chars
- [ ] 7.6 Testes com mock do ChatClient: output bem formado; fallback acionado quando Haiku falha; narrative_status=FAILED quando ambos falham

---

## 8. Persistência — tb_race_evaluation

- [ ] 8.1 Criar migration `Vxx__Create_tb_race_evaluation.sql` com schema completo (seção Data Model do design.md), índice e UNIQUE constraint
- [ ] 8.2 Criar entidade `RaceEvaluation` com campos mapeados; `result_json`, `deterministic_output_json`, `llm_output_json` como `@JdbcTypeCode(SqlTypes.JSON)`
- [ ] 8.3 Criar `RaceEvaluationRepository` com: `findByAtletaIdAndProvaId(Long, Long)`, `findByAtletaIdOrderByGeneratedAtDesc(Long)`
- [ ] 8.4 Implementar lógica de regeneração: `POST /regenerate` deleta registro existente antes de criar novo (UNIQUE constraint garante um por atleta/prova)
- [ ] 8.5 Testes: persistência completa, query por atleta/prova, regeneração substitui corretamente

---

## 9. Orquestração — RaceEvaluationSkill

- [ ] 9.1 Criar `RaceResultRegisteredEvent` (atletaId, provaId, tenantId, result snapshot)
- [ ] 9.2 Publicar evento em `TreinoRealizadoController.registrarResultado()` via `ApplicationEventPublisher.publishEvent()`
- [ ] 9.3 Criar `RaceEvaluationSkill` como `@Component` com `@EventListener` + `@Async` em `onRaceResultRegistered(event)`
- [ ] 9.4 Criar executor assíncrono dedicado `race-evaluation-executor` (pool separado para não interferir no request principal)
- [ ] 9.5 Orquestrar: carregar input completo do DB → executar 5 calculadoras → gerar narrativa LLM → persistir resultado
- [ ] 9.6 Determinar `data_quality`: PARTIAL se `splits = null || splits.isEmpty()`; FULL caso contrário
- [ ] 9.7 Tratar coach notificação após geração (log por enquanto; notificação push em sprint futuro)
- [ ] 9.8 Testes de integração: sc_001 (fade + undertapered), sc_002 (largada quente + PR frustrado), sc_003 (prova perfeita), sc_004 (HR ausente → estimated_only + flag)

---

## 10. APIs REST

- [ ] 10.1 Criar `RaceEvaluationController` com:
  - `GET /api/athletes/{atletaId}/race-evaluations/{provaId}` — output completo (role COACH, valida tenant)
  - `GET /api/athletes/{atletaId}/race-evaluations/{provaId}/athlete-view` — `AthleteRaceEvaluationView` sem coach_note (somente se `coach_reviewed=true`)
  - `POST /api/athletes/{atletaId}/race-evaluations/{provaId}/review` — marca `coach_reviewed=true` + registra `coach_reviewed_at`
  - `POST /api/athletes/{atletaId}/race-evaluations/{provaId}/regenerate` — coach solicita nova geração
- [ ] 10.2 Retornar 404 para athlete-view quando `coach_reviewed=false`
- [ ] 10.3 Garantir isolamento de tenant em todas as rotas
- [ ] 10.4 Testes de controller: geração assíncrona, athlete-view bloqueada sem revisão, review marca corretamente

---

## 11. UI — Coach dashboard e atleta

- [ ] 11.1 Badge de notificação no perfil do atleta quando nova avaliação de prova está disponível para revisão
- [ ] 11.2 Tela de avaliação no coach dashboard: exibir `overall_assessment`, splits, zonas de FC (barras), strengths, improvement_areas e `coach_note` (destacado visualmente como "nota privada")
- [ ] 11.3 Botão "Aprovar e Liberar ao Atleta" → chama `POST /review`
- [ ] 11.4 Badge `DATA_QUALITY: PARTIAL` visível ao coach quando `data_quality=PARTIAL`
- [ ] 11.5 Tela do atleta (após aprovação): `overall_assessment`, strengths, improvement_areas — sem coach_note, sem dados numéricos brutos de HR
- [ ] 11.6 Indicador de narrative_status: se PENDING/FAILED, exibir "Análise narrativa em processamento" para o coach (dados determinísticos disponíveis imediatamente)

---

## 12. Observabilidade

- [ ] 12.1 Log estruturado por execução da skill: data_quality, narrative_status, latência de cada calculadora + LLM, model_used
- [ ] 12.2 Métricas Micrometer: `race_evaluation_executions_total{data_quality, narrative_status}`, `race_evaluation_duration_ms{component}` (pace, hr, load, goal, hotstart, llm, total)
- [ ] 12.3 Alert: `narrative_status = FAILED` → log ERROR com stack trace para correlação
- [ ] 12.4 Metric: `race_evaluation_coach_review_lag_minutes` — tempo entre `generated_at` e `coach_reviewed_at` (para entender tempo de revisão do coach)

---

## 13. Documentação

- [ ] 13.1 Criar `src/main/resources/skills/race/evaluation/SKILL.md` com system prompt completo, exemplos de input JSON e output esperado por cenário de teste
- [ ] 13.2 Documentar open questions resolvidas (oq_001–oq_003) e itens de roadmap v0.2/v0.3 pendentes no `design.md`
