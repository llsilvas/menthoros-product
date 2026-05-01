# Sprint 1 Kick-Off - Menthoros MVP 2.0 (REVISADO)

**Documento Executivo - VERSÃO CORRIGIDA COM KEYCLOAK**
**Data de Início:** 01 de março de 2026
**Data de Encerramento:** 25 de março de 2026
**Duração:** 25 dias (estendida)
**Total Estimado:** 84-96 horas
**Objetivo:** Multi-tenancy com Keycloak + Input Validation + Skills Foundation

---

## 📊 Status Geral da Sprint

| US | Título | Status | Observação |
|----|--------|--------|------------|
| US 1.1 | Input Validation + Rate Limiting | 🟡 Parcial | Validation ✅, Rate Limiting ❌ |
| US 1.2 | Keycloak Infrastructure Setup | ✅ Concluído | Infraestrutura completa |
| US 1.3 | Multi-Tenancy Configuration | ✅ Concluído | Security + Filter + Context |
| US 1.4 | Fix Data Leakage in Repositories | 🔴 Pendente | Crítico: AtletaRepository sem filtro |
| US 1.5 | Database Migrations + Usuario Sync | ✅ Concluído | V8–V19 aplicadas, entidades criadas |
| US 1.6 | Skills Framework | ❌ Não iniciado | Fora do escopo atual |

---

## 🔄 O Que Mudou na Sprint?

**Análise de documentação existente (backend) revelou:**
- ✅ Keycloak já mapeado para multi-tenancy
- ✅ tb_assessoria (tenant master) já desenhada
- ✅ JWT TenantFilter já existe
- ✅ UsuarioSyncService já mapeada
- ❌ MAS: Repositories tem vazamento crítico de dados (não filtram por assessoria_id)
- ❌ MAS: Keycloak infrastructure não estava setup ainda

**Decisão:** Pivotar para abordagem Keycloak existente (mais segura, SSO-ready)

**Resultado:** Sprint 1 reorganizado para:
1. ~~JWT Custom Setup~~ ← REMOVIDO (Keycloak substitui)
2. ~~Logout & Refresh~~ ← REMOVIDO (Keycloak gerencia)
3. ~~Frontend Auth~~ ← REMOVIDO (usar Keycloak SDK)
4. ✅ Input Validation (MANTIDO)
5. ❌ Rate Limiting (NÃO implementado)
6. ✅ Keycloak Infrastructure (NOVO, CONCLUÍDO)
7. ✅ Multi-Tenancy Configuration (EXPANDIDO, CONCLUÍDO)
8. 🔴 **CRÍTICO:** Corrigir Repositories (vazamento de dados — PENDENTE)
9. ❌ Skills Framework (NÃO iniciado)

---

## 🎯 Sprint Goal

**"Implementar autenticação segura via Keycloak com multi-tenancy robusta, corrigindo vazamento crítico de dados, e estabelecer alicerce para integrações."**

---

## 📋 Status Detalhado por User Story

---

### US 1.1: Input Validation + Rate Limiting — 🟡 Parcial

**Descrição:** Implementar validação de entrada e rate limiting

**Tarefas:**
```
[x] 1. DTOs com @Valid annotations (email, campos obrigatórios)
[x] 2. Jakarta Validation nas entidades e DTOs de input
[x] 3. Spring Validation configurado globalmente
[x] 4. GlobalExceptionHandler para exceções de validação (400 Bad Request)
[ ] 5. Bucket4j rate limiting — NÃO implementado
[ ] 6. RateLimitInterceptor configuration — NÃO implementado
[ ] 7. Testes de rate limiting — NÃO implementado
```

**O que foi implementado:**
- `GlobalExceptionHandler.java` — trata `MethodArgumentNotValidException` → 400
- DTOs de input com anotações `@NotNull`, `@NotBlank`, `@Email`, `@Positive`
- `@Valid` nos controllers para validação automática

**O que ficou pendente:**
- Rate limiting (Bucket4j) não foi adicionado ao projeto
- Sem controle de requisições por IP ou por usuário

**Acceptance Criteria:**
- ✅ Email validation: must be valid format
- ✅ Password validation: min 8 chars, uppercase, number
- ❌ 100 requests/minute for unauthenticated users
- ❌ 1000 requests/minute for authenticated users
- ❌ Returns 429 (Too Many Requests) when exceeded
- ❌ Headers show remaining quota (X-Rate-Limit-Remaining)

