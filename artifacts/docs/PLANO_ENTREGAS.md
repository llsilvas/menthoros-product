# Plano de Entregas - Menthoros

**Documento Executivo de Sprints e Releases**
**Data:** 28 de fevereiro de 2026
**Horizonte:** 18 semanas até MVP 2.2 Público

---

## 🎯 Overview das Entregas - NOVO (COM PRIORIZAÇÃO 2B→2A)

```
RELEASE 1.0 (MVP 2.0 COM FUNDAÇÃO)        [FEV 28 - MAR 21]  3 SEMANAS
├── Sprint 1: Auth + Multi-tenancy + Skills [FEV 28 - MAR 21] 3 semanas
│   └── Milestone: MVP 1.0 ready (Auth + Multi-tenant foundation) ✅
└── Focus: Segurança desde dia 1, não refator depois

RELEASE 1.1 (MVP 2.1 BETA COM INTEGRAÇÕES) [MAR 21 - MAI 28] 9 SEMANAS
├── Sprint 2A: **Integrações + Skills Detection** ⭐ PRIORIZADO
│   [MAR 21 - ABR 30] 6 semanas
│   └── Strava + Garmin OAuth + Webhooks + Skills Auto-detect
│
├── Sprint 2B: Performance Optimization     [ABR 30 - MAI 14] 2 semanas
│   └── Pagination + N+1 + Database Indexes
│
├── Sprint 3: Testing + Billing             [MAI 14 - MAI 28] 2 semanas
│   └── Unit/Integration Tests + Stripe Integration
│   └── Milestone: MVP 1.1 (BETA Launch 28 MAI) ✅
└── Focus: Dados automáticos + Skills inteligentes

RELEASE 2.0 (MVP 2.2 PÚBLICO)              [MAI 28 - JUL 31] 9 SEMANAS
├── Sprint 4: Launch Prep                   [MAI 28 - JUN 15] 3 semanas
│   └── Marketing Website + Analytics + Referral
│
├── Sprint 5: Public Prep Final             [JUN 15 - JUL 01] 2.5 semanas
│   └── Final optimizations + monitoring
│
├── Sprint 6: Buffer & Go-Live              [JUL 01 - JUL 31] 4 semanas
│   └── Milestone: MVP 2.0 (PUBLIC Launch 31 JUL) ✅
└── Focus: Escala + Referral + Marketing

SCALING (V3.0+)                            [AGO 01 - DEZ 31] 20+ SEMANAS
├── Mobile App Development
├── Advanced Features
├── Community Platform
└── Continuous Improvement

═════════════════════════════════════════════════════════════════════════════
KEY TIMELINE CHANGES:
• Sprint 2A (Integrações) MOVED EARLIER (MAR 21, was ABR 04)
  └─ Reason: Atletas need data sync for retention in beta
• Sprint 2B (Performance) MOVED LATER (ABR 30, was MAR 07)
  └─ Reason: Can optimize after integrações code is stable
• Overall timeline: SAME (MVP 2.0 still 31 JUL) ✅
• Product quality: BETTER (multi-tenant day 1, integrações early) ✅
═════════════════════════════════════════════════════════════════════════════
```

---

## 📋 RELEASE 1.0: MVP 2.0 COM FUNDAÇÃO SEGURA

**Objetivo:** Multi-tenancy com Keycloak + Skills + Validação (não refatorar depois)
**Duração:** 3 semanas (28 FEB - 21 MAR)
**Investimento:** 84-96 horas
**Team:** 1-2 pessoas (CTO + 1 Optional Dev)
**Milestone:** MVP 1.0 ready para integrações em Sprint 2A
**IMPORTANTE:** Usar Keycloak (95% documentado em /menthoros/docs/) + corrigir repositories

### Sprint 1: Multi-Tenancy com Keycloak + Skills + Validação (FEB 28 - MAR 21)

**⚠️ MUDANÇAS IMPORTANTES (baseado em análise de código existente):**
- ✅ Usar **Keycloak** (documentação: `/menthoros/docs/MULTI_TENANCY_INTEGRATION_GUIDE.md`)
- ✅ Usar **tb_assessoria** como tenant master (não tb_tenant)
- ✅ 🔴 **CRÍTICO:** Corrigir repositories (vazamento de dados - não filtram por assessoria_id)
- ✅ Adicionar **Input Validation + Rate Limiting**
- ✅ Manter **Skills Framework**
- ❌ **REMOVER:** JWT custom (Keycloak substitui)

---

## 🚨 IMPORTANTE: User Stories de Sprint 1 - VERSÃO CORRIGIDA

**VER: `/SPRINT_1_KICKOFF.md` para o plano CORRETO com Keycloak**

**Obsoletas (abaixo):** User Stories 1.1-1.3 originais (JWT custom)
**Usar ao invés:** SPRINT_1_KICKOFF.md que contém:
- US 1.1 NOVO: Input Validation + Rate Limiting (14h)
- US 1.2 NOVO: Keycloak Infrastructure (6-8h)
- US 1.3 NOVO: Multi-Tenancy Configuration (8-10h)
- 🔴 US 1.4 NOVO: **CRÍTICO** - Fix Repositories (vazamento dados!) (12-14h)
- US 1.5 NOVO: Database Migrations (6-8h)
- US 1.6: Skills Framework (12-16h)

**Documentação de Referência:**
- Backend: `/menthoros/docs/MULTI_TENANCY_INTEGRATION_GUIDE.md` ✅
- Backend: `/menthoros/docs/MULTI_TENANCY_IMPLEMENTATION_ROADMAP.md` ✅
- Backend: `/menthoros/docs/MULTI_TENANCY_ISSUES_BACKLOG.md` ✅
- Decisão: `/docs/MULTI_TENANCY_CONSOLIDACAO.md` ✅

