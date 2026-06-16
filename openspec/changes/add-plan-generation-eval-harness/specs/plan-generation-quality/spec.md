## ADDED Requirements

### Requirement: Caracterização (golden-master) do prompt de geração de plano

O sistema SHALL manter um golden-master da saída de `PlanoTreinoPromptBuilder.buildOptimizedPrompt` para um conjunto representativo de arquétipos de atleta, de forma determinística, como rede de regressão da thread de IA.

#### Scenario: Prompt inalterado

- **WHEN** a suíte de testes montar o prompt de um arquétipo cujo golden-master existe
- **THEN** o prompt gerado SHALL ser idêntico ao golden-master versionado

#### Scenario: Mudança de prompt detectada

- **WHEN** qualquer alteração de código mudar o texto do prompt de um arquétipo
- **THEN** o teste de golden-master SHALL falhar
- **THEN** a falha SHALL indicar o arquivo divergente e como regenerá-lo intencionalmente

#### Scenario: Regeneração explícita

- **WHEN** a regeneração for solicitada via flag explícita
- **THEN** os arquivos de golden-master SHALL ser reescritos
- **THEN** a regeneração NÃO SHALL ocorrer de forma automática durante uma execução de teste normal

---

### Requirement: Verificação determinística de aderência do plano às constraints

O sistema SHALL verificar a saída de geração de plano (`PlanoSemanalLlmDto`) contra as constraints calculadas pelo motor determinístico, produzindo violações tipadas.

#### Scenario: Plano respeita as constraints

- **WHEN** o `PlanQualityChecker` avaliar um plano que respeita decisão de intervalado, teto de pace, TSS alvo, dias consecutivos e restrições de lesão
- **THEN** o resultado SHALL conter zero violações

#### Scenario: Plano viola uma constraint mandatória

- **WHEN** o plano contiver uma sessão que viola uma constraint determinística (ex.: INTERVALADO quando proibido, pace abaixo do teto, TSS acima do alvo, lesão desrespeitada)
- **THEN** o resultado SHALL conter uma `ViolacaoQualidade` para cada regra violada
- **THEN** cada violação SHALL carregar a regra, a severidade e a evidência

#### Scenario: Eval offline não depende do LLM

- **WHEN** a eval de qualidade rodar no gate de build padrão
- **THEN** ela SHALL operar sobre planos-fixture sem chamar o LLM
- **THEN** a verificação SHALL ser determinística e reprodutível

---

### Requirement: Eval ao vivo opcional fora do gate de build

O sistema SHALL oferecer uma eval que chama o LLM real, isolada do gate de build padrão.

#### Scenario: Eval ao vivo é opt-in

- **WHEN** a suíte de testes padrão (`./mvnw clean test`) for executada
- **THEN** a eval ao vivo (que chama o LLM) NÃO SHALL ser executada
- **THEN** ela SHALL ser acionável apenas via tag/profile explícito
