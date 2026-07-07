# Tasks: measure-openai-prompt-cache

**Status:** Proposed
**Tamanho:** XS · Trilha: Fast
**Repos:** menthoros-backend (apenas)
**Dependências:** nenhuma. **Desbloqueia a decisão sobre** `system-user-prompt-split` (deferida).

---

## 1. Extrair o usage do ChatResponse

- [x] 1.1 **API confirmada (Spring AI 1.1.6):** `ChatResponse.getMetadata().getUsage()` → `Usage` (`getPromptTokens`, `getCompletionTokens`, `getTotalTokens`). Os `cached_tokens` vêm do `usage.getNativeUsage()` (objeto nativo da OpenAI — `OpenAiApi.Usage`, via `promptTokensDetails().cachedTokens()`), acessado com `instanceof`/try-catch (provider-specific, best-effort).
- [x] 1.2 Criar um helper puro `LlmUsageLogger` (ou método em helper existente) que recebe o `ChatResponse` (ou o `Usage`) e loga INFO estruturado: `promptTokens`, `cachedTokens`, `completionTokens`, `cacheHitRatio = cached/prompt` (guarda contra divisão por zero e campo ausente → 0/"n/d").
  - `verify:` teste unitário com um `Usage` mockado (com e sem cached_tokens) → não lança, calcula a razão.

## 2. Capturar na geração de plano

- [ ] 2.1 Em `IaServiceImpl.geraPlanoSemanalAvancado` (linha ~321): dentro do lambda `gerar` do `gerarComResiliencia` (que é `Function<String, PlanoSemanalLlmDto>`), trocar `.call().entity(PlanoSemanalLlmDto.class)` por `.call().responseEntity(PlanoSemanalLlmDto.class)` — que dá **entity + ChatResponse**. Passar `re.getResponse()` ao `LlmUsageLogger` (efeito colateral) e retornar `re.getEntity()`. Assinatura do `gerarComResiliencia` **inalterada** (o lambda continua retornando o entity).
- [ ] 2.2 A instrumentação é best-effort: envolver a extração/log em try/catch que só loga um warning — **nunca** propaga (CA3). A geração do plano tem prioridade sobre a métrica.
- [ ] 2.3 Validação: `./mvnw clean test`.

## 3. QA e entrega

- [ ] 3.1 `./mvnw clean test` — verde (inclui `IaServiceImplFcValidationTest` + golden-master intocados: CA4).
- [ ] 3.2 QA (Fast track): `code-reviewer` + `clean-code-reviewer`. Atenção: a captura do metadata não pode quebrar o parsing nem o retry.
- [ ] 3.3 Abrir PR (`feature/measure-openai-prompt-cache`) → `develop`.
- [ ] 3.4 **Pós-deploy (fora do código):** observar `cached_tokens`/`cache_hit_ratio` em staging/produção por alguns dias de geração real. Registrar a conclusão no SPRINTS e decidir o destino da `system-user-prompt-split` (arquivar se o cache já economiza).
