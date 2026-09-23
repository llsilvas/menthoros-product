# Menthoros Strategic Compass

> Status: founder-directed vision (2026-09-23, guardrails added same day). Competitive facts dated 2026-09 — refresh
> during the weekly audit (see "Keeping the compass current").
> This file tells the CPO agent **where Menthoros is going**. The ROI formula tells it
> **what to do next**. Every recommendation must be consistent with both.

## 1. The thesis in one sentence

Menthoros wins by making the **coach's weekly decision** faster and better than any other
tool — so one coach serves more athletes at equal or higher quality, and athletes stay
because they *see* their coach's work paying off.

"Having AI" is **not** a differentiator. Competitors already ship it.

## 2. What is table stakes (parity, never the pitch)

Market leaders in Brazil already deliver all of this:

| Capability | Who already has it |
|---|---|
| Workout prescription + athlete app | Treino Online, SisRUN, Treinus, Guia de Corrida, TreinoGo |
| Garmin / Strava / Coros / Polar / Suunto sync | all of the above |
| Billing, Pix, auto-block of delinquent athletes | Treino Online, SisRUN, Treinus |
| RPE/feedback after each workout | Treino Online, Treinus |
| "AI assists, coach decides" positioning | Treino Online, Guia de Corrida (Claude integrated) |

Rule: build parity **only to the minimum that avoids losing a deal**. Never propose parity
work as a differentiator, and never let it consume more than a minority of a sprint
without founder approval.

Threat from the athlete side: Runna (acquired by Strava) auto-adapts plans for B2C
runners. Menthoros is the coach's answer to that — never a clone of it.

## 3. The four compass directions (where differentiation lives)

1. **Exception-first coaching** — the coach sees *who needs them today*, not a dashboard of
   everyone. Signals: adherence drop, RPE vs. pace mismatch, load spikes, athlete gone
   silent, upcoming race risk.
2. **Decision copilot that learns the coach** — `WeekSuggestion` + the coach's edit delta.
   Every edit is training data for *that coach's method*. This is the long-term moat;
   competitors ship generic AI, Menthoros ships *your* method at scale.
3. **Planned × executed fidelity** — block-level comparison from fine-grained data.
   Current source of truth: **intervals.icu** (Strava is no longer used). FIT direct /
   Garmin API is the contingency path. Better data → better
   suggestions → fewer edits.
4. **Visible value for the athlete, signed by the coach** — the athlete never talks to the
   AI; they receive coach-approved artifacts (progress reports, race readiness) that make
   the coach's work tangible and drive renewal and referrals.

Sequencing principle: **1 → 3 → 2**. Exception-first delivers value in week one and
generates the edit/attention data that directions 2 and 3 compound on.

## 4. Anti-directions (default to "Não fazer agora")

- Athlete-facing AI chat or autonomous plan changes without coach approval
  (contradicts coach-facing positioning; Runna / Assessoria.App own that space).
- Generic "AI features" whose value cannot be expressed in coach time saved or athlete
  retention.
- Feature-count races against incumbents (more dashboards, more report types, more
  integrations nobody asked for).
- Sports expansion (triathlon, cycling) before running is won.

An anti-direction may still be proposed only with an explicit argument for why the
compass should bend, flagged for the founder.

## 5. Guardrails (hard constraints — any proposal violating them is Off-compass)

**Data sources**
- Strava is out of the product. Never propose features that depend on the Strava API: its
  terms forbid showing athlete data to coaches and using it in AI.
- intervals.icu is a single-vendor dependency (solo maintainer). Ingestion stays behind a
  source abstraction (same pattern as `PaymentProvider`), and Menthoros keeps a normalized
  copy of the streams/blocks it needs, within athlete consent.
- Activities that reach intervals.icu *via Strava* arrive as stubs. Onboarding must push
  direct watch → intervals.icu connection and flag stub-only athletes to the coach.

**Coach authority and regulation**
- No suggestion reaches the athlete without explicit coach approval (CREF / Lei 9.696/98).
  Every approval is audit-logged.
- Every suggestion carries a human-readable "why".
- Safety rails: load-progression caps; block/flag on pain, injury or RPE anomalies.

