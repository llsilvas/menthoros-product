# Coach UI — Spec Delta

## ADDED Requirements

### Requirement: CoachSidebar canônica

O shell do treinador SHALL renderizar um único componente `CoachSidebar`
em todas as rotas `/coach/*`, com largura `240px` expandida e `64px`
colapsada, item ativo em estilo híbrido (fill suave + borda esquerda).

#### Scenario: Largura e collapse

- **WHEN** a sidebar está expandida (default)
- **THEN** largura é `240px`
- **AND** logo + texto "Menthoros" são exibidos
- **AND** items de navegação mostram ícone + label

- **WHEN** o usuário toca em collapse OU pressiona `[`
- **THEN** largura transiciona para `64px` (animação 200ms ease-out)
- **AND** items mostram apenas ícone (label vira tooltip no hover)
- **AND** estado é persistido em `localStorage` (chave `coach-sidebar-collapsed`)

#### Scenario: Item ativo híbrido

- **WHEN** uma rota está ativa
- **THEN** o item correspondente tem:
  - Background: `primary-50`
  - Borda esquerda: 3px sólido `primary-500`
  - Texto/ícone: `primary-700`
- **AND** `aria-current="page"` é aplicado

#### Scenario: Tenant switcher no footer

- **WHEN** o treinador tem acesso a múltiplas assessorias
- **THEN** o footer exibe `TenantSwitcher` com nome da assessoria atual + chevron
- **AND** ao clicar abre dropdown listando todas as assessorias

#### Scenario: Inbox badge

- **WHEN** há validações pendentes
- **THEN** o item "Inbox" exibe badge `danger-500` com contagem
- **AND** badge atualiza em tempo real via WebSocket/polling

#### Scenario: Component props

```typescript
interface CoachSidebarProps {
  activeRoute: CoachRoute;
  coach: { id: string; name: string; avatarUrl: string; role: 'trainer' | 'admin' };
  currentTenant: { id: string; name: string; athleteCount: number };
  availableTenants?: Array<{ id: string; name: string; athleteCount: number }>;
  inboxBadgeCount?: number;
  defaultCollapsed?: boolean;
  onNavigate: (route: CoachRoute) => void;
  onTenantSwitch?: (tenantId: string) => void;
  onCollapseToggle?: (collapsed: boolean) => void;
}

type CoachRoute =
  | '/coach/inbox'
  | '/coach/athletes'
  | '/coach/calendar'
  | '/coach/insights'
  | '/coach/library'
  | '/coach/settings';
```

---

### Requirement: MetricCell

Componente para exibir um valor numérico com delta de variação colorido,
usado em tabelas e cards de métrica.

#### Scenario: Variants de tendência

- **WHEN** `delta.direction` é `'up'` e `delta.isPositive` é `true`
- **THEN** delta usa cor `success-600` com ícone `↑`

- **WHEN** `delta.direction` é `'up'` e `delta.isPositive` é `false`
- **THEN** delta usa cor `danger-600` com ícone `↑`
- **AND** explicação: "valor subiu, mas semanticamente é ruim"
  (ex: ATL subindo durante taper)

- **WHEN** `delta.direction` é `'down'` e `delta.isPositive` é `true`
- **THEN** delta usa cor `success-600` com ícone `↓`

- **WHEN** `delta.direction` é `'flat'`
- **THEN** delta usa cor `surface-500` com ícone `→`

#### Scenario: Component props

```typescript
interface MetricCellProps {
  value: string | number;
  unit?: string;
  delta?: {
    direction: 'up' | 'down' | 'flat';
    label: string; // "+3" ou "+12%"
    isPositive: boolean; // semântica positiva ou negativa
  };
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right' | 'center';
  tooltip?: string;
}
```

---

### Requirement: StatusBadge

Componente de badge de status com variants semânticos definidos.

#### Scenario: Variants

