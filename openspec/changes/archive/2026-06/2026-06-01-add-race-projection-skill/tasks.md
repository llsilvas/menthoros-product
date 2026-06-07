## 1. Fundação — DTOs e estrutura de pacote

- [x] 1.1 Criar pacote `br.com.menthoros.backend.skills.race` para abrigar a skill e seus componentes
- [x] 1.2 Criar `WorkoutSummary` (date, type, distance_m, duration_seconds, avg_pace_sec_per_km, avg_hr, tss, rpe)
- [x] 1.3 Criar `TrainingHistory` (workouts, data_quality FULL/PARTIAL/SPARSE, weeks_available)
- [x] 1.4 Criar `LoadProjection` (current_ctl, current_atl, current_tsb, target_race_date, weeks_to_race, planned_periodization_phase, projected_ctl_on_race_day, projected_tsb_on_race_day)
- [x] 1.5 Criar `PastRace` (distance_m, finish_time_seconds, date, conditions IDEAL/HEAT/RAIN/HILLY/WIND)
- [x] 1.6a Criar `public record AthleteProfile` (id UUID, nome String, sobrenome String nullable, fcMaxima Integer nullable, fcLimiar Integer nullable, vo2maxEstimado BigDecimal nullable, nivelExperiencia NivelExperiencia)
  - `fcMaxima` e `fcLimiar` nullable: ausência de ambos força confidence=LOW e registra key_assumption de pace bruto (D7)
  - Não importar `Atleta` (`@Entity`) no pacote `skills.race` — ver Skills Architecture Standards no CLAUDE.md
- [x] 1.6d Criar `AthleteProfileMapper` em `br.com.menthoros.backend.mapper`
  - `@Component` com método `from(Atleta atleta): AthleteProfile`
  - Null check obrigatório: lançar `IllegalArgumentException` se `atleta == null` (padrão Mapper Standards)
  - É a única fonte de verdade para a conversão `Atleta → AthleteProfile` — nenhum caller deve fazer essa conversão inline
- [x] 1.6b Criar `public record CoachGoalOverride` (goalTimeSeconds Long, targetDistanceM Integer)
  - `targetDistanceM` identifica a qual distância-alvo a meta se aplica (necessário pois `RaceProjectionOutput` retorna projeções para múltiplas distâncias)
  - Usado exclusivamente para calcular `GoalGapAnalysis` (D8) — não afeta os cálculos das 3 camadas
- [x] 1.6c Criar `public record RaceProjectionInput` agregando: AthleteProfile, TrainingHistory, LoadProjection, List<PastRace>, List<Integer> targetDistances, CoachGoalOverride (nullable), Integer weeksToRaceOverride (nullable)
- [x] 1.7 Criar `RaceProjection` (distance_m, projected_time_seconds, projected_pace_sec_per_km, time_range_optimistic_sec, time_range_conservative_sec, confidence, pr_potential)
- [x] 1.8 Criar `GoalGapAnalysis` (goal_time_seconds, projected_time_seconds, gap_seconds, gap_pct, gap_assessment ON_TRACK/REACHABLE/STRETCH/UNLIKELY, coach_note_gap)
- [x] 1.9 Criar `CTLForecast` (current_ctl, projected_ctl_race_day, ctl_trend BUILDING/STABLE/DECLINING, weeks_to_peak)
- [x] 1.10 Criar `RaceProjectionOutput` (projections Map<Integer,RaceProjection>, progression_narrative, ctl_forecast, key_assumptions List<String>, coach_note, goal_gap_analysis nullable)

---

## 2. Camada 1 — Regressão de Pace Normalizado

- [x] 2.1 Adicionar dependência `commons-math3:3.6.1` ao `pom.xml` (verificar se já presente como transitiva)
- [x] 2.2 Criar `PaceRegressionCalculator` com método `calculate(List<WorkoutSummary> workouts, Integer maxHr)`
- [x] 2.3 Filtrar treinos por tipo TEMPO e LONG; exigir mínimo de 6 sessões para regressão válida
- [x] 2.4 Calcular `lactate_threshold_hr = maxHr * 0.88` quando não disponível diretamente
- [x] 2.5 Calcular `normalized_pace = avg_pace_sec_per_km / (avg_hr / lactate_threshold_hr)` por sessão
- [x] 2.6 Aplicar `SimpleRegression` (commons-math3) com x=semana_ordinal, y=normalized_pace; extrair slope, R², pace projetado para a semana da prova
- [x] 2.7 Determinar confidence: R² ≥ 0.7 → HIGH; R² ≥ 0.4 → MEDIUM; R² < 0.4 ou < 6 sessões → LOW
- [x] 2.8 Fallback quando `data_quality = SPARSE`: sinalizar LOW obrigatoriamente, usar último pace disponível como estimativa plana
- [x] 2.9 Criar `RegressionResult` (slope, r_squared, projected_pace_at_race_week, confidence_layer1, sessions_used)
- [x] 2.10 Testes unitários: atleta com 12 semanas de treino consistente → HIGH; atleta com 3 semanas → LOW; sem dados de FC → LOW com key_assumption

