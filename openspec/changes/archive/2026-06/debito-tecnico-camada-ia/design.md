## Context

Backend: Java 21, Spring Boot 3.5.x, Spring AI com starters `openai` e `anthropic` ativos simultaneamente. Roteamento multi-modelo via `ModelRouter` (4 níveis: SIMPLE, STANDARD, COMPLEX, EXPERT). Templates de prompt em `src/main/resources/prompts/` carregados via `PromptTemplateLoader`. SKILL.md em `src/main/resources/skills/` cacheado em `@PostConstruct`.

O problema central desta change é arquitetural: dois fluxos críticos (`WorkoutAnalysis` e `RaceProjection`) usam um mecanismo de parsing frágil que foi corrigido com patches (regex, retry, truncagem) em vez de resolvido na raiz.

## Goals

- Eliminar `stripMarkdownCodeBlock`, `callWithRetry` para parse e `objectMapper.readValue` em fluxos de output estruturado do LLM
- Tornar o modelo que serve cada feature explícito e rastreável no código
- Mover todos os user prompts para arquivos versionados, consistente com a arquitetura já estabelecida
- Limpar artefatos mortos do repositório

## Non-Goals

- Tool calling, RAG, chat conversacional — escopo de changes futuras (Sprint 3 do mental model)
- Alteração de comportamento dos modelos (temperatura, maxTokens) — só o mecanismo de parsing e roteamento
- Modificação do template de plano semanal (`plano-treino-otimizado-claude.txt`)

## Decisions

### D1: `.entity()` como mecanismo padrão para output estruturado

Spring AI `.entity(Class<T>)` usa `BeanOutputConverter` internamente para OpenAI e o mecanismo de JSON mode do Anthropic para Claude. Elimina necessidade de strip de markdown e parse manual. Para `AnaliseWorkoutRawDto` (Claude Sonnet 4.6) e `NarrativeOutputDto` (Claude Haiku 4.5), ambos os modelos suportam output estruturado. O record deve ter anotações Jackson compatíveis.

### D2: `NarrativeOutputDto` como record interno ao `RaceProjectionNarrativeGenerator`

O tipo de saída do LLM em `RaceProjectionNarrativeGenerator` é específico do componente. Criar `private record NarrativeOutputDto` dentro da classe, alinhado com `NarrativeOutput` já existente (record público de saída do método). A conversão entre os dois elimina a necessidade de `truncate()` — limites de tamanho devem ser especificados no prompt, não em código.

### D3: Novo nível `PLANO` no `TaskComplexity` + bean `gpt4oPlanoClient`

`IaServiceImpl` precisa de um modelo explícito. Adicionar `TaskComplexity.PLANO` ao enum e criar bean `gpt4oPlanoClient` em `MultiModelConfig` apontando para o modelo correto (manter `gpt-4o` como padrão até decisão de migrar para outro). `IaServiceImpl` injeta `ModelRouter` e chama `route(TaskComplexity.PLANO)`. O bean `@Primary` genérico pode ser mantido para compatibilidade com injeções não qualificadas que não são da geração de plano.

### D4: Prompts externalizados com `PromptTemplateLoader`

Os três user prompts hardcoded têm natureza estática — não recebem argumentos dinâmicos no caso do translator e da narrativa de projeção; o prompt de análise recebe o JSON de dados. Usar `PromptTemplateLoader.loadTemplate()` para os estáticos e `loadAndFormat()` para os com interpolação. Cache automático do `PromptTemplateLoader` garante que o arquivo não é relido por request.

### D5: Grep completo antes de deletar templates órfãos

Antes de deletar `plano-treino-avancado.txt`, `plano-treino-enhanced.txt` e `system-prompt.txt`, executar grep por nome de arquivo em todo o codebase (Java, YAML, properties). Somente deletar após confirmar zero referências.

### D6: `EmbeddingService` em `PlanoServiceImpl` — remover campo, não o serviço

O campo `EmbeddingService embeddingService` está injetado em `PlanoServiceImpl` mas o método `gerarEmbedding()` retorna `null`. Remover o campo da classe e o método morto. O `EmbeddingService` e sua implementação permanecem para uso futuro pelo Sprint 3.

## Architecture

```
ANTES (WorkoutAnalysisListener)
────────────────────────────────────────────────────────────
  LLM (Sonnet) → String rawJson
    → stripMarkdownCodeBlock(rawJson)       [regex frágil]
    → objectMapper.readValue(...)           [pode lançar JsonProcessingException]
    → callWithRetry (3 tentativas)          [tapa-buraco para falhas de parse]
    → AnaliseWorkoutRawDto

DEPOIS
────────────────────────────────────────────────────────────
  LLM (Sonnet) → .entity(AnaliseWorkoutRawDto.class)
    → Spring AI BeanOutputConverter / Anthropic JSON mode
    → AnaliseWorkoutRawDto                  [tipo seguro, sem parse manual]


ANTES (RaceProjectionNarrativeGenerator)
────────────────────────────────────────────────────────────
  LLM (Haiku) → String rawJson
    → stripMarkdownCodeBlock(rawJson)
    → objectMapper.readValue(cleaned, Map.class)
    → (String) parsed.get("progression_narrative")
    → truncate(narrative, 500)              [limite hardcoded em código]
    → NarrativeOutput(narrative, assumptions, coachNote)

DEPOIS
────────────────────────────────────────────────────────────
  LLM (Haiku) → .entity(NarrativeOutputDto.class)
    → NarrativeOutputDto(progressionNarrative, keyAssumptions, coachNote)
    → NarrativeOutput(dto.progressionNarrative(), dto.keyAssumptions(), dto.coachNote())


ANTES (IaServiceImpl — roteamento)
────────────────────────────────────────────────────────────
  @Autowired ChatClient chatClient          [bean @Primary = OpenAiChatModel genérico]
  modelo efetivo: application.yml → invisível no código

DEPOIS
────────────────────────────────────────────────────────────
  @Autowired ModelRouter modelRouter
  chatClient = modelRouter.route(TaskComplexity.PLANO)
  modelo efetivo: gpt4oPlanoClient → gpt-4o → explícito em MultiModelConfig
```

## File Map

```
src/main/java/.../services/impl/WorkoutAnalysisListener.java    MODIFY
src/main/java/.../skills/race/RaceProjectionNarrativeGenerator.java  MODIFY
src/main/java/.../services/WorkoutAnalysisTranslator.java       MODIFY
src/main/java/.../config/external/MultiModelConfig.java         MODIFY
src/main/java/.../routing/ModelRouter.java                      MODIFY
src/main/java/.../routing/TaskComplexity.java                   MODIFY
src/main/java/.../services/impl/IaServiceImpl.java              MODIFY
src/main/java/.../services/impl/PlanoServiceImpl.java           MODIFY

src/main/resources/prompts/workout-analysis-user-prompt.txt     NEW
src/main/resources/prompts/race-projection-user-prompt.txt      NEW
src/main/resources/prompts/translate-field-prompt.txt           NEW

src/main/resources/prompts/plano-treino-avancado.txt            DELETE
src/main/resources/prompts/plano-treino-enhanced.txt            DELETE
src/main/resources/prompts/system-prompt.txt                    DELETE
```
