## Fatia 1 — Adaptador Anthropic de saída estruturada (walking skeleton)

- [ ] **1.1** Extrair a interface `PlanSchemaOptionsFactory` (`defaultOptions()`/`v2Options()`) e
      fazer `LlmJsonSchemaBuilder implements PlanSchemaOptionsFactory` sem mudar comportamento.
      Verify: `./mvnw clean test` — testes existentes de `LlmJsonSchemaBuilderTest` continuam
      verdes sem alteração.
- [ ] **1.2** `AnthropicToolSchemaBuilder implements PlanSchemaOptionsFactory` — tool única com
      `input_schema` = schema v1/v2 (reaproveitando a geração de `JsonSchema` de
      `LlmJsonSchemaBuilder`, não duplicando), `AnthropicChatOptions` com `ToolChoiceTool` forçado.
      Verify: teste unitário cobrindo v1 e v2, comparando o `input_schema` gerado byte-a-byte
      contra o schema OpenAI equivalente (mesma estrutura, formato diferente de envelope).
- [ ] **1.3** `EvalCandidateRunner` — branch de extração de resposta: tool call (`arguments()`) vs.
      texto livre (`getText()`), ambos alimentando o mesmo `EvalDeterministicGrader.avaliar(...)`.
      Verify: teste com `ChatResponse` mockado nos dois formatos, mesma violação reportada pelo
      grader nos dois casos (CA2).
- [ ] **1.4** `claudeSonnetPlanoClient`/`claudeHaikuPlanoClient` em `MultiModelConfig`, padrão de
      `modeloAnthropicComTimeout` + opções do `AnthropicToolSchemaBuilder`.
      Verify: `./mvnw clean test` — contexto Spring sobe com os 7 beans `ChatClient` (5 existentes
      + 2 novos), sem colisão de `@Qualifier`.

## Fatia 2 — Orquestrador do bake-off + juiz fixo

- [ ] **2.1** `PlanBakeoffRunner` (não `@Component`) — recebe 4 `Candidato` (nome + `ChatClient` +
      `PlanSchemaOptionsFactory`) e 1 `ChatClient` fixo do juiz; roda `EvalCandidateRunner` por
      candidato contra as fixtures de candidato do F5 + `EvalLlmJudge` (rubrica completa) sempre
      sobre o `ChatClient` do juiz.
      Verify: teste com 4 `ChatClient` mocks (um deles simulando "gpt-4o", igual ao juiz em nome
      mas objeto mock distinto) + 1 mock de juiz — assere que o mock do juiz nunca é o mesmo objeto
      que gerou a resposta de nenhum candidato (CA3).
- [ ] **2.2** Relatório markdown do bake-off — 1 linha por candidato: nota grader determinístico,
      nota juiz (ponderada), p50 latência, custo/plano USD.
      Verify: teste de snapshot/formatação da tabela contra um `PlanBakeoffRunner` com resultados
      sintéticos.
- [ ] **2.3** Decidir e documentar o candidato "sucessor OpenAI" (Open Question do proposal) — ou
      confirmar 3 candidatos se nenhum sucessor estável existir no momento da execução.
      Verify: decisão registrada no proposal.md (seção Open Questions atualizada).

## Fatia 3 — Confiabilidade do juiz (G-Eval + MT-Bench, sem calibração)

- [ ] **3.1** `NotaJuizCompleta`/`NotaJuizReduzida` ganham campo de justificativa por eixo (ou
      record aninhado `EixoAvaliado`); `SYSTEM_COMPLETA`/`SYSTEM_REDUZIDA` instruídos a escrever a
      justificativa antes da nota (form-filling).
      Verify: teste de schema (`EvalJudgeSchemaBuilderTest`) cobrindo o novo campo; teste de
      integração `@Tag("eval")` (custo real, não roda no CI padrão) confirmando que a resposta
      real do juiz preenche justificativa não vazia.
- [ ] **3.2** Reference-guided grading nos eixos de raciocínio (progressão de carga, segurança) —
      prompt do juiz pede referência auto-gerada antes da comparação, só na rubrica completa.
      Verify: revisão manual de 3-5 respostas reais do juiz (`@Tag("eval")`, custo real) —
      confirma que a referência aparece antes da comparação no texto gerado.
- [ ] **3.3** Probability-weighted scoring — `EvalJudgeSchemaBuilder` seta `logprobs`/`topLogprobs`
      nas opções do juiz; `EvalLlmJudge.chamarJuiz` extrai `ChatGenerationMetadata.get("logprobs")`
      e recalcula a nota como `Σ p(sᵢ)·sᵢ`, com fallback pro inteiro bruto se o token da nota não
      estiver nos top-N.
      Verify: teste unitário com `ChatResponse`/logprobs sintéticos conhecidos, assere o score
      ponderado esperado; teste do caminho de fallback (token fora do top-N) (CA4).

## Fatia 4 — Rollout do vencedor

- [ ] **4.1** `llm-pricing.yml`: `claude-sonnet-4-6` → `claude-sonnet-5`, atualizando
      `application.yml` (`app.llm.routing.complex.model`) no mesmo commit.
      Verify: `./mvnw clean test` — `LlmPricingRegistryTest`/testes que resolvem preço da rota
      `complex` continuam verdes.
- [ ] **4.2** Rodar o bake-off completo (custo real, fora do CI) contra os candidatos decididos em
      2.3; registrar a tabela final no proposal.md ou num anexo do change.
      Verify: tabela colada no proposal com nota/latência/custo por candidato; decisão do vencedor
      documentada com o critério qualidade → latência → custo.
- [ ] **4.3** Se o vencedor não for `gpt-4o`: trocar o bean roteado em `ModelRouter`/
      `MultiModelConfig` (renomear qualifier para algo neutro, ex. `planoClient`), mantendo
      `gpt4oPlanoClient` disponível para rollback.
      Verify: `./mvnw clean verify` — suíte completa incluindo `*IT`; teste manual/smoke de uma
      geração de plano real usando o novo modelo roteado.
- [ ] **4.4** Decidir e documentar (ou implementar, se escopo mínimo couber) o mecanismo de rollout
      por tenant (Open Question do proposal).
      Verify: decisão registrada; se implementado, teste cobrindo o tenant com override vs. sem
      override caindo no default.

## Definition of Done

- [ ] CA1-CA5 do proposal.md verificados por teste ou evidência documentada.
- [ ] Gate: eval do vencedor ≥ baseline (`gpt-4o`) em qualidade, p50 ≤ 15s — registrado na tabela
      da task 4.2.
- [ ] `./mvnw clean verify` verde.
- [ ] `tasks.md` com todos os itens marcados `[x]` antes do arquivamento.
