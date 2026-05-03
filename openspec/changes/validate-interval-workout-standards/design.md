## Context

Atualmente, quando o LLM propõe treinos intervalados, não há validação rigorosa contra padrões esperados. Isso resulta em treinos que:
- Violam limites de duração ou intensidade
- Possuem número inválido de séries/repetições
- Combinam estímulos incompatíveis
- Ultrapassam capacidade do atleta

Treinos inválidos causam rejeição manual ou aplicação de treinos problemáticos que prejudicam o treinamento.

## Goals / Non-Goals

**Goals:**
- Validar todas as propostas de treinos intervalados contra padrões antes de aceitar
- Corrigir automaticamente violações menores ou rejeitar treinos severamente inválidos
- Fornecer feedback claro ao LLM sobre violações, melhorando futuras propostas
- Permitir override manual com justificativa em casos excepcionais

**Non-Goals:**
- Redesenhar o modelo de dados de treino (apenas validar)
- Modificar a lógica principal de proposta do LLM (apenas adicionar gate de validação)
- Criar padrões dinamicamente (usar padrões pré-definidos)

## Decisions

### 1. Validação em Duas Camadas
**Decision**: Backend valida ANTES de persistir; LLM recebe feedback para loop de aprendizado

**Rationale**: 
- Backend é fonte de verdade (garante integridade)
- LLM com feedback melhora propóstas futuras (ciclo virtuoso)

**Alternatives Considered**:
- Validar apenas no LLM: Risco de bypassar validação se API mudar
- Validar apenas no backend: LLM nunca aprende e continua errando

### 2. Padrões de Validação como Tabela Configurável
**Decision**: Armazenar regras de padrão em tabela `IntervalWorkoutStandards` (backend)

**Rationale**:
- Fácil ajustar padrões sem code change
- Separação de lógica de negócio (código) de regras (dados)
- Suporta multi-tenancy (diferentes assessorias podem ter padrões distintos)

**Fields**:
- `workoutType` (HIIT, Tempo, Threshold, VO2Max, etc.)
- `minDuration`, `maxDuration` (minutos)
- `minIntensity`, `maxIntensity` (% FTP)
- `minSeriesCount`, `maxSeriesCount`
- `maxRecoveryRatio` (relação esforço:recuperação)

### 3. Tratamento de Violações com Três Modos
**Decision**: Handler valida e retorna resultado com ação recomendada

**Modes**:
1. **ACCEPT** - Validação passou
2. **AUTO_CORRECT** - Ajustes menores aplicados automaticamente (ex: reduzir duração em 10% se exceder máximo)
3. **REJECT** - Violação severa, rejeitar com motivo

**Rationale**:
- AUTO_CORRECT reduz rejeições desnecessárias mantendo conformidade
- REJECT força revisão para mudanças estruturais
- Feedback claro guia LLM

### 4. Arquitetura de Componentes
```
StravaActivitySync
  └─ WorkoutProposalHandler
      └─ IntervalWorkoutValidator (novo)
          ├─ StandardsRepository (carrega padrões)
          ├─ ValidationRules (ACCEPT/AUTO_CORRECT/REJECT)
          └─ FeedbackGenerator (prepara feedback para LLM)
```

### 5. Feedback Loop ao LLM
**Decision**: Adicionar campo `validationFeedback` à resposta de proposta

**Feedback inclui**:
- Violações encontradas (se houver)
- Ajustes aplicados (se AUTO_CORRECT)
- Motivo da rejeição (se REJECT)
- Padrões esperados para próxima tentativa

**Rationale**: LLM pode usar histórico de rejeições para melhorar propóstas futuras

### 6. Expert LLM Validator Skills (Validação Especialista)
**Decision**: Usar LLM especialista (com skill customizada) para validação de padrões ANTES de persistir

**Arquitetura em Dois Estágios**:
1. **LLM Gerador**: Propõe treino (atual)
2. **Expert Validator Skill**: Valida + fornece feedback especialista
3. **LLM Gerador (iteração)**: Propõe revisado com contexto de padrões

**Skills a Implementar**:
- `validate-interval-workouts-expert`: Expertise em treinos intervalados (biomecânica, estímulos, segurança)
  - System prompt: "Você é um especialista em treinos intervalados com 15+ anos de experiência"
  - Valida contra:
    - Padrões numéricos (duração, intensidade, séries)
    - Regras biomecânicas (compatibilidade de estímulos)
    - Segurança do atleta (ratios de recuperação, acúmulo de lactato)
    - Progressão (treino anterior vs proposta)
  - Retorna: `{valid: bool, violations: [...], biomechanicalReasons: [...], recommendations: [...]}`

**Fluxo Integrado**:
```
Coach solicita treino
    ↓
Backend chama LLM Gerador
    ├─ Contexto: atleta, histórico, assessoria
    └─ Retorna: proposta inicial
    ↓
Backend chama Expert Validator Skill
    ├─ Valida padrões (tabela IntervalWorkoutStandards)
    ├─ Valida biomecânica (expertise skill)
    └─ Retorna: validationFeedback estruturado
    ↓
Se rejeitado: Backend chama LLM Gerador novamente
    ├─ Passa: padrões esperados + razões biomecânicas
    └─ Retorna: proposta revisada
    ↓
Expert Validator valida novamente (até aceitar ou max 2 iterações)
    ↓
Resultado final: Treino aprovado ou rejeitado
```

**Rationale**:
- Validação assertiva: Especialista conhece regras biomecânicas reais, não só limites numéricos
- Feedback rico: "Esse ratio é inseguro porque lactato acumularia em Z4-Z5"
- Aprendizado: LLM internaliza raciocínio expert via exemplos estruturados
- Auditável: Cada rejeição tem justificativa biomecânica (não só número)
- Multi-tenancy: Skill pode ser customizado por assessoria (diferentes filosofias de treino)

**Alternativas Consideradas**:
- Validação apenas numérica (atual): Não captura regras biomecânicas complexas
- Validação apenas por especialista humano: Muito lento, não escalável
- LLM sozinho aprende: Lento, precisa de muitas iterações para internalizar regras

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Padrões muito rigorosos = rejeição excessiva | Configurar padrões em consulta com coaches; começar relaxado e apertar com feedback |
| AUTO_CORRECT mascara problemas do LLM | Logar todas as correções; revisar tendências mensalmente |
| Overhead de validação em cada proposta | Validação numérica é O(1); skill validator é ~500ms (aceitável em background) |
| Multi-tenancy = padrões conflitantes | Usar `assessoriaId` na tabela Standards; suportar herança de defaults |
| Expert Skill pode ser inconsistente | Versionar skill, testar com casos reais, manter system prompt estável |
| Múltiplas iterações LLM = latência | Limitar a 2 iterações max; usar cache de validação para propostas similares |
| Skill especialista reflete bias do treinador | Documentar decisões de design no system prompt; revisar feedback mensal com coaches |

## Migration Plan

1. **Fase 1**: Criar tabela `IntervalWorkoutStandards` com padrões iniciais
2. **Fase 2**: Implementar `IntervalWorkoutValidator` e integrar ao `WorkoutProposalHandler`
3. **Fase 3**: Ativar validação em modo "log-only" (não rejeita, apenas registra)
4. **Fase 4**: Após 1 semana de logs, revisar falsos positivos e apertar se necessário
5. **Fase 5**: Ativar rejeição real + feedback ao LLM

## Open Questions

- Quais são os padrões exatos por tipo de treino? (Precisa input de coaches)
- AUTO_CORRECT deve ser configurável por assessoria?
- Treinos com override justificado devem ser rastreáveis no audit log?
