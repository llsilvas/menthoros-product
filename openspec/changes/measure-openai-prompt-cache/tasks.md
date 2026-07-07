# Tasks: measure-openai-prompt-cache

**Status:** Proposed
**Tamanho:** XS · Trilha: Fast
**Repos:** menthoros-backend (apenas)
**Dependências:** nenhuma. **Desbloqueia a decisão sobre** `system-user-prompt-split` (deferida).

---

## 1. Extrair o usage do ChatResponse

- [ ] 1.1 No `init`, confirmar a API do Spring AI em uso para ler o usage nativo da OpenAI: `ChatResponse.getMetadata().getUsage()` e o acesso a `cached_tokens` (via `getNativeUsage()` / `OpenAiApi.Usage.PromptTokensDetails.cachedTokens`). Ajustar os nomes conforme a versão.
- [ ] 1.2 Criar um helper puro `LlmUsageLogger` (ou método em helper existente) que recebe o `ChatResponse` (ou o `Usage`) e loga INFO estruturado: `promptTokens`, `cachedTokens`, `completionTokens`, `cacheHitRatio = cached/prompt` (guarda contra divisão por zero e campo ausente → 0/"n/d").
  - `verify:` teste unitário com um `Usage` mockado (com e sem cached_tokens) → não lança, calcula a razão.

## 2. Capturar na geração de plano

- [ ] 2.1 Em `IaServiceImpl.geraPlanoSemanalAvancado`: trocar `.call().entity(PlanoSemanalLlmDto.class)` por capturar o `ChatResponse` (`.call().chatResponse()` ou `.responseEntity(PlanoSemanalLlmDto.class)`), extrair o entity **e** passar o metadata ao `LlmUsageLogger`. Não alterar o retorno nem o `PlanoResilienceService`.
- [ ] 2.2 A instrumentação é best-effort: envolver a extração/log em try/catch que só loga um warning — **nunca** propaga (CA3). A geração do plano tem prioridade sobre a métrica.
- [ ] 2.3 Validação: `./mvnw clean test`.

## 3. QA e entrega

- [ ] 3.1 `./mvnw clean test` — verde (inclui `IaServiceImplFcValidationTest` + golden-master intocados: CA4).
- [ ] 3.2 QA (Fast track): `code-reviewer` + `clean-code-reviewer`. Atenção: a captura do metadata não pode quebrar o parsing nem o retry.
- [ ] 3.3 Abrir PR (`feature/measure-openai-prompt-cache`) → `develop`.
- [ ] 3.4 **Pós-deploy (fora do código):** observar `cached_tokens`/`cache_hit_ratio` em staging/produção por alguns dias de geração real. Registrar a conclusão no SPRINTS e decidir o destino da `system-user-prompt-split` (arquivar se o cache já economiza).
