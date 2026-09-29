# Tasks — fix-coach-diagnosis-charts

## 1. Adapters e tipos
- [ ] 1.1 `types/CoachInbox.ts`: `DataGap`, `WeeklyDiagnosisPoint`, `AdherenceWindow`, `AcwrConfidence`; `loadDelta: number | null`; campos `adherenceWindow`, `weeklyDiagnosis`, `dataGaps`, `quickStats.acwrConfidence`
- [ ] 1.2 `adapters/diagnosisChartsAdapters.ts` + testes (lacunas, semanas, aderência 4 sem, delta 7d, confiança ACWR, legenda de lacuna)
- [ ] 1.3 `coachInboxAdapters.ts`: ligar os novos adapters em `buildSelectedAthleteFromDashboard` e defaults em `buildRosterRowFromSummary` (ver `PATCHES.md`)
- [ ] 1.4 `athlete/adapters/pmcAdapter.ts`: copiar `statusForma`

## 2. PMCChart
- [ ] 2.1 `athlete/adapters/pmcChartModel.ts` + testes (densificação, filtro por período, ticks, lacunas, séries sólida/estimada)
- [ ] 2.2 `PMCChart.tsx`: props `gaps`, `embedded`, `simpleMetric`, `ranges`; legenda com valor; Forma fora do lime
- [ ] 2.3 Revisão visual em `CoachAthleteProfilePage` e `StrongerBlock` (período agora filtra)

## 3. Diagnóstico
- [ ] 3.1 `components/WeeklyAdherenceLoadChart.tsx` + teste
- [ ] 3.2 `DiagnosisTabPanel.tsx`: substituir "Adesão nas últimas semanas" + "Tendência de carga" por "Adesão e carga por semana"; "Forma (PMC)" com `embedded`, `gaps`, `simpleMetric="forma"`
- [ ] 3.3 `DiagnosisTabPanel.test.tsx`: ordem das seções com os novos títulos; legenda de lacuna
- [ ] 3.4 `components/DiagnosisChartCard.tsx` (padrão de card da Proposta) nos dois gráficos
- [ ] 3.5 `athlete/components/PmcChartControls.tsx` (sem recharts) no cabeçalho do card de Forma; `PMCChart` embutido controlado por `mode`/`range`
- [ ] 3.6 Escala de adesão 90/70/40 em `adherenceTone` + `AdherenceToneLegend`

## 4. Cabeçalho e faixa de KPIs (`CoachInboxPage.tsx`)
- [ ] 4.1 `adapters/athleteKpiAdapters.ts` + testes (valor, base, tom, selo; próxima prova)
- [ ] 4.2 `components/AthleteKpiStrip.tsx` e `components/AthleteNextRace.tsx` + testes
- [ ] 4.3 Remover bloco "Aderência geral / Carga semanal"
- [ ] 4.4 Próxima prova no cabeçalho, antes da ação primária
- [ ] 4.5 Trocar os 5 `MetricTile compact` por `AthleteKpiStrip` (4 células)
- [ ] 4.6 `CoachInboxPage.test.tsx`: ajustar seletores dos tiles para `kpi-*`; testes novos de cabeçalho e ACWR

## 5. Validação
- [ ] 5.1 `npm run lint`, `npm run build`, `npm run test:run`
- [ ] 5.2 Ajustar expectativas existentes de `adherence` em `coachInboxAdapters.test.ts`, se houver (agora vem da janela do perfil)
- [ ] 5.3 Conferir com backend a unidade de `totalPlanejado` (assumido: treinos)
- [ ] 5.4 E2E: não é fluxo crítico (leitura, sem escrita no plano) — sem spec nova; smoke `tests/e2e/coach` deve continuar verde

## Follow-ups
- Km por semana no perfil (backend) para exibir volume junto de TSS
- Remover `loadTrend`, `adherenceTrend` e `TrendCard` se não houver outro consumidor
- `ultimaSincronizacaoEm` + motivo `SEM_SINCRONIZACAO` (Proposta nova)
