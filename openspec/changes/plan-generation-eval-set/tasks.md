## Fatia 1 — Fundação (2 famílias de fixture + runner 2 modos + graders correspondentes)

- [x] **1.1** `EvalPiiRedactor` (idade, nome de prova, cidade/clube) ao lado de
      `LlmCallLedger.redigirNome`, mesmo padrão de regex Unicode-aware + marcador. Aceita qualquer
      bloco de texto livre (não só `response_json`).
      Verify: teste unitário cobrindo os 4 campos de PII, `./mvnw clean test`.
- [x] **1.2** `EvalFixtureExtractor` (fixtures de auditoria) — query de amostragem estratificada
      (arquétipo × cold-start × veredito) via `generation_request_id`. Congela `respostaHistorica`
      (`response_json` + `schema_version` + `prompt_version`), `planoFinalPersistido` (snapshot de
      `tb_plano_semanal`/`tb_treino_planejado`) e `zonasAtleta` (`AthleteZones` —
      `fcMaxima`/`fcLimiar`/`paceLimiar` do atleta **no momento da extração**, rotulado
      explicitamente como aproximação, não histórico exato — achado da rodada 3 de DoR) — **sem**
      constraints/skeleton (não existem retroativamente, ver proposal.md "Correção de escopo").
      Verify: teste com dataset sintético em memória validando estratificação; `EvalPiiRedactor`
      chamado sobre os blocos de texto livre antes de gravar.
- [x] **1.3** Rodar a extração uma vez contra o ledger real (execução manual/local, fora do CI) e
      commitar as fixtures reais disponíveis em `src/test/resources/eval/plan-generation/auditoria/`
      + `manifest.sha256`. **Achado na execução (2026-09-15):** o ambiente disponível (homelab) só
      tinha 3 chamadas no ledger no total e 1 com join válido em `tb_plano_semanal` — muito abaixo
      dos 40-60 que o proposal assumia (premissa de volume de produção real, ainda não atingida
      nesse ambiente). Decisão do usuário: aceitar o volume real disponível agora (1 fixture),
      documentar a revisão no proposal, e reavaliar quando houver mais uso real — ver proposal.md
      "Correção de escopo" e CA1.
      Verify: revisão manual da fixture única commitada — sem PII visível (nome/idade/prova/cidade
      ausentes do conteúdo de origem, nada para redigir neste caso).
- [x] **1.4** Fixtures de candidato — estender os 5 arquétipos de `PlanoPromptArquetipos` expondo
      ao runner de eval os parâmetros que hoje ficam internos ao teste golden (`provaAlvo`,
      `diasEfetivos`, `decisaoProgressao`, `revisaoConsumida`, `ContextoTreino`); montar
      `WeekPlanSkeleton`/`ComplianceContext`/`AthleteConstraints` frescos para os arquétipos com
      `planner-engine.enabled` (mesma construção de `PlannerEngineGoldenSetTest`).
      Verify: teste confirmando que os 5 (ou mais) arquétipos expostos produzem os mesmos
      `system`/`user` que `PlanoTreinoPromptBuilderGoldenTest` já valida — garante que a exposição
      não alterou o wiring existente.
- [x] **1.5** Profile Maven `-Peval` + tag JUnit `@Tag("eval")`, excluído por padrão do `surefire`,
      incluído só sob `-Peval`. Propriedade `-Dmodo=candidato|auditoria` (default `auditoria`).
      Verify: `./mvnw clean test` não executa nenhum teste `@Tag("eval")`; `./mvnw -Peval test`
      executa em modo auditoria por default.