---

## ❌ OBSOLETAS (Remover das tarefas - Keycloak substitui)

#### User Story 1.1: Authentication JWT Setup (OBSOLETO)
```
COMO:        Developer
QUERO:       Implementar JWT authentication
PARA:        Usuários possam fazer login seguro

Acceptance Criteria:
  ✅ Login endpoint retorna JWT token
  ✅ Token válido por 24h
  ✅ Refresh token válido por 7 dias
  ✅ Token inválido/expirado retorna 401
  ✅ Senha criptografada com bcrypt
  ✅ Login com email/password

Tarefas:
  [ ] Spring Security config com JWT
  [ ] JwtProvider com geração de tokens
  [ ] JwtAuthenticationFilter
  [ ] Testes unitários (80%)
  [ ] Documentação de API

Estimativa: 16h (2 dias)
Atribuição: Backend Dev #1
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 1
```

#### User Story 1.2: Logout & Token Refresh (OBSOLETO - Keycloak gerencia)
```
COMO:        User
QUERO:       Fazer logout e renovar tokens
PARA:        Sessão segura e contínua

Acceptance Criteria:
  ✅ POST /api/v1/auth/logout funciona
  ✅ POST /api/v1/auth/refresh renova token
  ✅ Token expirado não pode fazer requests
  ✅ Logout sem token não quebra

Tarefas:
  [ ] Refresh endpoint
  [ ] Token blacklist (simples - Redis opcional)
  [ ] Testes

Estimativa: 8h (1 dia)
Atribuição: Backend Dev #1
Status: ⏳ Planejado
```

#### User Story 1.3: Frontend Auth Flow (OBSOLETO - usar Keycloak SDK)
```
COMO:        Frontend Dev
QUERO:       Implementar login/logout no frontend
PARA:        Usuários possam se autenticar

Acceptance Criteria:
  ✅ /login page com form
  ✅ Salva token no localStorage
  ✅ Configura header Authorization em requests
  ✅ Logout limpa token
  ✅ Redirect ao /login se 401
  ✅ Protected routes (ProtectedRoute component)

Tarefas:
  [ ] LoginPage component
  [ ] useAuth hook refatorado
  [ ] ProtectedRoute component
  [ ] Axios interceptor para token
  [ ] Testes

Estimativa: 16h (2 dias)
Atribuição: Frontend Dev
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 2
```

#### User Story 1.4: Input Validation
```
COMO:        Backend
QUERO:       Validar entrada em todos endpoints
PARA:        Evitar SQL injection, XSS, etc

Acceptance Criteria:
  ✅ @Valid em todos POST/PUT endpoints
  ✅ Mensagens de erro claras
  ✅ Email válido validado
  ✅ Números dentro range validados
  ✅ Strings com tamanho válido
  ✅ Campos obrigatórios validados

Tarefas:
  [ ] Adicionar validações em DTOs
  [ ] Custom validators se necessário
  [ ] Testes de validação
  [ ] Documentação

Estimativa: 8h (1 dia)
Atribuição: Backend Dev #1
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 1.6
```

#### User Story 1.5: Rate Limiting
```
COMO:        API
QUERO:       Limitar requests por IP/user
PARA:        Proteger contra abuso e DDoS

Acceptance Criteria:
  ✅ 100 requests/minuto por IP (não autenticado)
  ✅ 1000 requests/minuto por user (autenticado)
  ✅ Retorna 429 quando excede
  ✅ Header X-Rate-Limit-Remaining
  ✅ Excluir /auth endpoints

Tarefas:
  [ ] Bucket4j config
  [ ] Interceptor de rate limiting
  [ ] Testes
  [ ] Monitoramento

Estimativa: 6h (1 dia)
Atribuição: Backend Dev #2
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 1.5
```

#### User Story 1.6: Multi-Tenancy Architecture ⭐ NOVO

```
COMO:        Arquiteto
QUERO:       Implementar multi-tenancy desde o início
PARA:        Isolamento seguro de dados por tenant

Acceptance Criteria:
  ✅ JWT contém tenant_id e tenant_slug
  ✅ TenantResolver extrai tenant do token
  ✅ TenantInterceptor valida em cada request
  ✅ TenantContextHolder mantém contexto por thread
  ✅ Database usa schema-per-tenant
  ✅ Não consegue acessar dados de outro tenant (403)
  ✅ Testes de isolamento passam

Tarefas:
  [ ] TenantResolver & TenantInterceptor
  [ ] TenantContextHolder (ThreadLocal)
  [ ] JWT com tenant info
  [ ] Database migrations (add tb_tenant)
  [ ] Dynamic schema creation
  [ ] Service layer: filtrar por tenant
  [ ] Entity: adicionar tenant_id
  [ ] Integration tests de isolamento

Estimativa: 20h (2.5 dias)
Atribuição: Backend Dev #1 + #2 (paralelo)
Prioridade: 🔴 CRÍTICA

Referência: MULTI_TENANCY_ARCHITECTURE.md (completo)
```

**⚠️ IMPORTANTE: Sprint 1 EXPANDIDO para 84-96h (3 semanas, não 1 semana)**

**Sprint 1 Total: 84-96 horas (3 semanas com 1-2 devs)**
- Inclui: Auth (54h) + Multi-tenancy (20h) + Skills (12-16h)

