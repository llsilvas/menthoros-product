# Menthoros - Enhanced AI-First Development Playbook

**Data:** 2026-05-15  
**Versão:** 2.0 (com integrações de Claude Code Skills)  
**Status:** Ativo

---

## Visão Geral

Estrutura integrada para desenvolvimento AI-first do Menthoros combinando:

```
BMAD (Produto) → OpenSpec (Contrato) → Claude Code (Execução) 
+ Superpowers (Disciplina) + Code Review (Qualidade) 
+ Playwright (Validação) + E2E Testing (Confiabilidade)
```

### Filosofia

**Sem OpenSpec → não existe feature**

Toda implementação começa com especificação formal, nunca com código.

---

## 1️⃣ FASE 1: Product Design (BMAD)

### Quando usar
- ✅ Nova feature
- ✅ Estratégia de produto
- ✅ Arquitetura de alto nível
- ✅ Decisões que afetam múltiplos times

### Fluxo
```
Ideia → PRD (Product Requirements Doc) → Épicos → Histórias → Riscos/Arquitetura
```

### Skills Envolvidas
- **bmad-brainstorming** — Pensar através de ideias, explorar alternativas
- **bmad-advanced-elicitation** — Extrair requisitos profundos
- **product-lens** — Análise de viabilidade e impacto de produto

### Deliverables
- [ ] PRD com objetivos mensuráveis
- [ ] Épicos decompostos
- [ ] Histórias de usuário
- [ ] Riscos identificados
- [ ] Arquitetura de alto nível (diagrama)
- [ ] Estimativa de esforço

### Exemplo Prompt
```
Atue como BMAD (Product Manager + Arquiteto + Tech Lead) para o Menthoros.

Feature Solicitada:
[Descrição da feature]

Forneça:
1. PRD com objetivos, escopo, out-of-scope
2. 3-5 épicos decompostos
3. Cada épico com 3-5 histórias
4. Riscos técnicos e de produto
5. Arquitetura de alto nível
6. Estimativa T-shirt (XS, S, M, L, XL)
```

---

## 2️⃣ FASE 2: Specification (OpenSpec)

### Quando usar
- ✅ SEMPRE, antes de código
- ✅ Depois de BMAD aprovado

### Fluxo
```
BMAD PRD → OpenSpec proposal.md → design.md → tasks.md → implementação
```

### Skills Envolvidas
- **openspec-propose** — Gerar proposta OpenSpec completa em 1 step
- **openspec-explore** — Pensar através de detalhes da implementação
- **openspec-apply-change** — Executar tasks da OpenSpec

### Deliverables
```
menthoros-product/openspec/changes/[change-id]/
├── proposal.md          # O QUÊ e POR QUÊ
├── design.md            # COMO (arquitetura)
├── tasks.md             # QUEM faz O QUÊ quando
└── specs/               # Especificações detalhadas
    └── spec.md          # Decisões técnicas
```

### Estrutura de proposal.md
```markdown
# [Feature Name]

## Problem Statement
- Problema que resolve
- Impacto no usuário

## Success Criteria
- Métrica 1
- Métrica 2

## Scope
- In scope: ...
- Out of scope: ...

## Architecture Overview
- [Diagram]

## Dependencies
- Outras features
- Dados
- Services

## Risks
- Técnico
- Produto
```

### Estrutura de design.md
```markdown
# Design: [Feature Name]

## API Design
- Endpoints HTTP
- Request/Response DTOs
- Error handling

## Data Model
- Entities
- Relationships
- Migrations

## Business Logic
- Algorithms
- Validations
- Edge cases

## Security
- Authentication
- Authorization
- Data privacy

## Performance
- Queries
- Caching
- Async operations
```

### Estrutura de tasks.md
```markdown
# Tasks: [Feature Name]

## Task 1: [Backend] Create Entity and Repository
**Effort:** 2h
**Dependencies:** None
**Acceptance Criteria:**
- Entity mapped correctly
- Repository tests pass
- Migration created

## Task 2: [Backend] Implement Service Layer
...

## Task 3: [Backend] Create API Controller
...

## Task 4: [Frontend] Create UI Component
...

## Task 5: [E2E] Create end-to-end tests
...
```

