# fit-historico-treinador

Importação de arquivo `.fit` de um atleta pelo treinador, para carregar o histórico de um atleta
novo, reaproveitando o pipeline de importação do atleta.

## ADDED Requirements

### Requirement: Treinador importa um .fit para um atleta do seu tenant

O sistema SHALL permitir que usuário `TECNICO` ou `ADMIN` envie um arquivo `.fit` para um atleta do
próprio tenant, criando o treino realizado vinculado ao atleta do path e recalculando a carga diária
do atleta. O sistema SHALL responder 201 para treino novo e 200 para treino já importado, sem
criar nova linha.

#### Scenario: Arquivo válido novo
- **GIVEN** atleta do tenant do treinador e um `.fit` válido ainda não importado
- **WHEN** o treinador envia o arquivo
- **THEN** a resposta é 201 com o treino realizado e a carga diária do atleta é recalculada

#### Scenario: Mesmo arquivo reenviado
- **GIVEN** um `.fit` já importado para o atleta
- **WHEN** o treinador envia o mesmo arquivo
- **THEN** a resposta é 200 com o mesmo treino e nenhuma linha nova é criada

### Requirement: Arquivo inválido, tenant e papel

O sistema SHALL responder 422 sem criar treino para arquivo que não é `.fit` válido, 404 sem gravar
nada para atleta de outro tenant e 403 para usuário `ATLETA`.

#### Scenario: Arquivo inválido
- **GIVEN** um arquivo que não é `.fit` válido
- **WHEN** o treinador o envia
- **THEN** a resposta é 422 e nenhum treino é criado

#### Scenario: Atleta de outro tenant
- **GIVEN** atleta que pertence a outro tenant
- **WHEN** o treinador envia um `.fit`
- **THEN** a resposta é 404 e nada é gravado

#### Scenario: Usuário atleta
- **GIVEN** usuário com papel `ATLETA`
- **WHEN** ele chama o endpoint do treinador
- **THEN** a resposta é 403

### Requirement: Importação sem custo de IA e sem duplicar a ingestão direta

O sistema SHALL NOT fazer chamada de LLM ao registrar treino importado de histórico. O sistema SHALL
NOT duplicar um treino importado por `.fit` quando o mesmo treino chegar pela ingestão direta do
Garmin com o mesmo `externalId`.

#### Scenario: Histórico antigo sem RPE
- **GIVEN** `.fit` de treino com mais de 30 dias e sem RPE
- **WHEN** o treino é registrado
- **THEN** nenhuma análise de IA é criada

#### Scenario: Mesmo treino chega depois pelo Garmin direto
- **GIVEN** treino importado por `.fit` com `externalId` `<atletaId>-<serial>-<start>`
- **WHEN** a ingestão direta registra um treino com o mesmo `externalId`
- **THEN** nenhuma linha nova é criada
