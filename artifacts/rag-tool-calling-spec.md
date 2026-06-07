# RAG + Tool Calling — Especificação Técnica
## Menthoros AI Prescription Engine v2.0

**Status:** Draft  
**Autor:** Leandro (Senior SWE / Menthoros)  
**Data:** 2026-05-24  
**Stack:** Spring Boot 3.5.4 · Java 21 · Spring AI · PostgreSQL + pgvector · Claude Sonnet 4

---

## 1. Contexto e Motivação

### 1.1 Problema Atual

O sistema de prescrição atual opera com **Prompt Templates estáticos**: dados do atleta são interpolados como strings no momento da requisição e enviados diretamente ao LLM. Esse modelo apresenta três limitações críticas:

| Limitação | Impacto |
|---|---|
| **Dado stale** — CTL/ATL/TSB calculados no momento do template, não da geração | Prescrições baseadas em métricas desatualizadas |
| **Sem raciocínio fisiológico** — LLM depende apenas do seu treinamento base | Justificativas fracas, coach desconfia e edita mais |
| **Sem contexto científico** — periodização, fases e protocolos não são referenciados | Planos genéricos, pouca aderência às metodologias |

**Resultado:** Taxa de aceitação do coach sem edição estimada em **60–65%**.

### 1.2 Solução Proposta

Substituir o Prompt Template por uma arquitetura híbrida:

```
RAG       → "O que é verdade universal sobre treino"  (conhecimento científico)
Tool Calling → "O que está acontecendo com este atleta" (dados dinâmicos e frescos)
```

**Meta:** Elevar taxa de aceitação sem edição de **~60% → ~85–88%** antes dos 500 atletas.

---

## 2. Princípio de Separação de Responsabilidades

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERGUNTA CHAVE                               │
│                                                                 │
│   "Este dado muda por atleta ou por semana?"                    │
│                                                                 │
│   SIM ──→ Tool Calling   (SQL determinístico, isolado por tenant)│
│   NÃO ──→ RAG            (vector search, conhecimento universal) │
└─────────────────────────────────────────────────────────────────┘
```

### Mapa de decisão completo

| Dado / Conhecimento | Onde buscar | Justificativa |
|---|---|---|
| CTL, ATL, TSB do atleta | Tool Calling | Muda semanalmente |
| Histórico de treinos realizados | Tool Calling | Específico por atleta |
| Lesões e restrições ativas | Tool Calling | Privado e dinâmico |
| Próximas provas no calendário | Tool Calling | Dado transacional |
| RPE e feedback dos treinos | Tool Calling | Input do atleta, muda todo treino |
| Zonas de HR do atleta | Tool Calling | Calculado do perfil individual |
| Princípio da sobrecarga progressiva | RAG | Verdade universal |
| Protocolo de taper pré-maratona | RAG | Conhecimento científico |
| Metodologia Lydiard / fases BASE-BUILD | RAG | Enciclopédico |
| Gestão de TSB negativo vs overtraining | RAG | Conceito fisiológico |
| Retorno ao treino pós-lesão | RAG | Protocolo clínico |
| Nutrição pré-prova | RAG | Conhecimento universal |

---

## 3. RAG — Base de Conhecimento

### 3.1 Estrutura de Documentos

```
src/main/resources/knowledge-base/
├── periodizacao/
│   ├── lydiard-methodology.pdf
│   ├── base-build-peak-taper-phases.pdf
│   ├── polarized-training-80-20.pdf
│   └── double-periodization-marathon.pdf
├── fisiologia/
│   ├── vo2max-adaptations-endurance.pdf
│   ├── lactate-threshold-training.pdf
│   ├── heart-rate-zones-science.pdf
│   └── tss-ctl-atl-tsb-explainer.pdf
├── recuperacao/
│   ├── sleep-hrv-recovery-markers.pdf
│   ├── supercompensation-theory.pdf
│   └── deload-protocols.pdf
└── nutricao/
    ├── carb-loading-protocols.pdf
    └── race-day-nutrition-endurance.pdf
