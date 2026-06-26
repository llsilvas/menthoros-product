# Tasks — fix-coach-inbox-metrics

> Branch: `feature/fix-coach-inbox-metrics` em `apps/menthoros-front`
> Base: `27762a8` (develop após commit de docs e ajustes CoachInbox)
> Q1 respondida: `paceLimiarEstimadoFormatado` chega como `String` já formatada ("4:45/km").

---

## Seção 0 — Alinhar thresholds TSB entre backend e frontend

> **Contexto da divergência:**
> O backend `deriveStatus()` usa `tsb ≤ -20` para `danger` e `tsb ≤ -10` para `warning`.
> O frontend `formFromTSB()` usa `tsb < -25` para `form_critical` e `tsb < -10` para `form_low`.
> Resultado: atleta com TSB = -22 aparece como "Alerta" no roster mas "Baixa" (não "Muito baixa") no detalhe.
> Correção: alinha o limiar de `form_critical` com o threshold de `danger` do backend.

- [x] 0.1 Atualizar `src/features/coach/types/AthleteForm.ts` — mudar limiar de `form_critical` de -25 para -20:
  ```ts
  // antes
  export type FormVariant =
    | 'form_excellent' // TSB >= 15  — primary-500 lime
    | 'form_good'      // TSB 5..14  — success-500 emerald
    | 'form_stable'    // TSB -10..4 — info-500 blue
    | 'form_low'       // TSB -25..-11 — warning-500 amber
    | 'form_critical'; // TSB < -25  — danger-500 red

  export function formFromTSB(tsb: number): FormVariant {
    if (tsb >= 15)  return 'form_excellent';
    if (tsb >= 5)   return 'form_good';
    if (tsb >= -10) return 'form_stable';
    if (tsb >= -25) return 'form_low';
    return 'form_critical';
  }

  // depois
  export type FormVariant =
    | 'form_excellent' // TSB >= 15  — primary-500 lime
    | 'form_good'      // TSB 5..14  — success-500 emerald
    | 'form_stable'    // TSB -10..4 — info-500 blue
    | 'form_low'       // TSB -20..-11 — warning-500 amber
    | 'form_critical'; // TSB < -20  — danger-500 red  ← alinhado com backend danger

  export function formFromTSB(tsb: number): FormVariant {
    if (tsb >= 15)  return 'form_excellent';
    if (tsb >= 5)   return 'form_good';
    if (tsb >= -10) return 'form_stable';
    if (tsb >= -20) return 'form_low';
    return 'form_critical';
  }
  ```

- [x] 0.2 Verificar se `formVariantLabel['form_critical']` = "Muito baixa" ainda faz sentido com o novo limiar.
  (TSB < -20 alinhado com "Alerta" do backend → "Muito baixa" é semanticamente consistente. Manter.)

---

## Seção 1 — Preparação de tipos

> Validar: `npm run build` sem erros de tipo após cada item.

- [x] 1.1 Adicionar interface `LimiareisInferidosDto` em `src/types/AtletaPerfilCoach.ts`:
  ```ts
  export interface LimiareisInferidosDto {
    fcLimiarEstimado?: number | null;
    paceLimiarEstimadoFormatado?: string | null;
    confiancaInferenciaFc?: 'ALTA' | 'MEDIA' | 'BAIXA' | null;
    confiancaInferenciaPace?: 'ALTA' | 'MEDIA' | 'BAIXA' | null;
    dataInferenciaLimiar?: string | null;
  }
  ```
  E adicionar o campo em `AtletaPerfilCoachDto`:
  ```ts
  limiareisInferidos?: LimiareisInferidosDto | null;
  ```

- [x] 1.2 Substituir `fatigue` por `tsb` e adicionar `acwr` em `src/features/coach/types/CoachInbox.ts`:
  ```ts
  // antes
  quickStats: {
    acuteLoad: number;
    monotony: number;
    fatigue: 'Baixa' | 'Média' | 'Alta';
    recovery: number;
  };
  // depois
  quickStats: {
    acuteLoad: number;
    monotony: number;
    tsb: number | null;
    acwr: number | null;      // Acute:Chronic Workload Ratio (ATL/CTL) — risco de lesão
    recovery: number;
  };
  ```