**⏰ Nova Timeline:**
- US 1.1-1.5: Semana 1 (54h, Auth foundation)
- US 1.6: Semanas 2-2.5 (20h, Multi-tenancy - paralelo com 1.4-1.5)
- US 1.7: Semanas 2.5-3 (12-16h, Skills - sequencial após auth)
- Testing & Docs: Semana 3 (8h)

---

### **Sprint 2A: Integrações + Skills Detection ⭐ PRIORIZADO (MAR 21 - ABR 30)**

**Objetivo:** Atletas com dados automáticos + AI-powered skills
**Duração:** 6 semanas (expandido de 4 para 6 semanas)
**Estimado:** 88-96 horas
**Bloqueado por:** Sprint 1 (multi-tenancy + skills entity)
**Comentário:** MOVED EARLIER para melhor retenção em beta

#### User Story 2A.1: Strava OAuth Integration

```
COMO:        Atleta
QUERO:       Conectar minha conta Strava
PARA:        Importar treinos automaticamente

Acceptance Criteria:
  ✅ Button "Connect Strava" na Settings
  ✅ OAuth flow: user → Strava → callback
  ✅ Salva access_token + refresh_token (encrypted)
  ✅ Já importa últimos 90 dias de treinos
  ✅ Webhook updates on new activities
  ✅ Sincroniza diariamente

Tarefas:
  [ ] Criar IntegrationConfig entity (tenant-aware)
  [ ] Implementar StravaOAuthService
  [ ] IntegrationController com /auth/strava/callback
  [ ] TreinoRealizadoService integra dados do Strava
  [ ] Frontend: IntegrationSettingsPage com StravaButton
  [ ] Webhook handler para novo activity
  [ ] Tests

Estimativa: 16h (2 dias)
Atribuição: Backend Dev #1
Prioridade: 🔴 CRÍTICA (bloqueia experiência)

Referência: INTEGRACAO_DADOS_TREINO.md seção Strava
```

#### User Story 2A.2: Garmin API Integration

```
COMO:        Atleta
QUERO:       Conectar minha conta Garmin
PARA:        Importar treinos automaticamente (alternativa ao Strava)

Acceptance Criteria:
  ✅ Button "Connect Garmin" na Settings
  ✅ OAuth flow similar ao Strava
  ✅ Salva credenciais (encrypted, tenant-isolated)
  ✅ Importa últimos 90 dias de treinos
  ✅ Sincroniza diariamente via scheduled task
  ✅ Fallback se Strava falhar

Tarefas:
  [ ] Implementar GarminAPIService
  [ ] OAuth flow configuration
  [ ] Scheduled sync task (diário)
  [ ] TreinoRealizadoService integra Garmin
  [ ] Frontend: GarminConnectButton
  [ ] Error handling + retry logic
  [ ] Tests

Estimativa: 16h (2 dias)
Atribuição: Backend Dev #1 + Backend Dev #2
Status: ⏳ Planejado

Referência: INTEGRACAO_DADOS_TREINO.md seção Garmin
```

#### User Story 2A.3: Webhook Handling for Real-time Sync

```
COMO:        System
QUERO:       Sincronizar treino assim que atleta termina (via webhook)
PARA:        Dados sempre atualizados, feedback rápido

Acceptance Criteria:
  ✅ Strava webhook: POST /webhooks/strava
  ✅ Garmin webhook: POST /webhooks/garmin
  ✅ Valida signature (security)
  ✅ Cria TreinoRealizado em <5s
  ✅ Skills auto-updated após novo treino
  ✅ Idempotent (mesma atividade 2x = sem duplicatas)

Tarefas:
  [ ] WebhookController com endpoints
  [ ] Signature validation (Strava, Garmin)
  [ ] Process activity in async queue
  [ ] Idempotency via activity_id
  [ ] Tests com mock webhooks
  [ ] Monitoring + logging

Estimativa: 8h (1 dia)
Atribuição: Backend Dev #2
Status: ⏳ Planejado

Referência: INTEGRACAO_DADOS_TREINO.md seção Webhooks
```

#### User Story 2A.4: Skills Auto-Detection

```
COMO:        AI System
QUERO:       Detectar automaticamente skills do atleta (força, fraqueza)
PARA:        Prompt da IA é mais específico e inteligente

Acceptance Criteria:
  ✅ Analisa últimos 90 dias de TreinoRealizado
  ✅ Detecta padrões (velocidade, resistência, terreno)
  ✅ Cria AtletaSkill com categoria (FORCA, FRAQUEZA)
  ✅ Confidence score (0-100) baseado em quantidade de dados
  ✅ Roupa automático ao importar novos treinos
  ✅ User pode override/edit skills

Tarefas:
  [ ] SkillDetectionEngine: analisa dados
  [ ] Algoritmo de pattern matching (velocidade média, max, variância)
  [ ] Mapa atributos → skills (ex: "velocidade > p75" = FORCA em velocidade)
  [ ] SkillConfidenceCalculator (volume de dados)
  [ ] Scheduled task: executar detecção diária
  [ ] Frontend: mostrar detected skills com confidência
  [ ] Tests com dados de amostra

Estimativa: 12h (1.5 dias)
Atribuição: Backend Dev #1 + Frontend Dev
Status: ⏳ Planejado

Referência: SKILLS_ARCHITECTURE.md seção Auto-Detection
```

#### User Story 2A.5: Frontend Integration Settings

