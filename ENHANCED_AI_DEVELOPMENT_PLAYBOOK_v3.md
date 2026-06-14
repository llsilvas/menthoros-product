# Menthoros — Enhanced AI-First Development Playbook

**Data:** 2026-06-13
**Versão:** 3.0 (toolchain reconciliada + trilhas + subagentes)
**Status:** Proposta — convive com a v2.1 (`ENHANCED_AI_DEVELOPMENT_PLAYBOOK.md`) para comparação; substitui ao ser aprovada.

---

## Visão Geral

Workflow AI-first do Menthoros, do produto à entrega, com cada fase amarrada a uma skill **que existe de fato** no ambiente.

```
BMAD (Produto) → OpenSpec (Contrato) → Superpowers (Plano/Disciplina)
→ fullstack-dev-skills (Execução + Qualidade) → Playwright (E2E)
→ OpenSpec archive + SPRINTS (Loop)
```

### Filosofia

**Sem OpenSpec → não existe feature.** Toda implementação começa por especificação formal, nunca por código. A fonte canônica de regras de código é o `CLAUDE.md` de cada repo — este playbook **orquestra**, não duplica.

---

## O que muda da v2.1 para a v3.0 (para comparar)

1. **Skills Matrix reconciliada com a realidade.** Sai a lista aspiracional (`springboot-patterns`, `frontend-patterns`, `e2e-testing`, `nextjs-patterns` — que não são plugins); entram os equivalentes instalados do plugin **`fullstack-dev-skills`** + os plugins reais (BMAD, OpenSpec, Superpowers) com seus nomes corretos.
2. **Templates de OpenSpec corrigidos** para o formato real do repo (`Why / What Changes / Capabilities / Impact / Riscos`), não o genérico da v2.
3. **Stack correta:** Vite + React + MUI (sem Next.js); validação front por `lint` + `build` + `test:e2e` (não existe `npm test` unit).
4. **Duas trilhas:** Fast (XS/S) vs Full (M/L/XL) — fim do waterfall obrigatório para 1 dev solo.
5. **Subagentes em paralelo** na fase de qualidade, e **`the-fool`** (pre-mortem) no design.
6. **Gate de verificação real** (`/review`, `/security-review`, `test-master`) em vez de checklist manual.
7. **Loop fechado:** a última fase termina em `openspec-archive` + atualização do `SPRINTS.md`.
8. **Regras não duplicadas:** aponta para os `CLAUDE.md` em vez de repetir controller/DTO/red-flags.

---

## 0️⃣ Pré-requisitos — Toolchain (Claude Code CLI)

> O workflow roda no **Claude Code (CLI)**. Plugins se instalam **por ambiente** e não são compartilhados com o Cowork.

| Plugin | Cobre | Instalação |
|---|---|---|
| **BMAD-METHOD** | Produto (FASE 1) | `npx bmad-method install` |
| **OpenSpec** (Fission-AI) | Contrato (FASE 2/8) | `npx openspec init`; skills `openspec-proposal`/`openspec-apply`/`openspec-archive` |
| **Superpowers** (obra) | Plano + disciplina | `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace` |
| **everything-claude-code (ECC)** | Backend Spring: patterns, TDD, security, verification | marketplace ECC no Claude Code CLI |
| **fullstack-dev-skills** | Apoio: arquitetura, the-fool, React/TS, ops | já disponível como plugin |

Confira com `/plugin` que os quatro aparecem antes de começar.

---

## Skills Matrix (reconciliada)

### Por fase

| Fase | Skill primária | Apoio |
|------|----------------|-------|
| 1. Produto | `bmad` (agents PM/Arquiteto) | `feature-forge`, `architecture-designer`, **`the-fool`** (pre-mortem) |
| 2. Especificação | `openspec-proposal` | `api-designer`, `openspec-apply` |
| 3. Plano | `/write-plan` (Superpowers) | `/brainstorm` |
| 4. Backend | `springboot-patterns` + `springboot-tdd` (ECC) | `java-architect`, `database-optimizer`, `postgres-pro`, `/execute-plan` |
| 5. Qualidade | `code-reviewer` + `springboot-security` (ECC) | `springboot-verification` (ECC), `security-reviewer`, `test-master`, `debugging-wizard`, cmds `/review` `/security-review` |
| 6. Frontend | `react-expert` | `typescript-pro` |
| 7. E2E | `playwright-expert` | `test-master` |
| 8. Merge/Loop | Superpowers `finishing-a-development-branch` | `openspec-archive`, atualizar `SPRINTS.md` |

### Por tecnologia

