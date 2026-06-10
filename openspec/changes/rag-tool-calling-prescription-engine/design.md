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

### D4: similarityThreshold de 0.72 como ponto de partida (não corte rígido)

O valor 0.72 é **específico do modelo de embedding** (não portável entre modelos) e serve apenas como ponto de partida. A estratégia de recuperação SHALL ser: buscar `topK` por similaridade e então aplicar o threshold como filtro **suave** — nunca exigir um número mínimo fixo de chunks acima do corte. Se nenhum chunk atingir o threshold, gerar sem contexto RAG e logar warning (ver `fase-2-rag`).

O threshold e o `topK` SHALL ser calibrados **empiricamente contra um golden set rotulado** (ver D11), não por intuição. Abaixo de ~0.70 tende a trazer ruído; acima de ~0.80 pode excluir analogias úteis — intervalo de busca 0.70–0.80.

### D5: AnalisePosTrainoSkill sem LLM

Para feedback imediato pós-treino (exibido ao atleta em < 500ms), usar skill determinística com regras fisiológicas hardcoded: RPE × TSB, FC real vs zona planejada, aderência de volume. Custo zero. LLM só é invocado em análises semanais agendadas ou sob demanda explícita do coach.

### D6: Chunking ~400–600 tokens (atenção: TokenTextSplitter NÃO tem overlap)

Chunks maiores (> 800t) diluem a busca por similaridade. Chunks menores (< 200t) perdem contexto fisiológico de conceitos de periodização que não se explicam em frases isoladas.

**Correção técnica:** o `TokenTextSplitter` do Spring AI **não suporta overlap**. Em `new TokenTextSplitter(512, 50, 10, 10000, true)` os parâmetros são `(defaultChunkSize=512, minChunkSizeChars=50, minChunkLengthToEmbedChars=10, maxNumChunks=10000, keepSeparator=true)` — o `50` é tamanho mínimo de chunk em caracteres, **não** overlap. Portanto a meta original de "10% de overlap" é inalcançável com este splitter.

Decisão: usar `TokenTextSplitter` (512 tokens, **sem overlap**) como baseline. Se a avaliação (D11) mostrar perda de contexto nas bordas dos chunks, migrar para um splitter com overlap real (ex.: split recursivo por caractere com `chunkOverlap`) e/ou chunking por seção do documento, em vez de página+token.

### D7: Idioma dos documentos RAG em inglês

Corpus de treino dos LLMs é mais rico em inglês para terminologia esportiva científica. Documentos ingeridos em inglês. Output do LLM permanece em português (BR) via instrução no system prompt (padrão code-switching já estabelecido no projeto).

### D8: PlanoSemanalDto com output estruturado obrigatório

Usar `.entity(PlanoSemanalDto.class)` para forçar JSON estruturado e validado pelo Spring AI. O DTO deve conter: `List<TreinoDiarioDto> treinos` (7 itens), `String justificativaFisiologica`, `String alertasCoach`, `double tssSemanaPlanejado`, `String fasePeriodizacao`.

### D9: Ordem de tool calls e binding do atletaId

O LLM é instruído no user prompt a seguir a sequência de consultas antes de gerar (ver `fase-1-tool-calling` para a lista canônica de tools `AthleteQueryTools`).

**Correção de segurança (cross-athlete):** o `atletaId` **não** SHALL ser um `@ToolParam` preenchido pelo LLM. O LLM não recebe nem escolhe IDs — o `atletaId` da geração é **vinculado server-side** a partir do contexto do request (escopo de request / closure no registro das tools). O `TenantGuard` protege contra cross-tenant; o binding server-side protege contra **cross-athlete dentro do mesmo tenant** (LLM pedir, por alucinação, dados de outro atleta do mesmo coach). Tipos de ID são `UUID` em todo o projeto — não `Long`.

### D10: Avaliar montagem determinística de contexto vs. round-trips de tool calling

