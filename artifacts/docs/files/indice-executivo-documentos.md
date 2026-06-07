# Índice Executivo: Documentos por Sprint

**Como usar:** Para cada sprint, abra os documentos listados na ordem indicada e siga o passo a passo.

---

## 🚀 SPRINT 1-2: Foundation (Semanas 1-4)

### Atividade #1: Multi-Modelo + Skills Foundation

**Tempo estimado:** 5-7 dias

**Documentos a consultar (nesta ordem):**

1. **`menthoros-backend-ai-context.md`**
   - Lê primeiro para entender contexto completo
   - Define convenções (código EN, comentários PT, etc.)
   - **Tempo:** 30 min de leitura

2. **`guia-primeira-skill-menthoros.md`**
   - Guia passo a passo de implementação
   - Seguir Fase 1 e Fase 2
   - **Tempo:** Referência durante implementação

3. **`menthoros-skills-codigo-completo.md`**
   - Códigos Java prontos para copiar
   - Copiar: `MultiModelConfig.java`, `ModelRouter.java`, `TaskComplexity.java`, `SkillsConfig.java`
   - **Tempo:** 2-3 horas

4. **`bmad-config.yaml`** + **`openspec-config.yaml`**
   - Copiar para `.bmad/config.yaml` e `.openspec/config.yaml`
   - **Tempo:** 5 minutos

**Checklist de conclusão:**
- [ ] 4 ChatClient beans configurados (Mini, Haiku, Sonnet, GPT-4o)
- [ ] ModelRouter funcional com testes
- [ ] application.yml configurado
- [ ] API keys validadas
- [ ] Estrutura de diretórios criada (`src/main/resources/skills/`)
- [ ] Testes passando: `mvn test -Dtest=MultiModelConfigTest`

---

### Atividade #2: workout-analyzer + Translation Layer

**Tempo estimado:** 5-7 dias

**Documentos a consultar (nesta ordem):**

1. **`openspec-workout-analyzer-spec.yaml`**
   - Especificação completa da skill
   - Entender input/output schema
   - **Tempo:** 20 min de leitura

2. **`SKILL-workout-analyzer.md`**
   - Skill production-ready
   - Copiar para `src/main/resources/skills/analise/workout-analyzer/SKILL.md`
   - **Tempo:** 5 minutos para copiar

3. **`calculate_execution_delta.py`**
   - Script Python para cálculos objetivos
   - Copiar para `src/main/resources/skills/analise/workout-analyzer/scripts/`
   - **Tempo:** 5 minutos para copiar + 30 min para testar

4. **`guia-primeira-skill-menthoros.md`** (Fases 3-6)
   - Translation Layer, Integration, Tests
   - **Tempo:** Referência durante implementação

**Checklist de conclusão:**
- [ ] SKILL.md no local correto
- [ ] Script Python testado standalone
- [ ] OpenSpec validation passa
- [ ] `WorkoutAnalysisTranslator` implementado
- [ ] `WorkoutAnalysisListener` integrado com `TreinoRegistradoEvent`
- [ ] Análise gerada em português perfeito
- [ ] Latência <5s p95
- [ ] Validação manual com 20 análises reais (assertividade >85%)

**Marco do Sprint 1-2:**
✅ Foundation pronto
✅ Primeira skill rodando em produção
✅ Custos LLM reduzidos -42% vs baseline

---

## 🛡️ SPRINT 3: Segurança (Semanas 5-6)

### Atividade #3: weekly-plan-validator

**Tempo estimado:** 5-7 dias

**Documentos a consultar (nesta ordem):**

1. **`openspec-weekly-plan-validator-spec.yaml`**
   - Especificação completa
   - Schemas de input/output detalhados
   - **Tempo:** 25 min de leitura

2. **`SKILL-weekly-plan-validator.md`**
   - Skill com framework de validação
   - 5 checks: load progression, recovery, zones, periodization, monotony
   - Copiar para `src/main/resources/skills/analise/weekly-plan-validator/SKILL.md`
   - **Tempo:** 30 min de leitura + 5 min para copiar

3. **`WeeklyPlanValidatorService.java`** (em outputs)
   - Serviço Java completo
   - Copiar para `src/main/java/com/menthoros/services/`
   - **Tempo:** 1-2 horas para integrar

