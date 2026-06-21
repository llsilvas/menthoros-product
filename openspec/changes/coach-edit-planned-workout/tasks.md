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

- [ ] 2.1.a Adicionar `editadoPeloCoach: boolean` ao tipo `TreinoPlanejado` em `src/types/`.
- [ ] 2.1.b Criar tipo `TreinoPlanejadoPatch`:
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

- [ ] 2.2.a Em `src/api/services/` adicionar método de edição (no service de planos ou em arquivo dedicado `TreinoPlanejadoService.ts`):
  ```ts
  editarTreinoPlanejado(planoId: string, treinoId: string, patch: TreinoPlanejadoPatch): Promise<TreinoPlanejado>
  ```
  Mapeando para `PATCH /api/v1/coach/planos/{planoId}/treinos/{treinoId}`.
- [ ] 2.2.b Validação: `npm run build`.

### 2.3 Hook `useEditTreinoPlanejado`

- [ ] 2.3.a Criar `src/hooks/useEditTreinoPlanejado.ts` com:
  - Estado: `saving: boolean`, `error: string | null`.
  - Função `editarTreino(planoId, treinoId, patch): Promise<TreinoPlanejado>`.
  - Limpa `error` ao iniciar; seta em falha.
- [ ] 2.3.b Testes unitários (`useEditTreinoPlanejado.test.ts`):
  - Seta `saving = true` durante a chamada.
  - Retorna o treino atualizado em sucesso.
  - Seta `error` em falha de API.
- [ ] 2.3.c Validação: `npm run lint && npm run build`.

### 2.4 Componente `TreinoEditDialog`

- [ ] 2.4.a Criar `src/features/coach/components/TreinoEditDialog.tsx` com:
  - Props: `open`, `treino: TreinoPlanejado`, `onClose`, `onSave(patch: TreinoPlanejadoPatch)`.
  - Campos: tipo (Select com `TipoTreino`), distância (TextField numérico), duração em minutos (TextField numérico → converte para `PT{N}M`), zona alvo (TextField), RPE esperado (Slider 1–10), TSS (TextField opcional, placeholder "Deixar em branco para calcular automaticamente"), observações (TextField multiline).
  - Pré-preencher com valores atuais do `treino`.
  - Botões: `Salvar` (desabilitado durante `saving`) e `Cancelar`.
- [ ] 2.4.b Adicionar chip `TreinoEditadoChip` (badge inline no card do treino) quando `treino.editadoPeloCoach === true`:
  ```tsx
  {treino.editadoPeloCoach && (
    <Chip label="Editado manualmente" size="small" color="warning" data-testid="chip-editado-coach" />
  )}
  ```
- [ ] 2.4.c Validação: `npm run lint && npm run build`.

### 2.5 Integração na `CoachPlanReviewPage`

- [ ] 2.5.a Adicionar botão de edição (ícone lápis, `EditIcon`) em cada card de treino no painel de detalhe — visível apenas quando `plano.reviewStatus === 'AGUARDANDO_REVISAO'`.
- [ ] 2.5.b Estado `editingTreinoId: string | null` no componente; abre `TreinoEditDialog` quando não-nulo.
- [ ] 2.5.c Ao salvar: chamar `editarTreino`, fechar dialog, re-fetch do plano (invalidar cache do hook).
- [ ] 2.5.d Validação: `npm run lint && npm run build`.

### 2.6 Testes de componente

- [ ] 2.6.a Teste do `TreinoEditDialog`: exibe valores iniciais; botão Salvar chama `onSave` com patch correto; cancela sem chamar `onSave`.
- [ ] 2.6.b Teste da integração na `CoachPlanReviewPage`: botão de edição presente quando `AGUARDANDO_REVISAO`; ausente quando `APROVADO`; chip `data-testid="chip-editado-coach"` presente quando `editadoPeloCoach = true`.
- [ ] 2.6.c Validação: `npm run lint && npm run build && npm test`.

---

## Bloco 3 — QA e entrega

- [ ] 3.1 `./mvnw clean test` — todos os testes passando.
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
