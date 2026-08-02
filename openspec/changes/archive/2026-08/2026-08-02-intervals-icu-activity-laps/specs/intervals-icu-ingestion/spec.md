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

#### Scenario: Zona, intensidade e inclinação da volta
- **Given** um lap cujo payload traz zona de FC, intensidade e inclinação média
- **When** a etapa é criada
- **Then** a zona e a intensidade (% do limiar) são gravadas como vieram
- **And** a inclinação é gravada em **percentual**, convertida da fração da origem
- **And** os três ficam disponíveis na representação de saída da etapa

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

## Requirement: As etapas não custam uma chamada externa a mais

Os intervalos DEVEM ser obtidos na mesma requisição que já busca a atividade. O import NÃO DEVE
ganhar um modo de falha parcial em que o treino é criado com sucesso mas sem etapas por
indisponibilidade.

#### Scenario: Uma requisição por import
- **Given** um import de atividade
- **When** o fluxo executa
- **Then** exatamente uma requisição é feita ao intervals.icu, como antes desta capability mudar

#### Scenario: Comportamento de erro preservado
- **Given** o intervals.icu responde com erro (credencial inválida, não encontrado, rate limit,
  indisponibilidade ou timeout)
- **When** o coach importa a atividade
- **Then** a resposta é a mesma já especificada para cada um desses casos
- **And** nenhum `TreinoRealizado` parcial — criado com summary e sem etapas por falha — é
  persistido

## Requirement: A lacuna histórica é recuperável

Um treino intervals.icu importado **antes** desta capability existir DEVE poder ser completado
depois, sem depender de reimportar a atividade — o guard de idempotência de import impede a correção
por essa via.

#### Scenario: Coach recupera as etapas de um atleta
- **Given** um atleta com treinos intervals.icu importados antes desta capability, portanto sem
  etapas
- **When** o coach dispara a recuperação de etapas para esse atleta
- **Then** cada treino do conjunto tem suas etapas buscadas e persistidas, atualizando o registro
  existente
- **And** nenhum `TreinoRealizado` novo é criado
- **And** o guard de idempotência de import não impede a operação

#### Scenario: A recuperação não sobrescreve o treino
- **Given** um treino cuja recuperação é disparada
- **When** as etapas são gravadas
- **Then** apenas as etapas mudam — distância, pace, FC, descrição e demais campos do treino
  permanecem como estavam, inclusive edições feitas pelo coach desde o import

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
