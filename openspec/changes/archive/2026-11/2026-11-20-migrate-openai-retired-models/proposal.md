**Tamanho:** M · **Trilha:** Full

> Full porque mexe na rota de produção mais crítica (geração de plano semanal), tem incerteza de
> design (qual sucessor, e se o sucessor exige parâmetros de reasoning que o contrato atual não
> suporta), toca dois repositórios (texto da política de privacidade no front) e tem **prazo
> externo fixo**: a OpenAI desliga os modelos em **2027-01-14**.

**Status:** código entregue e arquivada (2026-11-20); rollout em `rollout-gpt-6-luna-producao`
**Criado:** 2026-10-15
**Prazo externo:** 2027-01-14 (retirada de `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` da API)

- **Premissas verificadas no código (2026-10-15):** o bean `@Primary` `ChatClientConfig.chatClient`
  não tem consumidor em produção (`IaServiceImpl` usa o `ModelRouter`); o juiz do eval só existe
  em `EvalRunnerTest`; o vazamento do default global é real porque `modeloOpenAiComTimeout` deriva
  cada rota com `base.mutate()`, que preserva `defaultOptions`. A primeira versão deste proposal
  previa uma rota `judge` em produção e migração de call sites do `IaServiceImpl` — removidos.
- **Product review (2026-10-15, `product-reviewer`): Go com refinamentos**, 11 achados. Três são
  os gates que seguraram `plan-llm-provider-bakeoff` e estavam só parcialmente cobertos:
  métrica real pós-rollout sem task (incorporado: baseline congelado + task 7.5 + gatilho de
  rollback), custo por atleta/mês vs teto de R$ 1,10 (incorporado: guardrail e tokens de reasoning
  no relatório), revisão humana cega de 5–10 planos (incorporado: task 3.5). Também incorporados:
  merge em `main` antecipado para **2026-11-15** (a métrica de aceite precisa de 4 semanas
  **dentro** da janela de rollback), plano B explícito (reabrir o bake-off Claude na rota `plano`),
  conjunto fixo de casos para `expert`, verificação coach-in-the-loop na rota `simple`, data de
  corte do modelo no ledger, D6 marcado como cortável, prazo interno do gate 0 (2026-10-31), e
  política de privacidade sem versão de modelo como recomendação. Perguntas ao founder na seção
  "Open Questions".
- **Pre-mortem cross-model (Codex, 2026-10-15): needs-attention**, 4 achados (3 altos),
  verificados contra os fontes do Spring AI 1.1.6 e contra o código. **Todos derrubaram premissas
  do design e foram incorporados (D1, D1.1, D2, D7):** (1) o perfil da rota fica em
  `ChatClient.defaultOptions` e `.options(schema)` por chamada o substitui — hoje a rota `plano`
  roda no default global por coincidência; o perfil passa a morar no `OpenAiChatModel` derivado;
  (2) omitir `temperature` no YAML mantém o 0,7 do `OpenAiChatProperties` e o merge ignora
  `null` — por isso o modelo derivado substitui o default em vez de herdar; (3) rollback por
  variável `MODEL` deixa `reasoning-effort` no YAML e quebra o `gpt-4o` — rollback vira revert
  atômico do commit de configuração, ensaiado antes do rollout; (4) a validação por presença de
  `reasoningEffort` rejeitava `none` + temperatura (o candidato mais próximo do atual) e deixava
  `topP` passar — validação passa a ser por esforço efetivo. CA3 reescrito para capturar o payload
  HTTP nos três caminhos (produção, candidato, juiz).

## Decisão de decomposição (2b)

**Mantida como uma change só.** O trabalho é um único corte: escolher o sucessor por rota com o
eval harness, adaptar o contrato de opções para o que o sucessor exige, trocar a configuração e
fechar as pontas (preço, política, comentários). A edição no front é uma string. Separar o
bake-off em change própria recriaria `plan-llm-provider-bakeoff` (adiada), e separar a troca de
configuração em change própria deixaria uma change que só decide e outra que só edita YAML —
"foundation sem ação".

**Relação com `plan-llm-provider-bakeoff` (adiada em 2026-09-16):** aquela change compara
OpenAI × Anthropic e exige um adaptador Anthropic de saída estruturada. Esta **não** faz isso: é
uma migração **OpenAI → OpenAI**, forçada, usando o harness que já existe
(`EvalCandidateRunner` + `EvalDeterministicGrader` + `EvalLlmJudge`). A Open Question "sucessor
OpenAI" (task 2.3 daquela change) fica respondida aqui. A premissa que mantinha o bake-off
adiado ("`gpt-4o` roda bem, não há motivo para mexer") deixa de valer por motivo externo, mas o
que muda é só o lado OpenAI — reabrir o bake-off cross-provider continua decisão do founder.

