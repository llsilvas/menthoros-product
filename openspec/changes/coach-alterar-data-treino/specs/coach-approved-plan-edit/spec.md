# coach-approved-plan-edit — delta (coach-alterar-data-treino)

## ADDED Requirements

### Requirement: Alteração da data do treino dentro da semana do plano

O sistema SHALL aceitar `dataTreino` na edição de um treino planejado, em plano aguardando revisão
ou aprovado, desde que a data esteja dentro de `[semanaInicio, semanaFim]` do plano, e SHALL
derivar `diaSemana` da nova data. A disponibilidade do atleta (`diasDisponiveis`) SHALL NOT
restringir a data. Ao mover, o sistema SHALL remover o descanso do dia de destino e registrar se o
dia de origem ficou sem prescrição. Em plano aprovado, a nova data SHALL ser hoje ou futura; data
passada é recusada com 422 antes de qualquer mutação, e destino hoje com relógio conectado é
recusado com 422 — a mesma política aplicada ao treino de origem, com "hoje" no fuso do atleta.
Ao reenviar o treino movido ao relógio sem identificador remoto gravado, o sistema SHALL procurar
o evento pelo identificador canônico em toda a semana do plano antes de criar outro.

#### Scenario: Mover para dia fora da disponibilidade do atleta
- **WHEN** o treinador move um treino de segunda para sábado e o atleta só declarou SEG, QUA e SEX
- **THEN** a resposta é 200, o treino fica no sábado com `diaSemana = SABADO`

#### Scenario: Data fora da semana do plano
- **WHEN** `dataTreino` é anterior a `semanaInicio` ou posterior a `semanaFim`
- **THEN** a resposta é 4xx com "Data do treino fora do intervalo do plano" e o treino não muda

#### Scenario: Destino marcado como descanso
- **WHEN** o dia de destino está em `restDays` do plano
- **THEN** o descanso daquele dia é removido e o treino é gravado no dia

#### Scenario: Plano aprovado, destino no passado
- **WHEN** o plano está `APROVADO` e a nova data é anterior a hoje
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Plano aprovado, destino hoje com relógio
- **WHEN** o plano está `APROVADO`, o atleta tem relógio conectado e a nova data é hoje no fuso dele
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Reenvio sem identificador remoto
- **WHEN** o treino movido já existe no intervals.icu mas o `eventId` não foi gravado
- **THEN** o reenvio encontra o evento pelo `externalId` na semana do plano e o atualiza para a
  nova data, sem criar um segundo evento

#### Scenario: Plano aprovado, destino futuro
- **WHEN** o plano está `APROVADO`, o treino é editável e a nova data é hoje ou futura
- **THEN** o treino muda de data, a edição é marcada como pós-aprovação e a sincronização com o
  relógio reinicia

#### Scenario: Patch sem data
- **WHEN** o PATCH não traz `dataTreino`
- **THEN** a data e o dia não mudam
