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
- [x] 1.3 Narrativa por LLM em `@Async("weeklyFocusExecutor")`; `@Retryable` (2 tentativas, backoff 2s) isolado em `WeeklyFocusModelClient` — no mesmo método o `try/catch` engolia a exceção e o retry nunca disparava (achado do QA); grava por update sobre a revisão já persistida — [CA-LLM, CA-Fonte, D8]
  - verify: ✅ `WeeklyFocusNarrativeServiceTest` 5/5 — falha do modelo preserva template + `TEMPLATE` e não propaga; revisão inexistente é no-op.
  - ⚠️ **Timeout de resposta NÃO entregue.** Nenhum cliente LLM do módulo tem timeout (gap já registrado no `CLAUDE.md`), e configurá-lo exigiria mexer no `MultiModelConfig`, mudando o comportamento de todas as rotas (geração de plano, análise de treino). Fica para `add-external-call-resilience`. Mitigação: pool dedicado (core 1 / max 2) — chamada pendurada consome thread deste executor, nunca a do coach.
- [x] 1.4 `WeeklyFocusConsistencyChecker` (espelha `PlanQualityChecker`): narrativa sugerindo progressão com RECOVERY/MAINTAIN é reprovada ⇒ mantém template + contador `weekly_review.focus.rejected` — [CA-LLM, D10]
  - verify: ✅ 14 testes, incluindo a **invariante template × checker** e entradas degeneradas. Conservador por decisão: "evite aumentar" é reprovado — falso positivo custa cair no template; falso negativo entrega contradição ao coach.
  - verify: teste unitário do checker sobre textos fixos; reprovação persiste `TEMPLATE`, não `LLM`.
- [x] 1.5 Flag `menthoros.weekly-review.llm.enabled` (**default `false`** — gate A1 em aberto): desligada ⇒ template, zero chamada LLM — [CA-LLM, D5]
  - verify: ✅ `verifyNoInteractions(modelRouter, templateLoader, revisaoSemanalRepository)` com a flag off.
- [x] 1.6 Validação: ✅ `./mvnw clean test` — **2164/2164** (era 2138 na baseline; +26 testes novos).

## 2. Insumo na geração do próximo plano

- [x] 2.1 `WeeklyReviewPromptFormatter` + `WeeklyReviewPromptProvider` injetando `nextWeekFocus` + `recommendationType` no `PlanoTreinoPromptBuilder`, atrás de `menthoros.weekly-review.injection.enabled` — [CA4]
  - verify: ✅ golden-master byte-idêntico com a injeção desligada; bloco só aparece quando há revisão consumível.
  - verify: golden-master do prompt muda só no bloco novo; flag off ⇒ prompt byte-idêntico.
- [x] 2.2 Janela de validade (D11) em `RevisaoSemanalCalculator.withinConsumptionWindow` + aplicada no provider — [CA4, D11]
  - verify: ✅ 6 testes de fronteira (semana anterior, limite exato dos 7 dias, 1 dia além, 3 semanas atrás, revisão do futuro, datas nulas) + 5 no provider.
- [x] 2.3 `registrarRevisaoConsumida` no `PlanoServiceImpl` (passo 4.8, mutação in-memory como os `planner_*`): grava FK + `PENDING` e publica `RevisaoConsumidaEvent`; sem revisão consumível ⇒ `NOT_CONSUMED` sem FK nem evento — [CA4, D9]
  - verify: ✅ suíte do `PlanoServiceImplTest` verde (31) com o colaborador novo; provider é o ponto único, então prompt e vínculo nunca divergem sobre "houve consumo".
- [x] 2.4 Coach-in-the-loop: revisão é contexto, não altera plano automaticamente nem é exposta ao atleta — [CA5]
  - verify: ✅ `RevisaoSemanalCoachInTheLoopTest` 3/3 — asserções **estruturais** (nenhum controller fora de `Coach*` menciona `RevisaoSemanal`; endpoint coach-only sem verbo de mutação; `registrarRevisaoConsumida` não transiciona review status). Estrutural de propósito: um teste sobre uma rota específica não cobriria a próxima rota criada.
- [x] 2.5 Validação: ✅ `./mvnw clean test` — **2175/2175**.

## 3. Loop de aprendizado (heurística D9, no plano)

- [x] 3.1 `ConsumedReviewOutcomeResolver.naAprovacao` aplicado em `aprovarTransicao`, após `inicializarAssociacoes` (que carrega os treinos de onde vêm os sinais) — [CA8, D9]
  - verify: ✅ 8 testes do resolver + 2 ponta a ponta no `PlanoReviewServiceImplTest`; desfecho gravado no plano, `RevisaoSemanal` intocada.
- [x] 3.2 `naRejeicao` → `PLAN_REJECTED`; dois planos consumindo a mesma revisão preservam desfechos independentes — [CA8, D9]
  - verify: ✅ resolver + `semRevisaoNaoRegistraDesfecho` + `doisPlanosMesmaRevisao` (Postgres real).
  - verify: cenário rejeita-e-regera mantém `PLAN_REJECTED` no primeiro plano.
