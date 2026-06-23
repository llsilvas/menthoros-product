# Tasks: coach-add-workout-to-plan

**Status:** Proposto
**Sprint:** 9i (após `infer-thresholds-from-recent-workouts`)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend: migration, entidade e DTOs

### 1.1 Migration V41

- [ ] 1.1.a Confirmar que V40 é a última migration aplicada.
- [ ] 1.1.b Criar `V41__Add_adicionado_pelo_coach_to_treino_planejado.sql`:
  ```sql
  -- =====================================================================
  -- V41: Adiciona rastreabilidade de treino adicionado manualmente pelo coach
  -- =====================================================================
  ALTER TABLE tb_treino_planejado
      ADD COLUMN IF NOT EXISTS adicionado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE;

  DO $$
  BEGIN
      RAISE NOTICE '✅ V41 - adicionado_pelo_coach adicionado a tb_treino_planejado';
  END$$;
  ```
- [ ] 1.1.c Validação: `./mvnw clean compile` — verde.

### 1.2 Entidade TreinoPlanejado

- [ ] 1.2.a Adicionar campo `@Column(name = "adicionado_pelo_coach") private boolean adicionadoPeloCoach = false;` à entidade.
- [ ] 1.2.b Inicialização explícita no `@PrePersist` (consistente com `editadoPeloCoach`).
- [ ] 1.2.c Validação: `./mvnw clean compile` — verde.

### 1.3 DTO de input: TreinoPlanejadoAddDto

- [ ] 1.3.a Criar `TreinoPlanejadoAddDto` em `dto/input/` como record:
  ```java
  public record TreinoPlanejadoAddDto(
      @NotBlank String tipoTreino,
      @NotNull LocalDate dataTreino,
      String descricao,
      @Positive Double distanciaKm,
      @Positive Integer duracaoMin,    // minutos
      String zonaAlvo,
      @Min(1) @Max(10) Integer percepcaoEsforcoEsperada,
      @Positive Integer tssPlanejado,
      String observacoes,
      List<EtapaInputDto> etapas
  ) {}
  ```
- [ ] 1.3.b Validação: `./mvnw clean compile` — verde.

### 1.4 DTO de output: TreinoPlanejadoOutputDto

- [ ] 1.4.a Adicionar campo `boolean adicionadoPeloCoach` ao record `TreinoPlanejadoOutputDto` (é primitivo — default `false` no JSON, sem risco de campo ausente).
- [ ] 1.4.b `TreinoMapper` usa MapStruct com `@Mapping` — adicionar `@Mapping(target = "adicionadoPeloCoach", source = "adicionadoPeloCoach")` ao método `toOutputDto`. Se o MapStruct já mapeou automaticamente (campo com mesmo nome), confirmar via `./mvnw clean test` sem adição manual.
- [ ] 1.4.c Verificar se há outros locais que constroem `TreinoPlanejadoOutputDto` diretamente (não via mapper) e atualizar.
- [ ] 1.4.d Validação: `./mvnw clean test` — verde.

### 1.5 Infraestrutura de suporte (utilitário DiaSemana + query repository)

- [ ] 1.5.a Adicionar método estático em `util/Utils.java` (o inverso do `converterParaDayOfWeek` já existente):
  ```java
  public static DiaSemana converterDayOfWeekParaDiaSemana(DayOfWeek dow) {
      return switch (dow) {
          case MONDAY    -> DiaSemana.SEGUNDA;
          case TUESDAY   -> DiaSemana.TERCA;
          case WEDNESDAY -> DiaSemana.QUARTA;
          case THURSDAY  -> DiaSemana.QUINTA;
          case FRIDAY    -> DiaSemana.SEXTA;
          case SATURDAY  -> DiaSemana.SABADO;
          case SUNDAY    -> DiaSemana.DOMINGO;
      };
  }
  ```
  **Atenção:** verificar os valores exatos do enum `DiaSemana` antes de escrever o switch — os nomes acima são estimados com base no mapeamento inverso existente.
- [ ] 1.5.b Adicionar query com JOIN FETCH em `PlanoSemanalRepository` (necessária para o `@PrePersist` de `TreinoPlanejado` que deriva `atleta` e `tenantId` do plano):
  ```java
  @Query("SELECT p FROM PlanoSemanal p JOIN FETCH p.atleta JOIN FETCH p.assessoria WHERE p.id = :id AND p.assessoria.id = :tenantId")
  Optional<PlanoSemanal> findByIdWithDependenciesAndTenant(@Param("id") UUID id, @Param("tenantId") UUID tenantId);
  ```
