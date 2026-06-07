# Athlete UI — Spec Delta

## ADDED Requirements

### Requirement: Persistent Bottom Navigation

O shell do atleta SHALL exibir uma navegação inferior persistente em todas
as rotas `/athlete/*`, contendo exatamente 5 destinos: Hoje, Plano, Progresso,
Coach, Perfil.

#### Scenario: Navegação visível em todas as rotas do atleta

- **WHEN** o usuário autenticado como atleta acessa qualquer rota sob `/athlete/*`
- **THEN** o componente `AthleteBottomNav` está renderizado no DOM
- **AND** respeita `safe-area-inset-bottom` para dispositivos com notch
- **AND** o item correspondente à rota ativa tem `aria-current="page"`

#### Scenario: Badge de mensagens não lidas no item Coach

- **WHEN** o atleta possui mensagens não lidas do treinador
- **THEN** o item "Coach" exibe um badge numérico com o total
- **AND** o badge desaparece ao acessar `/athlete/coach`

#### Scenario: Component props

O componente `AthleteBottomNav` SHALL aceitar as seguintes props:

```typescript
interface AthleteBottomNavProps {
  /** Rota ativa para destacar item correspondente */
  activeRoute: '/athlete/home' | '/athlete/plan' | '/athlete/progress' | '/athlete/coach' | '/athlete/profile';
  /** Contagem de mensagens não lidas do coach (badge no item Coach) */
  unreadCoachMessages?: number;
  /** Callback executado ao tocar em um item; recebe a rota destino */
  onNavigate: (route: string) => void;
  /** Habilita haptic feedback no tap (default: true em mobile) */
  hapticFeedback?: boolean;
}
```

---

### Requirement: Today Hero Card com Gradiente Dinâmico

O componente `TodayHeroCard` SHALL renderizar fundo gradiente derivado
algoritmicamente do tipo de treino e período do dia, sem uso de fotografia
fixa.

#### Scenario: Gradiente reflete o tipo de treino

- **WHEN** `workoutType` é `"easy_run"`
- **THEN** o fundo usa o gradiente token `gradient-easy` (verde→teal)

- **WHEN** `workoutType` é `"intervals"`
- **THEN** o fundo usa `gradient-intervals` (laranja→vermelho)

- **WHEN** `workoutType` é `"long_run"`
- **THEN** o fundo usa `gradient-long` (azul→roxo)

- **WHEN** `workoutType` é `"recovery"` ou `"rest"`
- **THEN** o fundo usa `gradient-recovery` (azul claro→lavanda)

- **WHEN** `workoutType` é `"strength"`
- **THEN** o fundo usa `gradient-strength` (roxo→magenta)

#### Scenario: Gradiente ajusta luminosidade pelo período

- **WHEN** `timeOfDay` é `"morning"` (5h-11h)
- **THEN** o gradiente recebe overlay de warm light (+10% luminosidade)

- **WHEN** `timeOfDay` é `"night"` (20h-5h)
- **THEN** o gradiente recebe overlay escuro (-15% luminosidade)

#### Scenario: Component props

```typescript
interface TodayHeroCardProps {
  /** Nome do atleta para saudação */
  athleteName: string;
  /** Tipo do treino do dia para gradiente contextual */
  workoutType: 'easy_run' | 'intervals' | 'long_run' | 'recovery' | 'rest' | 'strength' | 'tempo' | 'fartlek';
  /** Período do dia para ajuste de luminosidade do gradiente */
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Saudação contextual (auto-gerada se não fornecida) */
  greeting?: string;
  /** Mensagem motivacional (sugerida pela IA) */
  motivationalMessage: string;
  /** Próximo treino para card de detalhes */
  nextWorkout: {
    title: string;
    description: string;
    scheduledAt: Date;
    estimatedDuration: number; // minutos
  } | null;
  /** Callback do CTA principal */
  onPrimaryAction: () => void;
  /** Label do CTA — lógica condicional gerencia */
  primaryActionLabel: string;
}
```

---

### Requirement: Readiness Card

O componente `ReadinessCard` SHALL substituir o card "Preparação" e SHALL
comunicar prontidão para treino em escala qualitativa não-ambígua.

#### Scenario: Escala qualitativa

- **WHEN** `score` é entre 0-39
- **THEN** o label exibido é `"Baixa"` com cor `--color-readiness-low`

- **WHEN** `score` é entre 40-69
- **THEN** o label é `"Moderada"` com cor `--color-readiness-medium`

- **WHEN** `score` é entre 70-89
- **THEN** o label é `"Alta"` com cor `--color-readiness-high`

- **WHEN** `score` é entre 90-100
- **THEN** o label é `"Ótima"` com cor `--color-readiness-high` + ícone destaque

#### Scenario: Tooltip explicativo obrigatório

- **WHEN** o usuário toca no ícone de informação do card
- **THEN** abre um popover explicando como a prontidão é calculada
- **AND** lista os fatores considerados (recuperação, fadiga acumulada, sono)

#### Scenario: Component props

