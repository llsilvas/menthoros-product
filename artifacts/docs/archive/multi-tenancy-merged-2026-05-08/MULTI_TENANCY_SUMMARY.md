# Multi-Tenancy: Resumo Executivo para CTO

**Documento de Decisão Rápida**
**Data:** 28 de fevereiro de 2026

---

## 🎯 Síntese da Situação

Você identificou um **ponto crítico**: Sprint 1 (autenticação) precisa prever **multi-tenancy** desde o início.

**Você tem razão. 100% correto.**

Se implementar autenticação sem multi-tenancy, depois terá que:
1. Reescrever autenticação inteira (+40h)
2. Refatorar todas as queries (+30h)
3. Riscar de data leak entre tenants (+risco legal)

**Solução:** Implementar multi-tenancy AGORA na Sprint 1

---

## 📊 Impacto Direto

```
SPRINT 1 TIMELINE IMPACT:

ANTES (sem multi-tenancy):
├─ Semana 1: Sprint 1 completo (54h)
│  └─ 28 FEB - 07 MAR
└─ 07 MAR: Começa Sprint 2

DEPOIS (com multi-tenancy):
├─ Semana 1: Sprint 1 + Multi-tenancy (72-80h)
│  └─ 28 FEB - 14 MAR
├─ 1.5 SEMANA: Overlap com Sprint 2
│  └─ US 1.6 (multi-tenancy) em paralelo com performance
└─ 14 MAR: Sprint 2 começa oficialmente

IMPACTO:
• +20-26 horas de desenvolvimento
• +3-4 dias no calendar (mas paralelizável)
• +1-2 sprints de testes adicionais
• Sem atraso geral no roadmap (Sprint 2 pode começar 14 MAR em vez de 07 MAR)
```

---

## ✅ Por Que Fazer Agora

### 1. Segurança / Compliance
```
Data Leak Risk se fizer depois:
├─ Sprint 1-4 (MVP 2.0): Single tenant, dados juntos
├─ Sprint 5+: Separar dados por tenant (muito tarde!)
└─ Risco Legal: LGPD, GDPR violations

Fazer Agora:
├─ Sprint 1: Multi-tenant isolado desde dia 1
├─ Sprint 5+: Adicionar features (sem refactor)
└─ ✅ SEGURO desde o início
```

### 2. Arquitetura
```
Fazer Depois = Refactor Massivo:
├─ Mudança em JWT (+refactor)
├─ Mudança em Services (+refactor)
├─ Mudança em Database (+mudança de schema)
├─ Mudança em Tests (reescrever)
└─ Total: +40-60h + Risco de quebrar tudo

Fazer Agora = Clean Architecture:
├─ Design correto desde início
├─ Menos refactor depois
├─ Código mais limpo
└─ Total: +20h (custo menor!)
```

### 3. Time Velocity
```
Fazer Tudo junto (Sprint 1 com multi-tenancy): +20h agora
Fazer depois (Sprint 1 simples + refactor em Sprint 5): +60h depois

Melhor fazer agora:
• Contexto quente (JWT, auth, etc)
• Sem refactor de código existente
• Testes desde o início
• Economia de 40h no longo prazo
```

---

## 🏗️ Solução Arquitetural (Schema-Per-Tenant)

### Visual Simplificado

```
┌─────────────────────────────────────┐
│  Frontend Request                    │
│  auth: JWT (contém tenant_id)       │
└────────────────┬────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  TenantInterceptor                  │
│  1. Extrai tenant do JWT            │
│  2. Valida tenant existe & ativo    │
│  3. Switch DB schema para tenant    │
└────────────────┬────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  ServiceLayer (AtletaService)       │
│  • Queries rodam no schema correto  │
│  • Isolamento automático            │
│  • Sem precisa WHERE tenant_id      │
└────────────────┬────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Database                           │
│  Schema: tenant_001 (Coach João)    │
│  ├─ tb_atleta (apenas do João)     │
│  ├─ tb_plano_semanal (do João)     │
│  └─ tb_treino_... (do João)        │
│                                     │
│  Schema: tenant_002 (Academia XYZ)  │
│  ├─ tb_atleta (apenas XYZ)         │
│  ├─ tb_plano_semanal (de XYZ)      │
│  └─ tb_treino_... (de XYZ)         │
└─────────────────────────────────────┘
```

