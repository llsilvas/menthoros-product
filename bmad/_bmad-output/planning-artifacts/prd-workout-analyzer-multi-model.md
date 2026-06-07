# PRD — AI-Powered Workout Analysis + Multi-Model Skills Platform

**Produto:** Menthoros  
**Feature:** workout-analyzer + Infraestrutura Multi-Modelo  
**Versão:** 1.0  
**Data:** 2026-05-15  
**Status:** Aprovado para implementação  
**Autor:** BMAD (PM + Arquiteto + Tech Lead)

---

## 1. Visão e Objetivos

### Problema

O Menthoros gera planos de treino personalizados mas deixa o atleta sem resposta estruturada após a execução. O coach recebe os dados brutos (pace, distância, FC) mas não tem **interpretação automática de causa-raiz**: por que o treino foi mais difícil? Era fadiga acumulada, erro de ritmo, estresse ambiental ou adaptação normal?

Essa lacuna obriga o coach a análise manual — processo demorado, inconsistente e não escalável com o crescimento da base de atletas.

### Objetivos de Produto

| Objetivo | Métrica de Sucesso | Prazo |
|----------|-------------------|-------|
| Fechar o loop de feedback pós-treino | 100% dos treinos com RPE analisados em <30s | Sprint 1 |
| Reduzir tempo de análise manual do coach | -65% de tempo gasto em análise individual | Sprint 2 |
| Escalar análise sem custo linear | Custo por análise < R$ 0,03 via roteamento inteligente | Sprint 1 |
| Aumentar engajamento do atleta | +20% de treinos com RPE preenchido (feedback loop) | Sprint 3 |

### Proposta de Valor

> **"Cada treino registrado com RPE gera, automaticamente e em segundos, um diagnóstico técnico estruturado — em português — explicando o que aconteceu, por quê, e o que fazer a seguir."**

---

## 2. Escopo

### In Scope

- **Infraestrutura Multi-Modelo:** 4 `ChatClient` beans com roteamento inteligente por complexidade de tarefa
- **workout-analyzer Skill:** Framework de análise com RPE Delta, correlação TSB, detecção de fadiga e score de execução
- **Pipeline Assíncrono:** Evento `TreinoRegistradoEvent` → `WorkoutAnalysisListener` → persistência em `tb_analise_workout`
- **Translation Layer:** Tradução automática EN→PT via Claude Haiku para campos textuais
- **API de Consulta:** `GET /api/v1/analise/treino/{treinoRealizadoId}` com isolamento multi-tenant
- **Flyway Migration:** Schema `tb_analise_workout` versionado

### Out of Scope (Onda 2+)

- Frontend UI para exibição da análise ao atleta/coach
- Análise de treinos históricos (apenas novos registros)
- Interface de configuração do comportamento AI pelo coach
- Integração direta com Strava para disparar análise (usa TreinoRealizado existente)
- Análise síncrona em tempo real (sempre assíncrona)
- Notificações push ao atleta quando análise estiver pronta
- Dashboard de custos de API por modelo
- A/B test de modelos

---

## 3. Personas e Casos de Uso Primários

### Persona 1: Coach (Assessor de Corrida)

**Objetivo:** Entender rapidamente o estado fisiológico de cada atleta sem análise manual.

**Caso de Uso:**
1. Atleta registra treino realizado via app (com RPE)
2. Sistema gera análise automaticamente em background
3. Coach consulta o endpoint de análise durante revisão semanal
4. Coach recebe diagnóstico estruturado: causa-raiz, score, recomendação

### Persona 2: Atleta

**Objetivo:** Entender por que o treino foi mais fácil ou difícil que o planejado.

**Caso de Uso:**
1. Atleta registra treino com RPE (ex: "foi 7 mas esperava 4")
2. Análise é gerada automaticamente
3. Atleta recebe explicação em português (futuro: via app)

---

## 4. Épicos e Histórias de Usuário

---

### Épico 1: Infraestrutura Multi-Modelo

**Objetivo:** Configurar 4 LLMs com roteamento inteligente, sem quebrar o bean primário existente.

**Por que agora:** Pré-requisito técnico para todos os outros épicos. Sem roteamento, todas as chamadas AI usariam o mesmo modelo (GPT-4o), desperdiçando custo e capacidade.

#### US-1.1 — Configuração dos 4 ChatClient Beans
**Como** desenvolvedor,  
**Quero** 4 beans `ChatClient` nomeados com `@Qualifier` no contexto Spring,  
**Para que** cada componente possa injetar o modelo correto para sua tarefa.

