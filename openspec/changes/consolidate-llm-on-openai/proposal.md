**Tamanho:** M · **Trilha:** Full

> Full porque introduz um mecanismo novo (fallback entre providers) numa rota que entrega texto ao
> coach, tem incerteza de design (qualidade do Luna em tradução e classificação sem eval prévio) e
> toca dois repositórios (texto de subprocessadores na política de privacidade do front).

**Status:** proposta (2026-11-15, `/change`)
**Criado:** 2026-11-15
**Depende de:** `migrate-openai-retired-models` (perfil de rota em `MultiModelConfig.opcoesOpenAi`,
`LlmPricingRegistry` com `gpt-6-luna`, harness `OpenAiSuccessorBakeoff`). Não pode mergear antes dela.
**Change irmã (2 de 2):** `migrate-workout-analysis-to-openai` — rota `complex`; depende desta.

## Por que

Hoje cada atleta custa, em LLM, ~R$ 3,91/mês, dos quais ~R$ 2,91 são Anthropic
(`docs/ia/custo-por-atleta.md` no backend). O bake-off de `migrate-openai-retired-models` mostrou o
`gpt-6-luna` a ~US$ 0,002–0,003 por plano contra US$ 0,040 do `gpt-4o`. Consolidar numa só
provedora reduz custo e superfície de manutenção, mas **não** pode custar a resiliência: a Anthropic
passa de provedora principal a **fallback**, e hoje não existe fallback entre providers no código.

**Premissas de custo não são medidas.** Frequência de análises por atleta e tokens por chamada das
rotas não-`plano` vêm de estimativa. Medir em `tb_llm_call` é o primeiro passo, não um detalhe.

## O que muda

1. **Medição** (task 1): custo real por rota e por atleta/mês em `tb_llm_call`; baseline
   congelado no documento de custo.
2. **Desacoplar a Anthropic dos call sites da rota `standard`** (task 2): três chamadores
   — `WorkoutAnalysisTranslator` (4 chamadas por análise, uma por campo), `AthleteMessageClassifier`
   e `RaceProjectionNarrativeGenerator` (Haiku, com `AnthropicChatOptions` por chamada e cache 1h do
   system prompt). `RaceProjectionNarrativeGenerator` já tem um fallback Haiku → Sonnet, mas dentro
   da própria Anthropic; passa a usar o mecanismo novo.
3. **Fallback por rota** (task 3): OpenAI primária, Anthropic secundária, acionado por 5xx, 429 e
   timeout da rota primária. **Sem retry de timeout, sem circuit breaker e sem dependência nova**
   (`docs/adr/0008` do backend: timeout vai direto ao fallback). Métrica Micrometer por rota e provider; e o ledger
   (`tb_llm_call`) grava o modelo que de fato respondeu (sem migration).
4. **Migrar a rota `standard` para `gpt-6-luna`** (task 4), com eval pequeno de tradução.
5. **Política de privacidade** (task 5, front): a Anthropic continua subprocessadora enquanto for
   fallback; o texto deve refletir isso e **não citar versão de modelo**.

## Fora de escopo (non-goals)

- Rota `complex` (análise de treino em `claude-sonnet-4-6`): change 2, depende de eval com casos
  reais curados pelo coach.
- Rotas `plano` e `simple`: cobertas por `migrate-openai-retired-models`.
- Rota `expert`: sem chamador em `src/main` (`TaskComplexity.EXPERT`); só registrar, não mexer.
- Circuit breaker, Resilience4j, retry de timeout.
- Gerar a análise já em PT-BR para eliminar a tradução (muda comportamento; vai na change 2).

## Critérios de aceite

- **CA1 (baseline)** — GIVEN o ledger do `develop` com ≥ 7 dias de dados, WHEN a consulta de custo
  roda, THEN `docs/ia/custo-por-atleta.md` traz custo por rota medido (não premissa) e a data da
  medição; se o volume for insuficiente, o documento diz isso e mantém as premissas marcadas.
- **CA2 (fallback por classe de erro)** — GIVEN a rota `standard` com primária OpenAI, WHEN a
  primária responde 500, 503, 429 ou estoura o timeout, THEN a chamada é refeita **uma vez** na
  Anthropic e o resultado volta ao chamador; WHEN responde 400, 401 ou 422, THEN **não** há fallback
  e o erro propaga (teste por classe de erro, com WireMock).
- **CA3 (sem retry de timeout)** — GIVEN timeout na primária, THEN há exatamente 1 tentativa na
  primária e 1 no fallback; o tempo total fica abaixo de `timeout_primária + timeout_fallback`.
