## ADDED Requirements

### Requirement: Manter base de conhecimento científico indexada no pgvector

O sistema SHALL manter uma base vetorial de conhecimento científico sobre treino de corrida, periodização, fisiologia e recuperação, consultável automaticamente durante a geração de planos.

#### Scenario: Documentos indexados com metadata estruturado
- **WHEN** um documento for ingerido na base de conhecimento
- **THEN** o sistema SHALL criar chunks de aproximadamente 400–600 tokens (baseline: `TokenTextSplitter` com 512 tokens)
- **NOTA:** o `TokenTextSplitter` do Spring AI **não suporta overlap** — não há requisito de "10% de overlap". Se a avaliação (golden set) indicar perda de contexto nas bordas, migrar para splitter com overlap real ou chunking por seção (ver design D6)
- **THEN** cada chunk SHALL conter metadata: `domain` (periodizacao | fisiologia | recuperacao | nutricao), `language` (en), `source` (nome do arquivo), `source_hash` (MD5 do conteúdo), `ingested_at`, `embedding_model` (modelo + versão usados para gerar o embedding, para suportar reindexação em troca de modelo)

#### Scenario: Deduplicação de documentos na ingestão
- **WHEN** um documento for ingerido com mesmo `source` e `source_hash` já existentes na base
- **THEN** o sistema SHALL ignorar a ingestão sem erro
- **THEN** o sistema SHALL logar: "documento já indexado, ignorando reindexação"

#### Scenario: Base inicial com cobertura mínima por domínio
- **WHEN** o sistema for inicializado com o profile `rag-init`
- **THEN** a base SHALL conter ao menos: 5 documentos de periodização, 5 de fisiologia do exercício, 3 de recuperação e 2 de nutrição esportiva
- **THEN** todos os documentos SHALL estar em inglês para maximizar qualidade semântica dos embeddings

### Requirement: Ingerir documentos fora do ciclo de request

O sistema SHALL executar a ingestão de documentos apenas via processo offline, nunca em request do coach ou atleta.

#### Scenario: Ingestão via profile dedicado
- **WHEN** o sistema iniciar com profile `rag-init`
- **THEN** o `ApplicationRunner` SHALL varrer `src/main/resources/knowledge-base/{periodizacao,fisiologia,recuperacao,nutricao}/` e ingerir todos os PDFs encontrados
- **THEN** ao concluir, SHALL logar: total de documentos novos ingeridos, total de chunks criados por domínio e total de documentos ignorados por deduplicação

#### Scenario: Nenhuma ingestão em request de coach
- **WHEN** um coach requisitar geração de plano, revisão ou qualquer operação de IA
- **THEN** nenhuma operação de ingestão ou re-indexação SHALL ser executada durante a request

### Requirement: Injetar contexto científico automaticamente na geração de planos

O sistema SHALL usar `QuestionAnswerAdvisor` para recuperar e injetar automaticamente chunks relevantes da base de conhecimento em cada chamada de geração de plano.

#### Scenario: RAG ativo na geração com fase de periodização
- **WHEN** `gerarPlano(atletaId, semana)` for invocado
- **THEN** o `QuestionAnswerAdvisor` SHALL executar busca por similaridade com query contextualizada pela fase de periodização do atleta (BASE | BUILD | ESPECIFICO | TAPER)
- **THEN** os chunks recuperados (até `topK`) que passarem o threshold SHALL ser injetados no contexto antes da geração

#### Scenario: Threshold de similaridade como filtro suave
- **WHEN** a busca por similaridade retornar chunks
- **THEN** o sistema SHALL recuperar `topK` chunks e incluir apenas os com score ≥ threshold (ponto de partida ≈ 0.72, **específico do modelo** e calibrado contra golden set — ver design D4/D11)
- **THEN** o sistema NÃO SHALL exigir um número mínimo fixo de chunks acima do threshold
- **THEN** se nenhum chunk atingir o threshold, o sistema SHALL gerar o plano sem contexto RAG e logar warning: "nenhum chunk relevante recuperado para fase {fase}"

#### Scenario: Filtro por idioma e domínio na query
- **WHEN** o `QuestionAnswerAdvisor` executar a busca
- **THEN** a query SHALL filtrar por `language = 'en'`
- **THEN** a query SHALL filtrar por `domain` relevante à fase de periodização (ex.: TAPER → `recuperacao`, `periodizacao`)
- **THEN** o threshold SHALL ser configurável via `app.ai.rag.similarity-threshold` e o topK via `app.ai.rag.top-k` (default: 4)

### Requirement: Indexar o pgvector com HNSW para busca eficiente

O sistema SHALL criar índice HNSW na tabela `vector_store` para garantir latência aceitável na busca por similaridade.

#### Scenario: Índice HNSW configurado corretamente
- **WHEN** a migration de índice for executada
- **THEN** o índice SHALL usar `vector_cosine_ops` com `m=16` e `ef_construction=64`
- **THEN** a busca por similaridade com topK=4 em base com 5.000+ chunks SHALL completar em < 200ms

#### Scenario: Tabela vector_store criada pelo Spring AI
- **WHEN** o PgVectorStore for inicializado pela primeira vez
- **THEN** a tabela `vector_store` SHALL existir com colunas: `id UUID`, `content TEXT`, `metadata JSONB`, `embedding vector(1536)`

### Requirement: Compor RAG e Tool Calling no mesmo fluxo de geração

O sistema SHALL combinar `QuestionAnswerAdvisor` (RAG) e `AthleteQueryTools` (Tool Calling) no mesmo `ChatClient` usado para geração do plano.

#### Scenario: Geração usa RAG + Tool Calling simultaneamente
- **WHEN** `gerarPlano(atletaId, semana)` for invocado
- **THEN** o `ChatClient` SHALL estar configurado com: `.advisors(questionAnswerAdvisor)` E `.tools(athleteQueryTools)`
- **THEN** o contexto enviado ao LLM SHALL conter: chunks RAG injetados pelo advisor + resultados de tool calls solicitados pelo LLM

#### Scenario: Justificativa fisiológica referencia RAG e tools
- **WHEN** o plano gerado contiver `justificativaIa` em uma sessão
- **THEN** a justificativa SHALL referenciar conceitos de periodização ou fisiologia provenientes do RAG (ex: "base aeróbica", "princípio de sobrecarga progressiva", "zona 2 para desenvolvimento aeróbico")
- **THEN** a justificativa SHALL mencionar métricas concretas consultadas via tool (ex: CTL, TSB, FC limiar)
