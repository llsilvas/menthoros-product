## §0 — Estado real do código (verificado antes de escrever este design)

- `LlmJsonSchemaBuilder` (`services/prompt/LlmJsonSchemaBuilder.java:24-82`) produz só
  `OpenAiChatOptions` (`responseFormat`) — não existe equivalente Anthropic. Confirmado por
  decompilação do JAR local (`spring-ai-anthropic-1.1.6.jar`): nenhuma classe do módulo tem
  qualquer referência a `logprobs`, e `AnthropicChatOptions` não tem `responseFormat`/JSON schema
  nativo (Spring AI 2.0 só, fora de escopo).
- `EvalCandidateRunner` (`services/helper/EvalCandidateRunner.java`) já é agnóstico de provider —
  recebe um `ChatClient` de fora (`EvalCandidateRunner(ChatClient, LlmJsonSchemaBuilder,
  EvalDeterministicGrader)`), sem `@Component`. É reaproveitado sem alteração para os candidatos
  Claude, desde que receba um `ChatOptions` equivalente ao `defaultJsonSchemaOptions()` mas
  Anthropic — troca o 2º parâmetro do construtor por uma interface `PlanSchemaOptionsFactory`
  (ver §1) em vez de acoplar direto a `LlmJsonSchemaBuilder`.
- `MultiModelConfig` (`config/external/MultiModelConfig.java`) já tem `claudeHaikuClient` e
  `claudeSonnetClient` (rotas `standard`/`complex`), mas com `AnthropicChatOptions` genérico —
  sem tool forçada, sem o schema de plano. Não são reaproveitáveis diretamente para o bake-off; os
  2 clientes novos (`claudeSonnetPlanoClient`/`claudeHaikuPlanoClient`) seguem o mesmo padrão de
  `modeloAnthropicComTimeout` (`MultiModelConfig.java:165-184`), só trocando as opções default.
- `EvalLlmJudge` (`services/helper/EvalLlmJudge.java`) recebe o `ChatClient` de fora — não precisa
  mudar de assinatura para ficar "fixo"; fixar é responsabilidade de quem monta o orquestrador do
  bake-off (§2), não do `EvalLlmJudge`.
- `EvalJudgeSchemaBuilder`/`NotaJuizCompleta`/`NotaJuizReduzida` — schema atual pede só a nota
  1-5 por eixo, sem campo de justificativa. Precisa de um novo record (`NotaJuizCompletaComRaciocinio`
  ou campo `justificativa: String` por eixo) — decisão de manter os records existentes e apenas
  adicionar campos, para não quebrar as fixtures/testes do F5 que já consomem `NotaJuizCompleta`.
- `llm-pricing.yml` tem `claude-sonnet-4-6` (stale) e `claude-haiku-4-5-20251001` (atual).
  `LlmPricingRegistry` resolve por `model` string exata — renomear a chave sem atualizar
  `app.llm.routing.complex.model` (que hoje referencia `claude-sonnet-4-6`) quebra o preço da rota
  `complex` em produção. A correção do nome é atômica: `llm-pricing.yml` + `application.yml` no
  mesmo commit.

## §1 — Fatia 1: Adaptador Anthropic de saída estruturada (walking skeleton)

### 1.1 `PlanSchemaOptionsFactory` — interface, 2 implementações

Extrai uma interface pequena para não acoplar `EvalCandidateRunner` a `LlmJsonSchemaBuilder`
diretamente:

```java
public interface PlanSchemaOptionsFactory {
    ChatOptions defaultOptions();  // schema v1
    ChatOptions v2Options();       // schema v2 (blocos)
}
```

`LlmJsonSchemaBuilder` passa a implementar essa interface (sem mudar comportamento — só adiciona
`implements`). Nova classe `AnthropicToolSchemaBuilder implements PlanSchemaOptionsFactory`:
monta uma `ToolCallback` única cujo `input_schema` é exatamente o schema JSON que
`LlmJsonSchemaBuilder` já gera para v1/v2 (reaproveitar o `JsonSchema` interno, não duplicar),
e força a chamada com `AnthropicChatOptions.toolChoice(ToolChoiceTool.of(<nome-da-tool>))` — o
modelo é obrigado a responder preenchendo os argumentos da tool, que é o JSON do plano.

