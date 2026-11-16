# Tasks — consolidate-llm-on-openai

Repos: `apps/menthoros-backend` (quase tudo), `apps/menthoros-front` (bloco 5),
`menthoros-product` (docs). Validação padrão: backend `./mvnw clean test`; front
`npm run lint && npm run build`. Bloco final `./mvnw clean verify`.

**Pré-requisito:** `migrate-openai-retired-models` mergeada em `develop` (perfil de rota,
`gpt-6-luna` no `llm-pricing.yml`). Branch: `feat/consolidate-llm-on-openai`, em worktree.

## 1. Medição (sem código de produção)

- [ ] 1.1 Rodar a consulta de custo de `docs/ia/custo-por-atleta.md` no `develop` (≥ 7 dias de
      dados). Registrar por rota: chamadas/semana, tokens in/out médios, custo.
      Verify: documento atualizado com a data e a fonte; premissas substituídas por medições onde
      houver dado, e as que continuarem premissa marcadas como tal (CA1).
- [ ] 1.2 Se o ganho medido da rota `standard` for < R$ 0,15 por atleta/mês (a estimativa é ~R$ 0,29; o limiar é metade dela), parar e levar ao
      founder (a change pode não se pagar). Verify: decisão registrada no proposal.

## 2. Desacoplar a rota `standard` da Anthropic (design D1)

- [ ] 2.1 Teste que fixa o contrato hoje: payload de `RaceProjectionNarrativeGenerator`
      (temperatura 0.2, 1000 tokens, system prompt com cache) e do `WorkoutAnalysisTranslator`.
      Verify: teste verde antes de refatorar; registra se opções por chamada anulam o
      `cacheOptions` da rota (risco aberto do design).
- [ ] 2.2 `app.llm.routing.standard`: temperatura e teto de tokens que o gerador de narrativa
      usava passam a ser da rota; `RaceProjectionNarrativeGenerator` deixa de importar
      `AnthropicChatOptions`.
      Verify: `rg "AnthropicChatOptions" src/main/java` só em `MultiModelConfig` (CA5);
      teste 2.1 segue verde.
- [ ] 2.3 `./mvnw clean test`.
- [ ] 2.4 Rastrear o caminho de saída de `AthleteMessageClassifier` e `RaceProjectionNarrativeGenerator`
      até o atleta: há passo de aprovação do coach? Verify: conclusão registrada no proposal
      (substitui a afirmação de coach-in-the-loop da "Métrica de sucesso"); se a narrativa de
      projeção chegar ao atleta sem ação do coach, tirar essa rota do escopo.

## 3. Mecanismo de fallback (design D1–D4)

- [ ] 3.1 `LlmRoutingProperties.RotaLlm.fallback` opcional (modelo, timeout herdado ou próprio);
      validação no boot: fallback com o mesmo modelo da primária falha; fallback de provider
      sem chave configurada falha.
      Verify: testes de binding e de validação.
- [ ] 3.2 `LlmFalhaClassificador` (design D2). Verify: teste parametrizado por exceção real —
      500, 503, 429, `SocketTimeoutException` → elegível; 400, 401, 422 → não elegível (CA2).
- [ ] 3.3 `ModelRouter.executar(rota, função)` com fallback e métrica `llm_fallback_total` (D4).
      Conferir que o ledger grava o modelo **retornado**, não o configurado (D3).
      Verify: WireMock com primária 500/429/timeout e fallback 200 → 1 chamada em cada, resultado
      do fallback, contador +1; primária 400 → propaga, sem chamada ao fallback; tempo total
      dentro do orçamento (CA2, CA3, CA4).
- [ ] 3.4 Verificar se o lote de análises repete chamadas em rajada (gatilho do ADR-0008) e
      registrar a conclusão no design. Verify: nota no design; se sim, parar e decidir.
- [ ] 3.5 Migrar os três chamadores da `standard` (`WorkoutAnalysisTranslator`,
      `AthleteMessageClassifier`, `RaceProjectionNarrativeGenerator`) para `executar`; remover o
      `callWithFallback` Haiku → Sonnet.
      Verify: testes existentes dos três adaptados e verdes; `rg "TaskComplexity.STANDARD"` só
      dentro de chamadas a `executar`.
- [ ] 3.6 Teste de fumaça do fallback: `@Tag("eval-real")` que chama a Anthropic de fallback com
      um prompt mínimo, para provar que a chave e o modelo estão vivos. Verify: roda com
      `-Peval-real`; documentar no runbook quando executar (antes de cada rollout).

## 4. Migrar a rota `standard` para `gpt-6-luna`

- [ ] 4.1 Eval de tradução (design D5): 20 textos em inglês, grader (campo vazio, idioma, números e
      unidades preservados), Haiku × Luna `none`.
      Verify: relatório em `docs/ia/eval-traducao-<data>.md`; zero campos vazios; Luna ≥ Haiku no grader.
- [ ] 4.2 Revisão cega do coach sobre os 20 pares (CA6). Bloqueia 4.3.
      Verify: resultado anexado ao relatório; sem preferência por Haiku em mais casos que por Luna.
- [ ] 4.3 `application.yml`: rota `standard` primária `gpt-6-luna` (`reasoning-effort: none`),
      `fallback` Haiku. `LlmPricingRegistry` já tem os dois preços.
      Verify: contexto sobe; teste de payload mostra `model: gpt-6-luna` e `max_completion_tokens`.
- [ ] 4.4 Ensaiar o rollback (design D6) em `develop`: revert do commit de configuração.
      Verify: registrado no PR.

## 5. Política de privacidade (front)

- [ ] 5.1 Confirmar com o founder que a Anthropic permanece subprocessadora (Open Question 3).
- [ ] 5.2 Ajustar o texto: OpenAI principal, Anthropic como fallback, sem versão de modelo (CA8).
      Verify: `npm run lint && npm run build`; busca por nomes de modelo na página.

## 6. Rollout e fechamento

- [ ] 6.1 Merge em `develop`; 1 semana de operação. Verify: taxa `FAILED` + `translationFailed`
      não maior que a semana anterior; `llm_fallback_total` registrado (CA9).
- [ ] 6.2 Atualizar `docs/ia/custo-por-atleta.md` com o custo medido pós-migração (CA7).
- [ ] 6.3 `./mvnw clean verify` e PR `feat/consolidate-llm-on-openai` → `develop`.
