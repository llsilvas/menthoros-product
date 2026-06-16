## ADDED Requirements

### Requirement: Injetar análise determinística de skills no prompt de geração de plano

O sistema SHALL executar as skills de domínio relevantes à geração de plano semanal **antes** da chamada ao LLM e injetar a análise consolidada (`AthleteAnalysisSnapshot`) no prompt.

#### Scenario: Geração de plano com skills aplicáveis

- **WHEN** `IaServiceImpl.geraPlanoSemanalAvancado(...)` iniciar a geração para um atleta com dados suficientes
- **THEN** o sistema SHALL executar o conjunto curado de skills de plano antes de chamar o LLM
- **THEN** o prompt SHALL conter a seção de análise fisiológica produzida por `AthleteAnalysisSnapshot.toPromptSummary()`

#### Scenario: Constraint de bloqueio no prompt

- **WHEN** o snapshot contiver pelo menos um resultado com `severity = BLOCKER` ou `severity = CRITICAL`
- **THEN** o prompt SHALL incluir essas constraints de forma destacada, com marcação explícita de prioridade
- **THEN** o texto do prompt NÃO SHALL autorizar o modelo a ignorá-las

#### Scenario: Nenhuma skill aplicável (retrocompatibilidade)

- **WHEN** nenhuma skill for aplicável ou o snapshot for vazio
- **THEN** o prompt SHALL ser idêntico ao comportamento anterior (sem a seção de skills)
- **THEN** a geração de plano SHALL prosseguir normalmente

#### Scenario: Falha na execução de skills não bloqueia a geração

- **WHEN** a execução das skills falhar ou produzir snapshot parcial
- **THEN** a geração de plano SHALL prosseguir com o snapshot disponível (possivelmente vazio)
- **THEN** o fluxo de geração NÃO SHALL lançar exceção por causa das skills

---

### Requirement: Skills da geração de plano recebem inputs tipados (sem entidade JPA)

O sistema SHALL construir os inputs tipados de cada skill de plano a partir das entidades de domínio (atleta, metadados, histórico) antes de invocá-las, respeitando a regra de que entidades JPA não cruzam para a camada de skill.

#### Scenario: Input insuficiente para uma skill

- **WHEN** os dados disponíveis não permitirem construir o input de uma skill
- **THEN** essa skill SHALL ser omitida do snapshot
- **THEN** as demais skills SHALL continuar sendo executadas normalmente

#### Scenario: Isolamento multi-tenant

- **WHEN** o `SkillContext` for montado para a geração de plano
- **THEN** ele SHALL carregar o `tenantId` do atleta em geração
- **THEN** as `SkillExecution` persistidas SHALL registrar esse `tenantId`