**Critérios de Aceite:**
- [ ] Bean `gpt4oMiniClient`: OpenAI `gpt-4o-mini`, temperatura 0.3, max 1.000 tokens
- [ ] Bean `claudeHaikuClient`: Anthropic `claude-haiku-4-5`, temperatura 0.5, max 2.000 tokens
- [ ] Bean `claudeSonnetClient`: Anthropic `claude-sonnet-4-6`, temperatura 0.7, max 4.000 tokens
- [ ] Bean `gpt4oClient`: OpenAI `gpt-4o`, temperatura 0.8, max 8.000 tokens
- [ ] Nenhum dos novos beans tem `@Primary` — bean primário existente inalterado
- [ ] `IaServiceImpl` continua funcionando sem alteração
- [ ] `./mvnw clean test` passa com 0 falhas

#### US-1.2 — ModelRouter com TaskComplexity
**Como** desenvolvedor,  
**Quero** um `ModelRouter` que resolve o `ChatClient` correto por `TaskComplexity`,  
**Para que** a política de roteamento seja centralizada e testável.

**Critérios de Aceite:**
- [ ] Enum `TaskComplexity`: `SIMPLE`, `STANDARD`, `COMPLEX`, `EXPERT`
- [ ] Mapeamento: `SIMPLE → gpt4oMiniClient`, `STANDARD → claudeHaikuClient`, `COMPLEX → claudeSonnetClient`, `EXPERT → gpt4oClient`
- [ ] `ModelRouter.route(null)` lança `IllegalArgumentException`
- [ ] Teste unitário `ModelRouterTest` valida todos os 4 casos + null

#### US-1.3 — Configuração de API Keys e Validação de Startup
**Como** operador,  
**Quero** que a aplicação falhe na inicialização se `ANTHROPIC_API_KEY` estiver ausente,  
**Para que** problemas de configuração sejam detectados imediatamente em deploy.

**Critérios de Aceite:**
- [ ] `ANTHROPIC_API_KEY` ausente → `BeanCreationException` com mensagem clara
- [ ] `OPENAI_API_KEY` ausente → falha similar
- [ ] Railway tem ambas as variáveis configuradas em todos os ambientes
- [ ] Startup com ambas as chaves: todos os 4 beans criados sem erro

#### US-1.4 — Documentação de Custo por Modelo
**Como** tech lead,  
**Quero** documentação explícita de quando usar cada modelo,  
**Para que** futuras skills usem o roteamento corretamente.

**Critérios de Aceite:**
- [ ] `MultiModelConfig.java` tem JavaDoc com custo estimado por modelo
- [ ] `CLAUDE.md` tem seção "Multi-Model Routing Guidelines"
- [ ] `TaskComplexity` enum documenta casos de uso de cada valor

---

### Épico 2: workout-analyzer Skill Resource

**Objetivo:** Disponibilizar a skill `SKILL.md` e scripts de suporte como recursos carregáveis pelo Spring AI.

**Por que agora:** A skill é o "conhecimento de domínio" que instrui o LLM sobre análise fisiológica. Sem ela, o LLM produz análise genérica.

#### US-2.1 — SKILL.md na Estrutura de Resources
**Como** sistema,  
**Quero** carregar `SKILL.md` via `PromptTemplateLoader`,  
**Para que** o LLM receba o framework de análise como system prompt estruturado.

**Critérios de Aceite:**
- [ ] `src/main/resources/skills/analise/workout-analyzer/SKILL.md` existe
- [ ] `PromptTemplateLoader.load("skills/analise/workout-analyzer/SKILL.md")` retorna conteúdo não-vazio
- [ ] SKILL.md contém: RPE Delta Classification, TSB Correlation, Execution Score, Output Schema
- [ ] Teste de integração valida carregamento do classpath

#### US-2.2 — Script Python de Cálculo de Delta
**Como** skill,  
**Quero** o script `calculate_execution_delta.py` disponível como recurso de suporte,  
**Para que** o LLM possa referenciar cálculos objetivos ao analisar o treino.

**Critérios de Aceite:**
- [ ] `src/main/resources/skills/analise/workout-analyzer/scripts/calculate_execution_delta.py` existe
- [ ] Script parseia JSON de stdin e produz `WorkoutDelta` em stdout
- [ ] Teste unitário Python valida: distance_delta, rpe_delta, pace_delta (com range)
- [ ] Script não tem dependências externas (stdlib only)

