# Spec delta: athlete-workout-analysis

> A consulta de análise do atleta passa a devolver um veredito determinístico de aderência ao
> plano, e o front o exibe como chip.

## ADDED Requirement: Veredito determinístico de aderência ao plano

A consulta de análise do atleta DEVE incluir `veredito` (`DENTRO_DO_PLANO | ABAIXO_DO_PLANO |
ACIMA_DO_PLANO | ESFORCO_ACIMA_DO_ESPERADO`), calculado no backend sem LLM a partir de executado
vs. planejado, tanto em `PENDING` quanto em `COMPLETED`. O campo DEVE estar ausente quando não há
planejado vinculado ou nenhum par de valores é comparável.

#### Scenario: Treino como planejado
- **Given** planejado 30 min / 4,0 km / RPE 5 e executado 29 min / 4,0 km / RPE 5
- **Then** `veredito = DENTRO_DO_PLANO`

#### Scenario: Esforço elevado tem precedência
- **Given** planejado 30 min / RPE 5 e executado 22 min / RPE 7
- **Then** `veredito = ESFORCO_ACIMA_DO_ESPERADO`

#### Scenario: Volume abaixo
- **Given** planejado 60 min e executado 45 min, RPE igual ao esperado
- **Then** `veredito = ABAIXO_DO_PLANO`

#### Scenario: Volume acima
- **Given** planejado 8,0 km e executado 10,0 km, RPE igual ao esperado
- **Then** `veredito = ACIMA_DO_PLANO`

#### Scenario: Sem planejado
- **Given** um realizado sem planejado vinculado
- **Then** o JSON não contém `veredito`

#### Scenario: Campo ausente
- **Given** planejado sem distância e executado com distância
- **Then** a distância é ignorada e o veredito sai de duração e RPE

#### Scenario: Desvio misto é tratado como acima
- **Given** planejado 60 min / 10,0 km e executado 75 min / 8,0 km, RPE igual ao esperado
- **Then** `veredito = ACIMA_DO_PLANO` (duração 25% acima do planejado; o excesso em uma dimensão
  prevalece sobre o déficit em outra)

#### Scenario: Dado incompleto não garante dentro do plano
- **Given** planejado 60 min / 10,0 km, executado 60 min (dentro da tolerância) sem distância
  registrada, RPE igual ao esperado
- **Then** o JSON não contém `veredito` (a dimensão planejada sem contrapartida executada não conta
  como cumprida)

## ADDED Requirement: Chip de veredito no card do treino

O front DEVE exibir o veredito como chip com ponto e rótulo em PT-BR, derivando rótulo e cor apenas
do enum recebido, sem recalcular limiares. `DENTRO_DO_PLANO` usa o tom de sucesso; os demais, o tom
de alerta. Sem `veredito`, nenhum chip é renderizado.

#### Scenario: Home com análise pendente
- **Given** estado `FEITO` com análise `PENDING` e `veredito = DENTRO_DO_PLANO`
- **Then** o chip "Dentro do plano" aparece na linha de "Treino feito" antes de o texto da IA chegar

#### Scenario: Sem duplicação
- **Given** a Home, onde o chip está no cabeçalho do `TodayCompletedCard`
- **Then** o `WorkoutAnalysisCard` embutido não renderiza um segundo chip
