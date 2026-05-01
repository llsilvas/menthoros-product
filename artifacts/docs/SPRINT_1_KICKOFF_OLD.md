# Sprint 1 Kick-Off - Menthoros MVP 2.0

**Documento Executivo para Início Imediato**
**Data de Início:** 01 de março de 2026 (amanhã!)
**Duração:** 21 dias (28 FEV - 21 MAR)
**Total Estimado:** 84-96 horas (com 1-2 devs)
**Objetivo:** Auth + Multi-tenancy + Skills Foundation

---

## 🎯 Sprint Goal

**"Implementar autenticação segura com isolamento multi-tenant desde dia 1, establecendo alicerce para integrações e skills que virão em Sprint 2A"**

---

## 📋 User Stories Detalhadas

### US 1.1: JWT Setup (16h) - Days 1-2

**Descrição:** Implementar JWT authentication com Spring Security

**Tarefas:**
```
DAY 1:
[ ] 1. Spring Security Maven dependency (pom.xml)
[ ] 2. Create JwtProvider class with token generation
[ ] 3. Create JwtAuthenticationFilter to intercept requests
[ ] 4. Configure SecurityConfig with JWT chain
[ ] 5. Create AuthController with /login endpoint

DAY 2:
[ ] 6. Implement password hashing with BCryptPasswordEncoder
[ ] 7. Write unit tests for JwtProvider (token validity, expiration)
[ ] 8. Write integration tests for /login endpoint
[ ] 9. Create API documentation (Swagger/OpenAPI comments)
[ ] 10. Verify with Postman: POST /auth/login returns token
```

**Code Reference:** EXEMPLOS_IMPLEMENTACAO.md sections 1.1-1.3

**Acceptance Criteria:**
- ✅ POST /api/v1/auth/login with email/password returns JWT token
- ✅ Token contains: user_id, email, iat, exp (24h)
- ✅ POST /api/v1/auth/refresh returns new token
- ✅ Invalid credentials return 401
- ✅ Expired token rejected (401)
- ✅ Unit test coverage: 80%+

**Dependencies:** None (initial)

---

### US 1.2: Logout & Token Refresh (8h) - Day 3

**Descrição:** Implement secure logout and token refresh mechanism

**Tarefas:**
```
DAY 3:
[ ] 1. Create RefreshTokenEntity (id, user_id, token, expiresAt)
[ ] 2. Create RefreshTokenRepository
[ ] 3. Implement POST /auth/refresh endpoint
[ ] 4. Implement POST /auth/logout endpoint (blacklist token)
[ ] 5. Write unit tests for refresh/logout
[ ] 6. Test with frontend: token renewal flow
```

**Acceptance Criteria:**
- ✅ POST /api/v1/auth/refresh with refresh token returns new access token
- ✅ POST /api/v1/auth/logout invalidates refresh token
- ✅ Cannot use blacklisted tokens
- ✅ Unit tests pass

**Dependencies:** US 1.1

---

### US 1.3: Frontend Auth Flow (16h) - Days 4-5

**Descrição:** Implementar login/logout no React com TypeScript

**Tarefas:**
```
DAY 4:
[ ] 1. Create LoginPage component with form
[ ] 2. Create useAuth custom hook
[ ] 3. Create AuthContext for global auth state
[ ] 4. Implement localStorage for token persistence
[ ] 5. Create axios instance with Authorization header

DAY 5:
[ ] 6. Create ProtectedRoute component (redirect if 401)
[ ] 7. Create axios interceptor for token refresh
[ ] 8. Implement logout functionality
[ ] 9. Write tests: useAuth hook tests
[ ] 10. Integration test: login → dashboard → logout flow
```

**Code Reference:** EXEMPLOS_IMPLEMENTACAO.md sections 2.1-2.4

**Acceptance Criteria:**
- ✅ LoginPage renders with email/password inputs
- ✅ Successful login: token saved, redirect to /dashboard
- ✅ Invalid login: error message displayed
- ✅ Protected routes redirect to /login if no token
- ✅ Token auto-refresh when 401 received
- ✅ Logout: token cleared, redirect to /login
- ✅ Unit test coverage: 80%+

