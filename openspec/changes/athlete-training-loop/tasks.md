# Tasks — athlete-training-loop

Repos: `apps/menthoros-backend` (`./mvnw clean verify`) e `apps/menthoros-front`
(`npm run lint && npm run build && npm run test:run`; E2E obrigatória — registro, plano e check-in
são fluxos críticos). Depende de `athlete-home-restructure` e `athlete-home-workout-profile`.

## 0. Contrato e premissas

- [x] 0.1 **Resolvido em 2026-08-26, na criação:** não existe entidade de ajuste de plano no backend
      (`PlanAdjustmentCard` só é usado por `CoachChatPanel`) → fatia C retirada. `IntervalsIcuFcAlvoResolver`
      é helper sem estado (`resolver(FcAlvoBruto, Atleta)`) → invocável fora do push.
      `TreinoRealizado.rpe` já existe (`TssCalculatorService`) → D3 não duplica nem move o RPE.
- [ ] 0.2 Medir nos planos ativos quantas etapas têm alvo de FC resolvível (parser + resolver) e o
      baseline de "realizados com RPE" nas 4 semanas anteriores. Registrar aqui. **Bloqueada em
      2026-08-27:** Postgres do HomeLab (`192.168.3.5:5433`) fora; medir quando voltar.
- [x] 0.3 **Decidido pelo founder em 2026-08-27:** motivo do pulo **opcional**, enum
      `MotivoPulo { SEM_TEMPO, CANSADO, DOR, OUTRO }` validado no backend (`400` fora da lista;
      ausente = pulo sem motivo). Piloto: o founder é o atleta piloto (mesmo override da
      `athlete-home-restructure`) — a métrica é medida no HomeLab.
- [x] 0.4 **Decidido pelo founder em 2026-08-27 — cortar:** upload `.fit` e Strava não vinculam
      planejado (`FitTreinoPersister:87`, `Strava*ServiceImpl` → só `IngestaoTreinoRealizadoService`)
      e **continuam assim nesta change**. CA4 nomeia manual + intervals.icu + reconciliação manual;
      "`.fit`/Strava passam pela reconciliação" é linha do Radar no `SPRINTS.md`, com o founder
      como primeiro afetado (ele registra por `.fit`).
- [x] 0.5 Spec deltas (DoR Codex): `specs/athlete-today-workout/spec.md` (`hoje` por fuso,
      `realizadoHoje` no `me/home`, `GET me/treinos/hoje` com alvos pela cadeia do push, `POST
      .../pular`, reversão nos três caminhos, `.fit` não reverte, tenant, migration) e
      `specs/athlete-workout-feedback/spec.md` (feedback + carimbo, validações, TSS por RPE
      tardio, `realizadosRecentes` no perfil do coach, migration). **Feito 2026-08-27.**
      `openspec validate` não rodou — CLI ausente na máquina; revisão manual.

## A. Modo treino

- [x] A.0 Backend: `AtletaHojeResolver` (`hojeDe`/`agoraDe` por `Atleta.timezone`, fallback
      `America/Sao_Paulo`, fuso inválido logado) usado por `me/home` e pelos endpoints novos;
      `AtletaHomeDto` ganhou `hoje` e `realizadoHoje` (mais recente por `criadoEm`;
      `feedbackRegistradoEm` fica `null` até a B.1). Testes: 23:50 em Manaus com servidor em UTC,
      00:10 com servidor a oeste, fuso inválido/nulo. **Feito 2026-08-27.**
- [x] A.1 Backend: `GET /me/treinos/hoje` → `TreinoHojeDto` (200/204). `EtapaAlvoResolver`
      reproduz a precedência de `IntervalsIcuWorkoutConverter.stepDeEtapa` e o teste compara
      contra o `WorkoutStep` real do converter (FC vence → pace em `textoSecundario`; FC
      descartada → pace assume e a FC vai para o texto; nada → `NENHUM`). Achado: por etapa o
      parser só lê `bpm`/`%` — zona textual é do treino; spec delta corrigida. **Feito 2026-08-27.**
- [x] A.2 Backend: `POST /me/treinos/hoje/pular` (motivo opcional, `MotivoPulo` de 4 valores →
      400 fora da lista; 422 sem treino ou já realizado), `PERDIDO` + `motivo_pulo` + `pulado_em`
      (V81, aditiva). `TreinoPlanejado.limparPulo()` chamado nos três caminhos que vinculam,
      cada um com teste de reversão; `TreinoPlanejadoOutputDto` expõe `motivoPulo`/`puladoEm`
      (MapStruct, teste de wiring) — é o DTO do Plano do atleta e do detalhe do coach. O `.fit`
      não tem teste negativo: `FitTreinoPersister` nem injeta o repositório de planejado, não há o
      que verificar — a spec delta registra o comportamento. **Feito 2026-08-27.**
      verify: `./mvnw clean test` 2827/2827.