- [x] 3.3 Auto-approve (`AUTO_CONFIANCA_ALTA`) grava `NO_COACH_IN_LOOP`, nunca `NO_ADJUSTMENT` — [CA8, D9]
  - verify: ✅ `autoApproveNaoContaComoAceitacao`.
  - verify: caminho auto-approve não conta como aceitação.
- [x] 3.4 Contador `weekly_review.outcome` com tags `outcome` + `focus_source` [D12]
  - verify: ✅ asserção sobre o `SimpleMeterRegistry` real no teste do serviço.
- [x] 3.5 Validação: ✅ `./mvnw clean test` — **2185/2185**.

## 4. Front — renomeação do contrato (D13)

- [x] 4.1 Renomear `dadosSuficientes`→`sufficientData` e `percentualRealizacao`→`completionRate` no tipo, adapter, VM, card e testes (7 arquivos) — [D13]
  - verify: ✅ lint sem issues, build ok, **748/748**. `TaxaAdesaoWidget.tsx`/`Metricas.ts` **não** foram tocados — `percentualRealizacao` ali é do `SemanaAdesao`, outro domínio (mesma distinção feita no backend).
- [ ] 4.2 Merge coordenado: backend e front mergeados em sequência (janela curta de campo `undefined` aceita) — [D13]
  - verify: após os dois merges, card renderiza aderência e suficiência de dado com dado real.

## 6. Correções do QA gate (2026-07-25)

- [x] 6.1 `findByIdAndTenant` no caminho `@Async` — o `findById` genérico não valida tenant e o `TenantContext` não cruza a fronteira assíncrona (convergente: security + code)
- [x] 6.2 `@Retryable` extraído para `WeeklyFocusModelClient` — no serviço, o `try/catch` matava o retry (code-reviewer)
- [x] 6.3 `RevisaoConsumidaEvent` publicado **depois** do save — `planoId` é `@GeneratedValue` e vinha sempre nulo (code-reviewer)
- [x] 6.4 Narrativa truncada em 280 chars antes de persistir — vira contexto de um segundo prompt; saída de LLM não é dado confiável (convergente: security + code)
- [x] 6.5 **Resolução única da revisão consumida.** Hoje `WeeklyReviewPromptProvider.resolverParaGeracao` é chamado 2× por geração — uma no `PlanoTreinoPromptBuilder` (para o prompt) e outra no `PlanoServiceImpl` (para o vínculo) — em leituras não-atômicas da mesma query `ORDER BY semanaInicio DESC LIMIT 1`. Se uma revisão nova do mesmo atleta for persistida entre as duas, o LLM vê uma e o plano grava outra, contaminando em silêncio a métrica do moat. Contradiz o "ponto único" afirmado no Javadoc de `registrarRevisaoConsumida` e na D9. Convergente: clean-code (Important) + security (Minor).

  **Plano de execução — resolver uma vez e passar adiante (anchors por símbolo; linhas aproximadas):**
  1. `PlanoTreinoPromptBuilder` — remover o campo `weeklyReviewPromptProvider` (ctor ~:56-88) e trocar a resolução da ETAPA 1.6 (~:239-247) por um parâmetro `@Nullable RevisaoSemanal revisaoConsumida`; manter o `weeklyReviewPromptFormatter`. Novo overload de `buildOptimizedPrompt` preservando os dois existentes (~:165 e ~:171).
  2. `IaService` (:22) e `IaServiceImpl.geraPlanoSemanalAvancado` (:309) — novo parâmetro `@Nullable RevisaoSemanal revisaoConsumida`, repassado ao builder. Único chamador de produção: `PlanoServiceImpl.gerarPlanoSemanal`.
  3. `PlanoServiceImpl` — resolver **uma vez** em `gerarPlanoTreino` (antes da chamada a `gerarPlanoSemanal`, ~:144), passar o mesmo `Optional<RevisaoSemanal>` para (a) `gerarPlanoSemanal` → `iaService` e (b) `persistirPlanoCompleto` → `registrarRevisaoConsumida` (que já recebe `Optional`, ~:272). Remover a segunda chamada a `resolverParaGeracao` no passo 4.8. `publicarRevisaoConsumida` (após o save) fica como está.
  4. Testes: `PlanoPromptArquetipos.builder()` (~:83-105) deixa de receber o provider; `PlanoServiceImplTest` mantém o `@Mock` do provider (agora usado só uma vez); `WeeklyReviewPromptProviderTest` não muda.

  - verify: ✅ golden-master **byte-idêntico** (5 arquétipos); `PlanoServiceImplTest.revisaoDoPromptEhAMesmaGravadaNoPlano` — `ArgumentCaptor` no `iaService` + `assertSame` contra `plano.getConsumedReview()`, mais `times(1)` no provider provando a resolução única; `semRevisaoConsumivelPromptRecebeNull` cobre o caminho `NOT_CONSUMED` (prompt recebe `null`, nenhum evento publicado). Suíte **2190** (era 2188), 0 falhas — os 6 erros de contexto seguem sendo o checksum V71 do Postgres local (pré-existentes, ver 1.1).
  - Nota de projeto: o builder deixou de ter o `WeeklyReviewPromptProvider`; a resolução subiu para `PlanoServiceImpl.gerarPlanoTreino` e desce por parâmetro `@Nullable RevisaoSemanal` (`IaService` → `buildOptimizedPrompt`). Os dois overloads antigos do builder foram preservados delegando com `null`.
  - Achado do code-review, corrigido junto: `semanaInicio` também era calculada duas vezes (uma para a janela D11, outra em `persistirPlanoCompleto` **depois** da chamada ao LLM) — cada uma com seu `LocalDate.now()`. Numa geração que atravessasse a meia-noite, a janela usada para resolver a revisão divergiria da semana persistida: mesma classe de bug, um nível acima. Agora é resolvida uma vez em `gerarPlanoTreino` e repassada por parâmetro.
  - Achado do `/codex:review` (P2), corrigido em `10e4d20` — **não visto por nenhum reviewer Claude**: o `IaServiceImpl` derivava a semana do prompt de `LocalDate.now().plusWeeks(1)`, enquanto o plano é salvo na semana de `calcularSemanaInicio` (último plano + 1, quando há plano futuro). Em `PROXIMA_SEMANA` o LLM via o bloco de revisão selecionado para a semana salva com o resto do prompt falando de outra semana. A semana agora desce por parâmetro do mesmo ponto que resolve a revisão. Teste: `semanaDoPromptEhAMesmaDoPlanoPersistido`.
  - Achado colateral (sem ação): o call site removido do builder passava `atleta.getAssessoria().getId()` como `tenantId` — `Assessoria` não é o tenant, então aquela resolução provavelmente retornava vazio na prática. O bug some com a remoção do call site.