**Dependencies:** US 1.1, US 1.2

---

### US 1.4: Input Validation (8h) - Days 6-7

**Descrição:** Implement validation to prevent SQL injection, XSS, etc

**Tarefas:**
```
DAY 6:
[ ] 1. Create LoginRequest DTO with @Valid annotations
[ ] 2. Create CreateAtletaRequest DTO with @Valid
[ ] 3. Add custom validators (email, password strength)
[ ] 4. Configure Spring validation globally
[ ] 5. Create ControllerAdvice for exception handling

DAY 7:
[ ] 6. Create validation error response format
[ ] 7. Write validation tests
[ ] 8. Test with invalid inputs: XSS, SQL injection attempts
[ ] 9. Document validation rules (API docs)
```

**Code Reference:** EXEMPLOS_IMPLEMENTACAO.md section 1.6

**Acceptance Criteria:**
- ✅ Email validation: must be valid format
- ✅ Password validation: min 8 chars, uppercase, number
- ✅ Name validation: 3-100 chars, no special chars
- ✅ All @Valid annotations applied
- ✅ Error messages are clear and helpful
- ✅ XSS attempts blocked (HTML escaped)
- ✅ SQL injection attempts blocked

**Dependencies:** US 1.1

---

### US 1.5: Rate Limiting (6h) - Day 8

**Descrição:** Implement request rate limiting with Bucket4j

**Tarefas:**
```
DAY 8:
[ ] 1. Add Bucket4j Maven dependency
[ ] 2. Create RateLimitConfig class
[ ] 3. Implement RateLimitInterceptor
[ ] 4. Configure limits: 100 req/min (anonymous), 1000 req/min (auth)
[ ] 5. Add rate limit headers to responses
[ ] 6. Write rate limit tests
[ ] 7. Verify with Postman: 429 after exceeding limit
```

**Code Reference:** EXEMPLOS_IMPLEMENTACAO.md section 1.5

**Acceptance Criteria:**
- ✅ 100 requests/minute for unauthenticated users
- ✅ 1000 requests/minute for authenticated users
- ✅ Returns 429 (Too Many Requests) when exceeded
- ✅ Headers show remaining quota (X-Rate-Limit-Remaining)
- ✅ /auth endpoints excluded from rate limiting
- ✅ Tests verify rate limit enforcement

**Dependencies:** US 1.1

---

### US 1.6: Multi-Tenancy Architecture ⭐ NOVO (20h) - Days 9-11

**Descrição:** Implementar isolamento de dados por tenant (schema-per-tenant)

**Tarefas:**
```
DAY 9 (Backend - Part 1):
[ ] 1. Add tenant_id and tenant_slug to JWT token structure
[ ] 2. Create TenantContext class (holds tenant_id, tenant_slug)
[ ] 3. Create TenantContextHolder (ThreadLocal storage)
[ ] 4. Create TenantResolver (extracts tenant from JWT)
[ ] 5. Create TenantInterceptor (stores tenant in ThreadLocal per request)

DAY 10 (Backend - Part 2):
[ ] 6. Create tb_tenant table migration (Flyway)
[ ] 7. Add tenant_id FK to all user-facing entities (tb_user, tb_atleta, etc)
[ ] 8. Create TenantAwareJpaRepository (filters by TenantContextHolder.getTenantId())
[ ] 9. Update all JpaRepository methods to use tenant filtering
[ ] 10. Write integration tests: verify cross-tenant isolation

DAY 11 (Frontend + Final):
[ ] 11. Update JwtProvider to include tenant_id/slug
[ ] 12. Update useAuth hook to provide tenant context
[ ] 13. Create TenantContext React component
[ ] 14. Add tenant_id to axios requests (header or body)
[ ] 15. Write end-to-end test: user A cannot access user B data
```

**Code Reference:** MULTI_TENANCY_ARCHITECTURE.md (complete), EXEMPLOS_IMPLEMENTACAO.md

**Key Components to Create:**

