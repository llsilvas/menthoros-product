## Why

A change `rag-tool-calling-prescription-engine` injeta **conhecimento universal** (Lydiard, polarized, fisiologia) na geração de planos. Mas o conhecimento universal é igual para todo coach — não captura **como este coach específico treina**: suas preferências de distribuição semanal, tom das justificativas, escolhas em situações ambíguas, e as correções que ele repetidamente faz nos planos gerados.

Hoje, quando o coach edita um plano gerado, essa correção é **perdida** — o sistema não aprende. Cada novo plano parte do mesmo ponto genérico, e o coach refaz as mesmas edições. Isso limita o teto de aceitação sem edição: o conhecimento universal sozinho não chega à "voz do coach".

**Meta:** usar os planos que o coach **aprovou** (e como ele **corrigiu** os que editou) como base de exemplos recuperável por similaridade — personalizando a geração para o estilo de cada coach e criando um loop de aprendizado que melhora com o uso.

Esta change depende de `rag-tool-calling-prescription-engine` (infra `PgVectorStore` + instrumentação de aceitação `editadoPeloCoach`/`geradoPorVersao`) e de `add-recommendation-explainability` (citação de fontes).

## What Changes

**RAG tenant-scoped — corpus de metodologia do coach:**
- `CoachMethodologyCorpusService` que indexa, por coach/tenant, um **resumo estruturado de situação** de cada plano aprovado: snapshot do perfil do atleta + fase de periodização + objetivo + estrutura do plano final + justificativa
- Para planos **editados**, indexar a **versão final do coach** (não a gerada pela IA) — a correção é o melhor sinal de estilo
- `CoachCorpusGuard` obrigatório em toda recuperação (filtro `tenantId` + `coachId`) — mesma criticidade do `TenantGuard` das tools

**Loop de aprendizado:**
- Ao aprovar/editar um plano (gatilho da instrumentação de aceitação da change base), ingerir o exemplar no corpus do coach de forma idempotente

**Integração na geração:**
- `PlanoSemanalService` recupera os top-K exemplares mais similares do **próprio coach** (por perfil+fase+objetivo) e os injeta como **few-shot** no prompt, junto da KB universal e das tools
- Cold-start: se o coach tem menos de N exemplares, pular o few-shot e usar apenas KB universal

## Capabilities

### New Capabilities

- `coach-methodology-rag`: base vetorial tenant/coach-scoped de exemplares de planos aprovados/corrigidos do próprio coach, recuperada por similaridade de situação e injetada como few-shot na geração; alimentada por loop de aprendizado a cada aprovação

### Modified Capabilities

- `plano-semanal-generation`: a geração passa a compor KB universal (RAG global) + exemplares do coach (RAG tenant-scoped) + dados do atleta (Tool Calling)

## Impact

**Banco/vetor:**
- Partição vetorial tenant-scoped: `metadata.scope = 'tenant'` com `tenant_id` e `coach_id` obrigatórios (mesma tabela `vector_store` ou coleção dedicada — ver design D7)
- Nenhuma nova tabela relacional obrigatória; reusa a instrumentação `tb_plano_treino` (`editadoPeloCoach`, `geradoPorVersao`) da change base como gatilho

**Código:**
- Novo pacote `com.menthoros.ai.rag.coach` para `CoachMethodologyCorpusService`, `CoachCorpusGuard`, `SituacaoExemplarBuilder`
- `PlanoSemanalService` estendido para recuperar e injetar few-shot do coach

**APIs:**
- Nenhum endpoint novo para o coach/atleta
- Endpoint admin opcional: `DELETE /api/admin/rag/coach/{coachId}` para purgar o corpus de um coach (LGPD / reset)

**Custo:** marginal — 1 embedding por plano aprovado (ingestão) + 1 query de similaridade por geração

## Riscos e mitigações

- **Vazamento cross-coach/cross-tenant** (impacto Crítico): `CoachCorpusGuard` com filtro `tenant_id` + `coach_id` obrigatório em **toda** recuperação; teste de isolamento explícito
- **PII de atleta no corpus** (impacto Alto): o exemplar é tenant-scoped (PII permitida dentro do tenant), mas **nunca** SHALL ser ingerido na KB universal/global; em deleção de atleta, purgar suas contribuições
- **Reforço de viés/erro do coach** (impacto Médio): ponderar exemplares de planos **aprovados sem edição** acima dos editados; permitir excluir um exemplar ruim
- **Cold-start** (impacto Baixo): fallback para KB universal abaixo de N exemplares
- **Drift de estilo** (impacto Baixo): recência como fator de ranking (exemplares recentes pesam mais)

## Referências

- OpenSpec `rag-tool-calling-prescription-engine` — fundação RAG + instrumentação de aceitação
- OpenSpec `add-recommendation-explainability` — citação de fontes/exemplares
- Spring AI — VectorStore filter expressions: https://docs.spring.io/spring-ai/reference/api/vectordbs.html
