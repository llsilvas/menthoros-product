# plan-progression

## Requirements

### Requirement: Aderência da progressão em semanas fechadas
A aderência usada pelo motor de progressão SHALL ser calculada sobre as 3 semanas ISO fechadas antes da
atual (fuso do atleta): treinos planejados cumpridos (com realizado vinculado **que conta na carga** —
não cancelado) sobre cumpridos mais faltas. `DESCANSO` SHALL ficar fora da conta; planejados pendentes de
reconciliação (sem vínculo, com realizado avulso no mesmo dia **ainda sem triagem humana de
não-correspondência**) também.

#### Scenario: Semana em curso
- **WHEN** a semana atual está incompleta e as 3 anteriores foram cumpridas
- **THEN** a aderência é 100%, qualquer que seja o dia da geração

#### Scenario: Treinos extras
- **WHEN** há 6 planejados, 3 cumpridos e 4 realizados sem planejado na janela
- **THEN** a aderência é 50%

#### Scenario: Reconciliação pendente
- **WHEN** há 6 planejados, 3 cumpridos e 1 sem vínculo com realizado avulso no mesmo dia, ainda não
  triado pelo coach
- **THEN** a aderência é 60%

#### Scenario: Vínculo cancelado não conta como cumprido
- **WHEN** um planejado está vinculado a um realizado com sincronização cancelada
- **THEN** ele conta como falta, não como cumprido

#### Scenario: Triagem humana resolve a pendência
- **WHEN** um planejado sem vínculo tem um realizado avulso no mesmo dia que um coach já confirmou
  manualmente não corresponder a nenhum planejamento
- **THEN** o planejado conta como falta, não como pendência

#### Scenario: Classificação automática não resolve a pendência
- **WHEN** um planejado sem vínculo tem um realizado avulso no mesmo dia que o motor de matching
  automático classificou como não-correspondente, sem nenhuma revisão humana
- **THEN** o planejado continua pendente, fora da conta

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

## Non-Requirements (deferido, sem change aberta)

A seção 3 (Pós-deploy) de `fix-progression-adherence-window` — aceitação sem edição de volume do
`WeekSuggestion` medida 4 semanas antes vs. 4 depois do deploy, e a change de limpeza que remove a
flag e a regra antiga após 4 semanas estáveis — não foi executada por depender de tempo em produção.
Ver `openspec/changes/archive/2026-10/2026-10-01-fix-progression-adherence-window/tasks.md` (seção 3)
para o critério de rollback.
