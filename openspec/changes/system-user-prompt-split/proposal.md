# Proposal: system-user-prompt-split

**Tamanho:** S · **Trilha:** Fast (backend-only, um repo, sem contrato de API/DB — com risco de
regressão de comportamento do LLM na feature mais crítica, coberto por golden re-baseline revisado e
pelo ledger da Fase 0)

## Status

**Reaberta em 2026-09-13 (Fase 1 da análise arquitetural do motor de geração, Sprint 24).** DoR
fechado no grilling de 2026-09-13. Depende de `add-plan-generation-ledger` (Fase 0) apenas para
**medir o gate**; o código não depende dela.

**Histórico:** deferida em 2026-07-07 (product-lens) com a premissa "GPT-4o já cacheia o prefixo
automaticamente, logo o split é neutro em custo". **A premissa estava errada** — ver "Correção de
premissa" abaixo.

## Why

O prompt de geração de plano (`plano-treino-otimizado-claude.txt`, 523 linhas, ~24 KB estáticos) é
enviado **inteiro como um único `.user(...)`** em `IaServiceImpl.geraPlanoSemanalAvancado`, sem
mensagem `system`. Os 8 placeholders dinâmicos ocupam as linhas 6 a 23 — **antes** das ~490 linhas
de regras estáticas.

A OpenAI cacheia por **prefixo idêntico** de pelo menos 1.024 tokens. Como o nome do atleta está na
linha 6, o prefixo idêntico entre duas gerações tem cinco linhas. Produção confirma
(`LlmUsageLogger`, 2026-09-07): `promptTokens≈12.800`, `cachedTokens=0` em três de quatro chamadas;
a única leitura de cache (1.920 tokens) foi do **mesmo atleta** minutos depois.

Separar o estático num `system` (tudo antes de qualquer valor do atleta) e o dinâmico num `user`
liga o cache de prefixo na OpenAI e, no futuro, o cache explícito `SYSTEM_ONLY` de 1 h já configurado
nos beans Anthropic. Ganho esperado por plano: 3 a 8 s de latência e ~US$ 0,015 (metade do custo dos
~10k tokens estáticos), mais 10 a 15% de tokens de entrada pela poda de instruções redundantes com o
schema `strict`.

## Correção de premissa (2026-09-13)

O argumento da deferência ("cacheia por prefixo, não por role, então mover para `system` é neutro")
estava certo sobre o mecanismo e errado sobre o fato: o prefixo **não é estático**, porque o bloco
dinâmico está no topo. O split não é neutro; é o que torna o prefixo cacheável. A change
`measure-openai-prompt-cache` (arquivada 2026-07-07) forneceu o instrumento que provou isso.

## What Changes

### Backend (`apps/menthoros-backend`)

- **Dois recursos** em `src/main/resources/prompts/`:
  - `plano-treino-system.txt`: persona (linhas 1–4) + regras/estrutura/enums/checklist/instruções
    de saída (linhas 32–523), **em PT-BR como estão** (a tradução para inglês fica para a Fase 4,
    quando o `system` é reescrito de qualquer jeito — decisão Q8). Lido cru
    (`PromptTemplateLoader.loadTemplate`), sem `escapeTemplate` nem `String.format`. **Correção de
    premissa (achado do Codex, verificado no arquivo real):** o bloco não é 100% sem placeholder —
    a linha 167 (`O objetivo "%3$s" determina o treino-chave da semana`) tem um placeholder
    posicional real dentro do que a versão anterior desta spec chamava de bloco estático. Hoje ele
    já não interpola nada: `escapeTemplate` não reconhece `%3$s` (só `%s`/`%d`/`%%`) e o escapa para
    `%%3$s`, que o `String.format` devolve como o literal `%3$s` — o prompt em produção já mostra
    esse texto quebrado ao LLM, não o objetivo real. Esta change corrige isso reescrevendo a linha
    167 sem placeholder (`O objetivo do atleta determina o treino-chave da semana` — o valor
    concreto já chega pelo `user`, seção PERFIL DO ATLETA). Além disso, há **11 ocorrências** de
    `%%%` no bloco 32–523 (linhas 91, 102, 153, 154, 156, 167, 169, 187, 189, 275, 276, 277, 465,
    505 — não só a 505), todas viram `%` simples ao migrar para leitura crua.
  - `plano-treino-user.txt`: `### PERFIL DO ATLETA` + `### HISTÓRICO RECENTE` (linhas 5–30), com
    os 8 placeholders na mesma ordem.