#### US-2.3 — Versionamento e Evolução da Skill
**Como** tech lead,  
**Quero** que a skill tenha `version: 1.0.0` no frontmatter,  
**Para que** mudanças no framework de análise sejam rastreáveis via Git.

**Critérios de Aceite:**
- [ ] SKILL.md tem frontmatter com `name`, `description`, `version`, `tags`
- [ ] CI bloqueia merge se SKILL.md não tiver frontmatter válido
- [ ] CHANGELOG documenta mudanças no framework de análise

---

### Épico 3: Pipeline de Análise Pós-Treino

**Objetivo:** Análise automática, assíncrona e resiliente disparada após cada treino registrado com RPE.

**Por que agora:** É o core do valor de produto — sem isso, nada do trabalho anterior chega ao usuário.

#### US-3.1 — Publicação do TreinoRegistradoEvent
**Como** sistema,  
**Quero** que `TreinoService.save()` publique `TreinoRegistradoEvent` após commit,  
**Para que** a análise seja disparada de forma desacoplada do registro.

**Critérios de Aceite:**
- [ ] `TreinoRegistradoEvent` tem campos: `treinoRealizadoId` (UUID), `tenantId` (UUID)
- [ ] Evento é publicado via `ApplicationEventPublisher` após `save()` bem-sucedido
- [ ] Falha na publicação do evento NÃO causa rollback do treino
- [ ] Teste de integração verifica publicação do evento após save

#### US-3.2 — Gate de RPE no Listener
**Como** sistema,  
**Quero** que análise seja ignorada silenciosamente se RPE for null,  
**Para que** treinos sem RPE não gerem chamadas AI desnecessárias.

**Critérios de Aceite:**
- [ ] `WorkoutAnalysisListener` verifica `TreinoRealizado.rpe != null` antes de processar
- [ ] RPE null → log `DEBUG "Treino {id} sem RPE, análise ignorada"`, sem exception
- [ ] RPE presente → análise continua normalmente
- [ ] Teste unitário valida ambos os casos

#### US-3.3 — Análise Assíncrona com Sonnet
**Como** atleta,  
**Quero** que meu treino seja analisado em background sem atrasar o registro,  
**Para que** a experiência de registrar o treino permaneça rápida.

**Critérios de Aceite:**
- [ ] `WorkoutAnalysisListener` tem `@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`
- [ ] Listener usa `claudeSonnetClient` (`TaskComplexity.COMPLEX`)
- [ ] System prompt = SKILL.md + JSON de `TreinoPlanejado`, `TreinoRealizado`, métricas TSB/CTL
- [ ] HTTP response do endpoint de registro retorna antes da análise concluir
- [ ] Timeout da chamada AI configurado em 30s
- [ ] Exceção no listener → log ERROR com `treinoRealizadoId`, sem impacto no treino

#### US-3.4 — Idempotência da Análise
**Como** sistema,  
**Quero** que re-publicação do evento não gere análise duplicada,  
**Para que** falhas temporárias não contaminem os dados com análises duplicadas.

**Critérios de Aceite:**
- [ ] Listener verifica existência de `AnaliseWorkout` com `status = COMPLETED` antes de processar
- [ ] Já existe com COMPLETED → skip silencioso com log `DEBUG`
- [ ] Existe com FAILED → re-analisa (permite retry)
- [ ] Teste de integração valida idempotência

#### US-3.5 — Persistência em tb_analise_workout
**Como** sistema,  
**Quero** que o resultado da análise seja persistido em tabela dedicada,  
**Para que** coaches e atletas possam consultar análises a qualquer momento.

**Critérios de Aceite:**
- [ ] Flyway migration `V{N}__add_analise_workout.sql` cria `tb_analise_workout`
- [ ] Schema: `id`, `treino_realizado_id` (FK), `tenant_id`, `status` (PENDING/COMPLETED/FAILED), `summary_pt`, `technical_interpretation_pt`, `primary_cause`, `recommendation_pt`, `tags` (array), `execution_score`, `rationale_pt`, `created_at`, `analyzed_at`
- [ ] `AnaliseWorkout` entity com FK para `TreinoRealizado`
- [ ] `AiWorkoutAnalysisRepository` com `findByTreinoRealizadoIdAndTenantId()`

---

### Épico 4: Translation Layer EN→PT