```typescript
interface ReadinessCardProps {
  /** Score numérico 0-100; converte para label qualitativo */
  score: number;
  /** Fatores que contribuíram para o score (mostrados no tooltip) */
  factors: {
    recovery: number;
    fatigue: number;
    sleep?: number;
    hrv?: number;
  };
  /** Tendência vs últimos 7 dias */
  trend: 'improving' | 'stable' | 'declining';
  /** Recomendação textual gerada pela IA */
  recommendation?: string;
}
```

---

### Requirement: Weekly Plan List com destaque temporal

O componente `WeeklyPlanList` SHALL destacar visualmente o dia atual e SHALL
reduzir opacidade dos dias futuros para guiar atenção.

#### Scenario: Dia atual destacado

- **WHEN** um `DayCard` representa o dia atual (date === today)
- **THEN** exibe borda esquerda de 4px na cor `primary-500`
- **AND** exibe badge `"HOJE"` no canto superior direito
- **AND** scroll automático centraliza este card ao montar

#### Scenario: Dias futuros com opacidade reduzida

- **WHEN** um `DayCard` representa data futura (date > today)
- **THEN** opacidade do conteúdo é `0.6`
- **AND** ao tocar, opacidade volta para `1.0` antes de abrir o bottom sheet

#### Scenario: Carga semanal traduzida

- **WHEN** o footer exibe o total semanal
- **THEN** o label usa `"Carga da semana"` em vez de `"Total TSS"`
- **AND** abaixo do progress bar exibe interpretação contextual
  (ex: `"Você está em 84% da meta — semana leve planejada"`)

#### Scenario: DayCard component props

```typescript
interface DayCardProps {
  /** Data do treino */
  date: Date;
  /** Indica se é o dia atual (computado pelo parent) */
  isToday: boolean;
  /** Indica se está no futuro */
  isFuture: boolean;
  /** Treino planejado para o dia (null = descanso) */
  workout: {
    type: WorkoutType;
    title: string;
    description: string;
    estimatedTSS: number;
    durationMinutes: number;
  } | null;
  /** Status de conclusão */
  completionStatus: 'pending' | 'completed' | 'skipped' | 'modified';
  /** Callback ao tocar — abre bottom sheet de detalhes */
  onPress: (date: Date) => void;
}
```

---

### Requirement: Progress Tabs renomeadas

A navegação da tela `/athlete/progress` SHALL usar exatamente 4 abas com os
seguintes labels: `Visão Geral`, `Forma`, `Volume`, `Provas`.

#### Scenario: Aba Visão Geral exibe KPIs com tooltips

- **WHEN** o usuário acessa `/athlete/progress`
- **THEN** a aba `Visão Geral` é a default
- **AND** cada `MetricCard` possui ícone de info que abre tooltip explicativo

#### Scenario: Aba Forma exibe PMC simplificado

- **WHEN** o usuário acessa a aba `Forma`
- **THEN** vê os três conceitos traduzidos: `Condicionamento` (CTL),
  `Cansaço` (ATL), `Forma` (TSB)
- **AND** cada conceito tem definição em linguagem de atleta

#### Scenario: Aba Provas exibe PRs e calendário

- **WHEN** o usuário acessa a aba `Provas`
- **THEN** vê seus PRs (5km, 10km, 21k, 42k)
- **AND** vê próximas provas inscritas
- **AND** vê simulações de prova baseadas em métricas atuais

---

### Requirement: PMC Chart com modo dual

O componente `PMCChart` SHALL oferecer toggle entre visualização simples
(apenas TSS diário) e avançada (CTL/ATL/TSB com labels traduzidos).

#### Scenario: Modo simples como default

- **WHEN** o componente monta
- **THEN** exibe gráfico de barras de TSS diário (modo simples)
- **AND** exibe toggle "Modo avançado" no canto superior direito

#### Scenario: Modo avançado mostra três linhas

- **WHEN** o usuário ativa o toggle "Modo avançado"
- **THEN** o gráfico transita para 3 linhas com legenda traduzida:
  - Verde: `Condicionamento` (CTL)
  - Laranja: `Cansaço` (ATL)
  - Azul: `Forma` (TSB)
- **AND** cada label tem tooltip explicativo

#### Scenario: Component props

```typescript
interface PMCChartProps {
  /** Série temporal de dados */
  data: Array<{
    date: Date;
    tss: number;
    ctl: number;
    atl: number;
    tsb: number;
  }>;
  /** Período mostrado */
  range: '4w' | '8w' | '12w' | '6m' | '1y';
  /** Modo de visualização inicial */
  defaultMode?: 'simple' | 'advanced';
  /** Callback de mudança de range */
  onRangeChange?: (range: string) => void;
}
```

---

### Requirement: Zone Distribution Insight

O componente `ZoneDistributionInsight` SHALL exibir donut de distribuição de
zonas acompanhado de interpretação qualitativa baseada em análise SQL
estruturada do contexto de treino do atleta.

#### Scenario: Interpretação contextual à fase do plano

- **WHEN** o atleta está em fase `BASE`
- **AND** Z1+Z2 representa ≥75% do volume
- **THEN** exibe insight: `"Distribuição polarizada saudável para fase BASE ✓"`

