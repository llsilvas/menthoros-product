# Roadmap de Implementação - Menthoros

**Documento de Planejamento de Melhorias de Arquitetura**

---

## 📊 Dashboard de Prioridades

### Críticos (🔴 This Week)

```
├── 🔴 PAGAMENTO & RECORRÊNCIA (NOVO)
│   ├── Sistema de Assinaturas Multi-tenant (Semana 1-2)
│   ├── Avisos Automáticos de Vencimento (Semana 1)
│   ├── Ciclos de Faturamento e Auditoria (Semana 2)
│   ├── Jobs Agendados (auto-renovação, expiry) (Semana 2)
│   └── Testes de Isolamento Multi-tenant (Semana 2)
│
├── 🔴 SEGURANÇA
│   ├── Implementar JWT/OAuth2 (Semana 1-2)
│   ├── Rate Limiting com Bucket4j (Semana 1)
│   └── Validação de Entrada com @Valid (Semana 1)
│
└── 🔴 PERFORMANCE
    ├── Paginação em Listagens (Semana 2)
    └── Otimização N+1 Queries (Semana 2)
```

**Tempo Estimado:** 3-4 semanas
**Impacto:** Habilita modelo de faturamento do Menthoros; bloqueia deploy em produção

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

### SEMANA 0 (NOVA): Payment Control System - Preparação

#### Dia 1-2: Setup de Migration e Entities

**Backend:**
```bash
# Criar migration V46 (Flyway)
src/main/resources/db/migration/V46__subscription_payment_control.sql

# Criar JPA Entities
src/main/java/br/com/menthoros/backend/domain/entity/
├── SubscriptionPlan.java
├── StudentSubscription.java
├── BillingCycle.java
├── SubscriptionEvent.java
└── PaymentNotification.java

# Criar Repositories
src/main/java/br/com/menthoros/backend/domain/repository/
├── SubscriptionPlanRepository.java
├── StudentSubscriptionRepository.java
├── BillingCycleRepository.java
├── SubscriptionEventRepository.java
└── PaymentNotificationRepository.java
```

**Checklist:**
- [ ] Migration V46 com 5 tabelas principais
- [ ] Índices compostos (tenant_id + coluna)
- [ ] @Entity com @Table, @Column e validações
- [ ] Repositories com findByTenantId* methods
- [ ] Testes de isolamento tenant

---

#### Dia 3-5: DTOs, Mappers e Services Base

**Backend:**
```bash
# DTOs (Contratos)
src/main/java/br/com/menthoros/backend/api/dto/
├── SubscriptionPlanDto.java
├── CreateSubscriptionPlanDto.java
├── StudentSubscriptionDto.java
├── BillingCycleDto.java
└── PaymentNotificationDto.java

# Mappers
src/main/java/br/com/menthoros/backend/api/mapper/
├── SubscriptionPlanMapper.java
├── StudentSubscriptionMapper.java
├── BillingCycleMapper.java
├── SubscriptionEventMapper.java
└── PaymentNotificationMapper.java

# Services (implementação base)
src/main/java/br/com/menthoros/backend/service/
├── SubscriptionPlanService.java
├── StudentSubscriptionService.java
├── BillingCycleService.java
├── PaymentNotificationService.java
├── SubscriptionEventService.java
└── PaymentNotificationDispatcher.java
```

**Regras de Negócio:**
- Validações de tenant_id em todo service
- Soft delete em planos (archived_at)
- Estado de assinatura: ACTIVE, PAUSED, CANCELLED, EXPIRED
- Geração automática de BillingCycle ao criar subscription

---

### SEMANA 1: Segurança Base + Payment API

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

