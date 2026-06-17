## Sprint 1 — Structured Output e Prompts Externalizados

### 1. Migrar WorkoutAnalysisListener para `.entity()`

- [x] 1.1 Verificar anotações Jackson em `AnaliseWorkoutRawDto` — garantir que todos os campos têm `@JsonProperty` com os nomes exatos que o LLM retorna no JSON
- [x] 1.2 Substituir `callWithRetry(() -> sonnet.prompt()...call().content(), 3)` por `sonnet.prompt()...call().entity(AnaliseWorkoutRawDto.class)`
- [x] 1.3 Remover método `stripMarkdownCodeBlock` e `callWithRetry` da classe
- [~] 1.4 ~~Remover import `ObjectMapper` e campo `objectMapper`~~ — **mantido**: `objectMapper` ainda é necessário em `buildPromptData()` para serializar os dados do treino em JSON. Removido apenas o uso de parse da resposta (`readValue`). Comentário no campo explica o motivo.
- [x] 1.5 Atualizar `buildPromptData()` para retornar o JSON de dados sem o wrapper de instrução (a instrução foi para o arquivo de prompt; `buildPromptData` já retornava só os dados)
- [x] 1.6 Criar `src/main/resources/prompts/workout-analysis-user-prompt.txt` com a instrução `"Analyze this workout and respond with valid JSON only:\n%s"` externalizada; carregar via `PromptTemplateLoader.loadAndFormat()`
- [x] 1.7 Ajustar `WorkoutAnalysisListener` para injetar `PromptTemplateLoader` e usar `loadAndFormat("workout-analysis-user-prompt.txt", promptData)`
- [x] 1.8 Executar `./mvnw clean test` (703 testes, 0 falhas) — `WorkoutAnalysisTranslatorTest` e `IaServiceImplFcValidationTest` passando
- [ ] 1.9 (MANUAL — requer app + LLM) Testar: registrar um treino com RPE preenchido e verificar no log análise `COMPLETED` com campos em português

### 2. Migrar RaceProjectionNarrativeGenerator para `.entity()`

- [x] 2.1 Criar `record NarrativeOutputDto(...)` dentro de `RaceProjectionNarrativeGenerator` com `@JsonProperty` snake_case — **package-private** (não `private`) para o teste do mesmo pacote poder construí-lo ao stubar `.entity()`
- [x] 2.2 Substituir `callHaikuWithFallback(userPrompt)` + `parseAndValidate(rawJson)` por chamada direta `.entity(NarrativeOutputDto.class)` em método único `callWithFallback(userPrompt)`
- [x] 2.3 Remover métodos `parseAndValidate`, `truncate`, `stripMarkdownCodeBlock` da classe
- [x] 2.4 Ajustar `generate()` para converter `NarrativeOutputDto` → `NarrativeOutput` (com guarda de `key_assumptions` nula → lista vazia); remover constants `MAX_*`
- [x] 2.5 Criar `src/main/resources/prompts/race-projection-user-prompt.txt`; `buildUserPrompt()` usa `PromptTemplateLoader.loadAndFormat`
- [x] 2.6 Mover limites (5 premissas, 500/400 chars) do código para a seção `Constraints:` do prompt
- [x] 2.7 Injetar `PromptTemplateLoader` no construtor e ajustar `buildUserPrompt()`
- [x] 2.8 Executar `./mvnw clean test` (700 testes, 0 falhas) — `RaceProjectionNarrativeGeneratorTest` reescrito
- [~] 2.9 ~~Remover import `ObjectMapper` e campo `objectMapper`~~ — **mantido**: ainda necessário em `buildUserPrompt()` para serializar o contexto. Removido só o uso de parse. Comentário no campo explica.

### 3. Externalizar user prompt do WorkoutAnalysisTranslator