### 1.2 Extração da resposta

A resposta de uma tool call chega como `ToolCall.arguments()` (JSON), não como texto livre no
`AssistantMessage` — diferente do fluxo OpenAI atual (`chatResponse.getResult().getOutput().getText()`
em `EvalCandidateRunner.java:74-76`). `EvalCandidateRunner` precisa de um branch: se a resposta tem
tool calls, extrai `arguments()` da única tool call esperada; senão, usa `getText()` como hoje.
Ambos os caminhos alimentam o mesmo `EvalDeterministicGrader.avaliar(String responseJson, ...)` —
o grader nunca sabe de qual provider veio.

### 1.3 `ChatClient`s novos

```java
@Bean @Qualifier("claudeSonnetPlanoClient")
public ChatClient claudeSonnetPlanoClient(...) {
    return clienteDeRota(modeloAnthropicComTimeout(..., props.getPlano()),
            anthropicToolSchemaBuilder.defaultOptions(), "plano-claude-sonnet");
}
```

Rota nova em `LlmRoutingProperties`/`application.yml` (`app.llm.routing.plano-claude-sonnet` /
`plano-claude-haiku`) ou reaproveita `props.getPlano()` (mesmo `max-tokens`/`timeout` do `gpt-4o`
de plano) — decisão na implementação, favorecendo reaproveitar `getPlano()` para não duplicar 12k
tokens/120s em 2 lugares sem motivo.

**CA2 verificado aqui**: um teste roda `EvalDeterministicGrader` com um `responseJson` extraído via
tool call (Claude) e outro via texto livre (OpenAI), ambos representando o mesmo plano — mesmas
violações reportadas.

## §2 — Fatia 2: Orquestrador do bake-off + juiz fixo

### 2.1 `PlanBakeoffRunner`

Não é `@Component` — mesmo padrão de `EvalCandidateRunner`/`EvalLlmJudge`: quem instancia (o
runner Maven `-Peval` do F5, novo modo `-Dmodo=bakeoff`) monta os 4 `ChatClient`s de candidato e
o `ChatClient` fixo do juiz, e injeta.

```java
public record Candidato(String nome, ChatClient chatClient, PlanSchemaOptionsFactory schemaFactory) {}

public class PlanBakeoffRunner {
    // 1 EvalCandidateRunner por candidato (schemaFactory varia); 1 EvalLlmJudge fixo (sempre GPT-4o)
    public List<ResultadoBakeoff> rodar(List<Candidato> candidatos, List<FixtureCandidato> fixtures) { ... }
}
```

**CA3 verificado aqui**: teste com 4 `ChatClient` mocks (incluindo um "gpt-4o" mock que representa
o candidato baseline) e 1 `ChatClient` mock separado para o juiz — assere que o mock do juiz é
chamado N vezes (1 por fixture por candidato) e nunca é o mesmo mock que gerou a resposta do
candidato, mesmo quando o candidato também se chama "gpt-4o".

### 2.2 Relatório

Reaproveita o formato de tabela do runner do F5 (`EvalRunnerTest`/relatório console) — 1 linha por
candidato: nota grader determinístico (0-1, % de violações), nota juiz ponderada (1-5 contínua),
p50 latência (do `Usage`/timestamp de cada chamada), custo/plano (USD, `EvalCostCalculator`).

## §3 — Fatia 3: Confiabilidade do juiz (G-Eval + MT-Bench, sem calibração)

Aplicada a `EvalLlmJudge`/`EvalJudgeSchemaBuilder` — usada tanto pelo bake-off quanto pelo gate
contínuo de PR do F5 (`./mvnw -Peval -Dmodo=candidato`), já que é o mesmo `EvalLlmJudge`.