```java
// TenantContextHolder.java
public class TenantContextHolder {
    private static final ThreadLocal<TenantContext> TENANT_CONTEXT = new ThreadLocal<>();

    public static void setTenantContext(TenantContext context) {
        TENANT_CONTEXT.set(context);
    }

    public static Long getTenantId() {
        return getTenantContext().getTenantId();
    }

    public static void clear() {
        TENANT_CONTEXT.remove();
    }
}

// TenantInterceptor.java
@Component
public class TenantInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request,
                            HttpServletResponse response,
                            Object handler) throws Exception {
        TenantContext context = tenantResolver.resolveTenant();
        TenantContextHolder.setTenantContext(context);
        return true;
    }

    @Override
    public void afterCompletion(...) {
        TenantContextHolder.clear();
    }
}

// TenantAwareSpecification (for filtering)
public class TenantAwareSpecification<T> implements Specification<T> {
    @Override
    public Predicate toPredicate(Root<T> root, CriteriaQuery<?> query,
                                CriteriaBuilder cb) {
        return cb.equal(root.get("tenantId"),
                       TenantContextHolder.getTenantId());
    }
}
```

**Database Migration (Flyway):**
```sql
-- V1__Create_tenant_table.sql
CREATE TABLE tb_tenant (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE
);

-- V2__Add_tenant_id_to_entities.sql
ALTER TABLE tb_user ADD COLUMN tenant_id INTEGER NOT NULL REFERENCES tb_tenant(id);
ALTER TABLE tb_atleta ADD COLUMN tenant_id INTEGER NOT NULL REFERENCES tb_tenant(id);
CREATE INDEX idx_user_tenant ON tb_user(tenant_id);
CREATE INDEX idx_atleta_tenant ON tb_atleta(tenant_id);
```

**Acceptance Criteria:**
- ✅ JWT contains tenant_id and tenant_slug
- ✅ TenantResolver correctly extracts tenant from token
- ✅ TenantInterceptor sets context before each request
- ✅ All queries automatically filtered by TenantContextHolder.getTenantId()
- ✅ User A cannot access User B's data (403 if attempted)
- ✅ Database has proper FK constraints and indexes
- ✅ Integration test: cross-tenant isolation verified
- ✅ No data leakage between tenants

**Dependencies:** US 1.1 (JWT), US 1.2 (token refresh)

---

### US 1.7: Skills Framework (12-16h) - Days 12-13

**Descrição:** Criar entidade e serviço para skills (será usado em Sprint 2A para auto-detection)

**Tarefas:**
```
DAY 12:
[ ] 1. Create SkillCategory enum (FORCA, FRAQUEZA, LESAO, PREFERENCIA, DISPONIBILIDADE)
[ ] 2. Create SkillTaxonomy table with predefined skills (30+ skills)
[ ] 3. Create AtletaSkill entity with tenant_id, categoria, tipo, valor (0-100)
[ ] 4. Create AtletaSkillRepository with tenant filtering
[ ] 5. Create SkillService with CRUD operations

DAY 13:
[ ] 6. Create API endpoints: GET/POST athlete skills
[ ] 7. Create AtletaSkillResponse DTO
[ ] 8. Create SkillDetectionService (stub for Sprint 2A)
[ ] 9. Frontend: Create SkillForm component
[ ] 10. Write integration tests for skill CRUD
[ ] 11. Test: Create athlete with 3 skills, verify stored correctly
```

**Code Reference:** SKILLS_ARCHITECTURE.md, EXEMPLOS_IMPLEMENTACAO.md

**Key Entities:**

```java
// AtletaSkill.java
@Entity
@Table(name = "tb_atleta_skill")
public class AtletaSkill {
    @Id
    private Long id;
    private Long tenantId;
    private Long atletaId;

    @Enumerated(EnumType.STRING)
    private SkillCategory categoria;  // FORCA, FRAQUEZA, etc

    private String tipo;  // "subidas", "velocidade", etc
    private Integer valor;  // 0-100 (strength level)
    private Integer confianca;  // 0-100 (confidence level)

    @Enumerated(EnumType.STRING)
    private SkillSource fonte;  // USER_INPUT, IA_INFERENCE

    private LocalDateTime createdAt;
}

// SkillTaxonomy.java (static list of available skills)
@Entity
@Table(name = "tb_skill_taxonomy")
public class SkillTaxonomy {
    private Long id;
    private String tipo;  // "subidas", "velocidade", etc
    private SkillCategory categoria;
    private String descricao;
}
```