## Why

Em 2026-10-14 a OpenAI avisou que **GPT-4o, GPT-4o mini, GPT-4.1 e GPT-4.1 mini saem da API em
2027-01-14**. O backend usa dois deles em três das cinco rotas de LLM e no `ChatClient` default
(`application.yml`):

| Rota / bean | Modelo hoje | O que serve |
|---|---|---|
| `app.llm.routing.simple` | `gpt-4o-mini` | tradução, extração, mensagens ao atleta (`AthleteMessageGenerator`) |
| `app.llm.routing.expert` | `gpt-4o` | lesões, casos clínicos |
| `app.llm.routing.plano` | `gpt-4o` | geração de plano semanal, o fluxo mais caro e crítico |
| `spring.ai.openai.chat.options` (default) | `gpt-4o` | opções default do `OpenAiChatModel` auto-configurado — **herdadas por todas as rotas OpenAI**, porque `modeloOpenAiComTimeout` deriva cada rota com `base.mutate()`; e o bean `@Primary` `ChatClientConfig.chatClient`, que hoje **não tem consumidor** em produção |
| `EvalRunnerTest` (teste, modo real) | `gpt-4o` via `EVAL_MODEL` | juiz e candidato do eval set; `construirChatClientReal` fixa `temperature(0.2)` e `maxTokens(12000)` |

As rotas `standard` e `complex` já estão em Claude e não são afetadas. O embedding
(`text-embedding-3-small`) não está no aviso.

Sem ação, em 2027-01-14 a geração de plano, a rota clínica e as mensagens ao atleta passam a
falhar com erro da API. Para o treinador isso é a ferramenta principal parando no meio da semana.

Não é uma troca de string. A rota `plano` depende de saída em JSON Schema estrito
(`LlmJsonSchemaBuilder`, `response_format`), temperatura 0,2 e ~12k tokens de prompt; o sucessor
apontado por fontes secundárias (`gpt-6-luna`) é um modelo com reasoning por padrão, e a família
de modelos com reasoning da OpenAI **rejeita** `temperature`, `top_p`, `frequency_penalty` e
`max_tokens` (exige `max_completion_tokens`) — exatamente os parâmetros que o `application.yml`
hoje envia **globalmente** em `spring.ai.openai.chat.options`.

## What Changes

Somente configuração, contrato de opções e documentação. Sem migration, sem endpoint novo.

### 1. Gate 0 — confirmar o sucessor na fonte oficial (bloqueante, sem código)

Ler a página de deprecações da OpenAI e o guia de migração citado no aviso. Registrar aqui, na
seção "Decisão do gate 0": modelo recomendado, IDs de snapshot, se exige reasoning, preços
oficiais, e se `response_format: json_schema` continua suportado no Chat Completions. Fontes
secundárias (2026-10-15) dizem `gpt-6-luna`, reasoning *medium* por padrão, function calling no
Chat Completions só com reasoning `none` — **não confirmado** na página oficial.

### 2. Contrato de opções por rota tolerante a modelos com reasoning

`LlmRoutingProperties.RotaLlm` ganha campos opcionais `reasoning-effort` e `verbosity`;
`temperature` deixa de ser `@NotNull`. `MultiModelConfig.opcoesOpenAi` monta `OpenAiChatOptions`
com `maxCompletionTokens` (não `maxTokens`) e só envia `temperature` quando configurada. Os
parâmetros globais de `spring.ai.openai.chat.options` (`temperature`, `top-p`,
`frequency-penalty`, `presence-penalty`) saem do YAML e passam a viver por rota, porque o Spring
AI mescla as opções default em toda chamada e um modelo com reasoning devolveria 400.
O Spring AI 1.1.6 já expõe `reasoningEffort`, `verbosity` e `maxCompletionTokens` em
`OpenAiChatOptions` — sem upgrade de dependência.

### 3. Bake-off OpenAI → OpenAI com o harness existente

Rodar `EvalCandidateRunner` + `EvalDeterministicGrader` + `EvalLlmJudge` (modo real, fora do CI,
como já documentado em `plan-generation-eval-set`) contra as fixtures de candidato para a rota
`plano`, com pelo menos **2 candidatos** (sucessor recomendado em dois níveis de reasoning, ou
sucessor + alternativa da mesma família) e **`gpt-4o` como baseline** enquanto ainda existe.
Relatório em markdown com nota do grader, nota do juiz, p50/p95 de latência, custo por plano.
O juiz roda sobre um modelo **que não é candidato** — hoje é `gpt-4o` (`EVAL_MODEL` em
`EvalRunnerTest`); quando `gpt-4o` sair, o juiz passa para o sucessor que **não** vencer a rota
`plano`, mantendo o princípio juiz ≠ candidato de `plan-llm-provider-bakeoff`. O juiz é só de
teste: não ganha rota em produção, ganha a variável `EVAL_JUDGE_MODEL` separada de `EVAL_MODEL`.

