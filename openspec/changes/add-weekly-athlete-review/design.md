## Context

O Menthoros já possui dados suficientes ou em evolução para consolidar a semana do atleta: carga, treinos realizados, aderência, métricas de fadiga e análises de treino. Falta uma capability dedicada que organize isso em revisão semanal útil para a assessoria.

## Code Anchors (confirmados no backend — 2026-07-24)

Resolvem as pendências de DoR (definição de aderência/criticidade e ponto de integração). Todos em `apps/menthoros-backend`:

- **Aderência / criticidade de treino.** NÃO existe conceito nomeado de "treino-chave" (sem campo/enum/flag). Aderência é count/TSS-based:
  - `MetricasAdesaoService.calcularSemana(Atleta, LocalDate)` e `getAdesaoSemana(String atletaId, LocalDate)` — % = realizados/planejados (aceita data arbitrária, feito para jobs D+1). **Fonte primária da consolidação da v1.**
  - Roster: `CoachDashboardServiceImpl.java:257` (janela 4 semanas, realizado = `tp.getTreinoRealizado() != null`).
  - Fila de atenção: `CoachAttentionSignalEvaluator.avaliarAderencia(...)` (`:108`) — conta `PERDIDO`/`PARCIAL` em 14 dias.
  - **Proxy de criticidade v1** (para "treino de alta criticidade"): `TipoTreino.getFatorImpacto()` (existente; LONGO 1.15, INTERVALADO 1.4, TIRO 1.5, SUBIDA 1.6). Não criar campo novo. `percepcaoEsforcoEsperada` (`TreinoPlanejado.java:45`) é RPE alvo, **não** marcador de criticidade.
- **Ponto de integração da geração de plano (CA4).** `IaService.geraPlanoSemanalAvancado(Atleta, PlanoMetaDados, Prova, ModoGeracaoPlano, @Nullable DecisaoProgressao)` (`IaService.java:22`, impl `IaServiceImpl.java:309`) → `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` (`:171`), que monta `historicoFinal` e retorna o record `PromptGerado(String, List<Constraint>)` (`:336`). O insumo da revisão entra como **novo bloco `historicoFinal.append(...)` / novo formatter** (padrão já usado por ~10 formatters injetados) ou parâmetro extra propagado desde `geraPlanoSemanalAvancado`. Caminho unitário é **síncrono e `@Transactional`** (`PlanoServiceImpl.java:129`); lote é `@Async` (`BatchPlanProcessor.java:80`).
- **Feature flag (D8).** Padrão do repo: `@Value("${...enabled:true}")` + `@ConditionalOnProperty` (ex.: `EncerramentoSemanaScheduler.java:41`). Não há tabela de flags. Usar `menthoros.weekly-review.llm.enabled`.
- **Custo LLM (A1).** `CostTrackingAdvisor` (`ai/cost/CostTrackingAdvisor.java`) já publica contadores Micrometer (`llm.tokens.input/output`, `llm.cost.estimated.usd`) com tags `model`+`route` para **toda** chamada roteada (`MultiModelConfig.java:52`); preços em `llm-pricing.yml`; log `[llm-usage]` via `LlmUsageLogger`. Para custo **por atleta/mês** é preciso estender tags (cuidado com cardinalidade) ou persistir por chamada (precedente `SkillExecution`) — decidir no canary A1.

## Goals / Non-Goals

**Goals:**
- gerar revisão semanal estruturada do atleta
- consolidar execução e risco em uma única leitura
- usar a revisão como insumo para a próxima prescrição

**Non-Goals (v1):**
- substituir toda interpretação humana do treinador
- produzir relatório longo sem ação prática
- consumir métricas de zona/decoupling derivadas de `.fit` (v1 usa só log manual + PMC/TSB já calculados)
- feature de tendência/comparação semana-a-semana (persiste a janela, mas sem UI/endpoint de histórico)
- superfície visual dedicada no shell do coach (v1 é backend-only; UI é fast-follow)
- notificação automática ao atleta
- job automático de fechamento semanal (v1 é sob demanda)

