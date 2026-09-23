# coach-suggestion-decision-audit

Auditoria da decisão do treinador sobre `SugestaoCoach`: registrar **quem** decidiu (`reviewedBy`)
e, na rejeição, **o porquê** (`motivoRejeicao`).

## ADDED Requirements

### Requirement: Decisão auditada com ator

O sistema SHALL gravar, em `aprovar` e `rejeitar`, o `reviewedBy` do usuário autenticado
(security context), nunca um valor vindo do corpo da requisição.

#### Scenario: Aprovação grava o ator
- **GIVEN** um técnico autenticado aprova uma sugestão PENDING
- **WHEN** `POST .../aprovar`
- **THEN** `reviewedBy` = id do técnico autenticado e `motivoRejeicao` nulo

#### Scenario: Ator não é forjável pelo corpo
- **WHEN** `POST .../aprovar` com `reviewedBy` no corpo
- **THEN** `reviewedBy` gravado é o do token autenticado, não o do corpo

### Requirement: Rejeição registra o porquê

O sistema SHALL aceitar, em `rejeitar`, um `motivoRejeicao` opcional (texto livre) e persistí-lo;
na ausência dele, `motivoRejeicao` permanece nulo.

#### Scenario: Rejeição com motivo
- **GIVEN** um técnico rejeita informando `motivoRejeicao = "volume alto demais para a semana"`
- **WHEN** `POST .../rejeitar` com corpo
- **THEN** `motivoRejeicao` gravado e `reviewedBy` preenchido

#### Scenario: Rejeição sem motivo
- **GIVEN** um técnico rejeita sem corpo
- **WHEN** `POST .../rejeitar`
- **THEN** `reviewedBy` preenchido e `motivoRejeicao` nulo

### Requirement: Decisão visível ao coach

Quando a sugestão já foi decidida, o payload e a UI SHALL expor `reviewedBy` e, se rejeitada,
`motivoRejeicao`.

#### Scenario: Sugestão decidida
- **GIVEN** uma sugestão APPROVED ou REJECTED
- **WHEN** o coach abre o detalhe
- **THEN** vê quem decidiu e, se REJECTED, o motivo

## Dados

Migration aditiva `reviewed_by uuid NULL` + `motivo_rejeicao text NULL` em `tb_sugestao_coach`,
sequenciada após a migration de `add-coach-suggestion-edit-delta`. Sem backfill. Rollback: reverter
código; colunas ficam inertes.