- [ ] 1.5.c Validação: `./mvnw clean compile` — verde.

---

## Bloco 2 — Backend: service

### 2.1 Interface e implementação

- [ ] 2.1.a Criar interface `TreinoPlanejadoAddService` em `services/`:
  ```java
  public interface TreinoPlanejadoAddService {
      TreinoPlanejadoOutputDto adicionarTreino(UUID planoId, TreinoPlanejadoAddDto dto);
  }
  ```
- [ ] 2.1.b Criar `TreinoPlanejadoAddServiceImpl` em `services/impl/` com:
  - Resolução de `tenantId` via `TenantContext.getRequiredTenantId()`.
  - Busca do plano com JOIN FETCH de `atleta` e `assessoria` por `(planoId, tenantId)` → 404 se não encontrado (necessário para o `@PrePersist` derivar `atleta` e `tenantId`).
  - Guard `reviewStatus == AGUARDANDO_REVISAO` → `DomainRuleViolationException` → 422.
  - Guard `dataTreino ∈ [semanaInicio, semanaFim]` → `DomainRuleViolationException` → 422.
  - Guard `count(treinos do plano) < 14` → `DomainRuleViolationException` → 422 com "Limite de 14 treinos por semana atingido".
  - Derivar `diaSemana`: reutilizar mapeamento existente de `DayOfWeek → DiaSemana` (extrair de `TreinoServiceImpl` ou `StravaActivityServiceImpl` para método estático).
  - Construir `TreinoPlanejado`: `adicionadoPeloCoach = true`, `statusTreino = PENDENTE`, `fonteDados = MANUAL`, `duracaoMin = dto.duracaoMin() != null ? Duration.ofMinutes(dto.duracaoMin()) : Duration.ZERO`.
  - Calcular TSS quando `dto.duracaoMin() != null && dto.tssPlanejado() == null`: `TssCalculatorService.calcularTssEstimado(Duration.ofMinutes(dto.duracaoMin()), dto.percepcaoEsforcoEsperada())`.
  - Persistir etapas (quando `dto.etapas() != null && !dto.etapas().isEmpty()`): para cada `EtapaInputDto` na lista, criar `EtapaTreino`, setar `etapa.setTreinoPlanejado(treino)`, `etapa.setOrdem(index + 1)`, e adicionar em `treino.getEtapas()`. O `CascadeType.ALL` garante persistência junto com o save do treino — **não chamar `etapaRepository.save()` explicitamente**. `TreinoMapper.linkEtapas()` pode servir como referência de como o bidirectional link é feito em outras partes do código.
  - Log estruturado na entrada: `log.info("coach-adicionou-treino: planoId={}, tenantId={}, tipoTreino={}, comEtapas={}", planoId, tenantId, dto.tipoTreino(), etapasCount)`.
  - Retornar `TreinoPlanejadoOutputDto` via mapper.
- [ ] 2.1.c Validação: `./mvnw clean compile` — verde.

### 2.2 Testes de unidade — TreinoPlanejadoAddServiceImplTest

- [ ] 2.2.a `@Nested class AdicionarTreino` com cenários:
  - Happy path simples (sem etapas): novo treino criado com `adicionadoPeloCoach = true`, `statusTreino = PENDENTE`, `fonteDados = MANUAL`.
  - Happy path com etapas: 2 etapas criadas com `ordem = 1` e `ordem = 2`.
  - TSS calculado quando `duracaoMin` informado e `tssPlanejado` ausente (verifica conversão `Integer → Duration`).
  - `duracaoMin` ausente: `TreinoPlanejado.duracaoMin = Duration.ZERO`, `tssPlanejado = null`.
  - TSS do coach prevalece quando `tssPlanejado` explícito (mesmo com `duracaoMin` informado).
  - Plano não encontrado → `DomainNotFoundException`.
  - Plano em `APROVADO` → `DomainRuleViolationException`.
  - Plano em `REJEITADO` → `DomainRuleViolationException`.
  - `dataTreino` fora do intervalo (depois de `semanaFim`) → `DomainRuleViolationException`.
  - `dataTreino` antes de `semanaInicio` → `DomainRuleViolationException`.
  - Limite de 14 treinos atingido → `DomainRuleViolationException`.
  - Cross-tenant → `DomainNotFoundException`.
  - `diaSemana` derivado corretamente: `dataTreino = quinta-feira → DiaSemana.QUINTA`.