**Objetivo:** Garantir que atletas e coaches recebam análise em português com terminologia fisiológica correta.

**Por que agora:** O LLM produz análise mais consistente em inglês (terminologia técnica). Tradução separada mantém qualidade sem sacrificar linguagem natural.

#### US-4.1 — Tradução de Campos Textuais via Haiku
**Como** atleta,  
**Quero** receber a análise em português fluente,  
**Para que** eu entenda o diagnóstico sem precisar interpretar termos técnicos em inglês.

**Critérios de Aceite:**
- [ ] `WorkoutAnalysisTranslator` usa `claudeHaikuClient` (`TaskComplexity.STANDARD`)
- [ ] Campos traduzidos: `summary`, `technical_interpretation`, `recommendation`, `rationale`
- [ ] Campos NÃO traduzidos: `primary_cause` (enum), `tags` (array de enums), `execution_score` (int)
- [ ] Teste unitário com mock do Haiku valida tradução dos campos corretos

#### US-4.2 — Mapeamento Estático para Termos-Chave
**Como** sistema,  
**Quero** mapeamento estático EN→PT para termos técnicos frequentes,  
**Para que** tradução seja consistente e não dependa sempre de chamada AI.

**Critérios de Aceite:**
- [ ] Mapa estático cobre: summaries comuns, primary_causes para exibição, tags para labels de UI
- [ ] Mapa é `Map.ofEntries(...)` com constantes, sem banco de dados
- [ ] Teste valida que termos do mapa não são enviados ao Haiku (economia de tokens)

#### US-4.3 — Resiliência a Falhas de Tradução
**Como** sistema,  
**Quero** que falha na tradução não descarte a análise,  
**Para que** atletas recebam análise em inglês em vez de nada.

**Critérios de Aceite:**
- [ ] Timeout de tradução: 10s
- [ ] Exceção no Haiku → persiste análise com campos em inglês + flag `translation_failed = true`
- [ ] Log WARN com causa da falha e `treinoRealizadoId`
- [ ] Análise com `translation_failed = true` pode ser re-traduzida manualmente via endpoint admin

---

### Épico 5: API de Consulta com Isolamento Multi-Tenant

**Objetivo:** Expor a análise via endpoint REST seguro, respeitando isolamento por assessoria.

#### US-5.1 — Endpoint GET /api/v1/analise/treino/{treinoRealizadoId}
**Como** coach,  
**Quero** consultar a análise de um treino específico via API,  
**Para que** eu possa integrar o diagnóstico no fluxo de revisão de treinos.

**Critérios de Aceite:**
- [ ] `GET /api/v1/analise/treino/{treinoRealizadoId}` retorna `AnaliseWorkoutOutputDto`
- [ ] `@RequireTenant` + `@PreAuthorize("isAuthenticated()")`
- [ ] Query: `WHERE treino_realizado_id = ? AND tenant_id = ?`
- [ ] Status COMPLETED → 200 com análise completa
- [ ] Status PENDING → 204 No Content (análise em processamento)
- [ ] Status FAILED → 200 com `status: FAILED` e `error_message`
- [ ] Treino de outro tenant → 404 Not Found

#### US-5.2 — DTO de Resposta Completo
**Como** frontend,  
**Quero** um DTO tipado com todos os campos da análise,  
**Para que** a integração seja type-safe e auto-documentada via OpenAPI.

**Critérios de Aceite:**
- [ ] `AnaliseWorkoutOutputDto` é Java `record` em `br.com.menthoros.backend.dto.output`
- [ ] Campos: `id`, `treinoRealizadoId`, `status`, `summary`, `technicalInterpretation`, `primaryCause`, `recommendation`, `tags`, `executionScore`, `rationale`, `analyzedAt`
- [ ] `@Schema(description = "...")` em todos os campos
- [ ] `@JsonInclude(NON_NULL)` no record

#### US-5.3 — Documentação OpenAPI Completa
**Como** desenvolvedor de frontend,  
**Quero** documentação Swagger completa do endpoint,  
**Para que** eu possa integrar sem consultar o backend team.

**Critérios de Aceite:**
- [ ] `@Tag`, `@Operation`, `@ApiResponses` presentes
- [ ] Todos os status codes documentados: 200, 204, 400, 401, 404
- [ ] Exemplos de request/response no Swagger

---

## 5. Riscos Técnicos e de Produto

