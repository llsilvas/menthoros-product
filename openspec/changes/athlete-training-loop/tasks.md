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
- [ ] 0.3 **Decisão do founder (bloqueia A.2 e a métrica):** motivo do pulo — opcional, enum
      `SEM_TEMPO | CANSADO | DOR | OUTRO`, validado no backend (proposta) — e confirmar assessoria
      piloto com atletas no shell.
- [ ] 0.4 **Decisão do founder (bloqueia CA4):** upload `.fit` e Strava não vinculam planejado
      (`FitTreinoPersister:87`, `Strava*ServiceImpl` → só `IngestaoTreinoRealizadoService`).
      Opções: (a) task backend nova passando `.fit` pela mesma cadeia `CandidateSelector` →
      `ReconciliationDecisionExecutor` do intervals.icu (escopo sobe; Strava idem ou não);
      (b) CA4 nomeia manual + intervals.icu + reconciliação manual e `.fit`/Strava viram linha no
      Radar. **Recomendação: (b)** — é o mesmo corte por seam que tirou a fatia C; o founder é quem
      mais usa `.fit` e vai sentir a lacuna primeiro, então a linha do Radar precisa de data.
- [ ] 0.5 Spec deltas em `openspec/specs/` (antes de A.1, DoR Codex): `me/home` (+`hoje`,
      +`realizadoHoje`), `GET/POST me/treinos/hoje[/pular]`, `POST me/realizados/{id}/feedback`,
      `AtletaPerfilCoachOutputDto.realizadosRecentes` — payloads, status, tenant/404, migrations.
      verify: `openspec validate` verde.

## A. Modo treino

- [ ] A.0 Backend: `hojeDoAtleta` por `Atleta.timezone` (D2b) num helper reutilizado por `me/home`
      e pelos endpoints novos; `me/home` passa a devolver `hoje` e `realizadoHoje` (D1).
      `AtletaProgressServiceImpl.getHome` hoje usa `LocalDate.now(clock)` sem fuso. Testes com clock
      fixo às 23:50 e 00:10 em fuso ≠ servidor; `realizadoHoje` nulo sem realizado.
      verify: `AtletaHomeDto` com os dois campos; `./mvnw test -Dtest=AtletaProgressService*`.
- [ ] A.1 Backend: `GET /api/v1/atletas/me/treinos/hoje` (etapas + `alvoPrimario` + FC/pace +
      `textoSecundario`, D2). Testes: igualdade com o `WorkoutStep` do `IntervalsIcuWorkoutConverter`
      (FC vence, pace vira texto); etapa sem alvo → `NENHUM`; isolamento por atleta/tenant.
- [ ] A.2 Backend: `POST /api/v1/atletas/me/treinos/hoje/pular { motivo? }` → `PERDIDO` +
      `motivoPulo` + `puladoEm` (D4, migration aditiva; enum conforme 0.3). Testes: status e
      motivo; reversão ao criar `TreinoRealizado` pelos **três caminhos que vinculam** (manual
      `TreinoServiceImpl:561`, sync intervals.icu `ReconciliationDecisionExecutor:118`,
      reconciliação manual `ManualReconciliationServiceImpl:82`) limpando o motivo; `.fit`/Strava
      conforme 0.4; aparece no Plano do atleta no mesmo dia; tenant.
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
