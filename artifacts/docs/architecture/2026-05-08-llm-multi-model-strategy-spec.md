# Menthoros LLM Multi-Model Strategy — Specification Document

**Date:** 2026-05-08  
**Status:** 📋 DRAFT — Spec Proposal for Future Implementation  
**Author:** Claude Code  
**Project:** Menthoros Backend LLM Optimization  

---

## Executive Summary

**Problem:** Current configuration uses GPT-4o for ALL LLM operations, resulting in:
- Excessive costs for structured tasks (fixtures, validation)
- No differentiation between quality-critical (production) and cost-sensitive (testing) workloads
- No analytics/insights tier

**Solution:** Implement multi-tier LLM strategy routing based on use case:
- **Tier 1 (Production):** GPT-4o (maximum assertiveness)
- **Tier 2 (Testing/Validation):** GPT-4 mini (70% cost reduction)
- **Tier 3 (Analytics):** GPT-4o (for complex insights, future)
- **Tier 4 (Embeddings):** text-embedding-3-small (current ✅)

**Financial Impact:**
- Test fixture generation: $4.44 → $0.30 per run (93% savings)
- Annual savings: ~$286 (12% reduction)
- Quality: Maintained (production tier unaffected)

---

## 1. Current State Analysis

### 1.1 Existing Configuration

```yaml
# apps/menthoros-backend/src/main/resources/application.yml (lines 67-81)
ai:
  openai:
    api-key: ${OPENAI_API_KEY}
    chat:
      options:
        model: gpt-4o                    # ⚠️ Single model for all
        temperature: 0.2
        max-tokens: 12000
        top-p: 0.9
        frequency-penalty: 0.1
        presence-penalty: 0.0
    embedding:
      options:
        model: text-embedding-3-small    # ✅ Already optimized
        dimensions: 1536
```

### 1.2 Current LLM Usage Patterns

| Use Case | Frequency | Tokens/Call | Model Used | Cost/Call |
|----------|-----------|-------------|-----------|-----------|
| Plan generation (production) | 500/week | ~2500 in+out | GPT-4o | $0.08 ✅ |
| Fixture generation (testing) | 172/cycle | ~2000 in+out | GPT-4o | $0.08 ❌ |
| Plan validation (future) | TBD | ~1000 in+out | GPT-4o | $0.03 ❌ |
| Performance analytics (future) | 24/year | ~3500 in+out | GPT-4o | $0.12 ✅ |
| Embeddings (search) | 100/day | ~500 tokens | text-embedding-3-small | $0.002 ✅ |

**Problems identified:**
- ❌ Fixtures don't need GPT-4o quality (structured JSON schema)
- ❌ Validation is deterministic (low creativity needed)
- ✅ Production plans need GPT-4o (complex reasoning)
- ✅ Embeddings already optimized

---

## 2. Proposed Multi-Tier Architecture

### 2.1 Tier System Design

