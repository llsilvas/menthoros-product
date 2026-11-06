## ADDED Requirements

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
