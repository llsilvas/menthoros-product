# Tasks — add-athlete-tsb-chart-on-selection

> Frontend-only (`apps/menthoros-front`), branch `feature/add-athlete-tsb-chart-on-selection`. TDD onde fizer sentido.
> Superfície (design.md, pivot 2): **gráfico PMC na aba Diagnóstico da dashboard** (`CoachInboxPage` → `DiagnosisTabPanel`), junto de "Tendência de carga", reusando `selectedProfile.pmc`. Roster **inalterado**.
> Validação: `npm run lint && npm run build && npm run test:run`.

## 0. Adapter compartilhado PMC

- [x] 0.1 `buildPmcDataPoints(pontos: PmcPontoRaw[]): PMCDataPoint[]` em `features/athlete/adapters/pmcAdapter.ts` (ISO→Date, campos 1:1) + testes.
- [x] 0.2 Adotar o adapter em `CoachAthleteProfilePage` (remove o `.map(... parseISO)` inline duplicado e o import de `parseISO`).

## 1. Aba Diagnóstico — gráfico PMC

- [x] 1.1 `DiagnosisTabPanel`: nova prop `pmc: PMCDataPoint[]`.
- [x] 1.2 `SectionCard "Tendência de forma (PMC)"` logo após "Tendência de carga": `PMCChart` lazy (`defaultMode="advanced"`) em `Suspense`; estado vazio quando sem série (não monta o chart); range local (`12w`).

## 2. Integração — CoachInboxPage

- [x] 2.1 `selectedPmc = useMemo(() => buildPmcDataPoints(selectedProfile?.pmc ?? []), [selectedProfile?.pmc])` — sem fetch novo.
- [x] 2.2 Passar `pmc={selectedPmc}` ao `DiagnosisTabPanel`.

## 3. Testes

- [x] 3.1 Adapter: ISO→Date 1:1; lista vazia.
- [x] 3.2 `CoachInboxPage.test`: "Tendência de forma (PMC)" aparece junto de "Tendência de carga"; estado vazio sem série (chart não monta); com série, `PMCChart` (stub) renderiza via Suspense.
- [x] 3.3 **verify:** lint + build + test:run verdes (245 testes, 27 arquivos).

## 4. Verificação de aceite (DoD)

- [x] 4.1 AC1/AC2: gráfico PMC na aba Diagnóstico, após a tendência de carga, com a série do atleta selecionado.
- [x] 4.2 AC4: estado vazio coberto por teste, sem quebrar a dashboard.
- [x] 4.3 AC5: série vem de `useAthleteProfile` (coach-scoped por `atletaId`); nenhum `/me/*`; nenhum endpoint/serviço/hook novo.
- [x] 4.4 AC3: roster e navegação para `/coach/athletes/:id` inalterados (CoachAthletesPage revertido para `develop`).
- [ ] 4.5 QA visual em navegador real (validação humana) — pendente.
- [ ] 4.6 PR aberto (`feature/add-athlete-tsb-chart-on-selection` → `develop`); CI verde. Não mergear local.

## Histórico (descartado nos pivots)

- Pivots 1 (drawer) e 2 (expansão inline no roster) foram **revertidos**: o painel inline do roster, o componente `AthleteQuickViewPanel`, o hook `useAthletePmc`, o serviço `AtletaProgressService` e o tipo `MetricasPmc` foram removidos. `CoachAthletesPage` voltou ao estado de `develop`.
