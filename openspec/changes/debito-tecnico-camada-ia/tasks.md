## Sprint 1 — Structured Output e Prompts Externalizados

### 1. Migrar WorkoutAnalysisListener para `.entity()`

- [ ] 1.1 Verificar anotações Jackson em `AnaliseWorkoutRawDto` — garantir que todos os campos têm `@JsonProperty` com os nomes exatos que o LLM retorna no JSON
- [ ] 1.2 Substituir `callWithRetry(() -> sonnet.prompt()...call().content(), 3)` por `sonnet.prompt()...call().entity(AnaliseWorkoutRawDto.class)`
- [ ] 1.3 Remover método `stripMarkdownCodeBlock` e `callWithRetry` da classe
- [ ] 1.4 Remover import `ObjectMapper` e campo `objectMapper` de `WorkoutAnalysisListener`
- [ ] 1.5 Atualizar `buildPromptData()` para retornar o JSON de dados sem o wrapper de instrução (mover instrução para arquivo de prompt)
- [ ] 1.6 Criar `src/main/resources/prompts/workout-analysis-user-prompt.txt` com a instrução `"Analyze this workout and respond with valid JSON only:\n%s"` externalizada; carregar via `PromptTemplateLoader.loadAndFormat()`
- [ ] 1.7 Ajustar `WorkoutAnalysisListener` para injetar `PromptTemplateLoader` e usar `loadAndFormat("workout-analysis-user-prompt.txt", promptData)`
- [ ] 1.8 Executar `./mvnw clean test` e verificar que `WorkoutAnalysisTranslatorTest` e `IaServiceImplFcValidationTest` continuam passando
- [ ] 1.9 Testar manualmente: registrar um treino com RPE preenchido e verificar no log que análise é criada com status `COMPLETED` e campos em português

### 2. Migrar RaceProjectionNarrativeGenerator para `.entity()`

- [ ] 2.1 Criar `private record NarrativeOutputDto(String progression_narrative, List<String> key_assumptions, String coach_note)` dentro de `RaceProjectionNarrativeGenerator` com anotações `@JsonProperty` nos nomes snake_case
- [ ] 2.2 Substituir `callHaikuWithFallback(userPrompt)` + `parseAndValidate(rawJson)` por chamada direta `.entity(NarrativeOutputDto.class)` em método único `callWithFallback(userPrompt)`
- [ ] 2.3 Remover métodos `parseAndValidate`, `truncate`, `stripMarkdownCodeBlock` da classe
- [ ] 2.4 Ajustar `generate()` para converter `NarrativeOutputDto` → `NarrativeOutput`; remover constants `MAX_KEY_ASSUMPTIONS`, `MAX_NARRATIVE_CHARS`, `MAX_COACH_NOTE_CHARS`
- [ ] 2.5 Criar `src/main/resources/prompts/race-projection-user-prompt.txt` com instrução do user prompt; atualizar `buildUserPrompt()` para usar `PromptTemplateLoader`
- [ ] 2.6 Mover limite de 5 premissas e 500/400 chars do código para instrução no prompt (ex: "Return at most 5 key_assumptions"; "Keep progression_narrative under 500 characters")
- [ ] 2.7 Injetar `PromptTemplateLoader` no construtor e ajustar `buildUserPrompt()`
- [ ] 2.8 Executar `./mvnw clean test` e verificar `RaceProjectionNarrativeGeneratorTest`
- [ ] 2.9 Remover import `ObjectMapper` e campo `objectMapper`

### 3. Externalizar user prompt do WorkoutAnalysisTranslator

- [ ] 3.1 Criar `src/main/resources/prompts/translate-field-prompt.txt` com o conteúdo atual de `TRANSLATE_PROMPT`
- [ ] 3.2 Injetar `PromptTemplateLoader` em `WorkoutAnalysisTranslator`
- [ ] 3.3 Remover constante `TRANSLATE_PROMPT`; substituir por `templateLoader.loadTemplate("translate-field-prompt.txt")`
- [ ] 3.4 Executar `./mvnw clean test` e verificar `WorkoutAnalysisTranslatorTest`

---

## Sprint 2 — Roteamento Explícito e Limpeza

### 4. Tornar roteamento do IaServiceImpl explícito

- [ ] 4.1 Mapear todos os pontos de injeção de `ChatClient` sem `@Qualifier` no codebase — confirmar que `IaServiceImpl` é o único caso crítico fora do `ModelRouter`
- [ ] 4.2 Adicionar `PLANO` ao enum `TaskComplexity` com javadoc: "Geração de plano semanal — modelo com alta capacidade de raciocínio estruturado"
- [ ] 4.3 Criar bean `gpt4oPlanoClient` em `MultiModelConfig` com `model("gpt-4o")`, `temperature(0.7)`, `maxTokens(6000)` e javadoc de custo
- [ ] 4.4 Adicionar `case PLANO -> gpt4oPlanoClient` em `ModelRouter.route()`
- [ ] 4.5 Substituir `ChatClient chatClient` em `IaServiceImpl` por `ModelRouter modelRouter`; chamar `modelRouter.route(TaskComplexity.PLANO)` no início de `gerarPlanoSemanal()` e `geraPlanoSemanalAvancado()`
- [ ] 4.6 Executar `./mvnw clean test`
- [ ] 4.7 Confirmar no log que a chamada de geração de plano usa o bean `gpt4oPlanoClient` (logar o model name antes da chamada)

### 5. Deletar templates órfãos e campo embedding morto

- [ ] 5.1 Executar grep por `plano-treino-avancado`, `plano-treino-enhanced` e `system-prompt` em todo o codebase Java, YAML e properties — confirmar zero referências
- [ ] 5.2 Deletar `src/main/resources/prompts/plano-treino-avancado.txt`
- [ ] 5.3 Deletar `src/main/resources/prompts/plano-treino-enhanced.txt`
- [ ] 5.4 Deletar `src/main/resources/prompts/system-prompt.txt`
- [ ] 5.5 Remover campo `private final EmbeddingService embeddingService` de `PlanoServiceImpl` e o método privado `gerarEmbedding()` que retorna `null`
- [ ] 5.6 Verificar que `EmbeddingService` e `EmbeddingServiceImpl` continuam existindo (não deletar — necessários para Sprint 3)
- [ ] 5.7 Executar `./mvnw clean test`

---

## Validação Final

- [ ] 6.1 `./mvnw clean test` — todos os testes passando
- [ ] 6.2 Subir aplicação localmente e registrar um treino completo (com RPE); verificar análise pós-treino criada e traduzida
- [ ] 6.3 Verificar log de geração de plano: modelo `gpt-4o` aparece explicitamente; sem `@Primary` genérico
- [ ] 6.4 Confirmar no `git status` que nenhum arquivo de template está presente fora dos novos 3 arquivos criados e dos 3 deletados
- [ ] 6.5 Atualizar `mental-model-ia.md` na raiz do backend: mover os 3 itens de `❌ DÉBITO TÉCNICO` do Sprint 1 e 2 para `✅ BOM HOJE`
