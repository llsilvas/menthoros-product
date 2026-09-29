# Patches — arquivos grandes editados por trecho

Os arquivos abaixo não foram reescritos inteiros; aplique cada bloco **Substituir → Por** (texto exato, único no arquivo).

---

## `src/features/coach/adapters/coachInboxAdapters.ts`

### 1. Import

Substituir:
```ts
import { formFromTSB } from '../types/AthleteForm';
```
Por:
```ts
import { formFromTSB } from '../types/AthleteForm';
import {
  assessAcwrConfidence,
  buildAdherenceWindow,
  buildWeeklyDiagnosis,
  calculateLoadDelta7d,
  detectDataGaps,
} from './diagnosisChartsAdapters';
```

### 2. Documentar `calcularLoadDelta` (continua exportada, não é mais exibida como carga)

Substituir:
```ts
export function calcularLoadDelta(pmcPoints: PmcPontoRaw[]): number {
```
Por:
```ts
/**
 * Variação % de **CTL** (condicionamento) em 7 posições do array. NÃO é variação de carga — para
 * isso use `calculateLoadDelta7d`. Era exibida como "% vs semana anterior" ao lado de km.
 */
export function calcularLoadDelta(pmcPoints: PmcPontoRaw[]): number {
```

### 3. `buildSelectedAthleteFromDashboard` — derivar lacunas e janela

Substituir:
```ts
  const previsao = calcularPrevisaoForma(latestPmc?.ctl ?? null, latestPmc?.atl ?? null, diasAteProva);
```
Por:
```ts
  const previsao = calcularPrevisaoForma(latestPmc?.ctl ?? null, latestPmc?.atl ?? null, diasAteProva);
  const dataGaps = detectDataGaps(pmcPoints, hoje);
  // KPI e barras saem da MESMA série (antes: KPI do roster, barras do perfil — não batiam).
  const adherenceWindow = buildAdherenceWindow(adherencePoints, hoje);
```

### 4. Aderência

Substituir:
```ts
    adherence: roster.aderenciaPercentual ?? latestAdherence?.percentual ?? 0,
```
Por:
```ts
    adherence: adherenceWindow?.percent ?? roster.aderenciaPercentual ?? latestAdherence?.percentual ?? 0,
    adherenceWindow,
```

### 5. Delta de carga

Substituir:
```ts
    loadDelta: calcularLoadDelta(pmcPoints),
```
Por:
```ts
    loadDelta: calculateLoadDelta7d(pmcPoints, hoje),
```

### 6. Série semanal

Substituir:
```ts
    adherenceTrend: adherencePoints.map((p) => p.percentual),
```
Por:
```ts
    adherenceTrend: adherencePoints.map((p) => p.percentual),
    weeklyDiagnosis: buildWeeklyDiagnosis(pmcPoints, adherencePoints, dataGaps, hoje),
    dataGaps,
```

### 7. Confiança do ACWR

Substituir:
```ts
      acwr: calcularAcwr(latestPmc?.atl ?? null, latestPmc?.ctl ?? null),
```
Por:
```ts
      acwr: calcularAcwr(latestPmc?.atl ?? null, latestPmc?.ctl ?? null),
      acwrConfidence: assessAcwrConfidence(pmcPoints, dataGaps, hoje),
```

### 8. `buildRosterRowFromSummary` — defaults

Substituir:
```ts
    adherence: roster.aderenciaPercentual ?? 0,
    load7d: roster.weeklyVolume,
    loadDelta: 0,
```
Por:
```ts
    adherence: roster.aderenciaPercentual ?? 0,
    adherenceWindow: null,
    load7d: roster.weeklyVolume,
    loadDelta: null,
```

Substituir:
```ts
    adherenceTrend: [],
```
Por:
```ts
    adherenceTrend: [],
    weeklyDiagnosis: [],
    dataGaps: [],
```

Substituir:
```ts
      acwr: calcularAcwr(roster.atl ?? null, roster.ctl ?? null),
```
Por:
```ts
      acwr: calcularAcwr(roster.atl ?? null, roster.ctl ?? null),
      acwrConfidence: null, // roster não traz histórico; avaliado só no perfil
```

---

## `src/features/coach/pages/CoachInboxPage.tsx`

Layout da Proposta: próxima prova sai da faixa de KPIs e vai para o cabeçalho; os 5 `MetricTile compact` viram 4 células largas (`AthleteKpiStrip`) com linha de apoio de até 2 linhas. Regras de valor/tom vivem em `adapters/athleteKpiAdapters.ts`.

### 1. Imports

Substituir:
```tsx
import { buildInboxQueue, buildSelectedAthleteFromDashboard, getAcwrZone } from '../adapters/coachInboxAdapters';
```
Por:
```tsx
import { buildInboxQueue, buildSelectedAthleteFromDashboard, calcularDiasAteProva } from '../adapters/coachInboxAdapters';
import { buildAthleteKpis, buildNextRaceHeader } from '../adapters/athleteKpiAdapters';
import { AthleteKpiStrip } from '../components/AthleteKpiStrip';
import { AthleteNextRace } from '../components/AthleteNextRace';
```

### 2. View models do topo