### Exemplo Prompt
```
Use openspec-propose para criar completa OpenSpec para:

Feature: Analytics Dashboard para Coaches

Baseado no BMAD PRD: [link ou conteúdo]

Gere:
1. proposal.md com problema, sucesso, escopo
2. design.md com API, data model, lógica
3. tasks.md com 8-10 tasks decompostas
4. specs/ com decisões técnicas

Use docs/CONTROLLER_TEMPLATE.java e docs/SERVICE_TEMPLATE.java 
como referência de padrões.
```

---

## 3️⃣ FASE 3: Backend Implementation (Claude Code)

### Quando usar
- ✅ Depois de OpenSpec.design.md aprovado
- ✅ Para cada task de openspec/tasks.md

### Fluxo
```
OpenSpec tasks → Plan (planning skill) → Implement → Test → Review
```

### Skills Envolvidas
- **planning** — Planejar implementação antes de código
- **tdd-workflow** (ou **springboot-tdd**) — TDD para Spring Boot
- **springboot-patterns** — Padrões Spring Boot
- **springboot-security** — Spring Security patterns
- **database-patterns** — Padrões JPA/PostgreSQL
- **code-review** — Review de código próprio

### Mandatory Workflow
1. Ler `apps/menthoros-backend/CLAUDE.md` completamente
2. Ler OpenSpec `proposal.md`, `design.md`, `tasks.md`
3. Usar `superpowers:writing-plans` para planejar antes de código
4. Implementar uma task por vez
5. `./mvnw clean test` passa 100%
6. Atualizar openspec/tasks.md com status

### Code Generation Guidelines

#### Quando Pedir para IA Gerar Código

```
Implemente a task: [TASK ID]

CONTEXTO:
- Change ID: [change-id]
- OpenSpec: menthoros-product/openspec/changes/[change-id]/

OBRIGATÓRIO - Siga apps/menthoros-backend/CLAUDE.md:
✅ Controller Standards (Layered Architecture, @PreAuthorize, etc)
✅ Service Standards (Idempotency: YES/NO, Side Effects, Tenant-aware: YES/NO)
✅ DTO & Records Standards (use records, não classes)
✅ Mapper Standards (null checks explícitos)
✅ Multi-tenancy (use TenantContext.getRequiredTenantId())
✅ Exception Handling (use GlobalExceptionHandler)

TEMPLATES:
- docs/CONTROLLER_TEMPLATE.java
- docs/SERVICE_TEMPLATE.java

VALIDAÇÃO:
./mvnw clean test

Se falhar, DEBUG ANTES DE PEDIR HELP.
```

#### Validação Automática

```bash
# Após IA gerar código:
cd apps/menthoros-backend

# 1. Testes
./mvnw clean test

# 2. Red flags
grep -r "@Autowired.*Repository" src/main/java/br/com/menthoros/backend/controller/
grep -r "public class.*OutputDto" src/main/java/br/com/menthoros/backend/dto/

# 3. Code review checklist
# Ver docs/AI_CODE_GENERATION.md
```

### Deliverables per Task
- [ ] Code implements OpenSpec task 100%
- [ ] `./mvnw clean test` passes (259+ tests)
- [ ] CLAUDE.md rules followed (controller, service, DTOs, mappers)
- [ ] JavaDoc complete (Idempotent status, Side Effects, Tenant-aware)
- [ ] All @PreAuthorize, @Operation, @ApiResponses in place
- [ ] Exception handling via GlobalExceptionHandler

---

## 4️⃣ PHASE 4: Code Quality (Superpowers + Code Review)

### Quando usar
- ✅ Depois de implementação completa
- ✅ Antes de push