- [x] A.3 Front: `AthleteWorkoutTodayService` (`getTreinoHoje`, `pularHoje`) + `useTodayWorkout`
      (loading/error/empty; `pular` com `pulando`/`pularError` próprios, sem sobrescrever o
      treino em caso de falha). `TreinoHoje`/`EtapaAlvo` em `types/AthleteWorkoutToday.ts`.
      `buildTodayWorkoutProfile` reaproveita `buildProfileFromTreino` (mesmo motor visual de
      Home/Plano) mapeando `EtapaAlvo` → `EtapaTreino`; `formatAlvoEtapa` formata FC/pace já
      resolvidos. Testes: hook (6), adapter (6). **Feito 2026-08-27.**
- [x] A.4 Front: `AthleteWorkoutPage` na rota `/athlete/workout/today` (nova em `ROUTES`, no tipo
      `AthleteRoute` e no `App.tsx`): perfil full, etapas com alvo/duração, "Concluí o treino" →
      `navigate(ATHLETE_TRAINING_LOG, { state: { tipo, duracaoMinutos } })`, "Não vou conseguir
      hoje" → `SkipWorkoutDialog` (motivo opcional, 4 chips) → `pular`. Estado vazio, erro,
      loading e "já pulado" (`statusTreino === 'PERDIDO'`) tratados. `ManualTrainingForm` ganhou
      `initial?: { tipo, duracaoMinutos }` para o pré-preenchimento (CA3); `ManualTrainingFormPage`
      lê de `location.state`, validado campo a campo. Entradas: link "Ver etapas e começar" no
      `TodayHeroCard` (só quando `proximoTreino.data` é hoje — `homeAdapter.isToday`) e no
      `WorkoutDetailDrawer` do Plano (dia de hoje). Testes: página (9), `ManualTrainingForm` (+1),
      `homeAdapter`/`TodayHeroCard` (+4), `AthletePlanPage` (+1, agora com router real —
      `WorkoutDetailDrawer` ganhou um `Link`). **Feito 2026-08-27.**
- [x] A.5 E2E `training-loop.spec.ts` parte A em 390×844: perfil + 3 etapas + "Concluí o treino"
      sem scroll (`boundingBox` dentro de 844px); concluir navega e pré-preenche tipo/duração;
      "Não vou conseguir hoje" com motivo marca PERDIDO e o Plano mostra `data-status="pulado"`
      no mesmo dia (mapeamento existente de `dayStatus.ts`, sem mudança). Achado: o catch-all de
      mock precisa devolver `[]` para endpoints de lista (`/me/treinos`) e `{}` só para os de
      objeto — `{}` genérico quebrava `useManualTraining` de forma intermitente (mesmo padrão do
      `plan.spec.ts`). **Feito 2026-08-27.** verify: `npx playwright test tests/e2e/athlete` 19/19.

## B. Pós-treino