- [ ] 2.2.b Validação: `./mvnw clean test` — 10+ novos testes verdes; suite completa verde.

---

## Bloco 3 — Backend: controller e testes de controller

### 3.1 CoachTreinoAddController

- [ ] 3.1.a Criar `CoachTreinoAddController` em `controller/`:
  ```java
  @Tag(name = "coach-treino-add", description = "Adição manual de treino pelo coach durante revisão de plano")
  @RestController
  @RequestMapping("/api/v1/coach/planos")
  @RequiredArgsConstructor
  public class CoachTreinoAddController {
      private final TreinoPlanejadoAddService service;

      @PostMapping("/{planoId}/treinos")
      @PreAuthorize("hasRole('COACH')")
      @Operation(summary = "Adiciona treino ao plano em revisão")
      @ApiResponses({
          @ApiResponse(responseCode = "201", description = "Treino criado"),
          @ApiResponse(responseCode = "404", description = "Plano não encontrado"),
          @ApiResponse(responseCode = "422", description = "Plano não está em revisão ou data fora do intervalo")
      })
      public ResponseEntity<TreinoPlanejadoOutputDto> adicionarTreino(
              @PathVariable UUID planoId,
              @Valid @RequestBody TreinoPlanejadoAddDto dto) {
          TreinoPlanejadoOutputDto result = service.adicionarTreino(planoId, dto);
          return ResponseEntity.status(HttpStatus.CREATED).body(result);
      }
  }
  ```
- [ ] 3.1.b Validação: `./mvnw clean test` — verde.

### 3.2 Testes @WebMvcTest — CoachTreinoAddControllerTest

- [ ] 3.2.a Criar `CoachTreinoAddControllerTest` com `@WebMvcTest(CoachTreinoAddController.class)`:
  - 201: treino criado com sucesso.
  - 404: plano não encontrado.
  - 422: plano não está em revisão.
  - 422: data fora do intervalo.
  - 422: limite de 14 treinos atingido.
  - 400: `tipoTreino` ausente (Bean Validation).
  - 400: `dataTreino` ausente (Bean Validation).
  - 403: sem role COACH.
- [ ] 3.2.b Validação: `./mvnw clean test` — suite completa verde.

---

## Bloco 4 — Frontend: tipos, API, hook, dialog e integração

### 4.1 Tipo TypeScript

- [ ] 4.1.a Adicionar `adicionadoPeloCoach?: boolean` a `TreinoPlanejadoDto` em `src/types/PlanoReview.ts`.
- [ ] 4.1.b Criar interface `TreinoPlanejadoAddPayload` no mesmo arquivo:
  ```typescript
  export interface TreinoPlanejadoAddPayload {
    tipoTreino: string;
    dataTreino: string; // ISO-8601 date
    descricao?: string;
    distanciaKm?: number;
    duracaoMin?: number;
    zonaAlvo?: string;
    percepcaoEsforcoEsperada?: number;
    tssPlanejado?: number;
    observacoes?: string;
    etapas?: EtapaInputPayload[];
  }
  export interface EtapaInputPayload {
    tipoEtapa?: string;
    descricaoEtapa?: string;
    duracaoMin?: number;
    distanciaKm?: number;
    fcAlvoEtapa?: string;
    repeticoes?: number;
  }
  ```
- [ ] 4.1.c Validação: `npm run build` — verde.

### 4.2 API service

- [ ] 4.2.a Adicionar método `adicionarTreino(planoId: string, payload: TreinoPlanejadoAddPayload): Promise<TreinoPlanejadoDto>` em `src/api/services/CoachPlanoReviewService.ts`.
- [ ] 4.2.b Validação: `npm run build` — verde.

### 4.3 Hook useAddTreinoPlanejado

- [ ] 4.3.a Criar `src/hooks/useAddTreinoPlanejado.ts`:
  - `mutate(planoId, payload)` → chama `CoachPlanoReviewService.adicionarTreino`.
  - Estados: `isLoading`, `error`.
  - Em sucesso: `onSuccess(novoTreino)` callback.
- [ ] 4.3.b Criar `src/hooks/useAddTreinoPlanejado.test.ts` — 4 testes: sucesso, erro 422, erro 404, loading state.
- [ ] 4.3.c Validação: `npm run build` — verde.

