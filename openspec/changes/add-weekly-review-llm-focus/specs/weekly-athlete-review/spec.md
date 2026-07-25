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

### Requirement: Registrar desfecho da revisão consumida (sinal de aprendizado)
O sistema SHALL registrar, **no `PlanoSemanal` que consumiu a revisão**, o que aconteceu com ela — inferido de sinais já existentes no domínio, sem exigir declaração explícita do treinador. O plano que consome uma revisão SHALL nascer com `consumedReviewOutcome = PENDING` e SHALL guardar o vínculo `revisao_semanal_id`. A `RevisaoSemanal` SHALL NOT ser reescrita para registrar desfecho.

#### Scenario: Plano aprovado sem ajuste
- **WHEN** um plano que consumiu a revisão for aprovado pelo treinador sem nenhum treino editado ou adicionado
- **THEN** o sistema SHALL registrar `consumedReviewOutcome = NO_ADJUSTMENT` nesse plano

#### Scenario: Plano aprovado com ajuste
- **WHEN** um plano que consumiu a revisão for aprovado pelo treinador com ao menos um treino marcado como editado ou adicionado
- **THEN** o sistema SHALL registrar `consumedReviewOutcome = ADJUSTED` nesse plano

#### Scenario: Plano rejeitado
- **WHEN** um plano que consumiu a revisão for rejeitado pelo treinador
- **THEN** o sistema SHALL registrar `consumedReviewOutcome = PLAN_REJECTED` nesse plano

#### Scenario: Mesma revisão consumida por dois planos
- **WHEN** um plano que consumiu a revisão for rejeitado e um novo plano consumir a mesma revisão
- **THEN** cada plano SHALL manter seu próprio desfecho, e o desfecho do plano rejeitado SHALL NOT ser sobrescrito

#### Scenario: Plano sem revisão consumida
- **WHEN** um plano for gerado sem consumir revisão (flag desligada, revisão ausente ou fora da janela de validade)
- **THEN** o sistema SHALL registrar `consumedReviewOutcome = NOT_CONSUMED` e SHALL NOT alterar nenhuma revisão

#### Scenario: Plano auto-aprovado
- **WHEN** um plano que consumiu a revisão for aprovado pelo sistema por confiança alta, sem revisão do treinador
- **THEN** o sistema SHALL registrar `consumedReviewOutcome = NO_COACH_IN_LOOP`, e esse plano SHALL NOT contar como aceitação do foco

### Requirement: Janela de validade da revisão consumida
O sistema SHALL consumir apenas revisão da semana imediatamente anterior à do plano sendo gerado, com folga de 7 dias.

#### Scenario: Revisão obsoleta não é consumida
- **WHEN** a revisão mais recente do atleta for anterior à janela (ex.: atleta sem plano há três semanas)
- **THEN** a geração SHALL NOT consumir a revisão, SHALL NOT chamar o LLM por causa dela, e o plano SHALL registrar `NOT_CONSUMED`

### Requirement: Registrar a origem do foco
O sistema SHALL registrar em `focusSource` se o `nextWeekFocus` daquela revisão foi produzido por LLM ou pelo template determinístico.

#### Scenario: Segmentação do sinal por origem
- **WHEN** o sinal de aprendizado for agregado
- **THEN** SHALL ser possível separar os desfechos por `focusSource`, distinguindo narrativa por IA de template
