## Context

O backend roda Java 21, Spring Boot 3.5.x, Spring Data JPA, Flyway e Spring AI. Pacote raiz: `br.com.menthoros.backend`. Multi-tenancy por `tenant_id`. Já existe lógica determinística em `IntervaladoElegibilidadeService` e `MetricasAlertaService` que será formalizada sem ser removida. O `PlanoTreinoPromptBuilder` monta contexto em seções markdown antes de chamar o LLM via `IaServiceImpl`.

Este change herda as decisões arquiteturais D1–D3, D5–D6 do `introduce-domain-skills-architecture`. As questões abertas daquele change estão respondidas abaixo.

## Decisões

### D1 — Arquitetura híbrida: skills determinísticas como núcleo de decisão

Skills determinísticas decidem constraints de treino. O LLM compõe e explica. O modelo nunca sobrescreve uma constraint marcada como mandatória no snapshot.

---

### D2 — Novo pacote `skills/` com contratos formais

```
br.com.menthoros.backend.skills/
├── DomainSkill.java          (interface)
├── SkillContext.java         (record)
├── SkillResult.java          (record)
├── SkillCategory.java        (enum)
├── SkillSeverity.java        (enum)
├── AthleteAnalysisSnapshot.java
├── SkillRegistry.java        (@Component)
├── SkillOrchestratorService.java (@Service)
└── impl/
    ├── IntervalEligibilitySkill.java
    └── LoadRecoverySkill.java
```

**`DomainSkill` interface:**
```java
public interface DomainSkill {
    String key();
    String version();
    SkillCategory category();
    boolean isApplicable(SkillContext context);
    SkillResult execute(SkillContext context);
}
```

**`SkillContext` record:**
```java
public record SkillContext(
    Atleta atleta,
    UUID tenantId,
    Optional<TreinoRealizado> treinoRealizado,
    Optional<PlanoSemanal> planoSemanal,
    TreinoHistoricoProvider historicoProvider
) {}
```

**`SkillResult` record:**
```java
public record SkillResult(
    String skillKey,
    String skillVersion,
    boolean applicable,
    SkillSeverity severity,
    double confidence,       // 0.0 – 1.0
    String payloadJson,
    String evidenceJson,
    String recommendationsJson
) {
    public static SkillResult notApplicable(String key, String version) { ... }
}
```

---

### D3 — `AthleteAnalysisSnapshot` serializado como Markdown

**Formato de saída** (injetado no prompt como seção `## Skills Analysis`):

```markdown
## Skills Analysis

### Load & Recovery
- Status: WARNING
- Confidence: 0.82
- TSB: -18 (fatigued zone)
- Consecutive load days: 5
- Recommendation: reduce intensity this week

### Interval Eligibility
- Status: INFO
- Eligible: true
- Last interval: 4 days ago
- Constraint: max 2 interval sessions this week
```

`AthleteAnalysisSnapshot` é um value object que agrega `List<SkillResult>` e expõe `toMarkdown()` para serialização. Constraints críticas ficam em campo separado `List<String> mandatoryConstraints` injetado no prompt com marcação explícita de prioridade.

---

### D4 — `SkillRegistry` por descoberta Spring

`SkillRegistry` recebe `List<DomainSkill>` via construtor — Spring injeta todos os beans que implementam a interface. Isso garante que novas skills sejam registradas sem alterar código existente.

```java
@Component
public class SkillRegistry {
    private final List<DomainSkill> skills;

    public SkillRegistry(List<DomainSkill> skills) {
        this.skills = skills;
    }

    public List<DomainSkill> getApplicable(SkillContext context) {
        return skills.stream()
            .filter(s -> s.isApplicable(context))
            .toList();
    }
}
```

---

### D5 — Persistência audit-first: payload integral + colunas indexadas

**Schema `tb_skill_execution`:**

