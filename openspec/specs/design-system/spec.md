
### Requirement: Token único de raio de borda para os cards do app
O sistema SHALL expor um único export chamado `radius` para os componentes de card do app
(coach/atleta), sem um segundo export com o mesmo nome e formato divergente nessa árvore.

#### Scenario: Import sem ambiguidade
- **WHEN** um componente de card em `shared/components`, `features/coach`, `features/athlete`,
  `pages/home`, `pages/reconciliacao` ou `components/features/planos` importa `radius`
- **THEN** existe exatamente uma definição de `radius` para esses componentes, em
  `shared/design-tokens/density.ts`
- **AND** `theme/tokens.ts` não define um segundo `radius`

#### Scenario: Landing fica fora do escopo
- **WHEN** um componente em `src/landing/` importa `radius` de `theme/theme.premium.ts`
- **THEN** esse import não é afetado — a landing é um sistema de design separado, com seu próprio
  `radius` (`sharp/inner/outer/pill`)

### Requirement: Componente `Card` compartilhado
O sistema SHALL prover um componente `Card` reutilizável com as variantes `flat`, `glass` e `solid`,
aplicando fundo, borda, raio e sombra a partir dos tokens de design, sem que o componente consumidor
precise declarar esses valores.

#### Scenario: Variante flat
- **WHEN** um componente renderiza `<Card variant="flat">`
- **THEN** o fundo é `elevation.card`
- **AND** a borda é `1px solid content.cardBorder`
- **AND** o raio é `radius.lg`
- **AND** não há `boxShadow`

#### Scenario: Variante glass
- **WHEN** um componente renderiza `<Card variant="glass">`
- **THEN** fundo, borda e sombra vêm do token `glassSx`, sem override manual no consumidor

#### Scenario: Hover só quando interativo
- **WHEN** `<Card>` é renderizado sem `interactive` e sem `onClick`
- **THEN** nenhum estilo de `:hover` é aplicado
- **WHEN** `<Card interactive>` ou `<Card onClick={fn}>` é renderizado
- **THEN** `cursor: pointer` e um estilo de `:hover` são aplicados

#### Scenario: Estado semântico via stateColor
- **WHEN** `<Card stateColor="success">` (ou `"danger"`) é renderizado
- **THEN** a borda usa 2px na cor semântica e o fundo usa a mesma cor com opacidade, via `alpha()` do
  MUI — sem concatenação de string no componente consumidor

#### Scenario: Landmark de acessibilidade preservado
- **WHEN** `<Card component="section" aria-label="Diagnóstico">` é renderizado
- **THEN** o elemento é encontrável por `getByRole('region', { name: 'Diagnóstico' })`

#### Scenario: Padding default e hero
- **WHEN** `<Card>` é renderizado sem `padding`
- **THEN** o padding é `2`
- **WHEN** `<Card padding={3}>` é renderizado
- **THEN** o padding é `3`

#### Scenario: Estado semântico tem precedência sobre hover
- **WHEN** `<Card variant="glass" stateColor="success" interactive>` recebe hover
- **THEN** a borda e o fundo permanecem os de `stateColor` — `background`/`border` de hover não são
  aplicados, só `cursor: pointer`

### Requirement: Variante `solid` do componente `Card`

O sistema SHALL prover uma terceira variante `solid` do `Card` compartilhado (além de `flat` e
`glass`), com borda sólida `surface[700]` em vez da translúcida `content.cardBorder` usada por
`flat`, e uma prop `surfaceLevel: 'card' | 'panel'` (default `'card'`) que escolhe o token de fundo.

Esta variante formaliza uma receita que já existia, por cópia, em ~10 componentes de
`features/athlete` (`ReadinessCard`, `WeekOverviewCard`, `ProgressBlockCard`, `TodayHeroCard`,
`TodayCompletedCard`, `TodaySkippedCard`, `TodayFeedbackCard`, `FitUploadResultCard`,
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

### Requirement: Componente `CardHeader` compartilhado
O sistema SHALL prover um componente `CardHeader` com título obrigatório e ícone, subtítulo e ação
opcionais, usado de forma consistente por qualquer card que precise de cabeçalho estruturado.

#### Scenario: Header completo
- **WHEN** um componente renderiza `<CardHeader title="X" icon={<Y/>} subtitle="Z" action={<W/>}>`
- **THEN** título, ícone, subtítulo e ação aparecem na mesma posição relativa que em qualquer outro
  card que use `CardHeader`

#### Scenario: Header mínimo
- **WHEN** um componente renderiza `<CardHeader title="X">` sem os campos opcionais
- **THEN** apenas o título aparece, sem espaço reservado vazio para ícone/subtítulo/ação

#### Scenario: Título composto
- **WHEN** um componente renderiza `<CardHeader title={<TooltipWrapper>...}>` com um `ReactNode` em
  vez de string
- **THEN** o conteúdo composto renderiza normalmente — `title` aceita `React.ReactNode`

### Requirement: Cor de Chip válida em `AssessmentInfoCard`
O sistema SHALL renderizar o Chip de papel/role em `AssessmentInfoCard` com uma cor CSS válida
derivada de um token de design.

#### Scenario: Cor corrigida
- **WHEN** `AssessmentInfoCard` renderiza o Chip de papel
- **THEN** a cor de fundo do Chip é um token de design válido, não a string literal `"33"`
