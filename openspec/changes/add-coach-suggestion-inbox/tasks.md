# Tasks: add-coach-suggestion-inbox

> **Trilha Full — backend + frontend.** Leia `design.md` integralmente antes de começar.
> Stack: backend Java 21 / Spring Boot 3.5; frontend React 19 / TS / MUI.
> Threshold ratificado: somente `Severidade in (CRITICA, ALTA)` gera sugestão; `MEDIA` descartada.

---

## 1. Modelo & Migração (backend)

- [x] 1.1 Migration `V36__Create_tb_sugestao_coach.sql`:
  - Tabela `tb_sugestao_coach` com todos os campos do `design.md` (Decisão 4).
  - CHECK constraints em `tipo`, `status`, `confidence`.
  - Índices: `idx_sugestao_coach_atleta`, `idx_sugestao_coach_tenant_status`,
    `uk_sugestao_pending` (UNIQUE partial `WHERE status='pending'`).
  - `RAISE NOTICE '✅ V36 - tb_sugestao_coach criada com sucesso'` ao fim.
  - verify: `./mvnw flyway:validate` verde ✓

- [x] 1.2 `entity/SugestaoCoach.java` (`@Entity`, `@Table("tb_sugestao_coach")`):
  - Campos conforme migration. `@Enumerated(EnumType.STRING)` para `TipoSugestao` e
    `StatusSugestao`. `confidence` como `String` (HIGH/MEDIUM/LOW).
  - `reasoning` como `Map<String, Object>` ou `JsonNode` via `@JdbcTypeCode(SqlTypes.JSON)`.
  - verify: `./mvnw clean compile` ✓

- [x] 1.3 Enums `TipoSugestao` (`PLAN_ADJUST`, `RECOVERY`, `NEW_PLAN`) e
  `StatusSugestao` (`PENDING`, `APPROVED`, `REJECTED`) no pacote `enums/`.
  - verify: compile ✓

- [x] 1.4 `SugestaoCoachRepository` (`JpaRepository<SugestaoCoach, UUID>`):
  - `findByIdAndTenantId(UUID id, UUID tenantId)` — para `detalhe()` e `aprovar()`/`rejeitar()`.
  - `findByTenantIdAndStatus(UUID tenantId, StatusSugestao status)` — para `listar()`.
  - `existsByIdAndTenantId(UUID id, UUID tenantId)` — necessário para `TenantValidationRepository`.
  - `existsByAtletaIdAndTipoAndStatus(UUID atletaId, TipoSugestao tipo, StatusSugestao status)` — idempotência na camada Java.
  - verify: compile ✓

- [x] 1.5 Adicionar `SugestaoCoachRepository` ao `TenantValidationRepository`:
  - Campo `private final SugestaoCoachRepository sugestaoCoachRepository` (constructor injection via `@RequiredArgsConstructor`).
  - Adicionar bloco ao método `resourceBelongsToTenant` após o último `if` existente:
    ```java
    // Tenta SugestaoCoach
    if (sugestaoCoachRepository.existsByIdAndTenantId(resourceId, tenantId)) {
        log.debug("TenantValidation: resourceId {} pertence a tenant {} (SugestaoCoach)", resourceId, tenantId);
        return true;
    }
    ```
  - `@EnableScheduling` já está em `MenthorosServicesApplication` — nenhuma alteração necessária.
  - verify: `./mvnw clean test` ✓ (nenhum teste de tenant isolation quebra)

---

## 2. Geração de sugestões (backend)

- [x] 2.1 `SugestaoCoachGeneratorJob` (`@Component` + `@Scheduled(cron = "0 0 6 * * *")`):
  - Itera `assessoriaRepository.findByAtivoTrue().stream().map(Assessoria::getId).toList()` —
    método existente em `develop`, sem adicionar query nova.
  - Para cada `tenantId`: `try { TenantContext.setTenantId(tenantId); gerarPorTenant(); } finally { TenantContext.clear(); }`.
  - `gerarPorTenant()`: chama `coachAttentionQueueService.getAttentionQueue()` (sem parâmetro —
    resolve tenant via `TenantContext` internamente), filtra `severity in (CRITICA, ALTA)`,
    mapeia via tabela do `design.md` Decisão 1.
  - Para cada item: preenche `summary = item.suggestedAction()`, `reasoning` do `item.explanation()`,
    `confidence` mapeado de `item.severity()`, `expires_at = now() + 7d`.
  - Captura `DataIntegrityViolationException` no INSERT e ignora (UNIQUE index faz o resto).
  - Loga: sinais processados, sugestões criadas, sugestões ignoradas (já existia pending).
  - verify: `./mvnw clean test` ✓ (teste unitário — mockear `CoachAttentionQueueService`)

