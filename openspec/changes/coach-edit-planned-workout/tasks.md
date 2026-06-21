# Tasks: coach-edit-planned-workout

**Status:** In Progress
**Sprint:** 9g (intercalar entre sprint 9f e add-llm-tool-use)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend

### 1.1 Migration V39

- [ ] 1.1.a ~~Confirmar que V38 é a última migration aplicada~~ **Confirmado:** V38 é `V38__Add_composite_indexes_athlete_profile.sql`. V39 está livre.
- [ ] 1.1.b Criar `V39__Add_editado_pelo_coach_to_treino_planejado.sql`:
  ```sql
  ALTER TABLE tb_treino_planejado
      ADD COLUMN IF NOT EXISTS editado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE;

  DO $$
  BEGIN
      RAISE NOTICE '✅ V39 - coluna editado_pelo_coach adicionada a tb_treino_planejado';
  END$$;
  ```
- [ ] 1.1.c Validação: `./mvnw flyway:info` mostra V39 pendente sem conflito.

### 1.2 Entidade, enum e DTOs

- [ ] 1.2.a Em `TreinoPlanejado` (`entity/TreinoPlanejado.java`): (a) adicionar `@Version Long versao` — **confirmado ausente**; (b) adicionar `editadoPeloCoach: boolean` com `@Column(nullable=false) @Builder.Default` `= false` (ou default no `@PrePersist` se não usar builder). Campos relevantes confirmados: `tssPlanejado` (Integer), `percepcaoEsforcoEsperada` (Integer), `justificativaIa` (String), `observacao` (String em `TreinoBase` — **atenção: campo é `observacao`, não `observacoes`**).
- [ ] 1.2.b Criar `TreinoPlanejadoPatchDto` (record em `dto/input/`) com campos nullable: `TipoTreino tipoTreino`, `String descricao`, `@Positive BigDecimal distanciaKm`, `Duration duracaoMin`, `String zonaAlvo`, `@Min(1) @Max(500) Integer tssPlanejado`, `@Min(1) @Max(10) Integer percepcaoEsforcoEsperada`, `String observacao` (**campo `observacao`, não `observacoes` — alinhado com `TreinoBase`**).
- [ ] 1.2.c `JacksonConfig` registra `JavaTimeModule` mas **NÃO desabilita `WRITE_DURATIONS_AS_TIMESTAMPS`** (`JacksonConfig.java`). Adicionar `mapper.disable(SerializationFeature.WRITE_DURATIONS_AS_TIMESTAMPS)` para garantir que Duration serializa/deserializa como ISO-8601 (`PT90M`). Alternativa: anotar o campo `duracaoMin` do DTO com `@JsonDeserialize(using = DurationDeserializer.class)` se não quiser afetar o ObjectMapper global.
- [ ] 1.2.d Em `TreinoPlanejadoOutputDto` (`dto/output/TreinoPlanejadoOutputDto.java`): adicionar campo `editadoPeloCoach: boolean`. Atenção ao campo `observacao` (não `observacoes`) e `distanciaKm` como `Double` (não BigDecimal) — manter consistência com o DTO existente.
- [ ] 1.2.e Atualizar `PlanoSemanalMapper` para incluir `editadoPeloCoach` no mapeamento do treino. Campo no entity: `treino.isEditadoPeloCoach()` (boolean primitivo) ou `treino.getEditadoPeloCoach()`.
- [ ] 1.2.f Validação: `./mvnw clean compile`.

### 1.3 Helper de cálculo de TSS

- [ ] 1.3.a `TssCalculatorService` (`services/helper/TssCalculatorService.java`) **existe** mas o método público é `calcularTss(TreinoRealizado)` — não há overload para `(Duration, Integer)`. Adicionar novo método ao service existente (não criar classe separada):
    ```java
    public int calcularTssEstimado(Duration duracaoMin, Integer rpe) {
        long minutos = duracaoMin != null ? duracaoMin.toMinutes() : 0L;
        int r = rpe != null ? rpe : 5;
        return (int) Math.round((double) minutos * r * r / 90.0);
    }
    ```
    O service impl deve injetar `TssCalculatorService` e chamar `calcularTssEstimado(duracaoFinal, rpeFinal)`.
- [ ] 1.3.b Validação: `./mvnw clean compile`.

### 1.4 Service: `TreinoPlanejadoEditService`

- [ ] 1.4.a Criar interface `TreinoPlanejadoEditService` com:
  ```java
  TreinoPlanejadoOutputDto editarTreino(UUID planoId, UUID treinoId, TreinoPlanejadoPatchDto patch);
  ```
