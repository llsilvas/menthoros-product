# Implementation Tasks: Strava Sync Manual (90 Dias)

## Phase 1: Backend (Status Endpoint)

### Task 1.1: Create getSyncStatus Endpoint
- **File:** `src/main/java/com/menthoros/controller/StravaActivityController.java`
- **Checklist:**
  - [ ] Add method `getSyncStatus(atletaId)` with `@GetMapping("/sync-status/{atletaId}")`
  - [ ] Return `Map<String, Object>` with:
    - `connected`: boolean (integracao.isAtivo())
    - `syncing`: boolean (heurística)
    - `imported`: int (syncActivityCount)
    - `lastError`: string (nullable)
    - `lastSync`: Instant
    - `externalAthleteId`: string
  - [ ] Apply multi-tenant filter (TenantContext)
  - [ ] Handle 404 if not connected
  - [ ] Test endpoint returns valid data
- **Estimated:** 0.5h
- **Dependencies:** None

### Task 1.2: Enhance POST /sync Endpoint
- **File:** `src/main/java/com/menthoros/controller/StravaActivityController.java` (modification)
- **Checklist:**
  - [ ] Add duplicate prevention: check if `ultimaSincronizacao` < 30 seg → 409 CONFLICT
  - [ ] Add rate limit handling: catch `StravaRateLimitException` → 429 response
  - [ ] Add error handling: mark `ativo=false` + set `lastSyncError` on failure
  - [ ] Return meaningful error messages
  - [ ] Test: double-click → returns 409 on 2nd click
- **Estimated:** 0.5h
- **Dependencies:** Task 1.1

### Task 1.3: Database Migration
- **File:** `src/main/resources/db/migration/V15__Add_sync_columns_to_integracao_externa.sql`
- **Checklist:**
  - [ ] Add `sync_activity_count INT DEFAULT 0`
  - [ ] Add `last_sync_error VARCHAR(500)`
  - [ ] Ensure `ultima_sincronizacao` exists (pode já existir)
  - [ ] Create migration with standard Menthoros pattern
  - [ ] Test migration runs successfully
- **Estimated:** 0.5h
- **Dependencies:** None

### Task 1.4: Unit Tests - Backend
- **File:** `src/test/java/com/menthoros/controller/StravaActivityControllerTest.java`
- **Test Cases:**
  - [ ] getSyncStatus() returns correct format
  - [ ] sync() rejects duplicate calls (< 30s)
  - [ ] sync() handles rate limit exception (429)
  - [ ] sync() handles network error (500)
  - [ ] Multi-tenant isolation (Athlete A ≠ B)
- **Estimated:** 1.5h
- **Dependencies:** Task 1.1, 1.2

---

## Phase 2: Frontend (UI Components)

### Task 2.1: Create StravaService
- **File:** `src/api/services/StravaService.ts`
- **Methods:**
  - [ ] `triggerSync(atletaId: string): Promise<SyncResponse>`
  - [ ] `getSyncStatus(atletaId: string): Promise<SyncStatus>`
  - [ ] Type definitions: `SyncResponse`, `SyncStatus`
- **Estimated:** 0.5h
- **Dependencies:** None

### Task 2.2: Create useStravaSync Hook
- **File:** `src/hooks/features/useStravaSync.ts`
- **Features:**
  - [ ] State: `{ syncing, imported, error, lastSync }`
  - [ ] Function `triggerSync()`: calls `StravaService.triggerSync()`
  - [ ] Auto-polling: every 2s while `syncing=true`
  - [ ] Auto-stop: when `syncing=false`
  - [ ] Error handling: sets error state
  - [ ] Cleanup: cancel polling on unmount
- **Estimated:** 1h
- **Dependencies:** Task 2.1

### Task 2.3: Create SyncStravaButton Component
- **File:** `src/components/features/strava/SyncStravaButton.tsx`
- **Features:**
  - [ ] Only visible if `connected=true`
  - [ ] Button: "Sincronizar 90 Dias" (disabled while syncing)
  - [ ] Shows CircularProgress overlay while syncing
  - [ ] Shows progress: "Sincronizando (23/90)..."
  - [ ] Shows error message if failed (Alert component)
  - [ ] Shows success: "✅ 90 atividades importadas"
  - [ ] Uses `useStravaSync` hook
  - [ ] Calls `onSyncComplete()` callback when done
- **Material-UI Components:**
  - [ ] Button
  - [ ] CircularProgress
  - [ ] Alert
  - [ ] Typography
  - [ ] Box
- **Estimated:** 1.5h
- **Dependencies:** Task 2.1, 2.2