Substituir:
```tsx
  const acwrZone = getAcwrZone(selected?.quickStats.acwr ?? null);
```
Por:
```tsx
  // Aderência, Carga, Forma e ACWR já formatados (valor, base, tom, selo de confiança).
  const athleteKpis = selected ? buildAthleteKpis(selected, currentFormDisplay) : [];
  const nextRaceHeader = buildNextRaceHeader(nextRace, calcularDiasAteProva(selectedProfile ?? null, new Date()));
```

`acwrZone` e `isTargetRace` deixam de ser usados pelos tiles. Se o lint acusar variável órfã, remova a declaração.

### 3. Próxima prova no cabeçalho, antes da ação primária

Substituir:
```tsx
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    data-testid="inbox-cta-primario"
```
Por:
```tsx
                <AthleteNextRace race={nextRaceHeader} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    data-testid="inbox-cta-primario"
```

`AthleteNextRace` usa `ml: 'auto'`: fica encostado à ação, à direita, como na Proposta.

### 4. Remover bloco duplicado do cabeçalho (RC7)

Remover inteiro (≈ linhas 772–789):
```tsx
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.05, lg: 1.45, xl: 2 }, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography sx={{ fontSize: { xs: '0.6875rem', sm: '0.6875rem', lg: '0.6875rem', xl: '0.6875rem' }, color: surface[500], textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aderência geral</Typography>
                    <Typography sx={{ fontSize: { xs: '1.08rem', sm: '1.18rem', lg: '1.28rem', xl: '1.5rem' }, fontWeight: 800, color: selected.adherence >= 85 ? semantic.success[500] : selected.adherence >= 70 ? surface[50] : semantic.warning[500] }}>
                      {formatPercent(selected.adherence)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: { xs: '0.6875rem', sm: '0.6875rem', lg: '0.6875rem', xl: '0.6875rem' }, color: surface[500], textTransform: 'uppercase', letterSpacing: '0.06em' }}>Carga semanal</Typography>
                    <Typography sx={{ fontSize: { xs: '1.08rem', sm: '1.18rem', lg: '1.28rem', xl: '1.5rem' }, fontWeight: 800, color: surface[50] }}>
                      {formatKm(selected.load7d)}
                    </Typography>
                    <Typography sx={{ fontSize: { xs: '0.6875rem', sm: '0.7rem', lg: '0.74rem', xl: '0.78rem' }, color: selected.loadDelta >= 0 ? semantic.success[500] : semantic.danger[500] }}>
                      {selected.loadDelta >= 0 ? '+' : ''}
                      {selected.loadDelta}% vs. ant.
                    </Typography>
                  </Box>
                </Box>
```

### 5. Trocar a grade de tiles pela faixa de KPIs

Substituir o `<Box>` inteiro da grade (começa em `gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }` e termina no `</Box>` logo após o tile "Próxima Prova"):
```tsx
              <Box
                sx={{
                  px: { xs: 1.1, sm: 1.2, lg: 1.3, xl: 2 },
                  py: { xs: 0.65, sm: 0.75, lg: 0.85, xl: 1.25 },
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' },
                  gap: { xs: 0.55, sm: 0.65, lg: 0.75, xl: 1.2 },
                  borderBottom: `1px solid ${content.divider}`,
                }}
              >
                <MetricTile
                  compact
                  label="Aderência"
                  …
                />
                …
                <MetricTile compact label={isTargetRace ? 'Prova Alvo' : 'Próxima Prova'} … />
              </Box>
```
Por:
```tsx
              <AthleteKpiStrip kpis={athleteKpis} />
```

`MetricTile` continua em uso nos KPIs do topo da página (Atletas ativos etc.). Se `formatPercent`/`formatKm`/`semantic` ficarem órfãos, remova os imports.

---

## `src/features/coach/pages/CoachInboxPage.test.tsx`

### Ajustar testes existentes

- "Aderência, Carga (7d), Forma e ACWR mostram valor neutro…" (≈ linha 283): trocar a lista de rótulos por `['Aderência', 'Carga', 'Forma', 'ACWR']` e localizar cada célula por `screen.getByTestId('kpi-adherence' | 'kpi-load' | 'kpi-form' | 'kpi-acwr')` em vez de `closest('div')`.
- "com dado na janela, zero legítimo de aderência continua numérico" (≈ linha 295): mesma troca de seletor (`kpi-adherence`).
- Testes que procuram "Próxima Prova" / "Prova Alvo" como tile: procurar dentro de `screen.getByTestId('inbox-proxima-prova')`.

### Testes novos

```tsx
  it('cabeçalho não repete aderência e carga e mostra a próxima prova (RC7)', async () => {
    // renderizar a página com um atleta selecionado, como nos testes vizinhos
    expect(screen.queryByText('Aderência geral')).not.toBeInTheDocument();
    expect(screen.queryByText('Carga semanal')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('inbox-proxima-prova')).getByText(/em \d+ dias|hoje|amanhã/)).toBeInTheDocument();
  });

  it('ACWR após lacuna recente: baixa confiança com motivo, sem "Risco"', async () => {
    // perfil com pmc: treinos até 15/07, nada até 14/09, treinos até hoje; atl/ctl finais com razão > 1.5
    const celula = within(screen.getByTestId('kpi-acwr'));
    expect(celula.getByText('Baixa confiança')).toBeInTheDocument();
    expect(celula.getByText(/dias sem treinos registrados/)).toBeInTheDocument();
    expect(celula.queryByText(/Risco/)).not.toBeInTheDocument();
  });
```
