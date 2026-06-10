## Fase 1 — Tool Calling (Semanas 1–2)

### 1. TenantGuard e infraestrutura de segurança

- [ ] 1.1 Criar `TenantGuard` em `com.menthoros.ai.tools` com método `assertAtletaBelongsToTenant(UUID atletaId, UUID tenantId)` — lança `AccessDeniedException` se atleta não pertencer ao tenant (IDs são `UUID` em todo o projeto)
- [ ] 1.2 Criar teste unitário: `TenantGuard` lança `AccessDeniedException` quando atleta não pertence ao tenant; passa silenciosamente quando pertence
- [ ] 1.3 Criar teste de segurança multi-tenant: tool invocada em sessão de tenant A não retorna dados de tenant B

### 2. DTOs de resposta das tools

- [ ] 2.1 Criar `AtletaMetricasDto` (atletaId, ctl, atl, tsb, weeklyTssAcumulado, faseAtual, semanaFase, calculadoEm)
- [ ] 2.2 Criar `TreinoRealizadoResumoDto` (data, tipo, distanciaPlaneadaKm, distanciaRealizadaKm, rpe, fcMediaBpm, tssRealizado, concluido, observacaoAtleta)
- [ ] 2.3 Criar `AtletaPerfilDto` (atletaId, nome, vo2maxEstimado, zonasHr com Z1–Z5, lesoesHistorico, proximasProvas, notasCoach)
- [ ] 2.4 Criar `FeedbackTreinoDto` (data, rpe, dolorRelato, qualidadeSono, humor)
- [ ] 2.5 Criar `MicrocicloDto` (atletaId, semana, treinos com targetTss e estrutura diária, fase, objetivoFase)

### 3. Tabela de métricas calculadas

- [ ] 3.1 Criar migration `Vxx__Create_tb_metricas_atleta.sql` com colunas (id, atleta_id, tenant_id, ctl, atl, tsb, weekly_tss, fase_atual, semana_fase, calculado_em) e UNIQUE (atleta_id, DATE(calculado_em))
- [ ] 3.2 Criar entidade `MetricasAtleta` e `MetricasAtletaRepository` com `findLatestByAtletaId(UUID atletaId)`
- [ ] 3.3 Criar `MetricasService.calcularMetricasAtuais(UUID atletaId)`: calcula CTL/ATL/TSB on-the-fly a partir de `tb_treino_realizado` e persiste em `tb_metricas_atleta` (cache por dia). **Reusar** o cálculo existente em `TsbServiceImpl`/`MetricasAgregadasServiceImpl` em vez de reimplementar CTL/ATL/TSB

### 4. AthleteQueryTools

> **Correção (A2/A4):** o `atletaId` NÃO é `@ToolParam` preenchido pelo LLM — é resolvido do contexto do request (ex.: `AiRequestContext`/escopo de request), vinculado por `PlanoSemanalService` antes da chamada. IDs são `UUID`. O guard é a primeira linha de toda tool.
>
> **Pendência de reconciliação:** a lista de tools abaixo (5 tools, `AtletaTools`) diverge da lista canônica de `fase-1-tool-calling` (`AthleteQueryTools`, 6 tools: `getAthleteProfile`, `getRecentWorkouts`, `getRecoveryStatus`, `getTrainingZones`, `getIntervalEligibility`, `getWeeklyAvailability`). **Adotar a lista do spec `fase-1` como fonte de verdade** e ajustar os subitens abaixo numa próxima revisão de tasks.

- [ ] 4.1 Criar `AthleteQueryTools` com `@Component` no pacote `com.menthoros.ai.tools` (atletaId via contexto, não @ToolParam)
- [ ] 4.2 Implementar `getRecoveryStatus()`: guard → `MetricasService.calcularMetricasAtuais(atletaId-do-contexto)` → retorna `AtletaMetricasDto`
- [ ] 4.3 Implementar `getRecentWorkouts(@ToolParam int dias)`: guard → query últimos N dias → retorna `List<TreinoRealizadoResumoDto>`
- [ ] 4.4 Implementar `getAthleteProfile()`: guard → join atleta + lesões ativas + próximas provas + notas → retorna `AtletaPerfilDto`
- [ ] 4.5 Implementar `getTrainingZones()` e `getIntervalEligibility()`: guard → retorna zonas Z1–Z5 / elegibilidade
- [ ] 4.6 Implementar `getWeeklyAvailability()` e `getFeedbackRecente(@ToolParam int dias)`: guard → disponibilidade / feedback recente
- [ ] 4.7 Testes unitários de cada tool: retorno correto, guard chamado, atletaId resolvido do contexto (LLM não consegue redirecionar), mock de repository

### 5. Validação com atleta de desenvolvimento