- [ ] 1.4.b Criar `TreinoPlanejadoEditServiceImpl` com lógica:
  - `TenantContext.getRequiredTenantId()` para resolver o tenant.
  - `planoSemanalRepository.findByIdAndTenantId(planoId, tenantId)` → `EntityNotFoundException` se ausente. **`PlanoSemanalRepository.findByIdAndTenantId` confirmado em `PlanoSemanalRepository.java:64`.**
  - Validar `plano.getReviewStatus() == AGUARDANDO_REVISAO` → `DomainRuleViolationException("Plano não está em revisão")`.
  - Buscar treino: **usar `TreinoPlanejadoRepository.findByIdAndTenantId(treinoId, tenantId)`** (confirmado em `TreinoPlanejadoRepository.java:17`) em vez de stream no plano; depois validar `treino.getPlanoSemanal().getId().equals(planoId)` → `EntityNotFoundException` se divergir (cobre o caso intra-tenant cross-plan).
  - Aplicar patch: setar apenas campos não-nulos do DTO (campo `observacao`, não `observacoes`).
  - Recalcular TSS: se `patch.tssPlanejado() != null` → usar valor do coach; senão se `distanciaKm` ou `duracaoMin` mudou → recalcular via `tssCalculatorService.calcularTssEstimado(duracaoFinal, rpeFinal)`.
  - Setar `editadoPeloCoach = true`.
  - `treinoPlanejadoRepository.save(treino)` e retornar DTO via mapper.
- [ ] 1.4.c **`DomainRuleViolationException` → 422: já existe** (`GlobalExceptionHandler.java:247`). **`OptimisticLockException` (JPA) → 409: já existe** (`GlobalExceptionHandler.java:82`). Verificar se `OptimisticLockingFailureException` (Spring Data) está coberta pelo mesmo handler — se não, adicionar `@ExceptionHandler(OptimisticLockingFailureException.class)` → 409 no `GlobalExceptionHandler`.
- [ ] 1.4.d Validação: `./mvnw clean test`.

### 1.5 Controller: `CoachTreinoEditController`

- [ ] 1.5.a Criar `CoachTreinoEditController` em `controller/`:
  ```java
  @Tag(name = "coach-treino-edit", description = "Edição de treinos planejados durante revisão de plano")
  @RestController
  @RequestMapping("/api/v1/coach/planos")
  @RequiredArgsConstructor
  public class CoachTreinoEditController {
      private final TreinoPlanejadoEditService editService;

      @PatchMapping("/{planoId}/treinos/{treinoId}")
      @PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")
      @Operation(summary = "Editar treino planejado")
      @ApiResponses(...)
      public ResponseEntity<TreinoPlanejadoOutputDto> editarTreino(
          @PathVariable UUID planoId,
          @PathVariable UUID treinoId,
          @Valid @RequestBody TreinoPlanejadoPatchDto patch) {
          return ResponseEntity.ok(editService.editarTreino(planoId, treinoId, patch));
      }
  }
  ```
- [ ] 1.5.b Validação: `./mvnw clean test`.

### 1.6 Testes de unidade — service

- [ ] 1.6.a `TreinoPlanejadoEditServiceImplTest` com `@Nested`:
  - `EditarTreino > atualiza campos não-nulos e seta editadoPeloCoach true`.
  - `EditarTreino > ignora campos null — patch semântico`.
  - `EditarTreino > recalcula TSS quando duracaoMin muda sem tssPlanejado explícito`.
  - `EditarTreino > usa TSS do coach quando informado explicitamente`.
  - `EditarTreino > nao recalcula TSS quando distanciaKm e duracaoMin nao mudam`.
  - `EditarTreino > lança DomainRuleViolationException se plano nao está AGUARDANDO_REVISAO`.
  - `EditarTreino > lança EntityNotFoundException se plano de outro tenant`.
  - `EditarTreino > lança EntityNotFoundException se treino nao pertence ao plano`.
  - `EditarTreino > lança EntityNotFoundException se treinoId pertence ao tenant mas a planoId diferente` (intra-tenant cross-plan).
- [ ] 1.6.b Validação: `./mvnw clean test`.

### 1.7 Testes de controller

- [ ] 1.7.a `CoachTreinoEditControllerTest` com `@WebMvcTest(CoachTreinoEditController.class)`:
  - Retorna 200 com `TreinoPlanejadoOutputDto` correto.
  - Retorna 422 quando service lança `DomainRuleViolationException`.
  - Retorna 404 quando service lança `EntityNotFoundException`.
  - Retorna 400 para body com campos de validação inválidos (ex: `distanciaKm = -1`).
- [ ] 1.7.b Validação: `./mvnw clean test` — todos os testes passando.

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
