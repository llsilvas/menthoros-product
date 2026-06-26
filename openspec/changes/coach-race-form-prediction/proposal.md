**Tamanho:** S · **Trilha:** Fast

## Why

O coach sabe a data da próxima prova e sabe o estado atual do atleta (CTL, ATL, TSB). O que falta
é a resposta direta à pergunta mais frequente antes de uma prova:

> **"Se eu cortar o volume agora, em que forma o atleta chega no dia da prova?"**

Hoje o coach precisa fazer essa conta mentalmente. O modelo de decaimento exponencial do PMC permite
calcular a forma prevista com apenas três inputs — todos já disponíveis no payload:

- `latestPmc.ctl` — fitness atual
- `latestPmc.atl` — fadiga aguda atual
- `provas[0].dataProva` — data da próxima prova

A previsão assume **taper puro** (carga zero), que é o cenário de referência: o coach usa isso como
baseline e ajusta se o atleta vai manter algum treino de manutenção.

## What Changes

**Somente `apps/menthoros-front`.**

### Modelo matemático (taper puro, carga zero)

```
CTL(d) = CTL₀ × e^(−d/42)
ATL(d) = ATL₀ × e^(−d/7)
TSB(d) = CTL(d) − ATL(d)
```

Onde `d` = dias até a prova.

### Nova função no adapter

```ts
export function calcularPrevisaoForma(
  ctl: number | null,
  atl: number | null,
  diasAteProva: number,
): { tsbPrevisto: number; formaPrevista: FormVariant } | null
```

Fallback `null` quando `ctl` ou `atl` é nulo, ou `diasAteProva <= 0`.

### Tipo

- Adicionar campo `racePrediction` em `CoachAthleteRow`:
  ```ts
  racePrediction: {
    diasAteProva: number;
    tsbPrevisto: number;
    formaPrevista: FormVariant;
  } | null;
  ```

### UI

- Card "Previsão de Forma" na área de detalhe do atleta (abaixo do calendário de provas):
  ```
  ┌─────────────────────────────────┐
  │ Próxima prova · em 18 dias      │
  │                                 │
  │ Se tapear agora:                │
  │ TSB previsto: +14  →  Boa Forma │
  └─────────────────────────────────┘
  ```
  Exibição condicional: só aparece quando `racePrediction != null`.

### Testes

- `calcularPrevisaoForma`: verificar decaimento em 7, 14, 21 dias; null quando sem dados; `diasAteProva <= 0`.

## Capabilities

### Modified Capabilities

- `coach-inbox`: adiciona inteligência de planejamento de taper com previsão baseada no modelo PMC.

## Impact

**Banco:** nenhuma alteração.
**API:** nenhuma alteração. Usa `ctl`, `atl` do PMC e `provas[0].dataProva` já presentes.
**Repositórios:** somente `apps/menthoros-front`.
**Risco:** baixo — card condicional, não afeta campos existentes.

## Critérios de aceite

- **CA-01:** Dado atleta com `ctl=50`, `atl=65`, prova em 14 dias:
  `CTL(14) ≈ 42.8`, `ATL(14) ≈ 8.7`, `TSB(14) ≈ +34` → forma "Excelente".
- **CA-02:** Dado atleta sem prova futura (`provas` vazio), o card não aparece.
- **CA-03:** Dado atleta sem dados PMC, o card não aparece.
- **CA-04:** `diasAteProva <= 0` → o card não aparece (prova passou ou é hoje).
- **CA-05:** `npm run lint && npm run build && npm run test:run` passa.

## Open Questions & Assumptions

| # | Premissa | Status |
|---|---|---|
| A1 | O modelo assume carga zero (taper puro) — atleta que mantém volume de manutenção terá TSB menor que o previsto | Assumido — documentado no tooltip do card como "estimativa com taper completo" |
| A2 | Usar `provas[0]` após sort por data crescente (já feito em `buildRaceCalendarFromProfile`) | Assumido |
| A3 | `formFromTSB()` de `AthleteForm.ts` é usada para classificar `tsbPrevisto` | Assumido — reutiliza lógica existente |

## Dependência

Requer `feature/fix-coach-inbox-metrics` mergeada em `develop` antes de iniciar — reutiliza
`formFromTSB` de `AthleteForm.ts` e a estrutura de `raceCalendar` já consolidada.

## Métrica de sucesso

Ao abrir qualquer atleta com prova futura e histórico PMC, o card de previsão aparece com TSB
estimado e forma classificada — sem erros de runtime.
