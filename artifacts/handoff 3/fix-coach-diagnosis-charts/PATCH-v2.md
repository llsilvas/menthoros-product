# Patch v2 — sobre a versão atual do front

Base: working copy local em 29/09 (Diagnóstico já com `KpiStrip`, km via `distanceSummary`, 8 semanas, flags `adherenceAvailable`/`pmcAvailable`). Essas decisões ficam; este patch cobre só o que ainda diverge da Proposta e a contradição de dados vista na captura.

**Mantido de propósito (não mexer):**
- 8 semanas (`DIAGNOSIS_WEEKS = 8`) — cobertura real de `aderenciaSemanal`.
- Semana em curso neutra na barra de adesão (`weeklyAdherenceTone`) e fora da janela de 4 semanas.
- Km no painel de carga quando `distanceSummary` existe; TSS como fallback.

---

## 1. Lacuna × adesão (bug)

Na captura, "Sem treinos registrados de 15/07 a 14/09" convive com semanas de 75–100% de adesão dentro da área hachurada. A lacuna é detectada só por TSS; treinos realizados sem TSS (manual, sem potência/FC) somem. Regra nova: **semana com treino realizado ou km não é "sem registro"** — é "sem carga (TSS)".

### 1a. `types/CoachInbox.ts` — tipo da lacuna

Substituir:
```ts
  open: boolean;
```
(dentro de `interface DataGap`) Por:
```ts
  open: boolean;
  /**
   * `SEM_REGISTRO`: nada registrado. `SEM_TSS`: houve treino (aderência ou km) mas sem carga — a
   * série PMC fica vazia do mesmo jeito, só que "o atleta parou" seria falso.
   */
  kind: 'SEM_REGISTRO' | 'SEM_TSS';
```

### 1b. `adapters/diagnosisChartsAdapters.ts`

Em `detectDataGaps`, os dois `gaps.push({ ... })` ganham `kind: 'SEM_REGISTRO'`:
```ts
gaps.push({ start: ..., end: ..., days: dias, open: false, kind: 'SEM_REGISTRO' });
gaps.push({ start: ..., end: ..., days: diasAberto, open: true, kind: 'SEM_REGISTRO' });
```

Adicionar logo após `detectDataGaps`:
```ts
/**
 * Reclassifica lacunas de TSS em que houve treino: semana com `totalRealizado > 0` ou km > 0
 * dentro da lacuna → `SEM_TSS`. Sem isso, a legenda diz "sem treinos" ao lado de barras de 75%.
 */
export function classifyGaps(
  gaps: DataGap[],
  aderencia: AderenciasSemanalDto[],
  distance: DistanceSummaryDto | null,
): DataGap[] {
  const semanasComTreino = [
    ...aderencia.filter((a) => a.totalRealizado > 0).map((a) => startOfWeek(parseISO(a.semanaInicio), WEEK)),
    ...(distance?.weekly ?? []).filter((w) => w.distanceKm > 0).map((w) => startOfWeek(parseISO(w.weekStart), WEEK)),
  ];
  return gaps.map((g) => {
    const ini = startOfWeek(parseISO(g.start), WEEK);
    const fim = parseISO(g.end);
    const houveTreino = semanasComTreino.some((s) => s >= ini && s <= fim);
    return houveTreino ? { ...g, kind: 'SEM_TSS' } : g;
  });
}
```

Em `buildWeeklyDiagnosis`, substituir:
```ts
    const noData = lacunas.some((g) => g.start <= inicio && g.end >= fimEfetivo);
    const antesDoHistorico = inicioHistorico == null || fim < inicioHistorico;
    const carga = cargaPorSemana.get(chave);
    const semCarga = noData || antesDoHistorico;
    const plano = aderenciaPorSemana.get(chave);
```
Por:
```ts
    const plano = aderenciaPorSemana.get(chave);
    const km = kmPorSemana.get(chave) ?? null;
    const houveTreino = (plano?.totalRealizado ?? 0) > 0 || (km ?? 0) > 0;
    const naLacuna = lacunas.some((g) => g.start <= inicio && g.end >= fimEfetivo);
    // Treino sem TSS não é "sem registro": a semana mostra adesão e km, só não tem carga.
    const noData = naLacuna && !houveTreino;
    const antesDoHistorico = inicioHistorico == null || fim < inicioHistorico;
    const carga = cargaPorSemana.get(chave);
    const semCarga = naLacuna || antesDoHistorico;
```
E substituir:
```ts
      distanceKm: noData ? null : kmPorSemana.get(chave) ?? null,
```
Por:
```ts
      distanceKm: km,
```

Em `assessAcwrConfidence`, substituir:
```ts
    return { level: 'BAIXA', reason: `Base crônica incompleta: ${recente.days} dias sem treinos registrados` };
```
Por:
```ts
    const motivo = recente.kind === 'SEM_TSS' ? 'sem carga (TSS) registrada' : 'sem treinos registrados';
    return { level: 'BAIXA', reason: `Base crônica incompleta: ${recente.days} dias ${motivo}` };
```