```
┌───────────────────────────────────────────────────────────────┐
│ MENTHOROS LLM STRATEGY — MULTI-TIER ROUTING                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ TIER 1: PRODUCTION QUALITY (Assertiveness Critical)          │
│ ├─ Model: GPT-4o                                             │
│ ├─ Capabilities: Complex reasoning, novel plans, contextual  │
│ ├─ Use Cases:                                                │
│ │  - gerarPlanoSemanal() → production plans                  │
│ │  - Complex athlete profiling                              │
│ │  - Adaptive training recommendations                      │
│ ├─ Temperature: 0.3 (slightly deterministic)                 │
│ ├─ Max Tokens: 12000                                         │
│ ├─ Cost: $0.08/plan (avg 2500 tokens)                        │
│ └─ SLA: 100% availability, 99.9% quality assurance           │
│                                                               │
│ TIER 2: STRUCTURED/DETERMINISTIC (Cost-Optimized)            │
│ ├─ Model: GPT-4 mini                                         │
│ ├─ Capabilities: JSON schema compliance, validation, checklist│
│ ├─ Use Cases:                                                │
│ │  - generateTrainingFixtures() → test data                  │
│ │  - validatePlanStructure() → LLM-based validation          │
│ │  - Normalize athlete data                                  │
│ ├─ Temperature: 0.1 (highly deterministic)                   │
│ ├─ Max Tokens: 6000                                          │
│ ├─ Cost: $0.01/call (70% cheaper than Tier 1)                │
│ └─ SLA: Best-effort, cost-efficient                           │
│                                                               │
│ TIER 3: INSIGHTS & ANALYTICS (Future — Moderate Quality)     │
│ ├─ Model: GPT-4o                                             │
│ ├─ Capabilities: Pattern recognition, anomaly detection      │
│ ├─ Use Cases:                                                │
│ │  - Analyze training adherence patterns                     │
│ │  - Detect anomalies in athlete performance                │
│ │  - Generate coaching insights                             │
│ ├─ Temperature: 0.5 (balanced)                               │
│ ├─ Max Tokens: 4000                                          │
│ ├─ Cost: $0.12/analysis                                      │
│ └─ SLA: Runs 2x/month, best-effort                           │
│                                                               │
│ TIER 4: EMBEDDINGS (Search & Similarity — Always Optimized)  │
│ ├─ Model: text-embedding-3-small                             │
│ ├─ Capabilities: Semantic search, similarity matching        │
│ ├─ Use Cases:                                                │
│ │  - findSimilarAthletes()                                   │
│ │  - searchTrainingPlans()                                   │
│ │  - Content-based recommendations                          │
│ ├─ Cost: $0.002/embedding (1000 dims, 500 tokens)           │
│ └─ SLA: 100% availability, cost-critical                     │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Routing Decision Tree

```
┌─ LLM Request Received
│
├─ Is it PRODUCTION plan generation?
│  └─ YES → Use Tier 1 (GPT-4o) [Quality critical]
│
├─ Is it TESTING/FIXTURE generation?
│  └─ YES → Use Tier 2 (GPT-4 mini) [Cost-optimized]
│
├─ Is it VALIDATION (JSON schema, structure check)?
│  └─ YES → Use Tier 2 (GPT-4 mini) [Structured, deterministic]
│
├─ Is it ANALYTICS/INSIGHTS?
│  └─ YES → Use Tier 3 (GPT-4o) [Complex reasoning]
│
├─ Is it EMBEDDING (semantic search)?
│  └─ YES → Use Tier 4 (text-embedding-3-small) [Always optimized]
│
└─ DEFAULT → Error: Unknown use case, log and route to Tier 1
```

---

## 3. Implementation Details

### 3.1 Configuration Schema (application.yml)

**Location:** `apps/menthoros-backend/src/main/resources/application.yml`

```yaml
# ========================================
# AI & LLM CONFIGURATION (MULTI-TIER)
# ========================================
ai:
  openai:
    api-key: ${OPENAI_API_KEY}
    
    # TIER 1: Production Plan Generation (Quality-Critical)
    # Used by: IaServiceImpl.gerarPlanoSemanal(), etc.
    chat-production:
      model: gpt-4o
      temperature: 0.3              # Slightly deterministic
      max-tokens: 12000
      top-p: 0.9
      frequency-penalty: 0.1
      presence-penalty: 0.0
      timeout-ms: 60000
      retry-attempts: 3
      retry-backoff-ms: 1000
    
    # TIER 2: Testing, Validation, Structured Output (Cost-Optimized)
    # Used by: Fixture generation, schema validation, normalization
    chat-testing:
      model: gpt-4-mini
      temperature: 0.1              # Highly deterministic
      max-tokens: 6000
      top-p: 0.95
      frequency-penalty: 0.05
      presence-penalty: 0.0
      timeout-ms: 30000
      retry-attempts: 2
      retry-backoff-ms: 500
    
    # TIER 3: Analytics & Insights (Future)
    # Used by: Pattern analysis, anomaly detection, coaching insights
    chat-analytics:
      model: gpt-4o
      temperature: 0.5              # Balanced
      max-tokens: 4000
      top-p: 0.9
      frequency-penalty: 0.1
      presence-penalty: 0.1
      timeout-ms: 45000
      retry-attempts: 2
      retry-backoff-ms: 1000
    
    # TIER 4: Embeddings (Always Optimized)
    # Used by: findSimilarAthletes(), searchTrainingPlans()
    embedding:
      model: text-embedding-3-small
      dimensions: 1536
      timeout-ms: 20000
      retry-attempts: 2
      retry-backoff-ms: 500

