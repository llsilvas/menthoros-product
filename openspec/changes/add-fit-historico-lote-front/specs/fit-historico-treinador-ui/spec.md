# fit-historico-treinador-ui

Dialog onde o treinador envia vários arquivos `.fit` de um atleta em fila, aberto da lista de
atletas ou do perfil.

## ADDED Requirements

### Requirement: Pontos de entrada

O dialog "Importar histórico" SHALL abrir pelo menu "Ações" da lista de atletas e por um botão no
cabeçalho do perfil do atleta, sempre vinculado ao atleta escolhido. Ao fechar após uma importação,
a tela de origem SHALL recarregar os dados do atleta.

#### Scenario: Pela lista de atletas
- **GIVEN** o treinador em `/coach/athletes`
- **WHEN** abre o menu "Ações" de um atleta e escolhe "Importar histórico .fit"
- **THEN** o dialog abre para aquele atleta

#### Scenario: Pelo perfil
- **GIVEN** o treinador no perfil de um atleta
- **WHEN** aciona o botão "Importar histórico" no cabeçalho
- **THEN** o dialog abre para aquele atleta

### Requirement: Fila sequencial com progresso e resumo

O dialog "Importar histórico" SHALL enviar os arquivos selecionados um por vez, mostrar o progresso
"n de N" e, ao final, mostrar quantos foram importados, quantos já existiam e quais falharam, com
nome do arquivo e motivo. Erro em um arquivo SHALL NOT interromper a fila.

#### Scenario: Trinta arquivos selecionados
- **GIVEN** 30 arquivos `.fit` selecionados
- **WHEN** o treinador inicia a importação
- **THEN** os arquivos são enviados em sequência, a tela mostra "n de 30" e o resumo final lista
  importados, já existentes e com erro

#### Scenario: Arquivo inválido no meio da fila
- **GIVEN** um arquivo inválido entre os selecionados
- **WHEN** o servidor responde 422 para ele
- **THEN** a fila continua e o resumo lista o arquivo com o motivo

### Requirement: Aviso de autorização e período coberto

O dialog SHALL exibir, antes do seletor de arquivos, o aviso de que o treinador deve ter autorização
do atleta para carregar os dados e a nota de que a importação não tem desfazer. Ao concluir, o
resumo SHALL mostrar o período coberto (treino mais antigo, mais recente e número de semanas) e
repetir que a importação não tem desfazer.

#### Scenario: Abertura do dialog
- **GIVEN** o treinador abriu "Importar histórico" para um atleta
- **WHEN** o dialog é exibido
- **THEN** vê, acima do seletor, o aviso de autorização, a nota de sem desfazer e a orientação de
  como obter os arquivos

#### Scenario: Importação concluída
- **GIVEN** uma importação concluída
- **WHEN** o resumo é exibido
- **THEN** mostra o período coberto e a nota de que não há desfazer

### Requirement: Pré-voo da seleção

A lista de arquivos selecionados SHALL marcar como ignorado todo arquivo que não seja `.fit` e SHALL
excluí-lo da fila. O botão de envio SHALL mostrar a contagem dos arquivos que serão enviados e SHALL
ficar desabilitado quando não houver arquivo válido.

#### Scenario: Arquivo que não é .fit na seleção
- **GIVEN** uma seleção com 41 `.fit` e 1 `.gpx`
- **WHEN** a lista é exibida
- **THEN** o `.gpx` aparece como ignorado e o botão mostra "Importar 41 arquivos"

#### Scenario: Nenhum arquivo válido
- **GIVEN** uma seleção sem nenhum `.fit`
- **WHEN** a lista é exibida
- **THEN** o botão de envio fica desabilitado

### Requirement: Cancelar e tentar de novo

Enquanto houver arquivo em envio, o dialog SHALL NOT permitir fechar. Cancelar SHALL interromper a
fila após o arquivo em envio, preservando os já importados, e SHALL levar ao resumo. O resumo SHALL
oferecer reenviar apenas os arquivos com erro.

#### Scenario: Cancelar no meio da fila
- **GIVEN** 17 de 42 arquivos enviados
- **WHEN** o treinador aciona "Cancelar restante"
- **THEN** o arquivo 17 termina, nenhum outro é enviado e o resumo mostra os 17

#### Scenario: Tentar os com erro
- **GIVEN** o resumo com 2 arquivos com erro
- **WHEN** o treinador aciona "Tentar os 2 com erro"
- **THEN** só esses 2 arquivos voltam para a fila