- [x] 6.6 Minor aceitos, não corrigidos: índice sem `tenant_id` composto (lookup por FK), `save()` redundante em `registrarDesfecho`, `RejectedExecutionHandler` implícito, fragilidade dos testes estruturais do CA5
  - Do 2º gate (2026-07-26, sobre o 6.5): **(a)** o builder não revalida o tenant da revisão que recebe — a garantia ficou no ponto único (`gerarPlanoTreino`, depois de `findByIdAndTenantId`); aceito porque só existe um call site de produção e `findRecentesByAtletaAndTenant` já filtra atleta+tenant, mas um caller novo do `IaService` precisa revalidar. **(b)** `buildOptimizedPrompt` chegou a 7 parâmetros e `geraPlanoSemanalAvancado` a 6 — `semanaInicio`/`decisaoProgressao`/`revisaoConsumida` viajam juntos e pedem um parameter object; o próximo parâmetro nessa cadeia é o gatilho para extraí-lo. **(c)** os 2 overloads curtos do builder existem só para os testes de prompt. **(d)** `Optional` como parâmetro em `persistirPlanoCompleto` vs `@Nullable` no resto — padronizar em `@Nullable` ao tocar o método.

## 5. Testes (rastreados a CA)

- [x] 5.1 Geração consome a revisão dentro da janela e não consome fora dela [CA4, D11] — `WeeklyReviewPromptProviderTest` (5) + `withinConsumptionWindow` (6 fronteiras)
- [x] 5.2 Revisão não vaza ao atleta nem altera plano sem ação do coach [CA5] — `RevisaoSemanalCoachInTheLoopTest` (3)
- [x] 5.3 `consumedReviewOutcome` nos 5 desfechos + preservação em consumo duplo [CA8] — `ConsumedReviewOutcomeResolverTest` (8) + `PlanoReviewServiceImplTest` (2) + `RevisaoSemanalRepositoryTest.doisPlanosMesmaRevisao`
- [x] 5.4 Flag off ⇒ template sem LLM; narrativa reprovada pelo checker cai no template [CA-LLM] — `WeeklyFocusNarrativeServiceTest` (5) + `WeeklyFocusConsistencyCheckerTest` (14)
- [x] 5.5 Falha do LLM não deixa a revisão sem foco nem afeta o sinal da F1 [CA-LLM, D8] — `falhaDoLlmPreservaTemplate`. ⚠️ **timeout não coberto porque não foi implementado** (ver 1.3)
- [x] 5.6 `focusSource` grava a origem correta nos dois regimes [CA-Fonte] — `narrativaConsistentePersiste` (LLM) + `nasceComFocoTemplate` (TEMPLATE)
- [x] 5.7 Validação final: ✅ backend **2188/2188**; front lint + build + **748/748**