- [x] 3.1 Criar `src/main/resources/prompts/translate-field-prompt.txt` com o conteúdo atual de `TRANSLATE_PROMPT`
- [x] 3.2 Injetar `PromptTemplateLoader` em `WorkoutAnalysisTranslator`
- [x] 3.3 Remover constante `TRANSLATE_PROMPT`; substituir por `templateLoader.loadTemplate("translate-field-prompt.txt").formatted(text)` (mantém a interpolação `%s` já existente)
- [x] 3.4 Executar `./mvnw clean test` (700 testes, 0 falhas) — `WorkoutAnalysisTranslatorTest` passando

---

## Sprint 2 — Roteamento Explícito e Limpeza

### 4. Tornar roteamento do IaServiceImpl explícito

- [x] 4.1 Mapear pontos de injeção de `ChatClient` sem `@Qualifier` — confirmado: `IaServiceImpl` era o único (o `ModelRouter` já usa `@Qualifier`); `@Primary` em `ChatClientConfig` mantido para injeções não-plano
- [x] 4.2 Adicionar `PLANO` ao enum `TaskComplexity` com javadoc
- [x] 4.3 Criar bean `gpt4oPlanoClient` em `MultiModelConfig` (`model("gpt-4o")`, `temperature(0.7)`, `maxTokens(6000)`, javadoc de custo) — gpt-4o (OpenAI) por compatibilidade com `defaultJsonSchemaOptions()`
- [x] 4.4 Adicionar `case PLANO -> gpt4oPlanoClient` em `ModelRouter.route()` (+ teste `plano_routes_to_gpt4oPlano`)
- [x] 4.5 Substituir `ChatClient chatClient` em `IaServiceImpl` por `ModelRouter modelRouter`; `route(TaskComplexity.PLANO)` em `gerarPlanoSemanal()` e `geraPlanoSemanalAvancado()`
- [x] 4.6 Executar `./mvnw clean test` (701 testes, 0 falhas) — novo bean injeta no contexto Spring
- [x] 4.7 Log explícito antes da chamada nomeando `TaskComplexity.PLANO`/bean `gpt4oPlanoClient` (confirmação em runtime faz parte da validação manual 6.3)

### 5. Deletar templates órfãos e campo embedding morto

- [x] 5.1 Grep por `plano-treino-avancado`, `plano-treino-enhanced` e `system-prompt` (Java/YAML/properties/txt) — zero referências confirmado
- [x] 5.2 Deletar `src/main/resources/prompts/plano-treino-avancado.txt`
- [x] 5.3 Deletar `src/main/resources/prompts/plano-treino-enhanced.txt`
- [x] 5.4 Deletar `src/main/resources/prompts/system-prompt.txt`
- [x] 5.5 Remover campo `embeddingService` (injetado e nunca usado) de `PlanoServiceImpl` + mock órfão no teste. O método `gerarEmbedding()` já não existia no código atual.
- [x] 5.6 `EmbeddingService` e `EmbeddingServiceImpl` continuam existindo (não deletados — necessários para Sprint 3)
- [x] 5.7 Executar `./mvnw clean test` (701 testes, 0 falhas)

---

## Validação Final

- [x] 6.1 `./mvnw clean test` — 701 testes, 0 falhas
- [ ] 6.2 (MANUAL — requer app + LLM) Subir app, registrar treino com RPE; verificar análise pós-treino criada e traduzida
- [ ] 6.3 (MANUAL — requer app + LLM) Verificar log de geração de plano: roteamento `TaskComplexity.PLANO`/`gpt4oPlanoClient` explícito (linha de log já adicionada)
- [x] 6.4 `git diff develop...HEAD` confirma exatamente 3 templates deletados + 3 criados; os 2 templates usados (otimizado-claude, prompt) intactos
- [x] 6.5 `docs/mental-model-ia.md`: síntese atualizada — itens resolvidos movidos de `❌ DÉBITO`/`⚠️ ATENÇÃO` para `✅ BOM HOJE`; débito restante marcado como escopo futuro (Sprint 3)
