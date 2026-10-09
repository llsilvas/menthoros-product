# coach-suggestion-decision-audit

Auditoria da decisão do treinador sobre `SugestaoCoach`: registrar **quem** decidiu (`reviewedBy`)
e, na rejeição, **o porquê** (`rejectionReason`).

## ADDED Requirements

### Requirement: Decisão auditada com ator

O sistema SHALL gravar, em `aprovar` e `rejeitar`, o `reviewedBy` do usuário autenticado
(security context), nunca um valor vindo do corpo da requisição.

#### Scenario: Aprovação grava o ator
- **GIVEN** um técnico autenticado aprova uma sugestão PENDING
- **WHEN** `POST .../aprovar`
- **THEN** `reviewedBy` = id do técnico autenticado e `rejectionReason` nulo

#### Scenario: Ator não é forjável pelo corpo
- **WHEN** `POST .../aprovar` com `reviewedBy` no corpo
- **THEN** `reviewedBy` gravado é o do token autenticado, não o do corpo

### Requirement: Rejeição registra o porquê

O sistema SHALL aceitar, em `rejeitar`, um `rejectionReason` opcional (texto livre) e persistí-lo;
na ausência dele, `rejectionReason` permanece nulo.

#### Scenario: Rejeição com motivo
- **GIVEN** um técnico rejeita informando `rejectionReason = "volume alto demais para a semana"`
- **WHEN** `POST .../rejeitar` com corpo
- **THEN** `rejectionReason` gravado e `reviewedBy` preenchido

#### Scenario: Rejeição sem motivo
- **GIVEN** um técnico rejeita sem corpo
- **WHEN** `POST .../rejeitar`
- **THEN** `reviewedBy` preenchido e `rejectionReason` nulo

### Requirement: Decisão visível ao coach

Quando a sugestão já foi decidida, o payload e a UI SHALL expor `reviewedBy` e, se rejeitada,
`rejectionReason`.

#### Scenario: Sugestão decidida
- **GIVEN** uma sugestão APPROVED ou REJECTED
- **WHEN** o coach abre o detalhe
- **THEN** vê quem decidiu e, se REJECTED, o motivo

## Dados

Migration aditiva `reviewed_by uuid NULL` + `rejection_reason text NULL` em `tb_sugestao_coach`
(V100, independente — sem dependência de `add-coach-suggestion-edit-delta`, que passa a vir depois).
Sem backfill. Rollback: `DROP COLUMN reviewed_by, DROP COLUMN rejection_reason` — seguro, colunas
nullable sem FK/índice.
