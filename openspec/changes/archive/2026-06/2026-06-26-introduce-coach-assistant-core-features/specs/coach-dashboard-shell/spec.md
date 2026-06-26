## ADDED Requirements

### Requirement: Dashboard agregado do treinador
O sistema SHALL disponibilizar um endpoint de dashboard agregado para a tela principal do treinador, consolidando resumo do tenant, fila de atenção, roster filtrado, calendário semanal e insights do período em uma única resposta.

#### Scenario: Dashboard com dados agregados
- **WHEN** o treinador solicitar o dashboard agregado
- **THEN** o sistema SHALL retornar o resumo operacional do tenant
- **THEN** o sistema SHALL retornar a fila de atenção priorizada
- **THEN** o sistema SHALL retornar o roster paginado e filtrado
- **THEN** o sistema SHALL retornar o calendário semanal da janela solicitada
- **THEN** o sistema SHALL retornar os insights do intervalo solicitado

### Requirement: Dashboard deve aceitar filtros básicos de consulta
O sistema SHALL permitir busca textual, filtragem por status do roster, ordenação e paginação na resposta do dashboard.

#### Scenario: Busca e paginação aplicadas
- **WHEN** o treinador informar critérios de busca, status, ordenação e paginação
- **THEN** o sistema SHALL aplicar os filtros antes de montar a página do roster
- **THEN** o sistema SHALL preservar os demais blocos agregados da resposta
