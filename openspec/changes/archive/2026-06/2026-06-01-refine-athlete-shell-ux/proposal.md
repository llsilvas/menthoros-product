# Refine Athlete Shell UX

## Why

O mockup atual do shell do atleta (home/plan/progress) está visualmente forte mas
apresenta gaps críticos que comprometem retenção e clareza:

- **Jargão técnico exposto** (TSS, "Preparação") sem tradução para vernáculo do atleta
- **Coach-in-the-loop invisível**: falta tela de comunicação com treinador,
  enfraquecendo o principal diferencial competitivo do Menthoros vs concorrentes B2C
- **Ambiguidade de informação**: "Preparação 92% Alta" não comunica se é positivo
  ou negativo; abas de Progresso (Condicionamento vs Performance) se sobrepõem
- **Insights ausentes**: dados crus (distribuição de zonas, gráfico TSS) sem
  interpretação qualitativa, desperdiçando o diferencial de IA + análise SQL
- **Navegação inconsistente**: bottom nav persistente não materializada em todas
  as telas; CTA do home compete com a própria nav

Esta mudança propõe um conjunto coeso de refinamentos de componentes React e
adição de telas faltantes para alinhar a UI ao princípio "coach-in-the-loop
visível + linguagem do atleta + insights, não dados crus".

## What Changes

- **Adicionar** componente `AthleteBottomNav` persistente em todas as rotas do atleta
- **Adicionar** tela `/athlete/coach` com componente `CoachChatPanel`
- **Adicionar** componente `ReadinessCard` (substitui "Preparação" no home)
- **Adicionar** componente `ZoneDistributionInsight` (donut + interpretação qualitativa)
- **Adicionar** componente `PMCChart` com modo simplificado/avançado
- **Modificar** `TodayHeroCard`: gradiente dinâmico em vez de foto fixa; CTA contextual
- **Modificar** `WeeklyPlanList`: destaque visual do dia atual, opacidade reduzida
  para dias futuros
- **Modificar** `ProgressTabs`: renomear abas para `Visão Geral / Forma / Volume / Provas`
- **Modificar** `MetricCard`: renomear "TSS" para "Carga de treino" com tooltip;
  adicionar prop `tooltip` para explicações contextuais
- **Modificar** tokens de cor: ajustar verde primário para passar WCAG AA em
  texto pequeno sobre fundo escuro

## Impact

- **Affected specs**: `athlete-ui` (novo capability)
- **Affected code**:
  - `src/features/athlete/home/*` — refactor de `TodayHeroCard`, novo `ReadinessCard`
  - `src/features/athlete/plan/*` — refactor de `WeeklyPlanList`, `DayCard`
  - `src/features/athlete/progress/*` — refactor de `ProgressTabs`, novos componentes
    `ZoneDistributionInsight`, `PMCChart`
  - `src/features/athlete/coach/*` — **nova feature** (chat panel)
  - `src/shared/components/AthleteBottomNav.tsx` — **novo**
  - `src/shared/design-tokens/colors.ts` — ajuste de paleta
- **Migration**: não há breaking change de API; mudanças são puramente client-side.
  Renomeações de campos de display (TSS → "Carga de treino") são apenas labels,
  não afetam backend.
- **Risco**: baixo. Mudanças incrementais, podem ser feature-flagged por tenant
  durante o piloto.