### Riscos Técnicos

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| T1 | Spring AI 1.0.0-M6 tem breaking changes de API entre milestones | MÉDIA | ALTO | Fixar versão exata no pom.xml; não usar `latest`; testar upgrade isolado |
| T2 | `spring-ai-anthropic-spring-boot-starter` não disponível no milestones repo | BAIXA | ALTO | Já validado: resolução OK com `repo.spring.io/milestone` |
| T3 | `@Qualifier` de novo bean conflita com `@Primary` existente | BAIXA | ALTO | `MultiModelConfig` separado de `ChatClientConfig`; nenhum novo bean tem `@Primary` |
| T4 | `@TransactionalEventListener(AFTER_COMMIT)` não dispara em testes unitários | ALTA | MÉDIO | Usar `@SpringBootTest` para testes do listener; mock do event em unit tests |
| T5 | Claude Sonnet produz resposta fora do schema JSON esperado | MÉDIA | MÉDIO | System prompt com instrução explícita de formato JSON; retry com temperature 0 |
| T6 | Latência alta do Sonnet (>10s) bloqueia thread do event pool | MÉDIA | MÉDIO | Configurar `Executor` dedicado para análise com pool separado; timeout de 30s |
| T7 | `TreinoRealizado.rpe` campo pode não existir na entidade atual | BAIXA | ALTO | Verificar entidade antes de implementar; adicionar campo via Flyway se ausente |

### Riscos de Produto

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| P1 | Análise incorreta por dados insuficientes (sem TreinoPlanejado associado) | ALTA | MÉDIO | Gate: verificar se `TreinoPlanejado` existe; análise com contexto parcial se ausente |
| P2 | Coach não confia na análise AI e ignora o diagnóstico | MÉDIA | ALTO | Sprint 2: A/B test com 20 atletas; validação qualitativa com coaches beta |
| P3 | Atletas não preenchem RPE (reduzindo cobertura da análise) | ALTA | MÉDIO | Sprint 2: UX prompt no app incentivando RPE; gamificação de completude |
| P4 | Custo de API excede orçamento com escala de atletas | BAIXA | ALTO | Monitorar custo por análise; alert se > R$ 0,05/análise; degradação para Haiku |
| P5 | Tradução Haiku distorce termos técnicos críticos (TSB, CTL) | MÉDIA | BAIXO | Mapa estático para termos técnicos; não traduzir enums e siglas |

---

## 6. Arquitetura de Alto Nível

### Diagrama de Fluxo

```
[Atleta registra TreinoRealizado com RPE]
         │
         ▼
[TreinoService.save()]
    │ @Transactional
    │ repository.save(treino)
    │ eventPublisher.publishEvent(TreinoRegistradoEvent)
         │
         ▼ (AFTER_COMMIT, @Async)
[WorkoutAnalysisListener.onTreinoRegistrado()]
    │
    ├─ Gate: rpe == null? → SKIP
    ├─ Gate: COMPLETED já existe? → SKIP
    │
    ├─ Cria AnaliseWorkout com status=PENDING
    │
    ├─ Carrega: TreinoPlanejado + TreinoRealizado + MetricasDiarias
    │
    ├─ ModelRouter.route(COMPLEX) → claudeSonnetClient
    │
    ├─ Prompt = SKILL.md (system) + JSON dados (user)
    │
    ├─ Response → deserializa AnaliseWorkoutRawDto (EN)
    │
    ├─ WorkoutAnalysisTranslator
    │       ModelRouter.route(STANDARD) → claudeHaikuClient
    │       Traduz: summary, interpretation, recommendation, rationale → PT
    │
    └─ AiWorkoutAnalysisRepository.save(AnaliseWorkout{status=COMPLETED})

[Coach consulta via API]
    GET /api/v1/analise/treino/{id}
    │ @RequireTenant → TenantContext.getRequiredTenantId()
    │ query WHERE treino_realizado_id = ? AND tenant_id = ?
    └─ 200 AnaliseWorkoutOutputDto | 204 PENDING | 404 wrong tenant
```

### Componentes e Pacotes

