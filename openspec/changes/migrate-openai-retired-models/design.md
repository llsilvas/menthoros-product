# Design — migrate-openai-retired-models

## D0 — Gate 0: fonte oficial antes de código

A única fonte aceita para "qual modelo" é a página de deprecações da OpenAI e o guia de migração
que o aviso cita. O que precisa estar registrado no proposal antes da task 1.1:

- ID do modelo recomendado e dos snapshots datados que a API devolve em `metadata.model`.
- Se o modelo usa reasoning por padrão e quais valores `reasoning_effort` aceita (incluindo
  `none`, se existir).
- Quais parâmetros ele rejeita (`temperature`, `top_p`, penalties, `max_tokens`).
- Se `response_format: { type: json_schema, strict: true }` funciona no Chat Completions com ele.
  Se só funcionar na Responses API, é **blocker** (non-goal explícito).
- Preços oficiais (input, cached input, output) por MTok.

## D1 — Contrato de opções por rota

`LlmRoutingProperties.RotaLlm` hoje: `model`, `temperature` (`@NotNull`), `maxTokens`,
`timeout`. Passa a:

```java
@NotBlank String model;
Double temperature;            // opcional — ausente em modelo com reasoning
@NotNull Integer maxTokens;    // semântica: teto de saída; vira maxCompletionTokens na OpenAI
Double topP;                   // opcional, só OpenAI sem reasoning
String reasoningEffort;        // opcional — "none" | "low" | "medium" | "high"
String verbosity;              // opcional
@NotNull Duration timeout;
```

Regra de validação no bean (fail-fast no boot, mesmo padrão das 5 rotas obrigatórias), **pelo
esforço efetivo, não pela presença do campo** (achado Codex, 2026-10-15):

- `reasoningEffort` ausente ou `none` → amostragem permitida (`temperature`, `topP`).
- `reasoningEffort` em `low|medium|high` → `temperature` **e** `topP` proibidos.
- Modelo legado (sem reasoning, lista no gate 0) → `reasoningEffort`/`verbosity` proibidos.

`none` com `temperature 0.2` é exatamente o candidato mais próximo do comportamento atual (D3); a
regra anterior ("reasoningEffort e temperature não coexistem") o rejeitava e deixava `topP` passar.

`MultiModelConfig.opcoesOpenAi(rota)`:

```java
var b = OpenAiChatOptions.builder()
        .model(rota.getModel())
        .maxCompletionTokens(rota.getMaxTokens());
if (rota.getTemperature() != null) b.temperature(rota.getTemperature());
if (rota.getTopP() != null) b.topP(rota.getTopP());
if (rota.getReasoningEffort() != null) b.reasoningEffort(rota.getReasoningEffort());
if (rota.getVerbosity() != null) b.verbosity(rota.getVerbosity());
return b.build();
```

`maxCompletionTokens` vale para todos os modelos atuais da OpenAI (o antigo `max_tokens` é o
legado), então a troca é segura mesmo para o `gpt-4o` baseline durante o bake-off.
`opcoesAnthropic` não muda.

### D1.1 — O perfil da rota mora no `OpenAiChatModel`, não no `ChatClient`

Achado do Codex verificado no código: `clienteDeRota` instala as opções da rota em
`ChatClient.builder(model).defaultOptions(opcoes)`, mas `IaServiceImpl.chamarLlm`,
`EvalCandidateRunner` e `EvalLlmJudge` chamam `.options(schema)` por requisição — e no Spring AI
1.1.6 `DefaultChatClient.options(...)` **substitui** as default options do `ChatClient` em vez de
mesclar. O que sobra para o merge final é o default do `OpenAiChatModel`, que `modeloOpenAiComTimeout`
herda intacto do auto-config. **Hoje a rota `plano` roda no default global por coincidência**
(global e rota são ambos `gpt-4o`/12000/0,2); com um sucessor só na rota, produção continuaria
chamando o modelo do default global, e CA3 não pegaria.

Decisão: `modeloOpenAiComTimeout` passa a instalar o perfil completo da rota no modelo derivado:

```java
return base.mutate()
        .openAiApi(api.mutate().restClientBuilder(restClientComTimeout(rota.getTimeout())).build())
        .defaultOptions(opcoesOpenAi(rota))   // substitui, não herda, o default do auto-config
        .build();
```