### Skills Envolvidas
- **superpowers:verification-before-completion** — Verificação final
- **code-review** — Code review de qualidade
- **security-review** — Security audit
- **simplify** — Remover código desnecessário
- **refactor-cleaner** — Limpar dead code

### Code Review Checklist

#### Backend Code
- [ ] Layered architecture (controller → service → repository)
- [ ] All write endpoints have `@PreAuthorize`
- [ ] DTOs are records (not classes)
- [ ] Mappers have null checks
- [ ] Services document Idempotency status
- [ ] No try/catch in controllers (use GlobalExceptionHandler)
- [ ] Multi-tenancy enforced
- [ ] Logging with context

#### Security
- [ ] No hardcoded secrets
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Authentication/Authorization correct
- [ ] Tenant isolation enforced

#### Tests
- [ ] Edge cases covered
- [ ] Multi-tenancy tested
- [ ] Security tested (@PreAuthorize mocking)
- [ ] Error paths tested

### Deliverables
- [ ] Code review approval from senior engineer
- [ ] Security scan passed
- [ ] No dead code
- [ ] Test coverage adequate

---

## 5️⃣ PHASE 5: Frontend Implementation (Claude Code + Skills)

### Quando usar
- ✅ Backend API completed and tested
- ✅ Frontend architecture designed in OpenSpec

### Skills Envolvidas
- **frontend-patterns** — Frontend architecture
- **frontend-design** — UI/UX component design
- **nextjs-patterns** — Next.js specific patterns (if using Next)
- **typescript-review** — TypeScript code review

### Deliverables
- [ ] Frontend implements all API endpoints
- [ ] UI components match design specs
- [ ] TypeScript types correct
- [ ] Error handling complete
- [ ] Loading states implemented

---

## 6️⃣ PHASE 6: End-to-End Testing (Playwright)

### Quando usar
- ✅ Frontend + Backend completo
- ✅ Antes de merge para develop

### Skills Envolvidas
- **e2e-testing** (ou **e2e-runner**) — E2E test generation
- **browser-qa** — Browser automation QA
- **playwright-expert** — Playwright patterns

### Test Coverage
```
Happy path workflows:
- User creates resource
- User updates resource
- User deletes resource
- User views analytics

Error paths:
- Invalid input
- Permission denied
- Not found

Edge cases:
- Multi-tenancy boundaries
- Concurrent operations
- Large datasets
```

### Deliverables
- [ ] E2E tests for critical workflows
- [ ] Tests pass in CI/CD pipeline
- [ ] Screenshots/videos on failure
- [ ] Performance acceptable

---

## 7️⃣ PHASE 7: Merge & Deploy (Superpowers)

### Quando usar
- ✅ Tudo completo: backend, frontend, e2e
- ✅ Code review aprovado
- ✅ Testes passando

### Skills Envolvidas
- **superpowers:finishing-a-development-branch** — Finalizar branch
- **superpowers:requesting-code-review** — Criar PR
- **git-workflow** — Git best practices

### PR Checklist
- [ ] Commit messages clear and descriptive
- [ ] Related issue referenced
- [ ] OpenSpec change ID in PR description
- [ ] Reviewers assigned
- [ ] CI/CD passed
- [ ] Ready for squash-and-merge

---

## 🔄 Complete Workflow Example

### Story: "Coach can view athlete analytics dashboard"

### Step 1: BMAD
```
Use bmad-brainstorming to generate:
- PRD with objectives
- 3 Épicos: Backend APIs, Frontend UI, E2E Tests
- 10+ Histórias decompostas
```

**Output:** BMAD PRD document

---

### Step 2: OpenSpec
```
Use openspec-propose to create:
- proposal.md (problema, sucesso, escopo)
- design.md (API endpoints, data model, logic)
- tasks.md (10 tasks: 5 backend, 3 frontend, 2 e2e)
```

**Output:** `menthoros-product/openspec/changes/coach-analytics-dashboard/`

**Approval Gate:** Product + Tech Lead review

---

