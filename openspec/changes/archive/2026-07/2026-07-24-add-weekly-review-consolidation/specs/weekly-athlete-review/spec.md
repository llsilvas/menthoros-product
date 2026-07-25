## ADDED Requirements

### Requirement: Gerar a revisão no encerramento da semana, ancorada ao PlanoSemanal
O sistema SHALL gerar uma `RevisaoSemanal` 1:1 com o `PlanoSemanal` quando este é encerrado (`CONCLUIDO`), congelando o sinal determinístico do que foi proposto ao coach.

#### Scenario: Encerramento gera a revisão
- **WHEN** um `PlanoSemanal` transiciona para `CONCLUIDO` via `EncerramentoSemanaService`
- **THEN** o sistema SHALL criar uma `RevisaoSemanal` associada, com `recommendationType`, `adherenceStatus`, `dadosSuficientes` e `geradaEm`

#### Scenario: Antes do encerramento não há revisão
- **WHEN** o `PlanoSemanal` ainda não está `CONCLUIDO`
- **THEN** a consulta da revisão SHALL retornar HTTP 404 com corpo vazio

#### Scenario: Re-encerramento é idempotente
- **WHEN** o encerramento roda novamente para o mesmo `PlanoSemanal`
- **THEN** o sistema SHALL fazer upsert por `plano_semanal_id`, sem duplicar

### Requirement: Aderência por contagem na janela do plano
O sistema SHALL derivar `adherenceStatus` da contagem de treinos realizados/planejados na janela exata do `PlanoSemanal` — métrica distinta do `aderenciaPercentual` do roster (rolante de 4 semanas).

#### Scenario: Cortes de aderência
- **WHEN** a revisão é gerada, contando realizados/planejados na janela exata `[semanaInicio, semanaFim]` do `PlanoSemanal`
- **THEN** `adherenceStatus` SHALL ser `ALTA` se `≥ 90%`, `MEDIA` se entre 60% e 89%, e `BAIXA` se `< 60%` OU se ≥1 treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) ficar sem realizado

### Requirement: recommendationType determinístico sobre tsb_fim
O sistema SHALL derivar `recommendationType` de `adherenceStatus`, `dadosSuficientes` e `PlanoSemanal.tsb_fim`.

#### Scenario: RECOVERY
- **WHEN** `tsb_fim ≤ −25` OU (`adherenceStatus = BAIXA` E `tsb_fim ≤ −10`)
- **THEN** `recommendationType` SHALL ser `RECOVERY`

#### Scenario: PROGRESS
- **WHEN** `adherenceStatus = ALTA` E `tsb_fim ≥ −10` E `dadosSuficientes = true` E nenhum treino crítico ficou sem realizado
- **THEN** `recommendationType` SHALL ser `PROGRESS`

#### Scenario: MAINTAIN é o default
- **WHEN** a semana não satisfizer RECOVERY nem PROGRESS
- **THEN** `recommendationType` SHALL ser `MAINTAIN`

#### Scenario: TSB ausente cai em MAINTAIN
- **WHEN** `PlanoSemanal.tsb_fim` for nulo
- **THEN** `dadosSuficientes` SHALL ser `false`
- **THEN** os ramos numéricos (RECOVERY/PROGRESS) SHALL NOT se aplicar e `recommendationType` SHALL ser `MAINTAIN`

#### Scenario: Dados insuficientes bloqueiam progressão
- **WHEN** a janela possuir <2 treinos realizados OU nenhum ponto de PMC/TSB válido
- **THEN** `dadosSuficientes` SHALL ser `false`
- **THEN** `recommendationType` SHALL NOT ser `PROGRESS`

### Requirement: Sinal congelado — fidelidade a mudança de regra
O sistema SHALL persistir o sinal derivado no momento da geração e NÃO recalculá-lo na leitura.

#### Scenario: Leitura devolve o valor persistido, sem recomputar
- **WHEN** o `recommendationType` persistido de uma revisão contradiz o que a regra atual produziria para aquele `PlanoSemanal`
- **THEN** a leitura SHALL devolver o valor persistido (congelado no encerramento), sem recomputar

### Requirement: Delta semana-a-semana computado
O sistema SHALL computar `weekOverWeekDelta` na leitura, contra o `PlanoSemanal` anterior do atleta.

#### Scenario: Existe semana anterior
- **WHEN** existir um `PlanoSemanal` anterior do atleta
- **THEN** `weekOverWeekDelta` SHALL conter Δaderência, ΔTSB e a transição de `recommendationType`

#### Scenario: Não existe semana anterior
- **WHEN** não existir `PlanoSemanal` anterior
- **THEN** `weekOverWeekDelta` SHALL indicar `PRIMEIRA_SEMANA` (nulo), sem erro

### Requirement: Leitura coach-only sob isolamento multi-tenant
O sistema SHALL expor a revisão por endpoint read-only restrito ao treinador, sempre sob `TenantContext`, nunca ao atleta.

#### Scenario: Revisão não vaza entre tenants
- **WHEN** revisões de tenants distintos existirem
- **THEN** cada consulta SHALL retornar apenas revisões do tenant corrente

#### Scenario: Endpoint restrito ao treinador
- **WHEN** a revisão é consultada
- **THEN** o acesso SHALL exigir papel `TECNICO`/`ADMIN`, negado ao atleta
