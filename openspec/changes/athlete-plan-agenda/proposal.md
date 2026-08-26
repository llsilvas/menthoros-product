**Tamanho:** M · **Trilha:** Full

## Why

A revisão de design da tela do atleta (2026-08-26, canvas
<https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>, prancheta "Plano — atual")
encontrou cinco problemas no `AthletePlanPage`:

1. **A semana não cabe.** `WeeklyPlanList` é um scroll horizontal de `DayCard` de 160–200px:
   ~2 dias visíveis em 390px. A visão da semana — o motivo da tela — exige arrastar.
2. **Toque sem resposta.** Os cards têm `cursor: pointer` e hover, mas `handleDayPress` é no-op
   ("Futuramente: abrir detalhe do treino").
3. **Unidades desencontradas.** Cards falam "45 min" e "TSS estimado: 52"; o rodapé fala km — e os
   14,5 km da Home viram 14 km aqui (`Math.round` em `AthletePlanPage`). Dias futuros a 60% de
   opacidade esmaecem justamente o que o atleta abriu a tela para ver.
4. **A leitura da carga julga cedo.** Na quarta, 14/42 km rende "Semana leve — abaixo do planejado"
   (`getTSSInterpretation` ignora o dia da semana). A cor da barra fica verde a partir de 0,8, mas o
   texto diz "moderada" até 0,85.
5. **Codificação tripla.** Hoje = borda esquerda lime + badge HOJE + fundo tingido; concluído = borda
   verde + check. Cores de tipo por `categorical.cat*`, divergentes do `workoutTypeColor` da Home.

**Por que isso importa para o treinador.** O plano é o artefato que o coach aprovou; se o atleta não
consegue vê-lo inteiro no celular, o coach recebe a pergunta por mensagem. "Semana leve — abaixo do
planejado" na quarta é uma cobrança que o coach não fez e que o atleta atribui a ele.

## What Changes

Somente `apps/menthoros-front`. Versão proposta desenhada no canvas (prancheta "Plano — proposta"):

