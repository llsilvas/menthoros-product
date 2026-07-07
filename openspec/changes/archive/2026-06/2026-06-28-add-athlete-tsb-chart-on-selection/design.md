# Design — add-athlete-tsb-chart-on-selection

## Contexto

A dashboard principal do coach (`features/coach/pages/CoachInboxPage.tsx`) tem um painel de **drill-down do atleta selecionado** com três abas: **Diagnóstico**, **Plano**, **Provas & sugestões**. A aba Diagnóstico (`features/coach/components/panels/DiagnosisTabPanel.tsx`) já exibe: próximo treino, carga aguda/monotonia/strain/recuperação, **"Tendência de carga"** (`TrendCard`, sparkline de `loadTrend`), adesão e sinais de atenção.

Esta change adiciona, **na mesma aba Diagnóstico**, o gráfico de **tendência de forma PMC** (CTL/ATL/TSB), reusando o `PMCChart` existente e a série já carregada — **sem tocar o backend, sem novo hook/serviço e sem alterar o roster**.

Referências (estado atual):
- Dashboard/drill-down: `CoachInboxPage.tsx` (`useAthleteProfile(selectedId)` → `selectedProfile`; `selected` view-model via `buildSelectedAthleteFromDashboard`).
- Aba: `DiagnosisTabPanel.tsx` (props `{ selected, limiareisInferidos, onOpenPlan }`).
- Chart reusável: `features/athlete/components/PMCChart.tsx` — props `{ data: PMCDataPoint[]; range: PMCRange; defaultMode?; onRangeChange? }`; `PMCDataPoint = { date: Date; tss; ctl; atl; tsb }`.
- Série PMC: `selectedProfile.pmc: PmcPontoRaw[]` (`data: string ISO, ctl, atl, tsb, tss`) — mesmo dado que `CoachAthleteProfilePage` mapeia para o `PMCChart`.

## Decisão 1 — Superfície: aba Diagnóstico da dashboard (junto da tendência de carga)

O gráfico PMC entra como uma nova **`SectionCard "Tendência de forma (PMC)"`** dentro de `DiagnosisTabPanel`, renderizada **logo após** o card "Tendência de carga". Forma (CTL/ATL/TSB) e carga (`loadTrend`) ficam lado a lado, na superfície que o coach já usa ao selecionar um atleta.

**Por que esta superfície e não o roster:** o drill-down da dashboard já é o fluxo "ao selecionar um atleta", já carrega o perfil agregado (zero fetch extra) e justapõe forma e carga. As alternativas anteriores (drawer; expansão inline na `DataGrid` do roster) foram descartadas — ver Histórico de pivots no `proposal.md`. O roster (`CoachAthletesPage`) fica **inalterado**.

## Decisão 2 — Dados: reuso de `selectedProfile.pmc`, sem hook/serviço novo

A dashboard já chama `useAthleteProfile(selectedId)` e tem `selectedProfile.pmc` em mãos. A série é mapeada na página e passada ao painel:

```
// CoachInboxPage
const selectedPmc = useMemo(() => buildPmcDataPoints(selectedProfile?.pmc ?? []), [selectedProfile?.pmc]);
// ...
<DiagnosisTabPanel selected={selected} pmc={selectedPmc} limiareisInferidos={...} onOpenPlan={...} />
```

- **Sem fetch novo:** nenhum hook PMC dedicado, nenhum serviço novo, nenhum endpoint coach-scoped adicional. A série vem do perfil agregado já buscado.
- **AC5 — escopo:** o perfil é coach-scoped por `atletaId` (`useAthleteProfile`); nunca `/me/*`. Isolamento de tenant é o já garantido no backend.

## Decisão 3 — Adapter compartilhado `buildPmcDataPoints`

`buildPmcDataPoints(pontos: PmcPontoRaw[]): PMCDataPoint[]` (`features/athlete/adapters/pmcAdapter.ts`): `{ data: string }` → `{ date: parseISO(data) }`, demais campos 1:1.

- Fonte **única** do mapeamento PMC → chart, **adotada pela dashboard e pela página de perfil** (`CoachAthleteProfilePage`), eliminando o `.map(... parseISO)` inline duplicado.
- Entrada tipada por `PmcPontoRaw` (tipo do perfil em `types/AtletaPerfilCoach.ts`); saída `PMCDataPoint` (tipo do `PMCChart`).

## Decisão 4 — Render do gráfico no painel

```
<SectionCard title="Tendência de forma (PMC)">
  {pmc.length === 0
    ? <Typography>Sem histórico de PMC para exibir ainda.</Typography>
    : <Suspense fallback={<CircularProgress/>}>
        <PMCChart data={pmc} range={pmcRange} defaultMode="advanced" onRangeChange={setPmcRange} />
      </Suspense>}
</SectionCard>
```

- `PMCChart` é **lazy** (mantém recharts fora do chunk principal), envolto em `Suspense`.
- **Estado vazio:** sem série, mostra mensagem e **não** monta o chart (evita recharts colapsando em container sem dados / ruído de testes).
- **Range:** estado local `pmcRange` (default `12w`), `defaultMode="advanced"` — igual à página de perfil; cosmético.

## Contrato com a API (consumo, sem mudança)

| Endpoint | Método | Role | Uso |
|---|---|---|---|
| `/api/v1/coach/atletas/{id}/perfil` (já consumido por `useAthleteProfile`) | GET | TECNICO/ADMIN | perfil agregado do selecionado, traz `pmc[]` usado pelo gráfico |

Nenhum endpoint novo. Nenhum `/me/*`.

## Sequenciamento

Frontend-only, repo `apps/menthoros-front`, branch `feature/add-athlete-tsb-chart-on-selection`:
1. Adapter `buildPmcDataPoints` (TDD) + adoção na página de perfil.
2. `DiagnosisTabPanel`: prop `pmc` + `SectionCard` com `PMCChart` lazy + estado vazio.
3. `CoachInboxPage`: mapear `selectedProfile.pmc` e passar ao painel.
4. Testes + verificação.

## Impacto em testes

- **Adapter:** `buildPmcDataPoints` — converte ISO→Date 1:1; lista vazia.
- **Dashboard (`CoachInboxPage.test`):** aba Diagnóstico mostra "Tendência de forma (PMC)" junto de "Tendência de carga"; estado vazio sem série (não monta o chart); com série, o `PMCChart` (stub) renderiza via Suspense.

## Não-objetivos

- Readiness coach-scoped por atleta (backend) — follow-up.
- Série de carga semanal por atleta coach-scoped (backend) — follow-up.
- Qualquer mudança no roster (`CoachAthletesPage`), contrato, DTO ou schema.
