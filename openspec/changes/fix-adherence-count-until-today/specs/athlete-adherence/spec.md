# athlete-adherence

## ADDED Requirements

### Requirement: Aderência conta só treinos devidos
A aderência (resumo do roster, `aderenciaSemanal` do perfil do coach e `/me/aderencia` do atleta) SHALL
contar no denominador apenas treinos planejados que não são `DESCANSO` e cuja data é anterior a hoje, ou é
hoje com treino realizado vinculado. O numerador SHALL ser os devidos com treino realizado vinculado.
"Hoje" SHALL ser o dia no fuso do atleta.

#### Scenario: Treino futuro fora do denominador
- **WHEN** o atleta tem treinos planejados na semana atual com data depois de hoje
- **THEN** eles não entram no denominador da aderência

#### Scenario: Treino de hoje ainda não feito
- **WHEN** há um treino planejado para hoje sem treino realizado vinculado
- **THEN** ele não entra no denominador

#### Scenario: Treino de hoje já feito
- **WHEN** há um treino planejado para hoje com treino realizado vinculado
- **THEN** ele entra no denominador e no numerador

#### Scenario: Descanso fora do denominador
- **WHEN** há um `TreinoPlanejado` do tipo `DESCANSO` já vencido, sem treino realizado
- **THEN** ele não entra no denominador

### Requirement: Semanas sem treino devido não aparecem
`aderenciaSemanal` SHALL listar só semanas com pelo menos um treino devido; semanas futuras e a semana atual
antes do primeiro vencimento SHALL NOT aparecer.

#### Scenario: Plano da próxima semana já gerado
- **WHEN** existe plano para a próxima semana
- **THEN** a próxima semana não aparece em `aderenciaSemanal`

### Requirement: Aderência de 4 semanas numa função só
A aderência de 4 semanas SHALL somar os treinos devidos e realizados da semana atual e das 3 anteriores
(semanas ISO no fuso do atleta), calculada por uma única função no backend que alimenta
`roster.aderenciaPercentual` e o campo `aderencia4Semanas` do perfil do coach. Sem treino devido na
janela, o campo SHALL estar ausente e o roster SHALL ser nulo — nunca 0%.

#### Scenario: Mesmo atleta, mesmo dia
- **WHEN** o roster e o perfil do mesmo atleta são calculados no mesmo dia
- **THEN** `roster.aderenciaPercentual` é igual a `aderencia4Semanas.percentual`

#### Scenario: Cinco semanas com dados
- **WHEN** há treinos devidos na semana atual e nas 4 anteriores
- **THEN** entram só a atual e as 3 anteriores

### Requirement: Semana em curso sem nada vencido
O gráfico semanal do Diagnóstico SHALL mostrar a semana atual sem entrada como "Nada vencido ainda nesta
semana", não como "Sem plano na semana"; a tela de progresso do atleta SHALL NOT mostrar a semana corrente
sem entrada como "Sem plano".

#### Scenario: Segunda-feira de manhã
- **WHEN** o treino do dia ainda não foi feito e nenhum outro da semana venceu
- **THEN** o tooltip da semana atual diz "Nada vencido ainda nesta semana"
- **AND** a tela de progresso do atleta não mostra a semana corrente como "Sem plano"
