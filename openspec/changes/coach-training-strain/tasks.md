# Tasks — coach-training-strain

> Branch: `feature/coach-training-strain` em `apps/menthoros-front`
> Dependências (ambas mergeadas em `develop`): `fix-coach-inbox-metrics` (usa `calcularMonotonia`) e
> `consolidate-coach-inbox-tabs` (aba **Diagnóstico** = `DiagnosisTabPanel`, onde o Strain vai morar).
>
> **Refino pós-consolidação (init):** o plano original colocava o Strain como `MetricTile` no cabeçalho do
> `CoachInboxPage`. Após a consolidação, o lugar correto é o **grid de métricas do `DiagnosisTabPanel`**
> (ao lado de Carga aguda/Monotonia/Forma), e a classificação segue o padrão de zona `getXZone`
> (`getAcwrZone`/`getTsbFormaTone`) — não ternários inline no componente.

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

- [ ] 2.2 Adicionar função `getStrainZone` **exportada** (padrão `getAcwrZone` — retorna `{ tone, label }`):
  ```ts
  export function getStrainZone(strain: number | null): { tone: MetricTone; label: string } {
    if (strain == null) return { tone: 'neutral', label: 'Sem dados' };
    if (strain >= 600) return { tone: 'danger', label: 'Crítico' };
    if (strain >= 300) return { tone: 'warning', label: 'Alto' };
    if (strain >= 150) return { tone: 'success', label: 'Moderado' };
    return { tone: 'neutral', label: 'Baixo' };
  }
  ```

- [ ] 2.3 Adicionar `strain` em `buildSelectedAthleteFromDashboard`, dentro de `quickStats`:
  ```ts
  strain: calcularStrain(pmcPoints),
  ```

- [ ] 2.4 Adicionar `strain: null` em `buildRosterRowFromSummary` (sem PMC no resumo).

---

## Seção 3 — Testes

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.test.ts` (já existe após fix-coach-inbox-metrics)

- [ ] 3.1 Adicionar `calcularStrain` e `getStrainZone` ao import; novo `describe` para cada (BVA nos
  limiares 150/300/600 do `getStrainZone`, incluindo `null`). Exemplo para `calcularStrain`:
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

## Seção 4 — UI (aba Diagnóstico)

> Arquivo: `src/features/coach/components/panels/DiagnosisTabPanel.tsx`

- [ ] 4.1 Importar `getStrainZone` do adapter e adicionar um `DetailMetric` "Strain" no grid de métricas
  (ao lado de Carga aguda/Monotonia/Forma/Recuperação):
  ```tsx
  const strainZone = getStrainZone(selected.quickStats.strain);

  <DetailMetric
    label="Strain"
    value={selected.quickStats.strain != null ? String(selected.quickStats.strain) : '—'}
    subtitle={strainZone.label}
    tone={strainZone.tone}
  />
  ```
- [ ] 4.2 Ajustar o grid de métricas para acomodar 5 itens de forma responsiva
  (manter `repeat(4, ...)` com wrap ou mudar para `repeat(5, ...)` em `md`/`lg` — validar visualmente).

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
  - `feat(coach-inbox): calcular training strain (TSS × monotonia) e getStrainZone no adapter`
  - `test(coach-inbox): adicionar testes para calcularStrain e getStrainZone`
  - `feat(coach-inbox): exibir métrica de Strain na aba Diagnóstico`
- [ ] 6.2 Push e PR:
  ```bash
  git push -u origin feature/coach-training-strain
  gh pr create --base develop --head feature/coach-training-strain \
    --title "coach-training-strain: adicionar indicador de qualidade de ciclo no dashboard" \
    --body "Implementa Training Strain (TSS semanal × monotonia) como novo tile no CoachInboxPage. Identifica atletas com volume alto + distribuição homogênea (risco de sobretreinamento). Sem mudança de API ou banco."
  ```