- [ ] 5.1 Criar profile `dev` com `ApplicationRunner` que registra as tools no `ChatClient` e executa uma geração de plano para atleta de teste hardcoded (athleteId configurável em `application-dev.yml`)
- [ ] 5.2 Verificar no log que as 5 tools são invocadas na ordem correta pelo LLM
- [ ] 5.3 Verificar que plano gerado contém referências às métricas retornadas pelas tools (CTL/ATL/TSB, zonas de HR)

---

## Fase 2 — RAG (Semanas 3–4)

### 6. Configuração PgVectorStore

- [ ] 6.1 Adicionar dependência `spring-ai-pgvector-store-spring-boot-starter` no `pom.xml` (se não presente)
- [ ] 6.2 Criar `RagConfig` com bean `VectorStore`: `PgVectorStore.builder().dimensions(1536).distanceType(COSINE_DISTANCE).indexType(HNSW).build()`
- [ ] 6.3 Criar bean `TokenTextSplitter(512, 50, 10, 10000, true)` em `RagConfig` — params `(chunkSize=512, minChunkSizeChars=50, minChunkLengthToEmbed=10, maxNumChunks=10000, keepSeparator=true)`. **Atenção:** `TokenTextSplitter` **não tem overlap**; o `50` é tamanho mínimo em chars, não overlap (ver design D6). Migrar para splitter com overlap/por-seção só se a avaliação indicar perda de contexto
- [ ] 6.4 Criar migration `Vxx__Create_vector_store_hnsw_index.sql` com `CREATE INDEX ON vector_store USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`
- [ ] 6.5 Verificar que `vector_store` é criada corretamente pelo Spring AI no startup (schema `id, content, metadata JSONB, embedding vector(1536)`)

### 7. KnowledgeIngestionService

- [ ] 7.1 Criar `KnowledgeIngestionService` com método `ingestDocument(Resource pdfResource, String domain, String phaseRelevance)`
- [ ] 7.2 Usar `PagePdfDocumentReader` com `withPagesPerDocument(2)`; aplicar `TokenTextSplitter`; adicionar metadata: domain, phase_relevance, source, `source_hash` (MD5), language, ingested_at, `embedding_model` (modelo + versão, para reindexação em troca de modelo — A8). Avaliar limpeza de cabeçalho/rodapé/referências dos PDFs antes do split
- [ ] 7.3 Implementar deduplicação: checar `metadata->>'source'` e hash MD5 do conteúdo antes de ingerir — não re-ingerir documentos já presentes
- [ ] 7.4 Criar `RagInitializer` (`ApplicationRunner`) ativo no profile `rag-init` que varre `src/main/resources/knowledge-base/` e ingere todos os PDFs encontrados com domain derivado do subdiretório
- [ ] 7.5 Log estruturado ao final: quantos chunks ingeridos por domínio, total de documentos novos vs já existentes

### 8. Base de conhecimento inicial

- [ ] 8.1 Criar estrutura de diretórios `src/main/resources/knowledge-base/{periodizacao,fisiologia,recuperacao,nutricao}/`
- [ ] 8.2 Reunir e adicionar mínimo de 15 documentos PDF (prioridade: periodização 5 docs + fisiologia 5 docs + recuperação 3 docs + nutrição 2 docs) — ver lista em `artifacts/rag-tool-calling-spec.md` seção 3.1
- [ ] 8.3 Executar ingestão em ambiente local; validar que chunks foram criados com metadata correto via query direta em `vector_store`

### 9. QuestionAnswerAdvisor e query strategy

- [ ] 9.1 Implementar `buildRagAdvisor(String fase)` em `PlanoSemanalService`: cria `QuestionAnswerAdvisor` com query contextualizada pela fase (BASE/BUILD/ESPECIFICO/TAPER), `topK` (default 4, via `app.ai.rag.top-k`), threshold suave (via `app.ai.rag.similarity-threshold`, ponto de partida ≈0.72), filtros `language == 'en'` **e `domain` relevante à fase** (A9). Não exigir número mínimo fixo de chunks acima do threshold (A7)
- [ ] 9.2 Criar **golden set** rotulado: as 5 queries reais (seção 3.6 do spec) mapeadas aos chunks relevantes esperados; medir **context precision/recall@k** (código Java/SQL próprio) — base para tunar threshold/topK e debugar retrieval isoladamente da qualidade do LLM (A6/D11)
- [ ] 9.3 Ajustar threshold/topK com base nas métricas do golden set (intervalo de busca 0.70–0.80; valor é específico do modelo de embedding)
- [ ] 9.4 (evolução) Avaliar busca **híbrida** (vetor + FTS inglês + RRF) e **reranking** do top-k vs. densa pura, medindo ganho de precisão contra o golden set (A5)

---

## Fase 3 — Integração e Ajuste (Semana 5)

