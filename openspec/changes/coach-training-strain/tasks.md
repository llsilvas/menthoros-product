# Tasks — coach-training-strain

> Branch: `feature/coach-training-strain` em `apps/menthoros-front`
> Dependência: `feature/fix-coach-inbox-metrics` mergeada em `develop` antes de criar esta branch.
> (Usa `calcularMonotonia` exportada por aquela change.)

---

## Seção 1 — Tipo

- [ ] 1.1 Adicionar `strain: number | null` em `quickStats` de `CoachAthleteRow`
  (`src/features/coach/types/CoachInbox.ts`):
  ```ts
  quickStats: {
    acuteLoad: number;
    monotony: number;
    tsb: number | null;
    acwr: number | null;
    strain: number | null;   // TSS_semanal × monotonia — qualidade do ciclo
    recovery: number;
  };
  ```

---

## Seção 2 — Adapter

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.ts`

- [ ] 2.1 Adicionar função `calcularStrain` **exportada**:
  ```ts
  export function calcularStrain(pmcPoints: PmcPontoRaw[]): number | null {
    const ultimos7Tss = pmcPoints.slice(-7).map((p) => p.tss ?? 0).filter((v) => v > 0);
    if (ultimos7Tss.length < 3) return null;
    const tssSemanal = ultimos7Tss.reduce((a, b) => a + b, 0);
    const monotonia = calcularMonotonia(pmcPoints);
    return parseFloat((tssSemanal * monotonia).toFixed(0));
  }
  ```
  Nota: reutiliza `calcularMonotonia` (já importada no mesmo arquivo).

- [ ] 2.2 Adicionar `strain` em `buildSelectedAthleteFromDashboard`, dentro de `quickStats`:
  ```ts
  strain: calcularStrain(pmcPoints),
  ```

- [ ] 2.3 Adicionar `strain: null` em `buildRosterRowFromSummary` (sem PMC no resumo).

---

## Seção 3 — Testes

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.test.ts` (já existe após fix-coach-inbox-metrics)

- [ ] 3.1 Adicionar `calcularStrain` ao import e novo `describe`:
  ```ts
  import { calcularMonotonia, calcularLoadDelta, calcularAcwr, calcularStrain } from './coachInboxAdapters';

  describe('calcularStrain', () => {
    it('retorna null com menos de 3 pontos de TSS', () => {
      expect(calcularStrain([])).toBeNull();
      expect(calcularStrain([pmc({ tss: 80 }), pmc({ tss: 90 })])).toBeNull();
    });

    it('retorna null quando todos os tss são zero', () => {
      const pts = Array.from({ length: 7 }, () => pmc({ tss: 0 }));
      expect(calcularStrain(pts)).toBeNull();
    });

    it('calcula strain = TSS_semanal × monotonia para treinos idênticos', () => {
      // TSS idênticos → monotonia=1.0 → strain = 7×70 = 490
      const pts = Array.from({ length: 7 }, () => pmc({ tss: 70 }));
      expect(calcularStrain(pts)).toBe(490);
    });

    it('strain aumenta com maior variabilidade (monotonia > 1)', () => {
      // série variada → monotonia > 1 → strain > TSS_semanal
      const pts = [
        pmc({ tss: 30 }), pmc({ tss: 30 }), pmc({ tss: 150 }),
        pmc({ tss: 30 }), pmc({ tss: 150 }), pmc({ tss: 30 }), pmc({ tss: 150 }),
      ];
      const strain = calcularStrain(pts);
      const tssSemanal = 30 + 30 + 150 + 30 + 150 + 30 + 150; // 570
      expect(strain).toBeGreaterThan(tssSemanal);
    });
  });
  ```

---

## Seção 4 — UI

> Arquivo: `src/features/coach/pages/CoachInboxPage.tsx`

- [ ] 4.1 Adicionar `MetricTile` de Strain após o tile de ACWR (linha ~583):
  ```tsx
  // Derivar classificação antes do JSX
  const strain = selected.quickStats.strain;
  const strainLabel = strain == null ? '—'
    : strain < 150  ? 'Baixo'
    : strain < 300  ? 'Moderado'
    : strain < 600  ? 'Alto'
    : 'Crítico';
  const strainTone = strain == null ? ('neutral' as const)
    : strain < 150  ? ('neutral' as const)
    : strain < 300  ? ('success' as const)
    : strain < 600  ? ('warning' as const)
    : ('danger' as const);

  <MetricTile
    compact
    label="Strain"
    value={strainLabel}
    delta={strain != null ? String(strain) : 'Sem dados PMC'}
    tone={strainTone}
  />
  ```

---

## Seção 5 — Validação

- [ ] 5.1 Lint + build + testes:
  ```bash
  cd apps/menthoros-front
  npm run lint && npm run build && npm run test:run
  ```
- [ ] 5.2 Atualizar este `tasks.md` com `[x]` nos itens concluídos.

---

## Seção 6 — Entrega

- [ ] 6.1 Commits:
  - `feat(coach-inbox): adicionar campo strain no quickStats do CoachAthleteRow`
  - `feat(coach-inbox): calcular training strain (TSS × monotonia) no adapter`
  - `test(coach-inbox): adicionar testes para calcularStrain`
  - `feat(coach-inbox): exibir tile de Strain com classificação de risco no CoachInboxPage`
- [ ] 6.2 Push e PR:
  ```bash
  git push -u origin feature/coach-training-strain
  gh pr create --base develop --head feature/coach-training-strain \
    --title "coach-training-strain: adicionar indicador de qualidade de ciclo no dashboard" \
    --body "Implementa Training Strain (TSS semanal × monotonia) como novo tile no CoachInboxPage. Identifica atletas com volume alto + distribuição homogênea (risco de sobretreinamento). Sem mudança de API ou banco."
  ```
