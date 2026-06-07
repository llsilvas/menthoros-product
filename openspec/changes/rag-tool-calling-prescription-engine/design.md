## Context

Esta change estende a infraestrutura de tool calling introduzida em `add-llm-tool-use` e adiciona a camada RAG usando Spring AI + pgvector já disponível na stack. O backend é Spring Boot 3.5.4 / Java 21. O modelo LLM target é Claude Sonnet 4.

A separação de responsabilidades é o princípio guia:

| Tipo de dado | Estratégia | Motivo |
|---|---|---|
| CTL/ATL/TSB, histórico, lesões, feedbacks, zonas de HR | Tool Calling | Muda por atleta / por semana — dado transacional |
| Periodização, fisiologia, protocolos de recuperação, nutrição | RAG | Verdade universal — conhecimento enciclopédico |

## Goals

- Substituir prompt template estático por orquestração RAG + Tool Calling no `PlanoSemanalService`
- Garantir isolamento multi-tenant em todas as tools via `TenantGuard`
- Indexar base de conhecimento científico de treino no pgvector com chunking e metadata corretos
- Prover feedback pós-treino determinístico (sem LLM) em sub-500ms
- Elevar taxa de aceitação sem edição de ~60% → ~85–88%

## Non-Goals

- Interface de gerenciamento de documentos RAG para coaches (escopo futuro)
- Streaming de resposta do plano semanal (habilitação futura via Spring AI)
- Escrita de dados via tools (tools são read-only nesta fase)
- Suporte a documentos além de PDF na ingestão inicial

## Decisions

### D1: Tool Calling read-only nesta fase

Todas as tools expostas ao LLM são getters puros. Nenhuma tool escreve, cria ou altera dados. Isso simplifica auditoria e elimina risco de mutações não supervisionadas pelo LLM. Escrita (ex: salvar plano gerado) continua no `PlanoSemanalService` após o retorno do LLM.

### D2: TenantGuard como guard obrigatório — não opcional

O guard `TenantGuard.assertAtletaBelongsToTenant(atletaId, tenantId)` é chamado como **primeira linha** de cada tool, antes de qualquer query. Falha lança `AccessDeniedException`. Não existe tool sem guard. Isso é documentado como invariante no pacote `ai.tools`.

### D3: Ingestão RAG fora do ciclo de request

Ingestão de documentos é executada via `ApplicationRunner` no profile `rag-init` ou via endpoint admin `POST /api/admin/rag/ingest`. Nunca acontece em request do coach. Documentos já indexados são detectados por `source + hash MD5` para evitar re-ingestão.

### D4: similarityThreshold de 0.72 como baseline

Começar com 0.72. Abaixo de 0.70 traz chunks irrelevantes (ruído). Acima de 0.80 pode excluir analogias úteis. Ajuste baseado em análise de planos reais após Fase 3.

### D5: AnalisePosTrainoSkill sem LLM

Para feedback imediato pós-treino (exibido ao atleta em < 500ms), usar skill determinística com regras fisiológicas hardcoded: RPE × TSB, FC real vs zona planejada, aderência de volume. Custo zero. LLM só é invocado em análises semanais agendadas ou sob demanda explícita do coach.

### D6: Chunking 400–600 tokens com 10% overlap

Chunks maiores (> 800t) diluem a busca por similaridade. Chunks menores (< 200t) perdem contexto fisiológico de conceitos de periodização que não se explicam em frases isoladas. `TokenTextSplitter(512, 50, 10, 10000, true)` no Spring AI atende o target.

### D7: Idioma dos documentos RAG em inglês

Corpus de treino dos LLMs é mais rico em inglês para terminologia esportiva científica. Documentos ingeridos em inglês. Output do LLM permanece em português (BR) via instrução no system prompt (padrão code-switching já estabelecido no projeto).

### D8: PlanoSemanalDto com output estruturado obrigatório

Usar `.entity(PlanoSemanalDto.class)` para forçar JSON estruturado e validado pelo Spring AI. O DTO deve conter: `List<TreinoDiarioDto> treinos` (7 itens), `String justificativaFisiologica`, `String alertasCoach`, `double tssSemanaPlanejado`, `String fasePeriodizacao`.

### D9: Ordem de tool calls instruída explicitamente no prompt

O LLM deve ser instruído no user prompt a seguir esta sequência antes de gerar:
1. `getMetricasCarga` — estado atual de carga
2. `getPerfilAtleta` — restrições e zonas
3. `getHistoricoTreinos` — aderência e padrão recente (14 dias)
4. `getFeedbackRecente` — percepção subjetiva (7 dias)
5. `getProximoMicrociclo` — não sobrescrever edições do coach

## Architecture

```
PlanoSemanalService.gerarPlano(atletaId, semana)
        │
        ├── QuestionAnswerAdvisor  ──→ VectorStore (pgvector HNSW)
        │   └── topK=4, threshold=0.72, filter: language=='en'
        │
        └── AtletaTools
            ├── getMetricasCarga(atletaId)        → tb_metricas_atleta (cache)
            ├── getHistoricoTreinos(atletaId, 14)  → tb_treino_realizado
            ├── getPerfilAtleta(atletaId)          → tb_atleta + tb_prova + coach notes
            ├── getFeedbackRecente(atletaId, 7)    → tb_treino_realizado (feedback)
            └── getProximoMicrociclo(atletaId)     → tb_plano_treino
                │
                └── TenantGuard.assertAtletaBelongsToTenant() ← em todas as tools
```

```
TreinoRealizado criado
        │
        └── AnalisePosTrainoSkill.analisar(treino, metricas)
            ├── RPE × TSB check
            ├── FC real vs zona planejada
            └── aderência de volume (< 85% = alerta)
            → FeedbackImediatoDto (sem LLM, sub-500ms)
```

## Key Interfaces

```java
// AtletaTools — registro de tools para o ChatClient
@Component
public class AtletaTools {
    @Tool(description = "...")
    public AtletaMetricasDto getMetricasCarga(@ToolParam("Athlete ID") Long atletaId) { ... }
    // + 4 tools restantes
}

// TenantGuard — guard obrigatório em toda tool
@Component
public class TenantGuard {
    public void assertAtletaBelongsToTenant(Long atletaId, Long tenantId) { ... }
}

// KnowledgeIngestionService — ingestão de PDFs
@Service
public class KnowledgeIngestionService {
    @Transactional
    public void ingestDocument(Resource pdf, String domain, String phaseRelevance) { ... }
}
```

## Migration Path

1. `add-llm-tool-use` pode permanecer em paralelo — esta change não remove a infraestrutura existente; refatora o `PlanoSemanalService` para usar a nova estratégia
2. Feature flag `app.ai.rag-tool-calling.enabled` (default `false`) protege o rollout em produção
3. Comparar qualidade de planos gerados com e sem RAG antes de desligar o prompt template legado
