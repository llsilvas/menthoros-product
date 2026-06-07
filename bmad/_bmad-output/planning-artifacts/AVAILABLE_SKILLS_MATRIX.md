# Menthoros - Available Claude Code Skills Matrix

**Data:** 2026-05-15  
**Total Skills Disponíveis:** 150+  
**Skills Recomendados para Menthoros:** 35+

---

## 📊 Categorias de Skills

### 1. **PRODUCT & STRATEGY** 🎯

Usados na FASE 1 (BMAD) - Product Design

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `bmad-brainstorming` | Gerar ideias, explorar alternativas, validar conceitos | Ideia nova, decisão estratégica | "Quais são os 3 cenários possíveis para o dashboard de coach?" |
| `bmad-advanced-elicitation` | Extrair requisitos profundos, stakeholder interviews | Entender problema complexo | "Quais são as necessidades reais do coach?" |
| `bmad-help` | Guia geral do BMAD framework | Entender processo BMAD | "Como funciona o framework BMAD?" |
| `product-lens` | Análise de viabilidade, impacto de produto | Avaliar feature request | "Qual é o impacto no roadmap?" |
| `market-research` | Pesquisa de mercado, análise competitiva | Benchmarking, análise competitor | "Quem mais oferece dashboard de analytics?" |

---

### 2. **SPECIFICATION & ARCHITECTURE** 📐

Usados na FASE 2 (OpenSpec) - Specification Design

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `openspec-propose` | Gerar completa OpenSpec (proposal + design + tasks) em 1 step | SEMPRE antes de implementar | "Crie OpenSpec para coach-analytics feature" |
| `openspec-explore` | Pensar através de detalhes, explorar alternativas | Antes de design.md | "Quais são os cenários de erro?" |
| `openspec-apply-change` | Executar tasks de OpenSpec | Durante implementação | "Implemente task 1 de coach-analytics" |
| `architecture-designer` | Design de arquitetura, padrões, decisões | Arquitetura complexa | "Como estruturar o analytics service?" |
| `architecture-decision-records` | Documentar decisões arquiteturais | Decisões importantes | "Por que escolhemos Event Sourcing?" |
| `hexagonal-architecture` | Padrão hexagonal/ports-adapters | Refatoração arquitetural | "Como reorganizar em hexagonal?" |
| `api-design` | Design de REST API, contracts | Antes de controller | "Como estruturar o endpoint /analytics?" |
| `database-migrations` | Padrões de migração de dados | Schema changes | "Como migrar dados para novo schema?" |

---

### 3. **BACKEND DEVELOPMENT** ⚙️

Usados na FASE 3 (Backend Implementation)

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `springboot-patterns` | **⭐ PRINCIPAL** Padrões Spring Boot, estrutura | Toda feature backend | "Gere controller seguindo CLAUDE.md" |
| `springboot-tdd` | TDD workflow para Spring Boot | Desenvolvimento com testes | "Escreva teste RED para analytics service" |
| `springboot-security` | Spring Security, autorização, JWT | Endpoints sensíveis | "Como implementar @PreAuthorize?" |
| `springboot-verification` | Verificação de padrões Spring Boot | Antes de PR | "Verifique se segue padrões" |
| `backend-patterns` | Padrões backend genéricos | Design de serviços | "Como estruturar cache?" |
| `jpa-patterns` | JPA, Hibernate, relacionamentos | ORM & queries | "Como fazer LAZY loading?" |
| `database-patterns` | Padrões PostgreSQL, índices, queries | Otimização | "Qual índice criar?" |
| `postgres-patterns` | PostgreSQL específico | Queries complexas | "Como fazer full-text search?" |
| `java-architect` | Java enterprise architecture | Design de camadas | "Como reorganizar pacotes?" |
| `java-coding-standards` | Padrões Java, idiomas | Code quality | "Qual é o padrão correto?" |

**Mandatory Stack:**
- `springboot-patterns` — SEMPRE
- `springboot-tdd` — Para features novas
- `springboot-security` — Para auth/authz
- `jpa-patterns` — Para domain modeling

---

### 4. **CODE QUALITY & REVIEW** ✅

Usados na FASE 4 (Code Quality)

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `code-review` | **⭐ PRINCIPAL** Code review de qualidade | Antes de PR | "Revise este controller" |
| `security-review` | Security audit, OWASP | Features sensíveis | "Há vulnerabilidades?" |
| `simplify` | Remover código desnecessário | Depois de implementação | "Simplifique este código" |
| `refactor-cleaner` | Dead code cleanup | Antes de merge | "Remova código morto" |
| `typescript-review` | TypeScript code review | Frontend/TypeScript | "Type safety correto?" |
| `cpp-review` | C++ code review | N/A para Menthoros | — |
| `go-review` | Go code review | N/A para Menthoros | — |
| `rust-review` | Rust code review | N/A para Menthoros | — |
| `python-review` | Python code review | N/A para Menthoros | — |