- [x] **1.6** `EvalDeterministicGrader` (só modo candidato) — despacha por `schema_version`: v2 passa
      por `SessionResolver.resolverPlano` (com `AthleteZones` montado do perfil do arquétipo) antes
      dos checkers; v1 desserializa direto. Chama `PlanQualityChecker.check(plano,
      promptGerado.regras())` e, quando há skeleton, o método público
      `PlannerShadowService.checkPreRedistribution(plano, skeleton, atleta, semanaInicio)` (mesmo
      caminho de `IaServiceImpl:349-350` — reaproveita o `Atleta` sintético da fixture, não uma
      reconstrução própria de `GeneratedPlanSnapshot`/`ComplianceContext`; achado da rodada 3 de
      DoR: `SkeletonComplianceChecker.checkPreRedistribution` não aceita `PlanoSemanalLlmDto`
      diretamente). `MeterRegistry` isolado (`SimpleMeterRegistry` descartável) só onde
      `PlanQualityChecker` exige. `WeeklyFocusConsistencyChecker` fica fora do escopo.
      Verify: teste com fixture de candidato v1 e v2 comparando saída do grader com chamada direta
      a `PlanQualityChecker.check`/`PlannerShadowService.checkPreRedistribution` usando os mesmos
      `regras`/`skeleton`/`atleta` (CA2, cobrindo os 2 branches).
- [x] **1.7** "Modo candidato" no runner — monta `PlanoTreinoPromptBuilder` manualmente (fora do
      Spring, wiring de `PlanoPromptArquetipos`), mockando `TreinoHistoricoProvider` para devolver o
      `ContextoTreino` congelado de cada fixture de candidato (task 1.4), chama `ChatClient` +
      `LlmJsonSchemaBuilder` (v1 ou v2, pela flag do arquétipo) com o código atual do checkout,
      produz resposta nova, roda o grader determinístico (1.6) + juiz-LLM (fatia 2) contra ela.
      Verify: teste rodando o modo candidato duas vezes contra a mesma fixture — uma com o prompt
      atual, outra com um prompt de teste deliberadamente alterado (troca do resource
      `plano-treino-system.txt` por uma versão de teste) — e assere que as notas divergem (CA6).
- [x] **1.8** `EvalAgreementGrader` (só modo auditoria) — para `respostaHistorica` com
      `schema_version=schema-v2`, resolve via `SessionResolver` (com `zonasAtleta` da fixture,
      task 1.2) antes de comparar contra `planoFinalPersistido`; para v1, compara direto. % de
      campos estruturais divergentes.
      Verify: teste com fixture sintética de divergência conhecida, cobrindo os 2 branches de
      `schema_version`.
- [x] **1.9** Runner de eval — carrega a família de fixture certa por modo (auditoria: juiz +
      concordância; candidato: grader determinístico + juiz), imprime tabela em stdout (formato
      fixo, colável em descrição de PR), custo agregado em memória.
      Verify: `./mvnw -Peval verify` produz a tabela em modo auditoria contra as fixtures reais
      (CA4, parcial — juiz ainda não implementado, fatia 2); `./mvnw -Peval verify -Dmodo=candidato`
      roda contra as fixtures sintéticas (CA6, parcial).
- [x] **1.10** Checkpoint: commit da fatia 1, `./mvnw clean verify` (sem `-Peval`) continua verde —
      zero regressão no pipeline de produção. Confirmado 2026-09-15: `BUILD SUCCESS`.

## Fatia 2 — Grader LLM-juiz (roda nos dois modos)

- [x] **2.1** Decidido: rubrica expandida para 6 eixos (nota do `product-reviewer`, GO) — mas só
      em **modo candidato** (`NotaJuizCompleta`); modo auditoria usa `NotaJuizReduzida` (3 eixos
      observáveis a partir da resposta isolada), nunca inventando progressão/segurança sem
      histórico (achado da rodada 3 de DoR). Schema JSON estruturado via `EvalJudgeSchemaBuilder`
      (mesmo padrão de `LlmJsonSchemaBuilder`, `BeanOutputConverter` por reflexão).
      Verify: teste unitário do schema (mesmo padrão de `LlmJsonSchemaBuilderTest`).
- [x] **2.2** `EvalLlmJudge` — chama a LLM real via `ChatClient`, `route=EVAL_JUDGE` no ledger (só
      para auditoria/retenção — não é a fonte do custo agregado, ver 2.5). Roda contra
      `respostaHistorica` (modo auditoria) ou a resposta candidata (modo candidato, task 1.7).
      Verify: teste com `ChatClient` mockado validando parse da resposta e propagação de erro.