| Variant | Color | Use case |
|---------|-------|----------|
| `active` | `success` | Atleta ativo, treino confirmado |
| `warning` | `warning` | Atenção, sinal leve |
| `danger` | `danger` | Risco, overtraining, alerta crítico |
| `paused` | `surface` | Plano pausado, atleta em pausa |
| `inactive` | `surface-300` | Inativo, sem atividade recente |
| `pending` | `info` | Aguardando ação |

#### Scenario: Component props

```typescript
interface StatusBadgeProps {
  variant: 'active' | 'warning' | 'danger' | 'paused' | 'inactive' | 'pending';
  label: string;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}
```

---

### Requirement: Sparkline

Componente de mini gráfico inline para mostrar tendência de uma métrica
em tabelas e cards.

#### Scenario: Renderização

- **WHEN** o componente recebe `data` com pelo menos 2 pontos
- **THEN** renderiza linha ou área conforme `variant`
- **AND** cor é derivada da tendência geral (último vs primeiro):
  - Subindo + positivo: `success-500`
  - Subindo + negativo: `danger-500`
  - Descendo + positivo: `success-500`
  - Descendo + negativo: `danger-500`
  - Flat: `surface-500`

#### Scenario: Component props

```typescript
interface SparklineProps {
  data: number[];
  variant?: 'line' | 'area';
  width?: number;
  height?: number;
  semantic?: 'positive-up' | 'negative-up' | 'neutral';
  ariaLabel: string; // obrigatório para a11y
}
```

---

### Requirement: ConfidenceBar

Componente de barra de confiança da IA, usado em cards de validação e
ao lado de sugestões.

#### Scenario: Faixas de confiança

- **WHEN** `value` é entre 0-49
- **THEN** preenchimento usa `danger-500`
- **AND** label exibido é `"Baixa confiança"`

- **WHEN** `value` é entre 50-74
- **THEN** preenchimento usa `warning-500`
- **AND** label é `"Confiança moderada"`

- **WHEN** `value` é entre 75-89
- **THEN** preenchimento usa `primary-500`
- **AND** label é `"Alta confiança"`

- **WHEN** `value` é entre 90-100
- **THEN** preenchimento usa `success-500`
- **AND** label é `"Confiança muito alta"`

#### Scenario: Component props

