# Menthoros — Roadmap de Implementação

Documento de priorização e ordem de execução dos changes ativos do projeto. Reflete a visão de produto e a lógica de dependências técnicas entre as entregas.

**Última atualização:** 2026-07-20 (auditoria de sprint — ver nota abaixo)
**Fonte canônica de especificação:** `openspec/changes/`
**Tracker operacional (sprint a sprint, atualizado com mais frequência que este documento):** `openspec/SPRINTS.md`
**Issues residuais:** `docs/issues/`
**Docs correlacionados:** `docs/architecture/` (técnica), `docs/strategy/PRODUTO_MENTHOROS_ESTRATEGIA.md` (documento canônico de visão e estratégia de produto), `docs/operations/` (runbooks), `docs/archive/` (roadmaps antigos e planos absorvidos)

> **Nota da auditoria de 2026-07-20:** este documento estava parado desde 2026-04-22 — quase 3 meses
> sem reconciliar com o que já foi entregue. Praticamente todas as Ondas 1-2 e boa parte da 3-6 já
> saíram (ver ✅ abaixo, com path de archive). Onde este documento e o `SPRINTS.md` divergirem, o
> `SPRINTS.md` é a fonte mais confiável — ele é atualizado a cada sprint, este documento é revisado
> com menos frequência (visão de ondas/dependências de mais alto nível).

---

## Princípios de ordenação

1. **Dado real antes de refinar fórmulas.** Não faz sentido calibrar TSS/CTL/ATL/TSB em cima de input manual ruidoso.
2. **Motor analítico correto antes de UX de treinador.** Features de treinador construídas sobre cálculos errados precisam ser retrabalhadas.
3. **Entregas fatiáveis.** Changes grandes (Strava, domain skills, progressão) devem ser quebrados em incrementos que geram valor isoladamente.
4. **Não estabilizar o que ainda vai mudar.** Formalização arquitetural (domain skills) só depois que as regras estiverem calibradas.

---

## Visão geral por onda

| Onda | Tema | Changes | Status |
|:---:|---|---|---|
| 1 | Fundação de dado real | `strava-integration` (fatiada em `strava-oauth`/`strava-webhooks`/`strava-async-import`/`strava-activity-sync`) | ✅ **Entregue** (produção desde 2026-04-26 a 2026-05-01; arquivada retroativamente em 2026-07-20 — auditoria de sprint) |
| 2 | Correções críticas de cálculo | `fix-tsb-semantics` ✅, `add-continuous-daily-load-management`, `progressao-treinos` ✅, `refine-tss-tsb-precision`, `fix-weekly-load-distribution` ✅ | **3/5 entregues** — `add-continuous-daily-load-management` e `refine-tss-tsb-precision` seguem pendentes (ver `SPRINTS.md`) |
| 3 | Confiança no motor analítico | `add-zone-confidence-management`, `add-running-field-tests` | Pendente (nenhuma das duas iniciada) |
| 4 | Experiência do treinador | `add-coach-attention-queue` ✅, `add-post-workout-debrief`, `add-weekly-athlete-review`, `add-recommendation-explainability` ✅ | **2/4 entregues** — `add-post-workout-debrief` e `add-weekly-athlete-review` seguem pendentes |
| 5 | Arquitetura agêntica | `add-llm-tool-use`, `introduce-domain-skills-architecture` (✅ superada por `build-skills-core-foundation`), `llm-code-switching` | Rebaixada para bloco de engenharia agrupado (ver `SPRINTS.md`) — não bloqueia mais features visíveis |
| 6 | Features de produto avançadas | `add-daily-readiness-checkin` ✅, `add-race-time-prediction` ✅, `add-taper-guidance`, `add-macrociclo-structure` | **2/4 entregues** — `add-taper-guidance` e `add-macrociclo-structure` seguem pendentes |

**Fora do roadmap ativo:**
- `fix-multi-tenancy-enforcement` — ✅ **Entregue** (arquivada em `archive/2026-06/2026-06-02-fix-multi-tenancy-enforcement/`); `tenant_id`/`TenantContext` já é o padrão consolidado em todo o backend.
- `introduce-coach-assistant-core-features` — ✅ change guarda-chuva; conteúdo absorvido e entregue via as capabilities específicas da Onda 4.

---

## Onda 1 — Fundação de dado real ✅ ENTREGUE

### `strava-integration` (fatiada em 4 changes) ✅

Entregue em produção entre 2026-04-26 e 2026-05-01 — bem antes da disciplina atual de arquivamento
OpenSpec ter se consolidado, por isso as 4 changes abaixo ficaram sem arquivar até a auditoria de
sprint de 2026-07-20:

- **`strava-oauth`** ✅ — `StravaOAuthServiceImpl` + `StravaAuthController` (conexão OAuth2, refresh
  de token). Arquivada em `archive/2026-04/2026-04-26-strava-oauth/`.