- [x] **2.3** Bloqueado por dois motivos concretos (não hipotéticos): (a) só 1 fixture de auditoria
      no total, não 20 — ver task 1.3; (b) nenhum coach disponível agora. Decisão: pular a
      calibração real por ora — `EvalJudgeCalibration` (task 2.4) já trata "dado insuficiente"
      como caso de primeira classe, não erro, e a coluna do juiz fica "NÃO CALIBRADO" em ambos os
      modos até (a)+(b) resolverem. Mecanismo de coleta (planilha/endpoint) fica sem implementar —
      não há o que coletar ainda.
      Verify: decisão documentada aqui e em `proposal.md` Open Questions.
- [x] **2.4** Cálculo de concordância de quadrante (juiz vs. coach) no runner, só para a rubrica
      reduzida de auditoria; abaixo de 16/20, a coluna do juiz na tabela de auditoria é marcada "NÃO
      CALIBRADO" (aviso, não bloqueio de build). A coluna do juiz em modo candidato (rubrica
      completa) é marcada "NÃO CALIBRADO" incondicionalmente nesta versão — os 20 casos de auditoria
      não validam progressão/segurança (achado da rodada 4 de DoR, Codex).
      Verify: teste com fixtures sintéticas de calibração conhecida para auditoria (CA3); teste
      confirmando que a coluna de candidato nunca sai de "NÃO CALIBRADO" nesta versão.
- [x] **2.5** Integrar o grader do juiz na tabela do runner, nos dois modos, com custo calculado em
      memória via `LlmPricingRegistry.precoDe(modelo)` sobre o `Usage` de cada chamada real.
      Verify: `./mvnw -Peval verify` (modo auditoria) e `-Dmodo=candidato` mostram a coluna do juiz +
      custo total (CA4 completo).
- [x] **2.6** Checkpoint: commit da fatia 2, `./mvnw clean verify` (sem `-Peval`) continua verde.
      Confirmado 2026-09-15: `BUILD SUCCESS`, 3714 testes.

## Fatia 3 — Gate de PR

- [x] **3.1** Atualizar `apps/menthoros-backend/CLAUDE.md` — Delivery Checklist — exigindo a tabela
      do **modo candidato** em PRs que tocam `resources/prompts/**`, `dto/llm/**` ou
      `llm-pricing.yml`, com a nota explícita de que a coluna do juiz em modo candidato é "NÃO
      CALIBRADO" por padrão nesta versão (a calibração de auditoria não valida a rubrica completa
      — achado da rodada 4 de DoR) — usar grader determinístico como evidência primária do gate,
      juiz como sinal complementar, nunca isolado (CA5).
      Verify: revisão manual do texto adicionado.
- [x] **3.2** Checkpoint final: commit da fatia 3, `./mvnw clean verify` (sem `-Peval`) verde,
      `./mvnw -Peval verify` (auditoria) e `-Dmodo=candidato` rodam de ponta a ponta. Confirmado
      2026-09-15 com chamadas reais à LLM em ambos os modos.

## Fechamento

- [x] **4.1** `/qa` — code-reviewer + security-reviewer + clean-code-reviewer + Codex cross-model,
      em paralelo. Achados reais corrigidos: 5 classes `@Component` indevidas removidas; dispatch
      por `schema_version` duplicado extraído (`EvalPlanoJsonParser`); estado mutável do
      `EvalLlmJudge` trocado por retorno em record; `PlannerShadowService` mockado sem stub no
      runner real trocado por `SkeletonComplianceChecker` real; mismatch skeleton
      prompt-vs-avaliação corrigido; contexto do juiz completo enriquecido; modelo do runner real
      configurável (`EVAL_MODEL`); `EvalCandidateRunner` ganhou suporte a v2 (`usaV2`, nenhum
      arquétipo o usa ainda — Open Question); `EvalFixtureExtractionRunner` corrigido (nomeProva
      via join `tb_prova`, idade calculada na data da geração). Revalidado com LLM real nos dois
      modos após os fixes. `./mvnw clean test`: 3714/3714.
- [ ] **4.2** Atualizar `openspec/SPRINTS.md` (linha da Sprint 30) e arquivar a change após merge.
