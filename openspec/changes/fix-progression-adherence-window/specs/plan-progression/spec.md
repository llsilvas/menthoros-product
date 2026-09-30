# plan-progression

## ADDED Requirements

### Requirement: Aderência da progressão em semanas fechadas
A aderência usada pelo motor de progressão SHALL ser calculada sobre as 3 semanas ISO fechadas antes da
atual (fuso do atleta): treinos planejados cumpridos (com realizado vinculado) sobre cumpridos mais faltas.
`DESCANSO` e planejados pendentes de reconciliação (sem vínculo, com realizado avulso no mesmo dia) SHALL
ficar fora da conta.

#### Scenario: Semana em curso
- **WHEN** a semana atual está incompleta e as 3 anteriores foram cumpridas
- **THEN** a aderência é 100%, qualquer que seja o dia da geração

#### Scenario: Treinos extras
- **WHEN** há 6 planejados, 3 cumpridos e 4 realizados sem planejado na janela
- **THEN** a aderência é 50%

#### Scenario: Reconciliação pendente
- **WHEN** há 6 planejados, 3 cumpridos e 1 sem vínculo com realizado avulso no mesmo dia
- **THEN** a aderência é 60%

### Requirement: Aderência ausente não libera progressão
Sem planejado na janela, ou com pendências acima de 25% dos planejados, a aderência SHALL ser ausente; com
ela ausente, o motor SHALL NOT decidir PROGREDIR nem PROGREDIR_LEVE e SHALL decidir REDUZIR só por fadiga
(TSB < −22 ou RPE > 8,5), MANTER no restante.

#### Scenario: Sem planejado na janela
- **WHEN** não há planejado nas 3 semanas fechadas e não há fadiga
- **THEN** a decisão é MANTER

### Requirement: Histórico mínimo conta todos os realizados
O histórico mínimo para decidir (3 treinos em 21 dias) SHALL contar todos os treinos realizados, vinculados
ou não.

#### Scenario: Treinos sem vínculo
- **WHEN** há 3 treinos realizados em 21 dias sem planejado vinculado
- **THEN** o histórico não é considerado insuficiente

### Requirement: Rollback por flag
Com `menthoros.progressao.aderencia-devidos.enabled` desligada, a aderência do motor SHALL seguir a regra
anterior.

#### Scenario: Flag desligada
- **WHEN** a flag está desligada
- **THEN** a decisão é a mesma da regra anterior
