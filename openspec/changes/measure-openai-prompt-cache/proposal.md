# Proposal: measure-openai-prompt-cache

**Tamanho:** XS · **Trilha:** Fast (backend-only, observabilidade — sem contrato de API/DB, sem mudança de comportamento de geração)

## Status

Proposed

## Why

Antes de investir em qualquer otimização de custo de LLM (ex.: `system-user-prompt-split`, ou trocar
`PLANO` para Claude), precisamos **saber se já há economia**. A OpenAI cacheia o prefixo de prompts
≥1024 tokens **automaticamente** (~50% de desconto nos `cached_tokens`), e o bloco estático de ~5.900
tokens do prompt de plano já está no início — então o auto-cache **provavelmente já economiza hoje**.
Mas **não medimos**: a geração de plano usa `.call().entity(PlanoSemanalLlmDto.class)`
(`IaServiceImpl.geraPlanoSemanalAvancado:321`), que **descarta o `ChatResponse`** — perdemos o `usage`
(prompt tokens, `cached_tokens`, completion tokens).

Esta change instrumenta esse dado. Resultado: uma decisão baseada em número, não em suposição —
se o cache já cobre, arquivamos a `system-user-prompt-split`; se não, temos um alvo real e mensurável.

## What Changes

### Backend (`apps/menthoros-backend`)

- Na geração de plano (`geraPlanoSemanalAvancado`), **capturar o `ChatResponse`** (via
  `.call().chatResponse()` ou `.responseEntity(...)`) sem alterar o comportamento de geração — extrair
  o entity como hoje **e** ler `response.getMetadata().getUsage()`.
- Extrair, do `usage`, os campos: prompt tokens, completion tokens, total, e — do `nativeUsage` da
  OpenAI — os `cached_tokens` (`prompt_tokens_details.cached_tokens`).
- **Registrar** (log estruturado INFO + opcionalmente Micrometer/Prometheus, seguindo o que já existe):
  `plano.llm.prompt_tokens`, `plano.llm.cached_tokens`, `plano.llm.cache_hit_ratio`
  (`cached / prompt`). Um log por geração é suficiente para o diagnóstico; a métrica facilita agregar.
- Manter o `PlanoResilienceService` e o schema JSON — a captura do metadata não pode quebrar o retry
  nem o parsing do `PlanoSemanalLlmDto`.

## Capabilities

### Modified Capabilities

- `plan-generation`: observabilidade de uso de tokens/cache (sem mudança de comportamento).

## Impact

**Backend:** `IaServiceImpl.geraPlanoSemanalAvancado` (+ possivelmente um pequeno helper de extração de
usage). **APIs/DB/Multi-tenancy/Modelo:** nenhum impacto. **Comportamento de geração:** inalterado.

## Critérios de Aceite

**CA1 — Usage capturado sem quebrar a geração:**
- Given: uma geração de plano avançada
- When: o LLM responde
- Then: o `PlanoSemanalLlmDto` é parseado normalmente **e** o `usage` (prompt/completion/cached tokens)
  é lido do `ChatResponse` — sem alterar o plano gerado

**CA2 — cached_tokens logado:**
- Given: uma resposta da OpenAI com `prompt_tokens_details.cached_tokens`
- When: a geração conclui
- Then: um log INFO estruturado registra prompt tokens, cached tokens e a razão de cache

**CA3 — Robusto a ausência do campo:**
- Given: uma resposta sem `cached_tokens` (ou de outro provedor/mocado nos testes)
- When: a extração roda
- Then: loga 0 (ou "n/d") sem lançar — a geração nunca falha por causa da instrumentação

**CA4 — Sem regressão:**
- Given: a suíte existente (`IaServiceImplFcValidationTest`, golden-master)
- When: rodada
- Then: verde — nenhuma mudança na saída do plano

## Open Questions & Assumptions

**Premissas:**
- Spring AI expõe o `usage` nativo da OpenAI (incl. `cached_tokens`) via `ChatResponse.getMetadata()`
  — confirmar a API exata na versão do Spring AI em uso no `init` (pode ser `getNativeUsage()`).
- Log INFO é suficiente para o diagnóstico inicial; a métrica Micrometer é *nice-to-have* se já houver
  registry configurado (há uso de Micrometer no projeto).

**Em aberto:**
- Se a medição em staging/produção mostrar `cache_hit_ratio` alto (o esperado) → **arquivar
  `system-user-prompt-split`** (dor de custo inexistente). Registrar a conclusão no SPRINTS.