O relatório registra também os **tokens de reasoning** por chamada (faturados como saída): é
onde o custo por plano estoura mesmo com preço por MTok parecido.

**Revisão humana cega:** antes do merge em `main`, o coach-fundador revisa 5–10 planos do
candidato vencedor lado a lado com os do `gpt-4o`, sem saber qual é qual. O juiz não é calibrado e
não pode ser a única barreira de qualidade; esta é a única verificação que olha o plano com os
olhos de quem vai aprová-lo.

Para `simple` e `expert` não há fixtures. `simple`: nível de preço mini/nano do sucessor e smoke
de 3 chamadas. `expert` (lesões, casos clínicos) tem risco de domínio alto demais para 3 chamadas:
monta-se um conjunto fixo de 5–10 casos reais anonimizados, revisado por humano, que fica em
`src/test/resources/eval/expert/` para as próximas migrações.

### 4. Troca de configuração + preço

`application.yml` com os modelos vencedores e `timeout` recalibrado pela latência medida.
`llm-pricing.yml` com os modelos novos **e os snapshots datados** que a OpenAI devolve na resposta
(`EvalCostCalculator` casa por prefixo, mas `LlmPricingRegistry` valida as rotas no boot).
`ChatClientConfig.chatClient` (`@Primary`, sem consumidor) é removido; se algum ponto de injeção
aparecer no teste de contexto, ele passa a ser construído com as opções da rota `simple`.
`EvalRunnerTest.construirChatClientReal` passa a montar as opções com o mesmo `opcoesOpenAi`
da produção, em vez de fixar `temperature(0.2)`/`maxTokens(12000)`.

### 5. Guard contra regressão

Teste que falha se qualquer modelo configurado em `app.llm.routing.*` ou no default OpenAI estiver
na lista de modelos retirados. A lista vive no próprio teste; adicionar um aviso futuro é uma
linha.

### 6. Pontas documentais

- Política de privacidade do front cita "OpenAI — GPT-4o" nominalmente
  (`politicaPrivacidadeConteudo.ts`): passa a citar o modelo novo, ou "modelos da OpenAI" sem
  versão, decisão do founder (Open Question 3).
- Javadoc e comentários que nomeiam `GPT-4o`/`gpt-4o-mini` (`TaskComplexity`, `IaServiceImpl`,
  `AthleteMessageGenerator`, `MultiModelConfig`) e os nomes dos beans `gpt4oClient`,
  `gpt4oMiniClient`, `gpt4oPlanoClient` e qualifiers no `ModelRouter` — renomear para nomes por
  **rota** (`expertClient`, `simpleClient`, `planoClient`) para a próxima migração não repetir
  esta limpeza.
- `menthoros-infra/docs/llm-pricing-guide.md` e `menthoros-product/knowledge/engineering/integrations.md`.
- A renomeação dos beans (D6) é **cortável** se o cronograma apertar: não é necessária para o
  prazo.

### 7. Rollout e medição

Ordem: Railway dev (smoke + **ensaio do rollback**) → `develop` (ambiente de testes) com 1
semana de planos reais → PR `develop → main` até **2026-11-15**. Até 2027-01-14 o rollback é o
**revert do commit de configuração** (só YAML, isolado para isso) mais deploy — não uma variável
de ambiente: trocar só o modelo deixa `reasoning-effort` no perfil e o `gpt-4o` rejeita a
chamada (achado Codex). Depois dessa data **não existe rollback** para o modelo antigo. A data
de 11-15 (e não 12-15) existe porque a métrica de aceite
precisa de **4 semanas de dados dentro da janela de rollback**: um sinal ruim perto de 01-14 não
teria mais para onde voltar.

Antes do deploy, congelar o **baseline**: taxa de aceite sem edição de volume e volume semanal de
planos das 4 semanas anteriores (ledger de `add-plan-generation-ledger`, mesma consulta de
`eval-progression-adherence-rollout`). O ledger já grava o modelo/snapshot por geração; a data de
corte fica registrada aqui para que a série histórica de edição do coach não misture dois modelos
sem rótulo.