**Mandatory Stack:**
- `code-review` — SEMPRE antes de merge
- `security-review` — Features com auth/dados sensíveis
- `simplify` — Depois de implementação

---

### 5. **TESTING** 🧪

Usados na FASE 6 (Testing)

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `e2e-testing` | **⭐ PRINCIPAL** Gerar testes E2E com Playwright | Depois de frontend | "Gere testes E2E para analytics" |
| `e2e-runner` | Executar testes E2E, troubleshooting | CI/CD, debugging | "Rode testes E2E" |
| `playwright-expert` | Padrões Playwright | Testes complexos | "Como testar multi-tenancy?" |
| `browser-qa` | Browser automation QA | Manual testing | "Teste manualmente este fluxo" |
| `tdd-workflow` | **⭐ ALTERNATIVA** TDD workflow completo | Desenvolvimento dirigido por testes | "Escreva teste primeiro" |
| `springboot-tdd` | TDD para Spring Boot | Backend TDD | "TDD test RED para service" |
| `python-testing` | Python testing patterns | N/A para Menthoros | — |
| `golang-testing` | Go testing patterns | N/A para Menthoros | — |
| `rust-testing` | Rust testing patterns | N/A para Menthoros | — |

**Mandatory Stack:**
- `e2e-testing` — SEMPRE para features críticas
- `springboot-tdd` — Para backend features

---

### 6. **FRONTEND DEVELOPMENT** 🎨

Usados na FASE 5 (Frontend)

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `frontend-patterns` | Padrões frontend, componentes, state | Toda feature frontend | "Estruture o dashboard" |
| `frontend-design` | UI/UX component design, layouts | Design de components | "Como estruturar o card?" |
| `frontend-slides` | Apresentações, demos frontend | Démonstration | "Crie slide demo" |
| `nextjs-patterns` | Next.js 4 patterns (se usar Next) | Se stack = Next.js | "Qual é o padrão para SSR?" |
| `nuxt4-patterns` | Nuxt 4 patterns (se usar Nuxt) | Se stack = Vue/Nuxt | "Nuxt patterns" |
| `angular-architect` | Angular architecture | N/A se stack ≠ Angular | — |
| `react-expert` | React patterns | Se stack = React | "React hooks patterns" |
| `vue-expert` | Vue patterns | Se stack = Vue | "Vue composition API" |

**Current Stack:** React/Next.js (verifique)
- `frontend-patterns` — SEMPRE
- `frontend-design` — Para UI/UX
- `nextjs-patterns` — Se using Next.js

---

### 7. **SECURITY** 🔒

Usados throughout - especialmente FASE 3, 4

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `security-review` | **⭐ PRINCIPAL** Audit de segurança | Toda feature com dados/auth | "Há vulnerabilidades?" |
| `springboot-security` | Spring Security patterns | Auth/authz features | "Como usar @PreAuthorize?" |
| `secure-code-guardian` | Padrões secure coding | Code review security | "É safe?" |
| `healthcare-phi-compliance` | HIPAA compliance (se relevante) | Dados sensíveis | "Está HIPAA compliant?" |

**Mandatory Stack:**
- `security-review` — Toda feature nova
- `springboot-security` — Features de auth

---

### 8. **DEVOPS & DEPLOYMENT** 🚀

Para integração com CI/CD

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `deployment-patterns` | Padrões deploy, zero-downtime | Antes de release | "Como fazer blue-green?" |
| `docker-patterns` | Docker, containers | Deploy strategy | "Qual é a Dockerfile?" |
| `kubernetes-specialist` | Kubernetes (se usar k8s) | Orquestração | "Como escalar?" |

---

### 9. **GIT & WORKFLOWS** 📝

Usados na FASE 7 (Merge & Deploy)

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `git-workflow` | Git best practices, branching | Merge strategy | "Qual é a estratégia?" |
| `superpowers:finishing-a-development-branch` | Finalizar branch, squash, PR | Antes de merge | "Finalize a branch" |
| `superpowers:requesting-code-review` | Criar PR, request review | Submeter para review | "Crie PR" |

---

### 10. **UTILITIES & HELPERS** 🛠️

Suporte transversal

| Skill | Descrição | Quando Usar | Exemplo |
|-------|-----------|------------|---------|
| `context-budget-advisor` | Gerenciar context window | Token budget analysis | "Há tokens sobrando?" |
| `token-budget-advisor` | Análise de gasto de tokens | Planning | "Quanto custa isto?" |
| `documentation-lookup` | Lookup de documentação | Pesquisa de libs | "Como usar esta lib?" |
| `claude-api` | Claude API patterns | Se usar Claude API | "Como usar prompt caching?" |
| `prompts-optimize` | Otimizar prompts | Tuning | "Este prompt é eficiente?" |
| `continuous-learning` | Learning resources | Onboarding | "Recomende recursos" |
| `skill-health` | Health check de skills | Maintenance | "Qual skill está obsoleto?" |

---

## 🎯 Menthoros-Specific Recommendations