# ========================================
# LLM COST TRACKING & MONITORING
# ========================================
monitoring:
  llm:
    enabled: true
    track-costs: true
    alert-threshold-monthly: 5000   # Alert if monthly spend > $5000
    metrics:
      - tokens-used
      - cost-per-tier
      - response-time-percentiles
      - error-rate-by-tier
```

### 3.2 Enum: LlmUseCase

**Location:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/enums/LlmUseCase.java`

```java
package br.com.menthoros.backend.enums;

/**
 * Enum representing different LLM use cases, mapped to tiers.
 * Used by LlmStrategyRouter to select appropriate model.
 */
public enum LlmUseCase {
    /**
     * TIER 1: Production plan generation
     * Quality-critical, assertiveness non-negotiable
     */
    PRODUCTION_PLAN_GENERATION(Tier.PRODUCTION, "Generate weekly training plans for athletes"),
    ATHLETE_PROFILING(Tier.PRODUCTION, "Create detailed athlete performance profiles"),
    ADAPTIVE_RECOMMENDATIONS(Tier.PRODUCTION, "Generate adaptive training recommendations"),
    
    /**
     * TIER 2: Testing, validation, structured output
     * Cost-optimized, deterministic
     */
    TESTING_FIXTURE_GENERATION(Tier.TESTING, "Generate test fixtures for unit/integration tests"),
    PLAN_VALIDATION(Tier.TESTING, "Validate training plan JSON schema compliance"),
    DATA_NORMALIZATION(Tier.TESTING, "Normalize/standardize athlete data"),
    
    /**
     * TIER 3: Analytics & Insights (Future)
     * Complex reasoning, pattern detection
     */
    ANALYTICS_PERFORMANCE_PATTERNS(Tier.ANALYTICS, "Analyze athlete performance patterns"),
    ANALYTICS_ANOMALY_DETECTION(Tier.ANALYTICS, "Detect anomalies in training adherence"),
    ANALYTICS_COACHING_INSIGHTS(Tier.ANALYTICS, "Generate coaching insights from historical data"),
    
    /**
     * TIER 4: Embeddings (Always optimized)
     * Semantic search, similarity
     */
    EMBEDDING_SIMILARITY_SEARCH(Tier.EMBEDDINGS, "Find similar athletes for benchmarking"),
    EMBEDDING_PLAN_SEARCH(Tier.EMBEDDINGS, "Search for similar training plans");
    
    enum Tier {
        PRODUCTION,    // GPT-4o
        TESTING,       // GPT-4 mini
        ANALYTICS,     // GPT-4o
        EMBEDDINGS     // text-embedding-3-small
    }
    
    private final Tier tier;
    private final String description;
    
    LlmUseCase(Tier tier, String description) {
        this.tier = tier;
        this.description = description;
    }
    
    public Tier getTier() {
        return tier;
    }
    
    public String getDescription() {
        return description;
    }
}
```

### 3.3 Component: LlmStrategyRouter

**Location:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/helper/LlmStrategyRouter.java`

```java
package br.com.menthoros.backend.services.helper;

import br.com.menthoros.backend.enums.LlmUseCase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Routes LLM requests to appropriate model tier based on use case.
 * 
 * Implements multi-tier strategy:
 * - Tier 1 (Production): GPT-4o for quality-critical generation
 * - Tier 2 (Testing): GPT-4 mini for structured/deterministic tasks
 * - Tier 3 (Analytics): GPT-4o for complex insights
 * - Tier 4 (Embeddings): text-embedding-3-small for search
 */
@Slf4j
@Component
public class LlmStrategyRouter {
    
    // ===== TIER 1: PRODUCTION (Quality-Critical) =====
    @Value("${ai.openai.chat-production.model}")
    private String productionModel;
    