```

**Critério de inclusão:** Artigos revisados por pares, livros técnicos de referência ou guidelines de federações (IAAF, ACSM). Sem conteúdo de blogs ou fontes não verificadas.

### 3.2 Estratégia de Chunking

```
Tamanho ideal: 400–600 tokens por chunk
Overlap: 10% (40–60 tokens) para preservar contexto entre chunks
Idioma dos documentos: Inglês (maior riqueza técnica no corpus de treino dos LLMs)
```

**Por que não maior?** Chunks > 800 tokens diluem a busca por similaridade e trazem ruído irrelevante para o contexto do prompt.  
**Por que não menor?** Chunks < 200 tokens perdem o contexto fisiológico — conceitos de periodização não se explicam em frases isoladas.

### 3.3 Metadata por Documento

Cada documento indexado deve carregar metadata estruturado para filtragem:

```java
doc.getMetadata().put("domain", "periodizacao");     // periodizacao | fisiologia | recuperacao | nutricao
doc.getMetadata().put("language", "en");
doc.getMetadata().put("source", "lydiard-methodology.pdf");
doc.getMetadata().put("phase_relevance", "BASE,BUILD"); // fases de treino onde se aplica
doc.getMetadata().put("ingested_at", LocalDate.now().toString());
```

### 3.4 Configuração Spring AI — VectorStore

```java
@Configuration
public class RagConfig {

    @Bean
    public VectorStore vectorStore(EmbeddingModel embeddingModel,
                                   JdbcTemplate jdbcTemplate) {
        return PgVectorStore.builder(jdbcTemplate, embeddingModel)
            .dimensions(1536)
            .distanceType(PgVectorStore.PgDistanceType.COSINE_DISTANCE)
            .indexType(PgVectorStore.PgIndexType.HNSW)
            .build();
    }

    @Bean
    public TokenTextSplitter textSplitter() {
        return new TokenTextSplitter(512, 50, 10, 10000, true);
        //                           ^    ^    ^
        //                    chunkSize overlap minChunkSize
    }
}
```

### 3.5 Pipeline de Ingestão

```java
@Service
public class KnowledgeIngestionService {

    private final VectorStore vectorStore;
    private final TokenTextSplitter splitter;

    @Transactional
    public void ingestDocument(Resource pdfResource, String domain, String phaseRelevance) {

        var reader = new PagePdfDocumentReader(pdfResource,
            PdfDocumentReaderConfig.builder()
                .withPagesPerDocument(2)
                .build());

        List<Document> docs = splitter.apply(reader.get());

        docs.forEach(doc -> {
            doc.getMetadata().put("domain", domain);
            doc.getMetadata().put("phase_relevance", phaseRelevance);
            doc.getMetadata().put("source", pdfResource.getFilename());
            doc.getMetadata().put("language", "en");
        });

        vectorStore.add(docs);

        log.info("Ingested {} chunks from {} into domain '{}'",
            docs.size(), pdfResource.getFilename(), domain);
    }
}
```

**Ingestão inicial:** Executar via `ApplicationRunner` em profile `dev` / script de bootstrap. Não re-ingerir documentos já presentes (verificar por source + hash).

### 3.6 Query Strategy por Caso de Uso

| Caso de Uso | Query para Embedding | Filtro de Metadata | topK |
|---|---|---|---|
| Geração de plano semanal | `"weekly training plan {fase} phase lydiard progression"` | `domain == 'periodizacao'` | 4 |
| Análise pós-treino | `"post-workout recovery RPE assessment"` | `domain == 'recuperacao'` | 3 |
| Justificativa para atleta | `"explain {zona} heart rate training adaptation"` | `domain == 'fisiologia'` | 3 |
| Retorno de lesão | `"return to run protocol post {lesao}"` | `domain == 'recuperacao'` | 4 |
| Nutrição pré-prova | `"race day nutrition carbohydrate loading marathon"` | `domain == 'nutricao'` | 3 |

---

## 4. Tool Calling — Dados do Atleta

### 4.1 Catálogo de Tools

#### `getMetricasCarga`
```java
@Tool(description = """
    Retrieves current training load metrics for an athlete.
    Returns CTL (chronic training load / fitness),
    ATL (acute training load / fatigue),
    TSB (training stress balance / form),
    weekly TSS accumulated, and current training phase.
    ALWAYS call this first when generating or adjusting training plans.
    """)
