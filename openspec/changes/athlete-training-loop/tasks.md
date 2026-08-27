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
- [ ] A.3 Front: cliente curado + `useTodayWorkout` (loading/error/empty). Testes de hook.
- [ ] A.4 Front: `AthleteWorkoutPage` (rota `/athlete/workout/today` — nova em `ROUTES`, no tipo
      `AthleteRoute` e no `App.tsx:140`, que hoje só registra home/plan/progress/coach/profile/
      training-log/onboarding): perfil full, etapas com alvo, "Concluí o treino" → registro
      pré-preenchido, "Não vou conseguir hoje" → confirmação + pular. Entradas na Home e no Plano.
      Testes de página + teste de roteamento com `createHashRouter` real (`href="#/athlete/workout/today"`).
- [ ] A.5 E2E `training-loop.spec.ts` parte A em 390×844: perfil + etapas + botão sem scroll (≤4
      etapas); concluir abre registro preenchido; pular marca o dia no Plano.

## B. Pós-treino

- [ ] B.1 Backend: `sensacoes` e `feedbackRegistradoEm` em `TreinoRealizado` (D3; comentário em
      `feedbackAtleta`, RPE em `percepcaoEsforco`), migration aditiva sem backfill;
      `POST /me/realizados/{id}/feedback` exige RPE, grava e carimba. Testes: gravação; segundo POST
      substitui; payload sem RPE → 400; manual com RPE antigo e sem carimbo → incompleto; sync sem
      RPE; tenant; regressão de `calcularTssRpe` e `ultimoRpe`; TSS ao receber RPE depois.
- [ ] B.2 Backend: `AtletaPerfilCoachOutputDto.realizadosRecentes` (últimos 7 dias, com
      `percepcaoEsforco`, `sensacoes`, `feedbackAtleta`, `feedbackRegistradoEm`) em
      `CoachAthleteProfileServiceImpl` — o perfil do coach hoje só tem planejados da semana.
      Teste de serialização e de janela; tenant.
- [ ] B.3 Front: `selectTodayState(home)` (D1) usando `hoje` e `realizadoHoje` do contrato (nunca
      a data do aparelho — `AthleteHomePage.tsx:134` ainda usa `new Date()`) e completude por
      `feedbackRegistradoEm`; testes por estado, incluindo RPE sem carimbo.
- [ ] B.4 Front: `PostWorkoutFeedbackCard` reescrito para o hero: dados do feito + origem, RPE 1–10
      (10 alvos de 40px), chips de sensação, frase opcional; um envio. Áudio desligado até a
      mensageria (Open Question). Testes de componente.
- [ ] B.5 Front: Home usa `selectTodayState`; "Registrar treino" some quando há realizado por sync;
      `CoachAthleteProfilePage` ganha `SectionCard` "Treinos recentes" (adapter de
      `realizadosRecentes`, feedback só quando carimbado). Testes de página (atleta e coach).
- [ ] B.6 E2E parte B: registrar → "Como foi?" → enviar → hero mostra feedback; coach vê no drilldown.

## C. Fechamento

- [ ] C.1 Conferir que os spec deltas da 0.5 batem com o que foi entregue (feedback, pulo,
      `realizadosRecentes`); arquivar promove para `openspec/specs/`. Validação: revisão.
- [ ] C.2 PRs coordenados backend → front; `tasks.md` marcado; métricas de sucesso instrumentadas
      (contadores de feedback e de pulo).