| Tech | Skills |
|------|--------|
| Spring Boot / Java | `springboot-patterns`, `springboot-tdd` (ECC), `java-architect` |
| PostgreSQL / JPA | `database-optimizer`, `postgres-pro`, `sql-pro` |
| React / TypeScript | `react-expert`, `typescript-pro` |
| Testes | `springboot-tdd` (ECC), `test-master`, `playwright-expert` |
| Segurança | `springboot-security` (ECC), `security-reviewer`, `secure-code-guardian` |
| Resiliência/Ops | `devops-engineer`, `monitoring-expert`, `sre-engineer`, `chaos-engineer` |
| Modernização/dívida | `legacy-modernizer`, `debugging-wizard` |
| Decisão técnica | `deep-research`, `architecture-designer`, `the-fool` |

> **Backend Spring:** `springboot-patterns`, `springboot-tdd`, `springboot-security` e `springboot-verification` vêm do plugin **everything-claude-code (ECC)** — prefira-as nas fases de backend. `fullstack-dev-skills` cobre o que a ECC não tem (arquitetura, `the-fool`, React/TS, ops). (`frontend-patterns`/`e2e-testing`/`database-patterns` genéricos seguem cobertos por `react-expert`/`playwright-expert`/`database-optimizer`.)
> **Nota:** as skills `project:*` de `fullstack-dev-skills` assumem Jira/Atlassian — o tracker do Menthoros é OpenSpec + `SPRINTS.md`. Não use as `project:*` a menos que se adote Jira.

---

## Tamanho e Trilha

São duas coisas: **tamanho** é "quão grande/arriscada é a change"; **trilha** é "quanta cerimônia ela merece". Toda change declara as duas numa linha no topo do `proposal.md` — e isso é **automático**: o `openspec/config.yaml` tem uma regra que faz o `/opsx:propose` gerar `**Tamanho:** <…> · **Trilha:** <…>` no início de todo proposal.

### Passo 1 — Tamanho (T-shirt sizing)

Estimativa grosseira de esforço + risco + superfície (não horas):

| Tamanho | Significa | Exemplo |
|---|---|---|
| **XS** | trivial, 1 arquivo, sem lógica nova | default de config, ajuste de texto, um timeout |
| **S** | pequeno, poucos arquivos, lógica simples e isolada | 1 endpoint, 1 validação, 1 DTO |
| **M** | feature contida, multi-arquivo, alguma lógica de domínio | uma capability nova pequena |
| **L** | feature grande ou refactor estrutural, multi-camada/repo | decompor god service, RAG |
| **XL** | épico, vários sprints, alto risco/incerteza | nova área do produto |

### Passo 2 — Trilha (comece em Fast, suba se necessário)

Assuma **Fast** e **suba para Full** se *qualquer* critério bater: toca mais de um repo · muda contrato de API ou schema · há incerteza de design · há risco de segurança/multi-tenancy · estimou M+. Na dúvida, suba.

| | **Fast track** (XS/S) | **Full track** (M/L/XL) |
|---|---|---|
| FASE 1 (BMAD) | pular — 1 parágrafo de contexto no proposal | PRD/épicos completos |
| FASE 2 (OpenSpec) | `proposal.md` + `tasks.md` enxutos | + `design.md` + `specs/` |
| `the-fool` (pre-mortem) | opcional | obrigatório no design |
| Gate de qualidade (FASE 5) | `/review` + testes | `/qa` (code-reviewer ‖ security-reviewer ‖ `test-master`) |

`/implement`, o hook de teste e `/ship` são iguais nas duas — o que muda é o peso da frente (design + pre-mortem) e do gate.

### Exemplos reais

- `add-status-endpoint` → **S** → **Fast** (endpoint isolado, sem schema, sem tenant; sem `design.md`).
- `add-external-call-resilience` → **M/L** → **Full** (risco de disponibilidade + dependência nova).
- `refactor-iaservice-decomposition` → **L** → **Full** (refactor estrutural com risco de regressão; exige `design.md` + golden tests).

---

## 1️⃣ Produto (BMAD) — *Full track*

Quando: nova feature, decisão que afeta arquitetura. **Output:** PRD, épicos, histórias, riscos, arquitetura de alto nível.

- `bmad` para PRD e decomposição; `architecture-designer` para o desenho de alto nível.
- **Pre-mortem com `the-fool`** antes de fechar o design: "como esta abordagem falha?". Barato e pega god-service/acoplamento antes do código.

## 2️⃣ Especificação (OpenSpec) — *sempre*

Gera a change em `menthoros-product/openspec/changes/<change-id>/`. Use o **formato real do repo** (não o genérico):

**`proposal.md`:**
```markdown
## Why
## What Changes
## Capabilities
### Modified Capabilities
## Impact
## Riscos e mitigações
## Referências
```

**`tasks.md`** — checklist numerado, com validação embutida:
```markdown
## 1. <Seção>
- [ ] 1.1 <task granular>
- [ ] 1.2 Executar `./mvnw clean test` e confirmar verde
```

