## Âncoras de código (backend)

- **`CoachAttentionItemOutputDto`** — `dto/output/CoachAttentionItemOutputDto.java`; campo `explanation` é aditivo (9º campo).
  - **Stubs posicionais a atualizar (4 call sites):**
    - `CoachAttentionQueueControllerTest.java:48` e `:53` (2 stubs no teste do controller)
    - `CoachDashboardServiceImplTest.java:197` (1 stub no teste de hasAlert)
    - `CoachAttentionQueueServiceImpl.java:134` (produção — `montarItem`)
- **`SinalAtencao`** — `services/helper/SinalAtencao.java`; ganha `rationale` + `sourceRules`; **construído apenas em `CoachAttentionSignalEvaluator.java` (6 call sites de produção — nenhum test constrói diretamente)**.
- **`CoachAttentionSignalEvaluator`** — `services/helper/CoachAttentionSignalEvaluator.java`; 6 call sites de `new SinalAtencao(...)` para atualizar (Blocos 3.1–3.5).
- **`CoachAttentionQueueServiceImpl.montarItem`** — `services/impl/CoachAttentionQueueServiceImpl.java:134`; monta `RecommendationExplanation` do sinal principal.
- **Sem migration** (última = V35). Mudança aditiva; sem novo endpoint.

---

## 1. Contrato de explicabilidade (novos tipos)

- [ ] 1.1 Criar `ExplanationConfidence` enum em `enums/`: valores `HIGH`, `MEDIUM`, `LOW`; JavaDoc explicando o critério de cada nível (HIGH=determinístico, MEDIUM=heurístico, LOW=LLM-derivado); v1 produz apenas `HIGH`.
  - verify: `./mvnw clean compile` ok; enum com os 3 valores.

- [ ] 1.2 Criar `RecommendationExplanation` record em `dto/output/`: campos `rationale: String`, `sourceRules: List<String>`, `confidence: ExplanationConfidence`; `@JsonInclude(NON_NULL)`; `@Schema` em cada campo; Javadoc explicando que descreve apenas o sinal principal.
  - verify: `./mvnw clean compile` ok; record com os 3 campos.

- [ ] 1.3 Testes unitários do contrato: construção do record com valores válidos; `@JsonInclude(NON_NULL)` verificado via serialização Jackson.
  - verify: `./mvnw clean test` verde.

- **Validação do bloco:** `./mvnw clean test`.

---

## 2. Enriquecimento do `SinalAtencao` (interno)

- [ ] 2.1 Atualizar `SinalAtencao` record: adicionar `rationale: String` e `sourceRules: List<String>` como campos novos (sem default — o evaluator SEMPRE deve fornecer ambos).
  - verify: todos os construtores de `SinalAtencao` nos testes continuam compilando com os novos campos.

- [ ] 2.2 **Nenhum teste constrói `SinalAtencao` diretamente** — `CoachAttentionSignalEvaluatorTest` usa o evaluator real e `CoachAttentionQueueServiceImplTest` instancia o evaluator como colaborador real. A atualização dos construtores de `SinalAtencao` ocorre inteiramente no Bloco 3 (nos 6 call sites do evaluator). Esta tarefa confirma isso e valida que o Bloco 2.1 compila sem quebrar os testes existentes.
  - verify: `./mvnw clean test` verde imediatamente após 2.1 (os testes não usam o construtor antigo diretamente).

- **Validação do bloco:** `./mvnw clean test`.

---

## 3. Rationale + sourceRules nos 6 evaluators

- [ ] 3.0 Declarar constantes estáticas privadas em `CoachAttentionSignalEvaluator` para os valores de `sourceRules` (ex.: `private static final String SOURCE_FADIGA = "CoachAttentionSignalEvaluator.avaliarFadiga";`, `private static final String SOURCE_FAIXA_PREFIX = "FaixaTsb.";`, etc.). Centraliza a atualização em caso de renomeação de classe.
  - verify: `./mvnw clean compile` ok; constantes declaradas antes do primeiro método que as usa.

- [ ] 3.1 `avaliarFadiga(Double tsb)`: produzir `rationale` com valor de TSB usando `Locale.US` (`String.format(Locale.US, "TSB em %.1f situa-se na zona %s (%s)...", tsb, faixa.name(), faixa.getInterpretacao())`); `sourceRules = [SOURCE_FADIGA, SOURCE_FAIXA_PREFIX + faixa.name()]`.
  - verify: teste snapshot do `rationale` completo para TSB=-40.0 (assertar string exata com ponto decimal); teste que `sourceRules` contém exatamente `["CoachAttentionSignalEvaluator.avaliarFadiga", "FaixaTsb.CRITICO"]`.