```
COMO:        Atleta
QUERO:       Gerenciar minhas conexões (Strava, Garmin)
PARA:        Controlar quais dados são importados

Acceptance Criteria:
  ✅ Settings page: "Integrações"
  ✅ Lista conexões ativas (Strava, Garmin)
  ✅ Botões: Connect / Disconnect / Resync
  ✅ Último sync timestamp
  ✅ Status de autosync (ligado/desligado)
  ✅ Histórico de sincronizações (últimas 10)

Tarefas:
  [ ] IntegrationSettingsPage component
  [ ] StravaConnectButton + GarminConnectButton
  [ ] ConnectedAccountsList component
  [ ] SyncStatusIndicator
  [ ] Disconnect button com confirmação
  [ ] Manual resync button
  [ ] Error handling (expirado token, API down, etc)
  [ ] Tests

Estimativa: 12h (1.5 dias)
Atribuição: Frontend Dev
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção Frontend
```

**Sprint 2A Total: 88-96 horas (6 semanas com 2 devs em paralelo)**

**Milestone: Atletas com dados automáticos + skills detectadas** ✅

---

### Sprint 2B: Performance & Scale (ABR 30 - MAI 14)

**Objetivo:** Sistema performático para 1k+ atletas
**Duração:** 2 semanas (ABR 30 - MAI 14)
**Estimado:** 40 horas
**Comentário:** MOVED LATER - otimiza código que já está estável da Sprint 2A
**Sequência:** Após Sprint 2A (integrações implementadas), antes Sprint 3

#### User Story 2B.1: Pagination em Listagens
```
COMO:        User com muitos atletas
QUERO:       Listar atletas com paginação
PARA:        Performance não caia com 1k+ registros

Acceptance Criteria:
  ✅ GET /api/v1/atleta?page=0&size=20
  ✅ Response: Page<AtletaResponse>
  ✅ totalElements, hasNext, totalPages
  ✅ Sorting: ?sort=nome,desc
  ✅ Performance < 100ms mesmo com 10k registros
  ✅ Default page size: 20

Tarefas:
  [ ] Adicionar Pageable em endpoints
  [ ] Spring Data JPA PagingAndSortingRepository
  [ ] Testes com diferentes tamanhos
  [ ] Frontend: adaptar hooks
  [ ] Spinner loading durante paginação

Estimativa: 16h (2 dias)
Atribuição: Backend Dev #1 + Frontend Dev
Status: ⏳ Planejado
```

#### User Story 2B.2: N+1 Query Optimization
```
COMO:        DBA
QUERO:       Eliminar N+1 queries
PARA:        DB não fica sobrecarregado

Acceptance Criteria:
  ✅ 0 N+1 queries em endpoints críticos
  ✅ Usar @Query com FETCH JOIN
  ✅ P6Spy identifica todas queries
  ✅ Testes de performance antes/depois

Tarefas:
  [ ] Setup P6Spy para audit
  [ ] Identificar N+1 queries
  [ ] Adicionar FETCH JOINs
  [ ] Testes de query count
  [ ] Benchmark e documenta

Estimativa: 12h (1.5 dias)
Atribuição: Backend Dev #2
Status: ⏳ Planejado

Exemplo:
```java
@Query("SELECT DISTINCT p FROM PlanoSemanal p " +
       "LEFT JOIN FETCH p.treinosPlanejados " +
       "WHERE p.atleta.id = :id")
List<PlanoSemanal> findOptimized(@Param("id") Long id);
```
```

#### User Story 2B.3: Database Indexes
```
COMO:        DBA
QUERO:       Criar índices nas colunas mais consultadas
PARA:        Queries rodem mais rápido

Acceptance Criteria:
  ✅ Índices em foreign keys
  ✅ Índices em campos de busca
  ✅ Índices em ranges (datas)
  ✅ EXPLAIN ANALYZE mostra melhoria

Tarefas:
  [ ] Analisar planos de query
  [ ] Criar Flyway migration com índices
  [ ] Validar impact
  [ ] Documentar índices

Estimativa: 4h (0.5 dias)
Atribuição: Backend Dev #2

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 3
```

#### User Story 2B.4: Caching Strategy
```
COMO:        API
QUERO:       Cache resultados de listagem
PARA:        Reduzir carga DB

Acceptance Criteria:
  ✅ Cache TTL: 30 minutos
  ✅ Invalidar após POST/PUT/DELETE
  ✅ Cache apenas GETs
  ✅ Evitar dados inconsistentes

Tarefas:
  [ ] Configurar Caffeine cache
  [ ] Adicionar @Cacheable
  [ ] Adicionar @CacheEvict
  [ ] Testes
  [ ] Monitoramento

Estimativa: 8h (1 dia)
Atribuição: Backend Dev #2
```

**Sprint 2B Total: 40 horas (2 semanas com 1 dev)**

**Milestone: Sistema otimizado para 1k+ atletas** ✅

---

### Sprint 3: Qualidade & Testes (MAR 14 - MAR 21)

#### User Story 3.1: Unit Tests (Backend)
```
COMO:        Developer
QUERO:       80% test coverage no backend
PARA:        Evitar regressões

Acceptance Criteria:
  ✅ AtletaServiceTest (>80% coverage)
  ✅ PlanoServiceTest
  ✅ AuthServiceTest
  ✅ Testes de validação
  ✅ Mocking de repositórios
  ✅ SonarQube: A grade

Tarefas:
  [ ] JUnit5 + Mockito setup
  [ ] Tests para services críticos
  [ ] Tests de validação
  [ ] Tests de auth
  [ ] JaCoCo coverage report

Estimativa: 24h (3 dias)
Atribuição: Backend Dev #1 + QA
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 5
```

