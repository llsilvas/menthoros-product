# Tasks — analise-ia-treino-atleta

Repos: `apps/menthoros-backend` (`./mvnw clean verify`) e `apps/menthoros-front`
(`npm run lint && npm run build && npm run test:run`; E2E obrigatória — o registro com RPE e o
detalhe do plano são fluxos críticos e a change cruza o contrato da API). Branch
`feature/analise-ia-treino-atleta` nos dois repos. Design: `design.md`; UI:
<https://claude.ai/code/artifact/92b790e2-173d-4a30-90bd-bba4bb829a96>.

## 0. Contrato e premissas

- [x] 0.1 **Decidido pelo founder em 2026-08-29:** sem gate do coach (exceção ao coach-in-the-loop,
      D3) e texto do atleta gerado na mesma chamada da análise (D1/D2).
- [ ] 0.2 Confirmar no código: tipo de `TreinoRealizado.duracaoMin` (para `executado.duracaoMin` em
      minutos inteiros) e o caminho de resolução do atleta autenticado usado por
      `POST /me/realizados/{id}/feedback` (reaproveitar em D4). Registrar aqui.
- [ ] 0.3 Rodar as três fixtures do `SKILL.md` (execução excelente, fadiga acumulada, fatores
      externos) contra o schema com `athlete_message` e comparar os campos do coach antes/depois.
      Decidir D2 (mesma chamada vs. segunda chamada Haiku) e se entra a checagem binária via
      Haiku de D6 ("o texto manda mudar o plano?") antes de persistir. Registrar aqui.
- [ ] 0.4 Spec delta `specs/athlete-workout-analysis/spec.md` revisada contra 0.2/0.3 (já criada na
      change; `openspec validate` não roda — CLI ausente — revisão manual).

## 1. Backend — bloco do atleta na análise