**Privacy (LGPD)**
- Health data is sensitive personal data. Assessoria = controller, Menthoros = processor
  (DPA required). Consent comes from the athlete.
- No cross-assessoria learning without a clear legal basis; per-coach learning stays
  scoped by `assessoria_id`.

**Economics and focus**
- AI cost per athlete has an explicit ceiling; prefer batch/scheduled LLM processing over
  per-activity synchronous calls.
- The coach decision log (suggestion accepted / edited / rejected + diff) is a
  non-negotiable Enabler: every week without it is lost moat data.
- "% accepted without edit" is never reported alone — always paired with an outcome signal
  (adherence, injury, race result) to catch coach complacency.

## 6. How to apply the compass

Every feature analysis, discovery, benchmark, backlog proposal and Proposta nova must carry
a **Compass fit** label next to its ROI score:

| Label | Meaning | Effect |
|---|---|---|
| **Core** | Directly advances one of the four directions | Eligible for any bucket |
| **Enabler** | Unblocks a Core item (data, infra, billing needed to sell) | Eligible; state which Core item it unblocks |
| **Parity** | Table stakes, no differentiation | Cap at "Fazer em seguida" unless a live deal depends on it |
| **Off-compass** | Anti-direction or unrelated | Default "Não fazer agora"; founder must override |

Additional rules:

- **Propostas novas must be Core or Enabler.** If the best idea is off-compass, say so and
  propose a Core alternative too.
- Name which of the four directions the item serves and how it would move the
  compass metric below.
- When the user asks for something off-compass, still help — but flag the misalignment
  in one line and, where possible, suggest the compass-aligned variant.
- When auditing a sprint or backlog, report the **Core / Enabler / Parity / Off-compass
  mix**. A sprint with no Core item is a finding.

## 7. Compass metric (candidate — pending founder ratification)

**Coach review minutes per athlete per week, at equal or better athlete adherence.**

Supporting signals: % of `WeekSuggestion`s accepted without edit (trend up), athlete
90-day retention, athletes per coach.

Do not treat this as the ratified North Star until the founder confirms it in
`knowledge/product/`. Until then, use it as a lens, not a gate.

## 8. Keeping the compass current

During each weekly CPO audit:

- Re-check the table-stakes table: if a competitor launches something in one of the four
  Core directions, record it and assess whether the moat narrowed.
- Record evidence from the founding cohort that confirms or contradicts each direction.
- Re-check intervals.icu terms/limits and the share of stub-only athletes.
- Propose compass edits as drafts only — the compass is a strategic artifact; the founder
  decides.

---

## 9. Estado atual (auditoria 2026-09-23)

Baseado em evidência de código real em `apps/menthoros-backend` e `apps/menthoros-front`
(`origin/develop`), cruzada com `openspec/changes/*` e `prd/*` (`origin/master`). Ver a
sessão de auditoria completa para a tabela de ROI e o inventário item a item.

### Direção 1 — Triagem por exceção: **Atende**

`CoachAttentionQueueController/Service/ServiceImpl` + `CoachAttentionSignalEvaluator`
avaliam 7 sinais (fadiga/TSB, sobrecarga, aderência, inatividade, zonas vencidas, sem
plano, prova pendente) — cobre exatamente os sinais da bússola. Front:
`useAttentionQueue.ts`, `CoachAttentionQueuePage.tsx`, `CoachInboxPage.tsx`. Esta é a
direção mais madura do produto hoje.

### Direção 2 — Copiloto WeekSuggestion + delta do treinador: **Parcial**

Não existe entidade `WeekSuggestion`. Existe `SugestaoCoach` com ciclo
`PENDING → APPROVED | REJECTED`, `reasoningJson` (o "porquê") e `reviewedAt` (audit
trail). **Falta o estado EDITED + diff** — o dado de moat mais crítico da bússola (cada
edição do coach é dado de treino do "método do coach") não está sendo capturado.
Gerado por `SugestaoCoachGeneratorJob` (cron diário 6h, batch — não síncrono).

### Direção 3 — Planejado × executado via intervals.icu: **Parcial**