## Decisions

### D1: Revisão semanal estruturada

**Decisão:** A revisão semanal deve resumir carga, aderência, fadiga, evolução e foco recomendado.

**Rationale:** Esses são os elementos mínimos para fechar a semana de forma útil.

---

### D2: Revisão como insumo da próxima prescrição

**Decisão:** A geração do próximo plano deve poder consumir a revisão semanal mais recente.

**Rationale:** O valor da revisão aumenta quando ela muda a próxima decisão.

---

### D3: Revisão com janela semanal fechada

**Decisão:** A revisão deve ser calculada sobre uma janela semanal explícita (`semanaInicio`/`semanaFim`) para evitar ambiguidade temporal.

**Rationale:** Isso facilita persistência, reprocessamento e comparação histórica.

---

### D4: Consolidação determinística + `recommendationType` determinístico + narrativa por IA só no `nextWeekFocus`

**Decisão:** Aderência, carga, fadiga e evolução são calculadas de forma **determinística** a partir dos dados já persistidos (planejado vs realizado, PMC/TSB). Um campo estruturado **`recommendationType ∈ {RECOVERY, MAINTAIN, PROGRESS}` também é calculado deterministicamente** a partir desses sinais (regras: baixa aderência ou `confidence = BAIXA` ⇒ nunca `PROGRESS`). O LLM é usado **apenas** para redigir o `nextWeekFocus` (narrativa), e recebe o `recommendationType` como **restrição** — a narrativa não pode contrariar o tipo determinístico.

**Rationale:** O `recommendationType` é o que torna CA2/CA3 testáveis por JUnit sem string-matching sobre saída de LLM (a asserção é sobre o campo, não sobre a narrativa). Mantém precisão dos números (não "alucinam") e limita o custo LLM a 1 chamada/semana/atleta — dentro do envelope de R$1,10/atleta/mês (achado do CPO review: cadência semanal é barata, ≠ análise por treino do `WorkoutAnalysisListener`). Testes de consolidação e de guarda de progressão não dependem do LLM.

**Limiar de dados insuficientes (`confidence = BAIXA`):** janela com <2 treinos realizados OU sem ao menos 1 ponto de PMC/TSB válido. (Default v1 — ajustável pelo founder; ancorado num número para ser testável, CA3.)

---

### D5: Coach-in-the-loop — revisão é insumo, nunca aplicação automática

**Decisão:** A revisão (incl. `nextWeekFocus`) é entregue ao treinador como insumo/sugestão. Ela alimenta o contexto da geração do próximo plano, mas **não** altera o plano automaticamente, e **não** é exposta ao atleta.

**Rationale:** Preserva a estrela-guia (coach decide). Alinhado ao padrão do `WeekSuggestion`/`SugestaoCoach`.

---

### D6: Loop de aprendizado — registrar foco proposto vs. editado

**Decisão:** Ao gerar/aprovar o próximo plano, registrar se o `nextWeekFocus` proposto foi mantido, editado ou descartado pelo treinador.

**Rationale:** É o sinal de aprendizado que compõe o moat — proposta da IA vs. correção do coach. Sem isso, a revisão é output unidirecional e não alimenta o `WeekSuggestion`.

---

### D7: Gatilho sob demanda + idempotência por janela (v1)

**Decisão:** v1 calcula a revisão **sob demanda** (quando o coach abre a revisão ou gera o próximo plano). Persistência com unicidade `(tenant, atleta, semanaInicio)` — regenerar a mesma janela atualiza in-place.

**Rationale:** Evita um scheduler cross-tenant nesta change (custo/risco). Idempotência garante que reprocessar não duplica nem infla custo. Job automático fica como upgrade; histórico de tendência fica fora da v1 (A4).

---

### D8: Narrativa LLM atrás de flag (kill-switch)

