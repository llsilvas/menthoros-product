## 1. Fundacional - Contratos e Orquestração

- [x] 1.1 Criar pacote `src/main/java/com/menthoros/skills/core/`
- [x] 1.2 Criar `DomainSkill.java`, `SkillContext.java` e `SkillResult.java`
- [x] 1.3 Criar enums auxiliares: `SkillCategory`, `SkillSeverity` e `SkillConfidence`
- [x] 1.4 Criar `SkillRegistry.java` para descoberta/registro de skills Spring
- [x] 1.5 Criar `SkillOrchestratorService.java` para execução ordenada e consolidação de resultados
- [x] 1.6 Criar `AthleteAnalysisSnapshot.java` com `toPromptSummary()` para injeção no LLM

## 2. Persistência e Modelo de Dados

- [x] 2.1 Criar entidade `SkillExecution.java` com payload/evidence/recommendations como JSONB
- [x] 2.2 Criar migration V32 para tabela `tb_skill_execution` com índices
- [x] 2.3 Criar `SkillExecutionRepository.java` com queries por atleta, skill e tenant
- [x] 2.4 `SkillOrchestratorService` persiste resultados best-effort após cada execução

## 3. Formalização de Skills Existentes

- [x] 3.1 `RecoveryCargaSkill` (skills/recovery/) — a partir de `MetricasAlertaService`
  - 4 estados: FRESCO, NEUTRO, FATIGADO, SOBRECARREGADO
  - `MetricasAlertaService` delega em paralelo (D6 — sem remover lógica legada)
  - TDD: 16 testes
- [x] 3.2 `IntervaladoElegibilidadeSkill` (skills/eligibility/) — a partir de `IntervaladoElegibilidadeService`
  - 5 portões: lesão, TSB, fase, recuperação, ramp rate
  - `IntervaladoElegibilidadeService` delega em paralelo (D6)
  - TDD: 13 testes
- [x] 3.3 Serviços existentes adaptados para delegar sem quebrar contratos existentes
- [ ] 3.4 Versionamento inicial das skills formalizadas — **adiado para v0.2**

## 4. Integração com Geração de Plano

- [ ] 4.1 Adaptar `TreinoHistoricoProvider` para fornecer contexto às skills — **adiado**
- [ ] 4.2 Integrar `SkillOrchestratorService` ao fluxo de geração de plano — **adiado**
- [ ] 4.3 `PlanoTreinoPromptBuilder` consumir `AthleteAnalysisSnapshot` — **adiado**
- [ ] 4.4 `IaServiceImpl` usar snapshot como base do prompt — **adiado**

## 5. Capability: training-prescription-guard

- [x] 5.1 Criar `TrainingPrescriptionGuardSkill.java` (skills/prescription/)
- [x] 5.2 Validar TSS do plano versus meta semanal (× 1.15 → BLOCKER)
- [x] 5.3 Validar volume versus média últimas 4 semanas (× 1.10 → BLOCKER)
- [x] 5.4 Validar dias consecutivos, lesão e restrições fisiológicas
- [x] 5.5 Validar coerência com fase de periodização (TAPER/RECOVERY + sessão-chave → BLOCKER)
- [x] 5.6 Ramp rate > 8.0 → WARNING (não bloqueia persistência)
- TDD: 15 testes

## 5b. WeeklyDistributionSkill (absorve fix-weekly-load-distribution)

- [x] `WeeklyDistributionSkill` (skills/prescription/) — resolve fix-weekly-load-distribution como DomainSkill
  - 3 regras: LONGO no dia preferido, sem sessões-chave consecutivas, sem alta intensidade consecutiva
  - TDD: 10 testes

## 6. Capability: workout-analysis-skills

- [x] 6.1 `IntervalWorkoutAnalysisSkill` (skills/analysis/) — IF por etapas PRINCIPAL com fallback global
  - Classificação: EXCELENTE/BOA/REGULAR/FRACA por thresholds de IF
  - TDD: 15 testes
- [x] 6.2 `LongRunAnalysisSkill` (skills/analysis/) — drift de FC entre terços com fallback
  - TDD: 14 testes
- [x] 6.3 `EtapaRealizadaResumo` record compartilhado entre skills de análise (sem entidade JPA)
- [x] 6.4 Fallback para métricas agregadas quando `EtapaRealizada` não disponível
- [ ] 6.5 Expor resultados estruturados no fluxo pós-treino — **adiado para integração com API**

## 7. Precisão de Dados

- [ ] 7.1 Adaptar `TssCalculatorService` para calcular TSS por etapas — **adiado**
- [ ] 7.2 Comparar execução planejada vs. realizada por etapa — **adiado**
- [ ] 7.3 Preparar contratos de skills para futura ingestão Strava — **adiado**

## 8. Testes

- [x] 8.1 `SkillOrchestratorServiceTest` — execução ordenada, falha isolada
- [x] 8.2 `RecoveryCargaSkillTest` — 16 testes de cenários de carga/recuperação
- [x] 8.3 `IntervaladoElegibilidadeSkillTest` — 13 testes com todos os portões
- [x] 8.4 `TrainingPrescriptionGuardSkillTest` — 15 testes de guard rail
- [x] 8.5 `IntervalWorkoutAnalysisSkillTest` e `LongRunAnalysisSkillTest` — 29 testes
- [ ] 8.6 Testes de regressão por nível (iniciante/intermediário/avançado/elite) — **adiado**

## 9. Agent Layer

- [ ] 9.1–9.3 Exposição como Spring AI tools — **adiado para quando camada determinística estiver estável**
