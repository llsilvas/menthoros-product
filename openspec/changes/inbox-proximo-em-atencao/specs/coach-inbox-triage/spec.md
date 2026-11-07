# coach-inbox-triage — delta (inbox-proximo-em-atencao)

## ADDED Requirements

### Requirement: Fluxo de triagem pela fila de atenção

O detalhe de um atleta com sinal SHALL oferecer, ao fim do Diagnóstico, a passagem para o próximo
atleta da fila de atenção na ordem da fila; no último, SHALL dizer que a fila acabou. A tecla `N`
SHALL fazer o mesmo quando o foco não está num campo de texto nem num dialog. As setas `↑`/`↓`
com foco numa linha da lista SHALL mover foco e seleção para a linha vizinha.

#### Scenario: Próximo pelo link
- **WHEN** a fila tem A, B e C, A está selecionado e o treinador aciona "Próximo em atenção → B"
- **THEN** B fica selecionado e o Diagnóstico mostra o sinal de B

#### Scenario: Fim da fila
- **WHEN** C, o último da fila, está selecionado
- **THEN** o Diagnóstico diz que a fila acabou e não oferece link

#### Scenario: Tecla N num campo de texto
- **WHEN** o foco está no campo de busca e o treinador digita "n"
- **THEN** a letra entra no campo e a seleção não muda

#### Scenario: Setas na lista
- **WHEN** o foco está na segunda linha e o treinador pressiona `↓`
- **THEN** a terceira linha recebe o foco e fica selecionada

### Requirement: Prova no cabeçalho só quando existe

O cabeçalho do atleta SHALL mostrar o bloco de próxima prova apenas quando há prova; sem prova, a
linha de contexto do atleta SHALL oferecer um link para cadastrar a prova.

#### Scenario: Sem prova
- **WHEN** o atleta selecionado não tem prova cadastrada
- **THEN** não há bloco de próxima prova e a linha de contexto tem o link "cadastrar prova"