- **Poda segura** das "INSTRUÇÕES CRÍTICAS - FORMATO DE SAÍDA" (linhas 485–523): remove **apenas**
  o que o schema `strict` já torna impossível, cada linha removida com a justificativa
  (`enum`/`const`/`minItems`/`maxItems`/`additionalProperties:false`/`required`). Fica o que o
  schema não cobre (hífen vs. travessão, reticências, mínimo de 7 etapas no intervalado,
  expansão de tiros, ordem sequencial de `ordem`). Decisão Q9.
- `PromptGerado` vira `PromptGerado(String system, String user, List<Constraint> regras)`.
  `PlanoTreinoPromptBuilder.buildOptimizedPrompt` carrega o `system` cru e formata só o `user`.
- `IaServiceImpl.geraPlanoSemanalAvancado` envia `chatClient.prompt().system(system).user(user)`.
  `defaultJsonSchemaOptions()`, `PlanoResilienceService` e `ModelRouter` inalterados.
- **Feedback do retry** ("CORRECAO OBRIGATORIA") é acrescentado ao **fim do `user`**, nunca ao
  `system` (decisão Q23) — o `system` é byte-idêntico entre tentativas e entre atletas.
- **`PromptVersion.CURRENT` → `"plano-v2"`** e novo `prompt.sha256` junto do golden (constantes
  criadas pela Fase 0).
- **Golden-master** (`PlanoTreinoPromptBuilderGoldenTest`): passa a gerar **um** `system.txt` +
  **cinco** `<arquetipo>.user.txt` (decisão Q20) e a chamar a sobrecarga de **8 argumentos** com
  `decisaoProgressao`, `revisaoConsumida` e `skeleton` nulos (decisão Q21). Os 5 golden atuais são
  substituídos, com revisão humana do diff.

### O que NÃO muda

- Modelo, rota, schema, retry, redistribuição, persistência.
- Ordem interna do `user`: o bloco `⛔ REGRAS QUE VOCÊ NÃO PODE VIOLAR` continua no topo do
  histórico, como hoje. Nenhuma reordenação semântica além da separação (uma variável só).
- Caminho legado `IaServiceImpl.gerarPlanoSemanal` + `plano-treino-prompt.txt`: intocado; a Fase 2
  remove (decisão Q25).
- Idioma: PT-BR. `llm-code-switching` foi absorvida no roadmap, mas a tradução acontece na Fase 4.

## Capabilities

### Modified Capabilities

- `plan-generation`: prompt em duas partes (system estático cacheável + user dinâmico), sem
  mudança de contrato nem de modelo.

## Impact

**Backend:** `PlanoTreinoPromptBuilder`, `IaServiceImpl`, `PlanoResilienceService` (onde o feedback
é anexado), `PromptTemplateLoader` (leitura crua), `PromptVersion`, recursos em `prompts/`, golden.
**APIs/DB/Multi-tenancy:** nenhum. **Modelo:** permanece GPT-4o.

**Blast radius:** só `PlanoServiceImpl.gerarPlanoTreino → IaServiceImpl.geraPlanoSemanalAvancado`.

**Risco principal — regressão de comportamento do LLM pela reordenação** (regras antes dos dados).
Mitigação: golden re-baseline revisado; `IaServiceImplFcValidationTest` e demais validadores verdes;
gate medido em produção pelo ledger (CA6) com comparação `plano-v1` × `plano-v2` de retry e
`REJEITADO` por duas semanas. **Limiar de alerta precoce (achado do spec-reviewer — CA7 não tinha
gatilho antes desta correção):** nos primeiros 2–3 dias em produção, se a taxa de retry ou de
`REJEITADO` de `plano-v2` piorar em ≥ 20% relativo a `plano-v1` (janela equivalente), investigar
antes de esperar as duas semanas completas. **Rollback:** não há feature flag nesta change (só
troca de arquivo lido e de `.system()`/`.user()` no `ChatClient`); a reversão é `git revert` do PR
de merge — documentado aqui para não ficar implícito.

