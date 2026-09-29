# Tasks — fix-coach-diagnosis-charts

Branch `feature/fix-coach-diagnosis-charts` (front), base `a5ad152`. DoR: spec-reviewer READY WITH NOTES +
Codex READY (2ª rodada), 28/09.

**Ordem:** 1 → 2 → 3 → 4 → 5. O bloco 1 cria tipos e adapters que 3 e 4 consomem; o 2 é independente
do 1, exceto `DataGap`, e precisa vir antes do 3.2. Um commit por bloco.

**Código de partida:** o handoff (`menthoros-product/artifacts/handoff/fix-coach-diagnosis-charts/`) é
rascunho, **sem** as correções dos pré-mortems. Em cada task o teste vem primeiro, a partir da spec;
o arquivo do handoff é copiado e ajustado até os testes passarem. Nunca copiar o teste do handoff sem os
casos novos.

## 1. Adapters e tipos
- [x] 1.1 `types/CoachInbox.ts`: `DataGap`, `WeeklyDiagnosisPoint`, `AdherenceWindow`, `AcwrConfidence`; `loadDelta: number | null`; campos `adherenceWindow`, `weeklyDiagnosis`, `dataGaps`, `quickStats.acwrConfidence`
  - verify: `npm run build` sem erro de tipo (campos novos opcionais onde o roster não os traz)
- [x] 1.2 `adapters/diagnosisChartsAdapters.ts` + testes (lacunas, semanas, aderência 4 sem, delta 7d, confiança ACWR, legenda de lacuna). Casos do pré-mortem: plano futuro fora da janela de 4 sem.; série densa com zeros iniciais → ACWR `BAIXA`; mesmo resultado com `hoje` à 00:05 e às 15:30; dois treinos no mesmo dia = 1 dia com treino; 8 semanas no eixo; `avisos` com `aderenciaSemanal`/`pmc` → `adherenceAvailable`/`pmcAvailable = false`, sem semana "sem plano" nem lacuna
  - verify: `vitest run diagnosisChartsAdapters` verde; cada caso do pré-mortem com teste nomeado que falhou antes (vermelho registrado)
- [x] 1.3 `coachInboxAdapters.ts`: ligar os novos adapters em `buildSelectedAthleteFromDashboard` e defaults em `buildRosterRowFromSummary` (ver `PATCHES.md`)
  - verify: `vitest run coachInboxAdapters` verde; expectativas de `adherence`/`loadDelta` revisadas (absorve a 5.2)
- [x] 1.4 `athlete/adapters/pmcAdapter.ts`: copiar `statusForma`
  - verify: teste do `pmcAdapter` cobre `statusForma` copiado
- [x] 1.5 Validação: `npm run lint && npm run build && npm run test:run`
  - nota: `loadDelta` virou `number | null`. Os três consumidores antigos (card "Tendência de carga", bloco do cabeçalho e tile Carga) usam `?? 0` provisoriamente para o commit compilar; saem nas tasks 3.2, 4.1 e 4.3

## 2. PMCChart
- [x] 2.1 `athlete/adapters/pmcChartModel.ts` + testes (densificação, filtro por período, ticks, lacunas, séries sólida/estimada). Caso do pré-mortem: série esparsa com último ponto há 12 dias → eixo termina hoje, a área da lacuna aberta aparece e a linha fica `null` nos dias sem valor (sem tracejado inventado)
  - verify: `vitest run pmcChartModel` verde, incluindo série densa, esparsa e lacuna aberta
- [x] 2.2 `PMCChart.tsx`: props `gaps`, `embedded`, `simpleMetric`, `ranges` (padrão `4w`/`8w`/`12w`; `6m`/`1a` fora até alguma tela buscar por período); legenda com valor; Forma fora do lime; estado "Dado indisponível"
  - verify: teste de componente novo `PMCChart.test.tsx` (não existe hoje): seletor só 4s/8s/12s; legenda com valor atual; estado "Dado indisponível"
- [~] 2.3 Revisão visual em `CoachAthleteProfilePage`, `StrongerBlock` e `AthleteProgressPage`. Saída: o seletor de período muda o intervalo visível; a Forma não aparece em lime; título e legenda continuam visíveis
  - verify: navegação manual nas 3 telas com a skill `run`; print anexado ao relatório da task
  - adiada para depois do bloco 3: a aba Diagnóstico também muda, e uma navegação só cobre as quatro telas
  - resultado (29/09): `CoachAthleteProfilePage` conferida no navegador com dados reais — seletor só 4s/8s/12s e o período filtra (12s: 14/07–29/09; 4s: 08/09–29/09), Forma em off-white, título e legenda com valor presentes. `AthleteProgressPage`/`StrongerBlock` exigem login de atleta, não disponível na sessão: ficam cobertas só pela 2.4 (não-regressão em teste); conferir no primeiro acesso de atleta em homologação
