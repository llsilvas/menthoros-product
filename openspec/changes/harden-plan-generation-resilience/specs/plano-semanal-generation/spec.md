## MODIFIED Requirements

### Requirement: Recuperação de violações estruturais na geração de plano

A geração de plano semanal SHALL recuperar-se de violações estruturais ocasionais
produzidas pela LLM (reparo determinístico ou retry com feedback) antes de falhar,
em vez de rejeitar o plano inteiro na primeira violação. As **regras** de validação
permanecem inalteradas — muda apenas o comportamento de recuperação.

#### Scenario: Treino estruturalmente reparável

- **WHEN** a LLM gera um treino com uma violação estrutural trivial e inequívoca
  (ex.: `REGENERATIVO` com 2 etapas, faltando o desaquecimento)
- **THEN** o sistema sintetiza a etapa faltante a partir das regras de domínio
- **AND** o reparo é registrado em log e contado na telemetria
- **AND** o plano é retornado com sucesso (sem 503)

#### Scenario: Violação não-reparável recuperada por retry

- **WHEN** a validação falha numa violação que não é seguramente reparável
- **THEN** o sistema re-chama a LLM, injetando no prompt o motivo da rejeição anterior
- **AND** o número de tentativas respeita um teto configurado (com backoff)
- **AND** se uma tentativa produz um plano válido, ele é retornado com sucesso

#### Scenario: Tentativas esgotadas

- **WHEN** o reparo não se aplica e todas as tentativas de retry falham na validação
- **THEN** o sistema retorna um erro de domínio claro (mapeado no `GlobalExceptionHandler`)
- **AND** o log registra o motivo estrutural e o número de tentativas
- **AND** a falha final é contada na telemetria

#### Scenario: Regras de validação preservadas

- **WHEN** um plano válido é gerado
- **THEN** ele continua satisfazendo exatamente as mesmas regras estruturais de antes
  (ex.: `REGENERATIVO` com 3 etapas, triângulo pace×distância×duração coerente)
- **AND** nenhuma regra é relaxada para "facilitar" a recuperação