```
br.com.menthoros.backend
├── config/
│   └── MultiModelConfig.java          ← 4 ChatClient beans (@Qualifier)
│
├── routing/
│   ├── TaskComplexity.java             ← Enum: SIMPLE, STANDARD, COMPLEX, EXPERT
│   └── ModelRouter.java               ← route(TaskComplexity) → ChatClient
│
├── events/
│   ├── TreinoRegistradoEvent.java     ← treinoRealizadoId + tenantId
│   └── listeners/
│       └── WorkoutAnalysisListener.java ← @Async + @TransactionalEventListener
│
├── services/
│   └── WorkoutAnalysisTranslator.java ← EN→PT via claudeHaikuClient
│
├── entity/
│   └── AnaliseWorkout.java            ← FK → TreinoRealizado
│
├── repository/
│   └── AiWorkoutAnalysisRepository.java
│
├── controller/
│   └── AnaliseWorkoutController.java  ← GET /api/v1/analise/treino/{id}
│
├── dto/output/
│   └── AnaliseWorkoutOutputDto.java   ← record
│
└── enums/
    ├── AnaliseStatus.java             ← PENDING, COMPLETED, FAILED
    └── PrimaryAnalysisCause.java      ← ACCUMULATED_FATIGUE, ENVIRONMENTAL_FACTORS, ...

src/main/resources/
└── skills/analise/workout-analyzer/
    ├── SKILL.md                       ← Framework de análise (system prompt)
    └── scripts/
        └── calculate_execution_delta.py
```

### Stack de Tecnologia

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime | Java | 21 |
| Framework | Spring Boot | 3.5.11 |
| AI | Spring AI | 1.0.0-M6 |
| LLM Análise | Claude Sonnet 4 | claude-sonnet-4-6 |
| LLM Tradução | Claude Haiku 4 | claude-haiku-4-5 |
| LLM Extração | GPT-4o Mini | gpt-4o-mini |
| LLM Expert | GPT-4o | gpt-4o |
| BD | PostgreSQL | 16 |
| Migrations | Flyway | 11.7.x |
| Build | Maven | 3.9+ |

### Modelo de Dados

```sql
CREATE TABLE tb_analise_workout (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treino_realizado_id       UUID NOT NULL REFERENCES tb_treino_realizado(id),
    tenant_id                 UUID NOT NULL,
    status                    VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                              -- PENDING | COMPLETED | FAILED
    summary_pt                TEXT,
    technical_interpretation_pt TEXT,
    primary_cause             VARCHAR(50),
                              -- ACCUMULATED_FATIGUE | ENVIRONMENTAL_FACTORS |
                              -- PACING_ERROR | CNS_FATIGUE | NORMAL | UNDERTRAINING
    recommendation_pt         TEXT,
    tags                      TEXT[],
    execution_score           SMALLINT CHECK (execution_score BETWEEN 1 AND 10),
    rationale_pt              TEXT,
    translation_failed        BOOLEAN NOT NULL DEFAULT FALSE,
    error_message             TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzed_at               TIMESTAMPTZ,
    UNIQUE (treino_realizado_id)  -- idempotência: 1 análise por treino
);

CREATE INDEX idx_analise_workout_tenant ON tb_analise_workout(tenant_id);
CREATE INDEX idx_analise_workout_treino ON tb_analise_workout(treino_realizado_id);
```

---

## 7. Estimativa e Sequência de Entrega

### Sprint 1 — Core (Épicos 1, 2, 3)

| Epic | Esforço Estimado | Dependências |
|------|-----------------|--------------|
| E1: Multi-Model Config | 4h | pom.xml + env vars |
| E2: Skill Resource | 2h | E1 |
| E3: Pipeline Análise | 8h | E1 + E2 |
| **Total** | **14h** | |

### Sprint 2 — Qualidade e Acesso (Épicos 4, 5)

| Epic | Esforço Estimado | Dependências |
|------|-----------------|--------------|
| E4: Translation Layer | 4h | E1 + E3 |
| E5: API de Consulta | 4h | E3 |
| Testes end-to-end | 4h | E1–E5 |
| **Total** | **12h** | |

**Entrega MVP:** ~26h de desenvolvimento (3–4 dias)

---

## 8. Definição de Pronto (DoD)

Uma história está concluída quando:
1. Código implementado seguindo `apps/menthoros-backend/CLAUDE.md`
2. Testes passando: `./mvnw clean test` → 0 falhas
3. OpenSpec `tasks.md` item marcado com `[x]`
4. Sem `@Autowired Repository` em controllers
5. Sem DTOs como classes (somente `record`)
6. Sem try/catch para HTTP mapping (usar `GlobalExceptionHandler`)
7. Sem secrets hardcoded

---

*Documento gerado em: 2026-05-15 | Branch: feature/spring-ai-skills-setup*
