# fix-coach-diagnosis-charts — handoff

Correção dos gráficos e KPIs da aba **Diagnóstico** (Inbox do coach → atleta).

## Estrutura

```
openspec/changes/fix-coach-diagnosis-charts/   → copiar para menthoros-product/openspec/changes/
  proposal.md   causa raiz (RC1–RC8), ROI, Proposta nova
  design.md     decisões D1–D7 e riscos
  specs/coach-athlete-diagnosis/spec.md
  tasks.md

menthoros-front/src/                            → copiar por cima de apps/menthoros-front/src/
  features/coach/types/CoachInbox.ts                         (substitui)
  features/coach/adapters/diagnosisChartsAdapters.ts         (novo)
  features/coach/adapters/diagnosisChartsAdapters.test.ts    (novo)
  features/coach/adapters/athleteKpiAdapters.ts              (novo)
  features/coach/adapters/athleteKpiAdapters.test.ts         (novo)
  features/coach/components/AthleteKpiStrip.tsx              (novo)
  features/coach/components/AthleteNextRace.tsx              (novo)
  features/coach/components/AthleteKpiStrip.test.tsx         (novo)
  features/coach/components/DiagnosisChartCard.tsx           (novo)
  features/athlete/components/PmcChartControls.tsx           (novo)
  features/coach/components/WeeklyAdherenceLoadChart.tsx     (novo)
  features/coach/components/WeeklyAdherenceLoadChart.test.tsx(novo)
  features/coach/components/panels/DiagnosisTabPanel.tsx     (substitui)
  features/coach/components/panels/DiagnosisTabPanel.test.tsx(substitui)
  features/athlete/adapters/pmcChartModel.ts                 (novo)
  features/athlete/adapters/pmcChartModel.test.ts            (novo)
  features/athlete/adapters/pmcAdapter.ts                    (substitui)
  features/athlete/components/PMCChart.tsx                   (substitui)

PATCHES.md   edições por trecho em coachInboxAdapters.ts e CoachInboxPage.tsx (+ testes sugeridos)
CLAUDE_CODE.md   como colocar no workspace + prompt pronto para o Claude Code
PATCH-v2.md      delta sobre a versão já implementada (lacuna × adesão, escala 90/70/40, cards, eixos/fonte)

design/      referência visual — HTML de design, não código de produção
  Revisao Graficos Atleta.dc.html   abrir no navegador (support.js ao lado)
  proposta.png                      captura da tela proposta
```

## Aplicar

1. Branch no `apps/menthoros-front` (fluxo OpenSpec-first da raiz; promoção da change é Gate-3 do founder).
2. Copiar `menthoros-front/src/**` por cima.
3. Aplicar `PATCHES.md`.
4. `npm run lint && npm run build && npm run test:run`.

## Não validado aqui

Escrito contra o código lido em 28/09, sem rodar `tsc`/`vitest` localmente. Pontos a conferir:

- `recharts@3.8`: `ReferenceArea` em eixo categórico com `x1/x2` numéricos (PMC) e string (semanas); `ticks` explícitos em eixo categórico.
- `coachInboxAdapters.test.ts`: expectativas de `adherence` em `buildSelectedAthleteFromDashboard` podem mudar (agora vem da janela do perfil).
- Unidade de `totalPlanejado` (assumido: treinos).