- [x] 2.4 Teste de não-regressão do `PMCChart` compartilhado: sem `gaps`/`embedded`, o componente mantém título, seletor de período e modos nas telas do atleta (`StrongerBlock`, `CoachAthleteProfilePage`, `AthleteProgressPage`)
  - verify: `progressBlocks.test.tsx`, `AthleteProgressPage.test.tsx` e `CoachAthleteProfilePage.test.tsx` verdes sem alterar asserções existentes
- [x] 2.5 Validação: `npm run lint && npm run build && npm run test:run`

## 3. Diagnóstico
- [x] 3.1 `components/WeeklyAdherenceLoadChart.tsx` + teste (inclui "Dado indisponível" separado de "Sem plano na semana")
  - verify: `vitest run WeeklyAdherenceLoadChart` verde (tooltip, semana sem plano, indisponível, lacuna)
- [x] 3.2 `DiagnosisTabPanel.tsx`: substituir "Adesão nas últimas semanas" + "Tendência de carga" por "Adesão e carga por semana"; "Forma (PMC)" com `embedded`, `gaps`, `simpleMetric="forma"`
  - verify: coberto pela 3.3
- [x] 3.3 `DiagnosisTabPanel.test.tsx`: ordem das seções com os novos títulos; legenda de lacuna
  - verify: `vitest run DiagnosisTabPanel` verde
- [x] 3.4 Validação: `npm run lint && npm run build && npm run test:run`
  - nota: `CoachInboxPage.test.tsx` tinha asserções com os títulos antigos ("Adesão nas últimas semanas", "Tendência de carga", "Tendência de forma (PMC)"); atualizadas para os títulos novos, sem afrouxar o que verificam

## 4. Cabeçalho e tiles (`CoachInboxPage.tsx`)
- [x] 4.1 Remover bloco "Aderência geral / Carga semanal"
  - verify: teste da 4.6
- [x] 4.2 Aderência: "X de Y · 4 sem."; disponibilidade própria, separada de `hasWindowData` (PMC); fallback `roster.aderenciaPercentual` visível sem perfil; "Dado indisponível" quando `avisos` traz `aderenciaSemanal`. Revisar a expectativa em `CoachInboxPage.test.tsx:283`
  - verify: testes em `CoachInboxPage.test.tsx` para perfil sem PMC, sem perfil (fallback) e `avisos` com `aderenciaSemanal`
- [x] 4.3 Carga (7d): delta TSS 7d; "Sem base de comparação"
  - verify: teste do tile com base anterior 0 e com delta positivo
- [x] 4.4 Forma: TSB com 1 casa
  - verify: teste do tile com TSB `-13.61` → `-13.6`
- [x] 4.5 ACWR: "Baixa confiança" neutro
  - verify: teste da 4.6
- [x] 4.6 `CoachInboxPage.test.tsx`: cabeçalho sem "Aderência geral"; ACWR baixa confiança
  - verify: `vitest run CoachInboxPage` verde
  - nota: o teste "com dado na janela, zero legítimo de aderência continua numérico" dependia do PMC para mostrar 0%; foi reescrito como "0 de 4 treinos" sem PMC, como a 4.2 pedia. A lógica do tile de aderência virou `buildAdherenceTile` no adapter

## 5. Validação
- [x] 5.1 `npm run lint`, `npm run build`, `npm run test:run`
  - verify: os três comandos saem com código 0
- [x] 5.2 Ajustar expectativas existentes de `adherence` em `coachInboxAdapters.test.ts` — não havia teste de `buildSelectedAthleteFromDashboard`; a 1.3 criou os 8 casos
- [x] 5.3 Conferir com backend a unidade de `totalPlanejado` — treinos (`AderenciasSemanalDto`, conferido em 28/09)
- [x] 5.4 E2E: não é fluxo crítico (leitura, sem escrita no plano) — sem spec nova; smoke `tests/e2e/coach` deve continuar verde
  - verify: `npx playwright test tests/e2e/coach/inbox.spec.ts` verde
  - resultado (29/09): `tests/e2e/coach` inteiro, 50/51 na primeira rodada; a falha (`workout-profile.spec.ts`, timeout esperando "Atleta Teste" na Revisão de planos, fora do diff) não se repetiu em `--repeat-each=2` (30/30) — intermitente

