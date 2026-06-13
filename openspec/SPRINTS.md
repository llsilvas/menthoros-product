# Menthoros — Planejamento por Sprint

Ordem de execução das changes ativas, organizada por sprint. **Prioridade: base de IA primeiro**, com features visíveis do treinador intercaladas para preservar time-to-value.

**Última atualização:** 2026-06-13
**Fonte canônica de especificação:** `changes/<change-id>/` (estrutura flat — este doc NÃO move pastas)
**Roadmap por ondas/dependências:** `ROADMAP.md`
**Capacidade assumida:** 1 dev (solo/CTO), sprints de 2 semanas (~1 change média por sprint; changes grandes ocupam 2+).

---

## Como ler este documento

- `changes/` permanece **flat**. O sprint é um *atributo* da change, representado aqui — não na hierarquia de diretórios. Isso evita `git mv` em cascata a cada repriorização e preserva a identidade `change-id = nome da pasta` que o OpenSpec e o fluxo de archive (`changes/archive/YYYY-MM/`) assumem.
- Cada change é referenciada pelo seu `change-id`. Para o conteúdo, ver `changes/<change-id>/`.
- Ao concluir uma change: marcar `tasks.md`, mergear em `develop` e arquivar em `changes/archive/YYYY-MM/`. Atualizar a linha correspondente aqui.

---

## Princípio de ordenação desta versão

1. **Identidade mínima destrava tudo.** Endpoints de "quem sou eu" + onboarding de tenant são baratos e bloqueiam frontend e testes.
2. **Base de IA antes das features de IA.** Contratos de skills, confiabilidade de parsing e tool calling vêm antes de empilhar capabilities sobre LLM.
3. **RAG antes do que o consome.** O inbox de sugestões e a prescrição lesão-aware ficam muito melhores com citações e fundamentação — entram depois da infra RAG.
4. **Feature visível a cada ~2 sprints de infra.** A base de IA é invisível ao treinador; intercalar entregas demonstráveis mantém feedback e moral.

---

## Bloco 0 — Identidade mínima (desbloqueio)

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 1 | `add-current-user-endpoint` | 10 | "Quem sou eu" → roteia shell coach/atleta, resolve contexto. | — |
| 1 | `add-assessoria-onboarding` | 1 restante (23/24) | Fechar a última task. Base de tenant + role ATLETA. | — |

---

## Bloco 1 — Base de IA (núcleo da repriorização)

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 2–3 | `build-skills-core-foundation` | 30 | **A base.** Contratos `DomainSkill`/`SkillContext`/`SkillResult`, `SkillRegistry`, `SkillOrchestratorService`, persistência audit-first, integração mínima com geração de plano. | Bloco 0 |
| 4–5 | `debito-tecnico-camada-ia` | 41 | Confiabilidade: corrige parsing frágil de JSON do LLM, versiona prompts, melhora rastreabilidade/custo. Gate antes de empilhar mais IA. | skills-core |
| 6 | `add-coach-shell-dashboards` *(visível)* | 16 | Roster + calendário semanal + KPIs por tenant. Primeira "casa" do treinador; roda sobre dados já existentes. | Bloco 0 |
| 7–8 | `add-llm-tool-use` | 35 | Tool calling: LLM pede dado sob demanda, decisões auditáveis, fim do prompt monolítico. | skills-core, débito-técnico |
| 9 | `add-coach-attention-queue` + `add-recommendation-explainability` *(visível)* | 13 + 9 | Fila diária de atenção + camada de explicabilidade. Hook diário do treinador. | shell-dashboards |
| 10–12 | `rag-tool-calling-prescription-engine` | 64 | Infra RAG (`PgVectorStore`) + motor de prescrição fundamentado em metodologia. Destrava a família `rag-*`. | llm-tool-use |
| 13 | `add-coach-suggestion-inbox` *(visível)* | 21 | Workflow aprovar/rejeitar/ajustar sugestões IA — **centro do coach-in-the-loop**. Melhor agora, com citações do RAG. | RAG, explainability, attention-queue |
| 14 | `llm-code-switching` | 21 | Otimização PT/EN (assertividade + custo). | llm-tool-use |
| 15 | `rag-injury-aware-prescription` | 24 | Prescrição lesão-aware: protocolos de retorno, sessões contraindicadas, escalonamento de bandeira-vermelha. | RAG, explainability, attention-queue |
| 16 | `rag-coach-methodology-personalization` | 29 | Aprende com planos aprovados/editados — personaliza para a "voz do coach". | RAG, explainability |

---

