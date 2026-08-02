# Spec delta: intervals-icu-ingestion

> **Modifica** a capability `intervals-icu-ingestion` (criada em
> `archive/2026-07/2026-07-16-intervals-icu-activity-ingestion/`). A atividade importada passa a
> trazer também suas etapas (laps/intervalos) como `EtapaRealizada`, fechando o non-goal
> "laps/etapas ficam para evolução" daquela change. Nada do comportamento de summary já
> especificado é revogado — este delta só ADICIONA requisitos.

## Requirement: Etapas da atividade importadas como EtapaRealizada

Ao importar uma atividade do intervals.icu, o sistema DEVE buscar também os intervalos (laps) da
atividade e persistir um `EtapaRealizada` por intervalo, vinculado ao `TreinoRealizado` criado.

#### Scenario: Atividade com laps gera etapas
- **Given** um atleta do tenant com conexão intervals.icu ativa
- **And** uma atividade de corrida cujo payload de intervalos traz N laps
- **When** o coach importa a atividade
- **Then** o `TreinoRealizado` é criado com N `EtapaRealizada` vinculadas
- **And** cada etapa tem `ordem` sequencial a partir de 1, na ordem em que os laps vieram
- **And** cada etapa tem `distanciaKm`, `duracao`, `fcMedia`, `fcMax`, `paceMedia`,
  `velocidadeMedia` e `cadenciaMedia` mapeados a partir do lap correspondente, quando presentes na
  origem

#### Scenario: Unidades convertidas na etapa
- **Given** um lap com velocidade em m/s e cadência em passos/min de uma perna
- **When** a etapa é criada
- **Then** `velocidadeMedia` é gravada em km/h
- **And** `cadenciaMedia` é gravada como cadência total (dobrada), descartada quando fora da faixa
  60–200
- **And** `distanciaKm` é gravada em quilômetros

#### Scenario: Tipo do intervalo preenchido quando a origem classifica
- **Given** uma atividade originada de um treino estruturado, cujo payload classifica cada intervalo
- **When** as etapas são criadas
- **Then** `tipoEtapa` é preenchido com o vocabulário do domínio
- **And** um valor não reconhecido resulta em `tipoEtapa` nulo, nunca num chute

#### Scenario: Atividade sem laps
- **Given** uma atividade cujo payload de intervalos vem vazio ou ausente
- **When** o coach importa a atividade
- **Then** o `TreinoRealizado` é criado normalmente, sem etapas e sem erro
- **And** a resposta é 200

#### Scenario: Intervalo sem métrica útil é descartado
- **Given** um lap sem distância e sem duração
- **When** as etapas são criadas
- **Then** esse lap não vira `EtapaRealizada`
- **And** a numeração de `ordem` das etapas restantes permanece sequencial e sem buracos

## Requirement: A falha ao buscar laps não derruba o import

A busca de intervalos é uma chamada complementar. Falha nessa chamada DEVE degradar o resultado
(treino sem etapas), NUNCA falhar o import de um summary que teria sido importado com sucesso.

#### Scenario: intervals.icu indisponível apenas para os intervalos
- **Given** a chamada de summary responde 200
- **And** a chamada de intervalos responde 429, 5xx ou estoura o timeout
- **When** o coach importa a atividade
- **Then** o `TreinoRealizado` é criado com o summary e sem etapas
- **And** a resposta é 200
- **And** um WARN e uma métrica de falha, com o status, registram a degradação

#### Scenario: Payload de intervalos com formato inesperado
- **Given** a chamada de intervalos responde 200 com um corpo que não desserializa
- **When** o coach importa a atividade
- **Then** o treino é criado sem etapas
- **And** a ocorrência é registrada em ERROR — quebra de contrato não é tratada como
  indisponibilidade

#### Scenario: O resultado da busca de laps é classificado e registrado
- **Given** um import cuja chamada de intervalos teve algum desfecho
- **When** o treino é persistido
- **Then** o desfecho fica registrado nos metadados de sincronização, distinguindo
  "tem laps", "genuinamente não tem laps" e "falhou e pode ser recuperado"
- **And** apenas o último caso torna o treino elegível para recuperação posterior

## Requirement: Etapas ausentes são recuperáveis

Um treino intervals.icu sem etapas — seja porque foi importado antes desta capability existir, seja
porque a busca de laps falhou — DEVE poder ser completado depois, sem depender de reimportar a
atividade.

#### Scenario: Coach recupera as etapas de um atleta
- **Given** um atleta com treinos intervals.icu sem etapas, entre eles alguns cuja busca de laps
  falhou e outros importados antes desta capability
- **When** o coach dispara a recuperação de etapas para esse atleta
- **Then** cada treino do conjunto tem suas etapas buscadas e persistidas, atualizando o registro
  existente
- **And** nenhum `TreinoRealizado` novo é criado
- **And** o guard de idempotência de import não impede a operação

#### Scenario: Treino genuinamente sem laps não é reconsultado
- **Given** um treino cujo desfecho registrado é "genuinamente não tem laps"
- **When** a recuperação é disparada
- **Then** esse treino é pulado sem nenhuma chamada externa

#### Scenario: Recuperação é idempotente e tolerante a falha parcial
- **Given** uma recuperação em que a busca de laps de um dos treinos falha
- **When** a operação termina
- **Then** os demais treinos do conjunto foram completados normalmente
- **And** o treino que falhou continua elegível para a próxima recuperação
- **And** disparar a recuperação de novo é no-op para os treinos já completados

#### Scenario: Recuperação respeita o isolamento de tenant
- **Given** treinos sem etapas pertencentes a outro tenant
- **When** a recuperação é disparada
- **Then** esses treinos nunca entram no conjunto de candidatos

## Requirement: A busca de laps não gasta rede à toa nem segura conexão de banco

#### Scenario: Atividade já importada não dispara nenhuma chamada
- **Given** uma atividade já importada anteriormente
- **When** o coach importa a mesma atividade de novo
- **Then** o registro existente é retornado
- **And** **nenhuma** das duas chamadas HTTP é feita
- **And** o output serializa as etapas já persistidas sem erro de inicialização lazy

#### Scenario: Guards abortam antes da chamada de intervalos
- **Given** uma atividade pertencente a outro atleta, ou de modalidade não suportada
- **When** o import é tentado
- **Then** a requisição é rejeitada (404 e 422, respectivamente)
- **And** a chamada de intervalos não é feita

#### Scenario: IO externo fora de transação
- **Given** o fluxo de import
- **When** a busca de intervalos é executada
- **Then** ela ocorre fora de qualquer transação de banco, antes do passo de persistência

## Requirement: Paridade de análise entre fontes

Com as etapas presentes, as skills de análise que dependem delas DEVEM deixar de operar em modo
degradado para treinos vindos do intervals.icu.

#### Scenario: Análise de treino longo usa as etapas
- **Given** um treino longo importado do intervals.icu com laps
- **When** a análise de treino longo é executada
- **Then** ela usa os dados por etapa — drift de FC e progressão de pace são calculados
- **And** não recorre ao fallback baseado apenas no agregado do treino
