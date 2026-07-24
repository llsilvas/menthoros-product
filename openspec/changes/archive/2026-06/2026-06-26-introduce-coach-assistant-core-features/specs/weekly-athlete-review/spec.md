<!-- SUPERSEDED. Spin-off do épico (2026-07-24), depois fatiado em 3 changes ativas:
     `add-weekly-review-consolidation` (backend determinístico), `add-weekly-review-llm-focus`
     (narrativa IA + insumo no plano) e `add-weekly-review-coach-card` (leitura no shell do coach).
     Esta capability NÃO foi implementada dentro deste épico — só a decomposição foi arquivada.
     Mantido aqui só como registro histórico. -->

## ADDED Requirements

### Requirement: Consolidar revisão semanal do atleta
O sistema SHALL gerar uma revisão semanal estruturada por atleta, consolidando aderência, carga, fadiga, evolução e foco recomendado para a semana seguinte.

#### Scenario: Semana com dados suficientes
- **WHEN** o atleta possuir treinos e métricas suficientes na semana
- **THEN** a revisão SHALL resumir carga realizada, aderência e sinais de evolução ou risco

#### Scenario: Semana com baixa aderência
- **WHEN** o atleta tiver baixa execução do plano ou ausência de treinos-chave
- **THEN** a revisão SHALL explicitar a baixa aderência e seu impacto na sequência

### Requirement: Revisão semanal deve alimentar a próxima prescrição
O sistema SHALL disponibilizar o resultado da revisão semanal como insumo para ajuste ou geração do próximo plano.

#### Scenario: Geração da próxima semana
- **WHEN** o próximo plano semanal for gerado
- **THEN** o sistema SHALL poder consumir a revisão semanal mais recente como contexto relevante