**Decisão:** A geração do `nextWeekFocus` via LLM fica atrás de uma feature flag. Desligada, a revisão mantém toda a consolidação determinística + o `recommendationType` e produz um `nextWeekFocus` template-based (sem LLM). Uma segunda flag controla a injeção da revisão na geração do próximo plano (CA4).

**Rationale:** Permite (a) começar a implementação sem esperar a validação de custo A1 (aferida em canary com a flag ligada num tenant), e (b) rollback imediato pós-rollout se o custo ou a qualidade do `nextWeekFocus` for ruim, sem perder a parte determinística (que é o núcleo de valor testável).

## Technical Notes

### Contrato mínimo sugerido

```text
WeeklyAthleteReview
- tenantId              (isolamento — via TenantContext)
- atletaId
- semanaInicio         (janela explícita; unicidade (tenant, atleta, semanaInicio))
- semanaFim
- adherenceSummary     (status ALTA|MEDIA|BAIXA + % + treinos-chave realizados/planejados)  ← determinístico
- trainingLoadSummary  (TSS realizado vs planejado)                                          ← determinístico
- fatigueSummary       (TSB final + delta na janela)                                         ← determinístico
- progressionSummary                                                                          ← determinístico
- recommendationType   (RECOVERY|MAINTAIN|PROGRESS — restringe a narrativa, D4)                ← determinístico
- nextWeekFocus        (narrativa, consistente com recommendationType)                         ← IA (LLM, atrás de flag D8)
- risks[]
- confidence           (ALTA|BAIXA — rebaixada em <2 treinos ou sem PMC/TSB válido)
- focusOutcome         (PROPOSTO|MANTIDO|EDITADO|DESCARTADO — sinal de aprendizado, D6)
- generatedAt
```

### Fontes mínimas da revisão

- treinos planejados da semana
- treinos realizados da semana
- debriefs pós-treino quando existirem
- métricas de carga/fadiga
- contexto de provas e fase da periodização

## Risks / Trade-offs

- **[Risco] Resumo superficial demais** → Mitigação: consolidação sobre sinais estruturados determinísticos (D4); LLM só redige o foco sobre números já prontos.
- **[Risco] Custo LLM fora do envelope** → Mitigação: 1 chamada/semana/atleta + idempotência (D7). Instrumentar custo real por atleta/mês antes do rollout (A1).
- **[Risco] Recomendar progressão em semana ruim/incompleta** → Mitigação: `confidence = BAIXA` bloqueia progressão agressiva (CA2, CA3).
- **[Risco] Vazamento multi-tenant** → Mitigação: geração e consulta sempre sob `TenantContext`; unicidade inclui `tenant` (CA7).
- **[Risco] Revisão vira ruído se ninguém consome** → Mitigação: métrica-proxy (≥70% dos planos seguintes consomem a revisão) e sinal de aprendizado (`focusOutcome`) detectam adoção baixa cedo.

## Migration Plan

1. Migration aditiva: tabela `tb_revisao_semanal` com unicidade `(tenant, atleta, semanaInicio)`
2. Consolidação determinística dos sinais da janela
3. Geração do `nextWeekFocus` via infra LLM; persistência idempotente
4. Integração como insumo da geração do próximo plano + registro de `focusOutcome`

## Rollback

- Flag da narrativa LLM desligada (D8) ⇒ revisão volta a ser 100% determinística (`recommendationType` + `nextWeekFocus` template), sem perder valor testável.
- Flag de injeção na geração de plano desligada ⇒ a revisão para de alimentar a prescrição, sem afetar planos existentes. Migration é aditiva, sem rollback de schema necessário.

## Open Questions

- **A1 (gate de rollout, não de implementação)** — validar em canary o custo LLM real por atleta/mês contra o envelope de R$1,10; critério de decisão no proposal (§Gate do founder). Não bloqueia `/implement init` (narrativa atrás de flag, D8).
- Q1 (histórico de tendência) e Q2 (UI dedicada) foram **decididas como fora da v1** — ver A4/A5 no proposal.