#### User Story 3.2: Integration Tests
```
COMO:        QA
QUERO:       Testes de integração com DB real
PARA:        Validar fluxos completos

Acceptance Criteria:
  ✅ Testcontainers com PostgreSQL
  ✅ AtletaController integration test
  ✅ Auth flow integration test
  ✅ Paginação integration test
  ✅ Testes não quebram em paralelo

Tarefas:
  [ ] Setup Testcontainers
  [ ] @SpringBootTest com containers
  [ ] Integration test suite
  [ ] CI/CD integration

Estimativa: 16h (2 dias)
Atribuição: QA
Status: ⏳ Planejado

Referência: EXEMPLOS_IMPLEMENTACAO.md seção 5.2
```

#### User Story 3.3: Logging Estruturado
```
COMO:        DevOps
QUERO:       Logs em JSON para análise
PARA:        Debugar produção com facilidade

Acceptance Criteria:
  ✅ Logs em JSON format
  ✅ RequestId em todos logs
  ✅ Timestamp em UTC
  ✅ Log level apropriado
  ✅ SLF4J + Logback

Tarefas:
  [ ] Configurar logback-spring.xml
  [ ] Adicionar JSON encoder
  [ ] RequestIdFilter
  [ ] MDC para correlation ID
  [ ] Testar output

Estimativa: 8h (1 dia)
Atribuição: DevOps/Backend
```

#### User Story 3.4: Frontend Tests
```
COMO:        Frontend Dev
QUERO:       Testes para hooks e componentes
PARA:        Evitar bugs no frontend

Acceptance Criteria:
  ✅ useAuth tests
  ✅ useCrud tests
  ✅ LoginPage component test
  ✅ ProtectedRoute test
  ✅ 60% frontend coverage mínimo

Tarefas:
  [ ] Setup Vitest
  [ ] Testes de hooks
  [ ] Testes de componentes
  [ ] Setup em CI/CD

Estimativa: 16h (2 dias)
Atribuição: Frontend Dev
Status: ⏳ Planejado
```

**Sprint 3 Total: 64 horas**

---

### Sprint 4: Polish & Launch (MAR 21 - MAR 31)

#### User Story 4.1: Staging Environment
```
COMO:        DevOps
QUERO:       Staging idêntico a produção
PARA:        Testar antes de ir ao vivo

Acceptance Criteria:
  ✅ Staging database com dados fake
  ✅ HTTPS/SSL setup
  ✅ CI/CD pipeline automático
  ✅ Monitoring e alertas
  ✅ Pode ser resetado facilmente

Tarefas:
  [ ] Deploy em Railway (ou AWS)
  [ ] CI/CD pipeline (GitHub Actions)
  [ ] Database seeding
  [ ] SSL certificate
  [ ] Monitoring (Prometheus/Grafana)

Estimativa: 16h (2 dias)
Atribuição: DevOps
Status: ⏳ Planejado
```

#### User Story 4.2: Documentation
```
COMO:        Developer
QUERO:       Documentação atualizada
PARA:        Facilitar onboarding e manutenção

Acceptance Criteria:
  ✅ OpenAPI/Swagger atualizado
  ✅ README setup local
  ✅ Architecture decision records
  ✅ API docs para integração

Tarefas:
  [ ] OpenAPI/Swagger review
  [ ] README completo
  [ ] Setup.md (como rodar)
  [ ] API docs

Estimativa: 12h (1.5 dias)
Atribuição: Tech Lead
Status: ⏳ Planejado
```

#### User Story 4.3: Load Testing
```
COMO:        QA
QUERO:       Validar que sistema suporta 1k concurrent users
PARA:        Confiar em performance

Acceptance Criteria:
  ✅ 1000 concurrent users
  ✅ Response time < 500ms (p95)
  ✅ 0 errors durante teste
  ✅ CPU < 80% utilização

Tarefas:
  [ ] Setup JMeter/Locust
  [ ] Teste de carga
  [ ] Análise de resultados
  [ ] Relatório

Estimativa: 12h (1.5 dias)
Atribuição: QA
Status: ⏳ Planejado
```

#### User Story 4.4: Security Audit
```
COMO:        Security
QUERO:       Validar segurança antes de launch
PARA:        Não ir ao vivo com vulnerabilidades

Acceptance Criteria:
  ✅ OWASP Top 10 validado
  ✅ No SQL injection vulnerabilities
  ✅ No XSS vulnerabilities
  ✅ Secure headers configurados
  ✅ Relatório de findings

Tarefas:
  [ ] Manual security review
  [ ] OWASP ZAP scan
  [ ] Testes de autenticação
  [ ] Testes de autorização
  [ ] Relatório final

Estimativa: 16h (2 dias)
Atribuição: Tech Lead + Backend
Status: ⏳ Planejado
```

#### User Story 4.5: Early Adopters Onboarding
```
COMO:        Product
QUERO:       Onboard 5-10 early adopters
PARA:        Validar com usuários reais

Acceptance Criteria:
  ✅ 5-10 usuários criados em staging
  ✅ Usando todos features
  ✅ Feedback coletado
  ✅ Bugs críticos encontrados

Tarefas:
  [ ] Selecionar early adopters
  [ ] Criar contas
  [ ] Tutorial guiado
  [ ] Coleta feedback
  [ ] Ajustes rápidos

Estimativa: 8h (1 dia)
Atribuição: Product/CTO
Status: ⏳ Planejado
```

**Sprint 4 Total: 64 horas**

---

## 📊 RELEASE 1.0 Summary

