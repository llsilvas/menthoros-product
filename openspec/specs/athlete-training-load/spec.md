# athlete-training-load

## Requirements

### Requirement: Série de métricas diárias é densa entre a primeira métrica e hoje

Para todo atleta com ao menos uma linha em `tb_metricas_diarias`, o sistema SHALL manter uma linha
por dia-calendário entre a primeira métrica e o dia corrente no fuso do atleta. Dias sem treino
SHALL ter TSS = 0 e CTL/ATL decaídos a partir do dia anterior — nunca reiniciados em zero.

#### Scenario: Treino ingerido após dias sem treino
- **WHEN** a última métrica do atleta é D0 e um treino é ingerido em D0+k (k ≥ 2), por qualquer fonte
- **THEN** existem linhas para D0+1..D0+k, com TSS 0 em D0+1..D0+k-1 e CTL/ATL decaindo a partir de D0

#### Scenario: Treino retroativo
- **WHEN** um treino é ingerido com data anterior à última métrica
- **THEN** o recálculo começa na data do treino e segue até hoje (comportamento preservado)

#### Scenario: Primeiro treino do atleta
- **WHEN** o atleta não tem nenhuma métrica e um treino é ingerido
- **THEN** a série começa no dia do treino, com seed zero

### Requirement: Recálculo é atômico e serializado por atleta

Um recálculo de métricas de um atleta SHALL ser atômico: ou todas as linhas do intervalo são
gravadas, ou nenhuma. Ingestão, job e reparo SHALL ser serializados por atleta, e a leitura de
treinos e métricas SHALL ocorrer depois da obtenção da serialização.

#### Scenario: Falha no meio do recálculo
- **WHEN** ocorre erro ao calcular um dia do meio do intervalo
- **THEN** nenhuma linha do intervalo é alterada

#### Scenario: Ingestão concorrente com o job
- **WHEN** o job recalcula um atleta enquanto uma ingestão do mesmo atleta ainda não confirmou
- **THEN** o recálculo espera a confirmação e a métrica final reflete o treino ingerido

### Requirement: Decaimento diário sem treino

Um job horário SHALL materializar, para cada atleta com buraco na série ou com última linha anterior
ao dia corrente no fuso do atleta, as linhas até hoje com TSS 0, a partir do primeiro dia pendente.
Atletas em dia SHALL NOT ser tocados; atrasos acima de 400 dias SHALL ser processados em blocos de
400 dias por execução; a falha em um atleta SHALL NOT impedir os demais; o job SHALL estabelecer o
contexto de tenant de cada atleta e limpá-lo ao fim. O sistema SHALL expor a contagem de atletas
defasados em mais de um dia após a execução.

#### Scenario: Atleta sem treino há 3 dias
- **WHEN** o job roda e a última métrica é D0 com hoje = D0+3
- **THEN** passam a existir linhas D0+1..D0+3 com CTL/ATL decaídos

#### Scenario: Atleta em fuso posterior ao de Brasília
- **WHEN** o job roda às 00:30 de Brasília e ainda é o dia anterior no fuso do atleta
- **THEN** o atleta é pulado e processado na execução horária seguinte após a virada do dia dele

#### Scenario: Atraso acima de 400 dias
- **WHEN** a última métrica tem mais de 400 dias de atraso
- **THEN** cada execução materializa 400 dias e as seguintes continuam até hoje

#### Scenario: Job idempotente
- **WHEN** o job roda duas vezes seguidas sem novo dia
- **THEN** a segunda execução não grava nada

### Requirement: Seed do cálculo diário nunca reinicia em zero havendo histórico

Ao calcular as métricas de um dia D, o sistema SHALL usar como seed a última linha existente anterior
a D, decaída com TSS 0 pelos dias de distância, somente quando não há treino contabilizável
estritamente entre essa linha e D (intervalo exclusivo nas duas pontas); havendo treino no intervalo, SHALL registrar aviso e usar seed zero, sem publicar
valor decaído. SHALL usar seed zero também quando não existe nenhuma linha anterior.

#### Scenario: Linha de D-1 ausente, D-3 presente, sem treino no intervalo
- **WHEN** as métricas de D são calculadas
- **THEN** o seed é a linha de D-3 decaída 2 vezes com TSS 0

#### Scenario: Linha de D-1 ausente mas com treino no dia
- **WHEN** as métricas de D são calculadas e existe treino contabilizável em D-2 ou D-1
- **THEN** o sistema registra aviso e não usa o seed decaído
