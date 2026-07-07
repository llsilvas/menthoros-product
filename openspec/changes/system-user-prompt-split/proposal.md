# Proposal: system-user-prompt-split

**Tamanho:** S · **Trilha:** Fast (backend-only, um repo, sem contrato de API/DB — mas com risco de regressão de comportamento do LLM na feature mais crítica)

## Status

**Deferida (product-lens, 2026-07-07):** ROI ~0 como escopada — GPT-4o já cacheia o prefixo
automaticamente (custo neutro), sem métrica de sucesso e com risco de regressão do LLM (reordenação
das regras). **Bloqueada por `measure-openai-prompt-cache`** (Rota A): medir os `cached_tokens` reais
antes. Se o auto-cache já economiza → esta change é arquivada. Se o objetivo for custo, a alavanca real
é trocar `PLANO` para Claude Sonnet (change própria), quando o split faria sentido junto.

## Why

O prompt de geração de plano (`plano-treino-otimizado-claude.txt`, ~5.900 tokens) é hoje enviado
**inteiro como um único `.user(...)`** (`IaServiceImpl.geraPlanoSemanalAvancado`), misturando a
**persona/instruções estáticas** com os **dados dinâmicos do atleta**. Separar o estático em um
**system prompt** e o dinâmico no **user prompt** é a estrutura recomendada (instruções no system,
dados no user), deixa o prompt mais legível/manutenível e **prepara o terreno** para uma futura troca
de modelo para Claude (cujos beans já têm `AnthropicCacheStrategy.SYSTEM_ONLY` configurado —
`MultiModelConfig`), quando então o bloco estático passaria a ser cacheado.

## Correção de premissa (SPRINTS)

O SPRINTS descrevia esta change como **"redução de custo LLM ~50-70%"** via cache de system prompt.
**Isso não se sustenta no modelo atual:** `ModelRouter.route(TaskComplexity.PLANO)` roteia para
`gpt4oPlanoClient` (**GPT-4o / OpenAI**), **não** para o Claude. Consequências apuradas no código:

- O `AnthropicCacheStrategy.SYSTEM_ONLY` está nos beans **Claude** (Haiku/Sonnet), que a geração de
  plano **não usa**. O `gpt4oPlanoClient` não tem `cacheOptions` (nem precisa — a OpenAI não expõe
  cache manual).
- A **OpenAI cacheia por prefixo automaticamente** (prompts ≥1024 tokens, ~50% de desconto nos tokens
  cacheados, sem código). O bloco estático já está no início do prompt → **provavelmente já é cacheado
  hoje**. E a OpenAI cacheia por *prefixo*, não por *role* — mover o estático de `user` para `system`
  é **neutro** para o cache dela.

**Decisão (founder):** fazer o split mesmo assim, pelo **valor de organização/estrutura** (não de
custo). O ganho de custo é neutro hoje; o ganho de cache real viria só com a troca para Claude, tratada
como follow-up separado (risco de qualidade do plano).

## What Changes

### Backend (`apps/menthoros-backend`)

**Estrutura do template hoje** (`plano-treino-otimizado-claude.txt`, 522 linhas):
- Linhas **1–4:** estático — persona ("Você é um treinador...").
- Linhas **5–30:** **dinâmico** — `### PERFIL DO ATLETA` (`%s`/`%d`) + `### HISTÓRICO RECENTE` (`%s`).
- Linhas **32–522:** estático — análise, matriz de variabilidade, regras, estrutura JSON, enums, campos
  obrigatórios, checklist, instruções de saída.

O dinâmico está **ensanduichado**: split limpo exige mover o bloco estático 32–522 para *antes* dos
dados (no system), junto com a persona. Estrutura alvo:

- **System prompt** (estático, sem placeholders): persona (1–4) + todas as regras/estrutura/checklist
  (32–522). Extraído para um recurso próprio (ex.: `prompts/plano-treino-system.txt`).
- **User prompt** (dinâmico): `### PERFIL DO ATLETA` + `### HISTÓRICO` com os 8 args formatados
  (ex.: `prompts/plano-treino-user.txt`).