---

## Seção 2 — Correções no adapter

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.ts`
> Validar: `npm run build` após a seção.

- [x] 2.1 Adicionar função auxiliar `calcularMonotonia` **exportada** antes de `buildSelectedAthleteFromDashboard`:
  (exportada para ser testável em `coachInboxAdapters.test.ts` — padrão do projeto)
  ```ts
  export function calcularMonotonia(pmcPoints: PmcPontoRaw[]): number {
    const ultimos7 = pmcPoints.slice(-7).map((p) => p.tss ?? 0).filter((v) => v > 0);
    if (ultimos7.length < 3) return 1.0;
    const media = ultimos7.reduce((a, b) => a + b, 0) / ultimos7.length;
    const variancia = ultimos7.reduce((a, b) => a + (b - media) ** 2, 0) / ultimos7.length;
    const stddev = Math.sqrt(variancia);
    return stddev === 0 ? 1.0 : parseFloat((media / stddev).toFixed(2));
  }
  ```

- [x] 2.2 Adicionar função auxiliar `calcularLoadDelta` **exportada**:
  ```ts
  export function calcularLoadDelta(pmcPoints: PmcPontoRaw[]): number {
    if (pmcPoints.length < 8) return 0;
    const ctlAtual = pmcPoints[pmcPoints.length - 1]?.ctl ?? 0;
    const ctlSemanaPassada = pmcPoints[pmcPoints.length - 8]?.ctl ?? 0;
    if (ctlSemanaPassada === 0) return 0;
    return parseFloat(((ctlAtual - ctlSemanaPassada) / ctlSemanaPassada * 100).toFixed(1));
  }
  ```

- [x] 2.2b Adicionar função `calcularAcwr` **exportada** (Acute:Chronic Workload Ratio):
  ```ts
  export function calcularAcwr(atl: number | null, ctl: number | null): number | null {
    if (atl == null || ctl == null || ctl === 0) return null;
    return parseFloat((atl / ctl).toFixed(2));
  }
  ```
  Zonas de interpretação (usadas na UI, não no adapter):
  - `< 0.8` → Baixa carga (cinza)
  - `0.8–1.3` → Ideal (verde) ← sweet spot
  - `1.3–1.5` → Atenção (amarelo)
  - `> 1.5` → Risco de lesão (vermelho)

- [x] 2.3 Corrigir `buildSelectedAthleteFromDashboard` — substituir os três campos com bugs:
  ```ts
  // acuteLoad: era ctl, passa a ser atl
  acuteLoad: latestPmc?.atl ?? roster.weeklyVolume,
  // monotony: era 1, passa a ser calculado
  monotony: calcularMonotonia(pmcPoints),
  // fatigue → tsb (tipo mudou na Seção 1)
  tsb: latestPmc?.tsb ?? null,
  // acwr: novo campo (ATL/CTL)
  acwr: calcularAcwr(latestPmc?.atl ?? null, latestPmc?.ctl ?? null),
  // loadDelta: era 0, passa a ser calculado
  loadDelta: calcularLoadDelta(pmcPoints),
  ```
  (os campos estão em dois blocos distintos no objeto — `loadDelta` fora de `quickStats`, demais dentro de `quickStats`)

- [x] 2.4 Atualizar `buildRosterRowFromSummary` — `CoachAtletaResumo` já traz `ctl` e `atl` do backend,
  portanto ACWR é computável sem PMC completo:
  ```ts
  // quickStats
  acwr: calcularAcwr(roster.atl ?? null, roster.ctl ?? null),  // não null: dados vêm do resumo
  // demais sem PMC:
  monotony: 1,
  tsb: null,
  ```
  `loadDelta: 0` permanece (requer histórico PMC, não disponível no resumo).

---

## Seção 2.5 — Testes das funções puras

> Criar `src/features/coach/adapters/coachInboxAdapters.test.ts` — padrão do projeto: `rosterKpis.ts` → `rosterKpis.test.ts`.
> Validar: `npm run test:run` passa.

- [x] 2.5.1 Criar `coachInboxAdapters.test.ts` com testes para `calcularMonotonia`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { calcularMonotonia, calcularLoadDelta, calcularAcwr } from './coachInboxAdapters';
  import type { PmcPontoRaw } from '../../../types/AtletaPerfilCoach';

  function pmc(over: Partial<PmcPontoRaw>): PmcPontoRaw {
    return { data: '2026-06-01', ctl: 50, atl: 55, tsb: -5, tss: 80, ...over };
  }

  describe('calcularMonotonia', () => {
    it('retorna 1.0 com menos de 3 pontos (fallback)', () => {
      expect(calcularMonotonia([])).toBe(1.0);
      expect(calcularMonotonia([pmc({ tss: 80 }), pmc({ tss: 90 })])).toBe(1.0);
    });

    it('retorna 1.0 quando stddev é zero (treinos idênticos)', () => {
      const pts = Array.from({ length: 7 }, () => pmc({ tss: 70 }));
      expect(calcularMonotonia(pts)).toBe(1.0);
    });

    it('calcula mean/stddev para série variada (BVA: exatamente 3 pontos)', () => {
      // média=80, variância=((70-80)²+(80-80)²+(90-80)²)/3=66.7, stddev≈8.16, monotonia≈9.80
      const pts = [pmc({ tss: 70 }), pmc({ tss: 80 }), pmc({ tss: 90 })];
      const result = calcularMonotonia(pts);
      expect(result).toBeGreaterThan(1.0);
      expect(result).toBeLessThan(15.0);
    });

    it('usa apenas os últimos 7 pontos de um array maior', () => {
      // primeiros 3 pontos com tss=200 devem ser ignorados
      const pts = [
        pmc({ tss: 200 }), pmc({ tss: 200 }), pmc({ tss: 200 }),
        pmc({ tss: 70 }), pmc({ tss: 70 }), pmc({ tss: 70 }),
        pmc({ tss: 70 }), pmc({ tss: 70 }), pmc({ tss: 70 }), pmc({ tss: 70 }),
      ];
      // últimos 7 são todos 70 → stddev=0 → monotonia=1.0
      expect(calcularMonotonia(pts)).toBe(1.0);
    });

    it('ignora pontos com tss zero ou ausente', () => {
      const pts = [pmc({ tss: 0 }), pmc({ tss: 0 }), pmc({ tss: 80 }), pmc({ tss: 90 })];
      // só 2 valores positivos → menos de 3 → fallback 1.0
      expect(calcularMonotonia(pts)).toBe(1.0);
    });
  });
  ```

