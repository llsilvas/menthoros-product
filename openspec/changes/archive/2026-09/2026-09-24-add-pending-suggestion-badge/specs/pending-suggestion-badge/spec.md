# pending-suggestion-badge

Sinalização, no roster e no calendário semanal do coach, de quais atletas têm ao menos uma
`SugestaoCoach` no status `PENDING` — sem exigir que o coach abra o perfil individual.

## ADDED Requirements

### Requirement: Sinal agregado no roster

O sistema SHALL expor, em `GET /api/v1/coach/atletas`, se cada atleta tem ao menos uma
`SugestaoCoach` `PENDING`, resolvido com uma única consulta agregada por tenant (sem N+1).

#### Scenario: Atleta com sugestão pendente
- **GIVEN** atleta com uma `SugestaoCoach` `PENDING`
- **WHEN** o coach carrega o roster
- **THEN** `temSugestaoPendente = true` para aquele atleta

#### Scenario: Atleta sem sugestão pendente
- **GIVEN** atleta sem nenhuma `SugestaoCoach` `PENDING`
- **WHEN** o coach carrega o roster
- **THEN** `temSugestaoPendente = false`

### Requirement: Sinal real no calendário semanal

O sistema SHALL preencher `TreinoAgendado.hasPendingSuggestion` com o estado real do atleta
(hoje sempre `false`), usando a mesma fonte de dado do roster.

#### Scenario: Treino de atleta com sugestão pendente
- **GIVEN** atleta com um `TreinoPlanejado` na semana corrente e uma `SugestaoCoach` `PENDING`
- **WHEN** o coach carrega o calendário semanal
- **THEN** o `TreinoAgendado` daquele atleta tem `hasPendingSuggestion = true`

### Requirement: Isolamento por tenant

O sinal de sugestão pendente SHALL ser calculado por tenant; uma sugestão de um tenant nunca
aparece como pendente para outro.

#### Scenario: Dois tenants
- **GIVEN** roster e calendário de dois tenants diferentes
- **WHEN** cada um carrega sua própria tela
- **THEN** a sugestão `PENDING` de um tenant nunca aparece como `true` no outro

### Requirement: O sinal aponta para um caminho de acesso real

Quando o sinal indica pendência, o sistema SHALL garantir que essa `SugestaoCoach` PENDING
apareça no painel de sugestões recentes do perfil do atleta, mesmo que existam sugestões mais
recentes já decididas para o mesmo atleta.

#### Scenario: Pendência mais antiga que 3 decisões recentes
- **GIVEN** atleta com uma `SugestaoCoach` PENDING não-expirada e 3 outras sugestões mais
  recentes já decididas
- **WHEN** o coach abre o perfil desse atleta
- **THEN** a pendência aparece na lista de sugestões recentes

### Requirement: Sinal reflete decisões subsequentes

Quando a última `SugestaoCoach` `PENDING` de um atleta é decidida (aprovada ou rejeitada), o sinal
SHALL deixar de indicar pendência na próxima leitura.

#### Scenario: Após decidir a única sugestão pendente
- **GIVEN** atleta com uma única `SugestaoCoach` `PENDING`
- **WHEN** o coach aprova ou rejeita essa sugestão e o roster é recarregado
- **THEN** `temSugestaoPendente = false` para aquele atleta