- **WHEN** o atleta está em fase `BUILD`
- **AND** Z4+Z5 representa >15% do volume
- **THEN** exibe alerta: `"Excesso de alta intensidade detectado — risco de overreaching ⚠️"`

#### Scenario: Component props

```typescript
interface ZoneDistributionInsightProps {
  /** Distribuição percentual por zona */
  distribution: {
    z1: number;
    z2: number;
    z3: number;
    z4: number;
    z5: number;
  };
  /** Tempo total no período */
  totalDuration: number; // em segundos
  /** Período analisado */
  periodLabel: string;
  /** Insight pré-computado pelo backend (análise SQL) */
  insight: {
    type: 'positive' | 'neutral' | 'warning';
    message: string;
    relatedPhase?: 'BASE' | 'BUILD' | 'ESPECIFICO' | 'TAPER';
  };
}
```

---

### Requirement: Coach Chat Panel

A rota `/athlete/coach` SHALL renderizar um painel de chat assíncrono com o
treinador responsável pelo atleta, contendo mensagens de texto, áudio e
notificações estruturadas de ajustes de plano.

#### Scenario: Tipos de mensagem suportados

- **WHEN** o coach envia uma mensagem de texto
- **THEN** renderiza como `MessageBubble` com variant `"text"`

- **WHEN** o coach envia uma mensagem de áudio
- **THEN** renderiza como `MessageBubble` com variant `"audio"` com player inline
- **AND** exibe transcrição automática via Whisper expandível

- **WHEN** o coach modifica/aprova/rejeita uma sugestão da IA
- **THEN** renderiza inline como `PlanAdjustmentCard` mostrando o que mudou
- **AND** linka para a tela do plano

#### Scenario: Captura de áudio pelo atleta

- **WHEN** o atleta segura o botão de microfone
- **THEN** inicia gravação com feedback visual (waveform)
- **AND** ao soltar, envia para Whisper API
- **AND** mensagem é entregue com transcrição embarcada

#### Scenario: CoachChatPanel component props

```typescript
interface CoachChatPanelProps {
  /** Atleta corrente */
  athleteId: string;
  /** Coach designado */
  coach: {
    id: string;
    name: string;
    avatarUrl: string;
    isOnline: boolean;
  };
  /** Mensagens (pré-carregadas, paginação separada) */
  messages: Message[];
  /** Callback de envio de mensagem */
  onSendMessage: (content: MessageContent) => Promise<void>;
  /** Indica se o coach está digitando (via WebSocket) */
  coachIsTyping?: boolean;
}

type Message =
  | { id: string; type: 'text'; from: 'athlete' | 'coach'; content: string; sentAt: Date }
  | { id: string; type: 'audio'; from: 'athlete' | 'coach'; audioUrl: string; transcription: string; durationMs: number; sentAt: Date }
  | { id: string; type: 'plan_adjustment'; adjustmentId: string; summary: string; sentAt: Date };

type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; blob: Blob };
```

---

### Requirement: Metric Card com tooltip

Todos os `MetricCard` exibindo termos técnicos SHALL incluir prop opcional
`tooltip` para explicação em linguagem do atleta.

#### Scenario: Renderização do tooltip

- **WHEN** a prop `tooltip` é fornecida
- **THEN** o card exibe ícone de info no canto superior direito
- **AND** ao tocar, abre popover com o conteúdo do tooltip

#### Scenario: Component props

```typescript
interface MetricCardProps {
  /** Label principal (já traduzido para vernáculo) */
  label: string;
  /** Valor formatado para exibição */
  value: string;
  /** Unidade ou contexto opcional */
  unit?: string;
  /** Variação vs período anterior */
  trend?: {
    direction: 'up' | 'down' | 'flat';
    label: string; // ex: "+12% vs período anterior"
    isPositive: boolean; // semântica é positiva ou negativa
  };
  /** Ícone do card */
  icon?: ReactNode;
  /** Tooltip explicativo para termos técnicos */
  tooltip?: {
    title: string;
    body: string;
    technicalName?: string; // ex: "Equivalente a TSS na literatura"
  };
}
```

---

## MODIFIED Requirements

### Requirement: Color Tokens — Verde primário acessível

O token `primary-500` SHALL ter razão de contraste mínima de 4.5:1 contra
`surface-900` para passar WCAG AA em texto pequeno.

#### Scenario: Contraste validado

- **WHEN** o pipeline de CI executa validação de acessibilidade
- **THEN** o token `primary-500` sobre `surface-900` produz contraste ≥ 4.5:1
- **AND** o token `primary-400` (variante mais clara) é usado para texto
  pequeno se o `primary-500` não atender em algum contexto específico

---

## REMOVED Requirements

### Requirement: Foto fixa no Today Hero Card

**Reason**: Substituída por gradiente dinâmico (ver ADDED — Today Hero Card
com Gradiente Dinâmico). Foto criava risco de exclusão de identidades não
representadas e adicionava custo de produção/manutenção.

**Migration**: Componente atual deve ser refatorado removendo prop
`heroImageUrl` e adicionando props `workoutType` e `timeOfDay`.