### Step 3: Backend Task 1
```
Implement Task: "Create Analytics API Service"

1. Use planning to design service layer
2. Write tests (TDD)
3. Implement service per CLAUDE.md
4. Run: ./mvnw clean test
5. Update tasks.md: ✅ DONE
```

**Output:** Backend service code

---

### Step 4: Backend Task 2-5 (repeat)
```
Each task follows Step 3 pattern
```

**Output:** Complete backend API

---

### Step 5: Code Review
```
Use code-review + security-review for all backend code
Check against CLAUDE.md rules
Approve if all green
```

**Output:** Code review approval

---

### Step 6: Frontend Implementation
```
Implement Task: "Create Analytics Dashboard UI"

1. Use frontend-patterns for component structure
2. Consume backend API
3. Implement responsive design
4. Run: npm test
```

**Output:** Frontend components

---

### Step 7: E2E Testing
```
Use e2e-testing to generate:
- Test scenarios for happy path
- Error case tests
- Multi-tenancy boundary tests

Run: npx playwright test
```

**Output:** E2E test suite passing

---

### Step 8: PR & Merge
```
Use superpowers:finishing-a-development-branch

1. Squash commits
2. Create PR with clear description
3. Link OpenSpec change
4. Request review
5. Wait for approval
6. Merge to develop
```

**Output:** Merged feature on develop branch

---

## 📊 Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    MENTHOROS AI-FIRST WORKFLOW              │
└─────────────────────────────────────────────────────────────┘

┌──────────┐         ┌──────────┐         ┌─────────────┐
│  BMAD    │ ───────>│ OpenSpec │ ───────>│ Claude Code │
│ Product  │         │ Contract │         │Implementation│
│Design    │         │  Design  │         │             │
└──────────┘         └──────────┘         └─────────────┘
      ↓                                          ↓
   PRD                                  Backend Service
   Épicos                               + Controller
   Histórias                            + Tests
                                               ↓
                                        ┌─────────────┐
                                        │ Code Review │
                                        │ + Security  │
                                        └─────────────┘
                                               ↓
                                        ┌─────────────┐
                                        │  Frontend   │
                                        │ Implementation
                                        └─────────────┘
                                               ↓
                                        ┌─────────────┐
                                        │ E2E Testing │
                                        │ (Playwright)│
                                        └─────────────┘
                                               ↓
                                        ┌─────────────┐
                                        │ Merge to    │
                                        │  develop    │
                                        └─────────────┘