```typescript
interface ConfidenceBarProps {
  value: number; // 0-100
  showLabel?: boolean;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

---

### Requirement: PhaseIndicator

Componente para indicar a fase de periodização do atleta com cor e ícone
distintos.

#### Scenario: Fases definidas

| Phase | Color | Icon |
|-------|-------|------|
| `BASE` | `info-500` (azul) | 🏗️ |
| `BUILD` | `warning-500` (âmbar) | 📈 |
| `ESPECIFICO` | `primary-500` (laranja) | 🎯 |
| `TAPER` | `success-500` (verde) | ✨ |
| `RECOVERY` | `surface-500` (cinza) | 🌱 |

#### Scenario: Component props

```typescript
interface PhaseIndicatorProps {
  phase: 'BASE' | 'BUILD' | 'ESPECIFICO' | 'TAPER' | 'RECOVERY';
  variant?: 'pill' | 'dot' | 'icon-only';
  showLabel?: boolean;
}
```

---

### Requirement: KPICard

Card de KPI com label, valor grande, delta opcional e sparkline opcional.
Usado na tela de Insights.

#### Scenario: Component props

```typescript
interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: MetricCellProps['delta'];
  sparkline?: { data: number[]; semantic: 'positive-up' | 'negative-up' };
  tooltip?: string;
  emphasis?: 'normal' | 'hero'; // hero = card grande de destaque
  loading?: boolean;
}
```

---

### Requirement: CoachAthleteAvatar com status dot semântico

Avatar de atleta usado em todo o shell do treinador, com status dot opcional
com semântica formal.

#### Scenario: Status dots definidos

| Status | Color | Significado |
|--------|-------|-------------|
| `pending_validation` | `primary-500` | Tem sugestão da IA aguardando validação |
| `alert` | `danger-500` | Alerta ativo (overtraining, lesão reportada) |
| `warning` | `warning-500` | Sinal leve (recuperação baixa, sono ruim) |
| `synced` | `success-500` | Sincronizado recentemente |
| `no_sync` | `surface-400` | Sem sincronia há > 3 dias |
| `none` | — | Sem dot |

#### Scenario: Sizes definidos

- `xs`: 24px (densidade-compacta em tabela)
- `sm`: 32px (densidade-comfortable)
- `md`: 40px (cards padrão)
- `lg`: 64px (header de perfil)
- `xl`: 96px (modal de detalhe)

#### Scenario: Component props

```typescript
interface CoachAthleteAvatarProps {
  athlete: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'pending_validation' | 'alert' | 'warning' | 'synced' | 'no_sync' | 'none';
  showInitialsFallback?: boolean; // default true
  onClick?: () => void;
}
```

---

### Requirement: SuggestionTypeBadge

Badge formal para tipos de sugestão da IA, com cor derivada da taxonomia.

#### Scenario: Renderização consistente

- **WHEN** qualquer parte da UI exibe um tipo de sugestão
- **THEN** usa este componente (não criar badges customizados)

#### Scenario: Component props

```typescript
interface SuggestionTypeBadgeProps {
  type: 'new_plan' | 'plan_adjust' | 'recovery' | 'race_simulation' | 'deload' | 'injury_response';
  size?: 'sm' | 'md';
  variant?: 'solid' | 'soft' | 'outline';
}
```

---

### Requirement: AthleteRow com 3 variants contextuais

Componente unificado para representar um atleta, com 3 variants para
contextos diferentes mas dados consistentes.

#### Scenario: Variant table (densidade compacta)

- **WHEN** variant é `'table'`
- **THEN** renderiza como `<tr>` com altura 40px (density-compact)
- **AND** exibe avatar xs + nome + colunas configuráveis (CTL, ATL, TSB, etc.)
- **AND** linha completa é clicável (abre drawer de detalhe)

#### Scenario: Variant list (densidade comfortable)

- **WHEN** variant é `'list'`
- **THEN** renderiza como card 120px com avatar md
- **AND** exibe metadata vertical (tipo de sugestão, confiança, timestamp)
- **AND** usado em `/coach/inbox`

#### Scenario: Variant calendar (linha horizontal)

- **WHEN** variant é `'calendar'`
- **THEN** renderiza como linha horizontal de 40px
- **AND** exibe avatar xs + nome + status dot
- **AND** alinha com grid de calendário ao lado

#### Scenario: Component props

```typescript
interface AthleteRowProps {
  athlete: AthleteUIModel;
  variant: 'table' | 'list' | 'calendar';
  columns?: TableColumn[]; // só para variant 'table'
  metadata?: ReactNode; // só para variant 'list'
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onClick?: () => void;
}