`design.md` só no Full track (API, data model, lógica, segurança, performance). `api-designer` ajuda a desenhar contratos REST antes de codar.

## 3️⃣ Plano (Superpowers)

`/write-plan` para transformar a change num plano de execução verificável antes de tocar código. `/brainstorm` quando houver mais de um caminho.

## 4️⃣ Backend (fullstack-dev-skills)

Quando: `design.md` aprovado. **Regra de ouro:** seguir `apps/menthoros-backend/CLAUDE.md` — controller→service→repository, DTOs como records, idempotência documentada, multi-tenancy, `GlobalExceptionHandler`, schema Flyway. **Este playbook não repete essas regras; elas vivem no CLAUDE.md.**

- `spring-boot-engineer` / `java-architect` para implementar a task.
- `database-optimizer` / `postgres-pro` para schema/queries.
- `/execute-plan` (Superpowers) para seguir o plano da FASE 3 task a task.
- Validar: `./mvnw clean test`.

## 5️⃣ Qualidade (subagentes em paralelo)

Quando: implementação completa, antes do push. **Rodar em paralelo** (são independentes):

- `code-reviewer` + comando `/review` — qualidade e arquitetura.
- `security-reviewer` / `secure-code-guardian` + `/security-review` — authz, tenant isolation, segredos, OWASP.
- `test-master` — força cobertura por **branch** e mutation (PIT), conforme o `CLAUDE.md` do backend já exige.
- `superpowers:verification-before-completion` como checagem final.

`debugging-wizard` se algo falhar. O gate é a execução desses, não um checklist manual.

## 6️⃣ Frontend (fullstack-dev-skills)

Quando: API backend pronta e testada. Seguir `apps/menthoros-front/CLAUDE.md` (MUI, hooks de dados, cliente OpenAPI gerado, design tokens).

- `react-expert` para componentes/hooks; `typescript-pro` para tipos.
- **Opcional (MCP Figma):** design-to-code quando houver design no Figma.
- Validar: `npm run lint` + `npm run build` (e `npm run test:e2e` se tocar fluxo crítico). **Não há `npm test` unit** — se introduzir testes unit, configurar Vitest + Testing Library como parte da change.

## 7️⃣ E2E (Playwright)

`playwright-expert` para cenários de happy path, erro e fronteiras multi-tenant. Validar: `npm run test:e2e`. Cobrir os fluxos críticos do change.

## 8️⃣ Merge & Loop (fechar o ciclo)

- `superpowers:finishing-a-development-branch` + `requesting-code-review`: PR com `change-id` no corpo, merge `--no-ff` em `develop` (ver `CLAUDE.md` raiz, "Diretrizes de Git").
- **Fechar o loop OpenSpec:** marcar `tasks.md`, `openspec-archive` para `changes/archive/YYYY-MM/`, e **atualizar a linha da change no `SPRINTS.md`**. (A v2 não fazia isso — era o elo perdido.)

---

## MCPs opcionais no fluxo

- **Figma** — design-to-code na FASE 6.
- **Notion** — PRD/discovery na FASE 1, se for o canal de produto.

Use só se já fizerem parte do processo de vocês; não são obrigatórios.

---

## Regras e Red Flags

Não duplicadas aqui de propósito. Fonte canônica:
- Backend: `apps/menthoros-backend/CLAUDE.md` (Controller/Service/DTO/Mapper Standards, Skill Testing, Service Decomposition, External Call Resilience, Red Flags).
- Frontend: `apps/menthoros-front/CLAUDE.md`.
- Transversal/Git/OpenSpec: `CLAUDE.md` raiz.

O gate automatizado da FASE 5 (`/review`, `/security-review`) valida contra essas regras.

---

## Métricas acionáveis (auto-mensuráveis)

Trocadas as metas de vaidade por sinais que se medem sozinhos:

- `./mvnw clean test` verde (gate de merge).
- Cobertura por **branch** (jacoco) + **mutation** (PIT) na lógica crítica — não só % de linha.
- `npm run lint` + `npm run build` verdes; `test:e2e` verde em fluxo crítico.
- Change arquivada e `SPRINTS.md` atualizado ao fechar.

---

## Onboarding (dev novo)

1. Instalar a toolchain (FASE 0).
2. Ler `CLAUDE.md` raiz + do módulo que vai tocar.
3. Pegar uma change XS pela **Fast track** ponta a ponta.
4. Passar pelo gate de qualidade (FASE 5) e fechar o loop (FASE 8).

---

**Last Updated:** 2026-06-13
**Owner:** Leandro Silva (Senior Engineer)
**Status:** Proposta (v3.0) — comparar com v2.1 e promover