- [ ] 3.2 `avaliarSobrecarga(...)`: `rationale` descreve o primeiro flag ativo por prioridade (sobrecarga > necessitaDescanso > rampAlto > diasConsecutivos); `sourceRules` lista **todos** os flags ativos como entradas separadas (`"PlanoMetaDados.alertaSobrecarga"`, `"PlanoMetaDados.alertaNecessitaDescanso"`, etc.).
  - verify: `@ParameterizedTest` com pelo menos 4 combinações: (1) só `sobrecarga=true`, (2) só `rampAlto=true`, (3) `sobrecarga=true` + `rampAlto=true` → sourceRules contém ambos via `containsExactlyInAnyOrder`; (4) nenhum ativo → Optional.empty().

- [ ] 3.3 `avaliarAderencia(long perdidos)`: `rationale` menciona a contagem e a janela de 14 dias; `sourceRules = ["CoachAttentionSignalEvaluator.avaliarAderencia", "TreinoExecucaoStatus.PERDIDO|PARCIAL"]`.
  - verify: rationale de perdidos=3 menciona "3".

- [ ] 3.4 `avaliarInatividade(Long dias)`: `rationale` menciona os dias; `sourceRules = ["CoachAttentionSignalEvaluator.avaliarInatividade"]`.
  - verify: rationale de dias=17 menciona "17".

- [ ] 3.5 `avaliarZonasVencidas` e `avaliarSemPlano`: rationale descritivo fixo; `sourceRules` com o método e a regra de origem (`"Atleta.precisaAtualizarTestes"` / `"CoachAttentionSignalEvaluator.avaliarSemPlano"`).
  - verify: rationale não-vazio; sourceRules com pelo menos 1 elemento.

- [ ] 3.6 Atualizar `CoachAttentionSignalEvaluatorTest`: cada teste do evaluator verifica `sinal.rationale()` não-vazio e `sinal.sourceRules()` não-vazio; BVA existente mantido.
  - verify: `./mvnw clean test` verde; 0 testes quebrados nos 21 existentes + novos asserts.

- **Validação do bloco:** `./mvnw clean test`.

---

## 4. Contrato do DTO da fila (campo aditivo)

- [ ] 4.1 Atualizar `CoachAttentionItemOutputDto`: adicionar campo `explanation: RecommendationExplanation` (último campo; `@Schema`); `@JsonInclude(NON_NULL)` já está na classe.
  - verify: `./mvnw clean compile` ok; campo novo no final do record.

- [ ] 4.2 Atualizar `CoachAttentionQueueServiceImpl.montarItem`: construir `RecommendationExplanation` a partir de `principal.rationale()`, `principal.sourceRules()` e `ExplanationConfidence.HIGH`; passar no construtor do DTO.
  - verify: `./mvnw clean compile` ok; sem NPE no fluxo feliz.

- [ ] 4.3 Atualizar `CoachAttentionQueueServiceImplTest`: assertar `item.explanation() != null` (não usar isNotNull() como único assert — verificar também `rationale` e `confidence`); validar `confidence = HIGH` e `rationale` não-blank no teste `fadigaCritica`; idem nos demais testes que verificam o item.
  - verify: `./mvnw clean test` verde; 7 testes existentes; `explanation` assertada em cada um.

- [ ] 4.4 Atualizar os 3 stubs de teste que constroem `CoachAttentionItemOutputDto` com 8 args:
  - `CoachAttentionQueueControllerTest.java:48` e `:53` — adicionar 9º arg `explanation` com valor real; adicionar `jsonPath("$[0].explanation.confidence").value("HIGH")` e `jsonPath("$[0].explanation.rationale").isString()` no teste `fila`.
  - `CoachDashboardServiceImplTest.java:197` — adicionar 9º arg `explanation` (pode ser `new RecommendationExplanation("sem plano ativo", List.of(...), ExplanationConfidence.HIGH)` ou qualquer valor válido — o teste verifica apenas `hasAlert`, não `explanation`).
  - **ATENÇÃO:** 4.1 + 4.2 + 4.4 devem ser commitados atomicamente — o build NUNCA deve ficar vermelho entre tasks desta seção.
  - verify: `./mvnw clean test` verde; 2 testes do controller + 10 testes do dashboard verdes.

- **Validação do bloco:** `./mvnw clean test`.

---

## 5. Validação final

- [ ] 5.1 `./mvnw clean test` verde (suíte completa — baseline 825, deve aumentar com novos asserts).
- [ ] 5.2 Confirmar: `evidence[]` e `suggestedAction` inalterados no DTO pai (contrato original preservado).
- [ ] 5.3 Confirmar: `explanation` não duplica `evidence` (apenas `rationale`, `sourceRules`, `confidence`).
- [ ] 5.4 Atualizar este `tasks.md` (implementado vs adiado).

---

## Itens adiados explicitamente

- Explicabilidade na geração de plano LLM → Sprint 10+ (`add-llm-tool-use`).
- Análise pós-treino explicável → Sprint 23+ (`add-workout-metrics-analyzer`).
- `ExplanationConfidence.MEDIUM` e `LOW` → quando o primeiro consumer LLM existir.
- I18n do `rationale` → pós-MVP.
- Frontend exibindo `explanation` → change de frontend separada (scopo desta change: contrato disponível na API).
