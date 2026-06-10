# Tasks: add-coach-suggestion-inbox

## 1. Modelo & Migração

- [ ] 1.1 Migration `tb_sugestao_coach` (≥ V35): PK `gen_random_uuid()`, `tenant_id`, FK `atleta_id`
  (`ON DELETE CASCADE`), `tipo`, `status DEFAULT 'pending'`, `confidence`, `summary`, `reasoning`
  (JSONB), `created_at`, `reviewed_at`; índices `idx_sugestao_coach_atleta` + `(tenant_id, status)`.
- [ ] 1.2 `entity/SugestaoCoach.java` + enums `TipoSugestao`/`StatusSugestao`.
- [ ] 1.3 `SugestaoCoachRepository` com `findByIdAndTenantId`, `findByTenantIdAndStatus`.

## 2. Geração (gatilho)

- [ ] 2.1 Listener/job que converte sinais elegíveis da `add-coach-attention-queue` em `SugestaoCoach`
  `pending`, preenchendo `reasoning` via `add-recommendation-explainability`.
- [ ] 2.2 Idempotência: no máximo uma `pending` por `(atletaId, tipo)` ativo.

## 3. Service

- [ ] 3.1 `listar(status)` (read-only, tenant-aware). JavaDoc `Idempotent: YES`, `Side Effects: NONE`.
- [ ] 3.2 `detalhe(id)` (read-only, tenant-aware) → `DomainNotFoundException` se ausente/outro tenant.
- [ ] 3.3 `aprovar(id)`: `pending→approved` (idempotente), dispara efeito por `tipo` após commit.
  JavaDoc `Idempotent: YES (aprovar já-aprovada = no-op)`, `Side Effects: DB update + efeito de plano`,
  `Tenant-aware: YES`. Transição ilegal → `DomainRuleViolationException`.
- [ ] 3.4 `rejeitar(id)`: `pending→rejected` (idempotente), sem efeito de plano.

## 4. Controller

- [ ] 4.1 `CoachSugestaoController` `@RequestMapping("/api/v1/coach/sugestoes")` `@RequireTenant`
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` `@Tag`.
- [ ] 4.2 `GET /?status=` → `ResponseEntity<List<SugestaoCoachOutputDto>>`.
- [ ] 4.3 `GET /{id}` → `ResponseEntity<SugestaoCoachOutputDto>`.
- [ ] 4.4 `POST /{id}/aprovar` → `ResponseEntity<SugestaoCoachOutputDto>` (200).
- [ ] 4.5 `POST /{id}/rejeitar` → `ResponseEntity<SugestaoCoachOutputDto>` (200).
- [ ] 4.6 `@Operation`/`@ApiResponses` (200/400/403/404/409) em todos.
- [ ] 4.7 `GlobalExceptionHandler`: handler para `DomainRuleViolationException` se ainda não existir.

## 5. Testes

- [ ] 5.1 Listagem filtra por status e por tenant; detalhe cross-tenant → not found.
- [ ] 5.2 `aprovar` transiciona e dispara efeito do tipo (verify); reaprovar é no-op; transição
  ilegal lança exceção.
- [ ] 5.3 `rejeitar` transiciona sem efeito de plano; re-rejeitar é no-op.
- [ ] 5.4 Geração idempotente: mesmo sinal não duplica `pending`.
- [ ] 5.5 `./mvnw clean test` — verde.
