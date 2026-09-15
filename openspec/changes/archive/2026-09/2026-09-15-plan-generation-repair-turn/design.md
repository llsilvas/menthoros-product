# Design — plan-generation-repair-turn

## Estado atual (mapeado, não hipótese)

- `PlanoResilienceService` (`services/helper/PlanoResilienceService.java`): `record Tentativa(int
  numero, String prompt)` (`:37`); loop `while (orcamento.tentarDebitar())` (`:105-122`), teto
  `MAX_TENTATIVAS = 2` (`:48`), deadline `100s` (`:59`), sem backoff. Na 2ª tentativa reescreve
  `prompt` inteiro (`:111-114`) com `motivo = ultimaFalha.getMessage()` truncado em 300 chars
  (`:137-142`). Só `LLMException` do `validar` dispara retry (`:119-121`); exceção do `gerar`
  propaga (`:116`, 503). Falha final: `DomainRuleViolationException` → 422.
- `IaServiceImpl.geraPlanoSemanalAvancado` (`services/impl/IaServiceImpl.java:131-183`): captura
  `system`/`user` separados de `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`:138`); chama
  `chatClient.prompt().system(system).user(t.prompt())...responseEntity(PlanoSemanalLlmDto.class)`
  (`:157-160`) — **usa só `getEntity()`**, `getResponse()` (o texto bruto) fica disponível e não é
  aproveitado.
- Validação dentro do loop: `PlanoLlmValidator.validarENormalizarPlano` (aborta na 1ª violação por
  treino, `LLMException` com uma mensagem) + `aplicarComplianceEstagio1` →
  `PlanoNaoConformeException extends LLMException`, que já carrega `List<Violacao>`
  (`ai/ledger/Violacao.java`). `PlanQualityChecker.check` roda **fora** do loop (`:174-178`), só
  métrica.
- `system` é lido de arquivo, capturado uma vez (`:139-141`), byte-idêntico entre tentativas — é o
  prefixo cacheável (F1). O retry hoje só reescreve o `user`.
- Ledger (F0): `tb_llm_call` grava `attempt`, `violations` JSONB, `response_json` (via
  `CostTrackingAdvisor`) por chamada — a infraestrutura de observabilidade já existe.

## Achados da 2ª rodada de pré-mortem (Codex adversarial, 2026-09-14) — mecanismo confirmado por bytecode

Aprofundando o achado #1 da 1ª rodada: **confirmado, não é hipótese.** Desmontado o bytecode de
`ChatModelCallAdvisor.augmentWithFormatInstructions` e `Prompt.augmentUserMessage`
(Spring AI 1.1.6, `~/.m2`):

- `ChatModelCallAdvisor` só pula a injeção textual de formato quando o contexto tem
  `STRUCTURED_OUTPUT_NATIVE=true` **e** as `ChatOptions` implementam `StructuredOutputChatOptions`
  (que `OpenAiChatOptions` implementa) — mas **nada no código do app grava essa chave**
  (`rg STRUCTURED_OUTPUT_NATIVE src/main/java` = 0 ocorrências). Logo, todo `.responseEntity(Class)`/
  `.entity(Class)` cai no caminho textual: `prompt.augmentUserMessage(fn)`.
- `Prompt.augmentUserMessage` varre a lista de mensagens **de trás para frente** e anexa o texto de
  formato (`BeanOutputConverter.getFormat()`) só na **primeira `UserMessage` encontrada a partir do
  fim** — ou seja, a **última** mensagem de usuário da conversa, seja qual for.

Consequência direta para o turno de reparo: na 1ª tentativa, a conversa é `[system, user]` — o
`user` (única e última mensagem de usuário) recebe o sufixo de formato. Na 2ª tentativa, a conversa
proposta era `[system, user, assistant, user(correção)]` — agora é o `user(correção)` que é o
último, e recebe o sufixo; o `user` original, que na 1ª chamada tinha o sufixo, **na 2ª não tem**.
O prefixo comum entre as duas chamadas **não é byte-idêntico**, contrariando a premissa central da
Decisão 1 (e isso já é verdade hoje, embora invisível: cada tentativa reescreve o `user` inteiro, e
o sufixo cai na versão reescrita — não há prefixo comum a preservar no design atual).

**Correção (não é mais assunção, é decisão):** o caminho de chamada da geração de plano para de usar
`.responseEntity(Class)`/`.entity(Class)` (que embrulha em `BeanOutputConverter` e aciona esse
advisor). Como o schema `strict(true)` via `ResponseFormat.JSON_SCHEMA` já garante JSON válido
contra `PlanoSemanalLlmDto` — as instruções textuais do `BeanOutputConverter` são redundantes com o
que o schema nativo já impõe, o mesmo princípio da F1 (podar instrução que o schema `strict` já
cobre). A chamada passa a usar `.call().content()` (texto bruto) + `ObjectMapper` do app para
desserializar manualmente — remove o `ChatModelCallAdvisor`/`BeanOutputConverter` do caminho por
completo, elimina a divergência de prefixo pela raiz (nenhum advisor mexe nas mensagens), e captura
a resposta bruta (Decisão 3) fica mais simples: `content()` já é a string.
Falha de parse vira `JsonProcessingException` capturada onde hoje `getEntity()` faria o parse —
mesmo `PARSE_ERROR`/503 de antes, só que explícito em vez de dentro do converter do Spring AI.

## Achados do pré-mortem (Codex adversarial, 2026-09-14) — incorporados

Rodada de pré-mortem antes do handoff apontou 4 problemas, todos verificados contra o bytecode do
Spring AI 1.1.6 (`~/.m2`, `DefaultChatClient`) e o código real do repo antes de aceitar:

1. **`.responseEntity(Class)` sempre passa por `BeanOutputConverter`, mesmo com `ResponseFormat.JSON_SCHEMA`
   já configurado nas options — e isso quebra a igualdade de prefixo, confirmado por bytecode na
   2ª rodada** (ver seção acima). Decisão 1 revisada: abandonar `.responseEntity`/`BeanOutputConverter`
   e desserializar manualmente.
2. **Fail-fast do plano inteiro, não só do treino.** `PlanoLlmValidator.validarENormalizarPlano:60-62`
   usa `.stream().map(normalizacaoDeTreino::normalizar).toList()` — o `Stream` aborta no **primeiro**
   treino que lançar `LLMException`, e os demais treinos da semana **nunca são avaliados** nessa
   passada. Com `MAX_TENTATIVAS = 2`, se o plano tiver 2 treinos malformados, a 1ª tentativa só
   revela o 1º; a 2ª tentativa (a última) corrige o 1º e só aí descobre o 2º — sem tentativa
   restante para corrigi-lo. A promessa original desta change ("violações completas, uma por
   treino") era falsa para esse caso. Ver Decisão 4 revisada.
3. **Task de PARSE_ERROR mal descrita.** Não existe "2ª tentativa com comportamento antigo" para
   falha de parsing — `gerar` lança fora do `catch` de retry (`PlanoResilienceService:116`), então
   **não há 2ª tentativa nenhuma** nesse caso, hoje e depois desta change. Corrigido na task 2.4.
4. **Enriquecimento do `PlanQualityChecker` é código morto como desenhado.** A Decisão 5 original
   (opção B) dizia "só entra na lista quando já há violação estrutural na mesma tentativa" — mas
   `PlanQualityChecker.check` só roda depois que `validarENormalizarPlanoGerado` e
   `aplicarComplianceEstagio1` **passam sem lançar**. Nessas condições nunca existe violação
   estrutural na mesma passada por construção — a condição da opção B nunca é verdadeira.
   **Descoped**: `PlanQualityChecker` sai desta change (ver Não-objetivos do proposal).

## Decisão 1 — forma da conversa de reparo

**Turno de reparo = mensagens acrescentadas, nunca reescritas.** A 2ª tentativa envia:

```
[ SystemMessage(system)                         // idêntico à 1ª — prefixo cacheável intacto
, UserMessage(userOriginal)                      // idêntico à 1ª
, AssistantMessage(jsonDaTentativa1)              // NOVO — o que o modelo respondeu
, UserMessage(mensagemDeCorrecao) ]               // NOVO — violações completas + instrução
```

vs. a alternativa rejeitada — **reescrever o `user`** (como hoje): perde o efeito de cache
incremental (o provedor não tem como saber que o novo `user` é "o antigo mais uma nota"; ele reindexa
o prefixo cacheável a partir do ponto onde o texto diverge, que aqui é logo no início do `user`).

**Pré-condição para o prefixo ser de fato idêntico (2ª rodada do pré-mortem):** só é verdade sem
`.responseEntity(Class)`/`BeanOutputConverter` no caminho — ver "Achados da 2ª rodada" acima. Com
`.call().content()` + parse manual, nenhum advisor toca as mensagens, e a lista literal acima é
exatamente o que sai serializado. A task 0.1 ainda captura o request real como dupla checagem (o
`ChatModelCallAdvisor` continua na cadeia default do `ChatClient` mesmo sem `.responseEntity`; vale
confirmar que ele vira no-op quando não há `OUTPUT_FORMAT` no contexto).

`mensagemDeCorrecao` é gerada por um método puro — não uma f-string solta em `IaServiceImpl` —
porque a estrutura ("liste as violações, uma por linha, com a chave; instrua a manter o resto")
é testável isoladamente sem chamar o modelo:

```java
// services/helper/RepairTurnMessageBuilder (novo, @Component, sem estado)
String construirCorrecao(List<Violacao> violacoes) { ... }
```

## Decisão 2 — `Tentativa` carrega histórico, não string derivada

```java
// PlanoResilienceService.java — assinatura revisada
public record Tentativa(int numero, String promptOriginal,
                         @Nullable String jsonAnterior, List<Violacao> violacoesAnteriores) {}
