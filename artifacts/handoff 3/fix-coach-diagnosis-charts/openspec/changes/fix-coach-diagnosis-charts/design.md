# Design — fix-coach-diagnosis-charts

## D1. Lacuna de registro

**Regra:** ≥ `GAP_MIN_DAYS = 10` dias corridos sem ponto PMC com `tss > 0`, entre dois treinos ou do último treino até hoje (lacuna aberta).

- Descanso planejado raramente passa de 10 dias; taper longo fica abaixo disso. Valor único, exportado, fácil de ajustar.
- Dias antes do primeiro treino da série não são lacuna (é início de histórico).
- Funciona com série densa (backend envia dias com `tss = 0`) e esparsa (backend omite dias).
- Rótulo: **"Sem treinos registrados"**. Não afirma causa (ver Proposta nova).

`detectDataGaps(pmc, hoje) → DataGap[]` em `features/coach/adapters/diagnosisChartsAdapters.ts`.

## D2. Carga semanal em TSS

O perfil (`AtletaPerfilCoachDto`) não traz km por semana: só `roster.weeklyVolume` (7d) e `realizadosRecentes` (7d). A série PMC tem `tss` diário, então a carga semanal é `Σ tss` por semana (segunda a domingo, `startOfWeek(..., { weekStartsOn: 1 })`, mesmo corte de `semanaInicio`).

- Semana inteira dentro de uma lacuna → `tss = null`, `noData = true` (sem barra, área hachurada).
- Semana anterior ao início do histórico → `tss = null`, `noData = false`.
- Semana atual marcada `current = true` (barra em tom mais claro; parcial).

## D3. Aderência — uma fonte

`buildAdherenceWindow(aderenciaSemanal, hoje)` soma `totalRealizado / totalPlanejado` das semanas com `semanaInicio` nas últimas 4 semanas civis (reusa `buildAderenciaResumo`). O tile usa esse valor; `roster.aderenciaPercentual` vira fallback quando o perfil ainda não carregou.

As barras mostram `percentual` por semana das mesmas entradas. KPI e barras usam o mesmo `adherenceTone()` — escala em D9.

## D4. Delta de carga

`calculateLoadDelta7d(pmc, hoje)` = `(Σ tss últimos 7 dias − Σ tss 7 dias anteriores) / Σ anteriores`. `null` quando a base anterior é 0 — tile mostra "Sem base anterior". Por data, não por posição no array.

`calcularLoadDelta` (variação de CTL) continua exportada mas não é mais exibida como carga.

## D5. ACWR com confiança

`assessAcwrConfidence(pmc, gaps, hoje)` → `BAIXA` quando o histórico tem < 28 dias ou uma lacuna toca os últimos 28 dias. Com `BAIXA`, o tile mostra o valor em tom neutro e o delta "Baixa confiança". O cálculo do ACWR não muda.

## D6. PMCChart

Modelo puro em `features/athlete/adapters/pmcChartModel.ts`:

- **Densifica** a série por dia no intervalo do período (dias ausentes viram linha `missing`). Eixo X categórico diário fica proporcional ao tempo e `ReferenceArea` sempre encontra `x1/x2`.
- **Período filtra de fato**: últimos N dias a partir do último ponto (`4w`=28 … `1y`=365). Idempotente quando o pai já busca por período.
- **Ticks**: 1 por semana contando do último dia (6m/1a: a cada 4 semanas).
- **Lacuna**: `ReferenceArea` hachurada com rótulo; cada série tem `xSolid` (fora da lacuna) e `xEst` (dentro + vizinhos), desenhada tracejada. Os valores dentro da lacuna são os do backend (decaimento); o tracejado diz que são estimados.

Componente:

- Props novas, todas opcionais: `gaps`, `embedded` (sem vidro/título, para viver dentro de `SectionCard`), `simpleMetric: 'tss' | 'forma'`, `ranges`.
- Avançado: legenda no topo com valor atual de cada série (substitui `Legend` do rodapé).
- Simples `forma`: barras de TSB coloridas por `FAIXA_APRESENTACAO[statusForma].tone` — classificação vem do backend por ponto, nenhum limiar no front.
- Forma em `surface[50]`; Condicionamento `success`, Cansaço `danger`.

`pmcAdapter` passa a copiar `statusForma`.

## D7. Layout da aba Diagnóstico

Ordem mantida (situação → evidência → ação → detalhe):

1. Sinais de atenção
2. Métricas (Carga aguda, Monotonia, Strain, Recuperação)
3. **Adesão e carga por semana** (novo, substitui 2 cards)
4. **Forma (PMC)** (renomeado de "Tendência de forma (PMC)")
5. Próximo treino
6. Limiares

## D8. Cabeçalho e faixa de KPIs (layout da Proposta)

- Cabeçalho: identidade à esquerda; **próxima prova** + ação primária à direita. Sai "Aderência geral / Carga semanal" (RC7).
- Faixa: 4 células largas (`AthleteKpiStrip`) no lugar dos 5 `MetricTile compact`. A linha de apoio tinha `noWrap` e cortava a base do número; agora quebra em até 2 linhas.
- Células: rótulo + qualificador ("Aderência · 4 sem", "Carga · 7 dias", "Forma · TSB", "ACWR"), valor na cor do tom com o marcador de `toneMarker`, linha de apoio.
- ACWR com baixa confiança: selo "Baixa confiança" ao lado do valor e o motivo (`acwrConfidence.reason`) na linha de apoio.
- Números em pt-BR (vírgula decimal) nas células.
- Toda a regra de texto/tom fica em `athleteKpiAdapters.ts` — a página só monta.
- Carga: a Proposta visual compara km com km; o perfil não traz km dos 7 dias anteriores, então a comparação é em TSS e o texto diz isso.

## D9. Cards do Diagnóstico e escala de adesão (padrão da Proposta)

- **`DiagnosisChartCard`** substitui o `SectionCard` nos dois gráficos: título 14px/600 em caixa normal, subtítulo 12px que diz o que é medido e em que unidade, ação à direita na mesma linha (legenda ou controles), sem barra de cabeçalho. Fundo `elevation.card`, borda `content.cardBorder`, raio 8px.
- **Adesão e carga por semana** — ação: `AdherenceToneLegend` (some quando não há semana com plano). Subtítulo: "Últimas 12 semanas · acima: adesão (treinos feitos / planejados) · abaixo: carga em TSS".
- **Forma (PMC)** — ação: `PmcChartControls` (Simples/Avançado + 4s/8s/12s), em arquivo próprio sem recharts para o `PMCChart` continuar lazy. Modo e período ficam no `DiagnosisTabPanel`; o `PMCChart` embutido é controlado (`mode`, `range`) e não desenha controles. Subtítulo muda com o modo. Simples mostra a legenda das faixas.
- **Escala de adesão (Proposta):** ≥ 90% success · 70–89% neutro · 40–69% warning · < 40% danger. A Proposta usava lime em 70–89%; lime é reservado (`forbidden-uses.ts`), então fica neutro claro. `adherenceTone` é a fonte única — vale para as barras e para a célula de KPI.
- Eixo Y da adesão fixo em 0 / 50 / 100%; rótulo de % acima de cada barra; semana sem plano não tem barra.

## Riscos

- **Unidade de `totalPlanejado`** — assumido "treinos". Confirmar com o backend; se for km, trocar o texto do tile.
- **Limiar de 10 dias** pode marcar como lacuna um atleta lesionado em repouso — o rótulo neutro cobre esse caso.
- **Telas do atleta** mudam levemente (período filtra, cor da Forma, legenda). Revisar `StrongerBlock` e `CoachAthleteProfilePage` visualmente.
