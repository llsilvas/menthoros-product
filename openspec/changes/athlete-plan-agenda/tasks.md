# Tasks — athlete-plan-agenda

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build`
(+ `npm run test:run` em lógica; E2E onde indicado — o plano é fluxo crítico).

## 0. Contrato

- [ ] 0.1 Verificar em `useAthletePlan`/`AthletePlanService` o que o plano do atleta expõe: só a
      semana corrente? etapas por treino? pace alvo? Registrar aqui e decidir D2 (expansão vs.
      detalhe) e a navegação de semana. Validação: nota nesta task.

## 1. Agenda

- [ ] 1.1 Adapter `buildWeekAgenda(plano, weekDates, hoje)` → linhas com `{date, isToday, workout,
      status, durationMin, distanceKm?, zoneLabel?}`; reaproveitar `buildWeeklyPlan`/`weekDatesFromInicio`.
      Sem fabricar distância quando não houver pace. Validação: `test:run` (casos: hoje, descanso,
      concluído, pulado, futuro).
- [ ] 1.2 `WeekAgendaRow` (linha; variantes descanso/hoje-expandido) e `WeekAgenda` (lista), status
      por ícone (D4), cor por `workoutTypeColor` + legenda. Validação: testes de componente.
- [ ] 1.3 Toque: expansão única por linha (D2 sem etapas) ou `WorkoutDetailDrawer` (D2 com etapas).
      Remover o no-op `handleDayPress`. Validação: teste de comportamento.
- [ ] 1.4 Substituir `WeeklyPlanList`/`DayCard` no `AthletePlanPage`; remover os componentes e
      seus testes quando nenhum outro consumidor existir (verificar `features/coach`). Validação:
      lint+build+test.

## 2. Volume e cabeçalho

- [ ] 2.1 Rodapé de volume neutro (D3): `toFixed(1)`, marcador do esperado-até-hoje, "Dia N de 7 ·
      X de Y treinos feitos"; remover `getTSSInterpretation`/`getTSSBarColor`. Validação: testes.
- [ ] 2.2 Cabeçalho "Plano da semana" + intervalo + objetivo semanal; controles de semana
      anterior/próxima **só se** 0.1 confirmar endpoint. Validação: teste de página.

## 3. E2E

- [ ] 3.1 `tests/e2e/athlete/plan.spec.ts` em 390×844: sete linhas sem scroll horizontal; hoje
      expandido com "Registrar treino" navegando para o registro; toque expande/colapsa; rodapé
      "Dia N de 7" sem texto de juízo; nenhum "TSS". Validação: `npm run test:e2e` verde.