### BACKEND - Payment Control System (NOVO)

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| Migration V46 (5 tabelas) | 🔴 | 3h | Backend | ⏳ |
| JPA Entities (subscription) | 🔴 | 5h | Backend | ⏳ |
| Repositories com tenant_id | 🔴 | 4h | Backend | ⏳ |
| DTOs e Mappers | 🔴 | 5h | Backend | ⏳ |
| SubscriptionPlanService | 🔴 | 4h | Backend | ⏳ |
| StudentSubscriptionService | 🔴 | 6h | Backend | ⏳ |
| BillingCycleService | 🔴 | 4h | Backend | ⏳ |
| PaymentNotificationService | 🔴 | 5h | Backend | ⏳ |
| SubscriptionEventService | 🔴 | 3h | Backend | ⏳ |
| SubscriptionPlanController | 🔴 | 4h | Backend | ⏳ |
| StudentSubscriptionController | 🔴 | 6h | Backend | ⏳ |
| BillingCycleController | 🔴 | 3h | Backend | ⏳ |
| PaymentNotificationController | 🔴 | 3h | Backend | ⏳ |
| Exception Handlers (novos) | 🔴 | 2h | Backend | ⏳ |
| Unit Tests (Services) | 🔴 | 12h | QA | ⏳ |
| Integration Tests (fluxos) | 🔴 | 8h | QA | ⏳ |
| Multi-tenant isolation tests | 🔴 | 6h | QA | ⏳ |

---

### BACKEND - Payment Automation (NOVO)

| Tarefa | Prioridade | Esforço | Owner | Status |
|--------|-----------|--------|-------|--------|
| PaymentNotificationScheduler (02:00) | 🔴 | 4h | Backend | ⏳ |
| SubscriptionAutoRenewalScheduler (03:00) | 🔴 | 5h | Backend | ⏳ |
| OverdueSubscriptionChecker (04:00) | 🔴 | 4h | Backend | ⏳ |
| PaymentNotificationDispatcher (15min) | 🔴 | 5h | Backend | ⏳ |
| Job error handling & retry | 🔴 | 3h | Backend | ⏳ |
| Job monitoring & alerting | 🟠 | 4h | DevOps | ⏳ |
| Testes de scheduler | 🔴 | 8h | QA | ⏳ |

---

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
┌──────────────────────────────────────────────────┐
│ SPRINT 0: PAYMENT CONTROL (Semana 0 - Setup)    │
├──────────────────────────────────────────────────┤
│ ├── Migration V46 (bloqueante)                   │
│ ├── JPA Entities (depends on V46)                │
│ ├── Repositories (depends on Entities)           │
│ └── DTOs/Mappers (paralelo)                      │
│                                                  │
│ ├── (depois) Services base (depends on Repos)    │
│ ├── (depois) Controllers (depends on Services)   │
│ └── (depois) Testes (depends on todos acima)     │
└──────────────────────────────────────────────────┘
        ↓ (depois de testes passarem)
┌──────────────────────────────────────────────────┐
│ SPRINT 0B: PAYMENT AUTOMATION (Semana 1)         │
├──────────────────────────────────────────────────┤
│ ├── PaymentNotificationScheduler                 │
│ ├── SubscriptionAutoRenewalScheduler             │
│ ├── OverdueSubscriptionChecker                   │
│ ├── PaymentNotificationDispatcher                │
│ └── (todos dependem de Services do SPRINT 0)     │
│                                                  │
│ ├── (paralelo) Testes de scheduler               │
│ └── (paralelo) Monitoring & Alerting             │
└──────────────────────────────────────────────────┘
        ↓ (paralelo com SPRINT 1 Security)
┌──────────────────────────────────────────────────┐
│ SPRINT 1: SEGURANÇA (Semana 1-2)                 │
├──────────────────────────────────────────────────┤
│ ├── Spring Security Config (bloqueante)          │
│ ├── JWT Token Provider (depends on ^)            │
│ ├── Auth Controller (depends on ^)               │
│ └── Token Filter (depends on Spring Sec)         │
│                                                  │
│ ├── (em paralelo) Rate Limiting                  │
│ ├── (em paralelo) Input Validation               │
│ ├── (em paralelo) CORS Config                    │
│                                                  │
│ ├── (frontend paralelo) Auth Context             │
│ └── (frontend paralelo) Login Page               │
└──────────────────────────────────────────────────┘
        ↓ (depois de passarem)