### Por Que Schema-Per-Tenant?

```
Opções:

1. Row-Level (Mesma table, WHERE tenant_id)
   ✅ Mais simples
   ❌ Risco de SQL injection: WHERE clause erroneamente pulado
   ❌ Performance: Sempre filtrar by tenant
   ❌ Segurança: Menos isolado

2. Database-Per-Tenant (1 BD por tenant)
   ✅ Isolamento perfeito
   ❌ Muito caro (100 tenants = 100 databases!)
   ❌ Escalabilidade: Limite ~100 tenants
   ❌ Backup complexo

3. Schema-Per-Tenant (1 DB, múltiplos schemas) ✅ ESCOLHIDO
   ✅ Bom isolamento (schema isolation PostgreSQL)
   ✅ Escalabilidade: Milhares de tenants em 1 BD
   ✅ Custo-benefício ótimo
   ✅ Backup centralizado
   ✅ Desenvolvimento mais simples que database-per-tenant
   ⚠️ Mais complexo que row-level (mas seguro)
```

---

## 📋 Mudanças Necessárias (Quick Checklist)

### Backend

```
NEW FILES/CLASSES:
  [ ] TenantContext.java (POJO com tenant info)
  [ ] TenantContextHolder.java (ThreadLocal)
  [ ] TenantResolver.java (extrai tenant do JWT)
  [ ] TenantInterceptor.java (processa em cada request)
  [ ] TenantService.java (CRUD de tenants)
  [ ] TenantRepository.java (queries de tenant)
  [ ] TenantException.java (nova exception)

MODIFIED FILES:
  [ ] JwtProvider.java (adicionar tenant em token)
  [ ] AuthService.java (retornar tenant no login)
  [ ] AtletaService.java (filtrar by tenant)
  [ ] PlanoService.java (filtrar by tenant)
  [ ] ... (todos services, mas simples)
  [ ] Atleta.java (entity - adicionar tenant_id)
  [ ] PlanoSemanal.java (entity)
  [ ] ... (todas entities)
  [ ] DataSourceConfig.java (schema dinâmico)
  [ ] SecurityConfig.java (adicionar interceptor)

DATABASE:
  [ ] V17__Add_Multi_Tenancy.sql (nova migration)
     - CREATE TABLE tb_tenant
     - ALTER tb_usuario ADD tenant_id
     - CREATE schemas tenant_001, tenant_002, etc
     - CREATE application_role (Flyway automation)
```

### Frontend

```
NEW FILES:
  [ ] context/TenantContext.tsx
  [ ] TenantProvider.tsx

MODIFIED FILES:
  [ ] hooks/useAuth.ts (retornar tenant info)
  [ ] api/config.ts (axios interceptor)
  [ ] App.tsx (wrap com TenantProvider)
  [ ] components/DashboardHeader.tsx (mostrar tenant)
  [ ] hooks/useCrud.ts (passar tenant context)
```

### Tests

```
NEW:
  [ ] MultiTenancyIntegrationTest.java
     - Test tenant isolation
     - Test cannot access other tenant data
     - Test schema switching

MODIFIED:
  [ ] Todos testes existentes (adicionar @BeforeEach para setup de tenant)
```

---

## 💰 Custo-Benefício

```
FAZER MULTI-TENANCY AGORA (Sprint 1):

Custo:
  • +20-26 horas de desenvolvimento
  • +3-4 dias no calendar
  • +2 pessoas (paralelizável)
  • Total: ~R$ 3-4k em desenvolvimento

Benefício (imediato):
  ✅ Isolamento de dados seguro desde dia 1
  ✅ Sem refactor depois (economia de 40h)
  ✅ Pronto para múltiplos tenants na Sprint 2
  ✅ Código arquiteturalmente correto
  ✅ Facilita billing por tenant

Benefício (longo prazo):
  ✅ Escalabilidade até 10k+ tenants
  ✅ Simplicidade para adicionar features futuras
  ✅ Menos bugs de isolação depois
  ✅ Economia: -R$ 6k (não refatorar depois)

NET VALUE: +R$ 2-3k em benefícios
ROI: Positivo no sprint 1 mesmo!
```

---

## 🚀 Decisão Recomendada

### Opção 1: Implementar Multi-Tenancy em Sprint 1 ✅ RECOMENDADO

