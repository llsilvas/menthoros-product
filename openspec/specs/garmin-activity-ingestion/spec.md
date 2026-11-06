# garmin-activity-ingestion Specification

## Purpose
TBD - created by archiving change garmin-activity-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Aviso de atividade registrado antes de processar
Cada aviso de arquivo de atividade recebido do Garmin SHALL ser registrado de forma durável e
respondido com sucesso antes de qualquer download ou processamento. Avisos repetidos para a mesma
atividade SHALL ser ignorados. Avisos de atividade que não é corrida, de atividade criada
manualmente no Garmin Connect, de arquivo que não é FIT, ou de atleta com conexão Garmin inativa
SHALL ser registrados como descartados, com motivo, sem download. Aviso de usuário Garmin que
nunca se conectou SHALL NOT ser registrado (não há atleta a quem atribuí-lo) e a resposta continua
sendo sucesso. Se o registro durável falhar, a resposta SHALL ser erro, para o Garmin reenviar.

#### Scenario: Aviso de corrida
- **WHEN** chega um aviso de arquivo de atividade de corrida de um atleta conectado
- **THEN** a resposta é sucesso imediato e o aviso fica pendente de processamento, sem nenhuma
  chamada ao Garmin durante a resposta

#### Scenario: Aviso repetido
- **WHEN** o mesmo aviso chega duas vezes
- **THEN** o segundo é ignorado e a resposta continua sendo sucesso

#### Scenario: Ciclismo ou natação
- **WHEN** chega um aviso de atividade que não é corrida
- **THEN** o aviso é descartado com motivo e o arquivo não é baixado

#### Scenario: Atividade manual
- **WHEN** chega um aviso de atividade criada manualmente no Garmin Connect
- **THEN** o aviso é descartado com motivo e o arquivo não é baixado

#### Scenario: Conexão inativa
- **WHEN** chega um aviso de um atleta cuja conexão Garmin está inativa
- **THEN** o aviso é descartado com motivo e o arquivo não é baixado

#### Scenario: Usuário desconhecido
- **WHEN** chega um aviso de um usuário Garmin sem nenhuma conexão registrada
- **THEN** nada é registrado, o arquivo não é baixado e a resposta é sucesso

#### Scenario: Falha ao registrar
- **WHEN** o registro durável do aviso falha
- **THEN** a resposta é erro e o reenvio do Garmin não duplica o que já tinha sido registrado

### Requirement: Download único dentro da janela
O arquivo SHALL ser baixado uma única vez, em até 24 horas do aviso, e processado em memória; o
conteúdo bruto SHALL NOT ser guardado após o processamento. Falha transitória de download (erro do
servidor, tempo esgotado, limite de requisições) SHALL gerar nova tentativa com espera crescente de
até 60 minutos entre elas, sem limite de tentativas — o único limite é a janela de 24 horas. Link
já consumido ou expirado, falta de permissão ou endereço de download fora do Garmin SHALL encerrar
o aviso com erro sem nova tentativa. Avisos mais próximos de expirar SHALL ser processados
primeiro. Aviso preso em processamento SHALL voltar a pendente.

#### Scenario: Download bem-sucedido
- **WHEN** o processamento baixa o arquivo e o treino é registrado
- **THEN** o aviso fica processado apontando para o treino e nenhum byte do arquivo permanece
  armazenado

#### Scenario: Garmin instável
- **WHEN** o download falha por erro do servidor ou tempo esgotado
- **THEN** o aviso volta a pendente com a tentativa contada e a próxima tentativa agendada com
  espera crescente (teto de 60 minutos); seis falhas seguidas dentro da janela não o levam a erro

#### Scenario: Endereço de download fora do Garmin
- **WHEN** o endereço de download do aviso não é HTTPS no host e caminho de arquivos do Garmin
- **THEN** o aviso fica em erro com motivo e nenhuma requisição é feita

#### Scenario: Sem permissão
- **WHEN** o Garmin recusa o download por autorização ou consentimento ausente
- **THEN** o aviso fica em erro com motivo de permissão, sem nova tentativa

#### Scenario: Processamento interrompido
- **WHEN** um aviso está em processamento há mais de 10 minutos
- **THEN** ele volta a pendente com a tentativa contada

#### Scenario: Link já usado
- **WHEN** o Garmin responde que o arquivo já foi baixado
- **THEN** o aviso fica em erro imediatamente, sem nova tentativa

#### Scenario: Aviso prestes a expirar
- **WHEN** há avisos pendentes com mais de 23 horas e outros recentes
- **THEN** os mais antigos são processados primeiro; passado de 24 horas sem sucesso, o aviso fica
  em erro "expirado"

### Requirement: Treino realizado pelo pipeline FIT
O arquivo baixado SHALL virar treino realizado com fonte Garmin pelo mesmo caminho do upload manual
de FIT — mesmas etapas, running dynamics, TSS calculado e carga do dia — e SHALL registrar o modelo
do dispositivo informado pelo Garmin. A unicidade SHALL ser a mesma do upload: o mesmo arquivo
enviado pelo Garmin e subido à mão SHALL produzir um único treino.

#### Scenario: Corrida de 15 km com 16 voltas
- **WHEN** o arquivo de uma corrida de 15 km com 16 voltas é processado
- **THEN** existe um treino realizado com fonte Garmin, 16 etapas, modelo do dispositivo, TSS
  calculado e a carga do dia atualizada

#### Scenario: Mesmo arquivo já subido à mão
- **WHEN** o atleta já tinha enviado o mesmo arquivo pelo upload
- **THEN** nenhum treino novo é criado e o aviso fica processado apontando para o existente

#### Scenario: Arquivo corrompido
- **WHEN** o arquivo baixado não é um FIT válido
- **THEN** o aviso fica em erro com motivo, sem nova tentativa, e nada é persistido

### Requirement: Atribuição de origem Garmin
Todo lugar que mostra um treino realizado de fonte Garmin SHALL exibir "Garmin [modelo]" junto ao
título do treino, visível sem interação, ou "Garmin" quando o modelo é desconhecido: card do treino
de hoje (antes e depois do feedback), lista de treinos do atleta, lista de treinos recentes do
treinador e detalhe do treino. Treinos de outras fontes SHALL NOT exibir atribuição Garmin.

#### Scenario: Card de hoje
- **WHEN** o atleta vê o card do treino realizado de hoje vindo do Garmin
- **THEN** "Garmin Forerunner 970" aparece abaixo ou ao lado do título, não em tooltip nem em área
  recolhida

#### Scenario: Lista do treinador
- **WHEN** o treinador vê a lista de treinos recentes com três treinos Garmin
- **THEN** cada linha traz a atribuição, ou o cabeçalho a traz uma vez para a lista inteira

#### Scenario: Modelo desconhecido
- **WHEN** o Garmin não informou o modelo do dispositivo
- **THEN** o texto é "Garmin"

#### Scenario: Treino do intervals.icu
- **WHEN** o treino tem fonte intervals.icu
- **THEN** não há atribuição Garmin

### Requirement: Melhores esforços indisponíveis no canal Garmin
O atleta de canal Garmin e o treinador SHALL ver o painel de melhores esforços com a mensagem de
indisponibilidade, sem chamada ao intervals.icu, enquanto o cálculo depender do intervals.icu.

#### Scenario: Atleta Garmin abre Esforços
- **WHEN** um atleta com conexão Garmin ativa abre a aba de esforços
- **THEN** vê "Indisponível para o canal Garmin por enquanto" e nenhuma requisição ao intervals.icu
  é feita, nem pelo atleta nem pelo treinador

