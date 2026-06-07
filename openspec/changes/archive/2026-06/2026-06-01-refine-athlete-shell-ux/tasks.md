# Tasks

## 1. Design Tokens & Fundamentos

- [x] 1.1 `primary-500` já era `#D4FF3A` com contraste ~14:1 (AAA) — nenhum ajuste necessário
- [ ] 1.2 Validar paleta com Stark plugin no Figma — **adiado para pós-piloto**
- [x] 1.3 Criar tokens semânticos de readiness: `readiness.low/medium/high/peak` em `colors.ts`
- [x] 1.4 Criar gradientes contextuais em `gradients.ts`: `workoutGradients` (8 tipos) + `timeOfDayOverlay`

## 2. Componente AthleteBottomNav (Novo)

- [x] 2.1 Criar `AthleteBottomNav.tsx` com 5 itens fixos (Hoje, Plano, Progresso, Coach, Perfil)
- [x] 2.2 Implementar safe-area-inset-bottom para iOS notch
- [x] 2.3 Adicionar badge prop para item "Coach" (mensagens não lidas, com "9+" overflow)
- [x] 2.4 Integrar com router para active state (useLocation + aria-current)
- [ ] 2.5 Adicionar haptic feedback no tap (mobile) — **adiado: requer API nativa**

## 3. Refactor /athlete/home

- [x] 3.1 `TodayHeroCard`: recebe `workoutType` e renderiza gradiente correspondente
- [x] 3.2 Prop `timeOfDay` com overlay de luminosidade via `timeOfDayOverlay`
- [x] 3.3 `ReadinessCard` substitui "Preparação" — escala qualitativa Baixa/Moderada/Alta/Ótima
- [x] 3.4 Tooltip explicativo em todos os MetricCards (TSS→"Carga", CTL→"Condicionamento", etc.)
- [x] 3.5 CTA contextual "Iniciar treino" abre QuickCheckInModal
- [x] 3.6 `QuickCheckInModal` com sliders de humor e energia + notes opcional

## 4. Refactor /athlete/plan

- [x] 4.1 `DayCard` com prop `isToday`: borda lime + badge "HOJE"
- [x] 4.2 Prop `isFuture` com opacity 0.6 no conteúdo
- [x] 4.3 Footer "Carga da semana" (em vez de "Total TSS")
- [x] 4.4 Interpretação qualitativa abaixo do progress bar
- [x] 4.5 Auto-scroll para o dia atual via `scrollIntoView` no mount

## 5. Refactor /athlete/progress

- [x] 5.1 Tabs: `Visão Geral`, `Forma`, `Volume`, `Provas`
- [x] 5.2 `ZoneDistributionInsight` — donut recharts + interpretação qualitativa
- [x] 5.3 `PMCChart` com toggle simples/avançado
- [x] 5.4 Modo simples: TSS diário (barras); avançado: CTL/ATL/TSB (3 linhas traduzidas)
- [x] 5.5 Tooltip em cada KPI da Visão Geral via `InfoOutlined` SVG

## 6. Nova feature /athlete/coach

- [x] 6.1 Criar estrutura `features/athlete/` com layout, pages e components
- [x] 6.2 `CoachChatPanel` — chat estilo WhatsApp com auto-scroll e input multiline
- [x] 6.3 `MessageBubble` com variantes text (alinhamento por remetente) e audio (player + transcrição expansível)
- [x] 6.4 `AudioRecorder` — idle/recording/preview/error com MediaRecorder API + prefers-reduced-motion
- [x] 6.5 `PlanAdjustmentCard` — approved/modified/rejected com borda e ícone semânticos
- [ ] 6.6 Implementar realtime via WebSocket ou SSE — **adiado: depende do backend**

## 7. Testes & Validação

- [ ] 7.1 Storybook stories para todos os componentes novos — **adiado: Storybook não instalado**
- [ ] 7.2 Testes de acessibilidade automatizados (axe-core) — **adiado**
- [ ] 7.3 Validar com 3 atletas do piloto antes de release geral — **pendente: dados ainda são mock**
- [ ] 7.4 Documentar componentes no design system interno — **adiado**