**Gatilho:** queda de aceite > 5 p.p. com n ≥ 20 planos → revert do commit de configuração e
plano B. **Plano B** se o sucessor degradar e a janela acabar: reabrir `plan-llm-provider-bakeoff`
com Claude na rota `plano` (o adaptador de saída estruturada daquela change vira o caminho);
ajuste de prompt é paliativo, não plano.

**Coach-in-the-loop:** a troca não altera nenhum gate de aprovação. Na rota `simple`, o smoke
confirma que a mensagem ao atleta gerada pelo modelo novo continua passando pela ação do coach
antes de chegar ao atleta.

## Non-goals

- Comparar com modelos Anthropic ou mudar a rota `plano` de provider (`plan-llm-provider-bakeoff`).
- Mudar prompt, schema ou lógica de reparo da geração de plano (`migrate-plan-prompt-to-skills`,
  schema v2).
- Calibrar o juiz contra julgamento humano.
- Migrar para a Responses API da OpenAI. Se o gate 0 mostrar que `json_schema` no Chat
  Completions não é suportado pelo sucessor, isso vira **blocker** e a change volta para `/change`
  com escopo maior, não é absorvido aqui.
- Mudar o embedding.

## Critérios de aceite

- **CA1 (gate 0)** — GIVEN a página oficial de deprecações da OpenAI, WHEN o gate 0 é executado,
  THEN a seção "Decisão do gate 0" deste proposal registra sucessor, snapshots, preços e suporte a
  `json_schema`, com link e data; nenhuma task de código começa antes.
- **CA2 (validação por esforço efetivo)** — GIVEN rotas com (a) `reasoning-effort: none` +
  `temperature 0.2`, (b) `reasoning-effort: low` + `top-p`, (c) modelo legado + `reasoning-effort`,
  WHEN o contexto valida, THEN (a) sobe, (b) e (c) falham no boot com mensagem nomeando a rota e o
  campo; e `opcoesOpenAi` só preenche o que a rota define, com `maxCompletionTokens` e nunca
  `maxTokens` (teste unitário).
- **CA3 (payload efetivo)** — GIVEN o contexto Spring de produção com `temperature 0.7` deixada
  de propósito em `spring.ai.openai.chat.options` e um `RestClient` interceptado, WHEN
  `IaServiceImpl` gera um plano com schema, `EvalCandidateRunner` roda um candidato e
  `EvalLlmJudge` julga, THEN os três JSONs enviados trazem `model`, `max_completion_tokens`,
  `response_format` e `reasoning_effort` da rota, e **não** trazem `temperature`/`top_p` quando o
  esforço não é `none`.
- **CA4 (bake-off)** — GIVEN as fixtures de candidato do eval set, WHEN o bake-off roda com
  `gpt-4o` baseline e ≥ 2 candidatos, THEN existe um relatório markdown em
  `apps/menthoros-backend/docs/ia/` com grader, juiz, p50/p95 e custo por plano por candidato, e
  o candidato escolhido tem nota do grader determinístico ≥ baseline e o **custo marginal por
  atleta/mês** (plano + simple + expert, com tokens de reasoning) cabe no teto de R$ 1,10. Se o
  melhor em qualidade estourar o teto, vence o mais barato com grader ≥ baseline.
- **CA4b (revisão humana)** — GIVEN 5–10 planos do vencedor e os equivalentes do `gpt-4o`, WHEN o
  coach-fundador os revisa às cegas, THEN o vencedor não é preferido em menos casos que o
  baseline; resultado anexado ao relatório.
- **CA5 (preço)** — GIVEN os modelos configurados em todas as rotas e o default, WHEN o contexto
  sobe, THEN `LlmPricingRegistry` encontra preço para cada um, e `EvalCostCalculator` resolve o
  snapshot datado devolvido pela API (teste com o nome de snapshot registrado no gate 0).
- **CA6 (guard)** — GIVEN a lista de modelos retirados, WHEN um teste varre `app.llm.routing.*` e
  o default OpenAI, THEN nenhum está na lista; e o mesmo teste falha quando a configuração aponta
  para `gpt-4o` (teste negativo com propriedades sobrescritas).
- **CA7 (juiz ≠ candidato)** — GIVEN o relatório do bake-off, THEN o modelo do juiz não é o modelo
  vencedor da rota `plano` (verificado pelo nome no relatório).
- **CA8 (política)** — GIVEN a política de privacidade do front, THEN não cita `GPT-4o`.
- **CA9 (rollout)** — GIVEN `develop` no Railway com os modelos novos, WHEN uma semana de planos
  reais é gerada, THEN a taxa de falha de geração (ledger de `add-plan-generation-ledger`) não é
  maior que a semana anterior com `gpt-4o`, e p95 de latência fica abaixo do `timeout` da rota.

## Métrica de sucesso