- **Agenda vertical**: os sete dias em linhas (data · ponto de cor do tipo · título · "45 min · ~8 km
  · Zona 2" · status). Hoje expandido com descrição e ação "Registrar treino". Descanso como linha
  curta. Futuro em opacidade cheia. `WeeklyPlanList`/`DayCard` são substituídos por `WeekAgenda`/
  `WeekAgendaRow`.
- **Toque no dia**: decisão **por treino**, não por change — treino com `etapas` abre o
  `WorkoutDetailDrawer` (descrição, etapas, `WorkoutProfile`); treino sem etapas expande a linha.
  O contrato traz etapas (`TreinoPlanejadoOutputDto.etapas`, carregadas em transação em
  `buscarPlanoPorAtleta`), mas o campo é opcional por item.
- **Sem navegação de semana.** `GET /api/v1/planos/{atletaId}` devolve **um** plano — o `APROVADO`
  mais recente por `semanaInicio` (`PlanoServiceImpl.buscarPlanoPorAtleta`), não uma lista nem
  "a semana que contém hoje". Não há endpoint de semanas passadas; os controles não entram.
  Consequência registrada: se o coach aprovar a próxima semana antes do fim da atual, o atleta vê
  a próxima — comportamento do contrato, fora do escopo (Non-Goals).
- **Volume em km** nos dois lugares, com uma casa decimal (`toFixed(1)`), e marcador do "esperado
  até hoje" na barra; texto neutro "Dia N de 7 · X de Y treinos feitos" substitui a interpretação
  qualitativa. `getTSSInterpretation`/`getTSSBarColor` saem. **"Hoje" e "Dia N" usam a data local
  do aparelho via `date-fns` (`format(new Date(), 'yyyy-MM-dd')`), como `buildWeeklyPlan` já faz;
  `selectAthletePlan` compara em UTC (`toISOString`) e é corrigido aqui** — à noite em UTC-3 ele
  pode escolher a semana seguinte.
- **Distância por treino: a prescrita (`distanciaKm`) primeiro**; derivar de `duracaoMin × ritmoAlvo`
  só quando ela faltar e houver pace; sem ambos, só duração e zona. Nunca fabricar.
- **Série no perfil:** `EtapaTreino` (front) ganha `blocoId` e `blocoRepeticoes`, que o
  `EtapaTreinoDto` envia (`:35-38`; **não há índice de repetição no contrato**). No plano
  persistido as etapas de um bloco vêm **uma vez**; o perfil espera uma entrada por repetição. Um
  adapter novo `expandirEtapasTreino(etapas)` agrupa as etapas consecutivas de mesmo `blocoId` e as
  replica `r = 1..blocoRepeticoes` com `blocoRepeticaoIndex = r` (mesma regra do expansor do editor
  em `profile/input.ts:100-118`); sem `blocoId` ou com `blocoRepeticoes ≤ 1`, cai em
  `fromEtapaTreino` como hoje. Sem isso o drawer desenha um intervalado como etapas soltas, sem o
  bracket "4×". O detalhe do coach pode adotar o mesmo adapter (follow-up, não aqui).
- **Status por ícone** (check / chevron / traço de descanso), sem borda lateral colorida.
- **Cor do tipo** por `workoutTypeColor` (mesma fonte da Home) + legenda.

## Non-Goals

- Não muda contrato de API. Semanas passadas **não existem no contrato** (0.1) — follow-up de
  backend, fora daqui. Não altera a regra "plano aprovado mais recente" do endpoint.
- Não redesenha a Home (`athlete-home-restructure`) nem o registro de treino.
- Não implementa "modo treino" (tela de execução) — `athlete-training-loop`.

## Critérios de aceite

1. **Semana inteira visível** — Given viewport 390×844, When o Plano carrega, Then as sete linhas
   estão no fluxo vertical, sem scroll horizontal (`scrollWidth === innerWidth` no documento e no
   container da agenda).
2. **Hoje em destaque** — Given o plano contém a data local de hoje, Then a linha de hoje está
   expandida, com a ação "Registrar treino" navegando para `ROUTES.ATHLETE_TRAINING_LOG`; Given o
   plano é de outra semana (aprovado adiantado), Then nenhuma linha está expandida e o cabeçalho
   mostra o intervalo daquela semana.
3. **Toque responde** — Given uma linha com `etapas`, When tocada, Then abre o `WorkoutDetailDrawer`
   com o `WorkoutProfile` (e, para treino com `blocoId`, o bracket de repetições); Given uma linha
   sem etapas, Then expande/colapsa; nenhuma linha tem `cursor: pointer` sem comportamento.
4. **Unidades** — Given plano com 14,5 km realizados, Then o Plano exibe "14,5 / 42 km" (mesmo
   valor da Home); nenhum texto "TSS" na tela do atleta.
5. **Leitura neutra** — Given quarta-feira (data local) e 14,5/42 km, Then o rodapé exibe "Dia 3
   de 7" e a contagem de treinos feitos, sem juízo ("leve", "abaixo do planejado"); Given 23:30 em
   UTC-3 num domingo, Then `selectAthletePlan` ainda escolhe a semana corrente (teste com
   `vi.setSystemTime`).
6. **Status** — Given treino concluído/pulado/futuro, Then o status é um ícone; nenhum elemento usa
   `border-left` colorido como codificação de estado.
7. **Cor do tipo** — Given treino FACIL, Then o ponto de cor é `workoutTypeColor('FACIL')` — o mesmo
   hex do chip da Home.
8. **Regressão** — `npm run lint && npm run build && npm run test:run` verdes; E2E
   `tests/e2e/athlete/plan.spec.ts` (novo) cobrindo 1, 2, 3 e 5 em 390×844.

## Métrica de sucesso

- **Mensagens "qual é o treino de hoje/amanhã?"** recebidas pelo coach — cair após a entrega.
  Até a mensageria existir a contagem é manual e **tem dono e lugar**: o coach do piloto anota
  por semana (WhatsApp) numa linha do `artifacts/` do piloto; 2 semanas antes e 4 depois do
  rollout. Se não houver coach piloto disposto a contar, a métrica cai para o proxy mecânico.
- Proxy mecânico: E2E dos critérios 1–7 verdes.

## Open Questions & Assumptions

- **Resolvido na criação (0.1, DoR 2026-08-26):** o endpoint real é `GET /api/v1/planos/{atletaId}`
  (`PlanoTreinoController:74-92`, `atletaId` via `GET /users/me` em `useAthletePlan:24-29`), devolve
  **um objeto** — o plano `APROVADO` mais recente (`PlanoServiceImpl:850-855`, `findTopBy…
  OrderBySemanaInicioDesc`) — que o cliente curado tipa como lista e `selectAthletePlan` normaliza.
  Traz `etapas` por treino (`TreinoPlanejadoOutputDto:81`, carregadas porque `buscarPlanoPorAtleta`
  é `@Transactional`), `ritmoAlvo` (`:44`) e `distanciaKm` (`:41`). Não há endpoint de semanas
  passadas. `EtapaTreinoDto` envia `blocoId`/`blocoRepeticoes` (sem índice de repetição), que o tipo front não tem.
- **Premissa:** o `Math.round` do volume era só apresentação — o backend devolve `BigDecimal`.
- **Follow-up de backend (fora daqui):** endpoint de semanas anteriores; e a regra "aprovado mais
  recente" vs. "semana que contém hoje" — decisão de produto a registrar no Radar.

## Definition of Ready (2026-08-26)

- `spec-reviewer`: **READY**, com correção obrigatória do endpoint citado (feita) e a nota de que
  `etapas` é opcional por treino (D2 passou a decidir por linha).
- Codex, rodada 1: **NOT READY** — 2 blockers e 3 majors, todos verificados: contrato devolve o
  aprovado mais recente (incorporado); `etapas` podem vir `null` **fora de transação** — refutado
  para este endpoint (`buscarPlanoPorAtleta` é `@Transactional`), mantida a degradação por treino
  como robustez; `distanciaKm` prescrita tem precedência sobre pace (incorporado); `fromEtapaTreino`
  perde `blocoId` (incorporado — tipo + adapter); `selectAthletePlan` em UTC (incorporado, com
  teste de 23:30 em UTC-3); limpeza de referências a `DayCard` (incorporado na 1.4).
- Codex, rodada 2: os seis resolvidos; um novo, **confirmado**: a spec dizia que o DTO envia
  `blocoRepeticaoIndex` — não envia. Regra corrigida: o índice é **derivado** pela expansão
  `1..N` no adapter (`expandirEtapasTreino`), como o editor do coach já faz.

## Referências

- Canvas: <https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d> (pranchetas
  "Plano — atual" com notas 1–5 e "Plano — proposta").
- `athlete-home-restructure` — compartilha `workoutTypeColor` como fonte única de cor (D5 lá).