Substituir `formatGapCaption` inteiro por:
```ts
export function formatGapCaption(gap: DataGap): string {
  const inicio = toLabel(parseISO(gap.start));
  const oque = gap.kind === 'SEM_TSS' ? 'Treinos sem carga (TSS) registrada' : 'Sem treinos registrados';
  if (gap.open) return `${oque} desde ${inicio} (${gap.days} dias)`;
  return `${oque} de ${inicio} a ${toLabel(parseISO(gap.end))} (${gap.days} dias)`;
}
```

### 1c. `adapters/coachInboxAdapters.ts`

Substituir:
```ts
  const dataGaps = detectDataGaps(pmcPoints, hoje);
```
Por:
```ts
  const dataGaps = classifyGaps(detectDataGaps(pmcPoints, hoje), adherencePoints, distance);
```
e adicionar `classifyGaps` ao import de `./diagnosisChartsAdapters`. Se `distance` for declarado depois dessa linha, mova a declaração para antes.

### 1d. PMC — rótulo da lacuna

Em `PMCChart.tsx`, `GAP_LABEL = 'Sem treinos registrados'` → `'Sem carga registrada'`. É verdade nos dois tipos de lacuna (no PMC, o que falta é TSS).

### 1e. Testes (`diagnosisChartsAdapters.test.ts`)

```ts
describe('classifyGaps', () => {
  const gap = { start: '2026-07-16', end: '2026-09-13', days: 60, open: false, kind: 'SEM_REGISTRO' as const };

  it('treino realizado dentro da lacuna → SEM_TSS', () => {
    const aderencia = [{ semanaInicio: '2026-08-10', totalPlanejado: 4, totalRealizado: 3, percentual: 75 }];
    expect(classifyGaps([gap], aderencia, null)[0].kind).toBe('SEM_TSS');
  });

  it('km dentro da lacuna → SEM_TSS', () => {
    const distance = { weekly: [{ weekStart: '2026-08-17', distanceKm: 12 }] } as unknown as DistanceSummaryDto;
    expect(classifyGaps([gap], [], distance)[0].kind).toBe('SEM_TSS');
  });

  it('plano sem realização continua SEM_REGISTRO', () => {
    const aderencia = [{ semanaInicio: '2026-08-10', totalPlanejado: 4, totalRealizado: 0, percentual: 0 }];
    expect(classifyGaps([gap], aderencia, null)[0].kind).toBe('SEM_REGISTRO');
  });
});

it('buildWeeklyDiagnosis: semana na lacuna com treino não é noData e mantém km', () => {
  // pmc sem TSS de 16/07 a 13/09; aderência 10/08 com 3 realizados; km 10/08 = 12
  // espera: semana 10/08 → { noData: false, tss: null, adherence: 75, distanceKm: 12 }
});

it('formatGapCaption SEM_TSS', () => {
  expect(formatGapCaption({ start: '2026-07-16', end: '2026-09-13', days: 60, open: false, kind: 'SEM_TSS' }))
    .toBe('Treinos sem carga (TSS) registrada de 16/07 a 13/09 (60 dias)');
});
```
Fixtures existentes de `DataGap` ganham `kind: 'SEM_REGISTRO'`.

---

## 2. Escala de adesão da Proposta (4 faixas)

`diagnosisChartsAdapters.ts` — substituir `adherenceTone`:
```ts
/** Tom da aderência — o mesmo para a célula de KPI e para as barras. Escala da Proposta. */
export function adherenceTone(percent: number): MetricTone {
  if (percent >= 90) return 'success';
  if (percent >= 70) return 'neutral';
  if (percent >= 40) return 'warning';
  return 'danger';
}
```
`WeeklyAdherenceLoadChart.tsx` — `TONE_LEGEND`:
```ts
// 70–89% era lime na Proposta; lime é reservado a marca/ação (forbidden-uses.ts) → neutro claro.
const TONE_LEGEND: Array<{ tone: MetricTone; label: string }> = [
  { tone: 'success', label: '≥ 90%' },
  { tone: 'neutral', label: '70–89%' },
  { tone: 'warning', label: '40–69%' },
  { tone: 'danger', label: '< 40%' },
];
```
Atualizar testes de `adherenceTone` (90/89/70/69/40/39) e de `buildAdherenceTile` que dependem do limiar.

---

## 3. Card no padrão da Proposta

Copiar do pacote: `features/coach/components/DiagnosisChartCard.tsx` e `features/athlete/components/PmcChartControls.tsx` (este sem recharts, para o `PMCChart` seguir lazy).

### 3a. Legenda sai de dentro do gráfico

`WeeklyAdherenceLoadChart.tsx`: remover o `<Box>` da legenda no topo do `return` e exportar:
```tsx
/** Legenda da escala de adesão — vai na ação do card, à direita do título. */
export function AdherenceToneLegend() {
  return (
    <Box role="list" aria-label="Escala de adesão" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      {TONE_LEGEND.map((l) => (
        <Box key={l.tone} role="listitem" sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: TONE_COLOR[l.tone] }} />
          <Typography sx={{ fontSize: '0.72rem', color: surface[300] }}>{l.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}
```