public AtletaMetricasDto getMetricasCarga(
        @ToolParam("Athlete ID") Long atletaId) {

    return metricasService.calcularMetricasAtuais(atletaId);
}
```

**Response shape:**
```json
{
  "atletaId": 42,
  "ctl": 54.2,
  "atl": 61.8,
  "tsb": -7.6,
  "weeklyTssAcumulado": 312,
  "faseAtual": "BUILD",
  "semanaFase": 3,
  "calculadoEm": "2026-05-24T08:00:00"
}
```

---

#### `getHistoricoTreinos`
```java
@Tool(description = """
    Returns recent completed workouts for an athlete.
    Includes actual vs planned comparison, RPE reported,
    average HR, distance, pace, and completion status.
    Use when assessing recent training adherence and recovery status.
    """)
public List<TreinoRealizadoDto> getHistoricoTreinos(
        @ToolParam("Athlete ID") Long atletaId,
        @ToolParam("Number of days to look back (recommended: 14)") int dias) {

    return treinoRepository.findRecentesByAtleta(atletaId, dias);
}
```

**Response shape:**
```json
[
  {
    "data": "2026-05-22",
    "tipo": "LONGAO",
    "distanciaPlaneadaKm": 18.0,
    "distanciaRealizadaKm": 17.4,
    "rpe": 7,
    "fcMediaBpm": 148,
    "tssRealizado": 112,
    "concluido": true,
    "observacaoAtleta": "Perna pesada nos últimos 4km"
  }
]
```

---

#### `getPerfilAtleta`
```java
@Tool(description = """
    Returns complete athlete profile: estimated VO2max,
    HR zones (Z1–Z5), injury history with resolution dates,
    race calendar for next 90 days, and coach notes.
    Call this for any personalized prescription.
    """)
public AtletaPerfilDto getPerfilAtleta(
        @ToolParam("Athlete ID") Long atletaId) {

    return atletaRepository.findPerfilCompleto(atletaId);
}
```

**Response shape:**
```json
{
  "atletaId": 42,
  "nome": "Marcus",
  "vo2maxEstimado": 54.1,
  "zonasHr": {
    "z1": { "min": 120, "max": 138 },
    "z2": { "min": 139, "max": 155 },
    "z3": { "min": 156, "max": 166 },
    "z4": { "min": 167, "max": 177 },
    "z5": { "min": 178, "max": 195 }
  },
  "lesoesHistorico": [
    {
      "tipo": "tendinite_patelar",
      "resolvidaEm": "2026-03-15",
      "semanasSemSintoma": 10
    }
  ],
  "proximasProvas": [
    { "nome": "São Silvestre", "data": "2026-12-31", "distanciaKm": 15 }
  ],
  "notasCoach": "Atleta responde bem a volume. Cuidado com Z4+ em dias consecutivos."
}
```

---

#### `getFeedbackRecente`
```java
@Tool(description = """
    Returns post-workout feedback submitted by the athlete:
    perceived effort (RPE), pain or discomfort reports,
    sleep quality ratings, and mood scores.
    Use during weekly review or readiness assessment.
    """)
public List<FeedbackTreinoDto> getFeedbackRecente(
        @ToolParam("Athlete ID") Long atletaId,
        @ToolParam("Days to look back (recommended: 7)") int dias) {

    return feedbackRepository.findByAtletaAndPeriodo(atletaId, dias);
}
```

---

#### `getProximoMicrociclo`
```java
@Tool(description = """
    Returns the already-planned next microcycle (if exists),
    including daily workout structure, target TSS,
    and phase goals. Use to avoid overwriting coach manual edits.
    """)
