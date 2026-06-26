# Tasks — coach-race-form-prediction

> Branch: `feature/coach-race-form-prediction` em `apps/menthoros-front`
> Dependência: `feature/fix-coach-inbox-metrics` mergeada em `develop` antes de criar esta branch.
> (Reutiliza `formFromTSB` de `AthleteForm.ts` e estrutura de `raceCalendar`.)

---

## Seção 1 — Tipo

- [ ] 1.1 Adicionar `racePrediction` em `CoachAthleteRow`
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

- [ ] 2.1 Adicionar função `calcularPrevisaoForma` **exportada**:
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

- [ ] 2.2 Adicionar `racePrediction` em `buildSelectedAthleteFromDashboard`:
  ```ts
  // Calcular dias até a próxima prova (provas já ordenadas em buildRaceCalendarFromProfile)
  const proximaProvaDate = profile?.provas?.length
    ? [...profile.provas].sort((a, b) => a.dataProva.localeCompare(b.dataProva))[0]?.dataProva
    : profile?.proximaProva?.dataProva ?? null;

  const diasAteProva = proximaProvaDate
    ? Math.ceil((new Date(`${proximaProvaDate}T12:00:00`).getTime() - Date.now()) / 86_400_000)
    : -1;

  // No objeto retornado:
  racePrediction: calcularPrevisaoForma(
    latestPmc?.ctl ?? null,
    latestPmc?.atl ?? null,
    diasAteProva,
  ) != null && diasAteProva > 0
    ? { diasAteProva, ...calcularPrevisaoForma(latestPmc?.ctl ?? null, latestPmc?.atl ?? null, diasAteProva)! }
    : null,
  ```
  Simplificação: extrair o resultado de `calcularPrevisaoForma` em variável antes de montar o objeto para evitar double call.

- [ ] 2.3 Adicionar `racePrediction: null` em `buildRosterRowFromSummary`.

---

## Seção 3 — Testes

> Arquivo: `src/features/coach/adapters/coachInboxAdapters.test.ts`

- [ ] 3.1 Adicionar `calcularPrevisaoForma` ao import e novo `describe`:
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

## Seção 4 — UI

> Arquivo: `src/features/coach/pages/CoachInboxPage.tsx`

- [ ] 4.1 Adicionar card de previsão abaixo do calendário de provas (área de detalhe do atleta):
  ```tsx
  {selected.racePrediction && (
    <Box sx={{ mt: 1.5, p: 1.5, border: `1px solid ${content.cardBorder}`, borderRadius: 2 }}>
      <Typography sx={{ fontSize: '0.68rem', color: surface[400], textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
        Previsão de forma · em {selected.racePrediction.diasAteProva} dias
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: surface[50] }}>
          {formVariantLabel[selected.racePrediction.formaPrevista]}
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: surface[400] }}>
          TSB previsto: {selected.racePrediction.tsbPrevisto >= 0 ? '+' : ''}
          {selected.racePrediction.tsbPrevisto}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.68rem', color: surface[500], mt: 0.5 }}>
        Estimativa com taper completo (sem carga)
      </Typography>
    </Box>
  )}
  ```
  Importar `formVariantLabel` de `../types/AthleteForm` (já importado para o tile de Forma).

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
  - `feat(coach-inbox): adicionar campo racePrediction no CoachAthleteRow`
  - `feat(coach-inbox): calcular previsão de forma no dia da prova via modelo PMC exponencial`
  - `test(coach-inbox): adicionar testes para calcularPrevisaoForma`
  - `feat(coach-inbox): exibir card de previsão de forma para próxima prova no CoachInboxPage`
- [ ] 6.2 Push e PR:
  ```bash
  git push -u origin feature/coach-race-form-prediction
  gh pr create --base develop --head feature/coach-race-form-prediction \
    --title "coach-race-form-prediction: previsão de forma no dia da prova com modelo PMC" \
    --body "Implementa previsão de TSB/forma no dia da prova usando decaimento exponencial (τ_CTL=42, τ_ATL=7) com taper puro. Card condicional exibido quando atleta tem prova futura e histórico PMC. Sem mudança de API ou banco."
  ```