```
Total Sprint 1-4: 222 horas

Timeline:
├── Sprint 1: 54h  (1 sem)
├── Sprint 2: 40h  (1 sem)
├── Sprint 3: 64h  (1 sem)
└── Sprint 4: 64h  (1 sem)
Total: 4-5 semanas (1 CTO + 2 devs em paralelo)

Custo Estimado:
  • 250h x R$ 150/h (dev) = R$ 37.5k
  • Infra + tools = R$ 2k
  • Total ~R$ 40k

Valor Entregue:
  ✅ 0 vulnerabilidades críticas
  ✅ Pronto para 1k+ usuários
  ✅ MVP 2.0 em staging
  ✅ Suporta primeira receita (beta)

Status de Launch: 🟢 STAGING READY
```

---

## 📋 RELEASE 1.1: MVP 2.1 BETA

**Objetivo:** Beta privado com 50 usuários pagando
**Duração:** 8-9 semanas (01 ABR - 31 MAI)
**Investimento:** 150-200 horas
**Team:** 2 pessoas (1 backend, 1 frontend)

### Sprint 5: Billing & Onboarding (ABR 01 - ABR 18)

#### US 5.1: Stripe Integration
```
COMO:        Finance
QUERO:       Cobrar usuários via Stripe
PARA:        Gerar receita

Acceptance Criteria:
  ✅ Stripe account setup
  ✅ Product setup (Basic, Pro, Enterprise)
  ✅ Checkout flow funciona
  ✅ Webhook handling para eventos
  ✅ Invoice generation
  ✅ Manage subscription dashboard

Tarefas:
  [ ] Stripe SDK integration
  [ ] Payment intent flow
  [ ] Webhook endpoint
  [ ] Invoice generation
  [ ] Tests

Estimativa: 20h (2.5 dias)
Atribuição: Backend Dev
```

#### US 5.2: Onboarding Wizard
```
COMO:        User
QUERO:       Onboarding intuitivo
PARA:        Não abandonar na primeira tela

Acceptance Criteria:
  ✅ 3-step wizard (Profile, Goals, Preferences)
  ✅ Email validation
  ✅ Profile photo optional
  ✅ Smart defaults
  ✅ Skip opcionais
  ✅ Redirect para dashboard após

Tarefas:
  [ ] Onboarding flow design
  [ ] Multiple pages/steps
  [ ] Data persistence
  [ ] Validação
  [ ] Tests

Estimativa: 16h (2 dias)
Atribuição: Frontend Dev
Status: ⏳ Planejado
```

#### US 5.3: Email Notifications
```
COMO:        System
QUERO:       Enviar emails automáticos
PARA:        Manter usuários engajados

Acceptance Criteria:
  ✅ Welcome email após signup
  ✅ Plan generated notification
  ✅ Weekly summary
  ✅ Unsubscribe option
  ✅ Template profissional

Tarefas:
  [ ] Email service (SendGrid/AWS SES)
  [ ] Email templates
  [ ] Scheduled emails
  [ ] Tracking (opens, clicks)

Estimativa: 12h (1.5 dias)
Atribuição: Backend Dev
```

**Sprint 5 Total: 48 horas**

---

### Sprint 6: Analytics Dashboard (ABR 18 - MAY 02)

#### US 6.1: Progress Charts
```
COMO:        User
QUERO:       Ver meu progresso em charts
PARA:        Entender meu treinamento

Acceptance Criteria:
  ✅ TSS por semana (line chart)
  ✅ VO2Max trend (line chart)
  ✅ Treinos completados (bar chart)
  ✅ Últimos 12 semanas
  ✅ Interativo (hover, zoom)

Tarefas:
  [ ] Recharts/Chart.js setup
  [ ] API endpoints para analytics
  [ ] Frontend components
  [ ] Mobile responsive
  [ ] Tests

Estimativa: 16h (2 dias)
Atribuição: Frontend Dev + Backend Dev
```

#### US 6.2: Performance Metrics
```
COMO:        User/Coach
QUERO:       Ver métricas consolidadas
PARA:        Tomar decisões de treino

Acceptance Criteria:
  ✅ TSS total (this week/month)
  ✅ Average HR zones
  ✅ Total km/horas
  ✅ Compliance com plano
  ✅ Comparativo mês anterior

Tarefas:
  [ ] Analytics service (aggregate)
  [ ] Caching (30min TTL)
  [ ] Frontend components
  [ ] Tests

Estimativa: 12h (1.5 dias)
Atribuição: Backend Dev
```

**Sprint 6 Total: 28 horas**

---

### Sprint 7: Mobile Responsive (MAY 02 - MAY 16)

#### US 7.1: Responsive Design
```
COMO:        Mobile User
QUERO:       Usar Menthoros no celular
PARA:        Acessar de qualquer lugar

Acceptance Criteria:
  ✅ Touch-friendly buttons
  ✅ Responsive layout (sm, md, lg)
  ✅ Mobile menu (hamburger)
  ✅ Form inputs otimizados
  ✅ Charts responsivos
  ✅ Performance <3s (mobile 4G)

Tarefas:
  [ ] Mobile breakpoints review
  [ ] Responsive refactor
  [ ] Touch-friendly UI
  [ ] Mobile testing
  [ ] Performance optimization

Estimativa: 20h (2.5 dias)
Atribuição: Frontend Dev
```

#### US 7.2: Progressive Web App
```
COMO:        Mobile User
QUERO:       Instalar Menthoros no home screen
PARA:        Acesso rápido como app

Acceptance Criteria:
  ✅ Service worker
  ✅ Manifest.json
  ✅ Installable no iOS/Android
  ✅ Offline capability básica
  ✅ Push notifications

Tarefas:
  [ ] Service worker setup
  [ ] Web app manifest
  [ ] PWA testing
  [ ] HTTPS (já tem)

Estimativa: 12h (1.5 dias)
Atribuição: Frontend Dev
```

