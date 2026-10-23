# Spec Delta — garmin-training-push

## Purpose
Entrega do treino planejado ao relógio Garmin do atleta: cada treino do plano aprovado vira um
workout agendado na conta Garmin, com alvos exatamente como o treinador prescreveu, e acompanha as
re-aprovações e exclusões do plano sem duplicar nem deixar sobras.

## ADDED Requirements

### Requirement: Treino planejado vira workout agendado
Para um atleta cujo canal é o Garmin, cada treino exportável de um plano aprovado SHALL ser
enviado ao Garmin como um workout de corrida agendado na data do treino, preservando a estrutura
de etapas: duração por tempo ou distância, etapas abertas, e blocos de repetição com suas
sub-etapas. O identificador do workout no Garmin SHALL ser guardado no treino planejado e o
estado de sincronização SHALL refletir o resultado.

#### Scenario: Treino com bloco de repetição
- **WHEN** um plano aprovado contém um treino com aquecimento por tempo, 6 repetições de 400 m
  com 200 m de recuperação, e desaquecimento por tempo
- **THEN** o Garmin recebe um único workout de corrida com três etapas de topo, sendo a do meio um
  bloco de 6 repetições com duas sub-etapas, agendado na data do treino, e o treino fica
  sincronizado com o identificador do workout

#### Scenario: Etapa sem duração
- **WHEN** uma etapa não tem tempo nem distância
- **THEN** ela vai como etapa aberta (o atleta avança no relógio)

#### Scenario: Atleta sem canal
- **WHEN** o atleta não tem conexão de canal ativa
- **THEN** nenhum envio é feito e o treino permanece não sincronizado

### Requirement: Alvos exatamente como prescritos
Alvo de frequência cardíaca SHALL ir em batimentos por minuto absolutos (faixa mínima–máxima),
nunca como zona nem percentual. Alvo de pace SHALL ir como faixa de velocidade em metros por
segundo, convertida do pace em segundos por quilômetro. Etapa sem objetivo SHALL ir sem alvo.

#### Scenario: Faixa de FC
- **WHEN** uma etapa prescreve 140–150 bpm
- **THEN** o workout traz a etapa com alvo de FC mínimo 140 e máximo 150, sem consulta a limiar ou
  zona do atleta

#### Scenario: Faixa de pace
- **WHEN** uma etapa prescreve pace 4:00–4:10 /km
- **THEN** o workout traz alvo de velocidade entre 4,000 e 4,167 m/s (o pace mais rápido é o limite
  superior de velocidade)

#### Scenario: Pace único
- **WHEN** uma etapa prescreve pace 5:00 /km sem faixa
- **THEN** o alvo de velocidade tem mínimo e máximo iguais a 3,333 m/s

### Requirement: Idempotência e reconciliação
Reenviar o mesmo treino SHALL atualizar o workout já criado em vez de criar outro. Quando a data
muda, o agendamento SHALL ser movido. Após a re-aprovação de um plano, agendamentos da semana que
apontem para workouts criados pelo Menthoros e que não correspondam a nenhum treino atual SHALL
ser removidos, junto com o workout. Workouts que o atleta criou por conta própria SHALL NOT ser
tocados.

#### Scenario: Re-aprovação com treino alterado
- **WHEN** um plano é re-aprovado e um treino já sincronizado mudou de etapas
- **THEN** o workout existente é atualizado no lugar, sem criar um segundo

#### Scenario: Treino mudou de dia
- **WHEN** um treino sincronizado passa de terça para quarta
- **THEN** o agendamento é movido para quarta e terça fica sem o workout

#### Scenario: Treino removido do plano
- **WHEN** um treino sincronizado deixa de existir no plano re-aprovado
- **THEN** o agendamento e o workout correspondentes são apagados do Garmin

#### Scenario: Workout do próprio atleta na semana
- **WHEN** há na semana um workout agendado que o atleta criou no Garmin Connect
- **THEN** ele permanece intacto após a reconciliação

#### Scenario: Plano excluído
- **WHEN** o plano é excluído
- **THEN** agendamento e workout de cada treino sincronizado são apagados; um já ausente no Garmin
  não é erro

### Requirement: Erros do Garmin com ação certa
Limite de requisições SHALL colocar o treino em espera para nova tentativa automática. Falta da
permissão de importar treino SHALL marcar o treino com erro de autorização, sem nova tentativa,
com mensagem orientando o atleta a autorizar no Garmin Connect. Credencial expirada SHALL
provocar uma renovação e uma única repetição da chamada.

#### Scenario: Limite de requisições
- **WHEN** o Garmin responde que o limite foi atingido
- **THEN** o treino fica aguardando nova tentativa e é reenviado depois sem intervenção

#### Scenario: Permissão de importar treino ausente
- **WHEN** o Garmin responde que o atleta não autorizou importação de treino
- **THEN** o treino fica com erro de autorização, a mensagem orienta a autorizar no Garmin Connect,
  e não há nova tentativa automática

#### Scenario: Credencial expirada
- **WHEN** o Garmin rejeita a credencial
- **THEN** a credencial é renovada e a chamada repetida uma vez; falhando de novo, o treino fica com
  erro de autorização

#### Scenario: Treino grande demais
- **WHEN** um treino excede 100 etapas após expandir os blocos
- **THEN** o treino fica com erro de validação e mensagem ao treinador, sem envio

### Requirement: Canal escolhido pela conexão do atleta
O envio SHALL usar o canal da conexão ativa do atleta — Garmin ou intervals.icu — sem que o
treinador escolha nada. Atletas de canais diferentes no mesmo lote SHALL ser atendidos cada um
pelo seu canal.

#### Scenario: Lote misto
- **WHEN** um lote de planos aprovados inclui um atleta Garmin e um atleta intervals.icu
- **THEN** cada treino vai pelo canal do seu atleta e o comportamento do intervals.icu é o mesmo de
  antes