public MicrocicloDto getProximoMicrociclo(
        @ToolParam("Athlete ID") Long atletaId) {

    return planoRepository.findProximoMicrociclo(atletaId);
}
```

### 4.2 Isolamento Multi-tenant

**Crítico:** Todas as tools devem validar que o `atletaId` pertence ao tenant do coach autenticado antes de executar qualquer query.

```java
@Tool(...)
public AtletaMetricasDto getMetricasCarga(Long atletaId) {

    // Guard obrigatório em toda tool que acessa dado de atleta
    tenantGuard.assertAtletaBelongsToTenant(atletaId, tenantContext.getTenantId());

    return metricasService.calcularMetricasAtuais(atletaId);
}
```

```java
@Component
public class TenantGuard {

    public void assertAtletaBelongsToTenant(Long atletaId, Long tenantId) {
        boolean belongs = atletaRepository.existsByIdAndTenantId(atletaId, tenantId);
        if (!belongs) {
            throw new AccessDeniedException(
                "Athlete %d does not belong to tenant %d".formatted(atletaId, tenantId));
        }
    }
}
```

---

## 5. Arquitetura de Integração — O Fluxo Completo

### 5.1 Fluxo de Geração de Plano Semanal

```
Coach clica "Gerar Plano Semana N"
            │
            ▼
    PlanoSemanalService.gerarPlano(atletaId, tenantId)
            │
    ┌───────┴────────┐
    │                │
    ▼                ▼
Tool Calling        RAG Advisor
────────────        ───────────
getMetricasCarga    QuestionAnswerAdvisor
getHistoricoTreinos busca 4 chunks relevantes
getPerfilAtleta     filtra por fase atual
getFeedbackRecente
    │                │
    └───────┬────────┘
            │
            ▼
    Prompt enriquecido → Claude Sonnet 4
            │
            ▼
    PlanoSemanalDto (JSON estruturado)
            │
            ▼
    Status: AGUARDANDO_APROVACAO_COACH
            │
            ▼
    Coach revisa → APROVA / EDITA / REJEITA
            │
            ▼
    Atleta visualiza (somente após aprovação)
```

### 5.2 Implementação do Service

```java
@Service
@RequiredArgsConstructor
public class PlanoSemanalService {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;
    private final AtletaTools atletaTools;
    private final TenantContext tenantContext;

    public PlanoSemanalDto gerarPlano(Long atletaId, int semana) {

        // RAG advisor — busca contextualizada pela fase do atleta
        // (fase é buscada via tool antes, mas query inicial usa o padrão BUILD/BASE)
        var ragAdvisor = QuestionAnswerAdvisor.builder(vectorStore)
            .searchRequest(SearchRequest.builder()
                .query("weekly training plan progression periodization endurance running")
                .topK(4)
                .similarityThreshold(0.72)
                .filterExpression("language == 'en'")
                .build())
            .build();

        return chatClient.prompt()
            .system("""
                You are an expert running coach assistant for Menthoros platform.
                A human coach ALWAYS reviews and approves your output before the athlete sees it.
                Be precise, evidence-based, and always explain your reasoning.
                Reference specific metrics from tool results to justify prescriptions.
                Never generate a plan without first fetching athlete data via tools.
                """)
            .user(u -> u.text("""
                Generate the complete weekly training plan for week {semana} for athlete ID {atletaId}.

                Steps you MUST follow:
                1. Fetch current load metrics (CTL, ATL, TSB) via getMetricasCarga
                2. Fetch last 14 days of training history via getHistoricoTreinos
                3. Fetch athlete profile (VO2max, HR zones, injuries) via getPerfilAtleta
                4. Fetch last 7 days of feedback via getFeedbackRecente
                5. Based on all data fetched, generate the weekly plan

                Output language: Portuguese (Brazil)
                Keep sports science terminology in English (TSS, CTL, Z2, RPE, etc.)
                """)
                .param("atletaId", atletaId)
                .param("semana", semana))
            .tools(atletaTools)
            .advisors(ragAdvisor)
            .call()
            .entity(PlanoSemanalDto.class);
    }
}
```

### 5.3 Fluxo de Análise Pós-Treino (Agent Skill — Sub-500ms)

Para análises imediatas pós-treino, **não usar RAG** (latência) nem Tool Calling completo. Usar Deterministic Skill com dados já disponíveis:

```java
@Component
public class AnalisePosTrainoSkill {