## 5b. Aderência sem a semana em curso (revisão de 28/09)
- [x] 5b.1 `buildAdherenceWindow`: 4 semanas completas, sem a semana em curso; tile "X de Y · 4 sem. completas"
  - verify: testes do adapter e da página com a semana atual em 0 de 4 → KPI inalterado
- [x] 5b.2 Gráfico semanal: barra da semana atual em tom neutro; tooltip "semana em curso"
  - verify: teste de `describeWeek` e do tom da semana atual
- [x] 5b.3 Validação: `npm run lint && npm run build && npm run test:run`

## 5c. Cabeçalho e faixa de KPIs da Proposta (handoff 2, D8)
- [x] 5c.1 `adapters/athleteKpiAdapters.ts` + testes: 4 KPIs (valor, linha de apoio, tom, selo) e próxima prova do cabeçalho. Aderência preserva as regras do bloco 4 (independe do PMC, "Dado indisponível", roster só sem perfil); texto "X de Y treinos planejados"
  - verify: `vitest run athleteKpiAdapters` verde
- [x] 5c.2 `components/AthleteKpiStrip.tsx` e `components/AthleteNextRace.tsx` + testes (marcador acessível, selo, sem prova)
  - verify: `vitest run AthleteKpiStrip` verde
- [x] 5c.3 `CoachInboxPage.tsx`: próxima prova no cabeçalho antes da ação primária; 5 `MetricTile compact` → `AthleteKpiStrip`
  - verify: `CoachInboxPage.test.tsx` com seletores `kpi-*` e `inbox-proxima-prova`; números com vírgula
- [x] 5c.4 Validação: `npm run lint && npm run build && npm run test:run`

## 5d. Seção Métricas no padrão da faixa (pedido de 28/09)
- [x] 5d.0 Tooltip duplicado no gráfico semanal: os dois painéis (sync) mostravam o texto; fica só um
  - verify: `WeeklyAdherenceLoadChart.tooltip.test.tsx`
- [x] 5d.1 Monotonia e Strain pelos 7 dias civis (não pelas 7 posições do array); `null` com menos de 3 dias com treino, em vez de 1,00
  - verify: testes de `calcularMonotonia`/`calcularStrain` com série esparsa (último ponto há 12 dias) e com 2 dias de treino
- [x] 5d.2 Carga aguda em TSS/dia (é o ATL), tom neutro; sai o limiar de 120 km, que era de outra unidade
- [x] 5d.3 "Recuperação" (era a aderência da última semana) trocada por "Forma prevista na prova" (`racePrediction`)
- [x] 5d.4 `DiagnosisTabPanel`: as 4 métricas em células do mesmo padrão da faixa (rótulo · qualificador, valor, linha de apoio, marcador); regras em adapter
  - verify: `DiagnosisTabPanel.test.tsx` com os novos rótulos e "Sem base" 
- [x] 5d.5 Validação: `npm run lint && npm run build && npm run test:run`

## 7. Km por semana (backend + front, pedido de 28/09)
Branch `feature/fix-coach-diagnosis-charts` também no backend (base `0f66d50`). PRs coordenados: o
backend entra primeiro; o front degrada sem o campo (continua em TSS).
- [x] 7.1 Backend: `AtletaProgressService.getDistanceSummary(atletaId, weeks)` → `DistanceSummaryDto(weekly[weekStart, distanceKm], last7DaysKm, previous7DaysKm)`; semanas ISO contínuas com 0; exclui cancelados (`contaNaCarga`); tenant-scoped
  - verify: `AtletaProgressServiceImplTest` (semana vazia = 0, borda de semana, cancelado fora, 7d/7d anteriores, atleta de outro tenant)
- [x] 7.2 Backend: campo `distanceSummary` no `AtletaPerfilCoachOutputDto`, via `buscarNullable` (falha → `avisos`)
  - verify: `CoachAthleteProfileServiceImplTest` (preenchido e falha parcial); `mvn verify`
- [x] 7.3 Front: tipo + `weeklyDiagnosis.distanceKm`; painel inferior do gráfico semanal em km quando o campo existe (TSS no tooltip); célula Carga compara km com km ("+36% vs. 7 dias anteriores (3,7 km)")
  - verify: testes do adapter, do gráfico e de `athleteKpiAdapters`; sem o campo, comportamento atual
- [x] 7.4 Validação dos dois repos