```

`gerarComResiliencia` para de reescrever uma string; monta o `Tentativa` com o estado bruto e deixa
`IaServiceImpl` decidir a forma da conversa. Isso mantém `PlanoResilienceService` agnóstico de
Spring AI (ele já não depende de `ChatClient` hoje — só orquestra a função `gerar`/`validar`
passadas por `IaServiceImpl`).

## Decisão 3 — captura da resposta bruta (revisada: sem `BeanOutputConverter`)

Com `.responseEntity(Class)` abandonado (Decisão 1), a chamada passa a ser
`.call().content()` — devolve a string bruta direto, sem passar por `BeanOutputConverter`. O parse
para `PlanoSemanalLlmDto` é feito com o `ObjectMapper` do app, o mesmo texto vira `jsonBruto`. Um
record local `ChamadaLlm(PlanoSemanalLlmDto entidade, String jsonBruto)` é o que o
`Function<Tentativa, ChamadaLlm>` passado a `gerarComResiliencia` retorna, em vez de
`Function<Tentativa, PlanoSemanalLlmDto>`. Isso muda a assinatura pública de `gerarComResiliencia`
— impacto contido no par `IaServiceImpl`/`PlanoResilienceService` e no teste existente
(`PlanoResilienceServiceTest`).

**Guarda de conteúdo nulo/vazio (achado da 3ª rodada do pré-mortem).** Hoje, quando o modelo devolve
uma resposta sem `choices` (`content()` nulo), `.getEntity()` do `.responseEntity(...)` também é
nulo, e esse `null` **atravessa `gerar` sem lançar** — só é rejeitado depois, dentro de `validar`
(`PlanoLlmValidator.validarENormalizarPlano:54-55`, `if (plano == null...) throw new LLMException`),
que **é** retry-elegível (`PlanoResilienceService:119-121`). Um `readValue(null, ...)` ingênuo
lançaria `IllegalArgumentException` **dentro de `gerar`**, que propaga sem retry
(`PlanoResilienceService:116`) — perderia a chance de reparo que existe hoje. Correção:

```java
String json = respostaChat.content();
PlanoSemanalLlmDto entidade = (json == null || json.isBlank())
        ? null
        : objectMapper.readValue(json, PlanoSemanalLlmDto.class); // JsonProcessingException aqui = PARSE_ERROR, sem retry (igual hoje)