- **Zero interrupção** na geração de plano em 2027-01-14 (o treinador não percebe a troca).
- **Taxa de aceite de plano pelo coach** (ledger) nas 4 semanas após o deploy em `main` dentro de
  ±5 p.p. da média das 4 semanas anteriores, com n ≥ 20 planos — mesma métrica que
  `eval-progression-adherence-rollout`. Abaixo de n = 20 a métrica é inconclusiva e fica registrado
  como tal.
- **Custo marginal por atleta/mês** (todas as rotas OpenAI) dentro do teto de R$ 1,10; custo por
  plano reportado como referência (~US$ 0,05 hoje, medido em 2026-09-07).
- Esta change é **paridade**, não melhoria: o ganho é continuar funcionando. Um ganho de qualidade
  só é anunciado se o bake-off e a revisão humana o mostrarem.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Sucessor exige Responses API para `json_schema` | Gate 0 verifica antes de qualquer código; se confirmar, blocker e reescopo |
| Modelo com reasoning estoura o `timeout` de 120 s do plano | Bake-off mede p95; `reasoning-effort` baixo como candidato; recalibrar `timeout` pelo medido |
| Parâmetros globais do YAML causam 400 em produção | Perfil da rota substitui o default do modelo derivado (D1.1); CA3 prova pelo payload HTTP |
| Perfil da rota perdido por `.options(schema)` por chamada — produção chama o modelo do default global | D1.1: perfil mora no `OpenAiChatModel`, não no `ChatClient`; CA3 cobre produção, candidato e juiz |
| Rollback parcial deixa `reasoning-effort` e quebra o `gpt-4o` | Rollback = revert atômico do commit de YAML, ensaiado no Railway dev (7.1b) |
| Juiz migra junto e muda a régua do eval | `gpt-4o` segue como juiz até sair; relatório registra o juiz; comparação entre candidatos é na mesma régua |
| Preço do sucessor sem entrada → boot falha | CA5; entrada de preço entra no mesmo commit da troca de modelo |
| Rollback impossível após 2027-01-14 | Merge em `main` até 2026-11-15; 4 semanas de medição dentro da janela; revert do YAML como rollback até 01-14; plano B = bake-off Claude |
| Tokens de reasoning estouram o teto de custo por atleta | Relatório mede tokens de reasoning; guardrail por atleta/mês no CA4; `reasoning-effort` baixo como candidato |
| Troca no meio do pilot das assessorias | Open Question 7: avisar e escolher janela sem provas-alvo; rollback por variável |
| Gate 0 tardio não deixa tempo para reescopo | Prazo interno do gate 0: 2026-10-31; blocker depois disso escala ao founder no mesmo dia |
| Snapshot datado desconhecido quebra o rastreio de custo | Nome do snapshot capturado no bake-off (metadata da resposta) e registrado no pricing |

## Open Questions & Assumptions

1. **Sucessor exato** — assume-se `gpt-6-luna` por fontes secundárias; **a confirmar no gate 0**.
   Se a OpenAI oferecer um modelo sem reasoning na mesma geração, ele entra como candidato.
2. **Rota `simple`** — assume-se que existe um nível "mini/nano" do sucessor com preço na faixa
   do `gpt-4o-mini`. Se não existir, avaliar `claude-haiku-4-5` (já na rota `standard`) como
   alternativa: muda o provider da rota, mas sem saída estruturada envolvida.
3. **Política de privacidade** — recomendação: "modelos da OpenAI" sem versão, para não repetir
   esta edição. Pergunta ao founder: a troca de modelo exige aviso formal ou nota de versão na
   política (o subprocessador não muda, o modelo sim)?
7. **Pilot** — há assessorias ativas entre novembro e janeiro? Elas serão avisadas da troca e há
   janela sem provas-alvo para o deploy em `main`?
8. **Baseline** — qual é hoje a taxa de aceite e o volume semanal de planos? Com n < 20 por 4
   semanas, ±5 p.p. não é detectável e a métrica precisa virar "sem queda relevante".
9. **Quem revisa às cegas** os 5–10 planos e os casos de `expert`: o coach-fundador?
10. **Esforço vs roadmap** — M/Full, prazo externo. Confirmar no `SPRINTS.md` que não compete com
    o que leva ao primeiro cliente pagante.
4. **Variáveis de ambiente no Railway** — assume-se que nenhuma variável `APP_LLM_ROUTING_*` ou
   `SPRING_AI_OPENAI_CHAT_OPTIONS_*` sobrescreve o YAML em produção hoje. Confirmar no painel
   antes do deploy; se existir, a troca é lá, não no YAML.