**Acceptance Criteria:**
- ✅ AtletaSkill entity has tenant_id isolation
- ✅ SkillTaxonomy populated with 30+ skills
- ✅ API: POST /api/v1/athletes/{id}/skills creates skill
- ✅ API: GET /api/v1/athletes/{id}/skills lists athlete skills
- ✅ Skills organized by category (FORCA, FRAQUEZA, etc)
- ✅ Confidence level tracked for each skill
- ✅ Frontend: User can add skills during onboarding
- ✅ Integration tests pass

**Dependencies:** US 1.1 (JWT), US 1.6 (Multi-tenancy)

---

### Testing & Documentation (8h) - Day 14

**Tarefas:**
```
DAY 14:
[ ] 1. Run full test suite: ./mvnw clean test
[ ] 2. Verify 80%+ code coverage
[ ] 3. Create API documentation (Swagger UI at /swagger-ui.html)
[ ] 4. Create local setup guide (README.md)
[ ] 5. Document database schema (ER diagram)
[ ] 6. Security review: JWT, validation, rate limiting
[ ] 7. Performance baseline: record API response times
[ ] 8. Final review: all acceptance criteria met
```

**Acceptance Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ 80%+ code coverage
- ✅ API docs complete and accurate
- ✅ No TODO comments in code
- ✅ No security warnings from dependency check
- ✅ Response times < 100ms for /login

---

## 📊 Daily Schedule (Recommended)

```
WEEK 1 (FEB 28 - MAR 07):
┌──────────────────────────────────────────────────────────────┐
│ MON 28 FEB:  US 1.1 part 1 (JWT Spring Security setup)      │
│ TUE 01 MAR:  US 1.1 part 2 (JWT tests + Login endpoint)     │
│ WED 02 MAR:  US 1.2 (Logout & Refresh)                      │
│ THU 03 MAR:  US 1.3 part 1 (Frontend auth setup)            │
│ FRI 04 MAR:  US 1.3 part 2 (ProtectedRoute + axios)         │
│ SAT/SUN:     Buffer, catch-up                               │
└──────────────────────────────────────────────────────────────┘
Cumulative: 54h (US 1.1-1.5 foundation complete)

WEEK 2 (MAR 07 - MAR 14):
┌──────────────────────────────────────────────────────────────┐
│ MON 07 MAR:  US 1.4 (Input validation)                       │
│ TUE 08 MAR:  US 1.5 (Rate limiting)                          │
│ WED 09 MAR:  US 1.6 part 1 (TenantContextHolder setup)      │
│ THU 10 MAR:  US 1.6 part 2 (Database migrations + queries)  │
│ FRI 11 MAR:  US 1.6 part 3 (Frontend + integration tests)   │
│ SAT/SUN:     Buffer, catch-up                               │
└──────────────────────────────────────────────────────────────┘
Cumulative: 72h (add US 1.4-1.6, multi-tenancy integrated)

WEEK 3 (MAR 14 - MAR 21):
┌──────────────────────────────────────────────────────────────┐
│ MON 14 MAR:  US 1.7 part 1 (Skills entity + repository)     │
│ TUE 15 MAR:  US 1.7 part 2 (Skills API + frontend form)    │
│ WED 16 MAR:  Testing & Documentation                        │
│ THU 17 MAR:  Buffer for fixing issues                       │
│ FRI 18 MAR:  Buffer + Final review                          │
│ SAT 19 MAR:  Buffer                                         │
│ SUN 20 MAR:  Final checks before presentation               │
│ MON 21 MAR:  MVP 1.0 READY (Auth + Multi-tenancy + Skills) │
└──────────────────────────────────────────────────────────────┘
Cumulative: 84-96h (complete Sprint 1)
```

---

## 🏗️ Project Setup