---

## 3. Camada 2 — Conversão por Riegel

- [x] 3.1 Criar `RiegelCalculator` com método `calculate(RegressionResult regression, List<PastRace> raceHistory, List<Integer> targetDistances)`
- [x] 3.2 Implementar calibração de expoente: se 2+ provas em distâncias distintas, calcular `exponent = log(t2/t1) / log(d2/d1)` para cada par; média ponderada por recência (provas < 12 meses: peso 2x)
- [x] 3.3 Fallback: expoente padrão 1.06 quando sem histórico de provas suficiente; marcar `riegel_calibrated=false`
- [x] 3.4 Implementar seleção de anchor_time por prioridade (D9): (1) pace Camada 1 × distância próxima, (2) melhor prova recente < 12 meses, (3) pace TEMPO × 1.05
- [x] 3.5 Calcular `t2 = t1 * (d2/d1)^exponent` para cada `target_distance`
- [x] 3.6 Criar `RiegelResult` (Map<Integer,Long> base_times_sec, exponent_used, calibrated, calibration_sample_size, anchor_source)
- [x] 3.7 Testes unitários: atleta com 3 provas → calibrado; sem provas → expoente padrão; verificar cálculo com valores conhecidos (ex: 10k 45min → 21k ~1h36)

---

## 4. Camada 3 — Ajuste por Periodização e TSB

- [x] 4.1 Criar `PeriodizationAdjuster` com método `adjust(Map<Integer,Long> baseTimes, PeriodizationPhase phase, Double projectedTsb)`
- [x] 4.2 Implementar tabela de fatores: TAPER_optimal (tsb -5..10 → 0.975), BUILD_peak (tsb -15..-5 → 1.00), ESPECIFICO_fresh (tsb -5..5 → 0.985), BASE_conservative (BASE → 1.05), FATIGUED (tsb < -15 → 1.08), OVERTAPERED (tsb > 15 → 1.03)
- [x] 4.3 Condição FATIGUED (tsb < -15) tem precedência sobre a fase de periodização
- [x] 4.4 Retornar `AdjustmentResult` (adjustment_factor, adjustment_rationale_key, adjusted_times Map<Integer,Long>)
- [x] 4.5 Testes unitários: cada um dos 6 cenários com valores de tsb nas bordas e no centro do intervalo

---

## 5. Cálculo final e montagem do output

- [x] 5.1 Criar `ConfidenceCalculator`: `overall_confidence = min(confidence_layer1, calibration_quality_as_confidence)`
- [x] 5.2 Calcular `time_range`: otimista = adjusted_time × 0.97; conservador = adjusted_time × 1.03 (faixas de ±3% como aproximação inicial)
- [x] 5.3 Calcular `pr_potential`: verificar se `projected_time_seconds < melhor_prova_historica_mesma_distancia`
- [x] 5.4 Calcular `CTLForecast`: tendência = (projected_ctl - current_ctl) / weeks_to_race > 0 → BUILDING; < -1 → DECLINING; senão → STABLE
- [x] 5.5 Calcular `GoalGapAnalysis` quando `coach_goal_override` presente: gap_pct, gap_assessment via thresholds D8, coach_note_gap formatado
- [x] 5.6 Criar `RaceProjectionAssembler` para montar o `RaceProjectionOutput` completo a partir dos resultados das 3 camadas

---

## 6. Geração de narrativa via LLM

- [x] 6.1 Criar `RaceProjectionNarrativeGenerator` com `ChatClient` configurado para Claude Haiku 4 (temp=0.2, max_tokens=1000)
- [x] 6.2 Criar `src/main/resources/skills/race/projection/SKILL.md` com system prompt em inglês e template de output JSON (`progression_narrative`, `key_assumptions`, `coach_note`)
- [x] 6.3 Serializar contexto para o LLM: `projections_json`, `regression_json`, `ctl_json`, `periodization_json`, `athlete_json` — sem PII sensível
- [x] 6.4 Configurar fallback para Claude Sonnet 4 em caso de erro/timeout do Haiku
- [x] 6.5 Testes unitários com mock do ChatClient: output bem formado, key_assumptions limitados a 5 itens, narrativa dentro de 500 chars
- [x] 6.6 Teste: quando confiança = LOW, narrativa deve conter linguagem de incerteza (verificar que `key_assumptions` inclui limitação dos dados)

---

## 7. Persistência — tb_race_projection_snapshot