```sql
CREATE TABLE tb_skill_execution (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_key             VARCHAR(100) NOT NULL,
    skill_version         VARCHAR(20)  NOT NULL,
    severity              VARCHAR(20)  NOT NULL,  -- ENUM como string
    confidence            DECIMAL(4,3) NOT NULL,
    atleta_id             UUID         NOT NULL REFERENCES tb_atleta(id),
    treino_realizado_id   UUID         REFERENCES tb_treino_realizado(id),
    plano_semanal_id      UUID         REFERENCES tb_plano_semanal(id),
    tenant_id             UUID         NOT NULL,
    payload_json          JSONB        NOT NULL,
    evidence_json         JSONB,
    recommendations_json  JSONB,
    executed_at           TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_exec_atleta      ON tb_skill_execution(atleta_id);
CREATE INDEX idx_skill_exec_treino      ON tb_skill_execution(treino_realizado_id);
CREATE INDEX idx_skill_exec_severity    ON tb_skill_execution(severity);
CREATE INDEX idx_skill_exec_skill_key   ON tb_skill_execution(skill_key, skill_version);
CREATE INDEX idx_skill_exec_tenant      ON tb_skill_execution(tenant_id);
```

Rationale: campos indexados permitem queries rápidas sem parsear JSON. `payload_json` guarda o resultado completo para replay, comparação entre versões e analytics futuros.

---

### D6 — Refatoração incremental por delegação

`IntervaladoElegibilidadeService` e `MetricasAlertaService` **não são removidos**. Eles passam a instanciar a skill correspondente internamente e delegar para ela. Isso preserva todos os callers existentes e elimina risco de regressão.

```java
// IntervaladoElegibilidadeService — após refatoração
@Service
public class IntervaladoElegibilidadeService {
    private final IntervalEligibilitySkill skill;

    public RecomendacaoIntervalado avaliar(Atleta atleta, ...) {
        SkillContext ctx = new SkillContext(atleta, tenantId, ...);
        SkillResult result = skill.execute(ctx);
        return mapToRecomendacao(result);  // converte resultado para tipo legado
    }
}
```

---

### D7 — Integração com `IaServiceImpl` e `PlanoTreinoPromptBuilder`

Fluxo de geração de plano após este change:

```
IaServiceImpl.gerarPlano(atleta, dadosPlano)
    │
    ├─ 1. monta SkillContext
    ├─ 2. SkillOrchestratorService.execute(context)
    │       → retorna AthleteAnalysisSnapshot
    │
    ├─ 3. PlanoTreinoPromptBuilder.buildOptimizedPrompt(dadosPlano, snapshot)
    │       → adiciona seção "## Skills Analysis" no prompt
    │
    └─ 4. chama LLM com prompt enriquecido
```

`PlanoTreinoPromptBuilder` recebe `AthleteAnalysisSnapshot` como novo parâmetro opcional (nullable para retrocompatibilidade durante transição).

---

### D8 — `SkillOrchestratorService` isolamento de falhas

Cada skill é executada em bloco try/catch individual. Falha em uma skill não cancela as demais. Skill que lança exceção produz `SkillResult.notApplicable()` com log de erro. O orquestrador **nunca lança exceção** para o caller — apenas retorna snapshot parcial com a skill marcada como não aplicável.

## Open Questions Resolvidas (de `introduce-domain-skills-architecture`)

| Questão | Decisão |
|---------|---------|
| Formato do snapshot no prompt | Markdown (seção `## Skills Analysis`) |
| Payload de SkillExecution | Integral (payload_json JSONB completo) |
| prescription-guard: bloquear ou sinalizar? | Bloquear — próximo change |
| Recálculo pós-Strava | Assíncrono via evento — próximo change |

## Risks / Trade-offs

**[Risco] Overhead por skill antes de cada geração de plano** → Mitigação: skills são determinísticas e in-memory; não fazem I/O pesado. Persistência de `SkillExecution` é assíncrona.

**[Risco] Lista vazia de skills no início** → Mitigação: as duas skills iniciais (`IntervalEligibilitySkill`, `LoadRecoverySkill`) já entregam valor imediato com lógica existente.

**[Trade-off] Delegação adiciona uma camada de indireção** → Aceitável; é a forma padrão de introduzir um contrato sem quebrar callers existentes.
