## Why

O sistema de prescrição atual opera com **Prompt Templates estáticos**: dados do atleta são interpolados como strings no momento da requisição e enviados diretamente ao LLM. Esse modelo tem três limitações críticas:

1. **Dado stale** — CTL/ATL/TSB calculados no momento do template, não da geração; prescrições baseadas em métricas já desatualizadas;
2. **Sem raciocínio fisiológico** — o LLM depende apenas do seu corpus de treinamento base, sem acesso a metodologias de periodização referenciadas; justificativas fracas fazem o coach editar mais;
3. **Sem contexto científico** — planos genéricos, baixa aderência às metodologias (Lydiard, polarized, etc.).

**Resultado:** taxa de aceitação pelo coach sem edição estimada em ~60–65%.

A change `add-llm-tool-use` adicionou a infraestrutura base de tool calling. Esta change completa a arquitetura híbrida **RAG + Tool Calling**, substituindo o Prompt Template por uma estratégia de separação clara de responsabilidades:

```
RAG          → "O que é verdade universal sobre treino"  (conhecimento científico)
Tool Calling → "O que está acontecendo com este atleta"  (dados dinâmicos, isolados por tenant)
```

**Meta:** elevar a taxa de aceitação sem edição de ~60% → ~85–88% antes de atingir 500 atletas.

## What Changes

**Tool Calling — tools de domínio:**
- `AthleteQueryTools` (lista canônica em `specs/fase-1-tool-calling`). O `atletaId` é vinculado server-side a partir do contexto do request — nunca um `@ToolParam` escolhido pelo LLM (proteção cross-athlete); IDs são `UUID`
- `TenantGuard` como guard obrigatório (primeira linha) em todas as tools (isolamento multi-tenant crítico)
- `tb_metricas_atleta` como cache semanal de CTL/ATL/TSB calculados

**RAG — base de conhecimento vetorial:**
- `KnowledgeIngestionService` para processar PDFs de periodização, fisiologia, recuperação e nutrição
- `RagConfig` configurando `PgVectorStore` com HNSW index (1536 dims, cosine distance)
- Ingestão inicial de 15–20 documentos com chunking de 400–600 tokens e metadata estruturado por domínio

**Integração — PlanoSemanalService refatorado:**
- `PlanoSemanalService.gerarPlano()` combinando `QuestionAnswerAdvisor` (RAG) + `AthleteQueryTools` (Tool Calling)
- Prompt com instrução explícita de ordem de chamada de tools (1→5) antes de gerar o plano
- Output estruturado obrigatório via `.entity(PlanoSemanalDto.class)`

**Deterministic Skill — pós-treino sem LLM:**
- `AnalisePosTrainoSkill` para feedback imediato pós-treino (sub-500ms, zero custo de LLM)
- Regras determinísticas: RPE × TSB, FC real vs zona, aderência de volume

## Capabilities

### New Capabilities

- `rag-knowledge-base`: base vetorial de conhecimento científico de treino indexada no pgvector; consultada automaticamente na geração de planos
- `atleta-tools`: ferramentas de leitura de dados do atleta invocáveis pelo LLM com isolamento multi-tenant obrigatório
- `deterministic-post-workout-feedback`: análise imediata pós-treino via regras determinísticas, sem custo de LLM

### Modified Capabilities

- `plano-semanal-generation`: migra de prompt template estático para orquestração RAG + Tool Calling no `PlanoSemanalService`

## Impact

**Entidades e banco:**
- Nova tabela: `tb_metricas_atleta` (ctl, atl, tsb, weekly_tss, fase_atual, semana_fase, calculado_em) com UNIQUE (atleta_id, DATE(calculado_em))
- Tabela `vector_store` criada automaticamente pelo `PgVectorStore` (Spring AI) — campos: id, content, metadata JSONB, embedding vector(1536)
- Índice HNSW em `vector_store.embedding` com `m=16, ef_construction=64`

**APIs:**
- Nenhum endpoint novo para o coach/atleta; mudança é interna ao `PlanoSemanalService`
- Endpoint administrativo opcional: `GET /api/admin/rag/documents` para inspeção do corpus (role ADMIN)

**Código:**
- Novo pacote `com.menthoros.ai.tools` para `AtletaTools` e `TenantGuard`
- Novo pacote `com.menthoros.ai.rag` para `RagConfig`, `KnowledgeIngestionService`
- Novo pacote `com.menthoros.ai.skill` para `AnalisePosTrainoSkill`
- `PlanoSemanalService` refatorado para usar `ChatClient` com `.tools()` e `.advisors()`

**Custo estimado por geração de plano (Claude Sonnet 4):**
- ~4.000 tokens total (tool results + RAG chunks + output)
- ~R$ 0,18–0,22 por plano
- ~R$ 72–88/mês para 100 atletas com 4 planos/mês

## Riscos e mitigações

- **Vazamento de dados entre tenants via tools** (impacto Crítico): `TenantGuard.assertAtletaBelongsToTenant()` obrigatório em toda tool antes de qualquer query
- **LLM ignora ordem de tool calls** (impacto Alto): instruir sequência explicitamente no system prompt com numeração 1→5
- **Chunk retrieval traz contexto errado** (impacto Médio): ajustar `similarityThreshold` (início 0.72) + filtros de metadata por domain
- **Latência total > 10s** (impacto Médio): skeleton UI + streaming quando disponível no Spring AI

## Referências

- **OpenSpec `add-llm-tool-use`** — infraestrutura base de tool calling que esta change estende
- **Spring AI — Tool Calling**: https://docs.spring.io/spring-ai/reference/api/tools.html
- **Spring AI — RAG / VectorStore**: https://docs.spring.io/spring-ai/reference/api/vectordbs.html
- **Spring AI — QuestionAnswerAdvisor**: https://docs.spring.io/spring-ai/reference/api/advisors.html
- **Artifact de origem**: `menthoros-product/artifacts/rag-tool-calling-spec.md`