- [x] 2.5.2 Adicionar testes para `calcularLoadDelta` no mesmo arquivo:
  ```ts
  describe('calcularLoadDelta', () => {
    it('retorna 0 com menos de 8 pontos (histórico insuficiente)', () => {
      const pts = Array.from({ length: 7 }, (_, i) => pmc({ ctl: 50 + i }));
      expect(calcularLoadDelta(pts)).toBe(0);
    });

    it('retorna 0 quando CTL da semana passada é zero (evita divisão por zero)', () => {
      const pts = Array.from({ length: 8 }, () => pmc({ ctl: 0 }));
      expect(calcularLoadDelta(pts)).toBe(0);
    });

    it('calcula delta positivo corretamente (BVA: exatamente 8 pontos)', () => {
      // índice 0 = semana passada (ctl=50), índice 7 = hoje (ctl=55) → +10%
      const pts = [pmc({ ctl: 50 }), ...Array.from({ length: 6 }, () => pmc({ ctl: 52 })), pmc({ ctl: 55 })];
      expect(calcularLoadDelta(pts)).toBe(10.0);
    });

    it('calcula delta negativo (carga em queda)', () => {
      const pts = [pmc({ ctl: 60 }), ...Array.from({ length: 6 }, () => pmc({ ctl: 58 })), pmc({ ctl: 54 })];
      expect(calcularLoadDelta(pts)).toBe(-10.0);
    });
  });
  ```