    // Skill determinístico — sem LLM, sub-500ms
    public FeedbackImediatoDto analisar(TreinoRealizado treino, AtletaMetricasDto metricas) {

        var alertas = new ArrayList<String>();

        // Regras determinísticas
        if (treino.getRpe() >= 8 && metricas.getTsb() < -10) {
            alertas.add("Alto RPE com TSB já negativo — monitorar recuperação");
        }

        if (treino.getFcMediaBpm() > metricas.getZonasHr().getZ4().getMax()) {
            alertas.add("Frequência cardíaca acima do planejado para o tipo de treino");
        }

        double aderencia = treino.getDistanciaRealizadaKm() / treino.getDistanciaPlaneadaKm();
        if (aderencia < 0.85) {
            alertas.add("Volume realizado abaixo de 85% do planejado");
        }

        return FeedbackImediatoDto.builder()
            .tssRealizado(calcularTss(treino))
            .alertas(alertas)
            .statusRecuperacao(avaliarRecuperacao(metricas))
            .build();
    }
}
```

---

## 6. Modelo de Dados

### 6.1 Tabelas necessárias

```sql
-- Métricas calculadas (cache semanal para performance)
CREATE TABLE tb_metricas_atleta (
    id              BIGSERIAL PRIMARY KEY,
    atleta_id       BIGINT NOT NULL REFERENCES tb_atleta(id),
    tenant_id       BIGINT NOT NULL,
    ctl             DECIMAL(6,2),
    atl             DECIMAL(6,2),
    tsb             DECIMAL(6,2),
    weekly_tss      DECIMAL(8,2),
    fase_atual      VARCHAR(20),  -- BASE | BUILD | ESPECIFICO | TAPER
    semana_fase     INT,
    calculado_em    TIMESTAMPTZ NOT NULL,
    UNIQUE (atleta_id, DATE(calculado_em))
);

-- Vector store (gerenciado pelo Spring AI / pgvector)
-- Tabela: vector_store (criada automaticamente pelo PgVectorStore)
-- Campos: id, content, metadata (jsonb), embedding (vector(1536))
```

### 6.2 Índice para busca vetorial

```sql
-- HNSW para performance em produção (melhor que IVFFlat para updates frequentes)
CREATE INDEX ON vector_store
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## 7. Estratégia de Prompting

### 7.1 Code-switching (padrão existente — manter)

```
Instruções do sistema:    Inglês  (melhor assertividade técnica do LLM)
Terminologia esportiva:   Inglês  (TSS, CTL, ATL, TSB, RPE, VO2max, Z1–Z5)
Output para coach/atleta: Português Brasil
```

### 7.2 Ordem de tool calls (instruir explicitamente)

O LLM deve ser instruído a sempre buscar dados nesta sequência antes de gerar:

```
1. getMetricasCarga      → entender estado atual de carga
2. getPerfilAtleta       → entender restrições e zonas
3. getHistoricoTreinos   → entender aderência e padrão recente
4. getFeedbackRecente    → entender percepção subjetiva
5. getProximoMicrociclo  → não sobrescrever edições do coach
→ GERA O PLANO
```

### 7.3 Output estruturado obrigatório

```java
// Sempre usar .entity() para forçar JSON estruturado e validado
.call()
.entity(PlanoSemanalDto.class)

// PlanoSemanalDto deve ter:
// - List<TreinoDiarioDto> treinos (7 itens)
// - String justificativaFisiologica (em português)
// - String alertasCoach (em português, pode ser vazio)
// - double tssSemanaPlanejado
// - String fasePeriodizacao
```

---

## 8. Modelo de Custo Estimado

| Componente | Custo Estimado | Observação |
|---|---|---|
| Tool Calling (4 tools/plano) | ~800 tokens input | Dados estruturados, concisos |
| RAG chunks (4 chunks × ~500 tokens) | ~2.000 tokens input | Apenas trechos relevantes |
| Output plano semanal | ~1.200 tokens output | JSON estruturado + justificativa |
| **Total por geração de plano** | **~4.000 tokens** | Claude Sonnet 4 |
| **Custo por plano @ Sonnet 4** | **~R$ 0,18–0,22** | Estimativa Mai/2026 |
| **100 atletas, 4 planos/mês** | **~R$ 72–88/mês** | Viável no modelo atual |

