# Roadmap de Implementação - Menthoros

**Documento de Planejamento de Melhorias de Arquitetura**

---

## 📊 Dashboard de Prioridades

### Críticos (🔴 This Week)

```
├── 🔴 SEGURANÇA
│   ├── Implementar JWT/OAuth2 (Semana 1-2)
│   ├── Rate Limiting com Bucket4j (Semana 1)
│   └── Validação de Entrada com @Valid (Semana 1)
│
└── 🔴 PERFORMANCE
    ├── Paginação em Listagens (Semana 2)
    └── Otimização N+1 Queries (Semana 2)
```

**Tempo Estimado:** 2-3 semanas
**Impacto:** Bloqueia deploy em produção

---

### Altos (🟠 Next 2 Weeks)

```
├── 🟠 BACKEND
│   ├── Índices de Banco de Dados
│   ├── Logging Estruturado (SLF4J + JSON)
│   ├── Testes Unitários (80% coverage)
│   ├── Retry/Circuit Breaker (Resilience4j)
│   └── Versionamento API (/api/v1/)
│
├── 🟠 FRONTEND
│   ├── Lazy Loading de Rotas
│   ├── Error Boundaries
│   ├── Validação de Formulários (Zod)
│   └── Testes com Vitest
│
└── 🟠 INFRA
    ├── CORS Restritivo
    └── Correlation IDs
```

**Tempo Estimado:** 2-3 semanas
**Impacto:** Melhora escalabilidade e manutenibilidade

---

### Médios (🟡 Month 2)

```
├── 🟡 Backend
│   ├── Cache Distribuído (Redis)
│   ├── Auditoria em Entities (@CreationTimestamp)
│   └── Testes de Integração
│
├── 🟡 Frontend
│   ├── Memoização (React.memo, useMemo)
│   ├── Sanitização HTML (DOMPurify)
│   └── Storybook para componentes
│
└── 🟡 Infra
    ├── Monitoring (Prometheus + Grafana)
    └── CSRF Protection
```

**Tempo Estimado:** 1-2 semanas
**Impacto:** Melhora qualidade e observabilidade

---

## 📅 Timeline Detalhada

### SEMANA 1: Segurança Base

#### Dia 1-2: Autenticação JWT

**Backend:**
```bash
# Adicionar dependências
# src/main/java/com/menthoros/config/SecurityConfig.java
# src/main/java/com/menthoros/api/controller/AuthController.java
# src/main/java/com/menthoros/application/service/AuthService.java

# Novos arquivos:
- JwtProvider.java (geração de tokens)
- JwtAuthenticationFilter.java (validação)
- AuthRequest.java (DTO)
- AuthResponse.java (DTO)
```

**Checklist:**
- [ ] Spring Security configuration
- [ ] JWT token generation
- [ ] Token validation filter
- [ ] /auth/login endpoint
- [ ] /auth/refresh endpoint
- [ ] Logout logic

**Frontend:**
```bash
# src/hooks/useAuth.ts (refatorar)
# src/api/config.ts (adicionar Authorization header)
# src/context/AuthContext.tsx (expandir)
# src/pages/login/LoginPage.tsx (criar)
```

---

#### Dia 3: Rate Limiting

**Backend:**
```bash
# pom.xml - adicionar Bucket4j
# src/main/java/com/menthoros/config/RateLimitConfig.java
# src/main/java/com/menthoros/infrastructure/config/RateLimitingInterceptor.java
```

**Configuração:**
```properties
rate-limit:
  enabled: true
  requests-per-minute: 100
  burst-size: 10
```

---

#### Dia 4-5: Validação de Entrada

**Backend:**
```bash
# Adicionar @Valid em todos os controllers
# Criar custom validators se necessário

# Exemplo:
@PostMapping("/atleta")
public ResponseEntity<AtletaResponse> create(
    @Valid @RequestBody CreateAtletaRequest request
) { ... }
```

**Frontend:**
```bash
# src/utils/validation.ts
# Adicionar validação Zod em formulários
```

---

### SEMANA 2: Performance

#### Dia 1-2: Paginação

**Backend:**
```bash
# Refatorar todos os @GetMapping de listagem

# Antes:
List<AtletaResponse> listAll()

# Depois:
Page<AtletaResponse> listAll(
    @PageableDefault(size = 20) Pageable pageable
)
```

**Frontend:**
```bash
# Adicionar Pagination component
# Refatorar useAtletas hook para suportar paginação
```

**Testes:**
```bash
# Validar que endpoints retornam Page<T>
# Validar totalElements, hasNext, etc
```

---

#### Dia 3-5: Otimização de Queries

**Audit com P6Spy:**
```bash
# Identificar N+1 queries
# Adicionar @Query com FETCH JOIN
# Criar teste para validação
```

**Exemplo:**
```java
@Query("SELECT DISTINCT p FROM PlanoSemanal p " +
       "LEFT JOIN FETCH p.treinosPlanejados t " +
       "LEFT JOIN FETCH t.etapas " +
       "WHERE p.atleta.id = :atletaId")
List<PlanoSemanal> findByAtletaIdOptimized(@Param("atletaId") Long id);
```

