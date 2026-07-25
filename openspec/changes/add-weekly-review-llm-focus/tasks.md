# Tasks — add-weekly-review-llm-focus (M · Full · backend, IA + loop)

> Fatia 2 de 3. Depende de `add-weekly-review-consolidation` (entregue, em `develop`). Cada bloco fecha com `./mvnw clean test`. CA entre colchetes. `verify:` = como saber que funcionou.

## Plano de execução — anchors reais (backend, 2026-07-25)

- **Ponto de extensão da F1:** `RevisaoSemanalListener.aoEncerrarSemana` (`:25`, `@TransactionalEventListener` AFTER_COMMIT, `try/catch` que engole falha) → `RevisaoSemanalServiceImpl.gerarNoEncerramento` (`:83`, insert-if-absent em `:88`). **Não** é `EncerramentoSemanaService` — esse só publica o `SemanaEncerradaEvent`. Entidade a estender: `RevisaoSemanal.java`. Consolidação determinística: `RevisaoSemanalCalculator`.
- **LLM assíncrono:** replicar `WorkoutAnalysisListener` (`:72`, `@Async("workoutAnalysisExecutor")`) + `config/external/WorkoutAnalysisAsyncConfig.java:17` (executor dedicado).
- **Checker de consistência:** espelhar `services/quality/PlanQualityChecker.java` (padrão do módulo p/ validar saída de LLM offline).
- **Insumo no prompt:** `PlanoTreinoPromptBuilder` (`:39`) — ~10 formatters injetados; `buildOptimizedPrompt` (`:171`) retorna `PromptGerado`. Chamado por `IaServiceImpl` (`:309`), acionado em `PlanoServiceImpl:129` (unitário) e `BatchPlanProcessor:80` (lote).
- **Captura do desfecho:** `PlanoReviewServiceImpl.aprovarPlano` (`:68`) + sinais `editadoPeloCoach`/`adicionadoPeloCoach` já persistidos em `TreinoPlanejado`.
- **Migration:** próxima livre é **V72** (a F1 usou `V71__create_tb_revisao_semanal.sql`).

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Integração ancorada — `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`PromptGerado`), síncrono `@Transactional`. Ver Code Anchors — [CA4]
- [x] 0.2 Reancoragem contra a F1 entregue (gate DoR 2026-07-25): hook real, threading (D8), captura por heurística (D9), checker de consistência (D10), enum de 4 valores, migration V72
- [ ] 0.3 Gate de rollout (não bloqueia implementação): validar A1 (custo LLM/atleta/mês) em canary via `CostTrackingAdvisor`, narrativa atrás de flag — [A1, D5]

## 1. Narrativa atrás de flag

- [ ] 1.1 Migration **V72** aditiva: `next_week_focus TEXT` + `focus_outcome VARCHAR(12)` em `tb_revisao_semanal`; `revisao_semanal_id UUID NULL REFERENCES tb_revisao_semanal(id) ON DELETE SET NULL` em `tb_plano_semanal` (vínculo da D9); campos nas entidades `RevisaoSemanal`/`PlanoSemanal` + enum `FocusOutcome` (PROPOSTO|MANTIDO|EDITADO|DESCARTADO) — [D5, D7, D9]
  - verify: `./mvnw flyway:validate`; teste de persistência lê e grava os três campos.
- [ ] 1.2 Template determinístico de `nextWeekFocus` derivado do `recommendationType`, escrito na geração da revisão (`gerarNoEncerramento`), com `focusOutcome = PROPOSTO` — [CA-LLM, D5]
  - verify: teste do `RevisaoSemanalServiceImpl` — revisão nasce com template e `PROPOSTO`, sem tocar em LLM.
- [ ] 1.3 Geração da narrativa por LLM em `@Async` com executor dedicado (padrão `WorkoutAnalysisAsyncConfig`), timeout + retry só de falha transitória; grava por update sobre a revisão já persistida — [CA-LLM, D8]
  - verify: teste assevera que a revisão é salva antes da chamada LLM e que falha/timeout deixa o template intacto.
- [ ] 1.4 Checker determinístico de consistência (espelha `PlanQualityChecker`): narrativa que sugere progressão com `recommendationType` RECOVERY/MAINTAIN é reprovada ⇒ fallback para template + contador Micrometer — [CA-LLM, D10]
  - verify: teste unitário do checker sobre textos fixos (aprovado/reprovado por tipo).
- [ ] 1.5 Flag `menthoros.weekly-review.llm.enabled` (padrão `@Value`/`@ConditionalOnProperty`): desligada ⇒ template, zero chamada LLM — [CA-LLM, D5]
  - verify: teste com flag off — `verifyNoInteractions` no cliente LLM.
- [ ] 1.6 Validação: `./mvnw clean test`

## 2. Insumo na geração do próximo plano

- [ ] 2.1 `RevisaoSemanalPromptFormatter` (padrão dos ~10 formatters) injetando `nextWeekFocus` + `recommendationType` da revisão mais recente no `PlanoTreinoPromptBuilder`, atrás de flag de injeção — [CA4]
  - verify: golden-master do prompt muda só no bloco novo; flag off ⇒ prompt byte-idêntico ao atual.
- [ ] 2.2 Coach-in-the-loop: revisão é contexto, não altera plano automaticamente nem é exposta ao atleta (nenhum endpoint `/me/*` a devolve) — [CA5]
  - verify: teste de que nenhuma rota de atleta expõe a revisão e que a geração não escreve plano sem ação do coach.
- [ ] 2.3 Ao consumir a revisão: gravar `revisao_semanal_id` no plano novo (vínculo durável da D9) e emitir `RevisaoConsumidaEvent{tenant, atleta, semanaInicio, revisaoId, planoId}` — proxy de adoção
  - verify: `ArgumentCaptor` no publisher confirma o payload; plano gerado tem o FK preenchido; flag off ⇒ FK nulo e nada publicado.
- [ ] 2.4 Validação: `./mvnw clean test`

## 3. Loop de aprendizado (heurística D9)

- [ ] 3.1 Inferir e gravar `focusOutcome` na aprovação (`PlanoReviewServiceImpl.aprovarPlano`), resolvendo a revisão pelo `revisao_semanal_id` do plano aprovado (nunca por "a mais recente"): MANTIDO sem treino editado/adicionado, EDITADO com — [CA8, D7, D9]
  - verify: teste dos dois ramos com `TreinoPlanejado` marcado e não marcado; teste de que a revisão atualizada é a apontada pelo FK, mesmo com uma revisão mais nova do mesmo atleta na base.
- [ ] 3.2 DESCARTADO quando o plano aprovado/rejeitado tem `revisao_semanal_id` nulo (revisão não consumida) ou quando o plano é rejeitado — [CA8, D9]
  - verify: teste dos dois gatilhos; FK nulo não atualiza revisão alheia.
- [ ] 3.3 Auto-approve (`OrigemAprovacao.AUTO_CONFIANCA_ALTA`) não registra desfecho — revisão permanece `PROPOSTO` (evita inflar MANTIDO sem coach no loop) — [D9]
  - verify: teste do caminho auto-approve não altera `focusOutcome`.
- [ ] 3.4 Expor `focusOutcome` agregável (contador Micrometer por desfecho) — sinal de aprendizado
  - verify: métrica incrementa por desfecho registrado.
- [ ] 3.5 Validação: `./mvnw clean test`

## 4. Testes (rastreados a CA)

- [ ] 4.1 Geração do próximo plano consome a revisão (flag ligada) e não consome (flag off) [CA4]
- [ ] 4.2 Revisão não vaza ao atleta nem altera plano sem ação do coach [CA5]
- [ ] 4.3 `focusOutcome` nos 3 desfechos da heurística [CA8]
- [ ] 4.4 Flag off ⇒ template, sem chamada LLM; flag on ⇒ narrativa reprovada pelo checker cai no template [CA-LLM]
- [ ] 4.5 Falha/timeout do LLM não deixa a revisão sem foco nem afeta o sinal da F1 [CA-LLM, D8]
- [ ] 4.6 Validação final: `./mvnw clean test`