### Prerequisites
```bash
# Java 17+
java -version

# Maven 3.8+
mvn -version

# PostgreSQL 13+
psql --version

# Node 18+ (for frontend)
node --version
```

### Backend Setup
```bash
# 1. Clone project
git clone <repo-url>
cd menthoros-backend

# 2. Create database
createdb menthoros_dev

# 3. Configure application.properties
cp application.properties.example application.properties
# Edit: DB credentials, JWT secret, etc.

# 4. Run migrations
./mvnw clean migrate

# 5. Start application
./mvnw spring-boot:run
```

### Frontend Setup
```bash
# 1. Navigate to frontend
cd ../menthoros-frontend

# 2. Install dependencies
npm install

# 3. Configure .env
cp .env.example .env
# Edit: API_URL, etc.

# 4. Start dev server
npm start
```

---

## 🔐 Security Checklist

- [ ] JWT secret is strong (min 32 chars, random)
- [ ] Passwords hashed with bcrypt (min 10 rounds)
- [ ] HTTPS enforced in production
- [ ] CORS properly configured (only frontend domain)
- [ ] SQL injection tested (parameterized queries)
- [ ] XSS tested (HTML escaping)
- [ ] CSRF token used (if needed)
- [ ] Rate limiting prevents brute force
- [ ] Multi-tenancy isolation tested
- [ ] No sensitive data in logs

---

## 📈 Success Metrics

By end of Sprint 1:

| Métrica | Target | Status |
|---------|--------|--------|
| JWT auth working | 100% | ⏳ |
| Rate limiting active | 100% | ⏳ |
| Input validation | 100% | ⏳ |
| Multi-tenancy isolated | 100% | ⏳ |
| Skills entity ready | 100% | ⏳ |
| Test coverage | 80%+ | ⏳ |
| Code quality (SonarQube) | Grade A | ⏳ |
| API response time | <100ms | ⏳ |

---

## 🚨 Risk Management

| Riscos | Probabilidade | Impacto | Mitigação |
|--------|---------------|---------|-----------|
| JWT complexity | Médio | Alto | Use standard libraries, pair programming |
| Multi-tenancy bugs | Alto | Crítico | Extensive integration tests, code review |
| DB migration issues | Baixo | Médio | Test migrations locally first, rollback plan |
| Performance regression | Baixo | Médio | Load testing before Sprint 2 |

---

## 📞 Support & Reference

**Key Documents:**
- MULTI_TENANCY_ARCHITECTURE.md - Full multi-tenancy design
- SKILLS_ARCHITECTURE.md - Skills framework design
- EXEMPLOS_IMPLEMENTACAO.md - Ready-to-use code snippets
- API_DOCUMENTATION.md - API endpoint reference

**External References:**
- Spring Security: https://spring.io/projects/spring-security
- JWT: https://jwt.io/
- PostgreSQL Docs: https://www.postgresql.org/docs/
- React Hooks: https://react.dev/reference/react

---

## ✅ Definition of Done

User Story is DONE when:
- ✅ All acceptance criteria met
- ✅ Unit tests pass (80%+ coverage)
- ✅ Integration tests pass
- ✅ Code reviewed (pull request approved)
- ✅ Documentation updated
- ✅ No technical debt added
- ✅ Verified on local machine
- ✅ Merged to main branch

---

## 🎯 Next Steps After Sprint 1

1. **Day 22 (MAR 22):** Sprint 2A Planning
   - Review REORGANIZACAO_TIMELINE.md
   - Review INTEGRACAO_DADOS_TREINO.md (Strava/Garmin integration)
   - Plan Strava OAuth flow implementation

2. **Day 23 (MAR 23):** Sprint 2A Kickoff
   - Start Strava integration work
   - Begin skills auto-detection service

---

## 💬 Questions?

If blocked during Sprint 1:
1. Check EXEMPLOS_IMPLEMENTACAO.md for code reference
2. Review MULTI_TENANCY_ARCHITECTURE.md for multi-tenancy questions
3. Run existing tests to verify understanding
4. Document blocker and move to next task if needed

**You've got this!** 🚀
