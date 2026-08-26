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
      baseline de "realizados com RPE" nas 4 semanas anteriores. Registrar aqui.
- [ ] 0.3 Decidir com o founder o motivo do pulo (opcional, lista de 4) e confirmar assessoria
      piloto com atletas no shell.

## A. Modo treino

- [ ] A.0 Backend: `hojeDoAtleta` por `Atleta.timezone` (D2b) num helper reutilizado por `me/home`
      e pelos endpoints novos; `me/home` passa a devolver `hoje`. Testes com clock fixo às 23:50 e
      00:10 em fuso ≠ servidor.
- [ ] A.1 Backend: `GET /api/v1/atletas/me/treinos/hoje` (etapas + `alvoPrimario` + FC/pace +
      `textoSecundario`, D2). Testes: igualdade com o `WorkoutStep` do `IntervalsIcuWorkoutConverter`
      (FC vence, pace vira texto); etapa sem alvo → `NENHUM`; isolamento por atleta/tenant.
- [ ] A.2 Backend: `POST /api/v1/atletas/me/treinos/hoje/pular { motivo? }` → `PERDIDO` +
      `motivoPulo` + `puladoEm` (D4, migration aditiva). Testes: status e motivo; reversão ao criar
      `TreinoRealizado` pelos **três** caminhos (manual `TreinoServiceImpl`, FIT/sync,
      reconciliação) limpando o motivo; aparece no drilldown do coach no mesmo dia; tenant.
- [ ] A.3 Front: cliente curado + `useTodayWorkout` (loading/error/empty). Testes de hook.
- [ ] A.4 Front: `AthleteWorkoutPage` (rota `/athlete/workout/today`): perfil full, etapas com alvo,
      "Concluí o treino" → registro pré-preenchido, "Não vou conseguir hoje" → confirmação + pular.
      Entradas na Home e no Plano. Testes de página.
- [ ] A.5 E2E `training-loop.spec.ts` parte A em 390×844: perfil + etapas + botão sem scroll (≤4
      etapas); concluir abre registro preenchido; pular marca o dia no Plano.

## B. Pós-treino

- [ ] B.1 Backend: `sensacoes` e `feedbackRegistradoEm` em `TreinoRealizado` (D3; comentário em
      `feedbackAtleta`, RPE em `percepcaoEsforco`), migration aditiva sem backfill;
      `POST /me/realizados/{id}/feedback` exige RPE, grava e carimba. Testes: gravação; segundo POST
      substitui; payload sem RPE → 400; manual com RPE antigo e sem carimbo → incompleto; sync sem
      RPE; tenant; regressão de `calcularTssRpe` e `ultimoRpe`; TSS ao receber RPE depois.
- [ ] B.2 Backend: expor feedback no DTO de realizados consumido pelo drilldown do coach. Teste de
      serialização.
- [ ] B.3 Front: `selectTodayState` (D1) usando `hoje` do contrato (nunca a data do aparelho) e
      completude por `feedbackRegistradoEm`; testes por estado, incluindo RPE sem carimbo.
- [ ] B.4 Front: `PostWorkoutFeedbackCard` reescrito para o hero: dados do feito + origem, RPE 1–10
      (10 alvos de 40px), chips de sensação, frase opcional; um envio. Áudio desligado até a
      mensageria (Open Question). Testes de componente.
- [ ] B.5 Front: Home usa `selectTodayState`; "Registrar treino" some quando há realizado por sync;
      drilldown do coach mostra feedback nos treinos recentes. Testes de página (atleta e coach).
- [ ] B.6 E2E parte B: registrar → "Como foi?" → enviar → hero mostra feedback; coach vê no drilldown.

## C. Fechamento

- [ ] C.1 Atualizar specs de capability em `openspec/specs/` se o contrato do plano/realizado mudar
      (feedback, pulo). Validação: revisão.
- [ ] C.2 PRs coordenados backend → front; `tasks.md` marcado; métricas de sucesso instrumentadas
      (contadores de feedback e de pulo).
