# coach-attention-queue

## ADDED Requirements

### Requirement: Inatividade por sincronização é motivo próprio
Quando um atleta está sem treino registrado há 14 dias ou mais e a saúde da sincronização é `COM_ERRO`, a
fila de atenção SHALL sinalizar `SEM_SINCRONIZACAO` (com a plataforma e a data do último pull com sucesso)
em vez de `INATIVIDADE`. Com saúde `OK` ou `SEM_INTEGRACAO`, SHALL sinalizar `INATIVIDADE`.

#### Scenario: Token revogado
- **WHEN** o atleta está há 16 dias sem treino e o intervals.icu está com erro
- **THEN** o motivo é `SEM_SINCRONIZACAO` e não há `INATIVIDADE` para ele

#### Scenario: Atleta parado com sync ok
- **WHEN** o atleta está há 16 dias sem treino e a sincronização está ok
- **THEN** o motivo é `INATIVIDADE`

### Requirement: Sem sugestão de IA para falta de sincronização
O motivo `SEM_SINCRONIZACAO` SHALL NOT gerar `SugestaoCoach`.

#### Scenario: Job de sugestões
- **WHEN** o job processa um sinal `SEM_SINCRONIZACAO`
- **THEN** nenhuma sugestão é criada
