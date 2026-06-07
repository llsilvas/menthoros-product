# Tasks

## 1. Design Tokens (fundação)

- [x] 1.1 Criar paleta semântica completa em `colors.ts` (primary, danger, warning, success, info — escalas 50-900)
- [ ] 1.2 Validar contraste WCAG AA de todas as combinações texto/background no Stark — **adiado para pós-piloto**
- [x] 1.3 Criar tokens de elevação (`shadow-1` a `shadow-5`)
- [x] 1.4 Criar tokens de densidade (`spacing-compact`, `spacing-comfortable`, `spacing-spacious`)
- [x] 1.5 Criar tokens de taxonomia de IA (`suggestion-new-plan`, `suggestion-adjust`, etc.) — via `SuggestionTypeBadge` + `categorical` palette
- [ ] 1.6 Documentar tokens em Storybook com Token Page — **adiado: Storybook não instalado**

## 2. Componentes Base Compartilhados

- [x] 2.1 `MetricCell` — valor numérico + delta colorido + tooltip opcional
- [x] 2.2 `StatusBadge` — variants: `active`, `warning`, `danger`, `paused`, `inactive`
- [x] 2.3 `Sparkline` — mini gráfico inline (line, area) com cor semântica
- [x] 2.4 `ConfidenceBar` — barra com gradient + label percentual
- [x] 2.5 `PhaseIndicator` — pill com cor e ícone por fase de periodização
- [x] 2.6 `KPICard` — card com label, valor grande, delta, sparkline opcional
- [x] 2.7 `CoachAthleteAvatar` — avatar com status dot semântico
- [x] 2.8 `SuggestionTypeBadge` — badge com taxonomia formal de tipos de IA

## 3. CoachSidebar Canônica

- [x] 3.1 Implementar `CoachSidebar` 240px/64px com toggle de collapse
- [x] 3.2 Implementar item ativo híbrido (fill + borda esquerda)
- [x] 3.3 Implementar footer com `TenantSwitcher` (dropdown de assessorias)
- [x] 3.4 Implementar badge de inbox counter
- [x] 3.5 Persistir estado collapsed em localStorage
- [x] 3.6 Keyboard shortcut: `[` para toggle collapse

## 4. AthleteRow (3 variants)

- [x] 4.1 `AthleteRow.Table` — densidade compacta, cells configuráveis
- [x] 4.2 `AthleteRow.List` — densidade comfortable, para inbox/listas focadas
- [x] 4.3 `AthleteRow.Calendar` — densidade compacta horizontal, para grid de calendário
- [x] 4.4 Garantir que os 3 variants compartilham a mesma fonte de dados e formatação

## 5. Refactor /coach/inbox

- [x] 5.1 Substituir cards customizados por `CoachAthleteAvatar` + `SuggestionTypeBadge` + `ConfidenceBar`
- [x] 5.2 Implementar keyboard shortcuts (J/K navegar, A aprovar, R rejeitar)
- [ ] 5.3 Implementar diff view com biblioteca `react-diff-viewer` ou custom — **adiado para integração com API**
- [x] 5.4 Implementar painel "Raciocínio IA" como tab
- [ ] 5.5 Implementar painel "Histórico" como tab — **adiado para integração com API**
- [x] 5.6 Implementar empty state ("Nenhuma validação pendente — bom trabalho!")

## 6. Refactor /coach/athletes

- [x] 6.1 Implementar tabela com MUI DataGrid (virtualização nativa) — @tanstack adiado
- [x] 6.2 Filter chips persistidos como "views" (Maratonistas, Em taper, etc.)
- [ ] 6.3 Column visibility toggle — **adiado**
- [x] 6.4 Bulk actions bar (aparece quando há seleção)
- [ ] 6.5 Quick preview no hover (HoverCard com mini-dashboard) — **adiado**
- [x] 6.6 Cell coloring nos KPIs críticos (TSB vermelho se < -30)

## 7. Refactor /coach/calendar

- [x] 7.1 Implementar filtro inteligente default ("Atletas em foco")
- [ ] 7.2 Implementar virtualização com `react-window` — **adiado: lib não instalada**
- [ ] 7.3 Toggle Semana/Mês — **adiado**
- [ ] 7.4 Drag-and-drop para reagendar treinos — **adiado para integração com API**
- [x] 7.5 Cores de workout type consistentes com taxonomia (`categorical.*`)

## 8. Refactor /coach/insights

- [x] 8.1 Reorganizar em tabs: `Visão geral`, `Carga`, `Performance`, `Saúde`, `Comparativos`
- [x] 8.2 Substituir cards customizados por `KPICard`
- [ ] 8.3 Implementar comparação com período anterior (toggle) — **adiado**
- [ ] 8.4 Alertas inline com `AthleteRow.List` compacta — **adiado para integração com API**

## 9. Testes & Validação

- [ ] 9.1 Storybook completo de todos os componentes canônicos — **adiado: Storybook não instalado**
- [ ] 9.2 Visual regression tests (Chromatic ou Percy) — **adiado**
- [ ] 9.3 Auditoria de acessibilidade (axe-core) — zero violations — **adiado**
- [ ] 9.4 Performance: tabela com 500 atletas mock deve scrollar a 60fps — **adiado**
- [ ] 9.5 Validação com Carlos Mendes (treinador-piloto) antes de release — **pendente: dados ainda são mock**
