# Tasks: coach-add-workout-to-plan

**Status:** Proposto
**Sprint:** 9i (após `infer-thresholds-from-recent-workouts`)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend: migration, entidade e DTOs

### 1.1 Migration V41

- [x] 1.1.a Confirmar que V40 é a última migration aplicada.
- [x] 1.1.b Criar `V41__Add_adicionado_pelo_coach_to_treino_planejado.sql`.
- [x] 1.1.c Validação: `./mvnw clean compile` — verde.

### 1.2 Entidade TreinoPlanejado

- [x] 1.2.a Adicionar campo `@Column(name = "adicionado_pelo_coach") private boolean adicionadoPeloCoach = false;` à entidade.
- [x] 1.2.b Inicialização via default de field declaration (mesmo padrão de `editadoPeloCoach`; `@PrePersist` não precisou de alteração).
- [x] 1.2.c Validação: `./mvnw clean compile` — verde.

### 1.3 DTO de input: TreinoPlanejadoAddDto

- [x] 1.3.a Criar `TreinoPlanejadoAddDto` em `dto/input/` como record:
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
- [x] 1.3.b Validação: `./mvnw clean compile` — verde.

### 1.4 DTO de output: TreinoPlanejadoOutputDto

- [x] 1.4.a Adicionar campo `boolean adicionadoPeloCoach` ao record `TreinoPlanejadoOutputDto`.
- [x] 1.4.b MapStruct auto-mapeou `adicionadoPeloCoach` sem necessidade de `@Mapping` explícito (mesmo comportamento de `editadoPeloCoach`).
- [x] 1.4.c Dois testes existentes (`CoachTreinoEditControllerTest`, `TreinoPlanejadoEditServiceImplTest`) construíam o record diretamente e precisaram de `false` na posição 20 — corrigidos.
- [x] 1.4.d Validação: `./mvnw clean test` — 983 testes, 0 falhas.

### 1.5 Infraestrutura de suporte (utilitário DiaSemana + query repository)

- [x] 1.5.a Adicionado `converterDayOfWeekParaDiaSemana(DayOfWeek)` em `util/Utils.java` — valores confirmados via enum DiaSemana (DOMINGO, SEGUNDA, TERCA, QUARTA, QUINTA, SEXTA, SABADO).
- [x] 1.5.b Adicionada query `findByIdWithDependenciesAndTenant` com JOIN FETCH de `atleta` e `assessoria` em `PlanoSemanalRepository`.
- [x] 1.5.c Validação: `./mvnw clean compile` — verde (incluído no teste geral 983/0).

---

## Bloco 2 — Backend: service

### 2.1 Interface e implementação

- [x] 2.1.a Criar interface `TreinoPlanejadoAddService` em `services/`.
- [x] 2.1.b Criar `TreinoPlanejadoAddServiceImpl` em `services/impl/` com:
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
- [x] 2.1.c Validação: `./mvnw clean compile` — verde.

### 2.2 Testes de unidade — TreinoPlanejadoAddServiceImplTest

- [x] 2.2.a `@Nested class AdicionarTreino` com cenários:
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
- [x] 2.2.b Validação: `./mvnw clean test` — 16 novos testes verdes; 999 total, 0 falhas.

---

## Bloco 3 — Backend: controller e testes de controller

### 3.1 CoachTreinoAddController

- [x] 3.1.a Criar `CoachTreinoAddController` em `controller/`:
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
- [x] 3.1.b Validação: `./mvnw clean test` — verde.

### 3.2 Testes @WebMvcTest — CoachTreinoAddControllerTest

- [x] 3.2.a Criar `CoachTreinoAddControllerTest` com `@WebMvcTest(CoachTreinoAddController.class)`:
  - 201: treino criado com sucesso.
  - 404: plano não encontrado.
  - 422: plano não está em revisão.
  - 422: data fora do intervalo.
  - 422: limite de 14 treinos atingido.
  - 400: `tipoTreino` ausente (Bean Validation).
  - 400: `dataTreino` ausente (Bean Validation).
  - 403: sem role COACH.
- [x] 3.2.b Validação: `./mvnw clean test` — 8 novos testes verdes; 1007 total, 0 falhas.

---

## Bloco 4 — Frontend: tipos, API, hook, dialog e integração

### 4.1 Tipo TypeScript

- [x] 4.1.a Adicionar `adicionadoPeloCoach?: boolean` a `TreinoPlanejadoDto` em `src/types/PlanoReview.ts`.
- [x] 4.1.b Criar interface `TreinoPlanejadoAddPayload` no mesmo arquivo:
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
- [x] 4.1.c Validação: `npm run build` — verde.

### 4.2 API service

- [x] 4.2.a Adicionar método `adicionarTreino(planoId: string, payload: TreinoPlanejadoAddPayload): Promise<TreinoPlanejadoDto>` em `src/api/services/CoachPlanoReviewService.ts`.
- [x] 4.2.b Validação: `npm run build` — verde.

### 4.3 Hook useAddTreinoPlanejado

- [x] 4.3.a Criar `src/hooks/useAddTreinoPlanejado.ts`: isSaving, error, adicionarTreino.
- [x] 4.3.b Criar `src/hooks/useAddTreinoPlanejado.test.ts` — 4 testes: sucesso, erro 422, erro 404, loading state.
- [x] 4.3.c Validação: `npm run build` — verde.

### 4.4 Componente TreinoAddDialog

- [x] 4.4.a Criar `src/features/coach/components/TreinoAddDialog.tsx`:
  - Select nativo para tipo e data (testabilidade com JSDOM).
  - Aviso de double-day com Alert warning.
  - Seção etapas colapsável; aria-label dinâmico no toggle.
  - Botão "Salvar treino" desabilitado sem tipo+data ou durante isSaving.
- [x] 4.4.b Criar `src/features/coach/components/TreinoAddDialog.test.tsx` — 7 testes (todos verdes).
- [x] 4.4.c Validação: `npm run build` + testes — 159/0; verde.

### 4.5 Integração na CoachPlanReviewPage

- [x] 4.5.a Botão "Adicionar treino" em PlanoDetalhePanel, visível apenas quando AGUARDANDO_REVISAO e onAdicionarTreino provida.
- [x] 4.5.b Estado addDialogOpen + handleTreinoAdicionado (re-fetch + toast) na CoachPlanReviewPage.
- [x] 4.5.c Chip `chip-adicionado-coach` (data-testid) em TreinoTag quando `adicionadoPeloCoach === true`.
- [x] 4.5.d Validação: `npm run lint && npm run build` — verde.

### 4.6 Testes de integração — CoachPlanReviewPage

- [x] 4.6.a Adicionados 3 testes: botão visível AGUARDANDO, ausente APROVADO, chip-adicionado-coach presente.
- [x] 4.6.b Validação: 159 testes passando.

---

## Bloco 5 — QA e entrega

- [x] 5.1 `./mvnw clean test` — BUILD SUCCESS.
- [x] 5.2 `npm run build && npm run test:run` — 159 testes passando.
- [ ] 5.3 Teste manual ponta-a-ponta (requer ambiente local).
- [x] 5.4 Revisores: code-reviewer executado; achados corrigidos:
  - I-3: countByPlanoSemanalId (COUNT query, evita race condition)
  - M-5: @NotBlank em EtapaInputDto.tipoEtapa
  - M-6: teste ADMIN adicionado ao controller
- [x] 5.5 PR aberto.
