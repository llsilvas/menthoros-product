# Tasks: coach-edit-planned-workout

**Status:** In Progress
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

- [ ] 2.1.a Adicionar `editadoPeloCoach?: boolean` a `TreinoPlanejadoDto` em `src/types/PlanoReview.ts`
  (este é o tipo usado no painel de revisão — confirmar no código).
- [ ] 2.1.b Adicionar interface `TreinoPlanejadoPatch` ao mesmo arquivo `src/types/PlanoReview.ts`:
  ```ts
  export interface TreinoPlanejadoPatch {
    tipoTreino?: string;
    descricao?: string;
    distanciaKm?: number;
    duracaoMin?: string; // ISO-8601: "PT90M"
    zonaAlvo?: string;
    tssPlanejado?: number;
    percepcaoEsforcoEsperada?: number;
    observacao?: string; // campo é observacao (não observacoes) — alinhado com backend
  }
  ```
- [ ] 2.1.c Validação: `npm run build`.

### 2.2 API service

- [ ] 2.2.a Em `src/api/services/CoachPlanoReviewService.ts` (file existente — NÃO criar arquivo novo;
  `src/api` é curado à mão), adicionar método estático:
  ```ts
  public static editarTreino(planoId: string, treinoId: string, patch: TreinoPlanejadoPatch): CancelablePromise<TreinoPlanejadoDto>
  ```
  Endpoint: `PATCH /api/v1/coach/planos/{planoId}/treinos/{treinoId}`.
- [ ] 2.2.b Validação: `npm run build`.

### 2.3 Hook `useEditTreinoPlanejado`

- [ ] 2.3.a Criar `src/hooks/useEditTreinoPlanejado.ts` com padrão de `useManualTraining.ts`:
  - Estados: `isSaving: boolean`, `saveError: Error | null`.
  - `editarTreino(planoId, treinoId, patch): Promise<TreinoPlanejadoDto>` — lança em falha.
  - Limpa `saveError` ao iniciar; seta em falha.
- [ ] 2.3.b Testes (`src/hooks/useEditTreinoPlanejado.test.ts`, padrão Vitest + renderHook):
  - Seta `isSaving = true` durante a chamada e `false` ao terminar.
  - Retorna `TreinoPlanejadoDto` atualizado em sucesso.
  - Seta `saveError` e rethrows em falha de API.
- [ ] 2.3.c Validação: `npm run lint && npm run build`.

### 2.4 Componente `TreinoEditDialog`

- [ ] 2.4.a Criar `src/features/coach/components/TreinoEditDialog.tsx`:
  - Props: `open: boolean`, `treino: TreinoPlanejadoDto`, `planoId: string`, `isSaving: boolean`,
    `onClose: () => void`, `onSave: (patch: TreinoPlanejadoPatch) => void`.
  - Campos: tipo (Select com valores do backend), distância (TextField numérico),
    duração em minutos inteiros (TextField numérico → converte para `PT{N}M` ao chamar `onSave`),
    zonaAlvo (TextField), RPE esperado (TextField 1–10), TSS (TextField opcional),
    observação (TextField multiline).
  - Pré-preencher com valores atuais do `treino`.
  - Botões: `Salvar` (desabilitado quando `isSaving`) e `Cancelar`.
  - Padrão visual: igual ao `RejeicaoModal` existente em `PlanoDetalhePanel.tsx`.
- [ ] 2.4.b Em `PlanoDetalhePanel.tsx`, dentro de `TreinoTag`, adicionar ponto laranja discreto quando
  `treino.editadoPeloCoach === true` — elemento com `data-testid="chip-editado-coach"`.
- [ ] 2.4.c Validação: `npm run lint && npm run build`.

### 2.5 Integração na `PlanoDetalhePanel` + `CoachPlanReviewPage`

- [ ] 2.5.a Em `PlanoDetalhePanel.tsx`:
  - Adicionar prop `onEditarTreino?: (treinoId: string) => void`.
  - No bloco de treinos, envolver cada `TreinoTag` em um wrapper com botão lápis (`EditOutlinedIcon`)
    — visível apenas quando `isAguardando && treino.id`.
  - Ao clicar, chamar `onEditarTreino(treino.id)`.
- [ ] 2.5.b Em `CoachPlanReviewPage.tsx`:
  - Usar `useEditTreinoPlanejado` diretamente na página (não passa pelo outlet context — action local).
  - Estado local `editingTreinoId: string | null`.
  - Passar `onEditarTreino={(id) => setEditingTreinoId(id)}` para `PlanoDetalhePanel`.
  - Renderizar `TreinoEditDialog` quando `editingTreinoId` não-nulo.
  - Ao salvar no dialog: chamar `editarTreino(selected.id, editingTreinoId, patch)`,
    fechar dialog e chamar `reviewFetchPendentes()` para re-fetch.
- [ ] 2.5.c Validação: `npm run lint && npm run build`.

### 2.6 Testes de componente

- [ ] 2.6.a Teste do `TreinoEditDialog` (`TreinoEditDialog.test.tsx`):
  - Pré-preenche campos com valores do treino recebido.
  - Botão Salvar chama `onSave` com patch correto (duração convertida para ISO-8601).
  - Botão Cancelar chama `onClose` sem chamar `onSave`.
- [ ] 2.6.b Teste da integração no `CoachPlanReviewPage` (arquivo existente `CoachPlanReviewPage.test.tsx`):
  - Adicionar: botão de edição (`EditOutlinedIcon`) presente quando `AGUARDANDO_REVISAO` e treino tem `id`.
  - Adicionar: botão ausente quando `APROVADO`.
  - Adicionar: chip `data-testid="chip-editado-coach"` presente quando `editadoPeloCoach = true`.
- [ ] 2.6.c Validação: `npm run lint && npm run build && npm test`.

---

## Bloco 3 — QA e entrega

- [x] 3.1 `./mvnw clean test` — 956 testes, 0 falhas, BUILD SUCCESS.
- [ ] 3.2 `npm run lint && npm run build && npm test` — tudo verde.
- [ ] 3.3 Teste manual ponta-a-ponta:
  - Gerar plano para atleta → status `AGUARDANDO_REVISAO`.
  - Editar treino (campo distância) → verificar `editadoPeloCoach = true` no banco + chip na UI.
  - Editar sem informar TSS → verificar recálculo automático.
  - Editar informando TSS explícito → verificar que valor do coach prevalece.
  - Tentar editar treino de plano `APROVADO` → resposta 422.
  - Tentar editar treino de plano de outro tenant → 404.
  - Aprovar plano com treino editado → atleta visualiza plano.
- [ ] 3.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer`.
- [ ] 3.5 Abrir PR (`feature/coach-edit-planned-workout`) e aguardar CI verde.
