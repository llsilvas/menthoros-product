# Tasks: coach-plan-review-workflow

**Status:** Proposed
**Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Seção 1 — Backend: persistence e domínio

- [x] **1.1** Migration V37 — adicionar `review_status` e `review_comment` em `tb_plano_semanal`:
  - `ALTER TABLE tb_plano_semanal ADD COLUMN review_status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_REVISAO'`
  - `ALTER TABLE tb_plano_semanal ADD COLUMN review_comment TEXT`
  - `UPDATE tb_plano_semanal SET review_status = 'APROVADO'` (backfill de retrocompatibilidade)
  - `CREATE INDEX IF NOT EXISTS idx_plano_review_status_tenant ON tb_plano_semanal(tenant_id, review_status)`
  - **verify:** `./mvnw clean compile` (Flyway não roda sem banco no compile; verificar SQL manualmente)

- [x] **1.2** Criar enum `PlanoReviewStatus` em `enums/`:
  - Valores: `AGUARDANDO_REVISAO`, `APROVADO`, `REJEITADO`
  - Seguir padrão dos outros enums (value, label, description)
  - **verify:** `./mvnw clean compile`

- [x] **1.3** Adicionar campos à entidade `PlanoSemanal`:
  - `@Enumerated(EnumType.STRING) @Column(name = "review_status", nullable = false) PlanoReviewStatus reviewStatus`
  - `@Column(name = "review_comment", columnDefinition = "TEXT") String reviewComment`
  - **verify:** `./mvnw clean compile`

- [x] **1.4** Adicionar queries ao `PlanoSemanalRepository`:
  - `findByAtletaIdAndReviewStatus(UUID atletaId, PlanoReviewStatus status)` — para `buscarPlanoPorAtleta` filtrado por APROVADO
  - `findByAssessoriaIdAndReviewStatusOrderBySemanaInicioAsc(UUID tenantId, PlanoReviewStatus status)` — para listagem de pendentes
  - `findByIdAndAssessoriaId(UUID id, UUID tenantId)` — já existe `findByIdAndTenantId`, verificar se reutilizável
  - **verify:** `./mvnw clean compile`

---

## Seção 2 — Backend: serviço de revisão

- [x] **2.1** Criar record `PlanoRejectionInputDto` em `dto/input/`:
  - Campos: `motivo` (`@NotBlank`, `@Size(max=1000)`)
  - `@Schema` em classe e campo
  - **verify:** `./mvnw clean compile`

- [x] **2.2** Atualizar `PlanoSemanalOutputDto` com campos de revisão:
  - Adicionar `PlanoReviewStatus reviewStatus` e `String reviewComment`
  - `@Schema` em ambos
  - **verify:** `./mvnw clean compile`

- [x] **2.3** Atualizar `PlanoSemanalMapper` para mapear novos campos:
  - `toOutputDto()` deve incluir `reviewStatus` e `reviewComment`
  - Null check nos inputs (padrão do CLAUDE.md)
  - **verify:** `./mvnw clean compile`

- [x] **2.4** Criar interface `PlanoReviewService` e `PlanoReviewServiceImpl`:
  - `listarPlanosPendentes(UUID tenantId): List<PlanoSemanalOutputDto>`
  - `aprovarPlano(UUID planoId, UUID tenantId): PlanoSemanalOutputDto`
  - `rejeitarPlano(UUID planoId, UUID tenantId, String motivo): PlanoSemanalOutputDto`
  - Validações de transição ilegal → `DomainRuleViolationException` (422)
  - Isolamento de tenant via `findByIdAndTenantId` antes de qualquer mutação
  - JavaDoc com Idempotent/Side Effects/Tenant-aware por método
  - **verify:** `./mvnw clean compile`

- [x] **2.5** Modificar `PlanoServiceImpl.gerarPlanoTreino()` para setar `reviewStatus = AGUARDANDO_REVISAO`:
  - Localizar onde o `PlanoSemanal` é construído e persistido
  - Adicionar `.reviewStatus(PlanoReviewStatus.AGUARDANDO_REVISAO)` ao builder
  - **verify:** `./mvnw clean test` (testes existentes de geração devem continuar verdes)

- [x] **2.6** Modificar `PlanoServiceImpl.buscarPlanoPorAtleta()` para filtrar por `reviewStatus`:
  - Verificar roles via `SecurityContextHolder.getContext().getAuthentication().getAuthorities()`
  - Se caller tem role `ATLETA`: usar `findByAtletaIdAndReviewStatus(atletaId, APROVADO)` → 404 se não houver
  - Se caller tem role `TECNICO` ou `ADMIN`: comportamento atual (mais recente não-CONCLUIDO)
  - **verify:** `./mvnw clean test`

---

## Seção 3 — Backend: controller e testes

- [x] **3.1** Criar `CoachPlanoReviewController` em `controller/`:
  - `@Tag(name = "coach-plan-review", description = "Revisão e aprovação de planos gerados pela IA")`
  - `GET  /api/v1/coach/planos/pendentes` — `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`
  - `POST /api/v1/coach/planos/{id}/aprovar` — `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` + `@RequireTenant`
  - `POST /api/v1/coach/planos/{id}/rejeitar` — `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` + `@RequireTenant`
  - Retornos: `ResponseEntity<List<PlanoSemanalOutputDto>>`, `ResponseEntity<PlanoSemanalOutputDto>`
  - `@Operation` + `@ApiResponses` completos em todos os métodos
  - `TenantContext.getRequiredTenantId()` para resolver tenant
  - **verify:** `./mvnw clean compile`

