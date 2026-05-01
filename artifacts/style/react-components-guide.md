# Menthoros · Guia de Componentes React

Referência de design system extraída do protótipo `menthoros_dashboards.html`.
Use este guia para implementar componentes consistentes no `menthoros-front`.

---

## Sumário

1. [Design Tokens](#1-design-tokens)
2. [Tipografia](#2-tipografia)
3. [Layout](#3-layout)
4. [KPI Card](#4-kpi-card)
5. [Card Genérico](#5-card-genérico)
6. [Chip / Badge](#6-chip--badge)
7. [Insight / Alerta](#7-insight--alerta)
8. [Sidebar](#8-sidebar)
9. [Topbar](#9-topbar)
10. [Plano Semanal](#10-plano-semanal)
11. [Tabela de Atletas (Coach)](#11-tabela-de-atletas-coach)
12. [Card de Aprovação](#12-card-de-aprovação)
13. [Zone Bars](#13-zone-bars)
14. [Botões](#14-botões)
15. [Avatar](#15-avatar)
16. [Convenções Gerais](#16-convenções-gerais)

---

## 1. Design Tokens

Centralizar em `tokens.ts` ou `tailwind.config.ts`. Todos os tokens usam o prefixo `m-`.

```ts
// tokens.ts
export const colors = {
  // Superfícies
  bg:         '#0d1b2a',   // fundo principal (dark navy)
  sidebar:    '#112236',   // sidebar
  content:    '#e8eaed',   // área de conteúdo
  card:       '#ffffff',   // cards e painéis

  // Texto
  text:       '#1a2535',   // texto primário
  muted:      '#6b7a8d',   // texto secundário / disabled
  border:     '#d1d5db',   // bordas

  // Brand / Semânticas
  green:      '#b3ff00',               // brand / ação primária
  greenDim:   'rgba(179,255,0,0.12)', // verde sutil (backgrounds)
  red:        '#e74c3c',
  warn:       '#f39c12',
  blue:       '#3498db',

  // Sucesso textual (diferente do brand green)
  success:    '#27ae60',
} as const

// Estados semânticos — usados em bordas, backgrounds e texto
export const semantic = {
  ok:      { accent: '#b3ff00', bg: 'rgba(179,255,0,0.12)', text: '#2d5000' },
  warning: { accent: '#f39c12', bg: 'rgba(243,156,18,0.11)', text: '#8a5a00' },
  danger:  { accent: '#e74c3c', bg: 'rgba(231,76,60,0.10)', text: '#8a1a1a' },
  info:    { accent: '#3498db', bg: 'rgba(52,152,219,0.10)', text: '#1a5f8a' },
} as const

export type SemanticState = keyof typeof semantic
```

---

## 2. Tipografia

Três famílias com papéis distintos.

```ts
// Famílias
// 'Syne'       → títulos, headings, logo
// 'Inter'      → UI geral, labels, corpo
// 'Space Mono' → números, KPIs, métricas, paces
```

| Uso | Família | Tamanho | Peso | Obs |
|-----|---------|---------|------|-----|
| Título de página | Syne | 20px | 700 | — |
| Logo | Syne | 15px (topbar) / 28px (showcase) | 700 | letter-spacing 0.04em |
| Label de seção | Syne | 11px | 700 | uppercase, letter-spacing 0.14em |
| Subtítulo | Inter | 12px | 400 | muted |
| Texto de card | Inter | 12px | 400–600 | — |
| Label de card | Inter | 11px | 600 | uppercase, letter-spacing 0.05em, muted |
| KPI valor | Space Mono | 23px | 700 | — |
| KPI unidade | Inter | 12px | 400 | muted |
| Número/métrica | Space Mono | 11–12px | 700 | right-align |
| Badge / Chip | Inter | 10px | 600 | uppercase, letter-spacing 0.04em |

---

## 3. Layout

### Shell da aplicação

```tsx
// AppShell.tsx
// Estrutura fixa: Topbar + Sidebar + Main Content
<div className="min-h-screen bg-[#0a0f1a]">
  <Topbar />
  <div className="grid grid-cols-[210px_1fr] min-h-[calc(100vh-56px)]">
    <Sidebar />
    <main className="bg-[#e8eaed] p-[22px]">
      {children}
    </main>
  </div>
</div>
```

### Grids de conteúdo

```tsx
// Grid padrão: conteúdo principal + coluna direita
<div className="grid grid-cols-[1fr_290px] gap-4 mb-4">
  <div>{/* conteúdo principal */}</div>
  <div className="flex flex-col gap-[14px]">{/* sidebar direita */}</div>
</div>

// Grid 2 colunas iguais
<div className="grid grid-cols-2 gap-4">...</div>

// Grid 4 colunas (KPI row)
<div className="grid grid-cols-4 gap-3">...</div>
```

### Page Header

```tsx
// PageHeader.tsx
interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-[18px]">
      <div>
        <h1 className="font-['Syne'] text-[20px] font-bold text-[#1a2535]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-[#6b7a8d] mt-[2px]">{subtitle}</p>
        )}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  )
}
```

---

## 4. KPI Card

Exibe uma métrica principal com label, valor, unidade e variação.

```tsx
// KpiCard.tsx
type KpiVariant = 'default' | 'danger' | 'warning'
type DeltaVariant = 'up' | 'down' | 'warn' | 'neutral'

interface KpiCardProps {
  label: string
  value: string | number
  unit?: string
  delta?: string
  deltaVariant?: DeltaVariant
  variant?: KpiVariant
  valueColor?: 'default' | 'green' | 'red' | 'amber'
}

const borderTopColor: Record<KpiVariant, string> = {
  default: 'border-t-[#b3ff00]',
  danger:  'border-t-[#e74c3c]',
  warning: 'border-t-[#f39c12]',
}

const deltaColor: Record<DeltaVariant, string> = {
  up:      'text-[#27ae60]',
  down:    'text-[#e74c3c]',
  warn:    'text-[#f39c12]',
  neutral: 'text-[#6b7a8d]',
}

const valueColor = {
  default: 'text-[#1a2535]',
  green:   'text-[#27ae60]',
  red:     'text-[#e74c3c]',
  amber:   'text-[#f39c12]',
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaVariant = 'neutral',
  variant = 'default',
  valueColor: vc = 'default',
}: KpiCardProps) {
  return (
    <div className={`bg-white border border-[#d1d5db] rounded-[10px] p-[15px] border-t-[3px] ${borderTopColor[variant]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#6b7a8d] mb-[7px]">
        {label}
      </p>
      <p className={`font-['Space_Mono'] text-[23px] font-bold leading-none ${valueColor[vc]}`}>
        {value}
        {unit && <span className="text-[12px] font-normal text-[#6b7a8d] ml-1">{unit}</span>}
      </p>
      {delta && (
        <p className={`text-[11px] mt-[6px] ${deltaColor[deltaVariant]}`}>
          {delta}
        </p>
      )}
    </div>
  )
}
```

**Uso:**
```tsx
<KpiCard label="TSB" value="−4" variant="default" delta="↑ Recuperando" deltaVariant="up" />
<KpiCard label="CTL" value="58" unit="pts" variant="warning" delta="⚠ Acima do ideal" deltaVariant="warn" />
<KpiCard label="Lesão" value="Alto" variant="danger" valueColor="red" />
```

---

## 5. Card Genérico

Container base para qualquer bloco de conteúdo.

```tsx
// Card.tsx
interface CardProps {
  title?: string
  badge?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Card({ title, badge, children, className = '' }: CardProps) {
  return (
    <div className={`bg-white border border-[#d1d5db] rounded-[10px] p-[16px] ${className}`}>
      {(title || badge) && (
        <div className="flex items-center justify-between mb-[14px]">
          {title && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6b7a8d]">
              {title}
            </span>
          )}
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}
```

**Uso:**
```tsx
<Card title="Zonas de treino" badge={<Chip variant="ok">Semana 12</Chip>}>
  <ZoneBars ... />
</Card>
```

---

## 6. Chip / Badge

Indicador de status compacto.

```tsx
// Chip.tsx
type ChipVariant = 'ok' | 'info' | 'warning' | 'danger'

interface ChipProps {
  variant?: ChipVariant
  children: React.ReactNode
}

const chipStyles: Record<ChipVariant, string> = {
  ok:      'bg-[rgba(179,255,0,0.12)] text-[#2d5000]',
  info:    'bg-[rgba(52,152,219,0.1)] text-[#1a5f8a]',
  warning: 'bg-[rgba(243,156,18,0.11)] text-[#8a5a00]',
  danger:  'bg-[rgba(231,76,60,0.1)] text-[#8a1a1a]',
}

export function Chip({ variant = 'ok', children }: ChipProps) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.04em] px-[7px] py-[3px] rounded-[4px] ${chipStyles[variant]}`}>
      {children}
    </span>
  )
}
```

**Uso:**
```tsx
<Chip variant="ok">Ativo</Chip>
<Chip variant="warning">Atenção</Chip>
<Chip variant="danger">Crítico</Chip>
<Chip variant="info">Planejado</Chip>
```

---

## 7. Insight / Alerta

Card de alerta com indicador lateral colorido — usado para insights gerados por IA ou alertas de treino.

```tsx
// InsightCard.tsx
type InsightVariant = 'warn' | 'good' | 'info'

interface InsightCardProps {
  variant: InsightVariant
  text: React.ReactNode
  isAi?: boolean
}

const insightStyles: Record<InsightVariant, { border: string; bg: string; dot: string }> = {
  warn: { border: 'border-l-[#f39c12]', bg: 'bg-[#fffbf0]', dot: 'bg-[#f39c12]' },
  good: { border: 'border-l-[#b3ff00]', bg: 'bg-[#f8fbf3]', dot: 'bg-[#b3ff00]' },
  info: { border: 'border-l-[#3498db]', bg: 'bg-[#f1f8fc]', dot: 'bg-[#3498db]' },
}

export function InsightCard({ variant, text, isAi = false }: InsightCardProps) {
  const s = insightStyles[variant]
  return (
    <div className={`flex gap-[10px] items-start p-[11px] rounded-[8px] border border-[#d1d5db] border-l-[3px] ${s.border} ${s.bg}`}>
      <span className={`w-[8px] h-[8px] rounded-full flex-shrink-0 mt-[3px] ${s.dot}`} />
      <div>
        <p className="text-[12px] text-[#374151] leading-[1.5]">{text}</p>
        {isAi && (
          <span className="inline-flex items-center gap-[4px] text-[9px] font-semibold uppercase tracking-[0.06em] bg-[rgba(179,255,0,0.12)] text-[#2d5000] px-[7px] py-[2px] rounded-[4px] mt-[6px]">
            ✦ IA
          </span>
        )}
      </div>
    </div>
  )
}
```

**Uso:**
```tsx
<InsightCard variant="warn" text={<><strong>Volume semanal</strong> acima do limite recomendado.</>} />
<InsightCard variant="good" text="Distribuição de zonas dentro do ideal." isAi />
<InsightCard variant="info" text="Prova em 3 semanas — iniciar taper." isAi />
```

---

## 8. Sidebar

```tsx
// Sidebar.tsx
interface NavItem {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: { count: number; variant: 'danger' | 'warning' }
}

interface NavGroup {
  label: string
  items: NavItem[]
}

export function Sidebar({ groups }: { groups: NavGroup[] }) {
  return (
    <aside className="bg-[#112236] border-r border-white/[0.06] p-[16px_10px]">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#b3ff00] px-[8px] mt-[16px] mb-[5px] first:mt-[2px]">
            {group.label}
          </p>
          {group.items.map((item) => (
            <SidebarItem key={item.label} {...item} />
          ))}
        </div>
      ))}
    </aside>
  )
}

function SidebarItem({ icon, label, active, badge }: NavItem) {
  const badgeStyle = badge?.variant === 'danger'
    ? 'bg-[rgba(231,76,60,0.22)] text-[#e74c3c]'
    : 'bg-[rgba(243,156,18,0.2)] text-[#f39c12]'

  return (
    <div className={`flex items-center gap-[9px] px-[10px] py-[8px] rounded-[7px] text-[12.5px] mb-[2px] cursor-pointer transition-colors
      ${active
        ? 'bg-[#b3ff00] text-black font-semibold'
        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-[15px] h-[15px] flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className={`text-[10px] font-bold px-[6px] py-[2px] rounded-[10px] ${badgeStyle}`}>
          {badge.count}
        </span>
      )}
    </div>
  )
}
```

---

## 9. Topbar

```tsx
// Topbar.tsx
interface TopbarProps {
  navItems: { label: string; active?: boolean }[]
  user: { name: string; role: string; initials: string }
  hasNotification?: boolean
}

export function Topbar({ navItems, user, hasNotification }: TopbarProps) {
  return (
    <header className="flex items-center justify-between px-[22px] h-[56px] bg-[#0d1b2a]">
      {/* Logo */}
      <div className="flex items-center gap-[10px]">
        <div className="w-[34px] h-[34px] bg-black rounded-[8px] flex items-center justify-center">
          {/* SVG logo */}
        </div>
        <span className="font-['Syne'] text-[15px] font-bold text-white">Menthoros</span>
        <span className="text-[10px] text-white/30 tracking-[0.08em] uppercase ml-[10px] pl-[10px] border-l border-white/[0.12]">
          Atleta
        </span>
      </div>

      {/* Nav */}
      <nav className="flex gap-[2px]">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`px-[12px] py-[6px] text-[12px] rounded-[6px] transition-colors
              ${item.active
                ? 'bg-[rgba(179,255,0,0.12)] text-[#b3ff00]'
                : 'text-white/40 hover:text-white/70'
              }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* User */}
      <div className="flex items-center gap-[12px]">
        {/* Notification button */}
        <div className="relative w-[32px] h-[32px] bg-white/[0.06] rounded-[7px] flex items-center justify-center cursor-pointer">
          {/* icon */}
          {hasNotification && (
            <span className="absolute top-[6px] right-[7px] w-[7px] h-[7px] bg-[#e74c3c] rounded-full border-2 border-[#0d1b2a]" />
          )}
        </div>
        {/* Avatar */}
        <div className="w-[32px] h-[32px] rounded-full bg-[#b3ff00] flex items-center justify-center text-[11px] font-bold text-black">
          {user.initials}
        </div>
        <div className="text-right">
          <p className="text-[13px] font-medium text-white">{user.name}</p>
          <p className="text-[10px] text-[#b3ff00]">{user.role}</p>
        </div>
      </div>
    </header>
  )
}
```

---

## 10. Plano Semanal

Visualização dos 7 dias da semana com blocos de intensidade.

```tsx
// WeekPlan.tsx
type WorkoutType = 'rest' | 'easy' | 'tempo' | 'long' | 'interval'

interface DayPlan {
  dayLabel: string  // 'SEG', 'TER', etc.
  type: WorkoutType
  label?: string
  isToday?: boolean
}

const blockStyles: Record<WorkoutType, { className: string; height: string }> = {
  rest:     { className: 'bg-[#f4f5f7] text-[#adb5bd]',                       height: 'h-[34px]' },
  easy:     { className: 'bg-[rgba(179,255,0,0.13)] text-[#2d5000]',           height: 'h-[50px]' },
  tempo:    { className: 'bg-[rgba(52,152,219,0.1)] text-[#1a5f8a]',           height: 'h-[66px]' },
  long:     { className: 'bg-[rgba(243,156,18,0.12)] text-[#8a5a00]',          height: 'h-[80px]' },
  interval: { className: 'bg-[rgba(231,76,60,0.1)] text-[#8a1a1a]',            height: 'h-[68px]' },
}

export function WeekPlan({ days }: { days: DayPlan[] }) {
  return (
    <div className="grid grid-cols-7 gap-[6px] mt-[6px]">
      {days.map((day) => {
        const style = blockStyles[day.type]
        return (
          <div key={day.dayLabel} className="flex flex-col items-center gap-[5px]">
            <span className="text-[10px] font-semibold text-[#6b7a8d]">{day.dayLabel}</span>
            <div
              className={`w-full rounded-[6px] flex items-center justify-center text-[9px] font-semibold uppercase leading-[1.3] text-center
                ${style.className} ${style.height}
                ${day.isToday ? 'outline outline-2 outline-[#b3ff00] outline-offset-1' : ''}
              `}
            >
              {day.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Uso:**
```tsx
<WeekPlan days={[
  { dayLabel: 'SEG', type: 'easy',     label: 'Fácil',      isToday: true },
  { dayLabel: 'TER', type: 'interval', label: 'Intervalado' },
  { dayLabel: 'QUA', type: 'rest',     label: 'Descanso' },
  { dayLabel: 'QUI', type: 'tempo',    label: 'Tempo' },
  { dayLabel: 'SEX', type: 'easy',     label: 'Fácil' },
  { dayLabel: 'SAB', type: 'long',     label: 'Longo' },
  { dayLabel: 'DOM', type: 'rest',     label: 'Descanso' },
]} />
```

---

## 11. Tabela de Atletas (Coach)

Lista de atletas com status e métricas em grid.

```tsx
// AthleteTable.tsx
type AthleteStatus = 'ok' | 'warning' | 'danger'

interface Athlete {
  id: string
  initials: string
  avatarVariant: 1 | 2 | 3 | 4 | 5
  name: string
  meta: string
  tsb: number
  rampRate: string
  status: AthleteStatus
}

const rowStyles: Record<AthleteStatus, string> = {
  ok:      'border-l-[#b3ff00] bg-[rgba(179,255,0,0.04)]',
  warning: 'border-l-[#f39c12] bg-[rgba(243,156,18,0.04)]',
  danger:  'border-l-[#e74c3c] bg-[rgba(231,76,60,0.04)]',
}

const statusBadge: Record<AthleteStatus, string> = {
  ok:      'bg-[rgba(179,255,0,0.15)] text-[#2d5000]',
  warning: 'bg-[rgba(243,156,18,0.15)] text-[#8a5a00]',
  danger:  'bg-[rgba(231,76,60,0.15)] text-[#8a1a1a]',
}

const avatarColors = [
  'bg-[#102030] text-[#b3ff00]',
  'bg-[#182a18] text-[#b3ff00]',
  'bg-[#18183a] text-[#7fb3e8]',
  'bg-[#3a1818] text-[#e87f7f]',
  'bg-[#3a2a18] text-[#e8c07f]',
]

export function AthleteTable({ athletes }: { athletes: Athlete[] }) {
  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-[30px_1fr_70px_52px_78px_68px] gap-[8px] px-[10px] mb-[4px]">
        {['', 'Atleta', 'TSB', 'km/sem', 'Ramp Rate', ''].map((h, i) => (
          <span key={i} className="text-[10px] text-[#b0bac7] uppercase tracking-[0.06em] font-semibold text-right first:text-left [&:nth-child(2)]:text-left">
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-[5px]">
        {athletes.map((ath) => (
          <div
            key={ath.id}
            className={`grid grid-cols-[30px_1fr_70px_52px_78px_68px] items-center gap-[8px] px-[10px] py-[9px] rounded-[8px] border border-[#d1d5db] border-l-[3px] ${rowStyles[ath.status]}`}
          >
            {/* Avatar */}
            <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-[10px] font-bold ${avatarColors[ath.avatarVariant - 1]}`}>
              {ath.initials}
            </div>
            {/* Name */}
            <div>
              <p className="text-[13px] font-medium text-[#1a2535]">{ath.name}</p>
              <p className="text-[11px] text-[#6b7a8d]">{ath.meta}</p>
            </div>
            {/* TSB */}
            <span className="font-['Space_Mono'] text-[12px] text-[#1a2535] text-right">{ath.tsb}</span>
            {/* Ramp Rate */}
            <span className="font-['Space_Mono'] text-[12px] text-[#1a2535] text-right">{ath.rampRate}</span>
            {/* Status badge */}
            <span className={`inline-flex items-center justify-center text-[10px] font-semibold px-[7px] py-[3px] rounded-[4px] ${statusBadge[ath.status]}`}>
              {ath.status === 'ok' ? 'OK' : ath.status === 'warning' ? 'Atenção' : 'Risco'}
            </span>
            {/* Actions */}
            <div className="flex gap-[3px] justify-end">
              <button className="w-[26px] h-[26px] bg-white border border-[#d1d5db] rounded-[5px] flex items-center justify-center hover:bg-gray-50">
                {/* icon */}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 12. Card de Aprovação

Usado pelo coach para aprovar/editar/rejeitar sugestões da IA.

```tsx
// ApprovalCard.tsx
interface ApprovalCardProps {
  athleteName: string
  athleteMeta: string
  suggestion: string
  onApprove: () => void
  onEdit: () => void
  onReject: () => void
}

export function ApprovalCard({
  athleteName,
  athleteMeta,
  suggestion,
  onApprove,
  onEdit,
  onReject,
}: ApprovalCardProps) {
  return (
    <div className="bg-[#fafbfc] border border-[#e8eaed] rounded-[8px] p-[12px]">
      <div className="flex justify-between items-start mb-[5px]">
        <span className="text-[13px] font-semibold text-[#1a2535]">{athleteName}</span>
        <span className="text-[11px] text-[#6b7a8d]">{athleteMeta}</span>
      </div>
      <p className="text-[12px] text-gray-600 leading-[1.5] mb-[8px]">{suggestion}</p>
      <div className="flex gap-[6px]">
        <button
          onClick={onApprove}
          className="text-[11px] font-semibold px-[12px] py-[5px] rounded-[5px] bg-[rgba(179,255,0,0.15)] text-[#2d5000] hover:bg-[rgba(179,255,0,0.25)] transition-colors"
        >
          Aprovar
        </button>
        <button
          onClick={onEdit}
          className="text-[11px] font-semibold px-[12px] py-[5px] rounded-[5px] bg-white border border-[#d1d5db] text-[#6b7a8d] hover:bg-gray-50 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={onReject}
          className="text-[11px] font-semibold px-[12px] py-[5px] rounded-[5px] bg-[rgba(231,76,60,0.1)] text-[#8a1a1a] hover:bg-[rgba(231,76,60,0.18)] transition-colors"
        >
          Rejeitar
        </button>
      </div>
    </div>
  )
}
```

---

## 13. Zone Bars

Exibe distribuição por zonas de treino (Z1–Z5).

```tsx
// ZoneBars.tsx
interface Zone {
  label: string   // 'Z1', 'Z2', etc.
  percent: number // 0–100
  color: string   // hex ou tailwind color
}

export function ZoneBars({ zones }: { zones: Zone[] }) {
  return (
    <div className="flex flex-col gap-[9px]">
      {zones.map((zone) => (
        <div key={zone.label} className="grid grid-cols-[64px_1fr_36px] items-center gap-[10px]">
          <span className="font-['Space_Mono'] text-[11px] text-[#6b7a8d]">{zone.label}</span>
          <div className="h-[6px] bg-[#f0f2f4] rounded-[3px]">
            <div
              className="h-[6px] rounded-[3px] transition-all"
              style={{ width: `${zone.percent}%`, backgroundColor: zone.color }}
            />
          </div>
          <span className="font-['Space_Mono'] text-[11px] text-[#6b7a8d] text-right">
            {zone.percent}%
          </span>
        </div>
      ))}
    </div>
  )
}
```

**Uso:**
```tsx
<ZoneBars zones={[
  { label: 'Z1 Fácil',  percent: 52, color: '#b3ff00' },
  { label: 'Z2 Aeróbio', percent: 23, color: '#3498db' },
  { label: 'Z3 Limiar',  percent: 12, color: '#f39c12' },
  { label: 'Z4 Vo2',     percent: 9,  color: '#e67e22' },
  { label: 'Z5 Anaeróbio', percent: 4, color: '#e74c3c' },
]} />
```

---

## 14. Botões

```tsx
// Button.tsx
type ButtonVariant = 'primary' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[#b3ff00] text-black hover:bg-[#a3ef00]',
  ghost:   'bg-white border border-[#d1d5db] text-[#6b7a8d] hover:bg-gray-50',
}

export function Button({ variant = 'ghost', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`px-[16px] py-[7px] rounded-[7px] text-[12px] font-semibold transition-colors ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
```

---

## 15. Avatar

```tsx
// Avatar.tsx
// 5 variações de cor pré-definidas para atletas
const avatarVariants = [
  'bg-[#102030] text-[#b3ff00]',  // 1
  'bg-[#182a18] text-[#b3ff00]',  // 2
  'bg-[#18183a] text-[#7fb3e8]',  // 3
  'bg-[#3a1818] text-[#e87f7f]',  // 4
  'bg-[#3a2a18] text-[#e8c07f]',  // 5
]

interface AvatarProps {
  initials: string
  variant?: 1 | 2 | 3 | 4 | 5
  size?: 'sm' | 'md'
  isCoach?: boolean  // usa brand green sólido
}

export function Avatar({ initials, variant = 1, size = 'md', isCoach }: AvatarProps) {
  const sizeClass = size === 'sm' ? 'w-[28px] h-[28px] text-[10px]' : 'w-[32px] h-[32px] text-[11px]'
  const colorClass = isCoach ? 'bg-[#b3ff00] text-black' : avatarVariants[variant - 1]

  return (
    <div className={`rounded-full flex items-center justify-center font-bold ${sizeClass} ${colorClass}`}>
      {initials}
    </div>
  )
}
```

---

## 16. Convenções Gerais

### Hierarquia de estado de cor

Sempre que um componente tiver variação de status, seguir esta ordem semântica:

```
verde  (#b3ff00 / #27ae60) → ok, sucesso, ativo, saudável
azul   (#3498db)           → informação, planejado, neutro positivo
laranja (#f39c12)          → atenção, aviso, limiar
vermelho (#e74c3c)         → erro, crítico, risco
```

### Props de variante

Nomear variantes de forma semântica, não visual:

```ts
// ✅ Correto
type Variant = 'ok' | 'warning' | 'danger' | 'info'

// ❌ Evitar
type Variant = 'green' | 'orange' | 'red' | 'blue'
```

### Estrutura de arquivos sugerida

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Topbar.tsx
│   │   └── Sidebar.tsx
│   ├── ui/
│   │   ├── Avatar.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Chip.tsx
│   │   └── InsightCard.tsx
│   └── domain/
│       ├── KpiCard.tsx
│       ├── WeekPlan.tsx
│       ├── ZoneBars.tsx
│       ├── AthleteTable.tsx
│       └── ApprovalCard.tsx
├── tokens.ts
└── ...
```

### Fontes (Google Fonts)

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Ou via `next/font` no Next.js:

```ts
import { Inter, Syne, Space_Mono } from 'next/font/google'

export const inter      = Inter({ subsets: ['latin'], weight: ['400','500','600'] })
export const syne       = Syne({ subsets: ['latin'], weight: ['500','700'] })
export const spaceMono  = Space_Mono({ subsets: ['latin'], weight: ['400','700'] })
```

### Regras de border-radius

| Contexto | Valor |
|----------|-------|
| Frame principal | 14px |
| Cards e containers | 10px |
| Botões e inputs | 7px |
| Badges e chips | 4–5px |
| Progress bars / zone bars | 3px |
| Logo mark | 8px |
| Avatares | 50% (círculo) |

---

*Gerado a partir de `menthoros_dashboards.html` — 2026-03-29*
