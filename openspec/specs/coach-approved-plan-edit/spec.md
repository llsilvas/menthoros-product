# coach-approved-plan-edit Specification

## Purpose
TBD - created by archiving change coach-editar-treino-aprovado. Update Purpose after archive.
## Requirements
### Requirement: Edição de treino pendente em plano aprovado

O sistema SHALL permitir que o treinador edite um treino de um plano `APROVADO` quando o treino está
pendente de execução e sua data é hoje ou futura no fuso do atleta, e SHALL recusar com 422 a edição
de treino realizado, perdido ou de dia passado, e a edição cujo resultado deixa de ser exportável ao
relógio. Com envio ao relógio em andamento, o sistema SHALL recusar com 409.

#### Scenario: Treino de hoje com relógio conectado
- **WHEN** o treinador tenta editar o treino de hoje de um atleta com conexão de canal, ativa ou revogada
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Registro da edição
- **WHEN** o treinador salva a edição de um treino de plano aprovado, com ou sem motivo
- **THEN** o sistema grava o treino antes e depois, quem editou, quando e o motivo informado

#### Scenario: Treino pulado hoje pelo atleta
- **WHEN** o treinador tenta editar um treino de hoje que o atleta marcou como pulado
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Envio em andamento
- **WHEN** o treinador tenta editar um treino cujo envio ao relógio está em andamento
- **THEN** a resposta é 409 e o treino não muda

#### Scenario: Treino futuro em plano aprovado
- **WHEN** o treinador edita um treino de amanhã, sem treino realizado, num plano `APROVADO`
- **THEN** o treino é atualizado e `editedAfterApprovalAt` é preenchido

#### Scenario: Treino realizado
- **WHEN** o treinador tenta editar um treino com treino realizado vinculado num plano `APROVADO`
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Treino de dia passado
- **WHEN** o treinador tenta editar um treino de ontem num plano `APROVADO`
- **THEN** a resposta é 422 e o treino não muda

#### Scenario: Plano em revisão
- **WHEN** o treinador edita um treino de um plano `AGUARDANDO_REVISAO`
- **THEN** o comportamento é o atual: sem reenvio ao relógio e sem `editedAfterApprovalAt`

### Requirement: Reenvio ao relógio do treino editado

Ao salvar a edição de um treino de plano `APROVADO`, o sistema SHALL reenviar apenas esse treino ao
canal da conexão ativa do atleta, depois do commit, atualizando o treino existente no canal; sem
conexão de canal, o sistema SHALL NOT tentar o envio.

#### Scenario: Atleta com canal conectado
- **WHEN** o treinador edita um de quatro treinos sincronizados de um plano aprovado
- **THEN** só o treino editado é enviado ao canal, com o mesmo identificador externo, e os demais
  não são reenviados

#### Scenario: Atleta sem canal
- **WHEN** o treinador edita um treino de um atleta sem conexão de canal
- **THEN** a edição é salva e nenhum envio é tentado

### Requirement: Sinalização da edição pós-aprovação ao treinador

A aba Plano do perfil do atleta SHALL mostrar a ação de editar só em treinos editáveis, SHALL avisar
no dialog de edição que o plano já foi aprovado e que o treino será reenviado ao relógio, e SHALL
marcar no card o treino editado após a aprovação.

#### Scenario: Ações por estado do treino
- **WHEN** o treinador abre um plano aprovado com um treino realizado e um treino de amanhã
- **THEN** só o treino de amanhã tem o botão "Editar treino" e o realizado mostra o indicador de
  "não editável"

#### Scenario: Aviso no dialog
- **WHEN** o treinador abre a edição de um treino de plano aprovado de um atleta com Garmin
- **THEN** o dialog mostra o aviso de plano aprovado citando o canal e o botão "Salvar e reenviar"

#### Scenario: Selo após salvar
- **WHEN** a edição é salva e o plano recarrega
- **THEN** o card do treino mostra o selo "Editado após aprovação"

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
- **THEN** a resposta é 422 com mensagem iniciando por "Data do treino fora do intervalo do plano" e o treino não muda

#### Scenario: Destino marcado como descanso
- **WHEN** o dia de destino está em `restDays` do plano
- **THEN** o descanso daquele dia é removido e o treino é gravado no dia

#### Scenario: Origem fica sem prescrição
- **WHEN** o treino movido era o único do dia de origem e o dia não está em `restDays`
- **THEN** a edição é aceita e o dia de origem é registrado como sem prescrição (log e contador `plano_dia_sem_prescricao`)

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

#### Scenario: Reenvio no Garmin sem identificador remoto
- **WHEN** o treino movido já tem workout no Garmin e o schedule não foi gravado
- **THEN** o reenvio reaproveita o workout e move o schedule, sem criar um segundo workout

#### Scenario: Data igual à atual
- **WHEN** o PATCH traz só `dataTreino`, igual à data gravada
- **THEN** nada muda e, em plano aprovado, a sincronização com o relógio não reinicia

#### Scenario: Retry durante o envio ao relógio
- **WHEN** o treino está `SINCRONIZANDO` com envio em andamento e chega um PATCH, mesmo com a data já aplicada
- **THEN** a resposta é 409, como em qualquer edição nessa janela

#### Scenario: Patch sem data
- **WHEN** o PATCH não traz `dataTreino`
- **THEN** a data e o dia não mudam