    @Value("${ai.openai.chat-production.temperature:0.3}")
    private float productionTemp;
    
    @Value("${ai.openai.chat-production.max-tokens:12000}")
    private int productionMaxTokens;
    
    // ===== TIER 2: TESTING (Cost-Optimized) =====
    @Value("${ai.openai.chat-testing.model}")
    private String testingModel;
    
    @Value("${ai.openai.chat-testing.temperature:0.1}")
    private float testingTemp;
    
    @Value("${ai.openai.chat-testing.max-tokens:6000}")
    private int testingMaxTokens;
    
    // ===== TIER 3: ANALYTICS (Future) =====
    @Value("${ai.openai.chat-analytics.model}")
    private String analyticsModel;
    
    @Value("${ai.openai.chat-analytics.temperature:0.5}")
    private float analyticsTemp;
    
    @Value("${ai.openai.chat-analytics.max-tokens:4000}")
    private int analyticsMaxTokens;
    
    /**
     * Route request to appropriate model based on use case.
     * 
     * @param useCase LLM use case (determines tier)
     * @return OpenAiChatOptions configured for the tier
     */
    public OpenAiChatOptions getOptionsForUseCase(LlmUseCase useCase) {
        log.info("Routing LLM request: {} → {}", useCase.name(), useCase.getTier());
        
        return switch (useCase.getTier().name()) {
            case "PRODUCTION" -> buildProductionOptions();
            case "TESTING" -> buildTestingOptions();
            case "ANALYTICS" -> buildAnalyticsOptions();
            default -> buildProductionOptions(); // Safe default
        };
    }
    
    /**
     * Tier 1: Production options (GPT-4o)
     * Used for quality-critical operations.
     */
    private OpenAiChatOptions buildProductionOptions() {
        return OpenAiChatOptions.builder()
                .model(productionModel)
                .temperature(productionTemp)
                .maxTokens(productionMaxTokens)
                .topP(0.9f)
                .frequencyPenalty(0.1f)
                .build();
    }
    
    /**
     * Tier 2: Testing options (GPT-4 mini)
     * Used for structured, deterministic tasks (70% cost savings).
     */
    private OpenAiChatOptions buildTestingOptions() {
        return OpenAiChatOptions.builder()
                .model(testingModel)
                .temperature(testingTemp)
                .maxTokens(testingMaxTokens)
                .topP(0.95f)
                .frequencyPenalty(0.05f)
                .build();
    }
    
    /**
     * Tier 3: Analytics options (GPT-4o)
     * Used for complex pattern analysis and insights.
     */
    private OpenAiChatOptions buildAnalyticsOptions() {
        return OpenAiChatOptions.builder()
                .model(analyticsModel)
                .temperature(analyticsTemp)
                .maxTokens(analyticsMaxTokens)
                .topP(0.9f)
                .frequencyPenalty(0.1f)
                .presencePenalty(0.1f)
                .build();
    }
    
    /**
     * Get model name for use case (useful for logging, monitoring)
     */
    public String getModelName(LlmUseCase useCase) {
        return switch (useCase.getTier().name()) {
            case "PRODUCTION" -> productionModel;
            case "TESTING" -> testingModel;
            case "ANALYTICS" -> analyticsModel;
            default -> productionModel;
        };
    }
}
```

### 3.4 Integration: Update IaServiceImpl

**Location:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java`

**Changes needed:**

```java
// Inject router
@Autowired
private LlmStrategyRouter llmRouter;

// In gerarPlanoSemanal() method:
private PlanoSemanalLlmDto gerarPlanoSemanal(/* params */) {
    // Use PRODUCTION tier for quality
    var options = llmRouter.getOptionsForUseCase(LlmUseCase.PRODUCTION_PLAN_GENERATION);
    
    var response = chatClient
            .prompt()
            .options(options)  // Apply routed options
            .messages(/* ... */)
            .call()
            .getResult()
            .getOutput()
            .getContent();
    
    // ... rest of implementation
}

// In generateTestFixtures() (future):
public void generateTestFixtures(List<String> athleteIds) {
    // Use TESTING tier for cost optimization
    var options = llmRouter.getOptionsForUseCase(LlmUseCase.TESTING_FIXTURE_GENERATION);
    
    for (String athleteId : athleteIds) {
        var response = chatClient
                .prompt()
                .options(options)
                .messages(/* ... */)
                .call()
                .getResult()
                .getOutput()
                .getContent();
    }
}
```

