# activity-sync

## ADDED Requirements

### Requirement: Cursor exclusivo do pull
O pull de atividades (intervals.icu e Strava) SHALL usar um cursor próprio, avançado apenas pelos schedulers
de pull e apenas até o progresso confirmado. Push de treino planejado, webhook e sync manual SHALL NOT
alterar esse cursor, inclusive ao salvar a integração. O cursor SHALL ser atualizado apenas com o tenant da
integração.

#### Scenario: Pull atrasado e push aprovado
- **WHEN** o cursor do pull está em D−20 e um push conclui salvando a integração
- **THEN** o cursor continua em D−20

#### Scenario: Sync manual e webhook
- **WHEN** o cursor do pull está em D−20 e o sync manual termina (com ou sem rate limit) ou chega um webhook
- **THEN** o cursor continua em D−20

#### Scenario: Tenant errado
- **WHEN** o cursor é atualizado com um tenant diferente do da integração
- **THEN** nenhuma linha é alterada

### Requirement: Horizonte inicial estável
Com o cursor nulo, o primeiro ciclo SHALL gravar o horizonte inicial antes de buscar, e os ciclos seguintes
SHALL partir dele até haver progresso.

#### Scenario: Rate limit na primeira página
- **WHEN** uma conexão nova recebe rate limit na primeira página do Strava
- **THEN** o cursor fica no horizonte inicial gravado, o pull é `FALHA`/`RATE_LIMIT`, e o ciclo seguinte usa
  o mesmo horizonte

### Requirement: Pull do Strava não perde corridas
O pull do Strava SHALL varrer a janela em fatias de tempo, cada uma paginada até a página vazia da API, e
SHALL avançar o cursor apenas até o fim da última fatia varrida inteira. O instante da atividade SHALL ser o
`start_date` (UTC), com overlap de 7 dias.

#### Scenario: Página só de outras modalidades
- **WHEN** a página 1 da fatia tem 30 atividades de bike e a página 2 tem 3 corridas
- **THEN** as 3 corridas são importadas

#### Scenario: Fuso positivo
- **WHEN** uma corrida tem `start_date` 06:00Z e `start_date_local` 09:00
- **THEN** o instante usado é 06:00Z

#### Scenario: Interrupção no meio da janela
- **WHEN** há rate limit na página 3 da segunda fatia
- **THEN** o cursor fica no fim da primeira fatia e o próximo ciclo recomeça na segunda

### Requirement: Relistar é idempotente e preserva o atleta
Uma atividade já importada SHALL NOT ser duplicada, reprocessada pelo pull nem contada como inserção, e o
RPE, as sensações e o feedback registrados pelo atleta SHALL NOT ser sobrescritos por dados da plataforma.

#### Scenario: Corrida com RPE do atleta
- **WHEN** uma corrida já importada com RPE 7 é relistada pelo pull ou atualizada por webhook sem RPE
- **THEN** não há duplicata e o RPE continua 7

### Requirement: Descarte registrado
Uma atividade rejeitada de forma permanente, ou que falha de forma inesperada em 3 ciclos, SHALL ser
registrada como descartada e SHALL NOT ser selecionada de novo pelo pull nem consumir o teto do ciclo.

#### Scenario: Rejeições no overlap
- **WHEN** 6 atividades com 422 estão no overlap e uma 7ª válida vem depois delas
- **THEN** no segundo ciclo a 7ª é importada e as 6 não são buscadas

#### Scenario: Falha recorrente
- **WHEN** a importação de uma corrida lança exceção inesperada em 3 ciclos agendados seguidos
- **THEN** no 3º ela é descartada com registro e a fatia segue

#### Scenario: Sync manual não conta tentativa
- **WHEN** uma corrida falhou em 2 ciclos agendados e falha também num sync manual
- **THEN** ela não é descartada

### Requirement: Scheduler do intervals.icu importa backlog antigo
O scheduler de pull do intervals.icu SHALL NOT aplicar o limite de retroatividade do import manual; o import
manual SHALL mantê-lo.

#### Scenario: Backlog de 120 dias
- **WHEN** o cursor do pull está em D−120
- **THEN** as atividades de D−120 a D−90 são importadas

### Requirement: Resultado de cada pull registrado
Cada pull agendado SHALL registrar instante, resultado (`COMPLETO`, `PARCIAL`, `FALHA`), categoria do erro,
inserções commitadas e atividades ignoradas, com o tenant da integração, em transação própria, inclusive
quando o pull falha. Webhook, push e sync manual SHALL NOT registrar pull. Registros com mais de 90 dias
SHALL ser removidos.

#### Scenario: Falha antes de qualquer inserção
- **WHEN** o pull falha antes de inserir qualquer atividade
- **THEN** existe o registro `FALHA` com zero inserções

#### Scenario: Interrupção com progresso
- **WHEN** o pull do intervals.icu é interrompido por exceção inesperada depois de 2 inserções commitadas
- **THEN** o registro é `PARCIAL` com 2 inserções

### Requirement: Escrita da integração não apaga dados concorrentes
Os caminhos de sync SHALL NOT salvar uma instância da integração carregada antes de uma chamada externa ou
de outra transação; cursor e status SHALL ser gravados por atualização pontual.

#### Scenario: Token renovado durante o sync manual
- **WHEN** o token do Strava é renovado durante um sync manual
- **THEN** ao fim do sync a integração mantém o token renovado