**DTOs a criar manualmente:**
- `ValidationResultDTO`
- `ValidatedPlanDTO`
- `ValidationIssueDTO`
- `RegenerationConstraints`
- `SuggestedModificationDTO`

**Checklist de conclusão:**
- [ ] SKILL.md no local correto
- [ ] `WeeklyPlanValidatorService` implementado
- [ ] DTOs criados
- [ ] Integrado com `PlanGeneratorService`
- [ ] Fluxo de decisão APPROVED/ADJUSTMENT/REJECTED funciona
- [ ] Auto-regeneração em caso de REJECTED
- [ ] Coach override implementado (com audit log)
- [ ] Testado com 20 planos sintéticos (10 bons, 10 ruins)

**Marco do Sprint 3:**
✅ Zero planos perigosos chegando a atletas
✅ Coach intervention rate em queda

---

## 🎯 SPRINT 4-5: Engajamento (Semanas 7-10)

### Atividade #4: weekly-feedback

**Tempo estimado:** 10-14 dias (2 sprints)

**Documentos a consultar (nesta ordem):**

1. **`openspec-weekly-feedback-spec.yaml`**
   - Especificação completa com 5 grades possíveis
   - **Tempo:** 30 min de leitura

2. **`SKILL-weekly-feedback.md`**
   - Framework de análise holística
   - Tom adaptativo por grade (EXCEPTIONAL → CHALLENGING)
   - Copiar para `src/main/resources/skills/feedback/weekly-feedback/SKILL.md`
   - **Tempo:** 45 min de leitura + 5 min para copiar

3. **`WeeklyFeedbackService.java`** (em outputs)
   - Serviço Java com listener async
   - Copiar para `src/main/java/com/menthoros/services/`
   - **Tempo:** 3-4 horas para integrar

**Componentes adicionais a criar:**

- **Entity:** `WeeklyFeedback` (id, atletaId, weekNumber, grade, score, achievements, ...)
- **Repository:** `WeeklyFeedbackRepository`
- **Translator:** `WeeklyFeedbackTranslator` (EN→PT)
- **Event:** `SemanaConcluidaEvent` (atletaId, weekStartDate, weekEndDate, weekNumber)
- **Listener:** `SemanaConcluidaListener` (detecta último treino da semana)
- **Scheduler:** `WeeklyFeedbackScheduler` (segunda-feira 6h)
- **Notification:** Push + email
- **Frontend:** Tela de visualização do feedback

**Checklist de conclusão:**
- [ ] SKILL.md no local correto
- [ ] Service Java integrado
- [ ] Entity e repository criados
- [ ] Translator EN→PT completo
- [ ] Evento e listener funcionais
- [ ] Scheduler configurado
- [ ] Notificações funcionando
- [ ] Frontend exibindo feedback
- [ ] Teste end-to-end com atleta real
- [ ] 30 feedbacks gerados em produção sem erros

**Marco do Sprint 4-5:**
✅ Atletas recebem feedback semanal automático
✅ Início do piloto de 30 atletas
✅ Coleta de NPS começa

---

## ⏸️ SPRINT 6: Pausa Estratégica (Semanas 11-12)

**Não é desenvolvimento, é análise crítica.**

### Atividades:

1. **Análise quantitativa dos resultados**
   - Custos LLM reais vs projetados
   - Latência em produção
   - Taxa de erro por skill
   - **Documento de saída:** Relatório de desempenho

2. **Análise qualitativa com pilotos**
   - Entrevistas com 10 atletas
   - Entrevistas com 5 coaches
   - Coleta de sugestões
   - **Documento de saída:** Insights do piloto

3. **Decisão go/no-go para Tier 2**
   - Skills atuais validadas? → Seguir para #5
   - Skills precisam de ajustes? → Iterar antes de seguir
   - ROI confirmado? → Continuar conforme roadmap

4. **Ajustes técnicos**
   - Otimizar prompts baseado em casos reais
   - Ajustar thresholds (RPE delta, TSB, etc.)
   - Adicionar telemetria adicional

**Marco do Sprint 6:**
✅ Decisão validada com dados reais
✅ Pivots aplicados se necessário
✅ Plano dos próximos 12 sprints refinado

---

## 🧠 SPRINT 7-9: Inteligência (Semanas 13-18)

