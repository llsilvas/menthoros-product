**Tamanho:** M · **Trilha:** Full

> Full porque troca o modelo da rota que produz o texto de análise entregue ao coach, sem eval de
> qualidade existente, e porque depende de curadoria humana de casos reais.

**Status:** rascunho (2026-11-15, `/change`) — escopo curto; detalhar depois que a change 1 mergear
**Criado:** 2026-11-15
**Depende de:** `consolidate-llm-on-openai` (mecanismo de fallback, call sites desacoplados da
Anthropic, medição de custo real). **Não iniciar antes dela.**

## Por que

A rota `complex` (`claude-sonnet-4-6`, `WorkoutAnalysisListener`) é o maior custo de LLM por atleta:
~US$ 0,027 por análise, ~R$ 2,6/atleta/mês pela estimativa de `docs/ia/custo-por-atleta.md`
(premissa, a ser substituída pela medição da change 1). O `gpt-6-luna` custaria cerca de 16 vezes
menos. **Não existe hoje nenhum eval de qualidade da análise de treino** — migrar sem ele é apostar.

## O que muda

1. **Eval da análise de treino** (novo): conjunto de 10–20 análises reais anonimizadas, grader
   determinístico (schema, `primary_cause` válido, `execution_score` em faixa, campos não vazios) e
   revisão cega do coach, Sonnet × Luna (`none` e `medium`).
2. **Migrar `complex`** para `gpt-6-luna` com fallback Sonnet (mecanismo da change 1), só se o eval
   passar.
3. **Decidir** se a análise passa a sair direto em PT-BR, eliminando as 4 chamadas de tradução por
   análise. Se sim, vira decisão própria com o eval cobrindo o texto em PT-BR.

## Fora de escopo

Rotas `plano`, `simple`, `standard`; circuit breaker; qualquer mudança no schema da análise.

## Critérios de aceite (esboço — refinar)

- **CA1** — GIVEN 10–20 análises reais curadas pelo coach, WHEN Sonnet e Luna analisam os mesmos
  treinos, THEN a revisão cega não prefere Sonnet em mais casos que Luna, e o grader determinístico
  não tem mais violações que o baseline.
- **CA2** — GIVEN a rota `complex` migrada, WHEN a primária falha (5xx, 429, timeout), THEN o
  fallback Sonnet entrega a análise e `llm_fallback_total` registra (reuso da change 1).
- **CA3** — GIVEN 1 semana em `develop`, THEN a taxa `FAILED` + `translationFailed` em
  `tb_analise_workout` não é maior que a semana anterior.
- **CA4** — GIVEN a medição pós-migração, THEN o custo da análise por atleta/mês cai e o total
  fica dentro do teto definido na Open Question 1 da change 1.

## Métrica de sucesso

Análise entregue ao coach sem aumento de falha (±1 p.p.) e custo por atleta/mês medido em queda.
Coach-in-the-loop: o coach continua revisando a análise antes de qualquer exposição ao atleta
(`AthleteMessageGenerator` mantém a verificação existente).

## Open Questions & Assumptions

- **Bloqueante:** o coach-fundador cura e anonimiza os casos reais; sem isso a change não passa do
  eval. Prazo: a definir com o founder.
- **Aberto:** a análise em PT-BR direto elimina a tradução? Muda o prompt (`skills/workout-analysis`)
  e o conteúdo do `cachedSkillContent`.
- **Assumido:** o raciocínio do Luna em `medium` é suficiente para `primary_cause`; verificar no eval.
- **Aberto:** latência do Luna `medium` (~30 s no plano) cabe no `timeout` de 45 s da rota `complex`?
  O listener é `@Async`, mas segura conexão de banco durante a chamada
  (change `refactor-async-llm-listeners-outside-transaction`).
