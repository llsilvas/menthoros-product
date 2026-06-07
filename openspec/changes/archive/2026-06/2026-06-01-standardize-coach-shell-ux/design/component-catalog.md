# Component Catalog — Coach Shell

Catálogo unificado de todos os componentes do shell do treinador, com
relacionamentos e composição. Use este documento como mapa mental ao
implementar e ao revisar PRs.

## Layer 1 — Design Tokens (fundação)

Não são componentes, mas a base de tudo. Mudanças aqui propagam para toda
a UI.

- `colors.*` — paleta semântica
- `elevation.*` — sombras
- `spacing.*` — densidades
- `typography.*` — escalas tipográficas
- `radii.*` — border-radius
- `gradients.*` — gradientes contextuais (compartilhado com athlete shell)

## Layer 2 — Primitivos compartilhados

Componentes pequenos, sem domínio específico, reusados por todo o shell:

| Componente | Função | Dependências |
|------------|--------|--------------|
| `MetricCell` | Valor + delta colorido | tokens |
| `StatusBadge` | Badge de status semântico | tokens |
| `Sparkline` | Mini gráfico inline | tokens + recharts |
| `ConfidenceBar` | Barra de confiança IA | tokens |
| `PhaseIndicator` | Indicador de fase periodização | tokens |
| `KPICard` | Card de KPI com delta + sparkline | MetricCell, Sparkline |
| `SuggestionTypeBadge` | Badge formal de tipo de sugestão IA | tokens |
| `CoachAthleteAvatar` | Avatar com status dot | tokens |

## Layer 3 — Compostos de domínio

Componentes que combinam primitivos para representar conceitos do domínio:

| Componente | Função | Composição |
|------------|--------|------------|
| `AthleteRow` | Atleta em 3 variants (table/list/calendar) | CoachAthleteAvatar + MetricCell + StatusBadge + PhaseIndicator |
| `SuggestionCard` | Card de sugestão da IA na inbox | CoachAthleteAvatar + SuggestionTypeBadge + ConfidenceBar |
| `WorkoutBlock` | Bloco de treino no diff view | tokens + PhaseIndicator (cor da zona) |
| `AthleteDrawer` | Drawer de detalhe do atleta | AthleteRow + KPICard + tabs |
| `PlanDiffView` | Diff visual entre plano original e sugestão | WorkoutBlock × N |

## Layer 4 — Shell e navegação

Componentes estruturais que ancoram a UI:

| Componente | Função | Composição |
|------------|--------|------------|
| `CoachSidebar` | Navegação principal | TenantSwitcher + items + badge |
| `TenantSwitcher` | Dropdown de assessorias | tokens |
| `CoachHeader` | Header da página (breadcrumb + ações) | tokens |
| `CommandPalette` | ⌘K busca global | tokens + Cmdk |

## Layer 5 — Telas (orquestração)

Cada tela orquestra os layers anteriores:

### `/coach/inbox`
```
CoachSidebar
  ├─ Sidebar content
  └─ Main
     ├─ Column 1: Filters (~80px)
     ├─ Column 2: SuggestionCard list (~360px, virtualized)
     └─ Column 3: Review panel (flex-1)
        ├─ AthleteRow.compact header
        ├─ Tabs: Diff View | Raciocínio IA | Histórico
        └─ PlanDiffView (default)
```

### `/coach/athletes`
```
CoachSidebar
  └─ Main
     ├─ Header: Filters + Views + Bulk actions
     └─ Virtualized table
        └─ AthleteRow.table × N
```

### `/coach/calendar`
```
CoachSidebar
  └─ Main
     ├─ Header: Smart filter + week navigator + actions
     └─ Calendar grid
        ├─ AthleteRow.calendar × N (limited by smart filter)
        └─ Week columns × 7
           └─ WorkoutBlock × N per cell
```

### `/coach/insights`
```
CoachSidebar
  └─ Main
     ├─ Tabs: Visão geral | Carga | Performance | Saúde | Comparativos
     └─ Tab content
        ├─ KPICard grid
        └─ Charts (recharts)
```

## Reuse Matrix

Onde cada componente aparece (validação de reuso):

| Component | Inbox | Athletes | Calendar | Insights | Library |
|-----------|:-----:|:--------:|:--------:|:--------:|:-------:|
| `MetricCell` | ✓ | ✓ | — | ✓ | — |
| `StatusBadge` | ✓ | ✓ | ✓ | ✓ | — |
| `Sparkline` | — | ✓ | — | ✓ | — |
| `ConfidenceBar` | ✓ | — | — | — | — |
| `PhaseIndicator` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `KPICard` | — | — | — | ✓ | — |
| `SuggestionTypeBadge` | ✓ | ✓ (em filter) | — | ✓ (alertas) | ✓ (templates) |
| `CoachAthleteAvatar` | ✓ | ✓ | ✓ | ✓ | — |
| `AthleteRow` | list | table | calendar | list (alertas) | — |

Componentes que aparecem em **3+ telas** são candidatos prioritários para
Storybook documentation completa.

## Naming conventions

- Componentes de domínio do treinador: prefix `Coach` (ex: `CoachSidebar`, `CoachAthleteAvatar`)
- Componentes de domínio do atleta: prefix `Athlete` (ex: `AthleteBottomNav`)
- Componentes compartilhados sem prefix (ex: `MetricCell`, `StatusBadge`)
- Hooks: prefix `use` (ex: `useAthleteFilter`)
- Tipos: PascalCase, sufixo `Props` para props (ex: `AthleteRowProps`)