┌──────────────────────────────────────────────────┐
│ SPRINT 2: PERFORMANCE (Semana 2-3)               │
├──────────────────────────────────────────────────┤
│ ├── N+1 Query Analysis                           │
│ ├── Add Pagination (depends on analysis)         │
│ ├── Add Fetch Joins (depends on analysis)        │
│ └── Create DB Indexes                            │
│                                                  │
│ ├── (paralelo) Redis Setup                       │
│ └── (paralelo) Cache Invalidation                │
└──────────────────────────────────────────────────┘
```

**Nota:** Payment Control pode rodar em paralelo com Security (SPRINT 1) desde que ambos respeitem multi-tenancy e sejam integrados no mesmo TenantContext.

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
- [ ] Documentação atualizada (incluindo CLAUDE.md se novo módulo)
- [ ] Code review aprovado (2+ reviewers)
- [ ] CI/CD pipeline passando
- [ ] SonarQube/Linting OK
- [ ] Performance benchmark (se aplicável)
- [ ] Multi-tenant isolation validado (para features de payment/billing)
- [ ] Migration Flyway testada em staging
- [ ] Merged para develop

### Para Payment Control System específico:

- [ ] Testes de isolamento multi-tenant obrigatórios
- [ ] Nenhuma query sem filtro tenant_id
- [ ] Auditoria de eventos completa
- [ ] Jobs agendados validados (cron expressions corretas)
- [ ] Notificações testadas (templates renderizados)
- [ ] Soft deletes de planos validados (não deleta registros em uso)

---

## 🎯 Indicadores de Progresso

### KPIs por Sprint

```
SPRINT 0 (Semana 0 - Setup):
├── ✅ Migration V46 sem erros em staging
├── ✅ 0 queries sem tenant_id filtering
├── ✅ Entities criadas com validações
├── ✅ Repositories com findByTenantId*
├── ✅ Code coverage: ≥70% (payment module)
└── ✅ Multi-tenant isolation: 100%

SPRINT 0B (Semana 1 - Automação):
├── ✅ 4 jobs agendados funcionando
├── ✅ 100% notificações completadas/failed
├── ✅ Auto-renovation testado (3 ciclos)
├── ✅ Expiry detection sem false positives
├── ✅ Code coverage: ≥75%
└── ✅ 0 missing billing cycles

SPRINT 1 (Semana 1-2) - Paralelo com 0B:
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
├── ✅ API v1 deployed
└── ✅ Payment dashboard em produção
```

### Métricas de Negócio (Payment)

```
Após SPRINT 0B:
├── Taxa de cobrança: N/A (sem processamento ainda)
├── Avisos entregues no prazo: ≥99%
├── Assinaturas ativas rastreáveis: 100%
├── Tempo de renovação automática: <5min
└── Acurácia de expiry detection: 100%
```

---

## 🔄 Revisão de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Vazamento cross-tenant em pagamentos** | Baixa | **Crítico** | Validações rigorosas em repos, testes isolamento |
| Regressão de segurança | Média | Alto | Code review duplo + testes |
| Performance degradação | Média | Alto | Benchmark antes/depois |
| Incompatibilidade JWT | Baixa | Alto | Testes E2E em staging |
| DB migration issues | Baixa | Alto | Rollback plan + backup |
| Frontend breaking changes | Média | Médio | Versionamento de API |
| **Jobs agendados não disparam** | Média | Alto | Testes unitários + monitoring com alertas |
| **Notificações não chegam** | Média | Médio | Fallback email + retry automático |
| **Ciclos duplicados de billing** | Baixa | Alto | Unique constraints + transações |
| **Integridade de assinatura comprometida** | Baixa | Alto | Tests de cascata (soft delete de planos) |

### Mitigação Específica: Payment Control

```
1. Isolamento Multi-tenant:
   - TODO query passa por findByTenantId*
   - @RequireTenant em 100% dos endpoints
   - Code review focado em tenant_id