---

### US 1.2: Keycloak Infrastructure Setup — ✅ Concluído

**Descrição:** Configurar Keycloak com Docker para multi-tenancy

**Referência:** `/menthoros/docs/MULTI_TENANCY_INTEGRATION_GUIDE.md` + `/menthoros/docs/KEYCLOAK_MANUAL_SETUP.md`

**Tarefas:**
```
[x] 1. docker-compose.multi-tenancy.yml configurado (Keycloak 26.5.4)
[x] 2. PostgreSQL compartilhado (postgres-mt): bancos menthoros-multi + keycloak
[x] 3. Variáveis em .env.multi-tenancy
[x] 4. Realm "menthoros-app" importado automaticamente via JSON
[x] 5. Client "menthoros-backend" (confidential, direct grants, service account)
[x] 6. Client "menthoros-frontend" (public SPA, PKCE)
[x] 7. Groups: "assessoria-test-1" e "assessoria-test-2"
[x] 8. Roles: ADMIN, TECNICO, VISUALIZADOR, ATLETA
[x] 9. Mappers JWT: tenant_id (User Attribute), roles (Client Role)
[x] 10. Usuários de teste criados automaticamente
[ ] PENDENTE: Verificar token com curl em ambiente limpo
```

**Configuração Real (Keycloak 26.5.4):**

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:26.5.4
  command: start-dev --import-realm
  environment:
    KC_BOOTSTRAP_ADMIN_USERNAME: admin
    KC_BOOTSTRAP_ADMIN_PASSWORD: admin123
    KC_DB: postgres
    KC_HOSTNAME: localhost
    KC_HTTP_ENABLED: "true"
    KC_HEALTH_ENABLED: "true"   # Health em porta 9001
  ports:
    - "8080:8080"
    - "9001:9001"
