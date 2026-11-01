# fit-historico-treinador-ui

Seção do perfil do atleta onde o treinador envia vários arquivos `.fit` em fila.

## ADDED Requirements

### Requirement: Fila sequencial com progresso e resumo

A seção "Importar histórico" SHALL enviar os arquivos selecionados um por vez, mostrar o progresso
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

A seção SHALL exibir o aviso de que o treinador deve ter autorização do atleta para carregar os
dados. Ao concluir, o resumo SHALL mostrar o período coberto (treino mais antigo, mais recente e
número de semanas) e que a importação não tem desfazer.

#### Scenario: Abertura da seção
- **GIVEN** o treinador no perfil do atleta
- **WHEN** abre "Importar histórico"
- **THEN** vê o aviso de autorização e a orientação de como obter os arquivos

#### Scenario: Importação concluída
- **GIVEN** uma importação concluída
- **WHEN** o resumo é exibido
- **THEN** mostra o período coberto e a nota de que não há desfazer
