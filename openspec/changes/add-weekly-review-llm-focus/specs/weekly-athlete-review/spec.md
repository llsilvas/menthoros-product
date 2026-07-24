## MODIFIED Requirements

### Requirement: `nextWeekFocus` por IA restrito ao tipo determinístico
O sistema SHALL, com a flag da narrativa ligada, gerar `nextWeekFocus` por LLM sobre os sinais consolidados, respeitando o `recommendationType`; com a flag desligada, SHALL usar um template determinístico derivado do `recommendationType` (fallback desta fatia — a F1 não tem template).

#### Scenario: Flag ligada — narrativa consistente
- **WHEN** a flag da narrativa estiver ligada e a revisão for gerada
- **THEN** `nextWeekFocus` SHALL ser redigido por LLM e SHALL NOT sugerir progressão quando `recommendationType` for `RECOVERY` ou `MAINTAIN`

#### Scenario: Flag desligada — template determinístico
- **WHEN** a flag da narrativa estiver desligada
- **THEN** a revisão SHALL usar o `nextWeekFocus` template, sem chamada LLM

## ADDED Requirements

### Requirement: Revisão semanal deve alimentar a próxima prescrição
O sistema SHALL disponibilizar a revisão mais recente como insumo para a geração do próximo plano, sob coach-in-the-loop.

#### Scenario: Geração da próxima semana
- **WHEN** o próximo plano semanal for gerado com a flag de injeção ligada
- **THEN** o sistema SHALL consumir `nextWeekFocus` e `recommendationType` da revisão mais recente como contexto

#### Scenario: Revisão não altera o plano automaticamente
- **WHEN** uma revisão existir
- **THEN** o sistema SHALL NOT alterar o plano do atleta sem ação do treinador, e SHALL NOT expor a revisão ao atleta

### Requirement: Registrar desfecho do foco (sinal de aprendizado)
O sistema SHALL registrar se o `nextWeekFocus` proposto foi mantido, editado ou descartado ao gerar/aprovar o próximo plano.

#### Scenario: Desfecho do foco
- **WHEN** o treinador gerar ou aprovar o próximo plano a partir de uma revisão
- **THEN** o sistema SHALL registrar `focusOutcome ∈ {MANTIDO, EDITADO, DESCARTADO}` associado à revisão