interface AthleteUIModel {
  id: string;
  name: string;
  avatarUrl?: string;
  sport: 'running' | 'cycling' | 'triathlon' | 'swimming';
  phase: 'BASE' | 'BUILD' | 'ESPECIFICO' | 'TAPER' | 'RECOVERY';
  metrics: { ctl: number; atl: number; tsb: number };
  lastActivity?: { date: Date; type: string; distance?: number };
  nextWorkout?: { date: Date; type: string };
  status: StatusBadgeProps['variant'];
  statusDot?: CoachAthleteAvatarProps['status'];
}
```

---

### Requirement: Tela /coach/inbox

A tela `/coach/inbox` SHALL renderizar layout split-view de 3 colunas:
filtros + lista de validações + painel de revisão.

#### Scenario: Layout

- **WHEN** o usuário acessa `/coach/inbox`
- **THEN** vê 3 colunas: filtros (~80px), lista (~360px), painel de revisão (flex-1)
- **AND** primeira sugestão é selecionada automaticamente
- **AND** painel de revisão mostra diff view por default

#### Scenario: Keyboard shortcuts

- **WHEN** o usuário pressiona `J`
- **THEN** navega para próxima sugestão na lista
- **WHEN** pressiona `K`
- **THEN** navega para anterior
- **WHEN** pressiona `A`
- **THEN** aprova a sugestão selecionada (com confirmação opcional)
- **WHEN** pressiona `M`
- **THEN** abre modal de modificação
- **WHEN** pressiona `R`
- **THEN** abre modal de rejeição com campo de nota

#### Scenario: Empty state

- **WHEN** não há validações pendentes
- **THEN** exibe ilustração + texto "Tudo em dia — bom trabalho!"
- **AND** mostra link para `/coach/athletes`

---

### Requirement: Tela /coach/athletes

A tela `/coach/athletes` SHALL renderizar tabela virtualizada de atletas
com filter chips persistidos como views.

#### Scenario: Tabela virtualizada

- **WHEN** o tenant tem mais de 50 atletas
- **THEN** a tabela usa virtualização (`@tanstack/react-table` + `@tanstack/react-virtual`)
- **AND** apenas linhas visíveis são renderizadas no DOM

#### Scenario: Views salvas

- **WHEN** o treinador cria uma combinação de filtros
- **THEN** pode salvar como "view" (ex: "Maratonistas em taper")
- **AND** views salvas aparecem como chips clicáveis acima da tabela

#### Scenario: Cell coloring crítico

- **WHEN** uma célula contém TSB < -30
- **THEN** célula exibe background `danger-50` e texto `danger-700`

- **WHEN** uma célula contém Monotonia > 2.0
- **THEN** mesma coloração

---

### Requirement: Tela /coach/calendar com filtro inteligente

A tela `/coach/calendar` SHALL aplicar filtro inteligente por default
para não sobrecarregar a view com todos os atletas.

#### Scenario: Filtro inteligente "Em foco"

- **WHEN** o usuário acessa `/coach/calendar`
- **THEN** o filtro default é "Atletas em foco esta semana"
- **AND** "em foco" significa: tem treino-chave (longão, prova, simulação)
  OU tem sinal de alerta OU tem sugestão pendente
- **AND** limite máximo: 10 atletas visíveis simultaneamente por default

#### Scenario: Toggle "Ver todos"

- **WHEN** o usuário ativa "Ver todos"
- **THEN** todos os atletas do tenant são listados
- **AND** lista usa virtualização (`react-window`)
- **AND** aviso visual indica "Visualizando todos os 24 atletas — performance pode ser afetada"

#### Scenario: Drag-to-reschedule

- **WHEN** o treinador arrasta um treino para outro dia
- **THEN** aparece confirmação modal mostrando impacto na carga semanal
- **AND** ao confirmar, o ajuste vira sugestão na fila de validação do próprio coach
  (mesmo workflow de auditoria)

---

### Requirement: Tela /coach/insights

A tela `/coach/insights` SHALL organizar analytics da assessoria em 5 tabs.

#### Scenario: Tabs

| Tab | Conteúdo |
|-----|----------|
| `Visão geral` | KPIs do período + top atletas por TSS + alertas |
| `Carga` | Distribuição de carga, monotonia, strain (agregado) |
| `Performance` | Evolução de VO2max, PRs, simulações de prova |
| `Saúde` | Lesões reportadas, sinais de overreaching (quando integração HRV ativa) |
| `Comparativos` | Comparação entre grupos de atletas (maratonistas vs 10k, etc.) |

#### Scenario: Comparação com período anterior

- **WHEN** o usuário ativa toggle "Comparar com período anterior"
- **THEN** cada `KPICard` exibe delta vs período correspondente atrás
- **AND** sparklines mostram duas linhas (atual + anterior)
