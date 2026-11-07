# coach-workout-step-editing — delta (coach-reordenar-etapas-dnd)

## ADDED Requirements

### Requirement: Reordenação de etapas por arrastar e soltar

O editor de etapas SHALL permitir reordenar os itens do nível raiz (etapa avulsa ou bloco) por
arrastar e soltar com ponteiro, mantendo as setas de mover como alternativa (e como via de teclado). Um
bloco SHALL mover-se inteiro com suas sub-etapas. A ordem resultante SHALL ser a ordem do array
enviado no PATCH, sem campo de ordem explícito.

#### Scenario: Arrastar para o topo
- **WHEN** o treinador arrasta a terceira etapa para antes da primeira
- **THEN** a lista mostra a etapa no topo e o PATCH leva as etapas nessa ordem

#### Scenario: Bloco arrastado
- **WHEN** o treinador arrasta um bloco de séries
- **THEN** o bloco muda de posição inteiro e suas sub-etapas permanecem dentro dele

#### Scenario: Setas e arrasto equivalem
- **WHEN** o treinador move a mesma etapa pela seta e, noutro editor, por arrasto
- **THEN** os dois produzem o mesmo array de etapas

#### Scenario: Soltar sem mudança
- **WHEN** o arrasto é cancelado ou a etapa é solta na mesma posição
- **THEN** a lista não muda e o form não é marcado como alterado

#### Scenario: Editor desabilitado
- **WHEN** o dialog está salvando
- **THEN** arrastar não tem efeito
