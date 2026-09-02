# Capability — prova-preparacao-minima

## Purpose

Deriva, a cada gravação de prova, quantas semanas de preparação a distância pede e quando essa
preparação deveria ter começado, e sinaliza — sem bloquear — quando o prazo é menor que o mínimo.

## ADDED Requirements

### Requirement: Tabela de semanas mínimas por distância

O sistema SHALL manter uma tabela fixa de semanas mínimas de preparação por distância de prova:
5 km → 8 semanas, 10 km → 10, 21 km → 12, 42 km → 16. Para prova de distância livre, o sistema
SHALL usar a faixa: até 7,5 km → regra de 5 km; até 15 km → 10 km; até 30 km → 21 km; acima de
30 km → 42 km.

#### Scenario: Distância padrão
- **WHEN** a prova tem distância `KM_21`
- **THEN** o mínimo derivado é 12 semanas

#### Scenario: Distância livre dentro de uma faixa
- **WHEN** a prova tem distância customizada de 30 km
- **THEN** o mínimo derivado é 12 semanas (faixa de 21 km)

#### Scenario: Distância livre acima de 30 km
- **WHEN** a prova tem distância customizada de 80 km
- **THEN** o mínimo derivado é 16 semanas

### Requirement: Campos derivados preenchidos em toda gravação

Em toda criação ou atualização de prova, por qualquer caminho (CRUD ou onboarding), o sistema
SHALL preencher `semanasPreparacao` com o mínimo da tabela, `inicioPreparacao` com a data da
prova menos esse número de semanas, e `distanciaKm` com o valor nominal da distância padrão
(5 / 10 / 21,1 / 42,2) quando o campo vier vazio. Esses três campos MUST NOT ser aceitos do
cliente: valores enviados no corpo são ignorados e recalculados.

#### Scenario: Criação via CRUD
- **WHEN** uma prova de 42 km para 6 de dezembro é criada
- **THEN** `semanasPreparacao = 16`, `inicioPreparacao = 16 de agosto` e `distanciaKm = 42.2`

#### Scenario: Criação via onboarding
- **WHEN** o atleta conclui o onboarding informando uma prova-alvo
- **THEN** a prova criada tem os três campos derivados preenchidos

#### Scenario: Cliente envia valores para os campos derivados
- **WHEN** o corpo da requisição traz `semanasPreparacao = 2`
- **THEN** o valor é ignorado e o campo é recalculado pela tabela

#### Scenario: Edição de data recalcula
- **WHEN** a data de uma prova existente é alterada
- **THEN** `inicioPreparacao` é recalculado com a nova data

### Requirement: Alerta de preparação curta nunca bloqueia

O sistema SHALL considerar a preparação curta quando `inicioPreparacao` for anterior à data
corrente. A criação ou edição MUST ser aceita mesmo assim, e a resposta SHALL expor o indicador
`preparacaoCurta` e os valores derivados para que as interfaces informem o atleta e o coach.

#### Scenario: Prazo menor que o mínimo
- **WHEN** um atleta cadastra uma maratona para daqui a 8 semanas
- **THEN** a prova é criada normalmente e a resposta traz `preparacaoCurta = true`,
  `semanasPreparacao = 16` e `inicioPreparacao` no passado

#### Scenario: Prazo dentro do mínimo
- **WHEN** um atleta cadastra uma maratona para daqui a 20 semanas
- **THEN** a resposta traz `preparacaoCurta = false`

#### Scenario: Prazo exatamente no mínimo
- **WHEN** a data da prova é exatamente hoje mais o número mínimo de semanas
- **THEN** `inicioPreparacao` é igual à data corrente e `preparacaoCurta = false`
