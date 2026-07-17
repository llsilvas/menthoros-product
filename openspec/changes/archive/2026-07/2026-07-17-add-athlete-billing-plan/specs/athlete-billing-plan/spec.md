# Spec — athlete-billing-plan

## Requirement: Registro de dados de cobrança do atleta

O sistema DEVE permitir que o treinador registre, por atleta, uma data de vencimento (
`dataVencimentoPlano`) e um tipo de plano (`tipoPlanoAtleta`) referentes ao plano do atleta com a
assessoria — distinto do plano SaaS da assessoria com a Menthoros (`PlanoAssessoria`) e do plano
de treino (`PlanoMetaDados`).

#### Scenario: Atleta sem dados de cobrança
- **WHEN** um atleta é criado sem `dataVencimentoPlano`/`tipoPlanoAtleta`
- **THEN** ambos os campos ficam `null` e são omitidos das respostas da API (perfil e roster)

#### Scenario: Treinador registra os dados
- **WHEN** o treinador atualiza um atleta via `PUT /api/v1/atletas/{id}` informando
  `dataVencimentoPlano` e/ou `tipoPlanoAtleta`
- **THEN** os valores são persistidos e refletidos no perfil e no roster do coach

## Requirement: Tipo de plano é um enum fechado

`tipoPlanoAtleta` DEVE aceitar apenas um dos valores `MENSAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`.

#### Scenario: Valor fora do enum
- **WHEN** o cliente envia um valor de `tipoPlanoAtleta` que não é um dos quatro válidos
- **THEN** a API rejeita a requisição com erro de validação (comportamento padrão de
  deserialização de enum do Spring/Jackson, sem tratamento customizado adicional)

## Requirement: Status de vencimento derivado

O sistema DEVE expor um `statusVencimentoPlano` (`EM_DIA`, `PROXIMO_VENCIMENTO`, `VENCIDO`)
calculado em tempo de leitura a partir de `dataVencimentoPlano` e da data atual — nunca
persistido.

#### Scenario: Vencimento no passado
- **WHEN** `dataVencimentoPlano` é anterior à data atual
- **THEN** `statusVencimentoPlano = VENCIDO`

#### Scenario: Vencimento dentro da janela de alerta
- **WHEN** `dataVencimentoPlano` está entre hoje e 7 dias no futuro (inclusive)
- **THEN** `statusVencimentoPlano = PROXIMO_VENCIMENTO`

#### Scenario: Vencimento distante
- **WHEN** `dataVencimentoPlano` está mais de 7 dias no futuro
- **THEN** `statusVencimentoPlano = EM_DIA`

#### Scenario: Sem data de vencimento cadastrada
- **WHEN** `dataVencimentoPlano` é `null`
- **THEN** `statusVencimentoPlano` é `null`/ausente — nenhum badge de status é exibido

## Requirement: Isolamento multi-tenant

Os dados de cobrança do atleta DEVEM respeitar o isolamento de tenant já existente
(`Atleta.assessoria`) — nenhuma alteração ao mecanismo de tenant scoping é introduzida por esta
capability.

#### Scenario: Consulta cross-tenant
- **WHEN** um coach de uma assessoria consulta o roster ou perfil de um atleta de outra
  assessoria
- **THEN** a requisição é rejeitada/filtrada pelo mesmo mecanismo de tenant scoping já vigente
  (nenhum campo desta capability contorna essa checagem)
