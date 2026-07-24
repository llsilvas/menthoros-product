## ADDED Requirements

### Requirement: Consolidar revisão semanal do atleta
O sistema SHALL gerar uma revisão semanal estruturada por atleta, consolidando aderência, carga, fadiga, evolução e foco recomendado para a semana seguinte.

#### Scenario: Contrato mínimo da revisão
- **WHEN** uma revisão semanal for gerada
- **THEN** o resultado SHALL conter `semanaInicio`, `semanaFim`, resumo de aderência, resumo de carga, resumo de fadiga, `progressionSummary`, `recommendationType`, `confidence` e `nextWeekFocus`

#### Scenario: Semana com dados suficientes
- **WHEN** o atleta possuir treinos e métricas suficientes na semana
- **THEN** a revisão SHALL resumir carga realizada, aderência e sinais de evolução ou risco

#### Scenario: Semana com baixa aderência bloqueia progressão
- **WHEN** o TSS realizado na semana ficar <60% do TSS planejado OU um treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) ficar sem realizado
- **THEN** `adherenceSummary.status` SHALL ser `BAIXA`
- **THEN** `recommendationType` SHALL ser `RECOVERY` ou `MAINTAIN`, nunca `PROGRESS`

#### Scenario: Semana sem dados suficientes
- **WHEN** a janela possuir <2 treinos realizados OU nenhum ponto de PMC/TSB válido
- **THEN** `confidence` SHALL ser `BAIXA`
- **THEN** `recommendationType` SHALL NOT ser `PROGRESS`

### Requirement: Revisão semanal deve alimentar a próxima prescrição
O sistema SHALL disponibilizar o resultado da revisão semanal como insumo para ajuste ou geração do próximo plano.

#### Scenario: Geração da próxima semana
- **WHEN** o próximo plano semanal for gerado
- **THEN** o sistema SHALL consumir a revisão semanal mais recente (`nextWeekFocus` e `risks`) como contexto relevante

#### Scenario: Registro do desfecho do foco (sinal de aprendizado)
- **WHEN** o treinador gerar ou aprovar o próximo plano a partir de uma revisão
- **THEN** o sistema SHALL registrar se o `nextWeekFocus` proposto foi mantido, editado ou descartado

### Requirement: Revisão é insumo ao treinador, sob coach-in-the-loop
O sistema SHALL entregar a revisão ao treinador como insumo/sugestão, sem aplicá-la automaticamente nem expô-la ao atleta.

#### Scenario: Revisão não altera o plano automaticamente
- **WHEN** uma revisão semanal for gerada
- **THEN** o sistema SHALL NOT alterar o plano do atleta sem ação do treinador

#### Scenario: Revisão não é exposta ao atleta
- **WHEN** uma revisão semanal existir
- **THEN** o sistema SHALL NOT disponibilizá-la ao atleta

### Requirement: Revisão semanal deve ser temporalmente consistente e idempotente
O sistema SHALL associar cada revisão a uma janela semanal explícita e única por atleta e tenant.

#### Scenario: Identificação da semana revisada
- **WHEN** uma revisão semanal for consultada
- **THEN** o sistema SHALL informar claramente `semanaInicio` e `semanaFim`

#### Scenario: Regeração da mesma janela não duplica
- **WHEN** a revisão de uma janela `[semanaInicio, semanaFim]` já existente for gerada novamente
- **THEN** o sistema SHALL atualizar o registro existente in-place, sem criar duplicata

### Requirement: Isolamento multi-tenant
O sistema SHALL gerar e consultar revisões sempre no escopo do `TenantContext` corrente.

#### Scenario: Revisão não vaza entre tenants
- **WHEN** revisões de tenants distintos existirem
- **THEN** cada geração ou consulta SHALL retornar apenas revisões do tenant corrente