- **`strava-webhooks`** ✅ — `StravaWebhookServiceImpl` + `StravaWebhookController` (eventos
  create/update/delete em tempo real). Arquivada em `archive/2026-04/2026-04-26-strava-webhooks/`.
- **`strava-async-import`** ✅ — sync manual de 90 dias + `GET /sync-status/{atletaId}`. Arquivada
  em `archive/2026-04/2026-04-29-strava-async-import/`.
- **`strava-activity-sync`** ✅ — `DailyActivitySyncScheduler` + `MatchingDecisionEngine`
  (reconciliação diária planejado×realizado). Arquivada em
  `archive/2026-05/2026-05-01-strava-activity-sync/`.

O padrão `tenant_id`/`TenantContext` cogitado como "alinhamento obrigatório com a branch de tenancy"
já é a convenção consolidada em todo o backend hoje (`fix-multi-tenancy-enforcement` ✅, arquivada em
`archive/2026-06/2026-06-02-fix-multi-tenancy-enforcement/`).

**Não construído nesta onda** (specs descartadas na auditoria de 2026-07-20 — zero evidência de
implementação e sem plano de retomada): `strava-conditional-insights` (alertas de atividade +
insights via LLM condicional) e `strava-risk-semaphore` (score de risco 0-100 + semáforo). A
intenção por trás de `strava-risk-semaphore` acabou coberta, de forma diferente e mais ampla, por
`add-coach-attention-queue` ✅ (Onda 4).

---

## Onda 2 — Correções críticas de cálculo (3/5 entregues)

Com dado real do Strava alimentando o sistema, é hora de garantir que as fórmulas centrais representem corretamente o estado do atleta.

### `fix-tsb-semantics` ✅ entregue

Corrige a mistura de prontidão pré-treino com fadiga pós-treino no cálculo do TSB. Arquivada em
`archive/2026-06/2026-06-02-fix-tsb-semantics/`.

### `add-continuous-daily-load-management` (21 tasks) — pendente

Trata dias de descanso como parte explícita da série fisiológica e desacopla o comportamento do lançamento diário de treino. Consolida a interpretação do TSB como estado contínuo, não como função do lançamento do dia. Ainda não iniciada — ver `SPRINTS.md`.

### `progressao-treinos` ✅ entregue (2026-07-08)

Substitui o contador simples de `semanasProgressaoContinua` por um envelope técnico (janelas
7/21/42d) que considera aderência, qualidade de execução, longões realizados, RPE e resposta
recente. Arquivada em `archive/2026-07/2026-07-08-progressao-treinos/`.

### `refine-tss-tsb-precision` (8 seções, ~35 tasks) — pendente

Agrupa refinamentos residuais de precisão do motor de cálculo: elevação bidirecional, Ramp Rate com fallback, TSS por etapa, thresholds de TSB por nível, piso de pace para IF saturável e triângulo pace/distância/duração (ex-BACKLOG P2-A/B). Absorve as ex-ISSUE-07 a ISSUE-10 do `docs/issues/`. Ainda não iniciada.

### `fix-weekly-load-distribution` ✅ entregue

Aplica regras determinísticas de distribuição hard/easy, espaçamento entre sessões-chave e alinhamento com `disponibilidadeSemanal` do atleta antes de persistir a `PlanoSemanal`. Arquivada em
`archive/2026-06/2026-06-02-fix-weekly-load-distribution/`.

---

## Onda 3 — Confiança no motor analítico (pendente)

### `add-zone-confidence-management` (12 tasks) — pendente

Classifica zonas fisiológicas por nível de confiança (estimada, vencida, incoerente, confiável). Impede que o sistema pareça preciso sem base real, condição necessária para a explicabilidade da Onda 4.

### `add-running-field-tests` (35 tasks) — pendente

Formaliza testes de campo (3 km, 5 min) como elemento operacional do ciclo. É o canal natural para recalibrar zonas alimentadas pelo Strava, fechando o loop com a capability anterior.

---

## Onda 4 — Experiência do treinador (2/4 entregues)

Ordem interna segue o ritmo operacional do treinador: diário → pós-sessão → semanal → transversal.

### `add-coach-attention-queue` ✅ entregue (2026-06-18)

Fila operacional de atletas que exigem ação. Hook diário que traz o treinador para o produto e consolida o valor das análises.

### `add-post-workout-debrief` (17 tasks) — pendente

Leitura estruturada do que aconteceu na sessão e seu impacto na sequência do ciclo. Fecha o ciclo pós-execução que hoje é manual.

### `add-weekly-athlete-review` (12 tasks) — pendente

Consolidação semanal automatizada. Reduz tempo operacional e dá consistência à decisão sobre a próxima semana.