5. **Fine-tuning** — assume-se que o Menthoros não tem modelos fine-tunados (também retirados).
6. **Azure** — não se aplica; as chamadas vão direto à OpenAI.

## Decisão do gate 0

**Status: PARCIAL (2026-11-13).** Fontes oficiais lidas; **um item bloqueante segue não
confirmado** (suporte a `json_schema` no Chat Completions) — nenhuma task de código começa antes
de fechá-lo.

Fontes (HTTP 200, lidas em 2026-11-13):
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/guides/latest-model (seção GPT-6 migration quickstart)
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing

**Confirmado**
- Retirada em **2027-01-14** de `gpt-4o` (`gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`), `gpt-4o-mini`
  (`gpt-4o-mini-2024-07-18`), `gpt-4.1` (`gpt-4.1-2025-04-14`) e `gpt-4.1-mini`
  (`gpt-4.1-mini-2025-04-14`). Aviso em 2026-10-14. Substituto recomendado nos quatro: `gpt-6-luna`.
  Fine-tunes seguem o mesmo cronograma do modelo base.
- Sucessor: `gpt-6-luna`, snapshot único `gpt-6-luna`. **Não há variante mini/nano do GPT-6** nas
  páginas lidas — Open Question 2 se resolve com o próprio Luna na rota `simple`.
- Reasoning: `reasoning_effort` (Chat Completions) aceita `none`, `low`, `medium` (**padrão**),
  `high`, `xhigh`, `max`. Luna aceita `none`.
- Com esforço ≠ `none`: remover `temperature`, `top_p`, `top_logprobs` e `logprobs` (confirma D1).
- Chat Completions é endpoint suportado. Structured Outputs consta em "Supported features".
- **Function calling no Chat Completions só com `reasoning_effort: none`**; a OpenAI recomenda
  mover para a Responses API.
- Preço Luna (USD/1M, standard, ≤ 272K): entrada 0,10 · cache 0,01 · saída 0,50. > 272K: 2x
  entrada/cache e 1,5x saída. Batch/Flex 0,05 / 0,005 / 0,25. Contexto 1.050.000, saída máx 128.000.
  Prêmio regional de 10%.