```

**Roles configuradas:**

| Role | Descrição |
|------|-----------|
| `ADMIN` | Acesso total à assessoria |
| `TECNICO` | Gerencia atletas e planos de treino |
| `VISUALIZADOR` | Apenas leitura |
| `ATLETA` | Acesso ao próprio perfil e histórico de treino |

**Usuários de teste:**

| Usuário | Senha | Role | Grupo |
|---------|-------|------|-------|
| `admin.test1` | `Admin123!` | ADMIN | assessoria-test-1 |
| `tecnico.test1` | `Tecnico123!` | TECNICO | assessoria-test-1 |
| `atleta.test1` | `Atleta123!` | ATLETA | assessoria-test-1 |
| `admin.test2` | `Admin123!` | ADMIN | assessoria-test-2 |

**Acceptance Criteria:**
- ✅ Keycloak 26.5.4 rodando em http://localhost:8080
- ✅ Realm "menthoros-app" criado (auto-import)
- ✅ Clients configurados: menthoros-backend + menthoros-frontend
- ✅ Groups com attribute tenant_id configurados
- ✅ Mappers JWT: tenant_id, roles, groups
- ✅ 4 roles: ADMIN, TECNICO, VISUALIZADOR, ATLETA
- ✅ Usuários de teste criados automaticamente
- ✅ Assessorias de teste inseridas no banco

---

### US 1.3: Multi-Tenancy Configuration — ✅ Concluído

**Descrição:** Configurar Spring Security para usar JWT do Keycloak com TenantContext

**Tarefas:**
```
[x] 1. spring-boot-starter-oauth2-resource-server configurado no pom.xml
[x] 2. keycloak-admin-client (25.0.3) no pom.xml
[x] 3. application.yml configurado com issuer-uri e jwk-set-uri do Keycloak
[x] 4. SecurityConfig.java
     - OAuth2 Resource Server habilitado
     - JwtAuthenticationConverter com roles
     - CORS integrado ao SecurityFilterChain (.cors(Customizer.withDefaults()))
     - Endpoints públicos: /api/public/**, /swagger-ui/**, /api-docs/**, /actuator/health
[x] 5. JwtTenantFilter.java
     - Extrai tenant_id do JWT
     - Valida UUID do tenant (rejeita 403 se ausente ou inválido)
     - Configura TenantContext (ThreadLocal)
     - Chama UsuarioSyncService
     - Garante limpeza do contexto no finally
[x] 6. TenantContext.java
     - InheritableThreadLocal<UUID>
     - setTenantId(), getTenantId(), getRequiredTenantId(), clear(), hasTenant()
[x] 7. UsuarioSyncService.java
     - syncUsuarioFromJwt(): extrai claims do JWT
     - Cria/atualiza tb_usuario a partir dos dados do Keycloak
[x] 8. CorsConfig.java refatorado
     - Expõe CorsConfigurationSource (não mais CorsFilter isolado)
     - Garante headers CORS em respostas 401/403 (fix aplicado em 25/03/2026)
```

**Código implementado — JwtTenantFilter (resumo):**
```java
// Extrai tenant_id do JWT e seta no contexto da thread
String tenantIdStr = jwt.getClaimAsString("tenant_id");
TenantContext.setTenantId(UUID.fromString(tenantIdStr));
usuarioSyncService.syncUsuarioFromJwt(jwt, tenantId);
// ... finally { TenantContext.clear(); }
```

**Acceptance Criteria:**
- ✅ Keycloak JWT aceito pela aplicação
- ✅ tenant_id extraído e setado no TenantContext
- ✅ JwtTenantFilter funcionando para todas as requisições autenticadas
- ✅ UsuarioSyncService sincroniza usuário com tb_usuario
- ✅ SecurityContext com authorities/roles corretos
- ✅ CORS headers presentes em todas as respostas (incluindo 401/403)

---

### 🔴 US 1.4: Fix Data Leakage in Repositories — 🔴 PENDENTE (BLOCKER)

**Descrição:** CORRIGIR vazamento crítico de dados — repositories retornam dados de TODOS os tenants

**PROBLEMA ATUAL (verificado no código em 25/03/2026):**
```java
// ❌ AtletaRepository — sem filtro de tenant
@Query("select atl from Atleta atl where atl.ativo = 'ATIVO' order by atl.nome ASC")
List<Atleta> findAllAtletasWithBasicInfo();

// ❌ Mesmo problema em:
List<Atleta> findAllAtletas();
List<Atleta> findAllAtletasWithDias();
List<Atleta> findAllAtletasWithProvas();
```

**SOLUÇÃO OBRIGATÓRIA:**
```java
// ✅ Filtrar por tenant
@Query("""
  select distinct atl from Atleta atl
  left join fetch atl.diasDisponiveis
  where atl.assessoria.id = :tenantId AND atl.ativo = 'ATIVO'
  order by atl.nome ASC
""")
List<Atleta> findAllAtletasWithDias(@Param("tenantId") UUID tenantId);

// Chamar com:
atletaRepository.findAllAtletasWithDias(TenantContext.getRequiredTenantId());
```

**Tarefas pendentes:**
```
[ ] 1. Corrigir AtletaRepository — todas as 4 queries sem filtro de tenant
[ ] 2. Corrigir AtletaServiceImpl — passar tenantId em todas as chamadas
[ ] 3. Verificar PlanoSemanalRepository — adicionar filtro assessoria.id
[ ] 4. Verificar TreinoRealizadoRepository — filtro via atleta.assessoria.id
[ ] 5. Verificar ProvaRepository, PlanoMetadadosRepository, MetricasDiariasRepository
[ ] 6. Escrever testes de isolamento de dados por tenant
```

**Bugs já corrigidos (que eram consequência deste problema):**
- ✅ `TreinoBase.tenantId` adicionado ao mapeamento JPA (25/03/2026)
- ✅ `MetricasDiarias.tenantId` adicionado ao mapeamento JPA (25/03/2026)
- ✅ `TreinoServiceImpl.lancarTreino` — seta tenant do atleta (25/03/2026)
- ✅ `TreinoServiceImpl.montarTreinoRealizado` — seta tenant do atleta (25/03/2026)
- ✅ `TsbServiceImpl.obterOuCriarMetricasDia` — seta tenant do atleta (25/03/2026)

**Acceptance Criteria:**
- ❌ ALL repositories filtram por assessoria_id
- ❌ ALL service methods passam tenantId
- ❌ Tests verificam isolamento de dados entre tenants
- ❌ Code review aprovado

**Estimativa restante:** 8-10h
**Prioridade:** 🔴 **BLOCKER CRÍTICO — deve ser a próxima tarefa**

---

### US 1.5: Database Migrations + Usuario Sync — ✅ Concluído

**Descrição:** Criar tabelas de multi-tenancy e sincronização com Keycloak

**Migrations executadas:**
```
[x] V8__Create_keycloak_multi_tenancy.sql — tb_assessoria + tb_usuario
[x] V17__Create_multi_tenancy_tables.sql — tenant_id em todas as tabelas existentes
[x] V19__Create_metricas_diarias_table.sql — corrigida para IF NOT EXISTS (25/03/2026)
[x] V1–V16 — schema completo do domínio
```

**Entidades implementadas:**
```
[x] Assessoria.java — mapeada para tb_assessoria
[x] Usuario.java    — mapeada para tb_usuario, com @ManyToOne para Assessoria
[x] Atleta.java     — @ManyToOne(assessoria) com tenant_id FK
```

**Repositories implementados:**
```
[x] AssessoriaRepository — findByKeycloakGroupId(), findByDominio(), findByPlano()
[x] UsuarioRepository    — todas as queries filtram por assessoria.id (tenant-safe)
```

**Problemas corrigidos durante a sprint:**
- ✅ Flyway V6 checksum mismatch — requer `./mvnw flyway:repair` (25/03/2026)
- ✅ Flyway V19 `CREATE TABLE` sem `IF NOT EXISTS` — corrigido no arquivo (25/03/2026)

**Acceptance Criteria:**
- ✅ Migrations V8–V19 executadas com sucesso
- ✅ tb_assessoria criada com schema correto
- ✅ tb_usuario criada com schema correto
- ✅ tenant_id adicionado a todas as tabelas de domínio
- ✅ Índices criados para performance
- ✅ UsuarioSyncService criado e integrado ao JwtTenantFilter

---

### US 1.6: Skills Framework — ❌ Não Iniciado

**Descrição:** Criar entidade e serviço para skills

**Tarefas:**
```
[ ] 1. SkillCategory enum
[ ] 2. AtletaSkill entity + SkillTaxonomy entity
[ ] 3. Repositories: AtletaSkillRepository, SkillTaxonomyRepository
[ ] 4. SkillService com CRUD
[ ] 5. Endpoints REST
[ ] 6. SkillDetectionService (stub)
[ ] 7. Frontend: SkillForm component
[ ] 8. Testes
```

**Decisão:** Mover para Sprint 2A. Prioridade inferior ao fix do vazamento de dados (US 1.4).

---

## 🐛 Bugs Corrigidos Durante a Sprint (Fora do Escopo Original)

| Data | Bug | Solução |
|------|-----|---------|
| 25/03 | Flyway V6 checksum mismatch | Requer `./mvnw flyway:repair` |
| 25/03 | Flyway V19 relation already exists | `CREATE TABLE IF NOT EXISTS` |
| 25/03 | CORS bloqueado pelo Spring Security | `CorsConfigurationSource` + `.cors()` no SecurityFilterChain |
| 25/03 | `tenant_id` null em `tb_treino_realizado` | `TreinoBase.tenantId` mapeado + setado do atleta |
| 25/03 | `tenant_id` null em `tb_metricas_diarias` | `MetricasDiarias.tenantId` mapeado + setado do atleta |

---

## 📈 Success Metrics — Status Atual

| Métrica | Target | Status |
|---------|--------|--------|
| Keycloak running | 100% | ✅ |
| Multi-tenancy configurada (infra) | 100% | ✅ |
| Data leakage corrigido (repositories) | 100% | 🔴 Pendente |
| Input validation ativa | 100% | ✅ |
| Rate limiting ativo | 100% | ❌ Não implementado |
| Skills framework pronto | 100% | ❌ Não iniciado |
| tenant_id preenchido no domínio | 100% | ✅ (corrigido 25/03) |
| Flyway migrations limpas | 100% | 🟡 V6 requer repair |
| CORS funcionando | 100% | ✅ (corrigido 25/03) |

---

## 🚨 Ações Necessárias para Encerrar a Sprint

### Imediato (antes de próxima feature):

```bash
# 1. Corrigir checksum do Flyway V6
./mvnw flyway:repair \
  -DDB_HOST=localhost \
  -DDB_PORT=5433 \
  -DDB_NAME=menthoros-multi \
  -DDB_USER=menthoros \
  -DDB_PASSWORD=menthoros123
```

### Próxima Sprint (crítico):

1. **US 1.4 — Fix AtletaRepository** (Blocker)
   - `findAllAtletasWithBasicInfo()`, `findAllAtletas()`, `findAllAtletasWithDias()`, `findAllAtletasWithProvas()`
   - Todos devem receber `@Param("tenantId") UUID tenantId`
   - Adicionar `WHERE atl.assessoria.id = :tenantId`

2. **US 1.4 — Fix outros repositories**
   - `PlanoSemanalRepository`, `TreinoRealizadoRepository`, `ProvaRepository`, `PlanoMetadadosRepository`

3. **US 1.6 — Skills Framework** (pode ir para Sprint 2A)

4. **Rate Limiting** — avaliar prioridade vs Sprint 2A

---

## 🔐 Security Checklist — Status Atual

- ✅ Keycloak JWT validation ativa
- ❌ Todos repositories filtram por assessoria_id — **PENDENTE**
- ✅ SQL injection prevention (parameterized queries via JPA)
- ✅ CORS corretamente configurado (fix 25/03)
- ❌ Rate limiting ativo — NÃO implementado
- ✅ Tenant isolation no nível de filtro (JwtTenantFilter)
- 🟡 Tenant isolation no nível de dados (repositories — incompleto)
- ✅ Sem dados sensíveis em logs
- ✅ HTTPS enforced em produção (cloud profile)

---

## 🏗️ Setup Local

### Banco de dados

```bash
# Subir PostgreSQL + Keycloak
docker compose --env-file .env.multi-tenancy \
  -f docker-compose.multi-tenancy.yml up -d

# Inserir assessorias de teste
docker exec menthoros-postgres-mt psql -U menthoros -d menthoros-multi -c "
INSERT INTO tb_assessoria (id, nome, cnpj, plano, ativo, created_at, updated_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Assessoria Test 1', '11000000000100', 'BASICO', true, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'Assessoria Test 2', '22000000000200', 'BASICO', true, now(), now())
ON CONFLICT DO NOTHING;"
```

### Obter token Keycloak

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/menthoros-app/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=menthoros-backend" \
  -d "client_secret=menthoros-backend-secret-dev" \
  -d "username=admin.test1" \
  -d "password=Admin123!" | jq -r '.access_token')

# Verificar claims (deve conter tenant_id e roles)
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '{tenant_id, roles, email}'

# Chamar endpoint protegido
curl -H "Authorization: Bearer $TOKEN" http://localhost:8099/atleta
```

**Claims esperados no JWT:**
```json
{
  "tenant_id": "10000000-0000-0000-0000-000000000001",
  "roles": ["ADMIN"],
  "email": "admin@assessoria-test-1.com"
}
```

---

## 📚 Referências

**Docs:**
- `/menthoros/docs/MULTI_TENANCY_INTEGRATION_GUIDE.md`
- `/menthoros/docs/MULTI_TENANCY_IMPLEMENTATION_ROADMAP.md`
- `/menthoros/docs/KEYCLOAK_MANUAL_SETUP.md`
- `/menthoros/docs/KEYCLOAK_AUTHENTICATION_GUIDE.md`

**Scripts:**
- `scripts/keycloak/menthoros-app-realm.json` — Realm import automático
- `scripts/setup-keycloak.sh` — Setup idempotente via REST API

**Versões reais:**
- Keycloak: `26.5.4` (não 23.0.0)
- PostgreSQL: `pgvector/pgvector:pg17`
- Keycloak 26.x admin env: `KC_BOOTSTRAP_ADMIN_USERNAME` (não `KEYCLOAK_ADMIN`)
- App porta: `8099` (não 8080 — Keycloak usa 8080)

---

## ✅ Definition of Done

User Story é DONE quando:
- ✅ Todos os acceptance criteria atendidos
- ✅ Testes unitários passam (80%+ cobertura)
- ✅ Testes de integração passam
- ✅ Code review aprovado (GitHub PR)
- ✅ Documentação atualizada
- ✅ Sem security warnings
- ✅ Verificado localmente
- ✅ Merge no branch develop

---

## 🎯 Próximos Passos

1. **Imediato:** `flyway:repair` para fix do V6 checksum
2. **Sprint 2A — Semana 1:** US 1.4 — Fix de todos os repositories (blocker de segurança)
3. **Sprint 2A — Semana 2:** Skills Framework (US 1.6)
4. **Sprint 2A — Semana 3:** Integrações Strava/Garmin (OAuth2 flows)
5. **Backlog:** Rate Limiting (Bucket4j) — avaliar prioridade

**Última atualização:** 2026-03-25