### 3b. `PMCChart.tsx` controlado quando embutido

Mesmas edições do `PMCChart.tsx` do pacote (compare e faça merge, não sobrescreva):
- prop `mode?: PMCViewMode`; `const mode = modeProp ?? internalMode`;
- `const activeRange = embedded ? range : internalRange` e o `useMemo` do modelo usa `activeRange`;
- embutido não desenha a linha de controles; não embutido usa `<PmcChartControls …/>`;
- no modo Simples "forma", `FormaLegend` acima do gráfico.

### 3c. `DiagnosisTabPanel.tsx`

Imports:
```tsx
import { WeeklyAdherenceLoadChart, AdherenceToneLegend } from '../WeeklyAdherenceLoadChart';
import { DiagnosisChartCard } from '../DiagnosisChartCard';
import { PmcChartControls } from '../../../athlete/components/PmcChartControls';
import type { PMCViewMode } from '../../../athlete/components/PmcChartControls';
```
Constantes (topo do arquivo):
```tsx
const COACH_PMC_RANGES: PMCRange[] = ['4w', '8w', '12w'];
const PMC_SUBTITLE: Record<PMCViewMode, string> = {
  advanced: 'Condicionamento, cansaço e forma diários',
  simple: 'Forma diária (TSB), colorida pela faixa',
};
```
Estado, junto de `pmcRange`:
```tsx
  const [pmcMode, setPmcMode] = useState<PMCViewMode>('advanced');
  const kmMode = selected.weeklyDiagnosis.some((w) => w.distanceKm != null);
  const weeksSubtitle = `Últimas ${selected.weeklyDiagnosis.length || 8} semanas · acima: adesão (treinos feitos / planejados) · abaixo: carga em ${kmMode ? 'km' : 'TSS'}`;
```
Substituir `<SectionCard title="Adesão e carga por semana"> … </SectionCard>` por:
```tsx
      <DiagnosisChartCard
        title="Adesão e carga por semana"
        subtitle={weeksSubtitle}
        action={selected.adherenceAvailable && selected.weeklyDiagnosis.some((w) => w.adherence != null) ? <AdherenceToneLegend /> : undefined}
      >
        <WeeklyAdherenceLoadChart
          weeks={selected.weeklyDiagnosis}
          gaps={selected.dataGaps}
          adherenceAvailable={selected.adherenceAvailable}
          pmcAvailable={selected.pmcAvailable}
        />
      </DiagnosisChartCard>
```
Substituir `<SectionCard title="Forma (PMC)"> … </SectionCard>` por:
```tsx
      <DiagnosisChartCard
        title="Forma (PMC)"
        subtitle={PMC_SUBTITLE[pmcMode]}
        action={
          selected.pmcAvailable && pmc.length > 0 ? (
            <PmcChartControls mode={pmcMode} onModeChange={setPmcMode} range={pmcRange} onRangeChange={setPmcRange} ranges={COACH_PMC_RANGES} />
          ) : undefined
        }
      >
        {pmc.length > 0 && !pmcNoticeDismissed && <PmcBackfillNotice onDismiss={dismissPmcNotice} />}
        {!selected.pmcAvailable ? (
          <Typography sx={{ fontSize: '0.82rem', color: surface[400] }}>Dado indisponível</Typography>
        ) : pmc.length === 0 ? (
          <Typography sx={{ fontSize: '0.82rem', color: surface[400] }}>Sem histórico de PMC para exibir ainda.</Typography>
        ) : (
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>}>
            <PMCChart data={pmc} range={pmcRange} mode={pmcMode} gaps={pmcGaps} simpleMetric="forma" embedded />
          </Suspense>
        )}
      </DiagnosisChartCard>
```
"Sinais de atenção", "Próximo treino" e "Limiares" continuam em `SectionCard`.

---

## 4. Eixos e fonte

`WeeklyAdherenceLoadChart.tsx`:
- YAxis da carga: remover `tickFormatter={kmMode ? (v: number) => \`${v} km\` : undefined}` — o rótulo do painel já diz "(km)". Era isso que quebrava "16 km" em duas linhas.
- `import { font } from '../../../theme/theme.premium';` e `const TICK = { fontSize: 11, fill: AXIS, fontFamily: font.text };` em todos os `tick={…}`; `fontFamily={font.text}` nos dois `LabelList`. O SVG herdava `Syne` do tema MUI.

`PMCChart.tsx`: mesmo `fontFamily: font.text` no `tick` de `sharedAxes` e no `label` do `ReferenceArea`.

---

## 5. Validação

`npm run lint && npm run build && npm run test:run`. Conferir no navegador com o atleta da captura: semanas 10/08–31/08 com barras de adesão e km, sem hachura; legenda "Treinos sem carga (TSS) registrada de 15/07 a 14/09"; ACWR com "… dias sem carga (TSS) registrada".