---

### SEMANA 3: Qualidade

#### Dia 1-2: Testes Unitários

**Backend:**
```bash
# Tests por service:
- AtletaServiceTest
- PlanoServiceTest
- IaServiceTest
- TreinoServiceTest

# Target: 80% coverage
```

**Frontend:**
```bash
# Setup Vitest
# Tests por hook:
- useAtletas.test.ts
- useCrud.test.ts
- usePlanoSemanal.test.ts
```

---

#### Dia 3-4: Logging & Monitoring

**Backend:**
```bash
# src/main/resources/logback-spring.xml
# src/main/java/com/menthoros/infrastructure/logging/RequestIdFilter.java

# Adicionar correlation IDs:
RequestIdFilter → MDC → JSON Logs
```

**Exemplo JSON Log:**
```json
{
  "timestamp": "2026-02-28T10:30:00Z",
  "level": "INFO",
  "requestId": "abc-123-def",
  "message": "Plano gerado com sucesso",
  "athlete": "João",
  "duration_ms": 1250
}
```

---

#### Dia 5: Documentação & Versionamento

**Backend:**
```bash
# Refatorar paths para /api/v1/
# Adicionar @ApiVersion
# Gerar OpenAPI v3.1
```

---

## 🛠️ Tarefas Detalhadas por Componente

### BACKEND - Security

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Spring Security Config | 🔴 | 4h | Backend | ⏳ |
| JWT Token Provider | 🔴 | 4h | Backend | ⏳ |
| Auth Controller | 🔴 | 3h | Backend | ⏳ |
| Auth Service | 🔴 | 3h | Backend | ⏳ |
| Token Filter | 🔴 | 3h | Backend | ⏳ |
| Rate Limiting Setup | 🔴 | 3h | Backend | ⏳ |
| Input Validation (@Valid) | 🔴 | 4h | Backend | ⏳ |
| CORS Configuration | 🟠 | 2h | Backend | ⏳ |
| Password Encryption | 🔴 | 2h | Backend | ⏳ |

---

### BACKEND - Performance

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Add Pagination | 🔴 | 6h | Backend | ⏳ |
| N+1 Query Analysis | 🔴 | 4h | Backend | ⏳ |
| Add Fetch Joins | 🔴 | 6h | Backend | ⏳ |
| Create DB Indexes | 🔴 | 3h | Backend | ⏳ |
| Setup P6Spy | 🔴 | 2h | Backend | ⏳ |
| Redis Cache Setup | 🟠 | 6h | DevOps | ⏳ |
| Cache Invalidation | 🟠 | 4h | Backend | ⏳ |

---

### BACKEND - Quality

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Unit Tests Setup | 🟠 | 4h | QA | ⏳ |
| Service Tests (80%) | 🟠 | 16h | Backend | ⏳ |
| Integration Tests | 🟠 | 12h | QA | ⏳ |
| Logging Setup (JSON) | 🟠 | 4h | DevOps | ⏳ |
| Correlation IDs | 🟠 | 3h | Backend | ⏳ |
| API Versioning | 🟠 | 3h | Backend | ⏳ |
| Retry/Circuit Breaker | 🟠 | 6h | Backend | ⏳ |
| Entity Audit Fields | 🟠 | 4h | Backend | ⏳ |

---

### FRONTEND - Architecture

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Lazy Load Routes | 🟠 | 4h | Frontend | ⏳ |
| Error Boundaries | 🟠 | 4h | Frontend | ⏳ |
| Auth Context Refactor | 🔴 | 4h | Frontend | ⏳ |
| ProtectedRoute Component | 🔴 | 3h | Frontend | ⏳ |
| Login Page | 🔴 | 6h | Frontend | ⏳ |

---

### FRONTEND - Quality

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Setup Vitest | 🟠 | 3h | QA | ⏳ |
| Vitest Config | 🟠 | 2h | QA | ⏳ |
| Hook Tests (80%) | 🟠 | 12h | Frontend | ⏳ |
| Component Tests | 🟠 | 8h | Frontend | ⏳ |
| Form Validation (Zod) | 🟠 | 6h | Frontend | ⏳ |
| DOMPurify Integration | 🟠 | 2h | Frontend | ⏳ |
| Setup Storybook | 🟡 | 4h | Frontend | ⏳ |

---

### FRONTEND - Performance

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Add React.memo | 🟡 | 4h | Frontend | ⏳ |
| Add useMemo/useCallback | 🟡 | 4h | Frontend | ⏳ |
| Virtual Scrolling | 🟡 | 4h | Frontend | ⏳ |
| Code Splitting Analysis | 🟡 | 2h | Frontend | ⏳ |
| Performance Profiling | 🟡 | 3h | Frontend | ⏳ |

---

## 📋 Dependências Entre Tarefas

