# Arquitetura - Comparação e Gaps - Consolidado

**Documento Unificado de Análise Arquitetural**
**Data:** Consolidado em 08 de maio de 2026
**Status:** ✅ ENTREGUE

---

## 📑 Índice

1. Comparação: Arquitetura Atual vs Proposta
2. Especificação Técnica de Multi-Tenancy Gaps
3. Recomendações

---

## 📋 SEÇÃO 1: Comparação Arquitetural

### Atual vs Proposta

| Aspecto | Atual | Proposta |
|---------|-------|----------|
| Arquitetura | Monolítica | Modular com microserviços |
| Banco de Dados | PostgreSQL centralizado | PostgreSQL + Redis + cache distribuído |
| Autenticação | JWT simples | JWT + OAuth2 (Garmin, Strava, Keycloak) |
| Multi-tenancy | Não | Sim (schema-per-tenant) |
| API | REST monolítica | REST + WebSocket para real-time |
| Frontend | React simples | React com Context + Redux |
| Escalabilidade | Vertical | Horizontal |
| Deployment | Docker container | Kubernetes ready |

### Benefícios da Proposta

```
Performance:
├─ Cache distribuído (Redis)
├─ Database optimization
└─ Connection pooling

Escalabilidade:
├─ Horizontal scaling
├─ Multi-tenant isolation
└─ Load balancing

Funcionalidade:
├─ Real-time updates (WebSocket)
├─ Integrações externas
└─ Skills & AI agents
```

---

## 🔧 SEÇÃO 2: Multi-Tenancy Technical Gaps

### Gaps Identificados

#### GAP 1: Row-Level Filtering Não Implementado
**Problema:** Queries não filtram por tenant
**Impact:** Data leak risk
**Solution:** Adicionar TenantContext filter em todas queries

#### GAP 2: Keycloak Integration Incompleta
**Problema:** JWT não contém tenant_id
**Impact:** Não consegue rotear requests para schema correto
**Solution:** Update Keycloak mapper para incluir tenant_id

#### GAP 3: Database Schema Dinâmico Não Suportado
**Problema:** Schema é fixo, não há schema por tenant
**Impact:** Não consegue isolar dados
**Solution:** Implementar dynamic schema switching

#### GAP 4: Tests de Isolamento Faltam
**Problema:** Nenhum teste valida isolamento multi-tenant
**Impact:** Risco de regressão
**Solution:** Criar test suite com 2+ tenants

---

## ✅ Checklist de Alinhamento

Backend:
- [ ] TenantContext filter em todas entities
- [ ] Keycloak com tenant_id no JWT
- [ ] Dynamic schema switching
- [ ] Validação de tenant em cada request

Frontend:
- [ ] Tenant info no context
- [ ] Tenant ID em API headers
- [ ] Tests multi-tenant

Database:
- [ ] Migrations para schemas dinâmicos
- [ ] Row-level security policies
- [ ] Índices por tenant

---

**Status:** ✅ ENTREGUE - Consolida comparacao_arquitetura_atual_vs_proposta + ESPECIFICACAO_TECNICA_MULTI_TENANCY_GAPS
