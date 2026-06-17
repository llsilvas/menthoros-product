# Menthoros — Planejamento por Sprint

Ordem de execução das changes ativas, organizada por sprint. **Prioridade: base de IA primeiro**, com features visíveis do treinador intercaladas para preservar time-to-value.

**Última atualização:** 2026-06-16 (eval-harness mergeado; rede de regressão pronta antes da migração formatters→skills)
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

## Bloco 0 — Identidade mínima (desbloqueio) — ✅ CONCLUÍDO (Sprint 1, 2026-06-16)

Sprint 1 encerrada: ambas as changes mergeadas em `develop` e arquivadas (ver "Changes concluídas").

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 1 | ~~`add-current-user-endpoint`~~ ✅ | 13/13 | "Quem sou eu" → roteia shell coach/atleta, resolve contexto. | — |
| 1 | ~~`add-assessoria-onboarding`~~ ✅ | 24/24 | Base de tenant + role ATLETA. **Infra Keycloak de produção pendente** (operacional — runbook). | — |

---

## Bloco 1 — Base de IA (núcleo da repriorização)

### 🤖 Guarda-chuva: Modernização do motor de IA

Thread única que moderniza a geração de plano — **skills determinísticas como fonte do prompt** (não mais um monólito de formatters), com rede de testes e estratégia EN/PT, reduzindo alucinação. Marcada com 🤖 na tabela abaixo. Ordem e dependências:

```
skills-core ✅ ─▶ add-plan-generation-eval-harness ─▶ migrate-plan-prompt-to-skills ─▶ llm-code-switching
   (fundação)        (rede: golden-master + eval)        (formatters → skills)            (EN/PT do que sobrar)
                                  │
                                  └▶ debito-tecnico-camada-ia ─▶ add-llm-tool-use ─▶ RAG family
                                     (confiabilidade / gate)      (dado sob demanda)   (fundamentação)
```

- **eval-harness** é a rede; **migrate-prompt** é o coração do objetivo ("organizado e testável", menos alucinação); **code-switching** vem **depois** da migração (não traduzir formatters que serão aposentados).
- **debito-tecnico** (structured output, versionamento de prompt, routing) e **add-llm-tool-use** (dado sob demanda) são camadas complementares; a família **RAG** fundamenta a prescrição.
- `refactor-iaservice-decomposition` (Pós-MVP) é a irmã estrutural — mesma classe `IaServiceImpl`; coordenar janela com a migração.

As features visíveis do treinador (`shell-dashboards`, `attention-queue`, `explainability`, `suggestion-inbox`) ficam **intercaladas** na tabela para preservar time-to-value — não fazem parte do guarda-chuva. Cadência: entregável visível a cada ~3 sprints de infra (sprint 5, 9, 15). O trecho 10–14 (`tool-use` + `rag-tool-calling`) é a única maratona de infra remanescente — **estrutural**, pois `suggestion-inbox` depende do RAG e não pode vir antes.

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| — | 🤖 ~~`build-skills-core-foundation`~~ ✅ superada | 30 | **Fundação de skills já em `develop`** (contratos, `SkillRegistry`, `SkillOrchestratorService`, persistência `V32`, 7+ skills) — entregue por `introduce-domain-skills-architecture` + follow-ups. Arquivada como superada (ver "Changes concluídas"). | Bloco 0 |
| 2 | 🤖 ~~`add-plan-generation-eval-harness`~~ ✅ | S | **A rede (mínima).** Golden-master de `buildOptimizedPrompt` (533 linhas → 707 testes). Trilho de regressão ANTES da migração de formatters. Reescopada (product-lens): o `PlanQualityChecker` vai na migração; eval ao vivo no Pós-MVP. | skills-core (em develop) |
| 3–4 | 🤖 `debito-tecnico-camada-ia` | 41 | Confiabilidade: corrige parsing frágil de JSON do LLM, versiona prompts, melhora rastreabilidade/custo. Gate antes de empilhar mais IA. | eval-harness |
| 5 | `add-coach-shell-dashboards` *(visível)* | 16 | Roster + calendário semanal + KPIs por tenant. Primeira "casa" do treinador; roda sobre dados já existentes. Adiantada para quebrar a maratona de infra (depende só do Bloco 0). | Bloco 0 |
| 6–8 | 🤖 `migrate-plan-prompt-to-skills` | L/XL | **O coração.** Migração strangler: a lógica determinística dos 8 formatters vira/usa skills; `PromptBuilder` vira montador fino sobre o `AthleteAnalysisSnapshot`; formatters retraídos. Organizado, testável, menos alucinação. Cada domínio validado contra o golden-master + constrói uma regra do `PlanQualityChecker`. | eval-harness |
| 9 | `add-coach-attention-queue` + `add-recommendation-explainability` *(visível)* | 13 + 9 | Fila diária de atenção + camada de explicabilidade. Hook diário do treinador. | shell-dashboards |
| 10–11 | 🤖 `add-llm-tool-use` | 35 | Tool calling: LLM pede dado sob demanda, decisões auditáveis, fim do prompt monolítico. | skills-core, débito-técnico |
| 12–14 | 🤖 `rag-tool-calling-prescription-engine` | 64 | Infra RAG (`PgVectorStore`) + motor de prescrição fundamentado em metodologia. Destrava a família `rag-*`. | llm-tool-use |
| 15 | `add-coach-suggestion-inbox` *(visível)* | 21 | Workflow aprovar/rejeitar/ajustar sugestões IA — **centro do coach-in-the-loop**. Melhor agora, com citações do RAG. | RAG, explainability, attention-queue |
| 16 | 🤖 `llm-code-switching` | 21 | Otimização PT/EN (assertividade + custo). Reduzida pela migração — skills já emitem estrutura EN / valores PT. | migrate-plan-prompt, llm-tool-use |
| 17 | 🤖 `rag-injury-aware-prescription` | 24 | Prescrição lesão-aware: protocolos de retorno, sessões contraindicadas, escalonamento de bandeira-vermelha. | RAG, explainability, attention-queue |
| 18 | 🤖 `rag-coach-methodology-personalization` | 29 | Aprende com planos aprovados/editados — personaliza para a "voz do coach". | RAG, explainability |