```
┌─────────────────────────────────────────────┐
│ SPRINT 1: SEGURANÇA (Semana 1-2)            │
├─────────────────────────────────────────────┤
│ ├── Spring Security Config (bloqueante)     │
│ ├── JWT Token Provider (depends on ^)       │
│ ├── Auth Controller (depends on ^)          │
│ └── Token Filter (depends on Spring Sec)    │
│                                             │
│ ├── (em paralelo) Rate Limiting             │
│ ├── (em paralelo) Input Validation          │
│ ├── (em paralelo) CORS Config               │
│                                             │
│ ├── (frontend paralelo) Auth Context        │
│ └── (frontend paralelo) Login Page          │
└─────────────────────────────────────────────┘
        ↓ (depois de passarem)
┌─────────────────────────────────────────────┐
│ SPRINT 2: PERFORMANCE (Semana 2-3)          │
├─────────────────────────────────────────────┤
│ ├── N+1 Query Analysis                      │
│ ├── Add Pagination (depends on analysis)    │
│ ├── Add Fetch Joins (depends on analysis)   │
│ └── Create DB Indexes                       │
│                                             │
│ ├── (paralelo) Redis Setup                  │
│ └── (paralelo) Cache Invalidation           │
└─────────────────────────────────────────────┘
```

---

## 📊 Matriz RACI

| Tarefa | Backend Dev | Frontend Dev | QA | DevOps | Product |
|--------|------------|--------------|-----|--------|---------|
| Auth Implementation | **R** | **I** | **C** | - | **A** |
| API Tests | **R** | - | **C** | - | **I** |
| Pagination | **R** | **I** | **C** | - | - |
| Performance Audit | **R** | **R** | **C** | - | - |
| Infrastructure | - | - | - | **R** | - |
| Documentation | **R** | **R** | - | - | **C** |

**R** = Responsible (executa)
**A** = Accountable (aprova)
**C** = Consulted (consultado)
**I** = Informed (informado)

---

## ✅ Definição de Pronto (Definition of Done)

### Para cada tarefa:

- [ ] Código escrito seguindo padrões do projeto
- [ ] Testes escritos e passando (80% coverage mínimo)
- [ ] Documentação atualizada
- [ ] Code review aprovado (2+ reviewers)
- [ ] CI/CD pipeline passando
- [ ] SonarQube/Linting OK
- [ ] Performance benchmark (se aplicável)
- [ ] Merged para develop

---

## 🎯 Indicadores de Progresso

### KPIs por Sprint

```
SPRINT 1 (Semana 1-2):
├── ✅ 0 vulnerabilidades críticas
├── ✅ 100% endpoints autenticados
├── ✅ Rate limiting ativo
├── ✅ Code coverage: ≥60%
└── ✅ SonarQube: A grade

SPRINT 2 (Semana 3-4):
├── ✅ 100% endpoints com paginação
├── ✅ 0 N+1 queries em produção
├── ✅ Response time p95: <200ms
├── ✅ Code coverage: ≥75%
└── ✅ 0 unhandled exceptions/dia

SPRINT 3 (Semana 5-6):
├── ✅ Code coverage: ≥80%
├── ✅ Logging estruturado 100%
├── ✅ Testes de integração: 100% críticos
├── ✅ LightHouse score: ≥80
└── ✅ API v1 deployed
```

---

## 🔄 Revisão de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Regressão de segurança | Média | Alto | Code review duplo + testes |
| Performance degradação | Média | Alto | Benchmark antes/depois |
| Incompatibilidade JWT | Baixa | Alto | Testes E2E em staging |
| DB migration issues | Baixa | Alto | Rollback plan + backup |
| Frontend breaking changes | Média | Médio | Versionamento de API |

---

## 💼 Comunicação & Stakeholders

### Weekly Sync (Segundas 10am)

```markdown
## Status Report - Sprint X

### Completed
- [ ] Task 1
- [ ] Task 2

### In Progress
- [ ] Task 3
- [ ] Task 4

### Blockers
- Issue X (Owner: @person)

### Next Week Plan
- Task Y
- Task Z
```

### Risk Register

```
NOVO - Redis migration
├── Probabilidade: Média
├── Impacto: Alto
├── Mitigação: POC de 1 dia antes de full rollout
└── Owner: DevOps
```

---

## 📚 Recursos & Referências

### Documentação

- [Spring Security 6 Documentation](https://spring.io/projects/spring-security)
- [Resilience4j Guide](https://resilience4j.readme.io/)
- [React Hook Forms](https://react-hook-form.com/)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)

### Exemplos de Código

Todos os exemplos mencionados neste documento podem ser encontrados em:
- Backend: `docs/examples/backend/`
- Frontend: `docs/examples/frontend/`
- Database: `docs/examples/database/`

### Tools & Services

- SonarQube: (URL será configurada)
- Sentry: (URL será configurada)
- Datadog/NewRelic: (será decidido)

---

## 📝 Notas

- Documento vivo - atualizar semana a semana
- Ajustar prioridades conforme feedback do mercado
- Testes são bloqueantes para merge
- Code review obrigatório antes de qualquer merge

---

**Próxima Revisão:** 7 de março de 2026
**Responsável:** Arquitetura / Tech Lead
