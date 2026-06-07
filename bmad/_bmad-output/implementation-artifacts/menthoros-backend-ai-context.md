# Contexto AI - Menthoros Backend

**Projeto:** Menthoros - Plataforma B2B2C de Treinamento de Corrida  
**Fase:** Implementação de Spring AI Agent Skills + Multi-Modelo  
**Arquitetura:** Simplified Layered Architecture

---

## Stack Técnico

- **Framework:** Spring Boot 3.5.11
- **Java:** 21
- **Database:** PostgreSQL 16 + pgvector
- **AI:** Spring AI 1.0.0-M6
- **Build:** Maven 3.9+

---

## Arquitetura Simplificada

```
Controllers → Services → Domain (Entities + Rules) → Repositories
```

**Princípios:**
1. Domain logic nas entidades (@Entity + métodos)
2. Rules para lógica complexa (métodos estáticos)
3. Services orquestram (NÃO decidem)
4. Repositories = Spring Data JPA (sem adapter)
5. Patterns APENAS quando necessário (YAGNI)

---

## Estrutura de Pacotes

```
br.com.menthoros.backend
├── config/                 # Configurações Spring
│   ├── MultiModelConfig.java
│   └── SkillsConfig.java
│
├── domain/                 # Entidades JPA + Rules
│   ├── Atleta.java
│   ├── TreinoRealizado.java
│   └── rules/
│       └── RecuperacaoRule.java
│
├── services/
│   ├── TreinoService.java
│   └── impl/
│       └── TreinoServiceImpl.java
│
├── repositories/           # Spring Data JPA
│   └── TreinoRepository.java
│
├── routing/                # Multi-modelo routing
│   ├── ModelRouter.java
│   └── TaskComplexity.java
│
├── translation/            # EN→PT translation
│   └── WorkoutAnalysisTranslator.java
│
└── events/
    └── listeners/
        └── WorkoutAnalysisListener.java
```

---

## Convenções de Código

### Idiomas
- **Código Java:** Inglês
- **Comentários:** Português
- **Skills (SKILL.md):** Inglês
- **Output para usuário:** Português (traduzido)

### Nomenclatura
- Classes: PascalCase
- Métodos: camelCase
- Constantes: UPPER_SNAKE_CASE
- Pacotes: lowercase

### Testes
- Framework: JUnit 5 + AssertJ + Mockito
- Coverage mínimo: 70% classes críticas
- Padrão: Given-When-Then

---

## Spring AI Agent Skills

### Conceito
Skills são **pastas modulares** que o LLM carrega on-demand:
```
skills/analise/workout-analyzer/
├── SKILL.md              # Documentação + framework de análise
├── scripts/              # Scripts Python/Shell
└── references/           # Documentos de referência
```

### Como Funciona

1. **Discovery:** Spring AI lê apenas `name` + `description` de todas skills
2. **Matching:** LLM decide quais skills são relevantes para o prompt
3. **Loading:** Carrega SKILL.md completo + scripts apenas das skills escolhidas
4. **Execution:** LLM usa framework da skill para raciocínio

### Vantagens
- ✅ Redução de tokens (-65%)
- ✅ Conhecimento versionável (Git)
- ✅ Metodologias extensíveis (adicionar Pfitzinger, Daniels, etc.)
- ✅ LLM-agnostic (funciona com Claude, GPT, Gemini)

---

## Estratégia Multi-Modelo

### 4 Modelos, 4 Propósitos

| Modelo | Quando Usar | Custo |
|--------|-------------|-------|
| **GPT-4o Mini** | Tradução, extração de dados | R$ 0,0008/op |
| **Claude Haiku 4** | Análises simples, detecção de padrões | R$ 0,025/op |
| **Claude Sonnet 4** | Prescrição de treinos, uso de skills | R$ 0,10/op |
| **GPT-4o** | Raciocínio profundo, análise de lesões | R$ 0,08/op |

### Router Inteligente

```java
TaskComplexity complexity = detectComplexity(context);
ChatClient client = modelRouter.route(complexity);
```

**Economia esperada:** -42% de custo

---

## Primeira Skill: workout-analyzer

### Objetivo
Analisar treino realizado vs planejado e gerar feedback estruturado.

### Input
```json
{
  "planned": {
    "type": "LONG_RUN",
    "distance_km": 18,
    "target_pace": "5:30-5:45/km",
    "expected_rpe": 4
  },
  "actual": {
    "distance_km": 17.8,
    "avg_pace": "5:38/km",
    "rpe": 7
  },
  "athlete_context": {
    "tsb": -22,
    "ctl": 45
  }
}
```

### Output
```json
{
  "summary": "Execution harder than expected",
  "score": 6,
  "tags": ["FATIGUE_DETECTED", "RECOVERY_NEEDED"],
  "recommendation": "Active recovery next 2 days",
  "rationale": "RPE delta +3 indicates accumulated fatigue (TSB -22)"
}
```

### Framework de Análise

**RPE Delta:**
- Delta >= +3: CONCERNING
- Delta +1 to +2: MODERATE
- Delta -1 to +1: NORMAL
- Delta <= -2: EASY

**Correlação com TSB:**
- RPE delta +3 AND TSB < -20 → ACCUMULATED_FATIGUE
- RPE delta +3 AND TSB > -10 → ENVIRONMENTAL_FACTORS

---

## Regras de Ouro

1. **Lógica >5 linhas** → Extrair para Rule
2. **Strategy APENAS se >1 implementação** real
3. **Service orquestra, domain decide**
4. **Repository = interface Spring Data** (sem adapter)
5. **YAGNI** (You Aren't Gonna Need It)
6. **Skills em inglês**, output traduzido para português
7. **Multi-modelo**: usar o modelo certo para cada tarefa

---

## Checklist de Implementação

### Multi-Modelo Setup
- [ ] Criar `MultiModelConfig.java` com 4 clientes
- [ ] Implementar `ModelRouter.java`
- [ ] Criar enum `TaskComplexity`
- [ ] Testar roteamento com unit tests

### Skills Setup
- [ ] Criar diretório `src/main/resources/skills/`
- [ ] Configurar `SkillsConfig.java`
- [ ] Criar primeira skill: `workout-analyzer`
- [ ] Validar estrutura com OpenSpec CLI

### Translation Layer
- [ ] Implementar `WorkoutAnalysisTranslator.java`
- [ ] Criar mapa estático EN→PT
- [ ] Testar tradução com JUnit

### Integration
- [ ] Criar `WorkoutAnalysisListener.java`
- [ ] Integrar com evento `TreinoRegistradoEvent`
- [ ] Configurar `@Async` + `REQUIRES_NEW`
- [ ] Teste end-to-end completo

---

## Próximos Passos

1. **Sprint 1 (atual):** Setup multi-modelo + primeira skill
2. **Sprint 2:** A/B test com 50 atletas
3. **Sprint 3-4:** Adicionar 5 skills secundárias
4. **Sprint 5:** Rollout 100% + otimização

---

## Comandos Úteis

```bash
# Rodar testes
mvn clean test

# Verificar coverage
mvn jacoco:report
open target/site/jacoco/index.html

# Build
mvn clean package

# Rodar aplicação
mvn spring-boot:run
```

---

## Links de Referência

- [Spring AI Documentation](https://docs.spring.io/spring-ai/reference/)
- [Anthropic Claude API](https://docs.anthropic.com/en/api)
- [OpenAI API](https://platform.openai.com/docs/api-reference)
