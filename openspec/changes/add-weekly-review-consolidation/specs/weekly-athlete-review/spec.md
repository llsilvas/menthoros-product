## ADDED Requirements

### Requirement: Consolidar revisão semanal do atleta (determinística)
O sistema SHALL gerar uma revisão semanal estruturada por atleta, consolidando aderência, carga, fadiga, evolução, `recommendationType` e `nextWeekFocus` (template) de forma determinística.

#### Scenario: Contrato mínimo da revisão
- **WHEN** uma revisão semanal for gerada
- **THEN** o resultado SHALL conter `semanaInicio`, `semanaFim`, `adherenceSummary`, `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `recommendationType`, `weekOverWeekDelta`, `confidence` e `nextWeekFocus`

#### Scenario: Semana com baixa aderência bloqueia progressão
- **WHEN** o TSS realizado na semana ficar <60% do planejado OU um treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) ficar sem realizado
- **THEN** `adherenceSummary.status` SHALL ser `BAIXA`
- **THEN** `recommendationType` SHALL ser `RECOVERY` ou `MAINTAIN`, nunca `PROGRESS`

#### Scenario: Semana sem dados suficientes
- **WHEN** a janela possuir <2 treinos realizados OU nenhum ponto de PMC/TSB válido
- **THEN** `confidence` SHALL ser `BAIXA`
- **THEN** `recommendationType` SHALL NOT ser `PROGRESS`

### Requirement: Revisão deve trazer comparação com a semana anterior
O sistema SHALL calcular `weekOverWeekDelta` contra a revisão imediatamente anterior do atleta.

#### Scenario: Existe revisão anterior
- **WHEN** existir revisão da semana anterior e a corrente for gerada
- **THEN** `weekOverWeekDelta` SHALL conter Δaderência, ΔTSS, ΔTSB e a transição de `recommendationType`

#### Scenario: Não existe revisão anterior
- **WHEN** não existir revisão anterior do atleta
- **THEN** `weekOverWeekDelta` SHALL indicar `PRIMEIRA_SEMANA` (nulo), sem erro

### Requirement: Revisão temporalmente consistente e idempotente
O sistema SHALL associar cada revisão a uma janela semanal explícita e única por atleta e tenant.

#### Scenario: Identificação da semana revisada
- **WHEN** uma revisão semanal for consultada
- **THEN** o sistema SHALL informar `semanaInicio` e `semanaFim`

#### Scenario: Regeração da mesma janela não duplica
- **WHEN** a revisão de uma janela já existente for gerada novamente
- **THEN** o sistema SHALL atualizar o registro existente in-place, sem duplicar

### Requirement: Leitura coach-only sob isolamento multi-tenant
O sistema SHALL expor a revisão por um endpoint read-only acessível ao treinador, sempre no escopo do `TenantContext`, e nunca ao atleta.

#### Scenario: Revisão não vaza entre tenants
- **WHEN** revisões de tenants distintos existirem
- **THEN** cada geração ou consulta SHALL retornar apenas revisões do tenant corrente

#### Scenario: Endpoint não exposto ao atleta
- **WHEN** a revisão for consultada pelo endpoint de leitura
- **THEN** o acesso SHALL ser restrito ao treinador, não ao atleta
