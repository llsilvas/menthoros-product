# Tasks: coach-edit-planned-workout

**Status:** Concluído — mergeado em develop em 2026-06-22
**Sprint:** 9g (intercalar entre sprint 9f e add-llm-tool-use)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend ✅

### 1.1 Migration V39

- [x] 1.1.a ~~Confirmar que V38 é a última migration aplicada~~ **Confirmado:** V38 é `V38__Add_composite_indexes_athlete_profile.sql`. V39 está livre.
- [x] 1.1.b Criar `V39__Add_editado_pelo_coach_to_treino_planejado.sql` — adicionadas colunas `editado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE` e `versao BIGINT NOT NULL DEFAULT 0`.
- [x] 1.1.c Validação: compile verde.

### 1.2 Entidade, enum e DTOs

- [x] 1.2.a `TreinoPlanejado`: `@Version Long versao` + `boolean editadoPeloCoach = false` adicionados.
- [x] 1.2.b `TreinoPlanejadoPatchDto` criado como record com todos os campos nullable.
- [x] 1.2.c `JacksonConfig`: `WRITE_DURATIONS_AS_TIMESTAMPS` desabilitado globalmente.
- [x] 1.2.d `TreinoPlanejadoOutputDto`: campo `boolean editadoPeloCoach` adicionado.
- [x] 1.2.e `TreinoMapper`: auto-mapeamento pelo nome de campo (sem mudança necessária).
- [x] 1.2.f Validação: `./mvnw clean compile` — verde.

### 1.3 Helper de cálculo de TSS

- [x] 1.3.a `TssCalculatorService.calcularTssEstimado(Duration, Integer)` adicionado.
- [x] 1.3.b Validação: `./mvnw clean compile` — verde.

### 1.4 Service: `TreinoPlanejadoEditService`

- [x] 1.4.a Interface `TreinoPlanejadoEditService` criada.
- [x] 1.4.b `TreinoPlanejadoEditServiceImpl` implementado com patch semântico, TSS precedence e isolamento multi-tenant.
- [x] 1.4.c `OptimisticLockingFailureException` → 409 adicionado ao `GlobalExceptionHandler`.
- [x] 1.4.d Validação: `./mvnw clean test` — 956 testes, 0 falhas.

### 1.5 Controller: `CoachTreinoEditController`

- [x] 1.5.a `CoachTreinoEditController` criado: `PATCH /api/v1/coach/planos/{planoId}/treinos/{treinoId}`.
- [x] 1.5.b Validação: `./mvnw clean test` — verde.

### 1.6 Testes de unidade — service

- [x] 1.6.a `TreinoPlanejadoEditServiceImplTest` — 10 cenários (happy path, patch semântico, TSS precedence, cross-plan, cross-tenant). Todos GREEN.
- [x] 1.6.b Validação: `./mvnw clean test` — verde.

### 1.7 Testes de controller

- [x] 1.7.a `CoachTreinoEditControllerTest` — 5 cenários @WebMvcTest: 200, 404, 422, 409, 403. Todos GREEN.
  - Nota: `JwtTenantFilter` requer `@MockitoBean` para `UsuarioSyncService` e `UsuarioRepository`; JWT mock precisa de claim `tenant_id`.
- [x] 1.7.b Validação: `./mvnw clean test` — 956 testes, 0 falhas.

---

## Bloco 2 — Frontend

### 2.1 Tipos TypeScript

- [x] 2.1.a `editadoPeloCoach?: boolean` + campos extras adicionados a `TreinoPlanejadoDto` em `src/types/PlanoReview.ts`.
- [x] 2.1.b Interface `TreinoPlanejadoPatch` adicionada ao mesmo arquivo.
- [x] 2.1.c Validação: `npm run build` — verde.

### 2.2 API service

- [x] 2.2.a `CoachPlanoReviewService.editarTreino` adicionado em `src/api/services/CoachPlanoReviewService.ts`.
- [x] 2.2.b Validação: `npm run build` — verde.

### 2.3 Hook `useEditTreinoPlanejado`

- [x] 2.3.a `src/hooks/useEditTreinoPlanejado.ts` criado.
- [x] 2.3.b `src/hooks/useEditTreinoPlanejado.test.ts` — 5 testes GREEN.
- [x] 2.3.c Validação: lint + build — verde.

### 2.4 Componente `TreinoEditDialog`

- [x] 2.4.a `src/features/coach/components/TreinoEditDialog.tsx` criado (6 campos + conversão ISO-8601).
- [x] 2.4.b Indicador `data-testid="chip-editado-coach"` adicionado a `TreinoTag` em `PlanoDetalhePanel.tsx`.
- [x] 2.4.c Validação: lint + build — verde; `TreinoEditDialog.test.tsx` — 5 testes GREEN.

### 2.5 Integração na `PlanoDetalhePanel` + `CoachPlanReviewPage`

- [x] 2.5.a `PlanoDetalhePanel.tsx`: prop `onEditarTreino` adicionada + botão `EditOutlinedIcon` por treino.
- [x] 2.5.b `CoachPlanReviewPage.tsx`: hook `useEditTreinoPlanejado` local + `editingTreino` state + `TreinoEditDialog`.
- [x] 2.5.c Validação: lint + build — verde.

### 2.6 Testes de componente

- [x] 2.6.a `TreinoEditDialog.test.tsx` — 5 testes GREEN.
- [x] 2.6.b `CoachPlanReviewPage.test.tsx` — 3 testes de integração adicionados, todos GREEN (11/11).
- [x] 2.6.c Validação: lint + build + 130 testes — tudo GREEN.

---

## Bloco 3 — QA e entrega

- [x] 3.1 `./mvnw clean test` — 956 testes, 0 falhas, BUILD SUCCESS.
- [x] 3.2 `npm run lint && npm run build && npm test` — 130 testes, 0 falhas, build verde.
- [x] 3.3 Teste manual ponta-a-ponta: **aprovado pelo usuário** — fluxo completo testado e validado em ambiente local.
- [x] 3.4 QA gate concluído: `frontend-reviewer` + `clean-code-reviewer` em paralelo. Achados CRÍTICO/IMPORTANTE corrigidos (regex ISO-8601, patch vazio, planoId morto, editingTreinoId refactor, saveError removido, mock fix, teste do fluxo principal). Pré-existentes anotados (actionError Snackbar, TIPO_COLORS hex).
- [x] 3.5.extra TreinoCard enriquecido no perfil do atleta (escopo adicional solicitado):
  - Backend: `TreinoPlanejadoResumoDto` expandido com `id`, `duracaoMin`, `zonaAlvo`, `percepcaoEsforcoEsperada`; treinos retornados também para `AGUARDANDO_REVISAO`.
  - Frontend: `CurrentWeekPlan` exibe duração, zona alvo e RPE. Botão editar embutido no card (apenas AGUARDANDO_REVISAO). TreinoEditDialog abre inline; ao salvar, perfil do atleta é recarregado.
  - Testes: 8 novos testes em `CurrentWeekPlan.test.tsx` — todos GREEN. Suite: 140/140.
- [x] 3.5 PRs abertos e mergeados: `menthoros-backend#9` (mergeado em 2026-06-22). Frontend mergeado na mesma sprint.
