# coach-workout-step-editing — delta (coach-reordenar-etapas-dnd)

## ADDED Requirements

### Requirement: Reordenação de etapas por arrastar e soltar

O editor de etapas SHALL permitir reordenar os itens do nível raiz (etapa avulsa ou bloco) por
arrastar e soltar, por ponteiro e por teclado, mantendo as setas de mover como alternativa. Um
bloco SHALL mover-se inteiro com suas sub-etapas. A ordem resultante SHALL ser a ordem do array
enviado no PATCH, sem campo de ordem explícito.

#### Scenario: Arrastar para o topo
- **WHEN** o treinador arrasta a terceira etapa para antes da primeira
- **THEN** a lista mostra a etapa no topo e o PATCH leva as etapas nessa ordem

#### Scenario: Bloco arrastado
- **WHEN** o treinador arrasta um bloco de séries
- **THEN** o bloco muda de posição inteiro e suas sub-etapas permanecem dentro dele

#### Scenario: Editor desabilitado
- **WHEN** o dialog está salvando
- **THEN** arrastar não tem efeito
