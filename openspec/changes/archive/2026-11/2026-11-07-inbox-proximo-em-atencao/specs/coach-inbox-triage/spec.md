# coach-inbox-triage — delta (inbox-proximo-em-atencao)

## ADDED Requirements

### Requirement: Fluxo de triagem pela fila de atenção

O detalhe de um atleta com sinal SHALL oferecer, ao fim do Diagnóstico, a passagem para o próximo
atleta com sinal entre as linhas visíveis da lista, na ordem da fila; no último, SHALL dizer que a
fila acabou, sem circular. A tecla `N` SHALL fazer o mesmo quando não há modificador, o foco não
está num campo de texto e nenhum dialog está aberto. As setas `↑`/`↓` com foco numa linha da lista
SHALL mover foco e seleção para a linha vizinha renderizada; nas bordas nada acontece.

#### Scenario: Próximo pelo link
- **WHEN** a fila tem A, B e C, A está selecionado e o treinador aciona "Próximo em atenção → B"
- **THEN** B fica selecionado e o Diagnóstico mostra o sinal de B

#### Scenario: Fim da fila
- **WHEN** C, o último da fila, está selecionado
- **THEN** o Diagnóstico diz que a fila acabou e não oferece link

#### Scenario: Linha escondida pela busca
- **WHEN** a busca esconde B e A está selecionado
- **THEN** o próximo oferecido é C

#### Scenario: Tecla N com dialog aberto
- **WHEN** o dialog de rejeição está aberto e o treinador pressiona `N`
- **THEN** a seleção não muda

#### Scenario: Tecla N num campo de texto
- **WHEN** o foco está no campo de busca e o treinador digita "n"
- **THEN** a letra entra no campo e a seleção não muda

#### Scenario: Setas na lista
- **WHEN** o foco está na segunda linha e o treinador pressiona `↓`
- **THEN** a terceira linha recebe o foco e fica selecionada

### Requirement: Prova no cabeçalho só quando existe

O cabeçalho do atleta SHALL mostrar o bloco de próxima prova apenas quando o perfil carregou com
sucesso e há prova; sem prova, carregando ou em erro, SHALL NOT mostrar nada no lugar.

#### Scenario: Sem prova
- **WHEN** o perfil do atleta selecionado carregou e não tem prova cadastrada
- **THEN** não há bloco de próxima prova nem texto no lugar dele

#### Scenario: Perfil carregando
- **WHEN** o perfil do atleta selecionado ainda está carregando
- **THEN** não há bloco de próxima prova
