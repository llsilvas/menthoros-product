# Design: Complete Authorization on Remaining Controllers

## Context

Seven controllers already use @PreAuthorize annotations correctly:
- AtletaController (write operations)
- PlanoTreinoController
- ProvaController
- TreinoRealizadoController
- ManualReconciliationController
- AssessoriaMetricasController
- StravaStatusController

Five controllers require completion:

### 1. MetricasController
**Endpoints:**
- GET /api/v1/atletas/{atletaId}/metricas/adesao-semanal
- GET /api/v1/atletas/{atletaId}/metricas/adesao-diaria

**Authorization:**
- @PreAuthorize("hasRole('ROLE_ATLETA')")
- Both endpoints access personal athlete data; authentication required

**Rationale:** Metrics are athlete-specific; only authenticated users should access metrics.

### 2. ProvasProximasController
**Endpoint:**
- GET /api/v1/provas/proximas

**Authorization:**
- @PreAuthorize("hasRole('ROLE_ATLETA')")

**Note:** Returns races for all athletes in tenant. Access should still be authentication-gated (logged-in athletes only). Cross-tenant isolation handled by Strava integration layer.

**Rationale:** Coach dashboard may show upcoming races; requires authentication to maintain security model consistency.

### 3. StravaActivityController
**Endpoints:**
- POST /api/v1/strava/sync/{atletaId}
- GET /api/v1/strava/sync-status/{atletaId}

**Authorization:**
```java
@PreAuthorize("hasRole('ROLE_ATLETA')")
// Plus @RequireTenant(resourceParamIndex = 0) to validate cross-tenant access
```

**Rationale:** Users can only trigger sync for their own athletes. Both authentication and tenant isolation required.

### 4. StravaAuthController
**Endpoint Authorization:**
- GET /api/v1/strava/auth — @PreAuthorize("hasRole('ROLE_ATLETA')")
- GET /api/v1/strava/auth/url/{atletaId} — @PreAuthorize("hasRole('ROLE_ATLETA')")
- **GET /api/v1/strava/callback — MUST REMAIN PUBLIC** (Strava OAuth callback)

**Rationale:**
- Users must be authenticated to initiate Strava OAuth flow
- Callback is called by Strava servers, not user agents; cannot require auth
- Validation by OAuth state parameter (CSRF token) and code flow handles security

### 5. StravaWebhookController
**Endpoint Authorization:**
- **GET /api/v1/strava/webhook (validation) — MUST REMAIN PUBLIC**
- **POST /api/v1/strava/webhook (events) — MUST REMAIN PUBLIC**

**Validation Strategy:** Webhook verify token (already implemented in controller)
- Strava sends events asynchronously
- Cannot require user authentication (Strava is not an authenticated client)
- Security relies on webhook verify token validation (secret known only to Strava + app)

**Rationale:** Webhooks are push events from external service; standard practice is public endpoint with token validation.

---

## Authorization Pattern

All controllers follow this pattern (modeled on AtletaController):

```java
@RestController
@RequestMapping("/api/v1/resource")
@RequiredArgsConstructor
@Tag(name = "Resource", description = "...")
public class ResourceController {

    private final ResourceService service;

    @GetMapping
    @PreAuthorize("hasRole('ROLE_ATLETA')")  // ← Authorization guard
    @Operation(summary = "...")
    @ApiResponses({...})
    public ResponseEntity<ResourceDto> getAll() {
        return ResponseEntity.ok(service.getAll());
    }

    @PostMapping
    @PreAuthorize("hasRole('ROLE_ATLETA')")  // ← Authorization guard
    @Operation(summary = "...")
    @ApiResponses({...})
    public ResponseEntity<ResourceDto> create(@Valid @RequestBody ResourceInputDto dto) {
        return ResponseEntity.created(...).body(service.create(dto));
    }
}
```

### For Tenant-Aware Resources

Add both decorators:

```java
@PreAuthorize("hasRole('ROLE_ATLETA')")
@RequireTenant(resourceParamIndex = 0)
public ResponseEntity<StravaSyncResponseDto> sync(@PathVariable UUID atletaId) {
    // ...
}
```

---

## Testing Strategy

Each controller requires:
1. **Authorization test** — verify 401/403 for unauthenticated/unauthorized requests
2. **Happy-path test** — verify 200 for authenticated requests
3. **Tenant isolation test** — verify cross-tenant access is denied (where applicable)

Example test class:

```java
@SpringBootTest
@WebMvcTest(StravaActivityController.class)
class StravaActivityControllerAuthTest {

    @Autowired private MockMvc mockMvc;
    @MockBean private StravaActivityService service;

    @Test
    void postSync_withoutAuth_returns401() throws Exception {
        mockMvc.perform(post("/api/v1/strava/sync/uuid"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "ATLETA")
    void postSync_withAuth_calls_service() throws Exception {
        mockMvc.perform(post("/api/v1/strava/sync/uuid"))
            .andExpect(status().isOk());
    }
}
```

---

## Backward Compatibility

✅ No breaking changes. All endpoints return 401/403 when auth headers missing.

Clients must:
1. Obtain JWT token from Keycloak
2. Include `Authorization: Bearer <token>` header in all requests (except webhooks)

---

## Security Checklist

- [x] No hardcoded credentials
- [x] No SQL injection vectors
- [x] No XSS in responses (JSON-only)
- [x] Tenant isolation via @RequireTenant where needed
- [x] Webhook validation via token (not JWT)
- [x] All endpoints documented in OpenAPI with 401/403 responses