Mudanças:
- `PlanoTreinoPromptBuilder.buildOptimizedPrompt` passa a retornar **duas partes** (system + user) —
  ex.: o record `PromptGerado` ganha `systemPrompt` além do `userPrompt` (ou um novo record).
- `IaServiceImpl.geraPlanoSemanalAvancado` envia `chatClient.prompt().system(system).user(user)...`
  em vez de `.user(promptInteiro)`.
- Nenhuma mudança de modelo, de API, de schema, de `ModelRouter`.

## Capabilities

### Modified Capabilities

- `plan-generation`: reestruturação do prompt (system/user), sem mudança de contrato nem de modelo.

## Impact

**Backend:** `PlanoTreinoPromptBuilder`, `IaServiceImpl`, os recursos de template (`prompts/`).
**APIs/DB/Multi-tenancy:** nenhum impacto. **Modelo:** permanece GPT-4o.

**Blast radius:** só o caminho `PlanoServiceImpl.gerarPlanoSemanal → IaServiceImpl.geraPlanoSemanalAvancado`.
`IaServiceImpl.gerarPlanoSemanal` (legado, `buildRequest`/`plano-treino-prompt.txt`) fica intocado.

**Risco principal — regressão de comportamento do LLM:** o split **reordena** o prompt (as regras hoje
vêm *depois* dos dados; passam a vir *antes*, no system). Para o GPT-4o isso pode alterar sutilmente a
saída. O `PlanoTreinoPromptBuilderGoldenTest` congela a saída atual — **precisará ser re-baselined** com
revisão humana (não é regressão automática: é uma mudança intencional de estrutura). Validar com ao menos
1–2 planos gerados de ponta a ponta (schema válido, qualidade equivalente).

## Critérios de Aceite

**CA1 — Prompt enviado em duas partes:**
- Given: uma geração de plano avançada
- When: `IaServiceImpl.geraPlanoSemanalAvancado` chama o LLM
- Then: a chamada usa `.system(<estático>).user(<dinâmico>)` — o system contém a persona + regras
  (sem `%s`/`%d`), o user contém o perfil + histórico do atleta

**CA2 — Conteúdo total preservado (sem perda de instrução):**
- Given: o template original (522 linhas)
- When: dividido em system + user
- Then: a união (system + user) contém **todas** as seções do original — nenhuma regra/enum/checklist
  perdida; apenas reordenada (estático antes do dinâmico)

**CA3 — Placeholders só no user:**
- Given: o recurso de system prompt
- When: carregado
- Then: não contém `%s`/`%d` (é 100% estático, cacheável/reutilizável); os 8 args são formatados só no user

**CA4 — Geração de plano continua funcional (não-regressão):**
- Given: um atleta com perfil e histórico
- When: gera o plano após o split
- Then: retorna um `PlanoSemanalLlmDto` válido (schema JSON respeitado), equivalente em qualidade —
  golden-master re-baselined e revisado

**CA5 — Caminho legado intocado:**
- Given: `IaServiceImpl.gerarPlanoSemanal` (buildRequest)
- When: o split é aplicado
- Then: o caminho legado não é alterado

## Open Questions & Assumptions

**Premissas:**
- Ganho de **custo é neutro** hoje (GPT-4o já cacheia o prefixo automaticamente). Esta change é de
  **organização/estrutura**, não de custo — a métrica do SPRINTS (~50-70%) não se aplica ao GPT-4o.
- Mover as regras para *antes* dos dados (system) é aceitável/recomendado; a validação de não-regressão
  (CA4 + golden re-baseline) cobre o risco.
- `PromptTemplateLoader.escapeTemplate` (escapa `%` não-formatável) continua aplicável ao user prompt;
  o system prompt, sem placeholders, não precisa de `String.format` (evita escaping desnecessário).

**Em aberto (follow-up separado, fora desta change):**
- Trocar `TaskComplexity.PLANO` para Claude Sonnet para ativar o cache `SYSTEM_ONLY` real — é troca de
  modelo na feature mais crítica (qualidade do plano); merece sua própria change com validação dedicada.
- Medir os cached tokens da OpenAI em produção para confirmar que o prefixo estático já economiza.
