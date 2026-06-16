## ADDED Requirements

### Requirement: Contratos formais para skills de domínio
O sistema SHALL definir contratos explícitos e estáveis para todas as skills determinísticas de domínio.

#### Scenario: Implementação de nova skill
- **WHEN** um desenvolvedor criar uma nova classe que implementa `DomainSkill`
- **THEN** o Spring SHALL descobri-la automaticamente via `SkillRegistry` sem alteração de código existente

#### Scenario: Skill não aplicável ao contexto
- **WHEN** `DomainSkill.isApplicable(context)` retornar `false`
- **THEN** o orquestrador SHALL ignorar essa skill e continuar com as demais
- **THEN** o fluxo global NÃO SHALL falhar

#### Scenario: Skill lança exceção
- **WHEN** a execução de uma skill lançar qualquer exceção
- **THEN** o orquestrador SHALL registrar o erro em log
- **THEN** o orquestrador SHALL continuar executando as skills restantes
- **THEN** o resultado da skill com falha SHALL ser marcado como `not_applicable`

---

### Requirement: Consolidar resultados em snapshot estruturado
O sistema SHALL consolidar os resultados das skills em um `AthleteAnalysisSnapshot` que serve como fonte de verdade estruturada antes da chamada ao LLM.

#### Scenario: Snapshot com múltiplos resultados
- **WHEN** o orquestrador executar duas ou mais skills aplicáveis
- **THEN** o snapshot SHALL conter o resultado de cada skill
- **THEN** `AthleteAnalysisSnapshot.toMarkdown()` SHALL serializar todos os resultados em formato de seção markdown legível

#### Scenario: Snapshot com constraint crítica
- **WHEN** qualquer skill retornar `severity = CRITICAL`
- **THEN** o snapshot SHALL expor essa constraint na lista `mandatoryConstraints`
- **THEN** o prompt SHALL incluir as constraints mandatórias com marcação explícita de prioridade

#### Scenario: Snapshot vazio (nenhuma skill aplicável)
- **WHEN** nenhuma skill for aplicável ao contexto fornecido
- **THEN** o orquestrador SHALL retornar snapshot vazio sem erro
- **THEN** a geração de plano SHALL prosseguir normalmente sem a seção de skills no prompt

---

### Requirement: Integrar snapshot ao fluxo de geração de plano
O sistema SHALL garantir que o `AthleteAnalysisSnapshot` seja gerado antes da chamada ao LLM na geração de plano semanal.

#### Scenario: Geração de plano com snapshot disponível
- **WHEN** `IaServiceImpl` iniciar a geração de plano para um atleta
- **THEN** ele SHALL chamar `SkillOrchestratorService` antes de chamar o LLM
- **THEN** o prompt SHALL conter a seção `## Skills Analysis` com os dados do snapshot

#### Scenario: Constraint mandatória no prompt
- **WHEN** o snapshot contiver constraints mandatórias
- **THEN** o prompt SHALL incluí-las de forma destacada antes das instruções de geração
- **THEN** o modelo NÃO SHALL ter permissão textual para ignorar essas constraints