---

## Bloco 2 — Fechamento da jornada do treinador (coach-in-the-loop completo)

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 19 | `add-athlete-progress-endpoints` | 22 | Curva PMC, distribuição de zonas, PRs, readiness, resumo de hoje. Base da revisão profunda do atleta. | Bloco 0 |
| 20 | `first-party-ingestion-architecture` | ~23 | **Dado real first-party e ML-safe:** upload de `.fit` + entrada manual, dedup cross-source, tenant guard, compute-on-import. Roda no front web atual; sem API de terceiros. Substitui o Strava como ingestão do MVP. | Bloco 0 |
| 21 | `add-workout-metrics-analyzer` | ~22 | Métricas determinísticas (tempo em zona, decoupling) + skill `workout-analyzer` (proposta ao treinador). Reconcilia o `WorkoutAnalysisListener` existente. | first-party-ingestion; suggestion-inbox |
| 22 | `add-post-workout-debrief` + `add-weekly-athlete-review` | 17 + 12 | Planejado vs realizado + consolidação semanal — agora sobre métricas reais. | metrics-analyzer; progress-endpoints |
| 23 | `add-athlete-coach-messaging` | 23 | Mensageria atleta↔coach + cards de `plan_adjustment`. Item mais independente. | Bloco 0 |

> **Fronteira do MVP (jornada completa coach-in-the-loop):** ao fim do Sprint 23, a jornada está entregue — identidade → casa do treinador → fila de atenção → sugestão IA explicável → revisão do atleta → **dado real first-party (upload `.fit`)** → métricas + análise → debrief → revisão semanal → mensageria.
>
> **Mudança estratégica de ingestão:** o MVP passa a usar **ingestão first-party** (FIT upload/manual) em vez do Strava. Dado *ownable* e ML-safe; a família `strava-*` fica **deferida** (ver pós-MVP) — alinhado à arquitetura, que proíbe treinar o ML acceptance predictor com dado da API do Strava.

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

**Eval ao vivo da geração de plano (Camada C, deferida):**
Eval que chama o LLM real e pontua a qualidade do plano gerado (aderência + heurísticas), reaberta quando houver **uso real** para baseline de comparação. Saiu de `add-plan-generation-eval-harness` no reescopo product-lens (golden-master + checker determinístico cobrem o de-risco da migração sem custo/flakiness de LLM).

**Capabilities de produto avançadas:**
`add-race-evaluation-skill` (77) · `add-taper-guidance` (29) · `add-macrociclo-structure` (36).

**Strava (deferido atrás de clareza legal):**
A família `strava-*` — `strava-oauth` (20) · `strava-activity-sync` (12 restantes) · `strava-async-import` (88, backfill 90d) · `strava-webhooks` (23) · `strava-conditional-insights` (48) · `strava-risk-semaphore` (59) — **sai do caminho do MVP**. Só entra com (a) clareza legal sobre uso inference-only e (b) caminho de exibição por atleta que satisfaça a restrição do Strava (nov/2024). **Nunca** alimentar o ML acceptance predictor com dado da API do Strava.