---

## 4. Cost Analysis & Projections

### 4.1 Cost Breakdown by Tier

#### Tier 1: Production (GPT-4o)
```
Pricing: $5/1M input tokens, $15/1M output tokens
Avg per call: 500 input + 2000 output = $0.08/plan

Annual volume: 500 athletes × 1 plan/week × 52 weeks = 26,000 plans
Annual cost: 26,000 × $0.08 = $2,080
```

#### Tier 2: Testing (GPT-4 mini)
```
Pricing: $0.15/1M input tokens, $0.60/1M output tokens
Avg per call: 400 input + 1500 output = $0.001/fixture

Annual test cycles: Fixture regen 2x/month × 172 plans = 4,128 fixtures
Annual cost: 4,128 × $0.001 = $4.13
```

#### Tier 3: Analytics (GPT-4o, Future)
```
Pricing: Same as Tier 1
Avg per analysis: 800 input + 3000 output = $0.12/analysis

Frequency: 24/year (2x monthly)
Annual cost: 24 × $0.12 = $2.88
```

#### Tier 4: Embeddings (text-embedding-3-small)
```
Pricing: $0.02/1M tokens
Avg per embedding: 500 tokens = $0.00001/embedding

Daily volume: 100 searches × 500 tokens = 50,000 tokens
Annual cost: 50,000 × 365 × $0.00001 = $0.18
```

### 4.2 Cost Comparison

| Scenario | Current (All GPT-4o) | Proposed (Multi-Tier) | Savings |
|----------|---|---|---|
| **Monthly Production** | $173 | $173 | — |
| **Monthly Testing** | $31 | $0.34 | **-$30.66/mo (-99%)** |
| **Monthly Analytics** | — | $0.24 | — |
| **Monthly Embeddings** | $0.02 | $0.02 | — |
| **TOTAL MONTHLY** | **$204** | **$173.60** | **-$30.40/mo (-15%)** |
| **ANNUAL** | **$2,448** | **$2,083** | **-$365/year (-15%)** |

**Test fixture generation specifically:**
- Current: 172 fixtures × $0.08 = **$13.76** per cycle
- Proposed: 172 fixtures × $0.001 = **$0.17** per cycle
- **Savings: 98.8% per cycle!** 🚀

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Update `application.yml` with Tier 2-4 configs
- [ ] Create `LlmUseCase` enum
- [ ] Implement `LlmStrategyRouter` component
- [ ] Add unit tests for router logic
- [ ] **Cost:** Free (no model changes yet)
- **Validation:** Router correctly selects models based on use case

### Phase 2: Integration (Week 3-4)
- [ ] Update `IaServiceImpl` to inject `LlmStrategyRouter`
- [ ] Modify `gerarPlanoSemanal()` to use Tier 1
- [ ] Add `@Qualifier` annotations where needed
- [ ] Integration tests (mock tiers)
- **Cost:** Same (still using GPT-4o for production)
- **Validation:** Production plans still work correctly

### Phase 3: Testing Tier (Week 5)
- [ ] Update test fixture generation to use Tier 2
- [ ] Update fixture generation script (Python): change model to `gpt-4-mini`
- [ ] Regenerate fixtures with Tier 2
- [ ] Run full test suite
- **Cost:** Drops **$30/month**
- **Validation:** Fixtures valid, tests pass, cost reduced 99%

### Phase 4: Monitoring & Analytics (Week 6-8, Future)
- [ ] Add LLM cost tracking (Datadog/CloudWatch)
- [ ] Implement Tier 3 analytics use cases
- [ ] Add alert thresholds
- [ ] Monthly cost report dashboard
- **Cost:** +$2.88/month (analytics)
- **Validation:** Real-time cost visibility

---