```
Timeline:
├─ Semana 1 (28 FEB - 07 MAR): Sprint 1.1 Auth (54h)
├─ Semana 2 (07 MAR - 14 MAR): Sprint 1.2 Multi-Tenancy (20-26h) + Sprint 2
└─ 14 MAR: Pronto para performance optimization

Risco: MÉDIO
  • Mais complexo que auth simples
  • Mas documentação completa (MULTI_TENANCY_ARCHITECTURE.md)
  • Exemplos de código prontos

Confiança: 90%
  • Padrão de indústria bem estabelecido
  • Testes claros para validar isolamento
  • Rollback possível se necessário
```

### Opção 2: Fazer Single-Tenant Sprint 1, Multi-Tenancy Sprint 5

```
Timeline:
├─ Sprint 1-4: Single tenant (mais rápido)
└─ Sprint 5: Refatorar para multi-tenant (40-60h extra!)

Risco: ALTO
  • Refactor massivo de código funcionando
  • Risco de quebrar tudo
  • Data leak risk durante transição
  • GDPR/LGPD issues

Confiança: 40%
  • Só funciona se mudar muito cuidadosamente
  • Melhor ter multi-tenancy desde início

❌ NÃO RECOMENDADO
```

---

## ✋ Seu Próximo Passo (CTO)

### Decisão de Hoje (28 FEV):

**Questão:** "Implementar multi-tenancy na Sprint 1?"

**Respostas:**

```
[ ] SIM - Faço agora (RECOMENDADO)
    └─ Ação: Informar time que Sprint 1 vai de 54h para 72-80h
    └─ Timeline: 28 FEV - 14 MAR (1.5 semanas)
    └─ Documentação: MULTI_TENANCY_ARCHITECTURE.md pronto

[ ] NÃO - Faço mais tarde (NÃO RECOMENDADO)
    └─ Risco: Data leak, refactor later
    └─ Timeline: 28 FEV - 31 MAR (ainda cabe)
    └─ Custo: +40-60h depois

[ ] PARCIALMENTE - Só preparar, implementar depois
    └─ Não recomendado (preparo incompleto)
```

---

## 📞 Se Escolher SIM

```
1. HOJE (28 FEV):
   [ ] Comunicar para Backend Team
       "Sprint 1 agora inclui multi-tenancy, +20h de trabalho"
   [ ] Ler MULTI_TENANCY_ARCHITECTURE.md (30 min)
   [ ] Compartilhar com time

2. AMANHÃ (01 MAR - Sprint 1 Begins):
   [ ] Dev #1: Começa com JWT (US 1.1)
   [ ] Dev #2: Prepara BD migrations em paralelo
   [ ] 03 MAR: Iniciam US 1.6 (multi-tenancy)

3. PRÓXIMA SEGUNDA (03 MAR):
   [ ] Code review de TenantResolver
   [ ] Pair programming em TenantInterceptor
   [ ] Testes de isolamento

4. FIM DE SEMANA (07 MAR):
   [ ] Todos US 1.1-1.6 em code review
   [ ] Testes passando
   [ ] Ready para Sprint 2

5. SEGUNDA (14 MAR):
   [ ] Sprint 2 começa (Performance)
   [ ] Multi-tenancy já em produção
```

---

## 🎓 Documentação de Referência

```
Para entender COMPLETO:
  └─ MULTI_TENANCY_ARCHITECTURE.md (80% do conhecimento)

Para implementar:
  └─ Exemplos de código também em MULTI_TENANCY_ARCHITECTURE.md

Para integrar com Sprint:
  └─ PLANO_ENTREGAS.md (US 1.6 adicionado)

Para acompanhar:
  └─ DASHBOARD_CONTROLE.md (tracking de 6 sprints)
```

---

## 🎯 Bottom Line (CTO)

> **Você está 100% correto.**
>
> Multi-tenancy deve ir com autenticação. Implementar agora custa +20h.
> Implementar depois custa +60h + refactor + risco legal.
>
> **Recomendação: SIM, fazer agora. Sprint 1 vai para 1.5 semanas.**

---

**Status:** 🟢 PRONTO PARA DECISÃO

**Tempo para decidir:** 5 minutos

**Impacto de atrasar:** -R$ 6k em custo futuro

---

**Seu call, CTO. Qual é? 👀**