## Bloco 2 — Fechamento da jornada do treinador (coach-in-the-loop completo)

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 17 | `add-athlete-progress-endpoints` | 22 | Curva PMC, distribuição de zonas, PRs, readiness, resumo de hoje. Base da revisão profunda do atleta. | Bloco 0 |
| 18 | `add-post-workout-debrief` + `add-weekly-athlete-review` | 17 + 12 | Planejado vs realizado + consolidação semanal. Fecha o loop pós-execução. | progress-endpoints; débito-técnico (parsing confiável) |
| 19 | `strava-oauth` + `strava-activity-sync` | 20 + 12 restantes (43/55) | Dado real mínimo viável: conexão + sync/reconciliação manual. | Bloco 0 |
| 20 | `add-athlete-coach-messaging` | 23 | Mensageria atleta↔coach + cards de `plan_adjustment`. Item mais independente. | Bloco 0 |

> **Fronteira do MVP (jornada completa coach-in-the-loop):** ao fim do Sprint 20, a jornada está entregue — identidade → casa do treinador → fila de atenção → sugestão IA explicável → revisão do atleta → debrief → revisão semanal → dado real (Strava mínimo) → mensageria.

---

## Bloco de Segurança (pré-exposição a usuários reais)

Independente da ordem acima, estas changes **devem aterrissar antes de abrir para usuários reais** (beta). Encaixar conforme a data de exposição planejada — não depois.

Ordenadas por criticidade dentro do bloco: segurança (exposição de dados) antes de disponibilidade.

| Change | Tasks | Objetivo |
|---|:---:|---|
| `complete-authorization-controllers` | 29 | Fecha brechas de autorização nos controllers restantes. |
| `keycloak-user-onboarding-auth` | 28 | Provisionamento consistente Keycloak↔domínio + login backend. Adiantar a parte de onboarding se o cadastro de novos tenants for necessário no beta. |
| `add-external-call-resilience` | ~21 | Timeouts (LLM/Strava), circuit breaker (Resilience4j) e retry seguro para LLM/Keycloak/Strava. Sem isso, uma dependência externa lenta/fora do ar segura threads e degrada o sistema inteiro — risco direto ao expor a usuários reais. |

---

## Pós-MVP — backlog priorizado por ROI de continuidade

**Aceleradores de qualidade (logo após o MVP):**
`add-daily-readiness-checkin` (29) — melhor sinal para a fila de atenção · `progressao-treinos` (30) — envelope técnico confiável · `add-zone-confidence-management` (12) — confiança nas zonas.

**Dívida técnica estrutural:**
`refactor-iaservice-decomposition` (~26) — decompõe `IaServiceImpl` (~1500 linhas: schema + geração + validação) em colaboradores testáveis, sem mudança de comportamento. **Sequenciar logo após `debito-tecnico-camada-ia`** (mesma classe) para não re-inflar; não é bloqueante de feature nem de beta, por isso fica no pós-MVP.

**Refino do motor analítico:**
`refine-tss-tsb-precision` (45) · `add-continuous-daily-load-management` (21) · `validate-interval-workout-standards` (79) · `add-running-field-tests` (35).

**Capabilities de produto avançadas:**
`add-race-evaluation-skill` (77) · `add-taper-guidance` (29) · `add-macrociclo-structure` (36).

**Strava avançado:**
`strava-async-import` (88, backfill 90d) · `strava-webhooks` (23) · `strava-conditional-insights` (48) · `strava-risk-semaphore` (59).

**Lançamento:**
`marketing-landing-page` (17).

**Guarda-chuva (absorvido / não implementar como bloco único):**
`introduce-coach-assistant-core-features` — conteúdo distribuído entre as changes do Bloco 1/2.

---

## Changes concluídas (fora de sprint)

| Change | Tasks | Conclusão | Arquivo |
|---|:---:|:---:|---|
| `add-status-endpoint` | 13/13 | 2026-06-13 | `changes/archive/2026-06/2026-06-13-add-status-endpoint/` — cobaia do workflow `/implement → /qa → /ship`; endpoint público `GET /api/v1/status`. |

---

## Nota de capacidade

Com 1 dev, o caminho completo até a fronteira do MVP (Bloco 0 + 1 + 2) é da ordem de **~20 sprints / ~40 semanas**, sem contar o Bloco de Segurança. Trade-off explícito da escolha IA-first: a base fica robusta, mas o treinador só vê a jornada madura no fim.

**Fast-track sugerido** (se quiser antecipar o "momento de valor" sem abrir mão da base): Bloco 0 → `build-skills-core-foundation` → `debito-tecnico-camada-ia` → `add-coach-shell-dashboards` → `add-coach-attention-queue` + `add-recommendation-explainability`. Entrega um treinador operando sobre uma base de IA já sólida, e o RAG/personalização entram no "MVP+1".
