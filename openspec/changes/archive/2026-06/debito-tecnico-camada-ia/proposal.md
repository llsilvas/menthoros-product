## Why

O mental model da camada de IA (documentado em `mental-model-ia.md`) identificou um conjunto de débitos técnicos que comprometem a resiliência, rastreabilidade e custo do sistema. Os problemas são agrupados em três categorias:

**Fragilidade de parsing (crítico):**
`WorkoutAnalysisListener` e `RaceProjectionNarrativeGenerator` fazem parse manual de JSON retornado pelo LLM: strip de markdown via regex, cast em `Map<String, Object>`, truncagem manual de strings. Qualquer variação no formato de resposta do modelo quebra silenciosamente. Já existem retries para cobrir falhas de parse — sinal de que o mecanismo atual é insuficiente.

**Prompts fora de controle de versão (médio):**
Três user prompts estão hardcoded em constantes Java ou inline em chamadas ao LLM, enquanto o restante da arquitetura usa SKILL.md e arquivos `.txt` versionados. Inconsistência que dificulta evoluir prompts sem deploy de código.

**Roteamento de modelo opaco (médio):**
`IaServiceImpl` — responsável pela geração de plano semanal, o fluxo mais caro e mais crítico do sistema — usa o `ChatClient @Primary`, que aponta para `OpenAiChatModel` genérico. O modelo efetivo é invisível no código e controlado apenas pelo `application.yml`. Sem rastreabilidade de qual modelo serve qual feature.

**Templates órfãos (baixo, mas ruído):**
Três arquivos em `src/main/resources/prompts/` não são referenciados por nenhum código: `plano-treino-avancado.txt`, `plano-treino-enhanced.txt`, `system-prompt.txt`. Constituem ruído e confundem leitura da arquitetura.

**Embedding sem uso real (baixo, risco de desperdício):**
`EmbeddingService` está injetado em `PlanoServiceImpl` mas o método `gerarEmbedding()` retorna `null`. A infra existe mas não produz valor.

## What Changes

**Sprint 1 — Quick wins (alto impacto, baixo esforço):**
- `WorkoutAnalysisListener`: migrar de `objectMapper.readValue(stripMarkdownCodeBlock())` para `.entity(AnaliseWorkoutRawDto.class)` com Anthropic structured output; remover `stripMarkdownCodeBlock` e lógica de retry para parse
- `RaceProjectionNarrativeGenerator`: criar `record NarrativeOutputDto` e migrar parse manual em `Map<String, Object>` para `.entity(NarrativeOutputDto.class)`; remover `truncate()` e cast manual de campos
- Externalizar `WorkoutAnalysisTranslator.TRANSLATE_PROMPT`, user prompt do `WorkoutAnalysisListener` e user prompt do `RaceProjectionNarrativeGenerator` para arquivos em `src/main/resources/prompts/`

**Sprint 2 — Estrutural (médio impacto, médio esforço):**
- Criar `gpt4oPlanoClient` específico em `MultiModelConfig` e adicionar `TaskComplexity.PLANO` ao `ModelRouter`; refatorar `IaServiceImpl` para usar o bean nomeado via `ModelRouter` em vez do `@Primary`
- Deletar `plano-treino-avancado.txt`, `plano-treino-enhanced.txt` e `system-prompt.txt`; remover campo `EmbeddingService` injetado mas não chamado em `PlanoServiceImpl`

**Sprint 3 — Apostas de alto impacto (médio-alto esforço — escopo futuro):**
- Tool calling para expor o motor determinístico de intervalados como `@Tool` nativo
- RAG sobre planos passados via pgvector (conectar o `EmbeddingService` existente a um `VectorStore`)
- Chat conversacional coach-IA com `ChatMemory` e gestão de sessão

> Sprint 3 é escopo de futuras changes independentes. Esta change cobre Sprint 1 e Sprint 2.

## Capabilities

### Modified Capabilities

- `workout-post-analysis`: análise pós-treino com parsing robusto e tipado; elimina risco de falha silenciosa por variação de formato LLM
- `race-projection-narrative`: narrativa de projeção de prova com output estruturado; elimina truncagem manual e cast frágil
- `plano-semanal-generation`: modelo explicitamente roteado por feature; rastreável em código e log

### Removed

- Templates órfãos: `plano-treino-avancado.txt`, `plano-treino-enhanced.txt`, `system-prompt.txt`

## Impact

**Código alterado:**
- `WorkoutAnalysisListener`: remover `stripMarkdownCodeBlock`, `callWithRetry` para parse, `objectMapper.readValue`; adicionar `.entity()`
- `RaceProjectionNarrativeGenerator`: remover `parseAndValidate`, `truncate`, `stripMarkdownCodeBlock`; criar `NarrativeOutputDto`; adicionar `.entity()`
- `WorkoutAnalysisTranslator`: remover constante `TRANSLATE_PROMPT`; carregar via `PromptTemplateLoader`
- `MultiModelConfig`: novo bean `gpt4oPlanoClient`
- `ModelRouter`: novo nível `PLANO` na enum `TaskComplexity`
- `IaServiceImpl`: substituir `ChatClient chatClient` pelo `ModelRouter`

**Arquivos novos:**
- `src/main/resources/prompts/workout-analysis-user-prompt.txt`
- `src/main/resources/prompts/race-projection-user-prompt.txt`
- `src/main/resources/prompts/translate-field-prompt.txt`

**Arquivos removidos:**
- `src/main/resources/prompts/plano-treino-avancado.txt`
- `src/main/resources/prompts/plano-treino-enhanced.txt`
- `src/main/resources/prompts/system-prompt.txt`

**Sem impacto em API:** nenhum endpoint novo ou alterado; mudanças são internas à camada de serviço e configuração.

## Riscos e mitigações

- **Structured output com Anthropic pode exigir ajuste no schema do record** (impacto Médio): testar `.entity(AnaliseWorkoutRawDto.class)` com Claude Sonnet 4.6; ajustar anotações Jackson se necessário
- **Deleting templates pode quebrar referência não rastreada** (impacto Baixo): grep completo antes de deletar; buscar por nome do arquivo em todo o codebase
- **Migração do @Primary pode afetar outros serviços que injetam ChatClient** (impacto Médio): mapear todos os pontos de injeção de `ChatClient` sem `@Qualifier` antes de remover o `@Primary`