### Atividade #5: insights-extractor + AthleteLearningProfile

**Tempo estimado:** 15-21 dias (3 sprints)

**Documentos a consultar (nesta ordem):**

1. **`loop-aprendizado-arquitetura.md`**
   - Documento estratégico completo
   - Entender o loop fechado de aprendizado
   - **Tempo:** 1 hora de leitura cuidadosa

2. **`openspec-insights-extractor-spec.yaml`**
   - Especificação da skill
   - Mecanismo de validação de patterns
   - **Tempo:** 30 min de leitura

3. **`SKILL-insights-extractor.md`**
   - Skill com taxonomia de 7 categorias de patterns
   - Confidence calculation
   - Copiar para `src/main/resources/skills/learning/insights-extractor/SKILL.md`
   - **Tempo:** 1 hora de leitura

**Componentes a criar (substancial):**

**Entities (JPA):**
- `AthleteLearningProfile` (atletaId, totalWeeksTracked, profileMaturityScore, lastUpdated)
- `LearnedPattern` (embeddable: insightId, category, observation, status, confidence, occurrences, firstObserved, lastObserved)
- `ActionableConstraint` (embeddable: appliesTo, constraintType, constraintValue, exampleApplication)

**Repositories:**
- `AthleteLearningProfileRepository`
- Custom queries: findByAtletaIdWithPatterns, findEmergingPatterns, etc.

**Services:**
- `InsightsExtractorService` (invoca a skill)
- `ProfileUpdateService` (aplica updates atomicamente)
- `ConstraintExtractor` (converte patterns → constraints para plan generator)

**Listeners:**
- `WeeklyFeedbackCompletedListener` (dispara extractor após weekly-feedback)

**Modificações:**
- `PlanGeneratorService`:
  - Carregar profile antes de gerar plano
  - Construir prompt com constraints
  - Logar quais patterns foram aplicados

**Dashboard para Coach:**
- Tela "Profile do Atleta"
- Lista de confirmed patterns
- Mecanismo de override manual
- Histórico de aprendizado

**Migration SQL:**
```sql
CREATE TABLE athlete_learning_profile (
    atleta_id BIGINT PRIMARY KEY,
    total_weeks_tracked INT DEFAULT 0,
    profile_maturity_score INT DEFAULT 0,
    last_updated TIMESTAMP
);

CREATE TABLE alp_learned_pattern (
    id UUID PRIMARY KEY,
    atleta_id BIGINT REFERENCES athlete_learning_profile,
    category VARCHAR(50),
    observation TEXT,
    pattern_status VARCHAR(30),
    confidence INT,
    occurrences INT,
    constraint_type VARCHAR(100),
    constraint_value TEXT,
    first_observed TIMESTAMP,
    last_observed TIMESTAMP
);

CREATE INDEX idx_alp_atleta_status ON alp_learned_pattern(atleta_id, pattern_status);
```

**Checklist de conclusão:**
- [ ] SKILL.md no local correto
- [ ] Entities + repositories criados
- [ ] Service Java implementado
- [ ] Listener integrado com weekly-feedback
- [ ] PlanGeneratorService modificado para consumir profile
- [ ] Migration SQL aplicada
- [ ] Dashboard para coach implementado
- [ ] Override manual funcional
- [ ] Audit log de mudanças no profile
- [ ] Teste E2E: gerar 8 semanas de dados sintéticos → verificar profile evoluindo
- [ ] Validação com piloto: profile maturity score crescendo

**Marco do Sprint 7-9:**
✅ Sistema aprendendo de cada atleta
✅ Planos personalizando-se automaticamente
✅ Coaches vendo profiles evoluírem

---

## 🔍 SPRINT 10: Consulta (Semanas 19-20)

### Atividade #6: Consulta Histórica (Camadas 1+2)

**Tempo estimado:** 10-14 dias

**Componentes a criar:**

**Backend:**
- `TreinoConsultaController` (REST API)
- `TreinoConsultaService`
- `TreinoFiltro` DTO
- pgvector setup para descrições de treinos
- `BuscaSemanticaService` com GPT-4o Mini
- Embedding service para indexar treinos