**Sprint 7 Total: 32 horas**

---

### Sprint 8: Beta Support (MAY 16 - MAY 31)

#### US 8.1: Help & FAQ
```
COMO:        User
QUERO:       Encontrar respostas rápido
PARA:        Não precisar contatar suporte

Acceptance Criteria:
  ✅ FAQ page com 20+ perguntas
  ✅ Search functionality
  ✅ Categorizado por tópico
  ✅ Video tutorials (2-3)
  ✅ Email de suporte visible

Tarefas:
  [ ] FAQ content
  [ ] Search implementation
  [ ] Video hosting
  [ ] Frontend page

Estimativa: 12h (1.5 dias)
Atribuição: Product/Frontend
```

#### US 8.2: Bug Fixes & Iteration
```
COMO:        Team
QUERO:       Corrigir bugs encontrados em beta
PARA:        Melhorar user experience

Acceptance Criteria:
  ✅ Resposta em <24h para bugs críticos
  ✅ Weekly releases com fixes
  ✅ User feedback implementado
  ✅ Performance improvements

Tarefas:
  [ ] Bug tracking (Jira/Linear)
  [ ] Hotfix process
  [ ] Release process

Estimativa: 20h (2.5 dias)
Atribuição: Whole team
```

**Sprint 8 Total: 32 horas**

---

## 📊 RELEASE 1.1 Summary

```
Total Sprint 5-8: 140 horas (8-9 semanas)

Timeline:
├── Sprint 5: 48h  (2 sem)
├── Sprint 6: 28h  (2 sem)
├── Sprint 7: 32h  (2 sem)
└── Sprint 8: 32h  (1.5 sem)
Total: 8-9 semanas (2 pessoas full-time)

Custo Estimado:
  • 150h x R$ 150/h = R$ 22.5k
  • Stripe fees (2.9% + $0.30): ~2% de receita
  • Total ~R$ 23k + 2% receita

Valor Entregue:
  ✅ 50 usuários β ativos
  ✅ MRR: R$ 500-2k
  ✅ Mobile optimizado
  ✅ Pronto para público

Expected Metrics:
  • NPS: 60+
  • Churn: <5%
  • Feature adoption: >60%

Status de Launch: 🟢 BETA READY
```

---

## 📋 RELEASE 2.0: MVP 2.2 PÚBLICO

**Objetivo:** Launch público com 500+ usuários no mês 1
**Duração:** 8-9 semanas (01 JUN - 31 JUL)
**Investimento:** 120-150 horas + R$ 15k marketing
**Team:** 1-2 pessoas

### Sprint 9: Marketing Website (JUN 01 - JUN 15)

```
Landing Page
├── Hero section com value prop
├── Feature highlights
├── Testimonials (de β users)
├── Pricing page
├── FAQ expanded
├── Blog (3-5 initial posts)
└── CTA buttons everywhere

Estimativa: 24h (3 dias)
Atribuição: Frontend + Product

Pricing Page
├── 3 tiers (Basic, Pro, Enterprise)
├── Feature comparison table
├── FAQ by tier
├── CTA para cada plano
└── Special beta discount code

Estimativa: 12h (1.5 dias)

Blog
├── "5 Running Training Mistakes"
├── "AI Training Plans Explained"
├── "How to Avoid Running Injuries"
├── SEO optimized
└── Sharing buttons

Estimativa: 16h (2 dias)
Atribuição: Content + Frontend

Total Sprint 9: 52 horas
```

---

### Sprint 10: Integrations (JUN 15 - JUN 29)

```
Slack Integration
├── Post plans to Slack channel
├── Weekly summary notification
├── /menthoros command
└── OAuth2 flow

Estimativa: 12h (1.5 dias)

Google Calendar Sync
├── Export plano para Google Calendar
├── 2-way sync (update em app)
├── Reminder notifications
└── Teste com múltiplos calendars

Estimativa: 16h (2 dias)

Webhook API (Beta)
├── /webhooks endpoint
├── Events: plan.generated, training.completed
├── Retry logic + exponential backoff
├── Documentation

Estimativa: 12h (1.5 dias)

Total Sprint 10: 40 horas
```

---

### Sprint 11: Referral System (JUN 29 - JUL 13)

```
Referral Links
├── Unique referral link per user
├── Share buttons (social)
├── Tracking in backend
├── Attribution window (30 days)

Estimativa: 12h (1.5 dias)

Rewards
├── R$ 49 crédito para referrer
├── R$ 20 desconto para referred
├── Cap de referrals por mês
├── Payout via Stripe

Estimativa: 12h (1.5 dias)

Marketing
├── Share modal in app
├── Email campaign
├── Social media posts
├── Referral leaderboard (public)

Estimativa: 12h (1.5 dias)

Total Sprint 11: 36 horas
```

---

### Sprint 12: Launch Prep (JUL 13 - JUL 31)

```
Go-Live Checklist
├── ✅ Load testing (10k simulated users)
├── ✅ Security audit final
├── ✅ Backup & disaster recovery
├── ✅ Monitoring alerts
├── ✅ Support process
├── ✅ Analytics tracking
└── ✅ Marketing materials

PR & Launch
├── Launch announcement email
├── Product Hunt submission
├── Twitter/LinkedIn posts
├── Newsletter to email list
├── Press releases (local news)

Estimativa: 24h (3 dias)

Performance Final
├── Last performance optimization
├── CDN setup
├── Database tuning
├── Cache strategy validation

Estimativa: 12h (1.5 dias)

Total Sprint 12: 36 horas
```

---

## 📊 RELEASE 2.0 Summary

