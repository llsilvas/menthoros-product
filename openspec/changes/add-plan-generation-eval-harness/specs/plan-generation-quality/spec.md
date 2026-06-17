## ADDED Requirements

### Requirement: Caracterização (golden-master) do prompt de geração de plano

O sistema SHALL manter um golden-master da saída de `PlanoTreinoPromptBuilder.buildOptimizedPrompt` para um conjunto representativo de arquétipos de atleta, de forma determinística, como rede de regressão da thread de modernização de IA.

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

#### Scenario: Determinismo da caracterização

- **WHEN** o prompt de um arquétipo for montado para comparação
- **THEN** a data de referência SHALL ser fixada (clock/provider estável)
- **THEN** a saída SHALL ser reprodutível entre execuções
