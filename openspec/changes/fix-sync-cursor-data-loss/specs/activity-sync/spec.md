# activity-sync

## ADDED Requirements

### Requirement: Cursor exclusivo do pull
O pull de atividades (intervals.icu e Strava) SHALL usar um cursor próprio, avançado apenas pelos schedulers
de pull e apenas até o último item confirmado (importado ou descartado por motivo permanente). Push de treino
planejado, webhook e sync manual SHALL NOT alterar esse cursor.

#### Scenario: Pull atrasado e push aprovado
- **WHEN** o cursor do pull está em D−20 e um push conclui
- **THEN** o cursor continua em D−20

#### Scenario: Rate limit na primeira página
- **WHEN** uma conexão nova recebe rate limit na primeira página do Strava
- **THEN** o cursor continua nulo

### Requirement: Pull do Strava não perde corridas
A paginação do pull do Strava SHALL terminar pela página vazia da API, e o instante usado no cursor SHALL ser
o `start_date` (UTC) da atividade.

#### Scenario: Página só de outras modalidades
- **WHEN** a página 1 tem 30 atividades de bike e a página 2 tem 3 corridas
- **THEN** as 3 corridas são importadas

### Requirement: Scheduler do intervals.icu importa backlog antigo
O scheduler de pull do intervals.icu SHALL NOT aplicar o limite de retroatividade do import manual.

#### Scenario: Backlog de 120 dias
- **WHEN** o cursor do pull está em D−120
- **THEN** as atividades de D−120 a D−90 são importadas

### Requirement: Resultado de cada pull registrado
Cada pull de atividades SHALL registrar instante, resultado (`COMPLETO`, `PARCIAL`, `FALHA`), categoria do
erro e inserções reais, com o tenant, em transação própria; eventos de webhook e pushes SHALL NOT registrar
pull. Registros com mais de 90 dias SHALL ser removidos.

#### Scenario: Rollback do lote
- **WHEN** o lote de um pull faz rollback
- **THEN** o registro `FALHA` existe
