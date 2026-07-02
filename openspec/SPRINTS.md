# Menthoros — Planejamento por Sprint

Ordem de execução das changes ativas, organizada por sprint. **Prioridade: base de IA primeiro**, com features visíveis do treinador intercaladas para preservar time-to-value.

**Última atualização:** 2026-06-30 (**Go-live waitlist [3/4]:** `harden-waitlist-rate-limit` mergeada (Fast track, backend) — `server.forward-headers-strategy=framework` + `WaitlistRateLimitFilter` usa `getRemoteAddr()` (não o XFF cru), fechando a limitação de spoofing aceita no MVP; PR backend #15, 1053 testes. **CORS prod verificado ao vivo** (`Access-Control-Allow-Origin: https://menthoros.com` em `menthoros.up.railway.app`; origem não-listada → 403). Antes — [1/4]: `add-privacy-policy` mergeada (Fast track, sem change formal) — Política de Privacidade LGPD em `/privacidade` (10 seções: controlador, dados, base legal Art. 7º I, direitos Art. 18, etc.), fechando a task 4.3 deferida da `add-waitlist`; PR front #25. **Go-live pendente:** e-mail de contato real na política, logo/foto-bio reais, e DNS `api.menthoros.com` (hoje a API responde em `menthoros.up.railway.app`). Antes: `redesign-landing-premium` mergeada — landing premium token-driven + captura inline na waitlist + vídeo de showcase no hero + fix da rota `/` (home legada → `/inicio`) + link "Entrar"; PR front #22; arquivada em `archive/2026-06/2026-06-30-redesign-landing-premium`. **Supera `marketing-landing-page`** (arquivada junto). Antes: `add-waitlist` mergeada — waitlist pública pré-lançamento: `POST /api/v1/waitlist` + tela `/waitlist` + CTAs da landing repontados; PRs backend #14 + front #21; arquivada em `archive/2026-06/2026-06-29-add-waitlist`. Antes: 2026-06-27 — `standardize-coach-dialogs` mergeada — fecha o arco dos dialogs do coach: shell único `CoachDialog` + helpers de botão + fonte única de cor de treino, todos movidos para `src/shared/`, PR #19; `align-coach-dialogs-base-plano` arquivada — fundação `CoachDialog`; migração `coach/atletas` concluída — `coach-roster-operational-actions` + `coach-roster-athlete-crud` arquivadas; tríade do dashboard do coach concluída: `fix-coach-inbox-metrics`, `consolidate-coach-inbox-tabs`, `coach-training-strain` e `coach-race-form-prediction` arquivadas; `introduce-coach-assistant-core-features` / `coach-assistant-triage-ui` concluídos e mergeados — endpoint agregado do dashboard, triagem UI do coach (inbox decomposto, aderência e nível no roster), aderenciaPercentual no roster; próxima: `add-llm-tool-use` sprint 10–11)
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
skills-core ✅ ─▶ eval-harness ✅ ─▶ introduce-plan-constraints ─▶ migrate-plan-prompt-to-skills ─▶ llm-code-switching
   (fundação)       (rede)            (seam Constraint + bloco [1]      (troca a FONTE das Constraint   (EN/PT do que sobrar)
                                       no topo + PlanQualityChecker)     de formatter → skill)
                         │                    anti-alucinação cedo
                         └▶ debito-tecnico ✅ ─▶ add-llm-tool-use ─▶ RAG family
                            (confiabilidade)      (dado sob demanda)   (fundamentação)

  harden-plan-generation-resilience  ── irmã independente (reparo + 1 retry do 503; valida estrutura de etapas)
```

- **eval-harness** é a rede; **introduce-plan-constraints** fatia o anti-alucinação pra frente (bloco mandatório no topo + checker, usando os valores que os formatters já calculam — **sem** migrar lógica); **migrate-prompt** é o strangler que troca a *fonte* das `Constraint` (formatter→skill) por baixo do seam estável — **deferido** (Sprint 18–20), pois virou refactor de manutenibilidade depois que o anti-alucinação saiu na frente; **code-switching** vem após o migrate.
- A `Constraint` declarativa (key+descrição+params) é o **seam**: declarada uma vez, usada no prompt [1] **e** no `PlanQualityChecker`; quem produz (formatter→skill) troca sem mexer em renderer/checker.
- **harden-plan-generation-resilience** é irmã independente (validade estrutural de etapas ≠ constraint de coaching); não depende do seam nem do strangler — sequencia livre.
- **debito-tecnico** ✅ e **add-llm-tool-use** são camadas complementares; **RAG** fundamenta a prescrição.
- `refactor-iaservice-decomposition` (Pós-MVP) é a irmã estrutural — mesma classe `IaServiceImpl`; coordenar janela com migrate/harden.

As features visíveis do treinador (`shell-dashboards`, `attention-queue`, `explainability`, `suggestion-inbox`) ficam **intercaladas** na tabela para preservar time-to-value — não fazem parte do guarda-chuva. Cadência (pós-auditoria): **5** `progress-endpoints` (dado da shell) → **6** shell (visível) → **9** attention/explainability (visível) → **15** inbox (visível), que **fecha a jornada coach-in-the-loop**. O trecho **10–14** (`tool-use` + `rag-tool-calling`) é a maratona de infra **estrutural** (o inbox depende do RAG). Os sprints **16–21** são aprofundamento de IA pós-jornada: `rag-injury`/`rag-coach`, o `migrate` (strangler de manutenibilidade, deferido) e `code-switching`.

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| — | 🤖 ~~`build-skills-core-foundation`~~ ✅ superada | 30 | **Fundação de skills já em `develop`** (contratos, `SkillRegistry`, `SkillOrchestratorService`, persistência `V32`, 7+ skills) — entregue por `introduce-domain-skills-architecture` + follow-ups. Arquivada como superada (ver "Changes concluídas"). | Bloco 0 |
| 2 | 🤖 ~~`add-plan-generation-eval-harness`~~ ✅ | S | **A rede (mínima).** Golden-master de `buildOptimizedPrompt` (533 linhas → 707 testes). Trilho de regressão ANTES da migração de formatters. Reescopada (product-lens): o `PlanQualityChecker` vai na migração; eval ao vivo no Pós-MVP. | skills-core (em develop) |
| 3–4 | 🤖 ~~`debito-tecnico-camada-ia`~~ ✅ | 41 | Confiabilidade: `.entity()` no lugar de parsing frágil, prompts externalizados, roteamento de modelo explícito (`TaskComplexity.PLANO`), limpeza. Gate antes de empilhar mais IA. | eval-harness |
| 5 | ~~`add-athlete-progress-endpoints`~~ ✅ *(visível, dado)* | 22 | Curva PMC, distribuição de zonas, PRs, readiness, resumo de hoje. **Camada de dados da shell** (PMC/zonas) e base da revisão profunda do atleta. Movida do Bloco 2 para destravar a shell. | Bloco 0 |
| 6 | ~~`add-coach-shell-dashboards`~~ ✅ *(visível)* | 16 | Roster + calendário semanal + KPIs por tenant. Primeira "casa" do treinador. Flags ainda não entregues (`hasPendingSuggestion`) iniciam `false`. Integração frontend fica em change separada. | progress-endpoints; Bloco 0 |
| 6b | ~~`wire-coach-shell-to-dashboards`~~ ✅ *(visível, front)* | M | **Liga as 3 telas do coach aos endpoints reais** (antes em mock): cliente curado + hooks + reconciliação DTO↔view-model (mapear/derivar/adiar). Fecha o valor visível da sprint 6 no front. | `add-coach-shell-dashboards` ✅ |
| 6-DX | 🔧 ~~`fix-openapi-client-generation`~~ ✅ *(tech-debt/DX)* | L | **`generate:api` determinístico restaurado.** Fase A (`@Tag` ASCII) + A2 (`array` em listarAtletas/listarProvas) + `--useUnionTypes` → saída limpa/idempotente/compilável. Fase B **reescopada (opção B)**: cliente `src/api` mantido como **fachada curada** (corrige tipos do OpenAPI + nomes ergonômicos); adoção do cru **adiada** (degrada tipagem + endpoints inexistentes). CA3/CA7 abandonados (doc). | — |
| 7 | 🤖 ~~`introduce-plan-constraints`~~ ✅ | M | **Anti-alucinação (o "coração").** Seam `Constraint` (key+descrição+params); formatters emitem Constraints; bloco mandatório [1] no topo + `PlanQualityChecker` (4 keys, offline) com contador Micrometer. Sem migrar skill. Golden regenerado. | eval-harness |
| 8 | 🤖 ~~`harden-plan-generation-resilience`~~ ✅ | M | Resiliência estrutural: reparo determinístico (`PlanoEstruturaReparador`) + 1 retry com feedback (`PlanoResilienceService`) → fim do 503 do `REGENERATIVO` 2 etapas (vira 422 com mensagem ao treinador). Dedup dos 4 validadores em `validarEstrutura3Etapas` + telemetria Micrometer (taxa de sucesso). Independente do seam e do strangler. | debito-tecnico ✅ |
| 9 | ~~`add-coach-attention-queue`~~ ✅ + ~~`add-recommendation-explainability`~~ ✅ *(visível)* | 13 + 9 | Fila de atenção on-demand (2026-06-18) + explicabilidade estruturada (2026-06-19). Hook diário do treinador + rationale determinístico por sinal. | shell-dashboards |
| 9b | ~~`wire-coach-identity-and-attention-queue`~~ ✅ *(visível, front)* | 14/14 | **Liga identidade e fila de atenção reais ao shell.** Substitui `mockCoach`/`mockTenant` por `GET /api/v1/users/me`; cria `CoachAttentionQueuePage` wired a `GET /api/v1/coach/attention-queue` com `explanation.rationale`; badge do Inbox com count real. Frontend-only, zero backend. | `add-coach-attention-queue` ✅, `add-current-user-endpoint` ✅ |
| 9c | ~~`add-coach-suggestion-inbox`~~ ✅ *(visível, backend+front)* | 21 | **Coach-in-the-loop completo (v1 sem RAG).** Workflow aprovar/rejeitar sugestões IA geradas dos sinais da fila de atenção: migration `tb_sugestao_coach`, listener idempotente, service + controller CRUD, UI 3-colunas real (substituindo o placeholder do 9b). Sem RAG no v1 — a fundamentação com citações entra pós-RAG via upgrade. | `wire-coach-identity-and-attention-queue`, `add-recommendation-explainability` ✅ |
| 9d | ~~`manual-training-entry-lightweight`~~ ✅ *(XS, visível, backend+front)* | 8/8 | **Desbloqueador de dado real.** Log manual do atleta: tipo + duração + distância + RPE + data → persiste em `TreinoRealizado` com `fonte=MANUAL`; TSS estimado calculado. Desbloqueia fila de atenção com dado real, antecipa debrief e métricas sem esperar `first-party-ingestion-architecture` (Sprint 22). | `add-current-user-endpoint` ✅, `add-assessoria-onboarding` ✅ |
| 9e | ~~`coach-plan-review-workflow`~~ ✅ *(M, visível, backend+front)* | 18/18 | **Desbloqueador de confiança e adoção.** Coach revisa e aprova planos gerados pela IA antes de chegarem ao atleta. `review_status` (AGUARDANDO_REVISAO → APROVADO/REJEITADO) em `tb_plano_semanal`; `GET /coach/planos/pendentes` + `GET /coach/planos/revisao?status=` + `POST aprovar/rejeitar`; `CoachPlanReviewPage` 3-colunas (filtros + fila + painel); badge de pendentes no nav. | `add-coach-shell-dashboards` ✅, `add-coach-suggestion-inbox` ✅ |
| 9f | ~~`athlete-profile-drilldown`~~ ✅ *(M, visível, backend+front)* | 16/16 | **Prontuário do atleta.** Tela `/coach/athletes/:id` com PMC 90d, aderência 8 semanas, plano vigente (7 cards), últimos 3 sinais e 3 sugestões, recordes. Endpoint agregador `GET /coach/atletas/{id}/perfil`. Navegação do roster → perfil. Coach tem contexto completo antes de qualquer decisão. | `athlete-progress-endpoints` ✅, `add-coach-attention-queue` ✅, `add-coach-suggestion-inbox` ✅ |
| 9g.1 | ~~`fix-intervalado-distance-calculation`~~ ✅ *(XS, backend)* | 10/10 | **Hotfix: distância errada em treinos intervalados.** Pós-processamento determinístico em `IaServiceImpl`: `corrigirDistanciasEtapasTemporais` deriva `distanciaKm` via `duracaoMin ÷ paceZona` (Z2 = limiar×1.20, Z1 = limiar×1.35) para AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO antes de `expandirEtapasAgregadas`. PR #8 mergeado 2026-06-21. | — |
| 9g | ~~`coach-edit-planned-workout`~~ ✅ *(S, visível, backend+front)* | ~22 | **Fecha o ciclo de revisão.** Coach edita treinos individuais durante revisão do plano (`AGUARDANDO_REVISAO`): tipo, distância, duração, zona, RPE, TSS (recalculado automaticamente ou override manual). `PATCH /coach/planos/{id}/treinos/{id}`; migration V39 (`editado_pelo_coach`); chip "Editado manualmente" na UI; `editadoPeloCoach = true` alimentará `rag-coach-methodology-personalization` (Sprint 17). | `coach-plan-review-workflow` ✅ |
| 9h | ~~`infer-thresholds-from-recent-workouts`~~ ✅ *(S, backend+front)* | ~18 | **Calibração automática de zonas.** Quando `fcLimiar`/`paceLimiar` estão desatualizados (> 90 dias), infere o valor atual a partir do quintil superior dos treinos dos últimos 30 dias. Injeta como Constraint no prompt; retorna `limiareisInferidos` no response da geração; banner de transparência na `CoachAthleteProfilePage`. Inclui bug fix de alucinação de BPM para atletas sem teste formal. PR #10 mergeado 2026-06-23. | `coach-edit-planned-workout` ✅ |
| 9i | ~~`coach-add-workout-to-plan`~~ ✅ *(S, visível, backend+front)* | ~25 | **Fecha o ciclo de adição.** Coach inclui treinos não previstos pela IA durante revisão (`POST /coach/planos/{id}/treinos`); dialog com etapas dinâmicas e blocos repetidos; migration V41 (`adicionado_pelo_coach`); aviso double-day; guardrail 14 treinos/semana; chip "Adicionado pelo coach". PR #11 (backend) + PR #7 (front) mergeados 2026-06-23. | `coach-edit-planned-workout` ✅ |
| 9j | ~~`expose-form-status`~~ ✅ *(S · Full, backend+front)* | ~14 | **Dívida de confiança: forma consistente backend↔UI.** Backend expõe `statusForma` (`FaixaTsb`, 9 faixas) nos DTOs; front consome a forma atual (CoachInbox) sem recomputar `formFromTSB`. PRs: backend #13 + front #20, mergeados 2026-06-29. Arquivada em `archive/2026-06/2026-06-29-expose-form-status`. Follow-ups: taper boundaries (remove o último `formFromTSB` na projeção); dead code `AthleteRow`. | `add-coach-suggestion-inbox` ✅, `fix-coach-inbox-metrics` ✅ |
| 9k | `add-daily-readiness-checkin` *(M, visível, backend+front)* | 29 | **Sinal preditivo de prontidão.** Check-in diário subjetivo (sono/humor/dores/energia/estresse) → `readinessScore` + `NivelProntidao` (PRONTO/CAUTELOSO/DESCANSAR); antecede queda de prontidão em 24–48h, antes do TSB reagir. Integra como sexto portão em `IntervaladoElegibilidadeService` (bloqueio/atenuação) e no contexto do `PlanoTreinoPromptBuilder`. **Antecipado do pós-MVP** (decision memo `artifacts/decision-memo-debrief-vs-readiness.md`, 2026-07-02): spec completo, zero dependência de changes futuras, roda sobre a base já entregue. | `add-coach-attention-queue` ✅ (consumidor natural do sinal) |
| 10–11 | 🤖 `add-llm-tool-use` | 35 | Tool calling: LLM pede dado sob demanda, decisões auditáveis, fim do prompt monolítico. | skills-core, débito-técnico |
| 11b | `coach-batch-plan-generation` *(M, visível, backend+front)* | ~32 | **Geração em escala.** Coach seleciona N atletas no roster e gera planos para todos de uma vez. `POST /coach/planos/gerar-lote` → `202 Accepted + jobId`; processamento `@Async` com pool dedicado; `GET /coach/planos/lote/{jobId}` para polling de progresso; nova tabela `tb_batch_plan_job`; barra de progresso no frontend; alertas por erros individuais sem abortar o lote. Sequenciado após `add-llm-tool-use` (geração mais rápida com tool calling). | `add-llm-tool-use`, `coach-edit-planned-workout` ✅ |
| 12–14 | 🤖 `rag-tool-calling-prescription-engine` | 64 | Infra RAG (`PgVectorStore`) + motor de prescrição fundamentado em metodologia. Destrava a família `rag-*`. | llm-tool-use |
| 15+ | `add-coach-suggestion-inbox` *(upgrade RAG)* | — | Enriquecer as sugestões do 9c com citações RAG — fundamentação de metodologia no `reasoning`. O workflow já existe; só muda a fonte dos dados. | RAG, 9c |
| 16 | 🤖 `rag-injury-aware-prescription` | 24 | Prescrição lesão-aware: protocolos de retorno, sessões contraindicadas, escalonamento de bandeira-vermelha. | RAG, explainability, attention-queue |
| 17 | 🤖 `rag-coach-methodology-personalization` | 29 | Aprende com planos aprovados/editados — personaliza para a "voz do coach". | RAG, explainability |
| 18–20 | 🤖 `migrate-plan-prompt-to-skills` | L | **Strangler de manutenibilidade (deferido).** Troca a FONTE das `Constraint` e seções de formatter→skill por baixo do seam estável; `PromptBuilder` vira montador fino. Anti-alucinação já entregue em `introduce-plan-constraints` → menor urgência; janela contínua no `IaServiceImpl` coordenada com `refactor-iaservice-decomposition`. | introduce-plan-constraints |
| 21 | 🤖 `llm-code-switching` | 21 | Otimização PT/EN (assertividade + custo). Reduzida pela migração — skills já emitem estrutura EN / valores PT. | migrate-plan-prompt, llm-tool-use |

---

## Bloco 2 — Fechamento da jornada do treinador (coach-in-the-loop completo)

| Sprint | Change | Tasks | Objetivo | Dependência |
|:---:|---|:---:|---|---|
| 22 | `first-party-ingestion-architecture` | ~23 | **Dado first-party completo e ML-safe:** upload de `.fit`, dedup cross-source, tenant guard, compute-on-import com métricas reais de FC e pace. Sucede e substitui o log manual do 9d com dado rico. | `manual-training-entry-lightweight` 9d |
| 23 | `add-workout-metrics-analyzer` | ~22 | Métricas determinísticas (tempo em zona, decoupling, drift cardíaco) + skill `workout-analyzer` (proposta ao treinador). Reconcilia o `WorkoutAnalysisListener` existente. | first-party-ingestion; suggestion-inbox |
| 24 | `add-post-workout-debrief` + `add-weekly-athlete-review` | 17 + 12 | Planejado vs realizado + consolidação semanal — sobre métricas reais do `.fit`. *Nota: versão simplificada (sem métricas de zona) pode ser antecipada para logo após o 9d, usando apenas os dados do log manual.* | metrics-analyzer; progress-endpoints |
| 25 | `add-athlete-coach-messaging` | 23 | Mensageria atleta↔coach + cards de `plan_adjustment`. Item mais independente. | Bloco 0 |

> **Fronteira do MVP (jornada completa coach-in-the-loop):** ao fim do Sprint 25, a jornada está entregue — identidade → casa do treinador → dado real (log manual 9d) → fila de atenção → sugestão IA explicável → **aprovação de plano pelo coach (9e)** → perfil completo do atleta (9f) → ingestion FIT completo → métricas + análise → debrief → revisão semanal → mensageria.
>
> **Mudança estratégica de ingestão:** o MVP passa a usar **ingestão first-party** (log manual 9d → FIT upload Sprint 22) em vez do Strava. O 9d desbloqueia dado real imediatamente; o Sprint 22 adiciona dado rico de GPS e FC. A família `strava-*` fica **deferida** (ver pós-MVP).

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
`progressao-treinos` (30) — envelope técnico confiável · `add-zone-confidence-management` (12) — confiança nas zonas.

**Dívida técnica estrutural:**
`refactor-iaservice-decomposition` (~26) — decompõe `IaServiceImpl` (~1500 linhas: schema + geração + validação) em colaboradores testáveis, sem mudança de comportamento. **Sequenciar logo após `debito-tecnico-camada-ia`** (mesma classe) para não re-inflar; não é bloqueante de feature nem de beta, por isso fica no pós-MVP.

> `harden-plan-generation-resilience` ✅ foi **entregue como change independente** (não foi folded em `migrate-plan-prompt-to-skills`): a resiliência estrutural foi construída sobre o `IaServiceImpl` atual, extraindo `PlanoEstruturaReparador` + `PlanoResilienceService` e deduplicando os 4 validadores em `validarEstrutura3Etapas`. Esses colaboradores já adiantam parte da decomposição prevista em `refactor-iaservice-decomposition`.

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
| `add-coach-attention-queue` | 13/13 | 2026-06-18 | `changes/archive/2026-06/2026-06-18-add-coach-attention-queue/` — Fila de atenção on-demand: `GET /api/v1/coach/attention-queue`, 6 sinais avaliados (fadiga/TSB, sobrecarga/plano, aderência 14d, inatividade, zonas vencidas, sem plano), dedup por atleta, corte severity ≥ ALTA, cap N=20. `hasAlert` do calendário semanal integrado. 38 testes novos, 825/825 verde. Follow-ups 7.1–7.5 registrados (não bloqueantes). |
| `add-recommendation-explainability` | 9/9 | 2026-06-19 | `changes/archive/2026-06/2026-06-19-add-recommendation-explainability/` — Campo aditivo `explanation: RecommendationExplanation` em `CoachAttentionItemOutputDto`: `rationale` PT-BR determinístico por sinal, `sourceRules` com constantes estáticas por método avaliador, `confidence=HIGH` (v1). `SinalAtencao` ganhou compact constructor com fail-fast. `@Schema` em `ExplanationConfidence`. 829/829 verde, QA gate (3 revisores) sem Critical. |
| `wire-coach-identity-and-attention-queue` | 14/14 | 2026-06-19 | `changes/archive/2026-06/2026-06-19-wire-coach-identity-and-attention-queue/` — Identidade real no `CoachLayout` (remove `mockCoach`/`mockTenant`); `useCurrentUser` + `useAttentionQueue`; `CoachAttentionQueuePage` com 3 estados (loading/erro/lista); SeverityChip cobrindo CRITICA/ALTA/MEDIA; contexto passado via `<Outlet context={...}>` (elimina dupla requisição). 44/44 testes, zero erros TS. `CoachInboxPage.tsx` deletado — será recriado em `add-coach-suggestion-inbox`. |
| `add-coach-suggestion-inbox` | 21/21 | 2026-06-19 | `changes/archive/2026-06/2026-06-19-add-coach-suggestion-inbox/` — Coach-in-the-loop v1: `tb_sugestao_coach` (V36), `SugestaoCoachGeneratorJob` (cron 06h, idempotente via UNIQUE partial index), service + controller (`/api/v1/coach/sugestoes`), 860 testes backend. Frontend: `CoachInboxPage` 3-colunas (filtros | lista com `CoachAthleteAvatar`/`SuggestionTypeBadge`/`ConfidenceBar` | painel revisão com tabs Detalhes/Raciocínio), busca os 3 status em paralelo, filtro local. Seed de dev `db/seed/seed_sugestoes_dev.sql`. Layout 3-colunas (mock original) validado pelo PO em detrimento do 2-painéis do design.md. |
| `manual-training-entry-lightweight` | 8/8 | 2026-06-19 | `changes/archive/2026-06/2026-06-19-manual-training-entry-lightweight/` — Desbloqueador de dado real: `POST /api/v1/atletas/me/treinos` + `GET /api/v1/atletas/me/treinos?dias=7`; `TreinoManualInputDto` (tipo/duração/distância/RPE/obs); best-effort match com `TreinoPlanejado`; `fonteDados=MANUAL`; formulário com chips de tipo, slider RPE, preview TSS, lista de recentes; ARIA acessível; 884 testes backend, 76 frontend. |
| `coach-plan-review-workflow` | 18/18 | 2026-06-20 | `changes/archive/2026-06/2026-06-20-coach-plan-review-workflow/` — Desbloqueador de confiança: `review_status` + `review_comment` em `tb_plano_semanal` (V37); `PlanoReviewService` com máquina de estados (AGUARDANDO→APROVADO/REJEITADO, 422 em transição ilegal); 4 endpoints (`GET /pendentes`, `GET /revisao?status=`, `POST /aprovar`, `POST /rejeitar`); atleta só recebe planos APROVADO; `CoachPlanReviewPage` 3-colunas (filtros+fila+painel minimalista); badge de pendentes no nav. 911 testes backend, 95 frontend. QA: nenhum achado Critical. |
| `debito-tecnico-camada-ia` | ✓ | 2026-06-17 | `changes/archive/2026-06/debito-tecnico-camada-ia/` — Confiabilidade da camada IA: `.entity()` (Spring AI structured output) em `WorkoutAnalysisListener` e `RaceProjectionNarrativeGenerator` no lugar de parsing manual; 3 user prompts externalizados; roteamento explícito `TaskComplexity.PLANO`/`gpt4oPlanoClient`; cache thread-safe; limpeza de templates órfãos/embedding morto. Validado em produção (análise pós-treino + log de roteamento). Suíte 701/701. Gap de resiliência estrutural (503 no REGENERATIVO) → folded em `migrate-plan-prompt-to-skills` (seção 9). |
| `add-athlete-progress-endpoints` | ✓ | 2026-06-17 | `changes/archive/2026-06/add-athlete-progress-endpoints/` — 5 endpoints read-only (PMC, zonas, recordes, readiness, home) sob `/api/v1/atletas`; readiness com heurística objetiva provisória; isolamento via service-layer (404 cross-tenant); Clock injetável. Suíte 733/733. **Follow-up:** extrair `CurrentAtletaResolver` quando `shell-dashboards` reusar a resolução `me`. |
| `add-coach-shell-dashboards` | 16 | 2026-06-17 | `changes/archive/2026-06/2026-06-17-add-coach-shell-dashboards/` — Primeira "casa" do treinador: roster de atletas + calendário semanal + KPIs por tenant. Flags `hasPendingSuggestion` iniciam `false` (preenchidas nas changes subsequentes). |
| `wire-coach-shell-to-dashboards` | M | 2026-06-18 | `changes/archive/2026-06/2026-06-18-wire-coach-shell-to-dashboards/` — Liga as 3 telas do coach aos endpoints reais (remove mocks): cliente curado + hooks + reconciliação DTO↔view-model. Frontend-only, zero backend. |
| `fix-openapi-client-generation` | L | 2026-06-18 | `changes/archive/2026-06/2026-06-18-fix-openapi-client-generation/` — `generate:api` determinístico restaurado: Fase A (`@Tag` ASCII kebab-case) + A2 (`@ArraySchema` em endpoints de lista). Cliente `src/api` mantido como fachada curada; geração integral adiada (Fase B). |
| `introduce-plan-constraints` | M | 2026-06-18 | `changes/archive/2026-06/2026-06-18-introduce-plan-constraints/` — Anti-alucinação (Sprint 7): seam `Constraint` (key+descrição+params); formatters emitem Constraints; bloco mandatório [1] no topo do prompt + `PlanQualityChecker` (4 keys) com contador Micrometer. Golden regenerado. |
| `harden-plan-generation-resilience` | M | 2026-06-18 | `changes/archive/2026-06/2026-06-18-harden-plan-generation-resilience/` — Resiliência estrutural (Sprint 8): `PlanoEstruturaReparador` + 1 retry com feedback → fim do 503 do REGENERATIVO 2 etapas (vira 422 com mensagem ao treinador). Dedup dos 4 validadores em `validarEstrutura3Etapas` + telemetria Micrometer. |
| `athlete-profile-drilldown` | 16/16 | 2026-06-20 | `changes/archive/2026-06/2026-06-20-athlete-profile-drilldown/` — Prontuário do atleta: endpoint agregador `GET /coach/atletas/{id}/perfil` (PMC 90d, aderência 8 semanas, plano vigente com 7 cards, top 3 sinais/sugestões, recordes). Tela `/coach/athletes/:id` com navegação roster → perfil. |
| `fix-intervalado-distance-calculation` | 10/10 | 2026-06-21 | `changes/archive/2026-06/2026-06-21-fix-intervalado-distance-calculation/` — Hotfix: distâncias erradas em treinos intervalados. `corrigirDistanciasEtapasTemporais` deriva `distanciaKm` via `duracaoMin ÷ paceZona` (Z2/Z1) para AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO antes de `expandirEtapasAgregadas`. PR #8 mergeado. |
| `coach-edit-planned-workout` | ~22 | 2026-06-22 | `changes/archive/2026-06/2026-06-22-coach-edit-planned-workout/` — Fecha o ciclo de revisão: `PATCH /coach/planos/{id}/treinos/{id}` com `EtapaInputDto`, migration V39 (`editado_pelo_coach`), chip "Editado manualmente" na UI, TSS recalculado ou override manual. Validação concorrente via `@Version` + 409. PR #9 mergeado. |
| `infer-thresholds-from-recent-workouts` | ~18 | 2026-06-23 | `changes/archive/2026-06/2026-06-23-infer-thresholds-from-recent-workouts/` — Calibração automática de zonas: `ThresholdInferenceService` (quintil superior, MIN_AMOSTRAS=3, janela 30d, confiança ALTA/MEDIA/BAIXA); migration V40; Constraint no prompt; `LimiareisInferidosDto` no perfil coach; `LimiaresInferidosBanner` no frontend. Inclui bug fix de alucinação BPM para atletas sem limiar formal (fornece zonas calculadas em vez de "60-70 bpm"). PR #10 mergeado. |
| `introduce-coach-assistant-core-features` + `coach-assistant-triage-ui` | 8/8 (sprint 8) | 2026-06-26 | `changes/archive/2026-06/2026-06-26-introduce-coach-assistant-core-features/` — Guarda-chuva: endpoint agregado `GET /api/v1/coach/dashboard` (roster paginado + fila + calendário + insights); `aderenciaPercentual` (4 semanas) no `CoachAtletaResumoDto`; frontend inbox decomposto (3 hooks, 4 adapters, 5 painéis); `nivelExperiencia` e `aderenciaPercentual` exibidos no roster; `React.lazy` (−47 kB). PRs backend #12 + frontend #8 mergeados 2026-06-25. Follow-ups 7.1–7.2 documentados (mocks residuais não bloqueantes). |
| `fix-coach-inbox-metrics` | 8 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-fix-coach-inbox-metrics/` — Frontend-only (Fast track): alinha threshold TSB do `formFromTSB` (−25→−20) com o `danger` do backend; corrige 4 bugs de métricas no adapter (`acuteLoad` ctl→atl, monotonia/loadDelta hardcoded, fadiga inline); adiciona ACWR (tile no inbox + coluna no roster com zonas de risco) e métrica "Forma" via `formFromTSB`; exibe limiares inferidos (FC/pace) no tab Status. Refactor pós-QA: zonas/tons centralizados em `getAcwrZone`/`getTsbFormaTone`. 205 testes (+32). PR #9 mergeado. Desbloqueia `coach-training-strain` e `coach-race-form-prediction`. |
| `consolidate-coach-inbox-tabs` | 8 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-consolidate-coach-inbox-tabs/` — Frontend-only (Fast track): consolida o drill-down do atleta de 5 para 3 abas (Diagnóstico, Plano, Provas & sugestões), todas por-atleta. Corrige o bug global vs atleta (`if (dashboardInsights)`/`if (dashboardCalendar)` nunca null) que tornava as métricas PMC de `fix-coach-inbox-metrics` código morto; remove conteúdo mock (Ajuste rápido, Semana atual, Marcar como concluído, Últimos treinos vazio); deleta 7 arquivos órfãos + tipo `WorkoutItem`. Saldo −856/+353. 208 testes. PR #10 mergeado. Follow-ups F1–F4 (semântica de `recovery`, `planStatus` CONCLUIDO, fallback `acuteLoad`, `trainingType`) na spec arquivada. Desbloqueia o tile de Strain e o card de previsão de forma. |
| `coach-training-strain` | 6 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-coach-training-strain/` — Frontend-only (Fast track): Training Strain (TSS_semanal × monotonia, Foster) como `DetailMetric` na aba Diagnóstico; `calcularStrain` + `getStrainZone` (padrão `getAcwrZone`); helper `ultimosTssValidos` compartilhado com `calcularMonotonia` (DRY do QA). 217 testes (+9). PR #11 mergeado. Resta `coach-race-form-prediction` na sequência do dashboard do coach. |
| `coach-race-form-prediction` | 6 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-coach-race-form-prediction/` — Frontend-only (Fast track): previsão de forma (TSB) no dia da prova via decaimento exponencial do PMC (CTL τ=42, ATL τ=7, taper puro). `calcularPrevisaoForma` (reusa `formFromTSB`) + `calcularDiasAteProva` (`hoje` injetável); helper `provasOrdenadas` compartilhado com `buildRaceCalendarFromProfile` (DRY do QA); card condicional na aba Provas & sugestões. 225 testes (+8). PR #12 mergeado. **Fecha a tríade de melhorias do dashboard do coach** (métricas → consolidação de abas → strain → previsão de forma). |
| `coach-roster-operational-actions` | 7 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-coach-roster-operational-actions/` — Frontend-only (Fast track): traz ações por-atleta do `/atletas` legado para o roster `coach/atletas` (coluna `type:'actions'`): Plano (`PlanosDialog`), Sincronizar Strava (`SyncStravaButton`), Projeção (`GerarProjecaoDialog`). Reuso dos dialogs legados as-is. 230 testes (+5). PR #13 mergeado. **Parte 1/2** da migração; resta `coach-roster-athlete-crud`. Primeiro `/qa` com camada cross-model Codex — pegou bug (`connected={false}` travava o sync) que os reviewers Claude não viram. |
| `align-coach-dialogs-projecao` | 5 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-align-coach-dialogs-projecao/` — Frontend-only (Fast track): adequa o fluxo de projeção de prova ao dark-first (papel/gradientes → `elevation`/tokens; `GAP_*`/`CTL_*`/`ConfidenceBadge`/`MarcarOficialButton` → `semantic.*`; 78 hex → 0). Inclui fix de contraste (`surface[400]`, achado cross-model) e **fix de layout** (form quebrava o flex → botões cortados; `display:contents`). 238 testes. PR #16 mergeado. **3/3** da adequação dos dialogs. |
| `standardize-coach-dialogs` | sem spec | 2026-06-27 | Sem change OpenSpec (padronização iniciada via `/frontend-design`). **Fecha o arco** dos dialogs do coach: eleva `CoachDialog` a shell único e migra **todos** os dialogs (projeção, atleta, confirmações, Provas light-mode→dark, plano, edição/criação de treino, modais embutidos e os 2 inline de página). Cria helpers de botão (`PRIMARY/SUCCESS/DANGER/GHOST` em `actionButtonSx`) + palette semantic no tema; fonte única de cor de treino (`workoutColors`: tipo/status/etapa + escala de esforço). Resolve dep. circular movendo as 3 primitivas para `src/shared/`. `PROVA_STATUS_COLORS` tokenizado; 2 bugs de `borderTop` vazio corrigidos. Saldo −439 linhas. 241 testes. `/qa` sem Critical. PR #19 mergeado. |
| `align-coach-dialogs-base-plano` | 5 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-align-coach-dialogs-base-plano/` — Frontend-only (Fast track): **fundação** da adequação dos dialogs ao shell coach. Cria `CoachDialog` base (dark-first, `elevation.highest`, header uppercase, `aria-labelledby`) + adequa `PlanosDialog`/`TreinoCard` (zero hex; RPE em zonas semânticas). 238 testes (+4). PR #15 mergeado. **1/3** da adequação; destrava `align-coach-dialogs-atleta` e `align-coach-dialogs-projecao`. Codex (QA) pegou a falta de nome acessível. |
| `coach-roster-athlete-crud` | 6 seções | 2026-06-26 | `changes/archive/2026-06/2026-06-26-coach-roster-athlete-crud/` — Frontend-only (Fast track): CRUD de atleta no roster `coach/atletas` (criar via botão Adicionar, editar com `buscarAtletaPorId`+merge, excluir com `ConfirmDialog`); error handling via Snackbar. Reuso de `AtletaDialog`/`ConfirmDialog`. Inclui fix `buscarAtletaPorId` `/v1`→`/api/v1` (404 ao editar, achado do Codex no QA). 234 testes (+4). PR #14 mergeado. **Parte 2/2 — fecha a migração coach/atletas** (paridade operacional com o `/atletas` legado; Provas e descomissionamento do legado ficam de follow-up). |
| `add-waitlist` | implementado (4.3 pré-go-live adiada) | 2026-06-29 | `changes/archive/2026-06/2026-06-29-add-waitlist/` — Waitlist pública pré-lançamento (M · Full, fora de sprint). **Backend:** `POST /api/v1/waitlist` (público, sem tenant, em `publicPaths` + `shouldNotFilter`), `tb_waitlist` (V43, constraint única `email_normalized`, `aceite_lgpd`), honeypot + rate-limit Caffeine 5/min/IP → 429, idempotência por e-mail resiliente a corrida (`DataIntegrityViolationException` estreitada ao índice). **Frontend:** rota `/waitlist` (e `/privacidade` placeholder) fora de `ProtectedRoute` — form no tema com perfil/faixa condicional, checkbox LGPD + link, honeypot, foco no sucesso; CTAs da landing repontados (`Começar` → `/waitlist`, `Entrar` → `/auth/login`). PRs backend #14 + front #21 mergeados 2026-06-30. QA 4 reviewers (multi-tenant aprovado), 10 fixes aplicados; A1 (XFF spoofing) e enumeração 200/201 aceitos como limitação MVP. 1050 testes backend + 259 front. **Pendências go-live:** política real em `/privacidade` (4.3), `CORS_ALLOWED_ORIGINS` prod, reforço de proxy confiável no XFF. |
| `redesign-landing-premium` | implementado (6.3/7.3 follow-up) | 2026-06-30 | `changes/archive/2026-06/2026-06-30-redesign-landing-premium/` — Redesign **premium** da landing (L · Full, frontend-only, fora de sprint). Porta a landing v2.0 token-driven (módulo `landing/`: content/primitives/ProductUI/sections/AccessForm + 11 seções), tema MUI premium escopado via `ThemeProvider` aninhado (`landingTheme` + augmentation `surfaceShift` em `mui.d.ts`), captura inline integrada ao `/api/v1/waitlist` (reusa `useWaitlist`; nº atletas → faixa, perfil=TREINADOR, LGPD+honeypot), **vídeo de showcase** no hero (loop mudo, fade na base, hero sobreposto) e link "Entrar". **Fix de rota `/` (AC1):** index do `ProtectedRoute` sombreava `/` → home legada movida para `/inicio`. QA frontend+clean-code (11 fixes; "FAQ teclado" falso positivo). 271 testes, audit de cor limpo, verificado no navegador. PR front #22 mergeado 2026-06-30. **Supera `marketing-landing-page`** (arquivada junto). Pendências: assets reais + bio do fundador (6.3), nav mobile (7.3). |
| ~~`marketing-landing-page`~~ ✅ superada | — | 2026-06-30 | `changes/archive/2026-06/2026-06-30-marketing-landing-page-superseded/` — Landing inicial (informacional, sem captura de lead). **Superada** por `redesign-landing-premium` (landing premium token-driven + captura inline). Arquivada como superada. |

---

## Radar — specs no horizonte (não escalonadas ainda)

Items identificados como importantes para a jornada do coach, mas sem sprint definido. Revisitar antes de cada ciclo de planejamento.

| Change | Status | Por que está no radar | Ação sugerida |
|---|:---:|---|---|
| ~~`coach-plan-review-workflow`~~ | ✅ **Escalonado Sprint 9e** | Desbloqueador de confiança — aprovado e inserido no roadmap. | — |
| ~~`athlete-profile-drilldown`~~ | ✅ **Escalonado Sprint 9f** | Prontuário do atleta — aprovado e inserido no roadmap. | — |
| ~~`manual-training-entry-lightweight`~~ | ✅ **Escalonado Sprint 9d** | Desbloqueador de dado real — proposto e inserido no roadmap. | — |
| `add-post-workout-debrief` | Roadmap Sprint 24 — **avaliar antecipação** | Com dado real disponível a partir do 9d (log manual), a dependência com `first-party-ingestion` (22) cai. Uma versão simplificada do debrief pode ser viabilizada antes do Sprint 22. | Revisar tasks.md: separar o que depende de métricas FIT do que funciona com log manual. Antecipável para Sprint ~10–11 se as tasks básicas forem independentes. |
| ~~`add-daily-readiness-checkin`~~ | ✅ **Escalonado Sprint 9k** | Sinal preditivo — aprovado (2026-07-02, decision memo) e inserido no roadmap antes de `add-llm-tool-use`. | — |
| `complete-authorization-controllers` | Bloco de Segurança — 29 tasks | Brechas de autorização abertas nos controllers. Obrigatório antes do beta. | Intercalar como hardening em sprints que toquem controllers — não tratar como feature isolada. |
| `add-athlete-retention-loop-90d` | Candidato — discovery + PRD + roadmap prontos, sem change OpenSpec | Evidência forte de mercado (~70% de churn em fitness/health nos primeiros 100 dias, fontes acadêmicas citadas no discovery); ataca North Star critérios 3–4 (mais atletas sem perder personalização; risco/progresso visível). Depende de `add-weekly-athlete-review` e `add-athlete-coach-messaging` (Bloco 2, Sprints 24–25) para gerar valor pleno — não é antecipável para antes deles. | Ver `prd/product-discovery-retencao-atletas-90d.md`, `prd/prd-retention-loop-90d.md` e `prd/roadmap-retencao-atletas-90d.md`. Decisão do founder pendente: promover para `openspec/changes/add-athlete-retention-loop-90d/` como Bloco 3 (Sprints 26–32) após o fechamento do Bloco 2. |

### Por que esses 3 são os prioritários

```
manual-training-entry-lightweight (XS)   →   desbloqueador de dado real
        │
        ├──▶  add-post-workout-debrief    →   hook diário (o que aconteceu ontem)
        │
        └──▶  add-daily-readiness-checkin →   sinal antecipado (readiness antes do TSB)

coach-plan-review-workflow (M)            →   desbloqueador de confiança do coach
        │
        └──▶  athlete-profile-drilldown  →   prontuário (contexto antes de decidir)
```

Entregando `manual-training-entry-lightweight` + `coach-plan-review-workflow` + `athlete-profile-drilldown`, o coach consegue:
1. Ver o que o atleta fez (dado)
2. Aprovar o plano antes de chegar ao atleta (controle)
3. Mergulhar no perfil antes de tomar qualquer decisão (contexto)

Esses três juntos são o "momento de valor" que faz um coach escolher o Menthoros em vez de Excel + WhatsApp.

---

## Nota de capacidade

Com 1 dev, o caminho completo até a fronteira do MVP (Bloco 0 + 1 + 2) é da ordem de **~20 sprints / ~40 semanas**, sem contar o Bloco de Segurança. Trade-off explícito da escolha IA-first: a base fica robusta, mas o treinador só vê a jornada madura no fim.

**Fast-track sugerido** (se quiser antecipar o "momento de valor" sem abrir mão da base): Bloco 0 → `build-skills-core-foundation` → `debito-tecnico-camada-ia` → `add-coach-shell-dashboards` → `add-coach-attention-queue` + `add-recommendation-explainability`. Entrega um treinador operando sobre uma base de IA já sólida, e o RAG/personalização entram no "MVP+1".