- [x] 2.2 Teste `SugestaoCoachGeneratorJobTest`:
  - Idempotência: mesmo sinal 2× → 1 `pending` (captura `DataIntegrityViolationException`).
  - Sinal com `severity=MEDIA` → não gera sugestão.
  - TenantContext limpo no `finally` (verificar `TenantContext.getTenantId()` após execução).
  - verify: `./mvnw clean test` ✓

---

## 3. Service (backend)

- [ ] 3.1 Interface `SugestaoCoachService` + `SugestaoCoachServiceImpl`:
  - `listar(StatusSugestao status)`:
    - Idempotent: YES. Side Effects: NONE. Tenant-aware: YES.
    - Se `status == PENDING`: filtra `expires_at IS NULL OR expires_at > NOW()`.
    - Usa `TenantContext.getRequiredTenantId()`.
  - verify: teste unitário ✓

- [ ] 3.2 `detalhe(UUID id)`:
  - Idempotent: YES. Side Effects: NONE. Tenant-aware: YES.
  - `findByIdAndTenantId(id, tenantId)` → `DomainNotFoundException` se ausente.
  - verify: teste unitário ✓

- [ ] 3.3 `aprovar(UUID id)`:
  - Idempotent: YES (aprovar já-approved = no-op). Side Effects: DB update. Tenant-aware: YES.
  - `UPDATE ... SET status='approved', reviewed_at=NOW() WHERE id=? AND tenant_id=? AND status='pending'`.
  - Verificar `rowsAffected`: 0 = sugestão não-pending; load atual para distinguir no-op vs. transição ilegal.
  - Transição ilegal (`approved→rejected`, `rejected→approved` via este endpoint) → `DomainRuleViolationException`.
  - v1: **sem efeito de plano** (apenas transição de status).
  - verify: teste unitário com casos: pending→approved, reaprovar=no-op, rejected→aprovar=ilegal ✓

- [ ] 3.4 `rejeitar(UUID id)`:
  - Idempotent: YES. Side Effects: DB update. Tenant-aware: YES.
  - Transição ilegal (`approved → rejected`) → `DomainRuleViolationException`.
  - verify: teste unitário ✓

---

## 4. Controller (backend)

- [ ] 4.1 `CoachSugestaoController`:
  - `@Tag(name = "coach-suggestion-inbox", description = "Sugestões de IA para revisão do treinador")`
  - `@RequestMapping("/api/v1/coach/sugestoes")`
  - `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`
  - **Não** usar `@RequireTenant` na classe — apenas nos métodos com `{id}` (ver task 4.3–4.5).
  - verify: compile ✓

- [ ] 4.2 `GET /?status=`:
  - Parâmetro `@RequestParam(required=false) StatusSugestao status`.
  - Sem `@RequireTenant` — usa `TenantContext` na camada de service.
  - `@Operation(summary = "Lista sugestões por status")` + `@ApiResponses(200, 400, 403)`.
  - Retorna `ResponseEntity<List<SugestaoCoachOutputDto>>`.
  - verify: `./mvnw clean test` + `@WebMvcTest` ✓

- [ ] 4.3 `GET /{id}`:
  - `@RequireTenant(resourceParamIndex = 0)` no método.
  - `@ApiResponses(200, 403, 404)`.
  - verify: `./mvnw clean test` ✓

- [ ] 4.4 `POST /{id}/aprovar`:
  - `@RequireTenant(resourceParamIndex = 0)` no método.
  - `@ApiResponses(200, 403, 404, 422)` — 422 porque `DomainRuleViolationException` → 422.
  - verify: `./mvnw clean test` ✓

- [ ] 4.5 `POST /{id}/rejeitar`:
  - `@RequireTenant(resourceParamIndex = 0)` no método.
  - `@ApiResponses(200, 403, 404, 422)` — 422 porque `DomainRuleViolationException` → 422.
  - verify: `./mvnw clean test` ✓

- [ ] 4.6 `GlobalExceptionHandler`:
  - **Decisão registrada:** `DomainRuleViolationException` retorna **422 Unprocessable Entity**
    (handler já existe em `develop` com esse status — nenhuma alteração necessária).
  - Confirmar no código que o handler está presente e retorna 422; nenhum handler novo a criar.
  - verify: `grep -n "DomainRuleViolationException" GlobalExceptionHandler.java` mostra 422 ✓

---

## 5. Testes backend