- [x] B.1 Backend: `sensacoes` (V82, `ElementCollection` **EAGER**, tipo `Set` não `List` — dois
      achados encadeados no `clean test`: (1) LAZY quebrava `LazyInitializationException` em
      `IntervalsIcuActivityImportIntegrationTest` (ingestão .fit/Strava/intervals.icu serializa
      `TreinoRealizado` fora de sessão); EAGER na entidade não bastou porque o `@EntityGraph`
      existente em `findByTenantIdAndFonteDadosAndExternalId` é `type=FETCH` (padrão do Spring
      Data) — nesse modo tudo fora da lista do graph volta a LAZY na query, então `sensacoes`
      precisou entrar no `attributePaths`; (2) com dois `List` (`etapasRealizadas` +
      `sensacoes`) no mesmo `@EntityGraph`, `MultipleBagFetchException` — `sensacoes` virou `Set`
      (sem ordem que importe, é o tipo certo, não um contorno) e `TreinoRealizadoOutputDto`/
      `RealizadoRecenteDto` seguem `List` (conversão na borda). `feedbackRegistradoEm` em
      `TreinoRealizado`; `POST /me/realizados/{id}/feedback`
      (`FeedbackTreinoInputDto`, RPE `@NotNull @Min(1) @Max(10)` → 400) grava e carimba, chama
      `ingestaoTreinoRealizadoService.reprocessar(id, null)` (recalcula TSS quando o RPE é a única
      fonte). Testes: `AtletaTreinoFeedbackServiceImplTest` (5, grava/substitui/reprocessar/
      isolamento por atleta e tenant), `AtletaTreinoControllerTest` (+4), `TreinoMapperFeedbackTest`
      (2, wiring). `TreinoRealizadoOutputDto` ganhou `sensacoes`/`feedbackRegistradoEm` no fim do
      record (7 call-sites posicionais ajustados). **Feito 2026-08-27.**
- [x] B.2 Backend: `AtletaPerfilCoachOutputDto.RealizadoRecenteDto` + `realizadosRecentes` (últimos
      7 dias via `findByAtletaIdAndTenantIdAndDataTreinoBetween`, existente; mais recente primeiro)
      em `CoachAthleteProfileServiceImpl` — o perfil do coach só tinha planejados da semana.
      Teste de janela/ordem/feedback (`CoachAthleteProfileServiceImplTest`, +1). **Feito 2026-08-27.**
      verify: `./mvnw clean test` — ver nota do achado EAGER acima.
- [x] B.3 Front: `selectTodayState(home)` (D1), pura, 5 estados — `realizadoHoje` vence
      `proximoTreino` (feito é o eixo do dia); completude por `feedbackRegistradoEm`, nunca por
      RPE isolado. Achado: `AtletaHomeDto.ProximoTreino` não tinha `statusTreino`/`motivoPulo` —
      sem eles o front não distinguia PULADO de PENDENTE; e `realizadoHoje.feedbackRegistradoEm`
      estava hardcoded `null` desde a A.0 — corrigidos no backend (commit `46024fe`, fora desta
      task mas descoberto por ela). Testes: 9 casos. **Feito 2026-08-27.**
- [x] B.4 Front: **`TodayFeedbackCard` novo** (não o `PostWorkoutFeedbackCard` existente, que é a
      tela pós-registro manual em `ManualTrainingFormPage` — propósito diferente; reescrevê-lo
      quebraria esse fluxo sem necessidade). Dados do feito + origem, RPE 1–10 (10 alvos de 40px,
      `role="radio"`), chips de sensação (multi-seleção), frase opcional; um envio via
      `useAthleteFeedback` → `POST me/realizados/{id}/feedback`. Áudio desligado (Open Question).
      `TodayCompletedCard` (estado FEITO) e `TodaySkippedCard` (estado PULADO) também novos —
      D1 tem 5 estados, o hero precisa dos 3 que `TodayHeroCard` não cobre. Testes: 6 + 2 + 2.
      **Feito 2026-08-27.**
- [x] B.5 Front: `AthleteHomePage` troca o hero pelo card do estado (`selectTodayState`); com
      realizado (sync ou manual) o "Registrar treino" desaparece — substituído pelo card do
      estado, não escondido condicionalmente. Drilldown do coach: `RecentTrainingsPanel` novo,
      seção "Treinos recentes" em `CoachAthleteProfilePage` (RPE + sensações + comentário quando
      carimbado). Testes: Home +5 (fixture padrão do arquivo ganhou `hoje`/`proximoTreino.data`
      para não regredir os 26 testes existentes), coach +1, painel 3. **Feito 2026-08-27.**
      verify: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` 1349/1349.
- [x] B.6 E2E parte B, em `training-loop.spec.ts`: realizado sem feedback → hero mostra "Como
      foi?" sem "Registrar treino" → RPE 6 → enviar → hero mostra o resumo (`training-loop.spec.ts`
      390×844); coach autenticado (`TECNICO`) vê "Treinos recentes" com RPE/sensações/comentário
      no drilldown. Achado: `CoachAthleteProfilePage` nunca tinha E2E — o catch-all `{}` genérico
      fazia `useWeeklyAthleteReview` tratar "sem revisão" como uma revisão vazia válida, e
      `buildWeeklyReviewFromDto` quebrava em `parseISO(undefined)`; o backend real devolve 404
      quando não há revisão, corrigido no mock. **Feito 2026-08-27.**
      verify: `npx playwright test tests/e2e/athlete tests/e2e/coach` 66/66.

## C. Fechamento

- [x] C.1 Spec deltas conferidos contra o entregue — batiam em tudo (endpoints, contratos,
      isolamento); ajustes: nomes reais das migrations (`V81`, `V82`) citados nos dois deltas,
      e `sensacoes` documentado como `Set` (não `List`) com a razão (`MultipleBagFetchException`
      + `@EntityGraph type=FETCH`). Adicionado requirement de métricas de sucesso no delta de
      feedback. **Feito 2026-08-27.**
- [x] C.2 Métricas de sucesso instrumentadas: `atleta_treino_feedback_total` e
      `atleta_treino_pulo_total` (Micrometer `Counter`, mesmo padrão de
      `intervals_icu.import.etapas`). PRs coordenados backend → front — ver relato do `/pr`.
