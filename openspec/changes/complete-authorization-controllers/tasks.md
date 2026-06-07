# Tasks: Complete Authorization on Remaining Controllers

## Task 1: MetricasController — Add @PreAuthorize

**File:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/MetricasController.java`

**Changes:**
1. Add `import org.springframework.security.access.prepost.PreAuthorize;`
2. Add `@PreAuthorize("hasRole('ROLE_ATLETA')")` to both GET methods:
   - getAdesaoSemanal()
   - getAdesaoDiaria()

**Acceptance Criteria:**
- [ ] Build passes: `./mvnw clean compile`
- [ ] Endpoint returns 401 without auth header
- [ ] Endpoint returns 200 with valid JWT token

---

## Task 2: ProvasProximasController — Add @PreAuthorize (Already Imported)

**File:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/ProvasProximasController.java`

**Changes:**
1. Note: @PreAuthorize is already imported (line 13) but NOT used
2. Add `@PreAuthorize("hasRole('ROLE_ATLETA')")` to getProvasProximas()

**Acceptance Criteria:**
- [ ] Build passes
- [ ] Endpoint returns 401 without auth
- [ ] Endpoint returns 200 with JWT token
- [ ] Cross-tenant isolation works (tenant A cannot see tenant B's races)

---

## Task 3: StravaActivityController — Add @PreAuthorize + @RequireTenant

**File:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/StravaActivityController.java`

**Changes:**
1. Note: @PreAuthorize already imported (line 14)
2. Import `@RequireTenant` annotation
3. Add both decorators to:
   - sync(UUID atletaId):
     ```java
     @PreAuthorize("hasRole('ROLE_ATLETA')")
     @RequireTenant(resourceParamIndex = 0)
     public ResponseEntity<StravaSyncResponseDto> sync(@PathVariable UUID atletaId)
     ```
   - getSyncStatus(UUID atletaId):
     ```java
     @PreAuthorize("hasRole('ROLE_ATLETA')")
     @RequireTenant(resourceParamIndex = 0)
     public ResponseEntity<StravaSyncStatusDto> getSyncStatus(@PathVariable UUID atletaId)
     ```

**Acceptance Criteria:**
- [ ] Build passes
- [ ] Both endpoints return 401 without auth
- [ ] Both endpoints return 200 with JWT
- [ ] Cross-tenant access returns 403 (AccessDeniedException)
- [ ] TenantValidationAspect logs security violation

---

## Task 4: StravaAuthController — Add @PreAuthorize (Selective)

**File:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/StravaAuthController.java`

**Changes:**
1. Note: @PreAuthorize already imported (line 16)
2. Add to startAuth(UUID atletaId):
   ```java
   @PreAuthorize("hasRole('ROLE_ATLETA')")
   public ResponseEntity<Void> startAuth(...)
   ```
3. Add to getAuthorizationUrl(UUID atletaId):
   ```java
   @PreAuthorize("hasRole('ROLE_ATLETA')")
   public ResponseEntity<Map<String, String>> getAuthorizationUrl(...)
   ```
4. **DO NOT ADD** to callback() — must remain public for Strava OAuth flow

**Acceptance Criteria:**
- [ ] Build passes
- [ ] startAuth returns 401 without auth
- [ ] getAuthorizationUrl returns 401 without auth
- [ ] callback() returns 302 (redirect) **without requiring auth** ← CRITICAL
- [ ] Callback still validates OAuth code and state parameters
- [ ] Swagger docs show 401 for auth endpoints but not callback

---

## Task 5: StravaWebhookController — No Changes (Remains Public)

**File:** `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/StravaWebhookController.java`

**Changes:**
- ✅ None required. Webhook endpoints must remain public.
- Validation is handled by verify token (line 45: `!verifyToken.equals(...)`)

**Acceptance Criteria:**
- [ ] Swagger docs clearly indicate both GET and POST are public (no 401 response code)
- [ ] Webhook validation test confirms token-based security works

---

## Task 6: Authorization Tests for Each Controller

**File:** `apps/menthoros-backend/src/test/java/br/com/menthoros/backend/controller/`

Create 4 new test classes (already exists for AtletaController as reference):

### Task 6a: MetricasControllerAuthTest
```bash
touch src/test/java/br/com/menthoros/backend/controller/MetricasControllerAuthTest.java
```

Test:
- GET /adesao-semanal without auth → 401
- GET /adesao-semanal with auth → 200
- GET /adesao-diaria without auth → 401
- GET /adesao-diaria with auth → 200

### Task 6b: ProvasProximasControllerAuthTest
Test:
- GET /proximas without auth → 401
- GET /proximas with auth → 200
- Cross-tenant isolation (if applicable)

### Task 6c: StravaActivityControllerAuthTest
Test:
- POST /sync/{id} without auth → 401
- POST /sync/{id} with auth → 200 (or 404/409 depending on state)
- GET /sync-status/{id} without auth → 401
- GET /sync-status/{id} with auth → 200
- Cross-tenant access → 403

### Task 6d: StravaAuthControllerAuthTest
Test:
- GET /auth without auth → 401
- GET /auth with auth → 302 (redirect to Strava)
- GET /auth/url/{id} without auth → 401
- GET /auth/url/{id} with auth → 200
- **GET /callback WITHOUT auth → 302 (must work without JWT)**

**Acceptance Criteria:**
- [ ] All 4 test classes pass
- [ ] Coverage > 90% for each controller
- [ ] No @Ignore or skipped tests

---

## Task 7: Validation & Documentation

**Build & Test:**
```bash
cd apps/menthoros-backend
./mvnw clean test
./mvnw test -Dtest=*AuthTest
```

**Swagger Verification:**
- [ ] Navigate to http://localhost:8080/swagger-ui.html
- [ ] Verify all endpoints show 401 responses (except webhooks)
- [ ] Verify security scheme is set to OAuth2/Bearer JWT

**Git & Commit:**
- [ ] All changes staged
- [ ] Commit message references this change-id
- [ ] No merge conflicts

---

## Estimated Effort
- Task 1-5 (implementation): **30 minutes**
- Task 6 (tests): **60 minutes**
- Task 7 (validation): **15 minutes**
- **Total: ~2 hours**

## Priority
🔴 **CRITICAL** — Security gap affecting 5 controllers

## Owner
Claude Code (Architecture Designer skill)

## Status
⏳ In Progress (Tasks 1-7 to be executed sequentially)