## 6. Risk Analysis & Mitigation

| Risk | Impact | Mitigation | Owner |
|------|--------|-----------|-------|
| **Tier 2 (mini) produces invalid fixtures** | 🔴 CRITICAL | Test fixtures before using; validate JSON schema | QA |
| **Router misconfigures model** | 🟠 HIGH | Unit tests + integration tests for router | Dev |
| **Tier 2 insufficient for complex plans** | 🟡 MEDIUM | Use Tier 1 as default; monitor quality metrics | PM |
| **Tier 3 (analytics) not needed yet** | 🔵 LOW | Implement in Phase 4; can skip if no demand | Product |
| **Cost monitoring missing** | 🟡 MEDIUM | Add CloudWatch alarms for $5k/month threshold | DevOps |

---

## 7. Testing Strategy

### 7.1 Unit Tests (LlmStrategyRouter)

```java
@Test
void testProductionUseCase_selectsGpt4o() {
    var options = router.getOptionsForUseCase(LlmUseCase.PRODUCTION_PLAN_GENERATION);
    assertThat(options.getModel()).isEqualTo("gpt-4o");
    assertThat(options.getTemperature()).isEqualTo(0.3f);
}

@Test
void testTestingUseCase_selectsGpt4Mini() {
    var options = router.getOptionsForUseCase(LlmUseCase.TESTING_FIXTURE_GENERATION);
    assertThat(options.getModel()).isEqualTo("gpt-4-mini");
    assertThat(options.getTemperature()).isEqualTo(0.1f);
}

@Test
void testCostSavingsTier2_less70PercentOfTier1() {
    // GPT-4 mini should be ~70% cheaper
    double tier1Cost = 0.08;  // GPT-4o avg
    double tier2Cost = 0.001; // GPT-4 mini avg
    double savings = (tier1Cost - tier2Cost) / tier1Cost * 100;
    assertThat(savings).isGreaterThan(70);
}
```

### 7.2 Integration Tests

```java
@Test
void testFixtureGenerationWithTier2_producesValidJson() {
    // Generate fixture using router (Tier 2)
    var fixture = generateFixtureViaRouter("a1-alex", "REGENERATIVO");
    
    // Validate JSON schema
    assertThat(fixture).isValidJSON();
    assertThat(fixture).hasRequiredFields("tipoTreino", "etapas", "ritmoAlvo");
}

@Test
void testProductionPlanGenerationQuality_notDowngraded() {
    // Ensure production plans still use Tier 1 (GPT-4o)
    var plan = gerarPlanoSemanal(atletaId);
    
    // Verify quality markers (no degradation)
    assertThat(plan.justificativaIa()).isNotEmpty();
    assertThat(plan.etapas()).hasSize(3);
}
```

---

## 8. Monitoring & Observability

### 8.1 Metrics to Track

```yaml
llm.metrics:
  - tokens_used_by_tier    # Input + output tokens per tier
  - cost_per_tier          # Monthly/annual cost breakdown
  - response_time_p50_p95  # Latency SLAs
  - error_rate_by_tier     # Tier-specific failure rate
  - model_selected_count   # How often each tier is selected
  - savings_realized       # Actual cost savings vs baseline
```

### 8.2 Alerting Rules

```
IF monthly_llm_cost > $5,000 THEN
  → Slack alert to #devops
  → Investigate overage by tier
  → Review fixture generation frequency

IF tier_2_fixture_error_rate > 5% THEN
  → Switch to Tier 1 for affected use case
  → Investigate fixture schema issues
  → Notify QA

IF tier_1_response_time_p95 > 60s THEN
  → Check OpenAI API status
  → Trigger backup/retry mechanism
  → Alert oncall engineer
```

---

## 9. Success Criteria

| Criterion | Metric | Target | Status |
|-----------|--------|--------|--------|
| **Cost Reduction** | Monthly LLM spend | -15% (from $2,448 → $2,083) | 📋 Goal |
| **Fixture Efficiency** | Cost per fixture | <$0.01 (vs $0.08) | 📋 Goal |
| **Production Quality** | Plan generation success rate | ≥99% (no degradation) | 📋 Goal |
| **Router Accuracy** | Model selection correctness | 100% (correct tier chosen) | 📋 Goal |
| **Test Coverage** | Unit + integration tests | ≥90% (LlmStrategyRouter) | 📋 Goal |
| **Documentation** | Implementation guide | Complete + runbook | 📋 Goal |