### 10. PlanoSemanalService refatorado

- [ ] 10.1 Adicionar feature flag `app.ai.rag-tool-calling.enabled` (default `false`) em `application.yml`
- [ ] 10.2 Criar `PlanoSemanalService.gerarPlanoV2(UUID atletaId, int semana)` combinando `QuestionAnswerAdvisor` + `AthleteQueryTools` + system prompt com ordem de tool calls. **Vincular `atletaId` ao contexto do request antes da chamada** (não passar ao LLM). **Avaliar (D10/A1):** como a ordem das tools é fixa, medir round-trips de tool calling vs. pré-buscar os dados server-side e injetar como contexto numa única geração — escolher pela latência real (ver 15.2)
- [ ] 10.3 System prompt em inglês: "expert running coach assistant", "ALWAYS review by human coach", "reference specific metrics from tool results"
- [ ] 10.4 User prompt com instrução de sequência explícita de tool calls (Steps 1–5) + output em português BR com terminologia esportiva em inglês
- [ ] 10.5 `.call().entity(PlanoSemanalDto.class)` com campos: `List<TreinoDiarioDto>` (7 itens), `justificativaFisiologica`, `alertasCoach`, `tssSemanaPlanejado`, `fasePeriodizacao`
- [ ] 10.6 Criar `TreinoDiarioDto` (diaSemana, tipo, descricao, distanciaAlvoKm, tssAlvo, zonaPrincipal, instrucoes)
- [ ] 10.7 Manter `gerarPlano()` legado como fallback quando feature flag desligada

### 11. AnalisePosTrainoSkill

- [ ] 11.1 Criar `AnalisePosTrainoSkill` em `com.menthoros.ai.skill`
- [ ] 11.2 Implementar regras determinísticas: RPE ≥ 8 + TSB < -10 → alerta; FC média > zona planejada.max → alerta; aderência < 85% → alerta
- [ ] 11.3 Criar `FeedbackImediatoDto` (tssRealizado, alertas, statusRecuperacao)
- [ ] 11.4 Integrar na criação de `TreinoRealizado`: chamar skill após persistir e retornar `FeedbackImediatoDto` na resposta
- [ ] 11.5 Testes unitários: cada regra dispara no threshold correto; múltiplos alertas simultâneos; sem alertas em treino normal

### 12. Logging e observabilidade

- [ ] 12.1 Log estruturado após geração de plano: tool calls realizados (nome, latência individual), tokens totais estimados, versão do prompt (v1/v2)
- [ ] 12.2 Métrica Micrometer: `plano_geracao_duration_seconds{version}`, `rag_chunks_retrieved_total{domain}`, `tool_calls_total{tool_name}`
- [ ] 12.3 Log de warning se nenhuma tool foi chamada durante geração (indica que LLM ignorou as tools)

---

## Fase 4 — Métricas e Baseline (Semana 6)

### 13. Instrumentação de qualidade

- [ ] 13.1 Adicionar campo `geradoPorVersao` (v1/v2) em `tb_plano_treino` para rastrear qual engine gerou cada plano
- [ ] 13.2 Criar `PlanoAceitacaoRecord` para registrar quando coach aprova sem editar vs edita (campo `editadoPeloCoach BOOLEAN`, `tempoRevisaoMs BIGINT`) em `tb_plano_treino`
- [ ] 13.3 Query de baseline: `SELECT geradoPorVersao, AVG(CASE WHEN NOT editado THEN 1.0 ELSE 0.0 END) as taxa_aceitacao FROM tb_plano_treino GROUP BY geradoPorVersao`

### 14. Ajuste fino de RAG + Tool Calling

- [ ] 14.1 Analisar 20+ planos gerados: verificar se `justificativaFisiologica` referencia conceitos do RAG (periodização, zonas) e métricas das tools (CTL, TSB)
- [ ] 14.2 Ajustar `similarityThreshold` e `topK` com base em evidência real de relevância dos chunks
- [ ] 14.3 Revisar descrições das tools (`@Tool(description=...)`) se LLM não estiver chamando na ordem correta ou ignorando alguma tool

### 15. Testes de aceitação e documentação

- [ ] 15.1 Comparar qualidade textual de planos: v1 (template) vs v2 (RAG + Tool Calling) — checklist subjetivo do coach (5 atletas piloto, 4 semanas)
- [ ] 15.2 Medir latência P50/P95 do fluxo completo (target: P95 < 8s)
- [ ] 15.3 Medir custo real por plano gerado (target: < R$ 0,25)
- [ ] 15.4 Atualizar `design.md` com aprendizados reais: threshold final, topK final, padrões de tool calls observados
- [ ] 15.5 Ligar feature flag em produção quando taxa de aceitação V2 ≥ 75% em piloto