**Nota:** Análises pós-treino (Deterministic Skills) têm custo zero — sem chamada LLM.

---

## 9. Plano de Implementação

### Fase 1 — Tool Calling (Semanas 1–2)
- [ ] Criar `AtletaTools` com as 5 tools mapeadas
- [ ] Implementar `TenantGuard` em todas as tools
- [ ] Criar `AtletaMetricasDto`, `TreinoRealizadoDto`, `AtletaPerfilDto`, `FeedbackTreinoDto`
- [ ] Calcular CTL/ATL/TSB on-the-fly em `MetricasService`
- [ ] Integrar tools no `ChatClient` via `.tools(atletaTools)`
- [ ] Testar com atleta de desenvolvimento hardcoded

### Fase 2 — RAG (Semanas 3–4)
- [ ] Configurar `PgVectorStore` com HNSW index
- [ ] Criar `KnowledgeIngestionService`
- [ ] Reunir e ingerir 15–20 documentos iniciais (prioridade: periodização + fisiologia)
- [ ] Implementar `QuestionAnswerAdvisor` com filtros por domain
- [ ] Testar qualidade dos chunks com queries reais de geração de plano

### Fase 3 — Integração e Ajuste (Semana 5)
- [ ] Combinar RAG + Tool Calling em `PlanoSemanalService`
- [ ] Ajustar `similarityThreshold` baseado em resultados reais (começar em 0.72)
- [ ] Implementar logging estruturado de tool calls para análise de padrões
- [ ] Comparar aceitação coach: template atual vs nova arquitetura
- [ ] Documentar `claude.md` do módulo AI

### Fase 4 — Métricas e Baseline (Semana 6)
- [ ] Instrumentar taxa de aceitação sem edição por tipo de prescrição
- [ ] Medir latência P50/P95 do fluxo completo (target: < 8s P95)
- [ ] Medir custo real por plano gerado
- [ ] Ajustar chunk size e topK baseado em dados reais

---

## 10. Critérios de Sucesso

| Métrica | Baseline Atual | Target Fase 1 | Target Fase 2 |
|---|---|---|---|
| Taxa de aceitação sem edição | ~60% | ~75% | ~85–88% |
| Tempo médio de revisão pelo coach | ~15 min | ~10 min | ~5 min |
| Latência P95 geração de plano | — | < 10s | < 8s |
| Custo por plano gerado | — | < R$ 0,25 | < R$ 0,22 |
| Satisfação do coach (NPS proxy) | — | — | Medir no piloto |

---

## 11. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| LLM ignora ordem de tool calls | Média | Alto | Instruir sequência explicitamente no system prompt |
| Chunk retrieval traz contexto errado | Média | Médio | Ajustar similarityThreshold + filtros de metadata |
| Latência total > 10s para o coach | Baixa | Médio | Skeleton UI + streaming quando disponível |
| Vazamento de dados entre tenants via tools | Baixa | Crítico | TenantGuard obrigatório em todas as tools |
| Custo por plano maior que estimado | Baixa | Médio | Monitorar tokens reais, ajustar topK se necessário |

---

## 12. Referências

- [Spring AI — Tool Calling](https://docs.spring.io/spring-ai/reference/api/tools.html)
- [Spring AI — RAG / VectorStore](https://docs.spring.io/spring-ai/reference/api/vectordbs.html)
- [Spring AI — QuestionAnswerAdvisor](https://docs.spring.io/spring-ai/reference/api/advisors.html)
- [pgvector — HNSW Index](https://github.com/pgvector/pgvector#hnsw)
- Sealy & Mujika — *Periodization Theory and Methodology of Training* (base RAG)
- Coggan & Allen — *Training and Racing with a Power Meter* (referência TSS/CTL/ATL)

---

*Este documento é uma living spec — atualizar após cada fase de implementação com aprendizados reais.*