**Não confirmado — fechar antes de qualquer código**
> **Sonda real em 2026-11-14** (`gpt-6-luna`, Chat Completions, schema strict de 2 campos):
> - **`json_schema` strict: HTTP 200 e JSON válido com `reasoning_effort` `none` e `medium`.**
>   Itens 1 resolvido para o suporte; **não cobre** o schema real do plano (~12k tokens) — fica
>   para o bake-off (task 3.x).
> - `max_tokens` com reasoning: **400** ("Use 'max_completion_tokens' instead") — confirma D1.
> - `temperature 0.2`: **200 com `none`; 400 com `medium`** ("Only the default (1) value is
>   supported") — confirma a validação por esforço efetivo.
> - `frequency_penalty 0.1`: **400 com `medium`**. Com `none` a chamada devolveu **500**
>   (erro do servidor) **duas vezes seguidas** (2026-11-14, reproduzido): tratar como
>   **não suportado** no Luna. As penalties saem do YAML global e não entram no perfil do Luna
>   (já era a direção de D1); o `gpt-5.2` aceita com `none`, mas não há motivo para usar.
> - Tokens de reasoning em `medium` na sonda: 20 (prompt trivial; não representa o plano).
>
> **Mesma sonda com `gpt-5.2`** (snapshot devolvido: `gpt-5.2-2025-12-11`): mesmo comportamento
> do Luna — `json_schema` strict 200 com `none` e `medium`; `max_tokens` 400; `temperature` 200
> com `none` e 400 com `medium`; `frequency_penalty` **200 com `none`** e 400 com `medium`.
> Isso resolve o caso que ficou inconclusivo no Luna só para o `gpt-5.2`; no Luna o `none`
> segue por repetir. O `gpt-5.2` é, portanto, candidato viável no bake-off, e o snapshot acima
> entra no `llm-pricing.yml` (CA5).

1. ~~`response_format: json_schema` no **Chat Completions** com Luna~~ (**resolvido para o suporte
   em 2026-11-14**, ver sonda acima; o texto original segue como histórico): as páginas só listam
   "structured_outputs" como feature, sem dizer por endpoint. A rota `plano` depende disso. Se só
   valer na Responses API, é blocker (Non-goals): reescopo ou plano B. **Ação:** chamada real de
   teste com o schema de `LlmJsonSchemaBuilder`.
2. ~~`max_tokens` vs `max_completion_tokens` e `frequency_penalty`/`presence_penalty` com
   reasoning~~ **Resolvido em 2026-11-14, exceto um caso:** `max_tokens` e `frequency_penalty`
   rejeitados com `medium`. `frequency_penalty` com `none` no Luna deu 500 em 2 execuções:
   não usar. `presence_penalty` e `top_p` não foram sondados; como o perfil novo não os envia
   (D1), não bloqueia.
3. ~~O backend usa function calling em alguma rota OpenAI?~~ **Resolvido em 2026-11-13: não.**
   Grep em `apps/menthoros-backend/src/main` por `.tools(`, `toolCallbacks`, `.functions(`,
   `@Tool`, `FunctionCallback`, `ToolCallback`, `defaultTools`, `tool_choice`, `toolNames` sem
   ocorrência. Único achado: `ToolCallingManager` em `MultiModelConfig.java:17` (dependência do
   construtor do `OpenAiChatModel` derivado, não uso). A restrição "function calling só com
   `reasoning_effort: none`" não pesa; qualquer esforço é permitido. `src/test` não foi varrido.
4. Tarefas 0.2 (variáveis do Railway) e 0.3 (fine-tunes na conta) seguem abertas — exigem acesso
   do founder.

**Alternativa GPT-5 avaliada em 2026-11-13 (preço standard, USD/1M, entrada / saída):** descartada
como candidata principal. Fonte: https://developers.openai.com/api/docs/pricing e
https://developers.openai.com/api/docs/deprecations (tabela lida inteira).

| Modelo | Preço | Retirada |
|---|---|---|
| `gpt-4o` / `gpt-4o-mini` (hoje) | 2,50 / 10,00 · 0,15 / 0,60 | 2027-01-14 |
| `gpt-5` · `gpt-5-mini` · `gpt-5-nano` | 1,25 / 10,00 · 0,25 / 2,00 · 0,05 / 0,40 | **2026-12-11** |
| `gpt-5.1` · `gpt-5.4-nano` | 1,25 / 10,00 · 0,20 / 1,25 | 2027-04-01 |
| `gpt-5.2` | 1,75 / 14,00 | sem data |
| `gpt-5.4-mini` | 0,75 / 4,50 | sem data |
| `gpt-5.6-luna` | 0,20 / 1,20 | sem data |
| `gpt-6-luna` | 0,10 / 0,50 | sem data |

Os GPT-5 mais baratos que o `gpt-4o` saem antes dele (ou em 2027-04-01), então só adiam a
migração. Os sem data de retirada custam mais que o `gpt-6-luna`. **`gpt-5.2` fica como segundo
candidato do bake-off** se o `json_schema` falhar no Luna (entrada abaixo do `gpt-4o`, saída
acima). Para a família GPT-5 também **não confirmado:** reasoning padrão, parâmetros rejeitados e
`json_schema` no Chat Completions (a página de Structured Outputs diz "gpt-4o-2024-08-06 and
later", ambíguo) — a mesma chamada de teste do item 1 cobre os dois.

**Efeito no prazo:** o proposal assume 1 semana em `develop` antes do `main` em 2026-11-15. Com o
gate 0 aberto em 2026-11-13, essa janela não cabe; o prazo precisa ser renegociado (Open
Question 10).

### Decisão do bake-off (2026-11-16, task 3.3)

Relatórios em `apps/menthoros-backend/docs/ia/`: `bakeoff-openai-sucessor-2026-11-15.md` (juiz
`gpt-4o`, 4 candidatos, custo do candidato separado do juiz), `-violacoes.md` (detalhe por caso) e
`bakeoff-openai-sucessor-2026-11-16.md` (juiz `gpt-5.2` e smoke da rota `simple`).

| rota | modelo | esforço | evidência |
|---|---|---|---|
| `plano` | `gpt-6-luna` | `medium` | 0–1 violação de qualidade contra 8–18 do `gpt-4o`; juiz `gpt-4o` 4,80 × 4,20; custo US$ 0,0029/plano × 0,040; latência 30–35 s, dentro do timeout de 120 s. Decisão do founder, aceitando a espera maior do coach. |
| `simple` | `gpt-6-luna` | `none` | Revisão cega de 40 traduções pelo coach (`consolidate-llm-on-openai`): melhor em 26/40, pior em 3/40. Smoke do bloco do atleta: 2,0–2,2 s e sem afirmações que os dados não sustentam. |
| `expert` | `gpt-6-luna` | `medium` | Sem chamador em `src/main` (`TaskComplexity.EXPERT`); troca só para tirar o `gpt-4o` da configuração (CA6). O conjunto de casos reais da task 3.4 deixa de se aplicar. |

- **Snapshots:** `gpt-4o` serve `gpt-4o-2024-08-06`; `gpt-6-luna` responde sem sufixo datado (o
  preço em `llm-pricing.yml` cobre o nome servido).
- **Juiz pós-retirada (`EVAL_JUDGE_MODEL`):** `gpt-5.2`. Diferente do vencedor da rota `plano` (CA7),
  0 falhas de schema. Baseline medido com ele antes da retirada: `gpt-4o` 3,00 e `gpt-6-luna:medium`
  3,00 (as notas do juiz `gpt-5.2` não se comparam com as do juiz `gpt-4o`, que dava 4,20 e 4,80).
- **CA4 — grader ≥ baseline:** atendido em qualidade. As 2 violações de compliance do Luna em
  `low`/`medium` vêm de defeito da fixture `taper-semana-prova` (prompt pede TERÇA/QUINTA/SÁBADO,
  atleta tem SEGUNDA/QUARTA/SEXTA/SÁBADO); o `gpt-4o` passa por acaso porque ignora os dias do prompt.
- **CA4 — custo por atleta/mês (rotas OpenAI):** `plano` 4,33 × US$ 0,0029 ≈ US$ 0,013; `simple`
  ≈ US$ 0,006 (tokens medidos no comparativo de tradução); `expert` 0. Total ≈ US$ 0,02 ≈ R$ 0,11,
  dentro do teto de R$ 1,10 (hoje, com `gpt-4o`: ≈ R$ 1,00).
- **Limites:** n = 5 casos por candidato; latência medida em rede doméstica; a revisão humana cega
  dos planos (task 3.5) ainda não foi feita e bloqueia o rollout (7.3).

### CA4b — revisão humana cega (2026-11-18)

Três rodadas de 15 pares (5 arquétipos × 3 repetições), lidas às cegas pelo coach-fundador:
rodada 1 (resposta bruta da LLM) 9 × 6, não passou; rodada 2 (normalizada) 10 × 5, não passou;
**rodada 3 (normalizada + persist) 12 × 3 para o gpt-6-luna, sem item barrado — passa.** As correções que
viabilizaram a rodada 3 eram de normalização e de eval, não do modelo (`add-etapa-pace-validator`,
`fix-total-treino-soma-etapas`, `fix-etapas-sintetizadas-sessao-curta`). Follow-ups de qualidade em
`garantir-cobertura-sete-dias-plano`, `ajustar-taper-pre-prova` e `ocultar-volume-alvo-vazio`.

### Rollout — procedimento de rollback e consultas (2026-11-18, seção 7)

**Merge em `develop`:** menthoros-backend#244, 2026-11-18 (`ab86883`). Docs: menthoros-infra#25.

**Rollback (design D7), válido até 2027-01-14:** branch pronta `chore/rollback-openai-para-gpt4o`
(a partir de `develop` depois do #244), com três commits:

1. `git revert 2fc4c20` — IT de payload volta ao perfil do gpt-4o;
2. `git revert 02ba482` — `application.yml` volta ao perfil completo antigo de cada rota (não só o
   modelo): `plano` gpt-4o / temperature 0.2 / max-tokens 12000 / timeout 120s; `expert` gpt-4o /
   temperature 0.2 / 8000 / 90s; `simple` gpt-4o-mini / temperature 0.3 / 1000 / 20s; default
   `spring.ai.openai.chat.options.model` gpt-4o. Sem `reasoning-effort` em nenhuma rota — a validação de
   boot recusa gpt-4o com esforço;
3. `@Disabled` com motivo e data só no teste do guard que lê o YAML real.

Para acionar: abrir PR da branch para `develop` (e depois `develop → main`). Variável de ambiente não é
caminho de rollback: trocar só `APP_LLM_ROUTING_PLANO_MODEL` deixa `reasoning-effort` do YAML e o boot falha.

**Consultas (Postgres do ambiente, `tb_llm_call`):**

```sql
-- CA9: taxa de falha e p95 da rota plano por semana e modelo servido
SELECT date_trunc('week', created_at) AS semana, model,
       count(*) AS chamadas,
       round(100.0 * count(*) FILTER (WHERE result <> 'SUCCESS') / count(*), 1) AS pct_falha,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
FROM tb_llm_call
WHERE route = 'plano' AND created_at > now() - interval '35 days'
GROUP BY 1, 2 ORDER BY 1 DESC, 2;
```

A taxa de aceite sem edição de volume (7.0/7.5) depende da definição ainda aberta em
`eval-progression-adherence-rollout` (Open Question 1 daquela change); até lá, 7.5 usa a taxa de
`REJEITADO` do coach por modelo (consulta 4 de `apps/menthoros-backend/docs/ia/consulta-validacao-ledger.sql`).
