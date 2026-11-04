## ADDED Requirements

### Requirement: Família tipográfica única no app logado
O app logado (shell do coach, shell do atleta e shell legado) SHALL usar Inter como família de todo
texto, inclusive títulos, exceto dados de estrutura de treino e rótulos de gráfico, que MAY usar a
família mono do tema (`font.mono`). A hierarquia entre títulos e corpo SHALL vir de tamanho e peso.
Syne SHALL NOT ser usada em nenhuma tela logada. A landing e a waitlist ficam fora deste requisito.

#### Scenario: Nenhum texto em Syne nas telas logadas
- **WHEN** qualquer rota do coach, do atleta ou do shell legado renderiza
- **THEN** todo texto visível fora da exceção mono tem `font-family` computada começando por `Inter`
- **AND** nenhum elemento visível tem `font-family` computada começando por `Syne`

#### Scenario: Títulos de diálogo do coach em Inter
- **WHEN** um `CoachDialog` abre
- **THEN** o título está em Inter e é exposto como `heading` de nível 2

### Requirement: Números alinhados em colunas numéricas
Células que exibem valores numéricos em colunas (bpm, pace, métricas) em Inter SHALL usar
`font-variant-numeric: tabular-nums`.

#### Scenario: Zonas com dígitos alinhados
- **WHEN** o card ou o diálogo de zonas exibe faixas de bpm e de pace
- **THEN** as células numéricas têm `font-variant-numeric: tabular-nums`