- [x] 2.5.3 Criar `src/features/coach/types/AthleteForm.test.ts` com testes para `formFromTSB`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { formFromTSB } from './AthleteForm';

  describe('formFromTSB', () => {
    it('form_excellent: TSB >= 15', () => {
      expect(formFromTSB(15)).toBe('form_excellent');
      expect(formFromTSB(30)).toBe('form_excellent');
    });

    it('form_good: TSB >= 5 e < 15 (BVA: 5, 14)', () => {
      expect(formFromTSB(5)).toBe('form_good');
      expect(formFromTSB(14)).toBe('form_good');
    });

    it('form_stable: TSB >= -10 e < 5 (BVA: -10, 4)', () => {
      expect(formFromTSB(-10)).toBe('form_stable');
      expect(formFromTSB(4)).toBe('form_stable');
    });

    it('form_low: TSB >= -20 e < -10 (BVA: -20, -11)', () => {
      expect(formFromTSB(-20)).toBe('form_low');
      expect(formFromTSB(-11)).toBe('form_low');
    });

    it('form_critical: TSB < -20 (BVA: -21) — alinhado com backend danger ≤ -20', () => {
      expect(formFromTSB(-21)).toBe('form_critical');
      expect(formFromTSB(-100)).toBe('form_critical');
    });
  });
  ```

- [x] 2.5.4 Adicionar testes para `calcularAcwr` em `coachInboxAdapters.test.ts`:
  ```ts
  describe('calcularAcwr', () => {
    it('retorna null quando atl ou ctl é null', () => {
      expect(calcularAcwr(null, 50)).toBeNull();
      expect(calcularAcwr(55, null)).toBeNull();
      expect(calcularAcwr(null, null)).toBeNull();
    });

    it('retorna null quando ctl é zero (evita divisão por zero)', () => {
      expect(calcularAcwr(55, 0)).toBeNull();
    });

    it('sweet spot: ATL=ATL=CTL → ACWR=1.0', () => {
      expect(calcularAcwr(50, 50)).toBe(1.0);
    });

    it('zona ideal: ATL < CTL → ACWR < 1 (atleta descansando)', () => {
      expect(calcularAcwr(40, 50)).toBe(0.8);
    });

    it('zona de risco: ATL muito maior que CTL → ACWR > 1.5', () => {
      // ATL=90, CTL=50 → ACWR=1.8 (zona de perigo)
      expect(calcularAcwr(90, 50)).toBe(1.8);
    });

    it('BVA: limiar exato 1.5 (fronteira atenção/risco)', () => {
      expect(calcularAcwr(75, 50)).toBe(1.5);
    });

    it('BVA: limiar exato 1.3 (fronteira ideal/atenção)', () => {
      expect(calcularAcwr(65, 50)).toBe(1.3);
    });
  });
  ```

---

## Seção 3 — Atualizar consumidores de `quickStats.fatigue`

> Dois arquivos usam `quickStats.fatigue` — ambos precisam ser atualizados após a mudança de tipo.

- [x] 3.1 **`CoachInboxPage.tsx`** — atualizar tile "Fadiga" → "Forma":
  - Importar `formFromTSB` e `formVariantLabel` de `../types/AthleteForm` (arquivo já existe em `src/features/coach/types/AthleteForm.ts`)
  - Calcular antes do JSX:
    ```ts
    const tsbValue = selected.quickStats.tsb;
    const formVariant = tsbValue !== null ? formFromTSB(tsbValue) : 'form_stable';
    const formLabel = formVariantLabel[formVariant];
    const tsbDelta = tsbValue !== null
      ? `TSB: ${tsbValue >= 0 ? '+' : ''}${tsbValue.toFixed(0)}`
      : '—';
    const formTone = formVariant === 'form_critical' || formVariant === 'form_low'
      ? ('danger' as const)
      : formVariant === 'form_excellent'
        ? ('success' as const)
        : ('neutral' as const);
    ```
  - Substituir o `MetricTile` de fadiga (linha ~582):
    ```tsx
    // antes
    <MetricTile compact label="Fadiga" value={selected.quickStats.fatigue}
      delta={`Monotonia ${selected.quickStats.monotony.toFixed(2)}`}
      tone={selected.quickStats.fatigue === 'Alta' ? 'danger' : ...} />
    // depois
    <MetricTile compact label="Forma" value={formLabel} delta={tsbDelta} tone={formTone} />
    ```

- [x] 3.2 **`StatusTabPanel.tsx`** — atualizar `DetailMetric` de fadiga:
  - Importar `formFromTSB` e `formVariantLabel`
  - Substituir linha 26:
    ```tsx
    // antes
    <DetailMetric label="Fadiga" value={selected.quickStats.fatigue}
      subtitle="Sinais moderados"
      tone={selected.quickStats.fatigue === 'Alta' ? 'warning' : 'success'} />
    // depois
    <DetailMetric
      label="Forma (TSB)"
      value={selected.quickStats.tsb !== null ? formVariantLabel[formFromTSB(selected.quickStats.tsb)] : '—'}
      subtitle={selected.quickStats.tsb !== null ? `TSB: ${selected.quickStats.tsb.toFixed(0)}` : 'Sem dados PMC'}
      tone={selected.quickStats.tsb !== null && selected.quickStats.tsb < -10 ? 'warning' : 'success'}
    />
    ```

- [x] 3.3 Verificar se há outros usos de `quickStats.fatigue` no codebase:
  ```bash
  grep -rn "quickStats.fatigue\|quickStats\.fatigue" src/ --include="*.tsx" --include="*.ts"
  ```
  Corrigir qualquer ocorrência remanescente.

- [x] 3.4 **`CoachInboxPage.tsx`** — adicionar tile de ACWR ao lado dos tiles existentes (linha ~580):
  ```tsx
  // Derivar zona ACWR antes do JSX
  const acwr = selected.quickStats.acwr;
  const acwrLabel = acwr == null ? '—'
    : acwr < 0.8  ? 'Baixa'
    : acwr <= 1.3 ? 'Ideal'
    : acwr <= 1.5 ? 'Atenção'
    : 'Risco';
  const acwrTone = acwr == null ? ('neutral' as const)
    : acwr < 0.8  ? ('neutral' as const)
    : acwr <= 1.3 ? ('success' as const)
    : acwr <= 1.5 ? ('warning' as const)
    : ('danger' as const);

  // Adicionar MetricTile após o tile de "Forma"
  <MetricTile
    compact
    label="ACWR"
    value={acwrLabel}
    delta={acwr != null ? `${acwr.toFixed(2)} (ATL/CTL)` : 'Sem dados PMC'}
    tone={acwrTone}
  />
  ```

---

## Seção 3.5 — ACWR na grade de atletas (`CoachAthletesPage`)

> `CoachAtletaResumo` já expõe `ctl` e `atl` vindos do backend — ACWR é derivável sem perfil completo.
> Importar `calcularAcwr` do adapter para centralizar a lógica.

- [x] 3.5.1 Adicionar `acwr?: number` em `AthleteRow` (`CoachAthletesPage.tsx` linha ~44):
  ```ts
  interface AthleteRow {
    id: string;
    name: string;
    phase?: string;
    status: CoachAtletaStatus;
    ctl?: number;
    atl?: number;
    tsb?: number;
    acwr?: number;          // ← novo
    weeklyVolume: number;
    lastActivity?: string;
  }
  ```

- [x] 3.5.2 Importar `calcularAcwr` e computar `acwr` no `useMemo` do roster (linha ~197):
  ```ts
  import { calcularAcwr } from '../adapters/coachInboxAdapters';

  // Dentro do useMemo athletes:
  roster.map((a) => ({
    ...
    acwr: calcularAcwr(a.atl ?? null, a.ctl ?? null) ?? undefined,
    ...
  }))
  ```

- [x] 3.5.3 Adicionar coluna ACWR no array `columns` após a coluna `tsb` (linha ~319):
  ```ts
  {
    field: 'acwr',
    headerName: 'ACWR',
    width: 90,
    type: 'number',
    headerAlign: 'left',
    align: 'left',
    renderCell: ({ row }) => {
      const acwr = row.acwr;
      const color = acwr == null ? surface[500]
        : acwr < 0.8  ? surface[400]
        : acwr <= 1.3 ? semantic.success[500]
        : acwr <= 1.5 ? semantic.warning[500]
        : semantic.danger[500];
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <MetricCell
            value={acwr != null ? acwr.toFixed(2) : '—'}
            size="sm"
            tooltip="ACWR = ATL/CTL · ideal: 0.8–1.3 · risco de lesão: > 1.5"
            color={color}
          />
        </Box>
      );
    },
  },
  ```
  (Verificar se `MetricCell` aceita `color` como prop — se não, usar `Typography` com `sx.color` inline.)

---

## Seção 4 — Exibir `limiareisInferidos` no tab "Status"

> Validar: campo aparece no browser ao abrir atleta com limiares inferidos; não aparece quando null.

- [x] 4.0 **`StatusTabPanel.tsx` linha 41 — substituir `+8%` hardcoded por `loadDelta` real:**
  Estamos tocando este arquivo de qualquer forma; corrigir enquanto está aberto.
  ```tsx
  // antes
  <Typography sx={{ fontSize: '0.8rem', color: semantic.success[500], fontWeight: 700 }}>
    +8% vs semana anterior
  </Typography>
  // depois
  <Typography sx={{
    fontSize: '0.8rem',
    color: selected.loadDelta >= 0 ? semantic.success[500] : semantic.danger[500],
    fontWeight: 700,
  }}>
    {selected.loadDelta >= 0 ? '+' : ''}{selected.loadDelta}% vs semana anterior
  </Typography>
  ```

- [x] 4.1 Adicionar prop `limiareisInferidos` em `StatusTabPanelProps`:
  ```ts
  import type { LimiareisInferidosDto } from '../../../../types/AtletaPerfilCoach';

  interface StatusTabPanelProps {
    dashboardInsights: CoachInsights | null;
    selected: CoachAthleteRow;
    onOpenInsights: () => void;
    limiareisInferidos?: LimiareisInferidosDto | null;
  }
  ```

- [x] 4.2 Criar componente interno `LimiareisCard` (inline no arquivo, antes de `StatusTabPanel`):
  ```tsx
  function LimiareisCard({ limiar }: { limiar: LimiareisInferidosDto }) {
    const confiancaLabel = (c?: 'ALTA' | 'MEDIA' | 'BAIXA' | null) =>
      c === 'ALTA' ? 'alta' : c === 'MEDIA' ? 'média' : c === 'BAIXA' ? 'baixa' : null;

    return (
      <Box sx={{ gridColumn: '1 / -1', p: 1.5, border: `1px solid ${content.cardBorder}`, borderRadius: 2, backgroundColor: elevation.card }}>
        <Typography sx={{ fontSize: '0.68rem', color: surface[400], textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
          Limiares inferidos pela IA
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {limiar.fcLimiarEstimado != null && (
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: surface[400] }}>FC Limiar estimada</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: surface[50] }}>
                {limiar.fcLimiarEstimado} bpm
                {confiancaLabel(limiar.confiancaInferenciaFc) && (
                  <Typography component="span" sx={{ fontSize: '0.68rem', color: surface[400], ml: 0.5 }}>
                    (confiança {confiancaLabel(limiar.confiancaInferenciaFc)})
                  </Typography>
                )}
              </Typography>
            </Box>
          )}
          {limiar.paceLimiarEstimadoFormatado != null && (
            <Box>
              <Typography sx={{ fontSize: '0.7rem', color: surface[400] }}>Pace Limiar estimado</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: surface[50] }}>
                {limiar.paceLimiarEstimadoFormatado}
                {confiancaLabel(limiar.confiancaInferenciaPace) && (
                  <Typography component="span" sx={{ fontSize: '0.68rem', color: surface[400], ml: 0.5 }}>
                    (confiança {confiancaLabel(limiar.confiancaInferenciaPace)})
                  </Typography>
                )}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
  ```

- [x] 4.3 Adicionar o card no JSX do `StatusTabPanel` (ao final do grid, antes do `</Box>` de fechamento):
  ```tsx
  {limiareisInferidos && (limiar.fcLimiarEstimado != null || limiar.paceLimiarEstimadoFormatado != null) && (
    <LimiareisCard limiar={limiareisInferidos} />
  )}
  ```
  (usar a prop `limiareisInferidos` já desestruturada)

- [x] 4.4 Em `CoachInboxPage.tsx`, passar a prop para `<StatusTabPanel>`:
  ```tsx
  {activeTab === 'status' ? (
    <StatusTabPanel
      dashboardInsights={dashboardInsights}
      selected={selected}
      onOpenInsights={() => navigate('/coach/insights')}
      limiareisInferidos={selectedProfile?.limiareisInferidos ?? null}
    />
  ) : null}
  ```

---

## Seção 5 — Documentar convenção no CLAUDE.md

- [x] 5.1 Adicionar seção "Convenção de nomenclatura" em `apps/menthoros-front/CLAUDE.md` logo após `## Imports`:
  ```markdown
  ## Convenção de nomenclatura

  | Camada | Idioma | Exemplos |
  |---|---|---|
  | Arquivos, componentes, hooks, tipos TS, funções | **inglês** | `ReviewTabPanel`, `useCoachDashboard`, `CoachAthleteRow`, `formFromTSB` |
  | Strings de valor — domínio de negócio | **PT-BR** | `'ATRASADO'`, `'ALVO'`, `'AGUARDANDO_REVISAO'` |
  | Strings de valor — estados técnicos | **inglês** | `'PENDING'`, `'APPROVED'`, `'REJECTED'` |
  | Labels e copy na UI | **PT-BR** | `"Aderência"`, `"Fila de revisão"` |

  Não renomear arquivos/componentes existentes por esta regra — aplicar apenas em código novo.
  ```

