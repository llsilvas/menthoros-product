# Standardize Coach Shell UX

## Why

Os mockups atuais do shell do treinador (`/coach/inbox`, `/coach/athletes`,
`/coach/calendar`, `/coach/insights`) mostram **alta maturidade visual e
domínio do problema**, mas apresentam **inconsistências de tratamento** que,
se não resolvidas antes da implementação, geram dívida de design difícil de
pagar depois:

- **Sidebar com 3 variações** entre as telas (largura, item ativo, footer)
- **Cor primária colidindo com cor de perigo** (laranja-coral em "Risco de
  overtraining" muito próximo do laranja de CTAs)
- **Avatars de atleta com 3 tratamentos diferentes** (tabela, lista de inbox,
  calendário)
- **Badges de tipo de sugestão da IA com paleta arbitrária** (sem taxonomia)
- **Componentes recorrentes não formalizados**: `MetricCell`, `StatusBadge`,
  `Sparkline`, `AthleteRow`, `PhaseIndicator`, `ConfidenceBar`
- **Calendar view não escala** para 24+ atletas (problema imediato — Carlos
  Mendes da assessoria-piloto já tem 24)

Esta mudança formaliza o **design system compartilhado** e os componentes
canônicos do coach shell, eliminando ambiguidades e estabelecendo padrões
testáveis.

## What Changes

### Design System (shared-design-system)
- **Adicionar** paleta semântica: `primary`, `danger`, `warning`, `success`,
  `info` com tokens 50-900
- **Adicionar** taxonomia de cores para sugestões da IA: `new_plan`,
  `plan_adjust`, `recovery`, `race_simulation`, `deload`
- **Adicionar** tokens de elevação (shadow tokens 1-5)
- **Adicionar** tokens de densidade (`density-compact`, `density-comfortable`)

### Coach Shell (coach-ui)
- **Adicionar** `CoachSidebar` canônica (240px expandida / 64px colapsada,
  híbrido: borda + fill suave)
- **Adicionar** componente `MetricCell` (valor + delta colorido)
- **Adicionar** componente `StatusBadge` com variants semânticos
- **Adicionar** componente `Sparkline` (mini gráfico de tendência)
- **Adicionar** componente `AthleteRow` com 3 variants: `table`, `list`,
  `calendar`
- **Adicionar** componente `PhaseIndicator` (BASE/BUILD/ESPECIFICO/TAPER)
- **Adicionar** componente `ConfidenceBar`
- **Adicionar** componente `KPICard`
- **Adicionar** componente `SuggestionTypeBadge` com taxonomia formal
- **Adicionar** componente `CoachAthleteAvatar` com status dot semântico

### Telas
- **Adicionar** spec da tela `/coach/inbox` (validações pendentes)
- **Adicionar** spec da tela `/coach/athletes` (tabela densa)
- **Adicionar** spec da tela `/coach/calendar` (com filtro inteligente)
- **Adicionar** spec da tela `/coach/insights` (analytics da assessoria)
- **Modificar** layout de calendário: filtro inteligente default + virtualização

## Impact

- **Affected specs**: `coach-ui` (novo), `shared-design-system` (novo)
- **Affected code**:
  - `src/shared/design-tokens/*` — paleta semântica completa
  - `src/shared/components/*` — componentes canônicos
  - `src/features/coach/inbox/*` — refactor para usar componentes canônicos
  - `src/features/coach/athletes/*` — idem
  - `src/features/coach/calendar/*` — refactor com virtualização
  - `src/features/coach/insights/*` — idem
- **Migration**: nenhuma quebra de API backend. Mudanças puramente UI.
- **Risco**: médio-baixo. Padronização afeta múltiplas telas, mas pode ser
  implementada incrementalmente — começando pelos tokens e componentes base,
  depois refatorando tela a tela.
- **Dependência crítica**: completar **antes** de abrir piloto. Mudar
  inconsistências de design depois de treinadores reais usando gera ruído
  desnecessário no feedback do piloto.