return new ChamadaLlm(entidade, json);
```

`entidade == null` chega a `validar` exatamente como hoje: `LLMException`, retry-elegível. Só JSON
**não-vazio e malformado** lança dentro de `gerar` sem retry — que já é o comportamento de hoje
(o converter também lança dentro de `.responseEntity()`, ou seja, dentro de `gerar`). Nenhuma
mudança de contrato observável em nenhum dos dois casos.

## Decisão 4 — agregação de violações, por TODOS os treinos inválidos (revisada pós pré-mortem)

A `NormalizacaoDeTreino` continua abortando na 1ª violação **dentro de um treino** — não reabre a
arquitetura de receita (fora de escopo, ver proposal). O que muda é o **nível do plano**, em
`PlanoLlmValidator.validarENormalizarPlano:60-62`, que hoje é um `.stream().map(normalizar).toList()`
— aborta no primeiro treino que lançar, e os demais nunca são avaliados nesta passada. Isso
contradizia a promessa da change: com 2 treinos malformados, a 2ª (última) tentativa só descobre o
2º depois de corrigir o 1º, sem tentativa sobrando.

Correção: o laço por treino passa a **percorrer todos os treinos da lista antes de decidir**,
coletando uma `Violacao` por treino que falhar em vez de propagar na primeira exceção:

```java
List<TreinoPlanejadoLlmDto> normalizados = new ArrayList<>();
List<Violacao> violacoesEstruturais = new ArrayList<>();
for (TreinoPlanejadoLlmDto treino : plano.treinosPlanejados()) {
    try {
        normalizados.add(normalizacaoDeTreino.normalizar(treino, ctx));
    } catch (LLMException e) {
        violacoesEstruturais.add(new Violacao("NORMALIZACAO_" + treino.diaSemana(), e.getMessage()));
    }
}
if (!violacoesEstruturais.isEmpty()) throw new PlanoNaoConformeException(..., violacoesEstruturais);
```

`PlanoNaoConformeException` (já existe, hoje só usada pelo compliance do planner) passa a ser lançada
também pela normalização — unifica o formato de violação estrutural e de compliance num só tipo,
sem duplicar `LLMException` com lista.

Agregação final no `validar` de `geraPlanoSemanalAvancado`:

1. Tentar `validarENormalizarPlanoGerado` (agora com o laço acima) — se lançar
   `PlanoNaoConformeException`, suas `violacoes()` são **todos** os treinos malformados desta
   passada, não só o primeiro.
2. Se passar, tentar `aplicarComplianceEstagio1` — mesma coisa, já era `List<Violacao>`.
3. Sem tentativa de "rodar os dois e juntar": se a normalização já rejeitou, o compliance do
   planner não roda nesta passada (ele pressupõe um plano estruturalmente válido).

## Decisão 5 — `PlanQualityChecker` fora de escopo (removida pós pré-mortem)

A ideia original ("enriquece só quando já há violação estrutural na mesma tentativa") era
logicamente inalcançável: `PlanQualityChecker.check` só roda depois que os dois validadores
estruturais **passam sem lançar** — nessas condições nunca existe violação estrutural na mesma
passada para "enriquecer". Corrigir isso direito (rodar o checker de qualidade independente do
resultado estrutural, e decidir se ele sozinho bloqueia) é a opção A que o design já recusava sem
grilling de produto. Em vez de forçar uma versão quebrada de B, `PlanQualityChecker` **sai desta
change** — continua exatamente como hoje (fora do loop, só métrica). Vira candidato de change própria
se a F3, depois de medida, ainda deixar taxa de retry abaixo da meta.

## Decisão 6 — JSON completo no `AssistantMessage` (fecha a Open Question, DoR 2026-09-14)

O JSON da 1ª tentativa vai para a conversa **completo**, não recortado aos treinos que falharam.
O `AssistantMessage` representa literalmente "o que o modelo respondeu" — enviar uma versão editada
inventaria uma resposta que o modelo nunca deu, quebrando a premissa central do turno de reparo (o
modelo corrige melhor vendo o próprio output verbatim, não um resumo). O schema `strict` já obriga
o modelo a devolver o DTO completo em qualquer resposta, então recortar o `AssistantMessage` não
economiza tokens de saída — só cria uma divergência entre "o que dizemos que ele disse" e o que ele
de fato disse.

## Test surface

- `RepairTurnMessageBuilder` — testável sem mock: `List<Violacao>` → `String`, casos: 1 violação, N
  violações, violações com mensagem vazia (defensivo).
- `PlanoResilienceServiceTest` — adaptar os testes existentes (`:114` "falha→retry com feedback")
  para o novo `Tentativa`; adicionar: 2ª tentativa recebe `jsonAnterior` não-nulo e
  `violacoesAnteriores` não-vazia quando a 1ª falhou.
- `IaServiceImplComplianceEstagio1Test` — estender para verificar que `List<Violacao>` chega
  completa (não truncada) ao builder de correção, com 3 violações do compliance.
- Sem WireMock (padrão do repo é mock do `ChatModel`/`ChatClient` via a costura de
  `MultiModelConfig`) — a montagem da conversa multi-mensagem é verificável com
  `ArgumentCaptor<Prompt>` sobre o `ChatClient` mockado, sem custo de rede.

## Riscos e mitigações

- **Risco (confirmado, 1ª e 2ª rodada de pré-mortem):** `.responseEntity(Class)`/`BeanOutputConverter`
  quebrava a igualdade de prefixo entre tentativas — mitigação já incorporada nas Decisões 1 e 3
  (abandonar o converter, parse manual via `ObjectMapper`). `.messages(...)` em si já está confirmado
  por bytecode que aceita a lista heterogênea; a task 0.1 verifica o request serializado real como
  dupla checagem, não mais como spike de API desconhecida.
- **Risco:** o JSON bruto de um plano de 12k tokens de saída como `AssistantMessage` mais o prompt de
  correção pode aproximar o orçamento de 100s/tentativa do teto — mitigação: medir latência da 2ª
  tentativa antes/depois via `tb_llm_call.latency_ms`; se piorar, considerar enviar só os treinos
  reprovados em vez do plano completo (ver Open Questions do proposal).
- **Risco:** enviar o JSON malformado/parcial como `AssistantMessage` se a 1ª tentativa falhou por
  `PARSE_ERROR` — não se aplica: `PlanoResilienceService:116` executa `gerar` **fora** do `catch` de
  retry, então uma falha de parsing na 1ª tentativa propaga direto (503) e **não há 2ª tentativa
  nenhuma** nesse caminho, hoje e depois desta change (achado da 1ª rodada, task 2.4).
  `jsonAnterior` só existe quando há 2ª tentativa por definição — o risco descrito na 1ª versão deste
  documento ("reenvio do prompt original, sem histórico") não existe: não há reenvio nenhum.