**APIs a expor:**
```
GET /api/v1/treinos
  ?dataInicio=2026-01-01
  &dataFim=2026-01-31
  &tipo=LONG_RUN
  &rpeMin=5

GET /api/v1/treinos/buscar
  ?query=treino com dor no joelho

GET /api/v1/treinos/estatisticas
  ?periodoInicio=2026-01-01
  &periodoFim=2026-04-01
```

**Frontend:**
- Tela de histórico com filtros
- Busca natural (campo de texto livre)
- Visualização de estatísticas
- Drill-down para detalhes do treino

**Checklist de conclusão:**
- [ ] API SQL <100ms p95
- [ ] Busca semântica <500ms p95
- [ ] pgvector indexando treinos
- [ ] Frontend com filtros funcionais
- [ ] Atletas conseguem buscar por linguagem natural
- [ ] Estatísticas agregadas funcionando

**Marco do Sprint 10:**
✅ Atletas exploram histórico
✅ Engajamento medido por consultas/semana

---

## 🎨 SPRINT 11-12: Refinamento (Semanas 21-24)

### Atividades:

**Sprint 11: Dashboards**
- Dashboard de custos LLM (Grafana)
- Dashboard de coach (visão consolidada dos atletas)
- Dashboard de atleta (evolução, profile, conquistas)
- Alertas automáticos (custos >120%, latência >threshold, erros)

**Sprint 12: Preparação para escala**
- Performance testing (500 → 2000 atletas)
- Caching strategy (Redis para skills mais usadas)
- Otimização de queries (índices, particionamento)
- Documentação técnica completa
- Runbooks para incidents

**Marco final:**
✅ Plataforma madura
✅ Pronta para 2000+ atletas
✅ Métricas-chave monitoradas
✅ ROI confirmado

---

## 📊 Resumo: Documentos vs Sprints

| Sprint | Atividade | Documentos Principais |
|--------|-----------|----------------------|
| 1-2 | Foundation + workout-analyzer | `menthoros-backend-ai-context.md`, `guia-primeira-skill-menthoros.md`, `menthoros-skills-codigo-completo.md`, `SKILL-workout-analyzer.md` |
| 3 | weekly-plan-validator | `openspec-weekly-plan-validator-spec.yaml`, `SKILL-weekly-plan-validator.md`, `WeeklyPlanValidatorService.java` |
| 4-5 | weekly-feedback | `openspec-weekly-feedback-spec.yaml`, `SKILL-weekly-feedback.md`, `WeeklyFeedbackService.java` |
| 6 | Pausa estratégica | Relatórios próprios |
| 7-9 | insights-extractor + profile | `loop-aprendizado-arquitetura.md`, `SKILL-insights-extractor.md`, `openspec-insights-extractor-spec.yaml` |
| 10 | Consulta histórica | (a especificar quando chegar) |
| 11-12 | Refinamento | Dashboards próprios |

---

## ⚡ Quick Start (Para Começar HOJE)

**Próximas 4 horas:**

1. **Hora 1:** Ler `menthoros-backend-ai-context.md` (entender contexto)
2. **Hora 2:** Ler `roadmap-menthoros-priorizado-roi.md` (entender plano)
3. **Hora 3:** Criar estrutura de diretórios + adicionar dependências Maven
4. **Hora 4:** Configurar API keys + criar branch `feature/multi-modelo-foundation`

**Próximos 5 dias:**

1. **Dia 1:** Implementar `MultiModelConfig.java` + `TaskComplexity.java`
2. **Dia 2:** Implementar `ModelRouter.java` + testes
3. **Dia 3:** Implementar `SkillsConfig.java`
4. **Dia 4:** Configurar `application.yml` + testar com chamadas reais
5. **Dia 5:** Code review + deploy em homologação

**Próximos 14 dias (Sprint 1):**
- Concluir Atividade #1 (Foundation)
- Começar Atividade #2 (workout-analyzer)

---

## 🎯 Princípios de Execução

1. **Implementar uma atividade por vez** - não paralelizar
2. **Validar antes de avançar** - cada sprint tem critérios de aceitação
3. **Documentar decisões** - especialmente desvios do plano
4. **Medir constantemente** - métricas técnicas e de negócio
5. **Iterar com base em dados** - não em opiniões

---

**Pronto para começar?**

Próximo passo: abrir `menthoros-backend-ai-context.md` e iniciar o Sprint 1.

Boa execução! 🚀