- [x] **3.2** Testes unitários: `PlanoReviewServiceImplTest` (`@ExtendWith(MockitoExtension.class)`):
  - `ListarPlanosPendentes`: retorna lista filtrada por tenant e status; lista vazia quando não há pendentes
  - `AprovarPlano`:
    - happy path: reviewStatus → APROVADO, reviewer é o tenantId correto
    - plano não encontrado no tenant → `DomainNotFoundException`
    - plano já APROVADO → `DomainRuleViolationException`
    - plano REJEITADO → `DomainRuleViolationException`
  - `RejeitarPlano`:
    - happy path: reviewStatus → REJEITADO, reviewComment persistido
    - plano já REJEITADO → `DomainRuleViolationException`
    - plano APROVADO → `DomainRuleViolationException`
    - cross-tenant (plano de outro tenant) → `DomainNotFoundException`
  - **verify:** `./mvnw clean test`

- [x] **3.3** Testes controller: `CoachPlanoReviewControllerTest` (`@WebMvcTest`):
  - GET pendentes: 200 com lista; 403 sem role TECNICO
  - POST aprovar: 200; 403 sem role; 422 transição ilegal
  - POST rejeitar: 200; 400 sem motivo; 403 sem role; 422 transição ilegal
  - **verify:** `./mvnw clean test`

---

## Seção 4 — Frontend: cliente e hook

- [ ] **4.1** Criar types em `src/types/PlanoReview.ts`:
  - `PlanoReviewStatus`: `'AGUARDANDO_REVISAO' | 'APROVADO' | 'REJEITADO'`
  - `PlanoSemanalDto`: campos do plano (semana, sessões, atleta, reviewStatus, reviewComment)
  - `TreinoPlanejadoDto`: dia, tipo, volume, intensidade (para detalhe do plano)
  - **verify:** `npm run lint && npm run build`

- [ ] **4.2** Criar `CoachPlanoReviewService` em `src/api/services/`:
  - `listarPendentes(): Promise<PlanoSemanalDto[]>`
  - `aprovar(id: string): Promise<PlanoSemanalDto>`
  - `rejeitar(id: string, motivo: string): Promise<PlanoSemanalDto>`
  - Exportar de `src/api/index.ts`
  - **verify:** `npm run lint && npm run build`

- [ ] **4.3** Criar hook `useCoachPlanReview` em `src/hooks/`:
  - Estado: `pendentes: PlanoSemanalDto[]`, `isFetching`, `isActing`, `fetchError`
  - Ações: `aprovar(id)`, `rejeitar(id, motivo)` — removem o plano da lista após sucesso
  - `useManualTraining` é referência de padrão
  - Teste: `useCoachPlanReview.test.ts` (casos: listar, aprovar, rejeitar, error)
  - **verify:** `npm run lint && npm run build && npm run test:run`

---

## Seção 5 — Frontend: UI

- [ ] **5.1** Criar componente `PlanoPendenteItem` em `src/features/coach/components/`:
  - Props: `plano: PlanoSemanalDto`, `selecionado: boolean`, `onSelect: () => void`
  - Exibe: nome do atleta, semana, contagem de sessões, data de geração
  - Estado visual diferente quando selecionado
  - **verify:** `npm run lint && npm run build`

- [ ] **5.2** Criar componente `PlanoDetalhePanel` em `src/features/coach/components/`:
  - Props: `plano: PlanoSemanalDto | null`, `isActing: boolean`, `onAprovar: () => void`, `onRejeitar: (motivo: string) => void`
  - Exibe: nome atleta, semana, lista de sessões (dia/tipo/volume/objetivo)
  - Rodapé: botão `[Aprovar]` (verde) e `[Rejeitar]` (abre modal)
  - Modal de rejeição: `TextField` de motivo obrigatório + botões Cancelar/Confirmar
  - Estado vazio: "Selecione um plano da lista"
  - **verify:** `npm run lint && npm run build`

- [ ] **5.3** Criar `CoachPlanReviewPage` em `src/features/coach/pages/`:
  - Layout 2-colunas: `PlanoPendenteItem` list (esq) + `PlanoDetalhePanel` (dir)
  - Consume `useCoachPlanReview`; estado vazio global: "Nenhum plano aguardando revisão"
  - Toast de confirmação após aprovar/rejeitar
  - **verify:** `npm run lint && npm run build`

- [ ] **5.4** Badge de pendentes no nav do `CoachLayout`:
  - Hook interno `useCoachPlanPendingCount` (chama `listarPendentes` e retorna `length`)
  - Badge numérico ao lado do item de nav "Revisão de planos" — visível apenas quando count > 0
  - **verify:** `npm run lint && npm run build`

- [ ] **5.5** Adicionar rota `/coach/planos/revisao` no roteador (`App.tsx` ou equivalente):
  - Lazy import de `CoachPlanReviewPage`
  - Item de navegação no `CoachLayout` linkando para a rota
  - **verify:** `npm run lint && npm run build`

- [ ] **5.6** Testes: `CoachPlanReviewPage.test.tsx`:
  - Renderiza lista de planos pendentes
  - Selecionar plano exibe detalhe
  - Clicar Aprovar chama `aprovar(id)` e remove plano da lista
  - Clicar Rejeitar abre modal; confirmar com motivo chama `rejeitar(id, motivo)`
  - Modal de rejeição bloqueia confirmação com motivo vazio
  - Estado vazio quando não há pendentes
  - **verify:** `npm run lint && npm run build && npm run test:run`

---

## Validação Final

```bash
# Backend
./mvnw clean test

# Frontend
npm run lint && npm run build && npm run test:run
```

Após validação: `/qa` → `/pr coach-plan-review-workflow`
