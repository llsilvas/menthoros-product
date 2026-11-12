## ADDED Requirements

### Requirement: Inbox dá a maior parte da altura ao conteúdo do atleta em notebook

Em janela de altura até 800px, a área rolável do detalhe do atleta no inbox do treinador SHALL ocupar
pelo menos 55% da altura em 1366×625 e em 1280×600, e pelo menos 45% em 1093×500, com lista e detalhe
lado a lado, CTA primário visível sem rolar e sem rolagem horizontal.

#### Scenario: Notebook 1366×768 com Chrome maximizado
- **WHEN** o viewport é 1366×625 e um atleta está selecionado
- **THEN** a área rolável do detalhe ocupa pelo menos 55% da altura da janela
- **AND** o CTA primário está visível sem rolar

#### Scenario: Notebook 1280×720 com Chrome maximizado
- **WHEN** o viewport é 1280×600 e um atleta está selecionado
- **THEN** a área rolável do detalhe ocupa pelo menos 55% da altura da janela
- **AND** lista e detalhe ficam lado a lado, sem rolagem horizontal

#### Scenario: Mesma tela com escala de 125%
- **WHEN** o viewport é 1093×500 e um atleta está selecionado
- **THEN** a área rolável do detalhe ocupa pelo menos 45% da altura da janela

#### Scenario: Erro do dashboard não come a altura do detalhe
- **WHEN** o viewport é 1366×625 e o carregamento do dashboard falha
- **THEN** o aviso de erro ocupa uma linha
- **AND** a área rolável do detalhe continua com pelo menos 55% da altura da janela

#### Scenario: Triagem preservada em tela muito baixa
- **WHEN** a janela tem altura até 600px
- **THEN** a contagem "em atenção" continua visível na barra do topo

#### Scenario: Desktop inalterado
- **WHEN** o viewport é 1440×900
- **THEN** nenhum texto visível fica abaixo de 11px e a página não rola na horizontal

### Requirement: Decisão sobre o plano funciona em notebook

Nos viewports de notebook, o treinador SHALL conseguir aprovar e rejeitar o plano aguardando revisão
pelo cabeçalho do atleta, sem rolar a página.

#### Scenario: Aprovar em notebook
- **WHEN** o viewport é 1366×625 ou 1093×500, há plano aguardando revisão e o treinador clica no CTA
- **THEN** a aprovação é enviada e a lista atualiza

#### Scenario: Rejeitar em notebook
- **WHEN** o viewport é 1366×625 ou 1093×500, há plano aguardando revisão e o treinador rejeita com
  motivo
- **THEN** a rejeição é enviada

### Requirement: Legenda dos KPIs do atleta continua acessível no modo compacto

Quando a legenda de um KPI do atleta é ocultada pelo modo compacto, ela SHALL continuar exposta ao
leitor de tela, e SHALL aparecer em tooltip no hover e no foco.

> **Decisão pendente (CA8, task 0.1d).** Hoje a legenda fica no `title` nativo e em texto
> visualmente oculto. Se a decisão for não exigir o foco por teclado, o cenário "Foco num KPI
> compacto" sai e este requisito fica só com o leitor de tela.

#### Scenario: Leitor de tela
- **WHEN** um KPI do atleta tem legenda e está em modo compacto
- **THEN** o leitor de tela lê valor, rótulo e legenda

#### Scenario: Foco num KPI compacto
- **WHEN** o treinador foca pelo teclado um KPI do atleta com legenda
- **THEN** a legenda do KPI aparece em tooltip