## 8. Patch v2 da Proposta (handoff 3, 29/09)
- [x] 8.1 Lacuna × adesão: `DataGap.kind` (`SEM_REGISTRO` | `SEM_TSS`); semana com treino realizado ou km dentro da lacuna não é "sem registro" (mostra adesão e km, sem TSS); legenda, motivo do ACWR e rótulo do PMC dizem "sem carga (TSS)"
  - verify: testes de `classifyGaps`, `buildWeeklyDiagnosis` (semana na lacuna com treino), `formatGapCaption` e `assessAcwrConfidence`
- [x] 8.2 Escala de adesão em 4 faixas (≥90 / 70–89 / 40–69 / <40); 70–89 neutro (lime é reservado)
  - verify: BVA 90/89/70/69/40/39 em `adherenceTone`; legenda com 4 itens
- [x] 8.3 `DiagnosisChartCard` nos dois gráficos (título, subtítulo com a unidade, ação à direita); legenda de adesão e `PmcChartControls` no cabeçalho; `PMCChart` com modo controlado quando embutido — sem trazer do pacote o `ranges` padrão com 6m/1a nem a remoção de `unavailable`
  - verify: `DiagnosisTabPanel.test.tsx` (subtítulo, legenda, controles no cabeçalho); não-regressão das telas do atleta
- [x] 8.4 Eixos sem sufixo "km" (o rótulo do painel já diz) e fonte de texto nos SVGs dos gráficos
- [x] 8.5 Validação + conferência no navegador com o atleta da captura
- [x] 8.6 Barra da semana em curso segue a escala (antes neutra, 5b.2): pedido do founder após a conferência de 29/09
- [x] 8.7 "Próximo treino" mostrava `treinos[0]` (segunda, já passado, numa terça); agora é o primeiro PENDENTE de hoje em diante, com "Hoje"/"Amanhã"/dia por extenso
- [x] 8.8 Dias até a prova por dia civil (antes somava um dia pela manhã)
- [x] 8.9 Fora do escopo, por decisão do founder em 29/09: ponto de sugestão pendente na tela Atletas ficava na divisória entre linhas (wrapper do avatar esticava até a altura da célula). Corrigido nesta branch; é da change arquivada `add-pending-suggestion-badge`
- [x] 8.10 Fora do escopo, a pedido do founder (29/09): ponto de sugestão pendente em 6px, laranja do status Atenção; KPIs da tela Atletas e do resumo do topo do Inbox na faixa (`KpiStrip`) com ícones por métrica
- [x] 8.11 Achados da /qa (29/09), conferidos no código: `getDistanceSummary` soma km por dia no banco (projeção; antes materializava treinos com `sensacoes` EAGER — Claude + Codex), valida `weeks` em [1, 104] e consulta desde hoje−13 para não truncar as janelas de 7 dias (Claude + Codex); `classifyGaps` só conta semana inteira dentro da lacuna (Codex); spec da Carga atualizada para km

## 6. Pós-deploy
- [ ] 6.1 Perguntar a ≥3 coaches, em até 2 semanas após o deploy, "consegue dizer se o atleta está treinando menos ou parou olhando só a aba Diagnóstico?" (sim/não + motivo) e registrar as respostas aqui antes de arquivar

## 9. Follow-ups técnicos da /qa (29/09)
- [x] 9.1 Perfil: bloco degradável em transação própria (REQUIRES_NEW, readOnly) — falha interna virava `UnexpectedRollbackException` em vez de aviso
  - verify: `CoachAthleteProfileDegradacaoIT` (vermelho reproduzido antes da correção)
- [x] 9.2 `PMCChart`: ponto isolado (série esparsa) ganha marcador
  - verify: `pmcChartModel.test.ts` (isolated)
- [x] 9.3 `PMCChart`: "Sem dados no período selecionado" quando o período cai todo antes da série
  - verify: `pmcChartModel.test.ts` (hasValues) e `PMCChart.test.tsx`
- [x] 9.4 `toneColor` em `theme/`, `KpiView` em `types/Kpi.ts`, formatadores em `adapters/format.ts`
- [x] 9.5 Removidos `TrendCard`, `loadTrend` e `adherenceTrend` (sem consumidor)

## Follow-ups
Mudam regra ou contrato — cada um vira change própria no OpenSpec (decisão do founder em 29/09):
- Monotonia de Foster com dias de descanso (TSS 0) no desvio — hoje só TSS positivos, conforme CLAUDE.md do front
- Aderência no backend contando só treinos com data até hoje (perfil e roster): hoje os dois contam treinos ainda por vir da semana em curso. Com isso a semana atual volta ao KPI
- `ultimaSincronizacaoEm` + motivo `SEM_SINCRONIZACAO` (Proposta nova)