### 4.4 Componente TreinoAddDialog

- [ ] 4.4.a Criar `src/features/coach/components/TreinoAddDialog.tsx`:
  - Props: `open`, `planoId`, `semanaInicio`, `semanaFim`, `treinosExistentes: TreinoPlanejadoDto[]`, `onClose`, `onSaved(treino)`.
  - Campos do treino conforme design.md (tipo, data, distância, duração, zona, RPE, TSS, obs).
  - Datas disponíveis: array de datas entre `semanaInicio..semanaFim`, formatadas como "Seg 01/07" (derivar `DayOfWeek` no frontend via `new Date(dataTreino).toLocaleDateString`).
  - Aviso de double-day: quando data selecionada já tem treino em `treinosExistentes`, exibir `Alert severity="warning"` com "Já existe N treino(s) nesta data. Double-day é permitido — confirme se é intencional."
  - Seção de etapas colapsada por default; botão "Adicionar etapas" expande; cada etapa tem botão remover; `tipoEtapa` obrigatório quando a seção está aberta e tem linhas.
  - Botão "Salvar treino" desabilitado durante request (evitar duplo-clique).
  - Submissão: `useAddTreinoPlanejado`; spinner enquanto carrega; erro inline em caso de 422.
- [ ] 4.4.b Criar `src/features/coach/components/TreinoAddDialog.test.tsx` — mínimo 7 testes:
  - Renderiza campos obrigatórios (tipo e data).
  - Botão salvar desabilitado sem tipo e data preenchidos.
  - Seção etapas colapsada por default.
  - Expande etapas e adiciona linha ao clicar em "Adicionar etapas".
  - Remove etapa ao clicar em botão remover.
  - Exibe aviso de double-day quando data selecionada já tem treino.
  - Chama onSaved após sucesso e fecha dialog.
- [ ] 4.4.c Validação: `npm run build` + testes — verde.

### 4.5 Integração na CoachPlanReviewPage

- [ ] 4.5.a Adicionar botão "Adicionar treino" no painel de detalhe do plano, visível apenas quando `reviewStatus === 'AGUARDANDO_REVISAO'`.
- [ ] 4.5.b Gerenciar estado `addDialogOpen: boolean` e `onSaved` (re-fetch do plano ou append local).
- [ ] 4.5.c Chip "Adicionado pelo coach" (`data-testid="chip-adicionado-coach"`) no card do treino quando `adicionadoPeloCoach === true`.
- [ ] 4.5.d Validação: `npm run lint && npm run build` — verde.

### 4.6 Testes de integração — CoachPlanReviewPage

- [ ] 4.6.a Adicionar ao menos 3 testes à suite existente de `CoachPlanReviewPage.test.tsx`:
  - Botão "Adicionar treino" visível para plano AGUARDANDO_REVISAO.
  - Botão "Adicionar treino" não visível para plano APROVADO.
  - Chip "chip-adicionado-coach" presente quando `adicionadoPeloCoach = true`.
- [ ] 4.6.b Validação: suite completa front — verde.

---

## Bloco 5 — QA e entrega

- [ ] 5.1 `./mvnw clean test` — suite completa backend verde.
- [ ] 5.2 `npm run lint && npm run build && npm test` — suite completa front verde.
- [ ] 5.3 Teste manual ponta-a-ponta (requer ambiente local: `docker compose up -d` + backend em `SPRING_PROFILES_ACTIVE=local`):
  - Abrir plano em `AGUARDANDO_REVISAO` → confirmar botão "Adicionar treino" visível.
  - Adicionar treino simples (sem etapas) → confirmar 201 e chip "Adicionado pelo coach" no card.
  - Adicionar treino com 2 etapas → confirmar etapas persistidas na ordem correta.
  - Verificar que `adicionado_pelo_coach = true` no banco (`tb_treino_planejado`).
  - Tentar adicionar treino a plano APROVADO → confirmar 422 e mensagem de erro.
  - Tentar data fora do intervalo → confirmar 422.
  - Abrir plano APROVADO → confirmar que botão "Adicionar treino" não aparece.
- [ ] 5.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer` + `menthoros-workflow:clean-code-reviewer` — findings críticos e importantes corrigidos antes do PR.
- [ ] 5.5 Abrir PR (`feature/coach-add-workout-to-plan`) e aguardar CI verde.
