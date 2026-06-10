## ADDED Requirements

### Requirement: Manter corpus de metodologia isolado por coach/tenant

O sistema SHALL manter uma base vetorial de exemplares de planos do próprio coach, estritamente isolada por `tenant_id` e `coach_id`, separada da base de conhecimento universal.

#### Scenario: Exemplar indexado com escopo e metadata
- **WHEN** um plano aprovado ou editado for ingerido no corpus de metodologia
- **THEN** o exemplar SHALL conter metadata: `tenant_id`, `coach_id`, `plano_id`, `quality` (`approved` | `edited`), `fase`, `nivel`, `embedding_model`, `ingested_at`
- **THEN** o exemplar SHALL ser marcado com escopo tenant (`scope = tenant` ou coleção dedicada), nunca como conhecimento global

#### Scenario: Texto embeddado é resumo de situação, não entidade JPA
- **WHEN** um exemplar for construído para ingestão
- **THEN** o texto embeddado SHALL ser um resumo estruturado (perfil do atleta, carga em faixas, estrutura do plano final, justificativa)
- **THEN** o builder NÃO SHALL acessar coleções lazy de entidades JPA

### Requirement: Aprender com a versão final do coach

O sistema SHALL indexar a versão do plano efetivamente aprovada pelo coach, capturando suas correções como sinal de estilo.

#### Scenario: Plano aprovado sem edição
- **WHEN** um plano for aprovado sem edição
- **THEN** o exemplar SHALL ser ingerido com `quality = approved`

#### Scenario: Plano editado pelo coach
- **WHEN** o coach salvar um plano com alterações em relação ao gerado
- **THEN** o sistema SHALL ingerir a **versão final editada pelo coach**, não a versão gerada pela IA
- **THEN** o exemplar SHALL ser marcado com `quality = edited`

#### Scenario: Ingestão idempotente
- **WHEN** o mesmo plano (mesmo `plano_id` e mesmo hash de resumo) for ingerido novamente
- **THEN** o sistema SHALL atualizar/ignorar sem duplicar o exemplar

### Requirement: Garantir isolamento na recuperação do corpus de coach

O sistema SHALL impedir que a recuperação retorne exemplares de outro coach ou tenant.

#### Scenario: Filtro de escopo obrigatório
- **WHEN** o corpus de metodologia for consultado
- **THEN** a busca SHALL aplicar filtro `tenant_id = <contexto>` E `coach_id = <contexto>` via `CoachCorpusGuard`
- **THEN** nenhum exemplar fora desse escopo SHALL ser retornado

#### Scenario: Contexto ausente não escala para global
- **WHEN** a recuperação for solicitada sem `tenant_id`/`coach_id` no contexto
- **THEN** o sistema SHALL abortar a recuperação do corpus de coach e cair no fallback (KB universal), nunca recuperar dados de coach sem filtro

### Requirement: Injetar exemplares do coach como few-shot na geração

O sistema SHALL recuperar e injetar os exemplares mais relevantes do próprio coach como exemplos few-shot, distintos do conhecimento universal e dos dados do atleta.

#### Scenario: Few-shot recuperado e ranqueado
- **WHEN** `gerarPlano(atletaId, semana)` for invocado com o corpus do coach acima do mínimo
- **THEN** o sistema SHALL recuperar até `top-k` (default 3) exemplares similares à situação atual (perfil + fase + objetivo)
- **THEN** o ranking SHALL combinar similaridade, qualidade (`approved` acima de `edited`) e recência
- **THEN** os exemplares SHALL ser injetados no prompt em seção separada dos chunks da KB universal e dos resultados de tools

#### Scenario: Cold-start sem exemplares suficientes
- **WHEN** o corpus do coach tiver menos que `min-exemplares` (default 5) para a situação
- **THEN** o sistema SHALL omitir o few-shot do coach e gerar com KB universal + tools
- **THEN** o sistema SHALL logar warning: "coach-rag: cold-start, usando apenas KB universal"

### Requirement: Permitir purga do corpus de um coach (LGPD)

O sistema SHALL permitir remover todos os exemplares de um coach e remover contribuições de um atleta deletado.

#### Scenario: Purga por coach
- **WHEN** `DELETE /api/admin/rag/coach/{coachId}` for chamado por usuário ADMIN
- **THEN** o sistema SHALL remover todos os exemplares com aquele `coach_id`

#### Scenario: Remoção em deleção de atleta
- **WHEN** um atleta for deletado
- **THEN** o sistema SHALL remover os exemplares que referenciem esse atleta
