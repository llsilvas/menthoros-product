## MODIFIED Requirements

### Requirement: `nextWeekFocus` por IA restrito ao tipo determinístico
O sistema SHALL, com a flag da narrativa ligada, gerar `nextWeekFocus` por LLM sobre os sinais consolidados, respeitando o `recommendationType`; com a flag desligada, SHALL usar um template determinístico derivado do `recommendationType` (fallback desta fatia — a F1 não tem template).

#### Scenario: Flag ligada — narrativa consistente
- **WHEN** a flag da narrativa estiver ligada e a revisão for gerada
- **THEN** `nextWeekFocus` SHALL ser redigido por LLM e SHALL NOT sugerir progressão quando `recommendationType` for `RECOVERY` ou `MAINTAIN`

#### Scenario: Narrativa inconsistente é rejeitada
- **WHEN** a narrativa produzida pelo LLM sugerir progressão e o `recommendationType` for `RECOVERY` ou `MAINTAIN`
- **THEN** o sistema SHALL descartar a narrativa e persistir o template determinístico no lugar

#### Scenario: Falha do LLM não deixa a revisão sem foco
- **WHEN** a chamada ao LLM falhar, expirar por timeout ou esgotar as tentativas
- **THEN** a revisão SHALL permanecer com o template determinístico, e o sinal determinístico da Fatia 1 SHALL NOT ser afetado

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
O sistema SHALL registrar o desfecho do `nextWeekFocus` proposto ao gerar/aprovar o próximo plano, inferido a partir de sinais já existentes no domínio — sem exigir uma declaração explícita do treinador. A revisão SHALL nascer com `focusOutcome = PROPOSTO`.

#### Scenario: Foco mantido
- **WHEN** o próximo plano tiver consumido a revisão e for aprovado sem treino editado ou adicionado pelo treinador
- **THEN** o sistema SHALL registrar `focusOutcome = MANTIDO` na revisão consumida

#### Scenario: Foco editado
- **WHEN** o próximo plano tiver consumido a revisão e for aprovado com ao menos um treino marcado como editado ou adicionado pelo treinador
- **THEN** o sistema SHALL registrar `focusOutcome = EDITADO` na revisão consumida

#### Scenario: Foco descartado
- **WHEN** o próximo plano for gerado sem consumir a revisão, ou for rejeitado pelo treinador
- **THEN** o sistema SHALL registrar `focusOutcome = DESCARTADO` na revisão mais recente
