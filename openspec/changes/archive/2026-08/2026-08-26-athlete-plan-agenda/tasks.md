# Tasks — athlete-plan-agenda

**Entregue e arquivada em 2026-08-26.** PR `menthoros-front#93` mergeado em `develop`. 10/10 tasks;
nada adiado — follow-ups do QA gate listados no fim, sem dono nem change.

Repo: `apps/menthoros-front`, branch `feature/athlete-plan-agenda` (base `develop` pós-#92).
Validação padrão: `npm run lint && npm run build && npm run test:run`; E2E onde indicado — o
plano é fluxo crítico. Sequência: 0 → 1.0 → 1.1 → 1.2 → 1.3 → 1.3a → 1.4 → 2 → 3.
Cada task traz `verify:` — como saber que funcionou.

## 0. Contrato

- [x] 0.1 **Resolvido no DoR (2026-08-26).** `GET /api/v1/planos/{atletaId}` devolve um objeto: o
      plano APROVADO mais recente (`PlanoServiceImpl:850-855`), com `etapas` por treino
      (`TreinoPlanejadoOutputDto:81`, em transação), `ritmoAlvo` e `distanciaKm`. Sem endpoint de
      semanas passadas → navegação fora. D2 decide por treino; `EtapaTreino` ganha campos de bloco.

## 1. Agenda

- [x] 1.0 `selectAthletePlan`: `hoje` em data local (`date-fns format`) em vez de `toISOString`;
      teste com `vi.setSystemTime` às 23:30 de domingo em UTC-3 escolhendo a semana corrente.
      Validação: `test:run`.
      verify: `selectAthletePlan.test` com `vi.setSystemTime(2026-08-30T23:30-03:00)` escolhe o plano
      de 24–30 e não o de 31.
- [x] 1.1 Adapter `buildWeekAgenda(plano, weekDates, hoje)` → linhas com `{date, isToday, workout,
      status, durationMin, distanceKm?, zoneLabel?, temEtapas}`; reaproveitar `weekDatesFromInicio`.
      Distância: `distanciaKm` prescrita; senão `duracaoMin × ritmoAlvo` quando houver pace; senão
      ausente. Validação: `test:run` (casos: hoje, descanso, concluído, pulado, futuro, plano de
      outra semana → nenhum "hoje").
      verify: `buildWeekAgenda.test.ts` cobre os 6 casos e a precedência distância prescrita >
      pace > ausente.
- [x] 1.2 `WeekAgendaRow` (linha; variantes descanso/hoje-expandido) e `WeekAgenda` (lista), status
      por ícone (D4), cor por `workoutTypeColor` + legenda. Validação: testes de componente.
      verify: linhas de treino são `role="button"` (`aria-expanded` sem etapas, `aria-haspopup="dialog"`
      com etapas); descanso **não** é interativo — não há o que expandir; nenhum `border-left`
      colorido; ícone por status via `data-status`, hoje via `data-today`.
- [x] 1.3 `EtapaTreino` (`types/TreinoPlanejado.ts`) ganha `blocoId?` e `blocoRepeticoes?`;
      adapter `indexarRepeticoes(etapas)` em `features/workout/profile/input.ts`: para cada grupo
      consecutivo de mesmo `blocoId` (tamanho `k`, `N = blocoRepeticoes`), `c = k / N`,
      `blocoRepeticaoIndex = ⌊pos / c⌋ + 1`; `k % N ≠ 0` → etapas do grupo sem `blocoId`/`blocoRepeticoes`
      (sem `repeat`); sem bloco ou `N ≤ 1` →
      `fromEtapaTreino` inalterado. **Não reexpande.** Validação: teste com 8 linhas de um bloco
      4× (esforço, recuperação × 4) → `repeat.index` 1,1,2,2,3,3,4,4 e `total` 4 em
      `selectWorkoutProfile`; 7 linhas com N = 4 → nenhum bloco com `repeat`; sem bloco → inalterado; testes do
      coach verdes.
      verify: `input.test.ts` novo casos acima; `npx vitest run src/features/workout` verde.
- [x] 1.3a Toque por treino: sem etapas → expansão única; com etapas → `WorkoutDetailDrawer`
      (descrição, etapas, `WorkoutProfile`). Remover o no-op `handleDayPress`. Validação: testes
      de comportamento nos dois casos.
      verify: teste de página — clique em linha sem etapas alterna `aria-expanded`; clique em
      linha com etapas abre `role="dialog"` contendo `data-testid="workout-profile"`.
- [x] 1.4 Substituir `WeeklyPlanList`/`DayCard` no `AthletePlanPage`; mover os tipos que
      `buildWeeklyPlan` importa deles (`CompletionStatus`, `WorkoutType`, `WeeklyWorkout`) para o
      adapter; remover os componentes, seus testes e o comentário em `src/test/setup.ts`.
      Nenhum consumidor em `features/coach`. Validação: lint+build+test; `rg "DayCard|WeeklyPlanList"
      src` só em nomes de adapter, se restarem.
      verify: os dois arquivos e seus testes não existem; `setup.ts` sem a menção; suíte verde.

## 2. Volume e cabeçalho

- [x] 2.1 Rodapé de volume neutro (D3): `toFixed(1)`, marcador do esperado-até-hoje, "Dia N de 7 ·
      X de Y treinos feitos"; remover `getTSSInterpretation`/`getTSSBarColor`. Validação: testes.
- [x] 2.2 Cabeçalho "Plano da semana" + intervalo + objetivo semanal; **sem** controles de semana
      (0.1: não há endpoint). Quando o plano não contém hoje, subtítulo deixa claro ("semana de
      D a D"). Validação: teste de página.
      verify: nenhum `button` de semana anterior/próxima; subtítulo com intervalo.
      **Seções 1–2 feitas em 2026-08-26.** Achado no teste de `indexarRepeticoes`: um grupo
      inválido (k % N ≠ 0) perde os metadados de bloco, mas o perfil ainda pode **inferir** série
      por padrão repetido (`inferirSeries`) — comportamento do componente, não do adapter; a
      asserção garante só que nenhum bracket vem do `blocoId` inválido. Teste de fuso escrito
      independente de TZ (o plano escolhido contém a data local) para não passar/falhar por
      acidente no CI em UTC. Suíte 1273.

## 3. E2E

- [x] 3.1 `tests/e2e/athlete/plan.spec.ts` em 390×844: sete linhas sem scroll horizontal; hoje
      expandido com "Registrar treino" navegando para o registro; toque em treino sem etapas
      expande/colapsa; toque em treino com etapas abre o drawer com `workout-profile`; rodapé
      "Dia N de 7" sem texto de juízo; nenhum "TSS". Validação: `npm run test:e2e` verde.
      verify: `npm run test:e2e -- tests/e2e/athlete/plan.spec.ts` verde; `smoke-tema` continua verde.
      **Feito 2026-08-26** — 3 specs; suíte E2E do atleta 14/14. Armadilha registrada: o coringa
      `**/api/**` precisa ser registrado **antes** dos handlers específicos (o Playwright avalia da
      última rota para a primeira) — registrado depois, ele engolia o plano e a tela caía no vazio.


## QA gate — 2026-08-26

Três revisões (`frontend-reviewer`, `clean-code-reviewer`, Codex adversarial). Nenhum Critical;
nenhum achado de segurança. Corrigidos no commit de QA:

- **Codex, MAJOR (real):** `statusDoDia` devolvia `hoje` antes de avaliar `REALIZADO`/`PERDIDO` —
  um treino feito hoje perdia o check no dia mais importante. `isToday` virou eixo próprio; a regra
  de status passou a ser compartilhada (`adapters/dayStatus.ts`) entre Plano e Home.
- **Codex, MAJOR ×2 (reais):** `indexarRepeticoes` deixava passar `blocoId` sem `blocoRepeticoes`
  (bloqueava a inferência do perfil) e o mesmo `blocoId` em segmentos separados (o `ProfilePlot`
  desenharia o bracket da primeira à última ocorrência, cobrindo etapas alheias). Ambos os casos
  perdem os metadados de bloco. Testes novos.
- **Codex, MAJOR (spec):** "descanso deveria ser `button`" — decisão: descanso não é interativo
  (não há o que expandir); o `verify` da 1.2 estava errado e foi corrigido.
- **clean-code, Important:** `statusDoDia`/`statusValue` duplicados → `dayStatus.ts`; `formatKm`
  triplicado → `utils/formatKm.ts`.
- **frontend, Important:** cast `(treino as { zonaAlvo })` removido (o campo entrou no tipo);
  fixtures com `as never` → fábrica tipada; `aria-haspopup="dialog"` na linha com etapas.

Follow-ups (não bloqueiam): `AgendaWorkout.treino` carrega o `TreinoPlanejado` bruto para o drawer
(migrar para um view model do detalhe quando o drawer crescer); `metaLinha` poderia vir pronta do
adapter; teste de fuso é independente de TZ e só reproduz o bug antigo em runner UTC-3 (rodado
localmente); `volumePlanejadoKm = 0` deixa a barra em 0% sem aviso.

Validação final: `lint` limpo, `build` ok, `test:run` **1275/1275**, E2E `tests/e2e/athlete` **14/14**.
