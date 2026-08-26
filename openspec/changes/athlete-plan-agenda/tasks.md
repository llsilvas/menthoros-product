# Tasks — athlete-plan-agenda

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build`
(+ `npm run test:run` em lógica; E2E onde indicado — o plano é fluxo crítico).

## 0. Contrato

- [x] 0.1 **Resolvido no DoR (2026-08-26).** `GET /api/v1/planos/{atletaId}` devolve um objeto: o
      plano APROVADO mais recente (`PlanoServiceImpl:850-855`), com `etapas` por treino
      (`TreinoPlanejadoOutputDto:81`, em transação), `ritmoAlvo` e `distanciaKm`. Sem endpoint de
      semanas passadas → navegação fora. D2 decide por treino; `EtapaTreino` ganha campos de bloco.

## 1. Agenda

- [ ] 1.0 `selectAthletePlan`: `hoje` em data local (`date-fns format`) em vez de `toISOString`;
      teste com `vi.setSystemTime` às 23:30 de domingo em UTC-3 escolhendo a semana corrente.
      Validação: `test:run`.
- [ ] 1.1 Adapter `buildWeekAgenda(plano, weekDates, hoje)` → linhas com `{date, isToday, workout,
      status, durationMin, distanceKm?, zoneLabel?, temEtapas}`; reaproveitar `weekDatesFromInicio`.
      Distância: `distanciaKm` prescrita; senão `duracaoMin × ritmoAlvo` quando houver pace; senão
      ausente. Validação: `test:run` (casos: hoje, descanso, concluído, pulado, futuro, plano de
      outra semana → nenhum "hoje").
- [ ] 1.2 `WeekAgendaRow` (linha; variantes descanso/hoje-expandido) e `WeekAgenda` (lista), status
      por ícone (D4), cor por `workoutTypeColor` + legenda. Validação: testes de componente.
- [ ] 1.3 `EtapaTreino` (`types/TreinoPlanejado.ts`) ganha `blocoId?`, `blocoRepeticoes?`,
      `blocoRepeticaoIndex?`; `fromEtapaTreino` (`features/workout/profile/input.ts`) os mapeia.
      Validação: teste do adapter com série 4× produzindo `repeat` nos blocos; testes do coach
      (`DetalheTreinoDialog`) verdes.
- [ ] 1.3a Toque por treino: sem etapas → expansão única; com etapas → `WorkoutDetailDrawer`
      (descrição, etapas, `WorkoutProfile`). Remover o no-op `handleDayPress`. Validação: testes
      de comportamento nos dois casos.
- [ ] 1.4 Substituir `WeeklyPlanList`/`DayCard` no `AthletePlanPage`; mover os tipos que
      `buildWeeklyPlan` importa deles (`CompletionStatus`, `WorkoutType`, `WeeklyWorkout`) para o
      adapter; remover os componentes, seus testes e o comentário em `src/test/setup.ts`.
      Nenhum consumidor em `features/coach`. Validação: lint+build+test; `rg "DayCard|WeeklyPlanList"
      src` só em nomes de adapter, se restarem.

## 2. Volume e cabeçalho

- [ ] 2.1 Rodapé de volume neutro (D3): `toFixed(1)`, marcador do esperado-até-hoje, "Dia N de 7 ·
      X de Y treinos feitos"; remover `getTSSInterpretation`/`getTSSBarColor`. Validação: testes.
- [ ] 2.2 Cabeçalho "Plano da semana" + intervalo + objetivo semanal; **sem** controles de semana
      (0.1: não há endpoint). Quando o plano não contém hoje, subtítulo deixa claro ("semana de
      D a D"). Validação: teste de página.

## 3. E2E

- [ ] 3.1 `tests/e2e/athlete/plan.spec.ts` em 390×844: sete linhas sem scroll horizontal; hoje
      expandido com "Registrar treino" navegando para o registro; toque em treino sem etapas
      expande/colapsa; toque em treino com etapas abre o drawer com `workout-profile`; rodapé
      "Dia N de 7" sem texto de juízo; nenhum "TSS". Validação: `npm run test:e2e` verde.
