# coach-suggestion-edit-delta

Edição do texto (`summary`) de uma `SugestaoCoach` pendente pelo coach, com preservação do texto
original gerado pela IA e exibição do delta entre original e atual.

## ADDED Requirements

### Requirement: Edição do resumo da sugestão

O sistema SHALL permitir que um usuário com papel `TECNICO` ou `ADMIN`, no tenant da sugestão,
edite o campo `summary` de uma `SugestaoCoach` **enquanto seu status for PENDING**. A primeira
edição SHALL preservar o valor anterior de `summary` em `summaryOriginal`; edições seguintes NÃO
SHALL sobrescrever `summaryOriginal`.

#### Scenario: Primeira edição preserva o original
- **GIVEN** sugestão PENDING com `summary` = "Reduzir volume em 20%"
- **WHEN** o coach edita para "Reduzir volume em 20% nas próximas duas semanas"
- **THEN** `summaryOriginal` = "Reduzir volume em 20%", `summary` = o novo texto,
  `editadoPeloCoach = true`, `editedAt` preenchido

#### Scenario: Segunda edição não sobrescreve o original
- **GIVEN** sugestão já editada uma vez
- **WHEN** o coach edita novamente
- **THEN** `summaryOriginal` continua sendo o texto gerado pela IA, não o da edição anterior

### Requirement: Edição só em PENDING

O sistema SHALL rejeitar edição de uma sugestão que não está PENDING.

#### Scenario: Sugestão já decidida
- **GIVEN** sugestão APPROVED ou REJECTED
- **WHEN** chamado o endpoint de editar
- **THEN** o sistema retorna 422 e nenhum campo muda

### Requirement: Isolamento por tenant

O sistema SHALL aplicar a mesma checagem de tenant dos demais endpoints de `SugestaoCoach` à
edição.

#### Scenario: Sugestão de outro tenant
- **GIVEN** usuário autenticado no tenant A
- **WHEN** chama o endpoint de editar para uma sugestão do tenant B
- **THEN** o sistema retorna 404

### Requirement: Concorrência segura, incluindo aba desatualizada

O sistema SHALL detectar tanto edições/decisões concorrentes quanto uma decisão tomada sobre uma
versão da sugestão que já mudou desde que o cliente a leu, e rejeitar a que está desatualizada em
vez de mutar silenciosamente. Editar, aprovar e rejeitar SHALL aceitar um identificador de versão
esperada opcional, comparado antes de mutar.

#### Scenario: Duas edições simultâneas
- **GIVEN** duas edições concorrentes na mesma sugestão
- **WHEN** a segunda chega depois da primeira já ter commitado
- **THEN** o sistema retorna 409 e a primeira edição permanece intacta

#### Scenario: Decisão sobre aba desatualizada
- **GIVEN** um cliente que leu a sugestão numa versão anterior à atual (outra edição já comitou)
- **WHEN** ele chama aprovar ou rejeitar informando a versão que leu
- **THEN** o sistema retorna 409 em vez de decidir sobre conteúdo que o cliente nunca viu

### Requirement: Delta visível ao coach

Quando uma sugestão tiver sido editada, a resposta da API e a UI SHALL expor tanto o texto
original quanto o atual, e a UI SHALL destacar a diferença entre eles.

#### Scenario: Sugestão nunca editada
- **GIVEN** sugestão sem edição
- **WHEN** o coach abre o detalhe
- **THEN** vê só o texto atual, sem seção de original nem diff

#### Scenario: Sugestão editada
- **GIVEN** sugestão editada
- **WHEN** o coach abre o detalhe
- **THEN** vê o texto original e o atual, com as palavras diferentes destacadas