**Onda mobile (futura — depende da decisão de construir app mobile):**
`add-health-connect-ingestion` (~22) — read layer on-device (Health Connect/HealthKit) para sync first-party automático. O **importer backend já entra no `first-party-ingestion-architecture`** (testável via POST); só o read layer mobile fica gated num shell Android/iOS/RN, que ainda não existe.

**Lançamento:**
`marketing-landing-page` (17).

**Guarda-chuva (absorvido / não implementar como bloco único):**
`introduce-coach-assistant-core-features` — conteúdo distribuído entre as changes do Bloco 1/2.

---

## Changes concluídas (fora de sprint)

| Change | Tasks | Conclusão | Arquivo |
|---|:---:|:---:|---|
| `add-status-endpoint` | 13/13 | 2026-06-13 | `changes/archive/2026-06/2026-06-13-add-status-endpoint/` — cobaia do workflow `/implement → /qa → /ship`; endpoint público `GET /api/v1/status`. |
| `add-current-user-endpoint` | 13/13 | 2026-06-16 | `changes/archive/2026-06/2026-06-16-add-current-user-endpoint/` — `GET /api/v1/users/me`; DIP no service + `@WebMvcTest` (current-user-quality-debt foldada). |
| `reject-inactive-users` | ✓ | 2026-06-16 | `changes/archive/2026-06/2026-06-16-reject-inactive-users/` — `JwtTenantFilter` rejeita `ativo=false` com 423 (fail-safe via leitura direta / 503). |
| `harden-tenant-isolation` | ✓ | 2026-06-16 | `changes/archive/2026-06/2026-06-16-harden-tenant-isolation/` — `TenantContext` usa `ThreadLocal`; finders sem tenant removidos/documentados. |
| `harden-actuator-admin-exposure` | ✓ | 2026-06-16 | `changes/archive/2026-06/2026-06-16-harden-actuator-admin-exposure/` — health `show-details: when-authorized`; isenção `/api/admin` documentada. |
| `current-user-quality-debt` | ✓ | 2026-06-16 | `changes/archive/2026-06/2026-06-16-current-user-quality-debt/` — foldada em `add-current-user-endpoint` (DIP, `@WebMvcTest`, índice descartado). |
| `add-assessoria-onboarding` | ✓ | 2026-06-16 | `changes/archive/2026-06/2026-06-16-add-assessoria-onboarding/` — cadastro de assessoria (Keycloak Organizations), role `ATLETA`, vínculo `Usuario`↔`Atleta`, convite. Código em develop; **infra Keycloak de produção + migração Groups→Organizations pendentes** (runbook `docs/add-assessoria-onboarding-keycloak-runbook.md`). |
| `build-skills-core-foundation` | superada | 2026-06-16 | `changes/archive/2026-06/2026-06-16-build-skills-core-foundation/` — §1–4 (contratos/registry/orquestrador/persistência `V32`/skills) já entregues por `introduce-domain-skills-architecture` e follow-ups. §5 (integração na geração de plano) reavaliada: a thread de IA (`eval-harness → debito-tecnico → llm-tool-use → llm-code-switching`) cobre a modernização do prompt. |
| `add-plan-generation-eval-harness` | 12/12 | 2026-06-16 | `changes/archive/2026-06/add-plan-generation-eval-harness/` — Golden-master determinístico de `buildOptimizedPrompt` (5 arquétipos, 707 testes); rede de regressão antes da migração formatters→skills. `LocalDate.now()` congelado, `Locale` pt-BR, leitura classpath-safe. Zero mudança de produção (apenas `src/test/`). |

---

## Nota de capacidade

Com 1 dev, o caminho completo até a fronteira do MVP (Bloco 0 + 1 + 2) é da ordem de **~20 sprints / ~40 semanas**, sem contar o Bloco de Segurança. Trade-off explícito da escolha IA-first: a base fica robusta, mas o treinador só vê a jornada madura no fim.

**Fast-track sugerido** (se quiser antecipar o "momento de valor" sem abrir mão da base): Bloco 0 → `build-skills-core-foundation` → `debito-tecnico-camada-ia` → `add-coach-shell-dashboards` → `add-coach-attention-queue` + `add-recommendation-explainability`. Entrega um treinador operando sobre uma base de IA já sólida, e o RAG/personalização entram no "MVP+1".
