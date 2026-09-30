# design-system

## ADDED Requirements

### Requirement: Variante `solid` do componente `Card`

O sistema SHALL prover uma terceira variante `solid` do `Card` compartilhado (além de `flat` e
`glass`, de `standardize-card-foundation`), com borda sólida `surface[700]` em vez da translúcida
`content.cardBorder` usada por `flat`, e uma prop `surfaceLevel: 'card' | 'panel'` (default `'card'`)
que escolhe o token de fundo.

Esta variante formaliza uma receita que já existia, por cópia, em ~10 componentes de
`features/athlete` antes desta change (`ReadinessCard`, `WeekOverviewCard`, `ProgressBlockCard`,
`TodayHeroCard`, `TodayCompletedCard`, `TodaySkippedCard`, `TodayFeedbackCard`, `FitUploadResultCard`,
`IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard`) — não é uma variante nova de design, é a
consolidação de uma já em uso.

#### Scenario: Variante solid, surfaceLevel default
- **WHEN** um componente renderiza `<Card variant="solid">`
- **THEN** o fundo é `elevation.card`
- **AND** a borda é `1px solid surface[700]`
- **AND** o raio é `radius.lg`

#### Scenario: Variante solid com surfaceLevel="panel"
- **WHEN** um componente renderiza `<Card variant="solid" surfaceLevel="panel">`
- **THEN** o fundo é `elevation.panel` (mais recuado que `elevation.card`) — usado pela família
  "hero" da Home do atleta (`TodayHeroCard` e os três estados de resultado do dia)
- **AND** a borda continua `1px solid surface[700]`

#### Scenario: Override de sx tem precedência sobre a receita da variante
- **WHEN** um componente renderiza `<Card variant="solid" sx={{ border: 'none', borderRadius: 1 }}>`
- **THEN** o `sx` do consumidor sobrescreve a borda e o raio da variante — usado por componentes que
  usam o mesmo token de fundo `elevation.card` mas nunca tiveram borda (`FitUploadResultCard`,
  `IntervalsIcuConnectionCard`, `PostWorkoutFeedbackCard`)

## MODIFIED Requirements

### Requirement: Componente `Card` compartilhado

O sistema SHALL prover um componente `Card` reutilizável com as variantes `flat`, `glass` e `solid`,
aplicando fundo, borda, raio e sombra a partir dos tokens de design, sem que o componente consumidor
precise declarar esses valores.

(Os cenários de `flat`, `glass`, hover, `stateColor`, landmark de acessibilidade e padding definidos em
`standardize-card-foundation` continuam valendo sem alteração — esta change só adiciona a variante
`solid`, descrita acima, e amplia a lista de variantes suportadas de duas para três.)
