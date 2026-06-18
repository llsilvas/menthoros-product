## ADDED Requirements

### Requirement: Regras mandatórias declaradas como `Constraint`

O sistema SHALL declarar as regras determinísticas que o plano deve respeitar como objetos
`Constraint` (`key` + `descrição` + `params`), serializáveis e independentes de quem as produz.

#### Scenario: Decisão determinística vira Constraint

- **WHEN** uma regra mandatória for derivada (decisão de intervalado, teto de pace, dias permitidos)
- **THEN** ela SHALL ser representada como uma `Constraint` com `key`, `descrição` legível e `params` serializáveis
- **AND** uma decisão que é mera permissão (ex.: intervalado elegível) SHALL emitir zero constraints

### Requirement: Bloco mandatório consolidado no topo do prompt

O sistema SHALL renderizar as `Constraint` ativas num único bloco mandatório no início do prompt
de geração de plano.

#### Scenario: Constraints no topo

- **WHEN** o prompt de geração de plano for montado
- **THEN** as `Constraint` ativas SHALL aparecer num bloco "regras que não podem ser violadas" no topo
- **AND** a mesma regra NÃO SHALL ser repetida dispersa no corpo do prompt

### Requirement: Verificação de aderência pós-geração

O sistema SHALL verificar o plano gerado contra as `Constraint` declaradas e reportar violações.

#### Scenario: Plano que respeita as constraints

- **WHEN** o `PlanQualityChecker` avaliar um plano que respeita todas as `Constraint`
- **THEN** ele SHALL retornar zero `ViolacaoQualidade`

#### Scenario: Plano que viola uma constraint

- **WHEN** o plano gerado violar uma `Constraint` (ex.: etapa mais rápida que o `PACE_TETO`, ou contém `INTERVALADO` sob `INTERVALADO_PROIBIDO`)
- **THEN** o checker SHALL retornar uma `ViolacaoQualidade` identificando a `key` violada
- **AND** a verificação SHALL ocorrer offline, sem nova chamada ao LLM

#### Scenario: Fonte da constraint é intercambiável

- **WHEN** a fonte que produz uma `Constraint` mudar (formatter hoje, skill futuramente)
- **THEN** o renderer do bloco mandatório e o `PlanQualityChecker` SHALL permanecer inalterados
