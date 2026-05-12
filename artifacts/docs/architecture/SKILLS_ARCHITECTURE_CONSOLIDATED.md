# Skills Architecture - Consolidado

**Documento Unificado de Skills & AI Agent**
**Data:** Consolidado em 08 de maio de 2026
**Status:** ✅ ENTREGUE

---

## 📑 Índice

1. Especificação Técnica de Skills
2. Plano SpringAI Agent
3. Async Plan Generation Guide
4. Implementação

---

## 📋 SEÇÃO 1: Especificação Técnica de Skills

### O que são Skills?

Skills são capacidades de IA que o sistema pode usar:
- Gerar planos de treino
- Analisar performance
- Fazer recomendações
- Criar treinos intervalados

### Skills Identificadas

```
SKILL 1: PlanGenerator
├─ Input: Atleta, objetivos, histórico
├─ Output: Plano semanal com treinos
└─ Modelo: GPT-4

SKILL 2: PerformanceAnalyzer
├─ Input: Atividades, métricas
├─ Output: Análise, tendências
└─ Modelo: GPT-4

SKILL 3: TrainingRecommender
├─ Input: Performance, carga, recuperação
├─ Output: Recomendações de treino
└─ Modelo: GPT-4

SKILL 4: IntervalWorkoutGenerator
├─ Input: Objetivo, capacidade
├─ Output: Treino intervalado estruturado
└─ Modelo: GPT-4
```

---

## 🤖 SEÇÃO 2: Spring AI Agent

### Arquitetura do Agent

```
User Query
    ↓
Agent Router
├─ Identifica skill necessária
├─ Extrai parâmetros
└─ Chama modelo certo

Model Execution
├─ Claude/GPT-4
├─ System prompt com contexto
└─ Few-shot examples

Response Processing
├─ Parse saída
├─ Valida resultado
└─ Retorna ao usuário
```

### Exemplo de Fluxo

```
User: "Crie um plano para eu melhorar meus 5K"
    ↓
Agent: "Preciso de mais info - sua experiência atual?"
User: "4 anos correndo, melhor tempo 22 minutos"
    ↓
Agent: "Chamando PlanGenerator skill"
    ↓
Skill: Gera plano de 12 semanas com foco em velocidade
    ↓
Agent: Retorna plano estruturado
```

---

## ⚡ SEÇÃO 3: Async Plan Generation

### Por que Async?

Geração de planos pode levar 30-60 segundos. Não pode bloquear a request.

### Implementação

```java
@Service
public class AsyncPlanGenerationService {
    @Async
    public CompletableFuture<Plan> generatePlanAsync(Long atletaId) {
        // Extrai dados
        // Chama modelo
        // Salva resultado
        return completableFuture;
    }
}

@Endpoint
public class PlanController {
    @PostMapping("/plans/generate")
    public ResponseEntity<JobId> generatePlan(Long atletaId) {
        jobId = planService.generatePlanAsync(atletaId);
        return ResponseEntity.accepted().body(jobId);
    }
    
    @GetMapping("/plans/jobs/{jobId}")
    public ResponseEntity<Plan> getJobResult(String jobId) {
        Plan plan = jobService.getResult(jobId);
        return ResponseEntity.ok(plan);
    }
}
```

### Fluxo

```
1. POST /plans/generate → returns jobId
2. Cliente faz polling em GET /plans/jobs/{jobId}
3. Quando pronto, retorna Plan
```

---

## ✅ Checklist de Implementação

- [ ] Definir Skills
- [ ] Setup Spring AI
- [ ] Implementar Agent Router
- [ ] Criar templates de prompt
- [ ] Async plan generation
- [ ] Job queue (Redis)
- [ ] WebSocket para notificações
- [ ] Tests

---

**Status:** ✅ ENTREGUE - Consolida ESPECIFICACAO_TECNICA_SKILLS + Plano_SpringAI_Agent_Skills + ASYNC_PLAN_GENERATION_GUIDE
