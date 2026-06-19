## MODIFIED Requirements

### Requirement: Recuperação de violações estruturais na geração

A geração de plano SHALL recuperar-se de violações estruturais ocasionais produzidas pela LLM
(reparo determinístico ou 1 retry com feedback) antes de falhar, em vez de rejeitar o plano
inteiro na primeira violação. As **regras** de validação permanecem inalteradas.

#### Scenario: Treino estruturalmente reparável

- **WHEN** a LLM gerar um treino com violação trivial e inequívoca (ex.: `REGENERATIVO` sem desaquecimento; etapas fora de ordem; `repeticoes != 1`)
- **THEN** o sistema SHALL reparar deterministicamente (sintetizar a etapa formulaica faltante, reordenar, ou expandir)
- **AND** o reparo SHALL ser registrado em log e contado na telemetria
- **AND** o plano SHALL ser retornado com sucesso (sem 503)

#### Scenario: Violação não-reparável recuperada por retry único

- **WHEN** a validação falhar numa violação não seguramente reparável (ex.: falta a etapa PRINCIPAL, regras de intervalado)
- **THEN** o sistema SHALL re-chamar a LLM no máximo 1 vez, injetando o motivo da rejeição anterior
- **AND** se a tentativa produzir um plano válido, ele SHALL ser retornado com sucesso

#### Scenario: Recuperação esgotada

- **WHEN** o reparo não se aplicar e o retry único também falhar
- **THEN** o sistema SHALL retornar um erro de domínio claro (mapeado no `GlobalExceptionHandler`)
- **AND** o log e a telemetria SHALL registrar o motivo estrutural e a falha final

#### Scenario: Regras de validação preservadas

- **WHEN** um plano válido for gerado
- **THEN** ele SHALL satisfazer exatamente as mesmas regras estruturais de antes (ex.: `REGENERATIVO` com 3 etapas na ordem canônica)
- **AND** nenhuma regra SHALL ser relaxada para facilitar a recuperação