### `add-recommendation-explainability` ✅ entregue (2026-06-19)

Explicabilidade estruturada (rationale determinístico por sinal), acoplada à fila de atenção do treinador.

---

## Onda 5 — Arquitetura agêntica (rebaixada, agrupada no fim)

Repriorizada em 2026-07-06: infraestrutura de IA pura não bloqueia mais feature visível — ver
`SPRINTS.md` "Bloco de engenharia" para a sequência atual.

### `add-llm-tool-use` (11 seções, ~35 tasks) — pendente, spike primeiro

Infraestrutura base para exposição de ferramentas Java ao LLM via Spring AI `@Tool`. Rebaixada para bloco de engenharia (Sprint 25+): inicia com spike de validação empírica (~3 dias) antes de investir na infraestrutura completa. Fundação para a família RAG.

### `introduce-domain-skills-architecture` ✅ superada

Superada por `build-skills-core-foundation` (contratos, `SkillRegistry`, `SkillOrchestratorService`,
persistência V32, 7+ skills), já em `develop`.

### `llm-code-switching` (21 tasks) — pendente

Otimização de custo e qualidade de LLM via prompts mistos PT/EN. Ganho incremental sobre funcionalidade já entregue.

---

## Onda 6 — Features de produto avançadas (2/4 entregues)

Pacote de diferenciação competitiva.

### `add-daily-readiness-checkin` ✅ entregue (2026-07-03, backend-only)

Captura diária de prontidão subjetiva (sono, humor, dores, energia, estresse) com cálculo determinístico de `readinessScore` e `nivelProntidao`. Integrado como sexto portão em `IntervaladoElegibilidadeService`. Arquivada em `archive/2026-07/2026-07-03-add-daily-readiness-checkin/`.

### `add-race-time-prediction` ✅ entregue

Predição de tempo por prova-alvo. Arquivada em `archive/2026-06/2026-06-01-add-race-time-prediction/`. Ganhou continuidade em `infer-thresholds-from-recent-workouts` ✅ e `infer-threshold-from-race-result` ✅ (2ª fonte de `paceLimiarEstimado` via prova real, 2026-07-17).

### `add-taper-guidance` (10 seções, ~25 tasks) — pendente

Cálculo determinístico da janela de taper por prova-alvo com estratégias LINEAR, EXPONENCIAL ou STEP. Ainda não iniciada.

### `add-macrociclo-structure` (11 seções, ~35 tasks) — pendente

Estrutura explícita de macrociclo (12–24 semanas) com mesociclos determinísticos em fases BASE → ESPECIFICO → PICO → TAPER → TRANSICAO. Ainda não iniciada. Coordena com `add-taper-guidance` e `progressao-treinos` ✅ (documentado em `design.md`).

---

## Fora do roadmap ativo

### `fix-multi-tenancy-enforcement` ✅ entregue
Arquivada em `archive/2026-06/2026-06-02-fix-multi-tenancy-enforcement/`. `tenant_id`/`TenantContext` é o padrão consolidado em todo o backend hoje (Strava e intervals.icu seguem o mesmo modelo).

### `introduce-coach-assistant-core-features` ✅ absorvida
Change guarda-chuva do qual derivam as capabilities da Onda 4 — conteúdo absorvido e entregue nos changes específicos (`add-coach-attention-queue` ✅, `add-recommendation-explainability` ✅; `add-post-workout-debrief`/`add-weekly-athlete-review` seguem pendentes).

### Bugs e inconsistências já resolvidas (docs/issues)
ISSUE-01 a ISSUE-06 estão resolvidas em código + testes. Ver `docs/issues/README.md` para detalhes e lacunas de cobertura de testes futuras.

---

## Dependências entre ondas

```
Onda 1 (Strava) ──► Onda 2 (fix cálculos) ──► Onda 3 (confiança) ──► Onda 4 (UX treinador)
                                                                            │
                                                                            └──► Onda 5 (arquitetura)
```

- **Onda 2 depende de Onda 1:** fórmulas calibradas sobre dado real.
- **Onda 3 depende de Onda 2:** confiança em zonas pressupõe TSB correto.
- **Onda 4 depende de Onda 3:** UX do treinador só convence com motor analítico confiável.
- **Onda 5 depende de Onda 4:** formalizar arquitetura só depois que as regras estiverem maduras.

---

## Como usar este documento

- **Sprint planning:** priorizar sempre a onda ativa; só puxar da próxima quando a atual estiver em testes/review.
- **Novo change no openspec:** classificar em uma das ondas antes de iniciar.
- **Change novo sem onda clara:** sinal de que o escopo pode estar desalinhado do roadmap — reavaliar.
- **Atualização:** ao arquivar um change em `openspec/changes/archive/`, marcar como concluído na onda correspondente.