```
Total Sprint 9-12: 164 horas (8-9 semanas)

Timeline:
├── Sprint 9: 52h  (2 sem)
├── Sprint 10: 40h (2 sem)
├── Sprint 11: 36h (2 sem)
└── Sprint 12: 36h (2.5 sem)
Total: 8-9 semanas (1-2 pessoas)

Custo Estimado:
  • 150h x R$ 150/h = R$ 22.5k
  • Marketing/ads = R$ 15k
  • PR/launch = R$ 5k
  • Total ~R$ 42.5k

Investimento vs Retorno:
  • Invest: R$ 42.5k
  • Expected MRR (JUL 31): R$ 5-15k
  • ROI: 3-7 months

Métricas Esperadas:
  • 500+ sign-ups (30 dias)
  • 300+ ativos (30 dias)
  • CAC: ~R$ 80
  • Conversion: 60% free → paid
  • MRR: R$ 5-15k

Status de Launch: 🟢 PUBLIC READY
```

---

## 🎯 ROADMAP POST-LAUNCH (AUG 2026+)

```
Sprint 13-20: Scaling & Feature Development

Sprint 13-14: Mobile App MVP
├── iOS/Android native or React Native
├── Core features only (plan + log)
├── Push notifications
├── Offline capability

Sprint 15-16: Community Platform
├── User profiles (public)
├── Leaderboards
├── Forum/discussions
├── Challenges/competitions

Sprint 17-18: Advanced Analytics
├── ML for injury prediction
├── Performance forecasting
├── Peer benchmarking
├── Custom reports

Sprint 19-20: Marketplace
├── Coach directory
├── 1:1 coach consultations
├── Training plans marketplace
├── Menthoros takes 20% commission

Targets for DEC 2026:
  • 1k-5k MAU (Monthly Active Users)
  • MRR: R$ 20-100k
  • Profitable or path to profitability
  • 10+ team members
```

---

## 📊 Consolidated Timeline

```
FEB 28, 2026: START
    ├─ Sprint 1-4: MVP 2.0 Security (4 weeks)
    │  └─ MAR 31: Release 1.0 ✅
    │
    ├─ Sprint 5-8: Beta Platform (8 weeks)
    │  └─ MAY 31: Release 1.1 ✅ (50 users, R$ 1k MRR)
    │
    ├─ Sprint 9-12: Public Launch (8 weeks)
    │  └─ JUL 31: Release 2.0 ✅ (500+ users, R$ 10k MRR)
    │
    ├─ Sprint 13-20: Scale (20 weeks)
    │  └─ DEC 31: Release 3.0 (1k-5k users, R$ 50k+ MRR)
    │
    └─ 2027: Growth (Contínuo, 50%+ MoM growth)

Total: 18 meses até V3.0 com product-market fit comprovado
```

---

## 💰 Total Investment & Expected Return

```
PHASE 1 (MVP 2.0):        40k invest  → R$ 0 revenue   (validation)
PHASE 2 (Beta):           23k invest  → R$ 5k revenue  (traction)
PHASE 3 (Public):         42k invest  → R$ 50k revenue (scale)
─────────────────────────────────────────────────────────
TOTAL (18 weeks):        105k invest  → R$ 55k revenue (3-4 months)

Extended:
PHASE 4+ (Scale):     ~200k invest  → R$ 600k+ revenue (12 months)

ROI:
6 months:   1x (break even)
12 months:  2.5x (R$ 600k revenue - R$ 200k costs)
18 months:  3.5x (R$ 1.2M revenue - R$ 300k costs)
```

---

## ✅ Definition of Ready (Cada Sprint)

Antes de começar um sprint, verificar:
- [ ] User stories escritas com Acceptance Criteria
- [ ] Estimativas acordadas pelo time
- [ ] Dependências identificadas
- [ ] Testes definidos
- [ ] Referências técnicas (exemplos de código)
- [ ] Prioridade clara

## ✅ Definition of Done (Cada User Story)

Antes de marcar como DONE:
- [ ] Código escrito seguindo padrões
- [ ] Testes escritos e passando
- [ ] Code review aprovado (2+ reviewers)
- [ ] Documentação atualizada
- [ ] CI/CD pipeline passando
- [ ] Performance benchmarked
- [ ] Merged para develop
- [ ] Mergido para release branch

---

## 📊 Weekly Tracking Template

```
SEMANA X (DATA)
│
├─ PLANEJADO:
│  ├─ Sprint goal: [XXX]
│  └─ Pontos: X
│
├─ REALIZADO:
│  ├─ Pontos completados: X/X
│  ├─ Burndown: [█████░░]
│  └─ Features shipped:
│     • Feature A ✅
│     • Feature B ✅
│
├─ BLOCKERS:
│  └─ [Nenhum] ou lista
│
├─ METRICS:
│  ├─ Velocity: X pontos/semana
│  ├─ Test coverage: X%
│  └─ Bugs encontrados: X
│
└─ PRÓXIMA SEMANA:
   └─ Focus: [XXX]
```

---

## 🚀 Como Usar Este Documento

1. **Planning:** Use como template para sprint planning
2. **Execution:** Acompanhe progresso por sprint
3. **Tracking:** Update weekly status
4. **Retrospective:** Analise o que funcionou/não funcionou
5. **Iteration:** Ajuste estimativas para próximas sprints

---

**Status Final:** 🟢 PLANO DE ENTREGAS PRONTO PARA EXECUÇÃO

**Próximo Passo:** Começar Sprint 1 hoje (28 FEB)

---

**Documento Atualizado:** 28 de fevereiro de 2026