- Sem abstração de fonte (`ActivitySource`/`DataSource`): `IntervalsIcuClient` está
  acoplado direto nos services — viola o guardrail de dependência de fornecedor único.
- Sem detecção de atividades "stub" vindas de Strava→intervals.icu.
- Cópia normalizada parcial: laps existem, streams completos não confirmados.
- `FonteDados.STRAVA` segue vivo no enum e **`StravaActivitySyncScheduler` está ativo em
  produção** (`@Scheduled(fixedDelayString = "PT2H", ...)`, não comentado) — ver violação
  crítica abaixo.

### Direção 4 — Valor visível ao atleta assinado pelo coach: **Sem evidência (hipótese)**

Nenhum artefato tipo relatório de progresso / race readiness aprovado pelo coach e
entregue ao atleta foi encontrado no código.

### Guardrails

| Guardrail | Veredito | Evidência |
|---|---|---|
| Aprovação obrigatória + audit trail | Atende | `StatusSugestao` (transição inversa lança exceção), `reviewedAt`, `TenantContext` |
| "Por quê" em cada sugestão | Atende | `SugestaoCoach.reasoningJson` (jsonb, não-nulo) |
| Teto de progressão de carga + bloqueio dor/lesão | Atende | `TrainingPrescriptionGuardSkill` (BLOCKER/WARNING), `InjuryRiskEvaluator` |
| LGPD — escopo por `assessoria_id` | Atende | `tenant_id` em quase toda entidade, `TenantContext.getRequiredTenantId()`, `@RequireTenant` |
| LGPD — consentimento do atleta | Atende (código); DPA formal é artefato jurídico, sem evidência de código | `UsuarioLgpdConsent`, `LgpdConsentInterceptor` |
| Custo de IA — batch vs síncrono | Atende | `SugestaoCoachGeneratorJob` (cron), `BatchPlanProcessor` (virtual thread/atleta), `WorkoutAnalysisListener` (`@Async` + `AFTER_COMMIT`) |
| **Strava fora do produto** | **VIOLA** | Ver abaixo |

### Violação crítica confirmada: Strava ainda ativo em produção

Apesar da bússola declarar "Strava não é mais usado" e `knowledge/engineering/integrations.md`
descrever Strava como "implementado mas não habilitado para uso em produção", o código
mostra o oposto:

- `StravaActivitySyncScheduler.runDailyIncrementalSync()` roda a cada 2h
  (`@Scheduled(fixedDelayString = "PT2H", initialDelayString = "PT1M")`, **não comentado**)
  para todo atleta com integração Strava ativa e não pausada.
- `CanalIntegracao.java` documenta a decisão: Strava não é oferecido a atletas *novos*, mas
  atletas *já conectados* continuam no pipeline legado, sem prazo de desligamento.
- Dado importado via Strava cai na mesma `TreinoRealizado`/`FonteDados.STRAVA` que alimenta
  o `WorkoutAnalysisListener` (análise por IA) e o `CoachAttentionSignalEvaluator` (fila de
  atenção do treinador) — ou seja, **dado de atleta via Strava ainda é mostrado ao
  treinador e usado em IA**, o que os termos da API do Strava (nov/2024) proíbem
  explicitamente.
- Nenhuma migração para reclassificar `FonteDados.STRAVA` como legado, nem sinalização de
  atletas "Strava-only" ao coach, foi encontrada.

Este é o achado de maior risco da auditoria — não é uma lacuna de feature, é uma violação
ativa e contínua de termos de terceiro com dado já em produção. Decisão fica com o
founder (ver mensagem da sessão de auditoria 2026-09-23).

### Mix Core/Enabler/Parity/Off-compass — backlog ativo (37 changes)

Ver tabela de ROI completa na sessão de auditoria. Resumo: a maior parte do backlog ativo
(24 de 37 changes) está em **Não iniciado**; a direção 2 (copiloto) e a direção 3
(fidelidade planejado×executado), que são o núcleo do moat de longo prazo, são as que
mais precisam de investimento imediato — a direção 1 (triagem) já está madura e deveria
parar de consumir sprint como item novo.