Como a ordem das consultas é **fixa** (todas as tools são chamadas, sempre, na mesma sequência), o tool calling iterativo gera múltiplos round-trips LLM↔servidor e ameaça o alvo de latência **P95 < 8s**. Decisão: na Fase 4, **medir** o fluxo e comparar com a alternativa de **pré-buscar os dados server-side e injetá-los como contexto** numa única chamada de geração. Tool calling permanece justificado apenas para consultas genuinamente *condicionais/opcionais*; para o conjunto fixo atual, a montagem determinística tende a ser mais rápida e elimina o risco "LLM ignora/reordena tools". A escolha final SHALL ser baseada na medição de latência real.

### D11: Avaliação de retrieval com golden set rotulado

Antes de tunar `threshold`/`topK`, criar um **golden set** com as queries reais (≥ as 5 do `tasks` 9.2) mapeadas aos chunks relevantes esperados, e medir **context precision/recall@k** (em código próprio Java/SQL — não depender de ferramentas Python). Sem isso, o ajuste de threshold/topK é chute e falhas de retrieval não são debugáveis isoladamente da qualidade do LLM.

### D12: Versionamento de embedding, recuperação híbrida e filtro por domínio

- **Versionamento:** cada chunk SHALL gravar no metadata o `embedding_model` e sua versão. Troca de modelo (mudança de dimensão) exige re-embed total — o metadata permite identificar o que reindexar.
- **Híbrido (evolução):** `QuestionAnswerAdvisor` é recuperação densa pura. Para terminologia científica específica (Lydiard, polarized, "lactate threshold"), avaliar **híbrido vetor + FTS (inglês) + RRF** e **reranking** do top-k antes de enviar ao LLM. A 5k chunks o custo é baixo e a precisão sobe.
- **Filtro por domínio:** a query SHALL filtrar por `domain` conforme a fase de periodização (ex.: TAPER → `recuperacao`+`periodizacao`), além de `language='en'`. O `domain` já é gravado no metadata e hoje é subutilizado.

## Architecture

```
PlanoSemanalService.gerarPlano(atletaId, semana)
        │
        ├── QuestionAnswerAdvisor  ──→ VectorStore (pgvector HNSW)
        │   └── topK=4, threshold≈0.72 (suave), filter: language=='en' AND domain∈fase
        │
        └── AthleteQueryTools   (lista canônica: fase-1-tool-calling — atletaId do contexto, não do LLM)
            ├── getRecoveryStatus()        → tb_metricas_atleta (cache)
            ├── getRecentWorkouts(dias)    → tb_treino_realizado
            ├── getAthleteProfile()        → tb_atleta + tb_prova + coach notes
            ├── getTrainingZones()         → zonas Z1–Z5
            ├── getIntervalEligibility()   → elegibilidade intervalado
            └── getWeeklyAvailability()    → disponibilidade semanal
                │
                └── TenantGuard.assertAtletaBelongsToTenant() ← primeira linha de toda tool
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

> **Nota de consistência:** a lista canônica de tools é a de `fase-1-tool-calling` (`AthleteQueryTools`, nomes em inglês). Os exemplos abaixo são ilustrativos do *padrão* (guard + binding), não da nomenclatura.

```java
// AthleteQueryTools — registro de tools para o ChatClient.
// atletaId NÃO é @ToolParam: é resolvido do contexto do request (D9),
// nunca escolhido pelo LLM. IDs são UUID em todo o projeto.
@Component
public class AthleteQueryTools {
    @Tool(description = "...")
    public AtletaMetricasDto getRecoveryStatus() {
        UUID atletaId = AiRequestContext.getAtletaId();   // binding server-side
        UUID tenantId = TenantContext.getRequiredTenantId();
        tenantGuard.assertAtletaBelongsToTenant(atletaId, tenantId);
        ...
    }
    // + tools restantes (ver fase-1-tool-calling)
}

// TenantGuard — guard obrigatório em toda tool (primeira linha)
@Component
public class TenantGuard {
    public void assertAtletaBelongsToTenant(UUID atletaId, UUID tenantId) { ... }
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