- [ ] 1.0 `buildPromptData`: `duration_min` (planejado e realizado), `avg_pace_min_km` derivado,
      `planned.steps[]` e `actual.steps[]` (`EtapaRealizada`) — só numéricos/enums, sem texto
      livre (Codex #3). `WorkoutAnalysisEligibility` (RPE presente, `maxIdadeDias`, switch)
      extraído do listener para reuso no endpoint (Codex #2).
      Validação: teste do payload com e sem etapas; asserção de ausência de `feedbackAtleta`,
      `observacao`, `descricaoEtapa`.
- [ ] 1.1 `SKILL.md` do `workout-analyzer`: seção "Athlete message" com o schema `athlete_message`
      (`recognition`, `how_it_went`, `effort_reading`, `next_workout_tip`), em PT-BR, ≤ 240 chars
      cada, com os guardrails de D2 e um exemplo negativo ("não escreva: pule o treino de
      quinta"). Atualizar os três exemplos de saída da skill com o bloco.
      Validação: teste `WorkoutAnalyzerSkillContractTest` afirmando a presença das regras.
- [ ] 1.2 `AnaliseWorkoutRawDto.athleteMessage` (record aninhado, opcional) e
      `WorkoutAnalysisTranslator.translate` copiando o bloco sem traduzir.
      Validação: teste do tradutor — bloco passa intacto; campos do coach seguem traduzidos.
- [ ] 1.3 Migration `V85__add_atleta_message_to_tb_analise_workout.sql` (4 × `TEXT NULL` +
      `atleta_bloqueado_motivo VARCHAR(40) NULL` + `atleta_primeira_visualizacao_em TIMESTAMP
      NULL`) e colunas na entidade `AnaliseWorkout`; `AthleteMessageValidator` (regex, ≤ 240,
      heurística PT-BR, classificador opcional da 0.3) roda antes de `applyResult` e nulifica o
      bloco com motivo (Codex #4); `applyResult` copia os quatro campos; ramo `FAILED` zera tudo.
      Validação: teste do listener com fixture completa, com bloco ausente (campos `null`,
      status `COMPLETED`), com bloco bloqueado (`null` + motivo, `COMPLETED`) e com falha (todos
      `null`, `FAILED`). `./mvnw clean verify`.
- [ ] 1.4 Fixtures de resposta (3 cenários felizes do `SKILL.md` + 3 adversariais: bloco que
      prescreve sem usar os tokens — "seu corpo está pedindo uma pausa", "melhor não fazer o
      intervalado" — e bloco em inglês) com asserção de proibidos
      (`TSB|CTL|ATL|score|cancel|pule|pular|troque|overtraining|lesão`) e, para os adversariais,
      o comportamento decidido em 0.3 (rejeitar o bloco → campos `null`, ou aceitar e registrar
      que o regex não pega). Contador `atleta_analise_remete_coach_total` quando
      `primary_cause != NORMAL` (product review).
      Validação: `./mvnw clean verify`.

## 2. Backend — exposição ao atleta

- [ ] 2.1 `WorkoutAnalysisProperties.athleteMessageEnabled` (`app.workout-analysis.athlete-message.enabled`,
      default `true`) — kill switch de D3.
- [ ] 2.2 `GET /api/v1/atletas/me/realizados/{id}/analise` → `AthleteWorkoutAnalysisOutputDto`
      (D4): `200 COMPLETED`; `200 PENDING` por **elegibilidade** (linha `PENDING` ou elegível sem
      linha — Codex #2); `204` não elegível / `FAILED` / bloco nulo / switch off; `404` não-dono
      ou outro tenant. `executado` do `TreinoRealizado`, `planejado` opcional. Micrometer
      `atleta_analise_visualizada_total` só na **primeira** `200 COMPLETED`, carimbando
      `atletaPrimeiraVisualizacaoEm` (Codex #6).
      Validação: `*IT` cobrindo os cenários do CA3 + CA4, incluindo "registrado há 1 s sem linha"
      e "12 PENDING + 3 COMPLETED → contador 1"; `@RequireTenant`.
- [ ] 2.3 `TreinoPlanejadoOutputDto.analiseAtletaDisponivel` no `GET /planos/{atletaId}` — uma
      query `findByTreinoRealizadoIdIn` por plano; `false` com switch off. Com `ROLE_ATLETA`,
      `{atletaId} != atleta autenticado → 404` (Codex #5).
      Validação: teste do serviço de plano (um analisado, demais `false`; switch off → todos
      `false`); `*IT` atleta A lendo plano de B → `404`, coach → `200`. `./mvnw clean verify`.
- [ ] 2.5 Hardening `GET /api/v1/analises/treino/{id}`: `@PreAuthorize("hasAnyRole('COACH','ADMIN')")`
      e `AnaliseWorkoutOutputDto` com os quatro campos do atleta (Codex #1).
      Validação: `*IT` atleta → `403`; coach → `200` com os campos. `./mvnw clean verify`.
- [ ] 2.4 OpenAPI: anotações `@ApiResponse`/`@Schema` nos DTOs novos (convenção do backend) para o
      `generate:api` de referência do front.

## 3. Frontend — atleta

- [ ] 3.1 Tipos e fachada: `src/types/AthleteWorkoutAnalysis.ts`,
      `src/api/services/AthleteAnalysisService.ts` (`getByRealizado(id)`, `204` → `null`);
      `TreinoPlanejado.analiseAtletaDisponivel?`.
      Validação: `npm run lint && npm run build`.
- [ ] 3.2 Adapter puro `buildWorkoutAnalysisView(dto)` (`features/athlete/adapters/`): labels do
      RPE (`RPE_LABELS` compartilhado com `ManualTrainingForm` — extrair para `types/`), "plano …"
      só quando há `planejado`, cor do esforço por `effortColor`.
      Validação: `*.test.ts` por estado (`pending`, `done`, sem planejado).
- [ ] 3.3 Hook `useAthleteWorkoutAnalysis(treinoRealizadoId)` (D5): `status`
      `idle|pending|done|empty`, `loading`, `error`; repetição a cada 15 s por até 3 min em
      `pending`, com cleanup.
      Validação: `*.test.ts` com timers falsos (para em 3 min; para ao ficar `done`).
- [ ] 3.4 `WorkoutAnalysisCard` presentacional (tokens, SVG inline, sem hex cru — os guards
      `limeDiscipline`/`contrastMatrix` rodam no `test:run`).
      Validação: `*.test.tsx` — quatro blocos e ordem no `done`; "Analisando…" no `pending`;
      nada no `empty`.
- [ ] 3.5 `WorkoutDetailDrawer`: chip "Concluído · RPE n/10 · label" + card entre descrição e
      perfil quando `status === 'concluido'` e há `treinoRealizadoId`.
      Validação: `*.test.tsx` (concluído com análise; concluído sem análise → sem card; hoje →
      inalterado). `npm run lint && npm run build && npm run test:run`.
- [ ] 3.6 `WeekAgendaRow` + `buildWeekAgenda`: "Análise pronta" quando o flag é `true`.
      Validação: teste do adapter e da linha.
- [ ] 3.7 `PostWorkoutFeedbackCard` + `ManualTrainingFormPage`: card em `pending`/`done` acima do
      botão; `mensagem` fixa sai quando há card.
      Validação: `*.test.tsx` existentes atualizados.
- [ ] 3.8 E2E `tests/e2e/athlete/workout-analysis.spec.ts` (390×844): registrar treino com RPE →
      card `pending` → Plano com "Análise pronta" → drawer com os quatro blocos; cenário `204`
      sem card. Mocks de rede para `PENDING`/`COMPLETED`/`204`.
      Validação: `npm run test:e2e`.

## 4. Frontend — coach (legado)

- [ ] 4.1 `TreinoCard` ("Coach Insight"): bloco "O que o atleta leu" com os quatro textos,
      somente leitura, quando `analise` traz os campos do atleta (`AnaliseWorkout` do front ganha
      os quatro campos opcionais, devolvidos pelo endpoint do coach endurecido na 2.5).
      Validação: `*.test.tsx`; `npm run lint && npm run build && npm run test:run`.

## 5. Fechamento

- [ ] 5.1 `openspec/specs/athlete-workout-analysis/spec.md` canônica a partir do delta; spec de
      `athlete-workout-feedback` referencia o endpoint irmão.
- [ ] 5.2 PRs backend e front (`/pr`), `SPRINTS.md` e arquivamento (`/done`).