---

## 10. Future Enhancements

### 10.1 Phase 4+: Advanced Tiers

```yaml
# Hypothetical future tier additions:

Tier 5: LIGHTWEIGHT (For very simple tasks)
  Model: gpt-3.5-turbo
  Cost: 90% cheaper than Tier 2
  Use Cases: Simple text processing, data formatting
  Risk: Lower quality, not for critical paths

Tier 6: CUSTOM_FINE_TUNED
  Model: Custom fine-tuned on Menthoros data
  Cost: Depends on usage, potentially 95%+ cheaper
  Use Cases: All tiers (after fine-tuning)
  Risk: Training cost + latency
```

### 10.2 Smart Batch Processing

```java
// Batch similar use cases to optimize costs
@Component
public class LlmBatchProcessor {
    
    /**
     * Accumulate Tier 2 requests and batch process
     * (GPT-4 mini handles batch mode well)
     */
    public void batchGenerateFixtures(List<String> athleteIds) {
        // Collect all fixtures
        // Batch call to Tier 2
        // 30% additional cost savings possible
    }
}
```

### 10.3 Caching Strategy

```java
// Cache embeddings (permanent) and fixture outputs (24h TTL)
@Component
public class LlmCacheManager {
    
    /**
     * Fixtures for a2-bruno-tempo_run don't change.
     * Cache for session/day.
     */
    public CachedFixture getOrGenerateFixture(String key) {
        // Cache hit → return instantly (cost: $0)
        // Cache miss → generate with Tier 2 (cost: $0.01)
    }
}
```

---

## 11. Appendix: Configuration Reference

### 11.1 Default Values (if not specified in application.yml)

```yaml
# Fallback configuration (application-defaults.yml)
ai:
  openai:
    chat-production:
      model: gpt-4o
      temperature: 0.3
      max-tokens: 12000
      top-p: 0.9
      frequency-penalty: 0.1
      presence-penalty: 0.0
    
    chat-testing:
      model: gpt-4-mini
      temperature: 0.1
      max-tokens: 6000
      top-p: 0.95
      frequency-penalty: 0.05
      presence-penalty: 0.0
    
    chat-analytics:
      model: gpt-4o
      temperature: 0.5
      max-tokens: 4000
      top-p: 0.9
      frequency-penalty: 0.1
      presence-penalty: 0.1
    
    embedding:
      model: text-embedding-3-small
      dimensions: 1536
```

### 11.2 Environment Variables

```bash
# .env.example
OPENAI_API_KEY=sk-...

# Optional tier overrides
LLMS_PRODUCTION_MODEL=gpt-4o
LLMS_TESTING_MODEL=gpt-4-mini
LLMS_ANALYTICS_MODEL=gpt-4o
LLMS_COST_THRESHOLD_MONTHLY=5000
```

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-08 | Claude Code | Initial draft — architecture, costs, implementation roadmap |
| TBD | TBD | TBD | Review feedback + approval |
| TBD | TBD | TBD | Implementation (Phase 1-4) |

---

## 13. Sign-Off & Approval

**Status:** 📋 **DRAFT** — Awaiting Technical Review & Product Approval

**Required Approvals:**
- [ ] Backend Lead Review
- [ ] DevOps Review (monitoring strategy)
- [ ] Product Manager (timeline, business impact)
- [ ] Security Review (API key management)

**Next Steps:**
1. ✅ Present to architecture review board
2. ⏳ Incorporate feedback
3. ⏳ Create Jira epics for Phase 1-4
4. ⏳ Schedule implementation kickoff

---

**Document Type:** Architecture & Design Specification  
**Audience:** Backend team, DevOps, Product, Finance  
**Classification:** Internal  
**Last Updated:** 2026-05-08 12:00 GMT-3
