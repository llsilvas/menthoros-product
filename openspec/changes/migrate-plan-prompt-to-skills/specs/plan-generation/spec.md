## ADDED Requirements

### Requirement: Conteúdo determinístico do prompt produzido por domain skills

O sistema SHALL produzir o conteúdo determinístico do prompt de geração de plano (elegibilidade de intervalado, carga/recuperação, periodização, variabilidade, teto de pace, disponibilidade) a partir das domain skills, consolidadas em `AthleteAnalysisSnapshot`, em vez de formatters ad-hoc.

#### Scenario: Decisão determinística originada da skill

- **WHEN** o `PlanoTreinoPromptBuilder` montar o prompt de geração de plano
- **THEN** cada seção determinística migrada SHALL ser renderizada a partir do `SkillResult` da skill correspondente no snapshot
- **THEN** o formatter equivalente NÃO SHALL mais contribuir com aquela seção

#### Scenario: Skills executam com identidade real

- **WHEN** as skills do plano forem executadas durante a geração
- **THEN** o `SkillContext` SHALL conter o `atletaId` e o `tenantId` reais do atleta em geração
- **THEN** a execução NÃO SHALL usar identidade aleatória (fim da execução-sombra)
- **THEN** os resultados SHALL ser persistidos como `SkillExecution`

---

### Requirement: Constraints mandatórias explícitas no prompt

O sistema SHALL injetar as constraints determinísticas de maior severidade como instruções mandatórias que o modelo não pode sobrescrever.

#### Scenario: Resultado de severidade alta vira constraint mandatória

- **WHEN** uma skill produzir resultado `BLOCKER` ou `CRITICAL`
- **THEN** o prompt SHALL incluir essa constraint em um bloco destacado de prioridade
- **THEN** o texto SHALL instruir o modelo a não contrariá-la

#### Scenario: Skill sem dado suficiente é omitida

- **WHEN** o input de uma skill não puder ser construído por dados insuficientes
- **THEN** essa skill SHALL ser omitida do snapshot
- **THEN** as demais SHALL ser executadas normalmente e o prompt montado sem aquela seção

---

### Requirement: Migração sem regressão verificável

O sistema SHALL garantir que cada incremento da migração preserve o comportamento do prompt salvo divergência intencional.

#### Scenario: Incremento não regride o prompt

- **WHEN** um domínio for migrado de formatter para skill
- **THEN** o golden-master do prompt SHALL permanecer verde, OU divergir de forma intencional com diff revisado
- **THEN** a eval determinística de qualidade do plano NÃO SHALL apresentar novas violações em relação à baseline

#### Scenario: PromptBuilder como montador fino

- **WHEN** a migração estiver concluída
- **THEN** `buildOptimizedPrompt` SHALL compor o prompt a partir do `AthleteAnalysisSnapshot` e dos dados do atleta
- **THEN** os formatters determinísticos migrados SHALL ter sido removidos