---

## Seção 6 — Validação final

- [x] 6.1 Lint + build + testes:
  ```bash
  cd apps/menthoros-front
  npm run lint && npm run build && npm run test:run
  ```

- [x] 6.2 Atualizar este `tasks.md` com `[x]` nos itens concluídos.

---

## Seção 7 — Entrega

- [x] 7.1 Commits por seção lógica:
  - `fix(athlete-form): alinhar limiar form_critical com threshold danger do backend (TSB < -20)`
  - `fix(coach-inbox): substituir fatigue por tsb e adicionar acwr no quickStats do CoachAthleteRow`
  - `fix(coach-inbox): corrigir acuteLoad para ATL e calcular monotonia, loadDelta e acwr do histórico PMC`
  - `test(coach-inbox): adicionar testes unitários para calcularMonotonia, calcularLoadDelta, calcularAcwr e formFromTSB`
  - `fix(coach-inbox): conectar tile de forma ao formFromTSB, adicionar tile ACWR e coluna ACWR no roster`
  - `feat(coach-inbox): exibir limiares inferidos e substituir tendência hardcoded no tab de status`
  - `docs(front): documentar convenção de nomenclatura inglês/PT-BR no CLAUDE.md`
- [x] 7.2 Push e PR: **PR #9 mergeado em develop em 2026-06-26.**

