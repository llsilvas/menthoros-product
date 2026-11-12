## ADDED Requirements

### Requirement: Proposta de replanejamento do macro auditada como sugestão

A proposta de replanejamento do macrociclo SHALL ser uma `SugestaoCoach` de um tipo novo em `TipoSugestao` (hoje só PLAN_ADJUST, RECOVERY e NEW_PLAN), sujeita às mesmas regras de auditoria desta capability: `reviewedBy` do usuário autenticado e `rejectionReason` obrigatório na rejeição.

Além da decisão, o sistema SHALL registrar o delta no nível da temporada: as semanas afetadas, os valores propostos pelo motor e os valores aprovados pelo coach, quando a proposta é aceita com edição.

#### Scenario: Coach aceita a proposta editando uma semana
- **WHEN** o coach aceita a proposta de replanejamento alterando o `volumeAlvoKm` da semana 12
- **THEN** a decisão grava `reviewedBy` do token, e o delta registra o valor do motor e o valor do coach para a semana 12

#### Scenario: Coach rejeita a proposta
- **WHEN** o coach rejeita a proposta de replanejamento
- **THEN** `rejectionReason` é obrigatório e o macro permanece na versão atual