- [ ] 5.1 `SugestaoCoachServiceImplTest`:
  - `listar`: filtra por status, filtra expiradas no caso `PENDING`, tenant-scoped.
  - `detalhe`: cross-tenant → not found; próprio tenant → retorna DTO.
  - `aprovar`: pending→approved; reaprovar=no-op; approved→rejeitar=ilegal (422).
  - `rejeitar`: pending→rejected; re-rejeitar=no-op; rejected→aprovar=ilegal (422).
  - verify: `./mvnw clean test` ✓

- [ ] 5.2 `@WebMvcTest(CoachSugestaoController.class)`:
  - `GET /?status=pending` sem JWT → 401; com JWT sem role → 403; com role → 200.
  - `POST /{id}/aprovar` com ID de outro tenant → 403.
  - Transição ilegal → 422.
  - verify: `./mvnw clean test` ✓

- [ ] 5.3 Suite completa verde:
  - verify: `./mvnw clean test` ✓ (todos os testes existentes + novos)

---

## 6. Frontend

- [ ] 6.1 `src/types/SugestaoCoach.ts` (novo):
  ```ts
  export type SugestaoTipo = 'plan_adjust' | 'recovery' | 'new_plan';
  export type SugestaoStatus = 'pending' | 'approved' | 'rejected';
  export type SugestaoConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
  export interface SugestaoCoachOutputDto {
    id: string;
    atletaId: string;
    athleteName: string;   // se exposto no DTO backend
    tipo: SugestaoTipo;
    status: SugestaoStatus;
    confidence: SugestaoConfidence;
    summary: string;
    reasoning?: { rationale: string; sourceRules: string[]; confidence: SugestaoConfidence };
    createdAt: string;
    reviewedAt?: string;
    expiresAt?: string;
  }
  ```
  - verify: `npm run build` ✓

- [ ] 6.2 `src/api/services/SugestaoService.ts` (novo, curado à mão):
  ```ts
  // listar(status?): GET /api/v1/coach/sugestoes?status=<status>
  // aprovar(id):    POST /api/v1/coach/sugestoes/{id}/aprovar
  // rejeitar(id):   POST /api/v1/coach/sugestoes/{id}/rejeitar
  ```
  - verify: `npm run build` ✓

- [ ] 6.3 `src/api/index.ts`: `export { SugestaoService }` com comentário de curadoria.
  - verify: `npm run build` ✓

- [ ] 6.4 `src/hooks/useCoachSugestoes.ts` + `useCoachSugestoes.test.ts`:
  - `useState` + `useCallback`; retorna `{ sugestoes, loading, error, fetchSugestoes }`.
  - Testes: lista pendente, lista vazia, erro, loading.
  - verify: `npm run test:run` ✓

- [ ] 6.5 `src/features/coach/pages/CoachInboxPage.tsx` (novo):
  - Layout 2-painéis conforme `design.md` Decisão 6.
  - Estados: loading, erro (+ retry), vazio, selecionado (detalhe + botões Aprovar/Rejeitar).
  - Aprovar/rejeitar: loading individual por botão; atualiza lista localmente após sucesso.
  - verify: `npm run build` ✓; sem `any` ✓

- [ ] 6.6 `src/App.tsx`:
  - Rota `/coach/inbox` → `CoachInboxPage` (substitui `CoachAttentionQueuePage`).
  - `CoachAttentionQueuePage` permanece importada mas sem rota (comentário: "sem rota em v1 — aguardando add-coach-queue-route").
  - verify: `npm run build` ✓

- [ ] 6.7 Suite frontend verde:
  - verify: `npm run lint && npm run build && npm run test:run` ✓

---

## Notas de implementação

- **Migration V36:** confirmar que não há V36 existente no repo antes de criar (`ls db/migration/`).
- **`athleteName` no DTO backend:** o `SugestaoCoach` armazena `atletaId`; o service deve JOIN ou
  lookup para preencher o nome no DTO de saída — verificar performance (N+1 check).
- **`reasoning JSONB`:** serializar `RecommendationExplanation` via `ObjectMapper` no mapper de
  sugestão; deserializar no `toOutputDto`. Se `explanation` for nulo no sinal, `reasoning` fica null.
- **Ordenação padrão:** `GET /sugestoes?status=pending` ordena por `confidence DESC, created_at ASC`
  (mais críticas primeiro, depois por ordem de criação).
- **Badge count:** permanece com `queue.length` da attention queue (follow-up para usar contagem
  de `pending` sugestões quando endpoint leve de contagem for adicionado).
- **`CoachAttentionQueuePage`:** mantida no código sem rota até que change `add-coach-queue-route`
  defina onde ela vai viver (ex.: `/coach/queue` ou tab dentro do inbox).