## Critérios de Aceite

**CA1 — Prompt em duas partes:**
- Given uma geração de plano avançada
- When `IaServiceImpl.geraPlanoSemanalAvancado` chama o LLM
- Then a chamada usa `.system(<estático>).user(<dinâmico>)`; o `system` é idêntico para qualquer
  atleta e qualquer tentativa

**CA2 — Conteúdo preservado, poda justificada:**
- Given o template original
- When dividido e podado
- Then toda seção `###` do original aparece em `system` ou `user`, e cada linha removida das
  "INSTRUÇÕES CRÍTICAS" está listada no PR com a propriedade do schema que a torna redundante

**CA3 — `system` cru e sem placeholders:**
- Given `plano-treino-system.txt`
- When carregado
- Then não passa por `String.format`; um teste falha se contiver `%s`, `%d`, `%%` **ou qualquer
  placeholder posicional** (`%\d+\$`, cobrindo o caso já visto na linha 167 original); todas as
  ocorrências de `%%%` do bloco 32–523 (não só a linha 505) viraram `%`

**CA4 — Feedback do retry só no `user`:**
- Given uma 2ª geração com feedback
- When o `PlanoResilienceService` monta a chamada
- Then o `system` é byte-idêntico ao da 1ª e o feedback está no fim do `user`

**CA5 — Golden em dois níveis e sobrecarga de produção:**
- Given os 5 arquétipos
- When o golden roda
- Then existe um `system.txt` e cinco `<arquetipo>.user.txt`, gerados pela sobrecarga de 8
  argumentos; `prompt.sha256` bate com o hash do classpath

**CA6 — Gate de cache (produção, via ledger):**
- Given um lote de ≥ 5 atletas **distintos** do mesmo tenant, ordenado por `created_at`
- When se toma, por atleta, apenas a **primeira tentativa** (`tentativa = 1`) da rota `plano`
- Then a mediana de `cached_tokens / prompt_tokens` entre a 2ª chamada do lote em diante (por
  ordem de `created_at`, uma linha por atleta) é ≥ 0,60 (decisão Q24). **Correção (achado do
  Codex):** a versão anterior usava "chamadas 2..N por `generation_request_id`" — como esse campo
  é 1 por atleta, isso selecionava **retries** do mesmo atleta, não a reutilização de prefixo entre
  atletas do lote; sem retry a amostra ficava vazia, e com retry o resultado media cache do mesmo
  atleta consigo mesmo, não o ganho pretendido.

**CA7 — Não-regressão funcional:**
- Given um atleta com perfil e histórico
- When gera o plano após o split
- Then `PlanoSemanalLlmDto` válido; `IaServiceImplFcValidationTest`, compliance estágio 1 e
  `PlanQualityChecker` verdes; retry e `REJEITADO` de `plano-v2` não piores que `plano-v1` em duas
  semanas

**CA8 — Caminho legado intocado:**
- `IaServiceImpl.gerarPlanoSemanal` e `plano-treino-prompt.txt` sem alteração

## Métrica de sucesso

Latência p50 da rota `plano` cai ≥ 3 s e `cached_tokens` mediano no lote ≥ 60%, medidos em
`tb_llm_call` por `prompt_version`, sem piora de retry nem de `REJEITADO` do coach.

## Open Questions & Assumptions

- O cache da OpenAI expira com 5 a 10 min de inatividade (até 1 h fora de pico): gerações
  interativas espaçadas por horas podem não acertar; por isso o gate é medido no lote. **Precisão
  do gate (achado do Codex):** "medido no lote" sozinho não garante o TTL — o lote precisa rodar
  com concorrência/cadência que mantenha o intervalo entre chamadas do mesmo tenant abaixo de
  ~5 min; a task 5.3 deve registrar a duração real do lote medido, não só o resultado da mediana.
- `escapeTemplate` continua só no `user`.
- `PromptVersion` e `prompt.sha256` existem a partir da Fase 0; se esta change entrar antes, cria
  as constantes aqui e a Fase 0 as consome.
- Fora desta change: tradução para inglês (Fase 4), remoção do legado (Fase 2), troca de modelo
  (Fase 6), reordenação semântica do `user` (nenhuma prevista).