`clienteDeRota` pode manter `defaultOptions` por simetria com o Anthropic, mas a fonte de verdade
é o modelo. `LlmJsonSchemaBuilder` continua produzindo opções só com `responseFormat` — o merge
`ModelOptionsUtils.merge` no `buildRequestPrompt` preenche o resto a partir do modelo.

O teste que prova isso (CA3 reescrito) não inspeciona objetos: captura o **JSON HTTP efetivo**
(`MockRestServiceServer` ou interceptor no `RestClient.Builder`) nos três caminhos — produção
(`IaServiceImpl` com schema), candidato (`EvalCandidateRunner`) e juiz (`EvalLlmJudge`) — e assere
`model`, `reasoning_effort`, `max_completion_tokens`, `response_format` e **ausência** de
`temperature`/`top_p` quando o esforço não é `none`.

## D2 — Default global sai do YAML

`spring.ai.openai.chat.options.{model,temperature,max-tokens,top-p,frequency-penalty,presence-penalty}`
são mesclados pelo Spring AI em **toda** chamada `OpenAiChatModel`, inclusive quando a rota passa
`OpenAiChatOptions` próprios (merge campo a campo, o default preenche o que a rota não definiu).
Um modelo com reasoning recebe `top_p` e `frequency_penalty` do default e devolve 400 mesmo com
a rota correta.

O caminho do vazamento, verificado no código: `MultiModelConfig.modeloOpenAiComTimeout` faz
`base.mutate()...build()` sobre o `OpenAiChatModel` auto-configurado, e `mutate()` preserva
`defaultOptions` — logo toda rota OpenAI nasce com `gpt-4o`, `temperature 0.2`, `top-p 0.9`,
`frequency-penalty 0.1` como default, e `OpenAiChatModel.buildRequestPrompt` mescla isso com as
opções da rota campo a campo.

Segundo achado do Codex: **omitir `temperature` no YAML não a remove.** `OpenAiChatProperties`
do Spring AI 1.1.6 inicializa as opções com `DEFAULT_TEMPERATURE = 0.7`; sem a propriedade o
auto-config sobe com 0,7, `base.mutate()` preserva, e `ModelOptionsUtils.merge` ignora `null` da
origem — `temperature: null` na rota não limpa o default. Por isso D1.1 **substitui** o
`defaultOptions` do modelo derivado em vez de herdar: é a única forma de garantir que a
temperatura do auto-config não chegue a um candidato com reasoning.

Decisão: o bloco default fica só com `model` (necessário para o auto-config subir) e
`max-completion-tokens`; o que sobrar nele é irrelevante para as rotas, porque nenhuma herda
mais. `ChatClientConfig.chatClient` (`@Primary`) **não tem consumidor** em
produção — `IaServiceImpl` já usa `modelRouter.route(TaskComplexity.PLANO)` e o comentário em
`MultiModelConfig` registra que a última feature que o usava migrou. O bean é removido; se o
teste de contexto acusar ponto de injeção, ele volta construído com `opcoesOpenAi(props.getSimple())`.

O juiz do eval (`EvalLlmJudge`) **não é instanciado em produção**: só em `EvalRunnerTest`, com
`EVAL_MODEL` (default `gpt-4o`) e `construirChatClientReal`, que fixa `temperature(0.2)` e
`maxTokens(12000)` — isso também quebra com um sucessor com reasoning. `construirChatClientReal`
passa a receber uma `RotaLlm` e usar `opcoesOpenAi`; o juiz ganha `EVAL_JUDGE_MODEL` separada de
`EVAL_MODEL` (candidato). Nenhuma rota nova de produção.

CA3 prova o fim do vazamento pelo payload HTTP capturado (D1.1), não por inspeção de objetos.

## D3 — Bake-off com o harness existente

Reaproveita integralmente `EvalRunnerTest` em modo real (hoje já aceita `apiKey` e `modelo` por
propriedade de sistema, ver `construirChatClientReal`). O que é novo:

- Um runner não-`@Component` (`OpenAiSuccessorBakeoff`, em `src/test`, tag `eval-real`) que
  recebe N `(nome, OpenAiChatOptions)` e um `ChatClient` de juiz, roda cada candidato contra
  todas as fixtures de candidato, coleta `EvalDeterministicGrader`, `EvalLlmJudge`, latência de
  parede por chamada e `EvalCostCalculator`.
- Saída: markdown em `apps/menthoros-backend/docs/ia/bakeoff-openai-sucessor-<data>.md`, uma
  linha por candidato. O nome do snapshot devolvido em `metadata.model` entra no relatório — é o
  que alimenta `llm-pricing.yml`.
