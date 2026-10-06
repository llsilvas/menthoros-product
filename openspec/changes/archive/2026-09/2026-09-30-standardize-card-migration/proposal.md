**Tamanho:** M · **Trilha:** Fast

# standardize-card-migration

Depende de `standardize-card-foundation` (mergeada antes desta iniciar): a API de `Card`/`CardHeader`
já está definida e provada em 3 componentes (`KPICard`, `StatCard`, `WorkoutAnalysisCard`). Esta change
é migração mecânica dos ~13 cards restantes para essa API — sem incerteza de design nova, por isso
Fast track apesar do tamanho M (número de arquivos).

## Por quê

`standardize-card-foundation` criou o componente compartilhado e corrigiu a colisão de token `radius`,
mas só migrou 3 dos ~16 cards do app como prova. Os ~13 restantes continuam com wrapper, raio, borda e
fundo hand-rolled — o inventário original (`/design-critique`, 29/09) continua valendo para eles até
serem migrados.

## O que muda

Migrar para `<Card variant="flat|glass">` + `<CardHeader>` (quando aplicável):

- `features/coach/components/SectionCard.tsx` (`flat` + `CardHeader` com `divider`)
- `features/coach/components/DiagnosisCard.tsx` (`flat` + `CardHeader`)
- `features/athlete/components/ReadinessCard.tsx` (`flat`)
- `features/athlete/components/WeekOverviewCard.tsx` (`flat` + `CardHeader`)
- `features/athlete/components/progress/ProgressBlockCard.tsx` (`flat` + `CardHeader`)
- `features/athlete/components/KudosCard.tsx` (`glass`)
- `pages/reconciliacao/components/AtividadePendenteCard.tsx` (decisão: manter `Accordion` com tokens
  do `Card` aplicados manualmente, ou avaliar se cabe em `Card` — ver Open Questions)
- `components/features/planos/TreinoCard.tsx` (`glass` + `stateColor="success"/"danger"` para os
  estados REALIZADO/PERDIDO — a prop já existe na API desde `standardize-card-foundation` D2/PM2,
  então esta migração só troca o `sx` manual pela prop, sem reabrir decisão de design)
- `features/athlete/components/TodayHeroCard.tsx` (variante `hero`/gradiente — decisão de design
  adiada de `standardize-card-foundation`, D2; resolver aqui antes de migrar)

Componentes "sem chrome" (`AIInsightCard`, `WeeklyReviewCard`, `CurrentWeekPlan`) — decidir conforme
`standardize-card-foundation` Open Questions: passam a envolver o próprio conteúdo em `<Card>` ou
documentam a composição "sem chrome" como padrão válido (então não migram, mas o `tasks.md` registra
a decisão).

## Impacto

- Só frontend, só os arquivos listados acima. Nenhum contrato de API, nenhuma mudança de banco.
- Sem mudança de comportamento visível ao coach/atleta além de consistência de raio/borda/fundo —
  qualquer alteração perceptível de contraste (ex.: borda de `surface[700]` para `content.cardBorder`,
  ver `standardize-card-foundation` D3) é revisada visualmente task a task.

## ROI

`ROI = impacto × confiança ÷ esforço`

- **Impacto 1** — puramente visual/consistência, sem mudança de decisão do coach.
- **Confiança 85%** — API já provada em 3 componentes na change anterior; migração é mecânica.
- **Esforço 2** — ~9 arquivos, um a um, com teste de regressão por arquivo; ~1-2 dias.
- **ROI = 1 × 0,85 ÷ 2 = 0,43 → Fazer quando não houver work de maior ROI na fila.**

## Critérios de aceite

- **CA1:** Given cada componente listado em "O que muda", When migrado, Then usa `Card`/`CardHeader`
  da change anterior — sem `borderRadius`, `bgcolor` de borda/fundo ou `boxShadow` literais no próprio
  arquivo.
- **CA2:** Given os testes existentes de cada componente migrado, When a migração é aplicada, Then
  continuam verdes sem mudança de asserção não intencional.
- **CA3:** Given `TreinoCard.tsx`, When migrado, Then usa `<Card variant="glass" stateColor="success|danger">`
  para os estados REALIZADO/PERDIDO — nenhuma concatenação de string de cor restando no arquivo.
- **CA4:** Given `TodayHeroCard.tsx`, When migrado, Then usa uma variante de `Card` definida
  explicitamente (não gradiente solto fora do componente compartilhado).

## Métrica de sucesso

- Todos os ~13 cards da auditoria original usam `Card`/`CardHeader`; `npm run lint && npm run build &&
  npm run test:run` verdes; nenhum `borderRadius`/`bgcolor` de fundo/borda literal restando nos
  arquivos migrados (`grep` de verificação no fechamento).

## Open Questions & Assumptions

- **Aberto:** `AtividadePendenteCard` usa `Accordion`, não `Card`/`Paper` — decidir na task
  correspondente se migra para `Card` (perdendo expand/collapse nativo) ou se recebe só os tokens
  corretos mantendo `Accordion`.
- **Aberto:** variante `hero` para `TodayHeroCard` — se o gradiente for reutilizado por mais de um
  card durante a migração, vira variante oficial de `Card`; se for uso único, fica como `sx` extra
  sobre `flat`.
- **Aberto:** destino de `AIInsightCard`/`WeeklyReviewCard`/`CurrentWeekPlan` (chrome próprio vs.
  padrão "sem chrome" documentado) — decidir no início da implementação, antes de tocar qualquer um
  dos três.

## Fora de escopo

- Resolver o conflito de fonte Inter/Syne.
- Mudar a paleta de cores ou os valores dos tokens.
- Qualquer mudança de comportamento/dado exibido nos cards — só chrome visual.