```

---

## 🎯 Skills Matrix

### By Phase

| Phase | Primary Skill | Support Skills |
|-------|---------------|-----------------|
| 1. Product | `bmad-brainstorming` | `product-lens`, `architecture-decision-records` |
| 2. Specification | `openspec-propose` | `openspec-explore`, `architecture-decision-records` |
| 3. Backend | `springboot-patterns` | `tdd-workflow`, `database-patterns`, `security-review` |
| 4. Quality | `code-review` | `simplify`, `security-review` |
| 5. Frontend | `frontend-patterns` | `frontend-design`, `typescript-review` |
| 6. Testing | `e2e-testing` | `playwright-expert`, `browser-qa` |
| 7. Merge | `git-workflow` | `superpowers:finishing-a-development-branch` |

### By Technology

| Tech | Primary Skills |
|------|-----------------|
| **Spring Boot** | `springboot-patterns`, `springboot-security`, `springboot-tdd`, `springboot-verification` |
| **Backend Architecture** | `architecture-designer`, `hexagonal-architecture`, `backend-patterns` |
| **Database** | `database-patterns`, `postgres-patterns`, `jpa-patterns` |
| **Frontend** | `frontend-patterns`, `frontend-design`, `nextjs-patterns` |
| **Testing** | `tdd-workflow`, `e2e-testing`, `playwright-expert` |
| **Security** | `security-review`, `springboot-security`, `healthcare-cdss-patterns` |
| **DevOps/Deployment** | `deployment-patterns`, `docker-patterns` |

---

## 📋 Mandatory Rules (Non-Negotiable)

### OpenSpec
- ✅ Every feature starts with OpenSpec
- ✅ proposal.md + design.md + tasks.md required
- ✅ No code without approved OpenSpec

### Backend (CLAUDE.md)
- ✅ Controllers → Service → Repository (layered architecture)
- ✅ DTOs as records (not classes)
- ✅ All write endpoints have @PreAuthorize
- ✅ Service methods document: Idempotent: YES/NO, Side Effects, Tenant-aware: YES/NO
- ✅ Mappers have explicit null checks
- ✅ Tests: ./mvnw clean test passes 100%

### Code Review
- ✅ All code reviewed before merge
- ✅ Security audit for sensitive features
- ✅ Test coverage adequate (80%+)

### Frontend
- ✅ TypeScript strict mode
- ✅ Component tests (unit tests)
- ✅ Error boundary handling
- ✅ Loading states for async operations

### Testing
- ✅ Unit tests for business logic
- ✅ Integration tests for APIs
- ✅ E2E tests for critical workflows
- ✅ Security tests for auth/authz

---

## 🚨 Red Flags (Reject Code)

```
❌ Controllers injecting Repository directly
❌ DTOs as mutable classes (should be records)
❌ Missing @PreAuthorize on write endpoints
❌ Raw Map<String, Object> returns
❌ Try/catch for HTTP errors (use GlobalExceptionHandler)
❌ Mappers without null checks
❌ Services without Idempotency documentation
❌ Test failures or compilation errors
❌ No multi-tenancy enforcement
❌ Security vulnerabilities in review
```

---

## 📚 Key Documents

- **menthoros-product/menthoros_ai_playbook.md** — Original playbook (now enhanced)
- **apps/menthoros-backend/CLAUDE.md** — Backend rules & standards
- **apps/menthoros-backend/docs/AI_CODE_GENERATION.md** — AI code gen guide
- **apps/menthoros-backend/docs/CONTROLLER_TEMPLATE.java** — Controller reference
- **apps/menthoros-backend/docs/SERVICE_TEMPLATE.java** — Service reference
- **menthoros-product/openspec/changes/[change-id]/** — Specification contracts

---

## 🎓 Training & Onboarding

New team members should:

1. Read menthoros-product/menthoros_ai_playbook.md (this file)
2. Read apps/menthoros-backend/CLAUDE.md thoroughly
3. Review docs/CONTROLLER_TEMPLATE.java + docs/SERVICE_TEMPLATE.java
4. Complete one small feature following this workflow
5. Get code review approval from senior engineer

---

## 🔗 Integration Points

### With menthoros-product/Plano_Implementacao_Skills_Menthoros.md

The domain-specific skills (interval-analysis, long-run-analysis, recovery-analysis) are SEPARATE from this development workflow and are used by:

- **Analytics Service** — Uses domain skills to analyze workouts
- **LLM Prompts** — Context-enriched with domain knowledge
- **User Feedback** — Educated recommendations from domain rules

These domain skills are loaded via `SkillLoader` and executed asynchronously after workout registration.

---

## 📈 Metrics & Success

### Per Feature
- Defect rate: <1% in production (from code review + testing)
- Development time: Actual vs OpenSpec estimate
- Test coverage: 80%+
- PR review turnaround: <24h

### Per Sprint
- Features shipped: On schedule
- Code review feedback time: <2h
- Test pass rate: 100%
- Zero security incidents

### Per Release
- Zero critical bugs
- 100% feature completion
- User satisfaction: >4.5/5

---

## 🚀 Next Steps

1. **Share this playbook** with entire team
2. **Update CLAUDE.md** if rules change (Done ✅)
3. **Create templates** for OpenSpec proposal/design (Done ✅)
4. **Establish code review SLA** — Max 24h turnaround
5. **Monthly retrospective** — How can we improve this workflow?

---

**Last Updated:** 2026-05-15  
**Owner:** Leandro Silva (Senior Engineer)  
**Status:** Active & Evolving