### Task 2.4: Integrate into AtletasList
- **File:** `src/pages/atletas/AtletasList.tsx` (modification)
- **Changes:**
  - [ ] Import `SyncStravaButton`
  - [ ] Add column for Strava status
  - [ ] Show button only if `stravaConnected=true`
  - [ ] Show Chip "✅ Conectado" status
  - [ ] Disable "Gerar Plano" button while syncing
  - [ ] On sync complete, refresh table
  - [ ] Show loading state during sync
- **Estimated:** 1h
- **Dependencies:** Task 2.3

### Task 2.5: Unit Tests - Frontend
- **File:** `src/api/services/__tests__/StravaService.test.ts`
- **Test Cases:**
  - [ ] StravaService.triggerSync() returns correct response
  - [ ] StravaService.getSyncStatus() parses correctly
  - [ ] Error handling (409, 429, 500)
- **Estimated:** 1h
- **Dependencies:** Task 2.1

### Task 2.6: Hook Tests
- **File:** `src/hooks/__tests__/useStravaSync.test.ts`
- **Test Cases:**
  - [ ] triggerSync() updates state
  - [ ] Polling starts after triggerSync
  - [ ] Polling stops when syncing=false
  - [ ] Error state set on API error
  - [ ] Cleanup on unmount
- **Estimated:** 1h
- **Dependencies:** Task 2.2

### Task 2.7: Component Tests
- **File:** `src/components/features/strava/__tests__/SyncStravaButton.test.tsx`
- **Test Cases:**
  - [ ] Button visible when connected=true
  - [ ] Button hidden when connected=false
  - [ ] Shows progress while syncing
  - [ ] Shows error message on failure
  - [ ] Calls onSyncComplete when done
- **Estimated:** 1h
- **Dependencies:** Task 2.3

---

## Phase 3: E2E & QA

### Task 3.1: E2E Test
- **File:** `tests/e2e/strava-sync-manual.spec.ts` (new)
- **Scenarios:**
  - [ ] Open AtletasList
  - [ ] Atleta with Strava connected shows "Sincronizar" button
  - [ ] Click button → shows progress
  - [ ] Wait for completion → shows "90 atividades importadas"
  - [ ] "Gerar Plano" button becomes enabled
  - [ ] Data in DB is correct (TreinoRealizado records)
- **Estimated:** 1.5h
- **Dependencies:** Phases 1 & 2 complete

### Task 3.2: Performance Test
- **Checklist:**
  - [ ] Single sync: 90 days imports in < 30 sec
  - [ ] Polling interval: 2s responsive (not too frequent)
  - [ ] Concurrent syncs: 3 atletas simultâneos
  - [ ] UI doesn't block while syncing
  - [ ] Memory: no leaks from polling
- **Estimated:** 1h
- **Dependencies:** Phase 2 complete

### Task 3.3: Documentation
- **Checklist:**
  - [ ] Add to CLAUDE.md: "Strava Manual Sync" section
  - [ ] Document new DB columns
  - [ ] Document endpoints: POST /sync, GET /sync-status
  - [ ] Troubleshooting: rate limit, network error
  - [ ] Update API docs (Swagger)
- **Estimated:** 0.5h
- **Dependencies:** All tasks complete

---

## Summary

| Phase | Tasks | Hours | Notes |
|-------|-------|-------|-------|
| **1: Backend** | 1.1-1.4 | 3h | Simple endpoint + error handling |
| **2: Frontend** | 2.1-2.7 | 6.5h | Service, hook, component, tests |
| **3: QA** | 3.1-3.3 | 3h | E2E, perf, docs |
| **TOTAL** | 13 tasks | **12.5h** | Much simpler than async event pattern |

---

## Risk Mitigation

| Risk | Task(s) | Notes |
|------|---------|-------|
| Duplicate syncs | 1.2 | Check ultimaSincronizacao < 30s |
| Rate limit blocks | 1.2 | Catch exception, return 429 |
| Long-running sync | 2.2 | Polling with proper cleanup |
| Cross-tenant leak | 1.1, 1.4 | Apply TenantContext filter, test |

---

## Definition of Done

- [ ] All tasks complete and reviewed
- [ ] All unit tests pass (> 80% coverage)
- [ ] All integration tests pass
- [ ] E2E test passes (sync → import → plano)
- [ ] Performance tests pass (< 30s sync)
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Tested in staging environment
- [ ] Ready for production rollout

---

**Change Owner:** Backend Lead + Frontend Lead
**Timeline:** 
- Day 1: Backend (3h)
- Day 2: Frontend (6.5h)
- Day 3: QA + Testing (3h)