---

## Seção 8 — Refactor pós-QA (não planejado, gerado pelo `/qa`)

> `frontend-reviewer` + `clean-code-reviewer` convergiram num achado **crítico**: lógica de zonas ACWR e
> de tom TSB→cor estava duplicada inline em 3 componentes (viola "business logic em helpers" do CLAUDE.md).

- [x] 8.1 Extrair `getTsbFormaTone(forma)` em `types/AthleteForm.ts` (+ tipo `MetricTone`).
- [x] 8.2 Extrair `getAcwrZone(acwr)` em `adapters/coachInboxAdapters.ts` (centraliza limiares + label + tom).
- [x] 8.3 Consumir os helpers em `CoachInboxPage`, `CoachAthletesPage` (via mapa `TONE_COLOR`) e `StatusTabPanel`
  (+ `CONFIANCA_COLOR` eliminando ternários de cor repetidos no `LimiareisCard`).
- [x] 8.4 Testes BVA para `getAcwrZone` e `getTsbFormaTone`.
- [x] Commits: `refactor(coach-inbox): centralizar zonas ACWR e tom de forma em helpers puros` + `test(coach-inbox): cobrir getAcwrZone e getTsbFormaTone com BVA`.

**Follow-up não bloqueante (fora do escopo Fast track):** font-sizes inline (`'0.72rem'` etc.) no `LimiareisCard`
seguem o padrão de todos os componentes coach (não há token de tipografia hoje) — fixar é refactor transversal próprio.

**Validação final:** `npm run lint` ✓ · `npm run build` ✓ · `npm run test:run` → 205 testes (24 arquivos).