- **CA4 (observabilidade)** — GIVEN um fallback acionado, THEN existem o contador
  `llm_fallback_total{rota,de,para,motivo}` e o ledger registra o modelo que respondeu; sem fallback,
  o contador não incrementa.
- **CA5 (call sites desacoplados)** — GIVEN `rg "AnthropicChatOptions" src/main/java`, THEN só
  `MultiModelConfig` e a implementação de fallback o referenciam.
- **CA6 (qualidade da tradução)** — GIVEN 20 análises em inglês (casos sintéticos revisados + reais
  anonimizados se houver), WHEN traduzidas por Haiku e por Luna, THEN a revisão cega do coach
  não prefere o Haiku em mais casos que o Luna, e nenhum campo sai vazio ou em inglês.
- **CA7 (custo)** — GIVEN a medição de CA1, THEN o custo da rota `standard` por atleta/mês cai e o
  total OpenAI das rotas migradas continua ≤ R$ 1,10 (teto de `migrate-openai-retired-models`).
- **CA8 (política)** — GIVEN o front, THEN a política de privacidade lista a Anthropic como
  subprocessadora de fallback e não cita versão de modelo.
- **CA9 (rollout)** — GIVEN `develop` com a rota migrada por 1 semana, THEN a taxa de análises
  `FAILED` ou `translationFailed` não é maior que a semana anterior.

## Métrica de sucesso

- **Análise em PT-BR continua entregue ao coach sem aumento de falha:** taxa de `FAILED` +
  `translationFailed` em `tb_analise_workout` dentro de ±1 p.p. da média das 4 semanas anteriores.
- **Custo de LLM por atleta/mês cai** na rota `standard`, medido em `tb_llm_call` (não estimado).
- Coach-in-the-loop preservado: a tradução e a classificação apenas apoiam o texto que o coach já
  revisa; a tradução apoia o texto que o coach já revisa. **A verificar (task 2.4):** o caminho até o
  atleta do classificador e da narrativa de projeção; até lá não se afirma coach-in-the-loop para eles.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Luna traduz pior que Haiku | CA6 antes do rollout; rollback = reverter o commit de configuração da rota |
| Fallback mascara queda da primária | Contador + alerta quando `llm_fallback_total` > 5% das chamadas da rota em 1 h |
| Fallback dobra a latência no pior caso | Orçamento total por chamada (`timeout_primária + timeout_fallback`) conferido no CA3 |
| Dois providers com contratos de opções diferentes (`AnthropicChatOptions` × `OpenAiChatOptions`) | Opções montadas só em `MultiModelConfig`; call sites passam só prompt e schema |
| Anthropic sem chave ativa quando o fallback for necessário | Teste de fumaça periódico do fallback (task 3.6); chave Anthropic mantida no Railway |
| Premissa de custo errada | Task 1 mede antes de decidir; se o ganho real for pequeno, a change pode ser abandonada |

## Open Questions & Assumptions

- **Assumido:** `gpt-6-luna` aceita o prompt de tradução e de classificação sem reasoning
  (`reasoning-effort: none`). Verificar no eval de CA6.
- **Assumido:** a rota `standard` tem o mesmo `timeout` hoje (30s); com Luna `none` a latência cai.
- **Aberto 1 (founder):** o teto de R$ 1,10 deve passar a valer para o **total** de LLM
  (OpenAI + Anthropic), não só OpenAI? Hoje o texto do teto cobre só OpenAI.
- **Aberto 2:** fallback deve valer também para a rota `plano` (Luna → Claude)? Fora desta change;
  `plan-llm-provider-bakeoff` já discutiu e o plano B lá é reabrir o bake-off Claude.
- **Aberto 3:** a Anthropic permanece como subprocessadora no DPA/política? Confirmar com o
  founder antes da task 5.
- **Correção de unidade (review de produto, 2026-11-15):** o ganho esperado da rota `standard` é
  ~US$ 0,05 ≈ **R$ 0,29** por atleta/mês, não R$ 0,05 (valores em dólar tinham sido lidos como reais).
  Continua pequeno; o review recomendou fundir com a change 2. **Decisão do founder: manter as duas
  changes** — a medição da task 1 e o limiar da task 1.2 decidem se a migração da `standard` segue.
- **Correção de premissa:** a conversa que originou esta change dizia "não há fallback no código".
  Há um, dentro da Anthropic (`RaceProjectionNarrativeGenerator.callWithFallback`, Haiku → Sonnet).
  Ele é absorvido pelo mecanismo novo.
