# Tasks — coach-race-form-prediction

> Branch: `feature/coach-race-form-prediction` em `apps/menthoros-front`
> Dependências (ambas em `develop`): `fix-coach-inbox-metrics` (`formFromTSB`/`getTsbFormaTone`) e
> `consolidate-coach-inbox-tabs` (aba **Provas & sugestões** = `RacesSuggestionsTabPanel`, onde o card mora).
>
> **Refino pós-consolidação (init):** o plano original colocava o card no `CoachInboxPage` "abaixo do
> calendário". Após a consolidação, o calendário de provas vive no `RacesSuggestionsTabPanel` — o card de
> previsão entra lá (consome `selected.racePrediction`, sem prop nova). Classificação reusa
> `formFromTSB`/`getTsbFormaTone`.

---

## Seção 1 — Tipo

- [x] 1.1 Adicionar `racePrediction` em `CoachAthleteRow`
  (`src/features/coach/types/CoachInbox.ts`):
  ```ts
  import type { FormVariant } from './AthleteForm';

  // Na interface CoachAthleteRow:
  racePrediction: {
    diasAteProva: number;
    tsbPrevisto: number;
    formaPrevista: FormVariant;
  } | null;
  ```

---

## Seção 2 — Adapter

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.ts`

- [x] 2.1 Adicionar função `calcularPrevisaoForma` **exportada**:
  ```ts
  import { formFromTSB } from '../types/AthleteForm';

  export function calcularPrevisaoForma(
    ctl: number | null,
    atl: number | null,
    diasAteProva: number,
  ): { tsbPrevisto: number; formaPrevista: FormVariant } | null {
    if (ctl == null || atl == null || diasAteProva <= 0) return null;
    const ctlPrevisto = ctl * Math.exp(-diasAteProva / 42);
    const atlPrevisto = atl * Math.exp(-diasAteProva / 7);
    const tsbPrevisto = parseFloat((ctlPrevisto - atlPrevisto).toFixed(1));
    return { tsbPrevisto, formaPrevista: formFromTSB(tsbPrevisto) };
  }
  ```
  Modelo: decaimento exponencial padrão PMC (τ_CTL=42 dias, τ_ATL=7 dias), carga zero (taper puro).

- [x] 2.2 Adicionar função pura `calcularDiasAteProva(profile, hoje)` **exportada** (testável, `hoje` injetável):
  ```ts
  export function calcularDiasAteProva(profile: AtletaPerfilCoachDto | null, hoje: Date): number {
    const provas = profile?.provas?.length ? profile.provas : profile?.proximaProva ? [profile.proximaProva] : [];
    const proxima = [...provas]
      .filter((p): p is Prova => Boolean(p?.dataProva))
      .sort((a, b) => a.dataProva.localeCompare(b.dataProva))[0];
    if (!proxima) return -1;
    return Math.ceil((new Date(`${proxima.dataProva}T12:00:00`).getTime() - hoje.getTime()) / 86_400_000);
  }
  ```

- [x] 2.3 Montar `racePrediction` em `buildSelectedAthleteFromDashboard` (param `hoje: Date = new Date()` injetável):
  ```ts
  const diasAteProva = calcularDiasAteProva(profile, hoje);
  const previsao = calcularPrevisaoForma(latestPmc?.ctl ?? null, latestPmc?.atl ?? null, diasAteProva);
  // no objeto retornado:
  racePrediction: previsao ? { diasAteProva, ...previsao } : null,
  ```
  (sem double-call; `hoje` default `new Date()` mantém o call-site do `CoachInboxPage` inalterado)

- [x] 2.4 Adicionar `racePrediction: null` em `buildRosterRowFromSummary` (resumo não traz provas/PMC).

---

## Seção 3 — Testes

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.test.ts`

- [x] 3.1 Adicionar `calcularPrevisaoForma` e `calcularDiasAteProva` ao import; um `describe` para cada
  (`calcularDiasAteProva`: prova futura com `hoje` fixo, prova passada → ≤0, sem prova → -1). Exemplo para `calcularPrevisaoForma`:
  ```ts
  import { ..., calcularPrevisaoForma } from './coachInboxAdapters';

  describe('calcularPrevisaoForma', () => {
    it('retorna null quando ctl ou atl é null', () => {
      expect(calcularPrevisaoForma(null, 65, 14)).toBeNull();
      expect(calcularPrevisaoForma(50, null, 14)).toBeNull();
    });

    it('retorna null quando diasAteProva <= 0', () => {
      expect(calcularPrevisaoForma(50, 65, 0)).toBeNull();
      expect(calcularPrevisaoForma(50, 65, -3)).toBeNull();
    });

    it('atleta em taper 14 dias: CTL cai menos que ATL → TSB positivo', () => {
      // CTL(14) = 50 × e^(-14/42) ≈ 36.8
      // ATL(14) = 65 × e^(-14/7)  ≈ 9.9
      // TSB(14) ≈ +26.9
      const result = calcularPrevisaoForma(50, 65, 14);
      expect(result).not.toBeNull();
      expect(result!.tsbPrevisto).toBeGreaterThan(20);
      expect(result!.tsbPrevisto).toBeLessThan(35);
    });

    it('atleta muito fatigado em taper longo (21 dias) → forma excelente', () => {
      // ATL alta → cai rápido em 21 dias → TSB > 15 → form_excellent
      const result = calcularPrevisaoForma(50, 90, 21);
      expect(result!.formaPrevista).toBe('form_excellent');
    });

    it('atleta sem fadiga e sem fitness (ctl≈atl≈0) → TSB≈0 → form_stable', () => {
      const result = calcularPrevisaoForma(5, 5, 14);
      expect(result!.tsbPrevisto).toBeCloseTo(0, 0);
    });
  });
  ```

---

## Seção 4 — UI (aba Provas & sugestões)

> Arquivo: `src/features/coach/components/panels/RacesSuggestionsTabPanel.tsx`

- [x] 4.1 Adicionar card "Previsão de forma" no `SectionCard` "Provas do atleta" (abaixo da lista de provas),
  exibido só quando `selected.racePrediction != null`. Reusar `formVariantLabel` + `getTsbFormaTone` para
  rótulo e cor da forma prevista. Incluir nota "Estimativa com taper completo (sem carga)".

---

## Seção 5 — Validação

- [x] 5.1 Lint + build + testes:
  ```bash
  cd apps/menthoros-front
  npm run lint && npm run build && npm run test:run
  ```
- [x] 5.2 Atualizar este `tasks.md` com `[x]` nos itens concluídos.

---

## Seção 6 — Entrega

- [x] 6.1 Commits:
  - `feat(coach-inbox): adicionar campo racePrediction no CoachAthleteRow`
  - `feat(coach-inbox): calcular previsão de forma no dia da prova via modelo PMC exponencial`
  - `test(coach-inbox): adicionar testes para calcularPrevisaoForma e calcularDiasAteProva`
  - `feat(coach-inbox): exibir card de previsão de forma na aba Provas & sugestões`
- [ ] 6.2 Push e PR:
  ```bash
  git push -u origin feature/coach-race-form-prediction
  gh pr create --base develop --head feature/coach-race-form-prediction \
    --title "coach-race-form-prediction: previsão de forma no dia da prova com modelo PMC" \
    --body "Implementa previsão de TSB/forma no dia da prova usando decaimento exponencial (τ_CTL=42, τ_ATL=7) com taper puro. Card condicional exibido quando atleta tem prova futura e histórico PMC. Sem mudança de API ou banco."
  ```
