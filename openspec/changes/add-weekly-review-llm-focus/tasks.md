# Tasks — add-weekly-review-llm-focus (M · Full · backend + front mínimo, IA + loop)

> Fatia 2 de 3. Depende de `add-weekly-review-consolidation` (entregue, em `develop`). Backend fecha cada bloco com `./mvnw clean test`; o bloco de front com `npm run lint && npm run build && npm run test:run`. CA entre colchetes. `verify:` = como saber que funcionou.

## Plano de execução — anchors reais (backend, 2026-07-25)

- **Ponto de extensão da F1:** `RevisaoSemanalListener.aoEncerrarSemana` (`:25`, `@TransactionalEventListener` AFTER_COMMIT, `try/catch` que engole falha) → `RevisaoSemanalServiceImpl.gerarNoEncerramento` (`:83`, insert-if-absent em `:88`). **Não** é `EncerramentoSemanaService` — esse só publica o `SemanaEncerradaEvent`. Entidade a estender: `RevisaoSemanal.java`. Consolidação determinística: `RevisaoSemanalCalculator`.
- **LLM assíncrono:** replicar `WorkoutAnalysisListener` (`:72`, `@Async("workoutAnalysisExecutor")`) + `config/external/WorkoutAnalysisAsyncConfig.java:17` (executor dedicado). Não há precedente de timeout/retry em chamada LLM no codebase (`@EnableRetry` ligado sem consumidor) — escolher o mecanismo na task 1.3.
- **Checker de consistência:** espelhar `services/quality/PlanQualityChecker.java`.
- **Insumo no prompt:** `PlanoTreinoPromptBuilder` (`:39`) — ~10 formatters injetados; `buildOptimizedPrompt` (`:171`) retorna `PromptGerado`. Chamado por `IaServiceImpl` (`:309`), acionado em `PlanoServiceImpl:129` (unitário) e `BatchPlanProcessor:80` (lote). Campos in-memory antes do save: padrão dos `planner_*` em `PlanoServiceImpl.criarPlanoComTreinos` (`:440`) / `salvarPlanoCompleto` (`:251`).
- **Desfecho:** `PlanoReviewServiceImpl.aprovarPlano` (`:68`) e `aprovarTransicao` (`:85` — compartilhado com auto-approve, ver D9) + `TreinoPlanejado.editadoPeloCoach`/`adicionadoPeloCoach` (`:33-37`).
- **Migration:** próxima livre é **V72** (a F1 usou `V71__create_tb_revisao_semanal.sql`).
- **Front (D13):** `src/types/RevisaoSemanal.ts`, `src/features/coach/adapters/weeklyReviewAdapters.ts`, `src/features/coach/types/WeeklyAthleteReview.ts`, `WeeklyReviewCard.tsx` + testes — 18 referências aos 2 campos renomeados.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Integração ancorada — `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`PromptGerado`), síncrono `@Transactional`. Ver Code Anchors — [CA4]
- [x] 0.2 Reancoragem contra a F1 entregue (gate DoR 2026-07-25): hook real, threading (D8), checker (D10), migration V72
- [x] 0.3 Grilling de domínio (2026-07-25): desfecho renomeado e movido para o plano (D9), janela de validade (D11), `focusSource` (D12), padronização de idioma (D13) — glossário e `CLAUDE.md` atualizados
- [ ] 0.4 Gate de rollout (não bloqueia implementação): validar A1 (custo LLM/atleta/mês) em canary via `CostTrackingAdvisor`, agora segmentável por `focusSource` — [A1, D5, D12]

## 1. Schema e narrativa atrás de flag

- [x] 1.1 Migration **V72**: aditivas `next_week_focus TEXT` + `focus_source VARCHAR(10)` em `tb_revisao_semanal`; `consumed_review_id UUID NULL REFERENCES tb_revisao_semanal(id) ON DELETE SET NULL` + `consumed_review_outcome VARCHAR(20)` em `tb_plano_semanal`; renames `dados_suficientes`→`sufficient_data` e `percentual_realizacao`→`completion_rate`. Entidades + enums `FocusSource` e `ConsumedReviewOutcome` — [D5, D9, D12, D13]
  - verify: ✅ `RevisaoSemanalRepositoryTest` 8/8 contra Postgres real (Testcontainers) — V71+V72 aplicam limpo em base nova; round-trip de `next_week_focus`/`focus_source`, vínculo `consumed_review_id` e desfechos independentes em consumo duplo. Rename aplicado em 34 referências do escopo da revisão (o `percentualRealizacao` do domínio de adesão NÃO foi tocado — outro conceito). Suíte completa 2138 testes, 6 erros **pré-existentes** (checksum V71 no Postgres local, reproduzido em árvore limpa).
- [x] 1.2 Template determinístico de `nextWeekFocus` derivado do `recommendationType`, escrito em `gerarNoEncerramento` com `focusSource = TEMPLATE` — [CA-LLM, CA-Fonte, D5]
  - verify: ✅ `RevisaoSemanalCalculator.nextWeekFocusTemplate` (5 testes: 3 tipos + `@EnumSource` de cobertura total + rejeição de nulo) e `RevisaoSemanalGeracaoIT.nasceComFocoTemplate` — revisão nasce com template e `TEMPLATE`, sem tocar em LLM. Como o texto deriva do tipo, ele nunca pode contrariá-lo.
- [x] 1.2b **(gap descoberto na execução)** Expor `nextWeekFocus` + `focusSource` no `RevisaoSemanalOutputDto` — sem isso a narrativa nunca chega ao card da F3, que já a renderiza — [CA-LLM]
  - verify: ✅ `CoachRevisaoSemanalControllerTest` verde com os campos novos no contrato.
- [x] 1.3 Narrativa por LLM em `@Async("weeklyFocusExecutor")`, com `@Retryable` (2 tentativas, backoff 2s); grava por update sobre a revisão já persistida, com `focusSource = LLM` — [CA-LLM, CA-Fonte, D8]
  - verify: ✅ `WeeklyFocusNarrativeServiceTest` 5/5 — falha do modelo preserva template + `TEMPLATE` e não propaga; revisão inexistente é no-op.
  - ⚠️ **Timeout de resposta NÃO entregue.** Nenhum cliente LLM do módulo tem timeout (gap já registrado no `CLAUDE.md`), e configurá-lo exigiria mexer no `MultiModelConfig`, mudando o comportamento de todas as rotas (geração de plano, análise de treino). Fica para `add-external-call-resilience`. Mitigação: pool dedicado (core 1 / max 2) — chamada pendurada consome thread deste executor, nunca a do coach.
- [ ] 1.4 Checker determinístico de consistência (espelha `PlanQualityChecker`): narrativa sugerindo progressão com RECOVERY/MAINTAIN é reprovada ⇒ template + `focusSource = TEMPLATE` + contador Micrometer — [CA-LLM, D10]
  - verify: teste unitário do checker sobre textos fixos; reprovação persiste `TEMPLATE`, não `LLM`.
- [x] 1.5 Flag `menthoros.weekly-review.llm.enabled` (**default `false`** — gate A1 em aberto): desligada ⇒ template, zero chamada LLM — [CA-LLM, D5]
  - verify: ✅ `verifyNoInteractions(modelRouter, templateLoader, revisaoSemanalRepository)` com a flag off.
- [x] 1.6 Validação: ✅ `./mvnw clean test` — **2164/2164** (era 2138 na baseline; +26 testes novos).

## 2. Insumo na geração do próximo plano

- [ ] 2.1 `RevisaoSemanalPromptFormatter` injetando `nextWeekFocus` + `recommendationType` no `PlanoTreinoPromptBuilder`, atrás de flag de injeção — [CA4]
  - verify: golden-master do prompt muda só no bloco novo; flag off ⇒ prompt byte-idêntico.
- [ ] 2.2 Janela de validade (D11): consome só revisão da semana imediatamente anterior + 7 dias de folga; fora dela não consome e não chama LLM — [CA4, D11]
  - verify: teste de fronteira (dentro, no limite, fora) — revisão de 3 semanas atrás não entra no prompt.
- [ ] 2.3 Gravar `consumed_review_id` + `consumedReviewOutcome = PENDING` no plano novo (padrão in-memory dos `planner_*`) e emitir `RevisaoConsumidaEvent{tenant, atleta, semanaInicio, revisaoId, planoId}` — [CA4, D9]
  - verify: `ArgumentCaptor` confirma o payload; plano tem FK e `PENDING`; sem consumo ⇒ FK nulo + `NOT_CONSUMED`, nada publicado.
- [ ] 2.4 Coach-in-the-loop: revisão é contexto, não altera plano automaticamente nem é exposta ao atleta — [CA5]
  - verify: nenhuma rota `/me/*` devolve a revisão; geração não escreve plano sem ação do coach.
- [ ] 2.5 Validação: `./mvnw clean test`

## 3. Loop de aprendizado (heurística D9, no plano)

- [ ] 3.1 Na aprovação pelo coach (`PlanoReviewServiceImpl.aprovarPlano`): `NO_ADJUSTMENT` sem treino editado/adicionado, `ADJUSTED` com — [CA8, D9]
  - verify: teste dos dois ramos; desfecho gravado no plano, revisão intocada.
- [ ] 3.2 `PLAN_REJECTED` na rejeição; dois planos consumindo a mesma revisão preservam desfechos independentes — [CA8, D9]
  - verify: cenário rejeita-e-regera mantém `PLAN_REJECTED` no primeiro plano.
- [ ] 3.3 Auto-approve (`aprovarTransicao` via `AUTO_CONFIANCA_ALTA`) grava `NO_COACH_IN_LOOP`, nunca `NO_ADJUSTMENT` — [CA8, D9]
  - verify: caminho auto-approve não conta como aceitação.
- [ ] 3.4 Contador Micrometer por desfecho, com tag de `focusSource` — sinal de aprendizado segmentável [D12]
  - verify: métrica incrementa com a tag correta nos dois regimes.
- [ ] 3.5 Validação: `./mvnw clean test`

## 4. Front — renomeação do contrato (D13)

- [ ] 4.1 Renomear `dadosSuficientes`→`sufficientData` e `percentualRealizacao`→`completionRate` no tipo, adapter, VM, card e testes — [D13]
  - verify: `npm run lint && npm run build && npm run test:run` verdes; nenhuma referência remanescente aos nomes antigos.
- [ ] 4.2 Merge coordenado: backend e front mergeados em sequência (janela curta de campo `undefined` aceita) — [D13]
  - verify: após os dois merges, card renderiza aderência e suficiência de dado com dado real.

## 5. Testes (rastreados a CA)

- [ ] 5.1 Geração consome a revisão dentro da janela e não consome fora dela [CA4, D11]
- [ ] 5.2 Revisão não vaza ao atleta nem altera plano sem ação do coach [CA5]
- [ ] 5.3 `consumedReviewOutcome` nos 5 desfechos + preservação em consumo duplo [CA8]
- [ ] 5.4 Flag off ⇒ template sem LLM; narrativa reprovada pelo checker cai no template [CA-LLM]
- [ ] 5.5 Falha/timeout do LLM não deixa a revisão sem foco nem afeta o sinal da F1 [CA-LLM, D8]
- [ ] 5.6 `focusSource` grava a origem correta nos dois regimes [CA-Fonte]
- [ ] 5.7 Validação final: `./mvnw clean test` (backend) + gate do front