- Juiz: `gpt-4o` enquanto existir (`EVAL_JUDGE_MODEL`). Após 2027-01-14 o juiz passa para o
  candidato **não** vencedor da rota `plano`. O relatório registra o juiz no cabeçalho (CA7).

Candidatos mínimos para `plano`: sucessor com `reasoning_effort` baixo e sucessor com o padrão.
Se o gate 0 mostrar que existe `none`, ele entra como terceiro, pois é o mais próximo do
comportamento atual (temperatura 0,2, sem reasoning).

Critério de escolha (nesta ordem): grader determinístico ≥ baseline → custo/plano ≤ 1,5×
baseline → menor p95 → maior nota do juiz. O juiz desempata, não decide — ele não é calibrado.

`simple` e `expert` não têm fixtures. `simple`: menor nível de preço do sucessor, smoke manual de 3
chamadas do `AthleteMessageGenerator`. `expert`: mesmo modelo que vencer `plano` (mesmo perfil de
saída longa e determinística), smoke manual de 3 chamadas.

## D4 — Preço e snapshots

`llm-pricing.yml` ganha: alias do sucessor + cada snapshot datado observado no bake-off. O
comentário existente ("snapshot datado: é o nome que a OpenAI devolve") permanece como padrão.
`LlmPricingRegistry` já valida `todasAsRotas()` no boot. O modelo do juiz (só teste) não passa
por essa validação; `EvalCostCalculator` devolve custo nulo se faltar preço, então o relatório do
bake-off precisa falhar explicitamente quando o custo de um candidato vier nulo.

## D5 — Guard de modelos retirados

`RetiredModelsGuardTest` (unit, roda no CI): lista `Set<String> RETIRADOS = {gpt-4o,
gpt-4o-mini, gpt-4.1, gpt-4.1-mini}` + prefixos dos snapshots; carrega `LlmRoutingProperties` e
`spring.ai.openai.chat.options.model` do `application.yml` real (não de um YAML de teste) e falha
se algum bater. Teste negativo com `@TestPropertySource` apontando `plano` para `gpt-4o` prova que
o guard pega.

## D6 — Renomeação dos beans por rota

`gpt4oMiniClient` → `simpleClient`, `gpt4oClient` → `expertClient`, `gpt4oPlanoClient` →
`planoClient`; `@Qualifier` no `ModelRouter` acompanha. É refactor puro, sem mudança de
comportamento, e evita que a próxima migração precise tocar o router. Commit separado
(`refactor(llm): ...`).

## D7 — Rollout e rollback

Terceiro achado do Codex: **rollback por `APP_LLM_ROUTING_PLANO_MODEL=gpt-4o` não funciona.**
Troca só o modelo; `reasoning-effort`/`verbosity` continuam no YAML e o builder os envia, e o
`gpt-4o` rejeita a requisição. Rollback é a troca **atômica do perfil inteiro** da rota (modelo,
reasoning, verbosity, amostragem, teto de tokens, timeout).

Decisão: rollback = **`git revert` do commit de configuração (task 4.1) + deploy**, não variável
de ambiente. O commit 4.1 é só YAML, isolado de propósito, para o revert ser limpo. O revert é
**ensaiado** no Railway dev antes do rollout (task 7.1b): aplica o YAML novo, gera um plano,
reverte, gera outro — os dois precisam funcionar. Variáveis de ambiente ficam como caminho de
emergência só se **todas** as propriedades da rota forem sobrescritas juntas, e isso é documentado
no proposal como lista explícita, não como "trocar o modelo".

| Fase | Onde | Rollback |
|---|---|---|
| Bake-off | local, chave de dev | n/a |
| Smoke + ensaio de rollback | Railway dev (banco próprio) | revert ensaiado |
| 1 semana de planos reais | `develop` | revert do commit 4.1 + deploy, até 2027-01-14 |
| Produção | PR `develop → main` até 2026-11-15 | mesmo revert via PR, até 2027-01-14; depois, nenhum |

O guard (D5) não conflita com o revert: ele vive no CI e falharia num PR de revert — por isso o
PR de rollback precisa também desligar o guard (uma linha, `@Disabled` com motivo e data). Isso é
proposital: rollback para um modelo retirado é uma exceção visível, não um estado silencioso.

## Fora do design

Adaptador Anthropic de saída estruturada, Responses API, mudança de prompt/schema, calibração do
juiz. Cada um tem change própria ou é non-goal.