- [x] 7.1 Criar migration `Vxx__Create_tb_race_projection_snapshot.sql` com schema completo (seção Data Model do design.md), índice e sem constraint UNIQUE declarativa (regra de "apenas uma oficial" via código)
- [x] 7.2 Criar entidade `RaceProjectionSnapshot` com campos mapeados + `projections_json` como `@JdbcTypeCode(SqlTypes.JSON)`
- [x] 7.3 Criar `RaceProjectionSnapshotRepository` com queries: `findLatestByAthleteId(Long)`, `findByAthleteIdAndRaceIdOrderByGeneratedAtDesc(Long, Long)`, `findOfficialByAthleteIdAndRaceId(Long, Long)`
- [x] 7.4 Implementar lógica de "apenas uma oficial por atleta/prova": antes de marcar nova como oficial, executar `UPDATE ... SET is_official=false WHERE athlete_id=X AND race_id=Y AND is_official=true`
- [x] 7.5 Testes de repositório: append-only (sem updates no snapshot salvo), troca de oficial, query de histórico

---

## 8. RaceProjectionSkill — orquestração

- [x] 8.1 Criar `RaceProjectionSkill` orquestrando: Camada 1 → Camada 2 → Camada 3 → ConfidenceCalculator → NarrativeGenerator → Assembler → Snapshot
- [x] 8.2 Validar `RaceProjectionInput`: atleta required, training_history required (com aviso se sparse), load_projection required
- [x] 8.3 Quando `avg_hr = null` em todos os treinos: flag `hr_data_missing=true`, forçar confidence=LOW, adicionar key_assumption de pace bruto
- [x] 8.4 Testes de integração da skill com mock do LLM: sc_001 (12 semanas TAPER → HIGH, factor=0.975), sc_002 (3 semanas → LOW), sc_003 (3 provas → Riegel calibrado), sc_004 (TSB -18 → FATIGUED, factor=1.08), sc_005 (meta 20% mais rápida → UNLIKELY)

---

## 9. APIs REST

- [x] 9.1 Criar `RaceProjectionController` com:
  - `POST /api/v1/atletas/{atletaId}/projecoes-prova` — gera e persiste (role COACH)
  - `GET /api/v1/atletas/{atletaId}/projecoes-prova?provaId=X` — histórico de snapshots
  - `GET /api/v1/atletas/{atletaId}/projecoes-prova/oficial?provaId=X` — projeção oficial atual
  - `PATCH /api/v1/atletas/{atletaId}/projecoes-prova/{snapshotId}/oficial` — marca como oficial + registra coach_reviewed_at
  - `GET /api/v1/atletas/{atletaId}/projecoes-prova/visao-atleta?provaId=X` — view simplificada (somente se oficial + revisado)
- [x] 9.2 Implementar `AthleteProjectionView` como DTO de resposta da rota athlete-view (sem confidence numérica, sem gap, sem coach_note)
- [x] 9.3 Garantir que todas as rotas validam tenant: coach só acessa atletas do seu tenant
- [x] 9.4 Testes de controller: geração bem-sucedida, rota athlete-view retorna 404 se não há projeção oficial, marcação de oficial troca corretamente

---

## 10. UI — Entry points no frontend

- [x] 10.1 Botão "Gerar Projeção de Prova" no perfil do atleta → abre modal com seleção de prova e inputs opcionais (coach_goal_override, weeks_to_race_override)
- [x] 10.2 Botão "Projetar Tempo" no calendário de provas ao lado de cada prova futura
- [x] 10.3 Tela de resultado da projeção: exibir confiança com badge colorido (LOW=vermelho, MEDIUM=amarelo, HIGH=verde), narrativa, premissas e coach_note
- [x] 10.4 Botão "Marcar como Oficial" no resultado — confirmar antes de agir (substitui a projeção oficial anterior se existir)
- [x] 10.5 Dashboard do atleta: gráfico de linha mostrando evolução das projeções oficiais com delta visual (negativo = melhora em verde)
- [x] 10.6 Ocultar range de confiança e gap analysis no dashboard do atleta (visíveis apenas no painel do coach)

---

## 11. Observabilidade

- [x] 11.1 Log estruturado por invocação da skill: confidence resultado, expoente Riegel usado, R² da regressão, weeks_to_race, latência das 3 camadas separadas
- [x] 11.2 Métricas Micrometer: `race_projection_executions_total{confidence}`, `race_projection_duration_ms{layer}` (layer: regression, riegel, adjustment, llm, total)
- [x] 11.3 Alerta: se P95 total > 2500ms → logar warning com breakdown de latência por camada

---

## 12. Documentação e arquivamento

- [x] 12.1 Adicionar 3 exemplos few-shot ao `SKILL.md`: HIGH/TAPER, LOW/sem-FC, MEDIUM/STRETCH
- [x] 12.2 Arquivar `add-race-time-prediction` (supersedida) → `archive/2026-06-01-add-race-time-prediction`
- [x] 12.3 Documentar oq_001–oq_004 como resolvidas e oq_005 como pendente v0.2 no `design.md`
