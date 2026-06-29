# Design — expose-form-status

## Contexto

A classificação de forma (TSB → faixa) é regra de domínio do backend (`FaixaTsb` + `MetricasThresholds`). O front a reimplementa em `formFromTSB` com limiares divergentes. Esta change (fatiada) torna o backend a fonte única exposta e faz o front consumir a forma **atual**. Fronteiras/projeção de taper são follow-up.

Referências (estado atual):
- Backend: `enums/FaixaTsb.java` (`classificar(Double tsb)`, 9 faixas), `MetricasThresholds.java`, DTOs em `dto/output/`, services `AtletaProgressServiceImpl`, `CoachDashboardServiceImpl`.
- Front: `features/coach/types/AthleteForm.ts` (`formFromTSB`), `CoachInboxPage.tsx:123`, `coachInboxAdapters.ts` (`buildSelectedAthleteFromDashboard`, `calcularPrevisaoForma`), `AthleteRow.tsx:110`.

## Decisão 1 — Contrato do status atual

Adicionar campo **opcional** `statusForma: String` (nome da `FaixaTsb`, ex.: `FORMA_IDEAL`) aos DTOs que carregam `tsb` ao front:
- `PmcPontoDto` — resolve em cascata `AtletaPerfilCoachOutputDto`.
- `CoachAtletaResumoDto` — distinto do `status` existente (atenção do coach: danger/warning/active).
- `AtletaHomeDto.MetricasChave`.

Preenchimento no service via `FaixaTsb.classificar(tsb)` (null → null). **Sem** novos limiares: reusar `FaixaTsb`/`MetricasThresholds`. Campo aditivo = backward-compatible.

Por que o nome do enum (String) e não as 5 variantes do front: mantém o backend dono da taxonomia; o front mapeia enum→apresentação.

## Decisão 2 — Apresentação no front (sem números para a forma atual)

`AthleteForm.ts`:
- Adicionar `FAIXA_APRESENTACAO: Record<FaixaTsbStatus, { label: string; tone: MetricTone; cor: string }>` — presentation puro, keyed-by-enum, sem números. (Granularidade 9 vs subconjunto agrupado: ver open question — agrupar é permitido na apresentação, sem reintroduzir limiar.)
- `FaixaTsbStatus` = union dos 9 nomes (tipo em `src/types`).
- **Não remover `formFromTSB`** nesta change: ele sobrevive só em `calcularPrevisaoForma` (projeção de taper), com comentário de dívida + link para o follow-up.

Consumo:
- `CoachInboxPage.tsx` → `quickStats.statusForma` (resolvido; deixa de chamar `formFromTSB`).
- `coachInboxAdapters.ts` → `buildSelectedAthleteFromDashboard` propaga `statusForma` do roster/último PMC para `quickStats`.
- `AthleteRow.tsx` → "perigo" derivado da faixa do backend (ex.: `FADIGA_ALTA`/`FADIGA_EXCESSIVA`), não de `tsb < -30`.

## Sequenciamento cross-repo

1. **Backend** (branch `feature/expose-form-status` em `apps/menthoros-backend`): DTOs + services + testes → PR → merge em `develop`.
2. **Contrato**: regen scratch + port à mão no cliente curado do front.
3. **Front** (branch `feature/expose-form-status` em `apps/menthoros-front`): tipo + apresentação + consumo + testes → PR.

O front depende do contrato do backend mergeado. Não mergear local; integrar via PR (CI + branch protection).

## Deferido (follow-up, condicionado a add-taper-guidance)

- Endpoint/metadado de **fronteiras** da `FaixaTsb` (`{status, min, max}`).
- `calcularPrevisaoForma` classificar o TSB **projetado** via fronteiras (remoção final de `formFromTSB`).

## Alternativas consideradas

- **Backend expõe modelo de 5 bandas alinhado ao front** — menor mudança de UI, mas cria taxonomia paralela à `FaixaTsb` (redundância de domínio). Rejeitada.
- **Manter fronteiras + taper nesta change** — acoplaria exposição simples a feature sem spec (`add-taper-guidance`). Rejeitada no product-review (fatiar).

## Impacto em testes

- Backend: estender `AtletaProgressServiceImplTest`, `CoachDashboardServiceImplTest` (statusForma, incl. `tsb==null → null`). Reusar cenários de `FaixaTsbInterpretacaoTest`.
- Front: teste do mapa de apresentação `FAIXA_APRESENTACAO` (cobertura dos estados) e do consumo (statusForma → label/cor), sem assert de limiar.