### 3.1 Justificativa antes da nota (form-filling, G-Eval)

`NotaJuizCompleta`/`NotaJuizReduzida` ganham um campo `justificativa: String` por eixo (ou um
record aninhado `EixoAvaliado(int nota, String justificativa)`), e o `SYSTEM_COMPLETA`/
`SYSTEM_REDUZIDA` (`EvalLlmJudge.java:34-48`) instrui explicitamente: "escreva a justificativa
antes da nota, não depois" — ordem importa no form-filling (o texto gerado antes da nota
influencia a nota; o inverso não).

### 3.2 Reference-guided grading (MT-Bench)

Para os eixos que exigem raciocínio (progressão de carga, segurança/risco de lesão — só na rubrica
completa, `SYSTEM_COMPLETA`): o prompt do juiz pede primeiro "descreva o que você esperaria ver
neste plano dado o contexto do atleta" (referência auto-gerada), depois "compare o plano recebido
com essa referência". Reduz o caso em que o juiz aceita um plano plausível sem checar se a lógica
bate — mesma falha que MT-Bench documenta para questões de raciocínio/matemática.

### 3.3 Probability-weighted scoring (G-Eval)

Só aplicável ao juiz OpenAI (§0). `chamarJuiz` (`EvalLlmJudge.java:85-98`) passa a setar
`OpenAiChatOptions.logprobs(true).topLogprobs(5)` nas `ChatOptions` do juiz (via
`EvalJudgeSchemaBuilder`), e depois de parsear o JSON normalmente, recalcula cada nota como
`Σ p(sᵢ)·sᵢ` a partir de `chatResponse.getResult().getMetadata().<OpenAiApi.LogProbs>get("logprobs")`
— localiza o token da nota (dígito 1-5) na lista de `Content`, usa `topLogprobs` dessa posição como
a distribuição `p(sᵢ)`. Se o token da nota não estiver nos top-N logprobs (raro, mas possível),
cai de volta pro inteiro bruto do schema — sem lançar erro, já que o form-filling ainda garante uma
nota válida.

**CA4 verificado aqui**: teste injeta um `ChatResponse` com `logprobs` sintéticos conhecidos e
assere que o score pós-processamento é a média ponderada esperada, não o inteiro do schema.

## §4 — Fatia 4: Rollout do vencedor

- `llm-pricing.yml`: renomeia `claude-sonnet-4-6` → `claude-sonnet-5` (com o `application.yml`
  atualizado no mesmo commit — ver §0).
- Se o vencedor não for `gpt-4o`: `MultiModelConfig.gpt4oPlanoClient` e o bean correspondente
  trocam de posição — o vencedor vira `@Qualifier("planoClient")` (nome genérico, não mais
  amarrado a "gpt4o"), e `ModelRouter.route(PLANO)` aponta pra ele. Rollback: reverter o bean, não
  apagar — `gpt4oPlanoClient` continua existindo como bean nomeado, só não é mais o roteado por
  padrão.
- Flag por tenant: registrado como Open Question no proposal — sem infraestrutura de feature flag
  hoje, decisão de escopo mínimo (global primeiro, flag depois) ou construir a primeira peça fica
  para o início da implementação, não bloqueia o design das fatias 1-3.

## §5 — Superfícies não tocadas (garantir zero regressão)

- `IaServiceImpl`/`PlanoServiceImpl` (produção) não mudam nesta change — o bake-off roda só contra
  o harness de eval (F5), nunca contra o pipeline real, até a fatia 4 trocar o bean roteado.
- `EvalDeterministicGrader`/`PlanQualityChecker`/`SkeletonComplianceChecker` (F5) não mudam —
  reaproveitados como estão.
- Fixtures de auditoria (dados reais, F5) não são usadas no bake-off — só fixtures de candidato
  (sintéticas), pelo mesmo motivo que F5 já documentou (não existe schema/skeleton retroativo nas
  fixtures reais).