### **Tier 1: MUST USE** (Obrigatório)

```
PHASE 1 (Product):
  - bmad-brainstorming
  - product-lens

PHASE 2 (Specification):
  - openspec-propose
  - architecture-decision-records

PHASE 3 (Backend):
  - springboot-patterns
  - springboot-security
  - jpa-patterns

PHASE 4 (Quality):
  - code-review
  - security-review

PHASE 5 (Frontend):
  - frontend-patterns
  - frontend-design

PHASE 6 (Testing):
  - e2e-testing
  - springboot-tdd

PHASE 7 (Deploy):
  - git-workflow
  - superpowers:finishing-a-development-branch
```

### **Tier 2: SHOULD USE** (Recomendado)

```
- database-patterns (complex queries)
- hexagonal-architecture (refactoring)
- springboot-verification (before PR)
- simplify (code cleanup)
- api-design (complex APIs)
- nextjs-patterns (frontend complex)
- tdd-workflow (alternate TDD)
```

### **Tier 3: NICE TO HAVE** (Opcional)

```
- bmad-advanced-elicitation (complex requirements)
- postgres-patterns (performance tuning)
- refactor-cleaner (dead code)
- deployment-patterns (deploy strategy)
- market-research (competitive analysis)
- architecture-designer (major refactor)
```

### **NOT APPLICABLE FOR MENTHOROS**

```
- C++, Go, Rust, Python, Perl specific skills
- Android, iOS, Kubernetes specific
- HIPAA compliance (unless health data involved)
- Shopify, WordPress, Rails, Laravel stacks
```

---

## 📈 Skill Usage Statistics (Recommended)

### Per Sprint
- `springboot-patterns` — 80% of backend tasks
- `code-review` — 100% of completed tasks
- `security-review` — 30% of features (auth-heavy)
- `e2e-testing` — 50% of features (critical paths)
- `frontend-patterns` — 80% of frontend tasks

### Per Feature (Medium Complexity)
- Time spent: ~40h development
- Skills used: 6-8 different skills
- Cost: ~30-40 minutes equivalent AI time

---

## 🔄 Skill Integration Workflow

### Example: "Coach Analytics Dashboard" Feature

```
1. BMAD (2h)
   ✅ bmad-brainstorming
   ✅ product-lens
   Output: PRD + Épicos

2. OpenSpec (3h)
   ✅ openspec-propose
   ✅ architecture-decision-records
   Output: proposal.md, design.md, tasks.md

3. Backend Task 1 (4h)
   ✅ springboot-patterns (generate controller)
   ✅ springboot-tdd (write tests)
   ✅ jpa-patterns (optimize queries)
   ✅ springboot-security (add @PreAuthorize)
   Output: Tested backend code

4. Code Review (1h)
   ✅ code-review
   ✅ security-review
   ✅ simplify
   Output: Review feedback + approval

5. Frontend (3h)
   ✅ frontend-patterns
   ✅ frontend-design
   Output: React components

6. E2E Testing (2h)
   ✅ e2e-testing
   ✅ playwright-expert
   Output: Playwright tests

7. Deploy (1h)
   ✅ git-workflow
   ✅ superpowers:finishing-a-development-branch
   Output: Merged PR

TOTAL: ~16h (4 days, 1 developer)
```

---

## 💡 Pro Tips

### 1. **Stack Skills in Sequence**
```
Don't: "Implement and review in one request"
Do: "Implement (springboot-patterns)" → then → "Review (code-review)"
```

### 2. **Use Templates from Docs**
```
Every skill request should reference:
- apps/menthoros-backend/CLAUDE.md
- apps/menthoros-backend/docs/CONTROLLER_TEMPLATE.java
- apps/menthoros-backend/docs/SERVICE_TEMPLATE.java
```

### 3. **Security-First Approach**
```
Always include security-review AFTER initial implementation
Never skip security for speed
```

### 4. **Test-First Mindset**
```
Use springboot-tdd or tdd-workflow
Write tests BEFORE implementation
Use TDD RED → GREEN → REFACTOR
```

### 5. **Documentation in Code**
```
Use code-review to ensure:
- JavaDoc on all public methods
- @Operation + @ApiResponses on controllers
- @Schema on DTOs
```

---

## 🚀 Next Steps

1. **Create Team Playbook** (Using ENHANCED_AI_DEVELOPMENT_PLAYBOOK.md)
2. **Define Default Skill Stack per Role:**
   - Backend Engineer: springboot-patterns, code-review, security-review
   - Frontend Engineer: frontend-patterns, e2e-testing
   - Tech Lead: openspec-propose, architecture-designer
3. **Set Up Skill SLA:**
   - Code review response: <2h
   - Security review: <24h
   - Architecture review: <48h
4. **Monitor Skill Effectiveness** via metrics
5. **Update This Matrix Quarterly** as new skills arrive

---

**Last Updated:** 2026-05-15  
**Owner:** Leandro Silva  
**Status:** Active  
**Review Cycle:** Quarterly
