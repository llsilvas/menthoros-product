# athlete-adherence

## Requirements

### Requirement: Aderência não conta a semana corrente inteira como planejada

As consultas de aderência usadas por `AtletaProgressServiceImpl.getAderenciaSemanal`,
`CoachDashboardServiceImpl.montarResumo` e `ProgressaoTreinoServiceImpl.calcularHistorico` SHALL
usar um teto de data (`dataTreino <= hoje`) ao contar treinos planejados no denominador — treinos
com data futura (incluindo o restante da semana corrente) SHALL NOT entrar no denominador antes de
vencerem.

#### Scenario: Treino futuro fora do denominador
- **WHEN** o atleta tem treinos planejados na semana atual com data depois de hoje
- **THEN** eles não entram no denominador da aderência

#### Scenario: Treino de hoje
- **WHEN** há um treino planejado para hoje
- **THEN** ele entra no denominador (com ou sem treino realizado vinculado)

## Non-Requirements (deferido, sem change aberta)

O desenho original desta capability incluía escopo adicional que **não foi implementado** na
entrega de `fix-adherence-count-until-today` (arquivada parcialmente em 2026-10-01, backend PR
#154) e por isso não vira requirement canônico ainda:

- Excluir treinos `DESCANSO` do denominador.
- "Hoje" resolvido pelo fuso do atleta (`AtletaHojeResolver`) nas três consultas acima — hoje usa
  `LocalDate.now(clock)` do servidor em `getAderenciaSemanal`.
- Semanas sem treino devido saírem de `aderenciaSemanal`.
- Função única `aderencia4Semanas(atleta, hoje)` e o campo correspondente no perfil do coach.
- Documentação OpenAPI dos campos de aderência.
- Comportamento do front (tooltip "Nada vencido ainda nesta semana", tela de progresso do atleta).

Ver `openspec/changes/archive/2026-10/2026-10-01-fix-adherence-count-until-today/tasks.md` para o
detalhe do que ficou de fora. Uma change futura que retomar esse escopo deve promover os
requirements correspondentes para este arquivo.