2. Jobs Agendados:
   - Execução testada isoladamente
   - Logs detalhados com @Slf4j
   - Alertas se job não completar
   - Retry automático com exponential backoff

3. Notificações:
   - Template renderização testada
   - Fallback a email se SMS/push falha
   - Histórico completo em DB

4. Integridade de Dados:
   - Soft delete de planos (never delete if subscriptions exist)
   - FK constraints com CASCADE/RESTRICT
   - Tests de cascata (delete plan → subscriptions)
```

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

### Documentação - Payment Control System (NOVO)

- **PAYMENT_CONTROL_PLAN.md** - Plano técnico completo (51 seções)
  - Modelo de dados detalhado (5 tabelas)
  - DTOs e contratos de API
  - Serviços e regras de negócio
  - Controllers (24 endpoints)
  - Jobs agendados e notificações
  - Roadmap de 4 fases
  
- **PAYMENT_ARCHITECTURE_DIAGRAM.md** - Diagramas e visualizações
  - Arquitetura em 4 camadas
  - Fluxos (criação, avisos, cancelamento, renovação)
  - Modelo E-R completo
  - State diagram de assinaturas
  - Checklist de implementação

### Documentação - Geral

- [Spring Security 6 Documentation](https://spring.io/projects/spring-security)
- [Resilience4j Guide](https://resilience4j.readme.io/)
- [React Hook Forms](https://react-hook-form.com/)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
- [Spring Scheduled Tasks](https://spring.io/guides/gs/scheduling-tasks/)

### Exemplos de Código

Todos os exemplos mencionados neste documento podem ser encontrados em:
- Backend: `docs/examples/backend/`
- Frontend: `docs/examples/frontend/`
- Database: `docs/examples/database/`
- Payment: (será criado durante Sprint 0)

### Tools & Services

- SonarQube: (URL será configurada)
- Sentry: (URL será configurada)
- Datadog/NewRelic: (será decidido)
- Prometheus + Grafana: (para monitoring de jobs)

---

## 📝 Notas

- Documento vivo - atualizar semana a semana
- Ajustar prioridades conforme feedback do mercado
- Testes são bloqueantes para merge
- Code review obrigatório antes de qualquer merge
- **NOVO:** Payment Control System é crítico para monetização
- **NOVO:** SPRINT 0 e 0B podem rodar em paralelo com SPRINT 1 Security
- **NOVO:** Isolamento multi-tenant é obrigatório em Payment (não é opcional)

### Payment Control - Próximos Passos

1. ✅ Documentação técnica completa (DONE)
2. → Revisar com time de engenharia e aprovação de arquitetura
3. → Criar branch para SPRINT 0
4. → Começar por Migration V46 e Entities
5. → Implementar Services em paralelo
6. → Adicionar Controllers e testes
7. → Deploy para staging com jobs ativados
8. → Validação com coach real (UAT)

---

**Última Atualização:** 21 de setembro de 2026 - Inclusão de Payment Control System
**Próxima Revisão:** 28 de setembro de 2026
**Responsável:** Arquitetura / Tech Lead

---

## 📊 Status Geral do Roadmap

| Sprint | Feature | Status | Owner |
|--------|---------|--------|-------|
| 0 | Payment Control - Setup | 📋 Planejado | Backend |
| 0B | Payment Control - Automação | 📋 Planejado | Backend |
| 1 | Security & Auth | ⏳ Próximo | Backend/Frontend |
| 2 | Performance & Optimization | 📅 Agendado | Backend |
| 3 | Quality & Monitoring | 📅 Agendado | QA/DevOps |
