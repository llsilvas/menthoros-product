**Tamanho:** M · **Trilha:** Full

## Status: adiada (2026-09-16)

**Decisão do usuário, após `product-reviewer` (veredito REFINE):** esperar até depois do primeiro
cliente pagante. `gpt-4o` já roda em produção, gerando planos aceitáveis dentro do orçamento
conhecido — não há sinal de que o pilot esteja bloqueado por qualidade ou custo do modelo atual, e
o investimento (adaptador Anthropic inteiro, 2 `ChatClient`s novos, mudança no schema do juiz) não
se paga agora. Proposal/design/tasks ficam registrados como estão — a análise técnica (adaptador,
juiz fixo, confiabilidade sem calibração) continua válida; retomar exige antes reconfirmar que a
premissa mudou (custo/qualidade do `gpt-4o` virou um problema real, ou o volume de assessorias
justifica a otimização).

**Gates do `product-reviewer` a resolver antes de reabrir** (não incorporados ao proposal porque a
change não avança agora — ver review completo na conversa que abriu esta change):
1. O gate proposto (CA5, abaixo) mede o eval, não o produto — falta task de monitoramento
   pós-rollout com métrica real (coach acceptance rate, minutos por revisão).
2. Custo/atleta/mês é só reportado na tabela do bake-off, não é guardrail contra o teto de
   R$1,10/atleta/mês.
3. Revisão humana de amostra pequena (5-10 planos) do candidato vencedor antes do rollout final,
   dado o viés de família do juiz GPT-4o já registrado em "Open Questions & Assumptions" abaixo.

O pre-mortem adversarial (Codex) foi interrompido antes de concluir — não rodar de novo até a
change ser retomada, para não gastar orçamento de review numa proposta parada.

## Decisão de decomposição (2b)

**Mantida como uma change só.** É a F6 do bloco de engenharia de IA
(`apps/menthoros-backend/docs/ia/ANALISE_GERACAO_PLANOS_LLM.md` §7), sequenciada depois de F2
(`refactor-iaservice-decomposition`, porta — entregue) e F5 (`plan-generation-eval-set`, harness de
eval — entregue). O trabalho é coeso por natureza: rodar o mesmo eval contra 4 candidatos só produz
uma decisão comparável se os 4 rodarem na mesma versão do adaptador/juiz — fatiar em changes
menores não isola risco real, só adia a comparação que é o próprio objetivo da change (mesmo
raciocínio já usado em F4 e F5 para não fatiar).

Risco isolável identificado: o **adaptador Anthropic de saída estruturada** (schema v2 via tool
forçada) é a peça de maior incerteza de design — sem ele os 2 candidatos Claude nem entram no
bake-off. Ele vira a primeira fatia interna (walking skeleton): sozinho, já prova que um candidato
Claude produz um plano parseável antes de qualquer comparação de qualidade.

## Why

O roadmap resequenciado em 2026-09-13 (`SPRINTS.md` linha 719) reserva F6 explicitamente para
"decidir modelo por eval, não por preferência". Hoje a geração de plano usa `gpt-4o` fixo
(`app.llm.routing.plano`, `application.yml:295`) por decisão histórica, nunca comparado
objetivamente contra alternativas — nem contra um sucessor da própria OpenAI, nem contra os modelos
Anthropic que o sistema já usa em outras rotas (`claudeHaikuClient`/`claudeSonnetClient`,
`MultiModelConfig.java`). `llm-pricing.yml` já carrega preço de `claude-haiku-4-5-20251001`, mas
`claude-sonnet-4-6` está defasado (o modelo atual é `claude-sonnet-5`) — sintoma de que a rota de
plano nunca foi reavaliada desde que os preços Anthropic entraram no arquivo.

F5 entregou o harness (grader determinístico + juiz-LLM) mas o juiz roda **não calibrado** contra
julgamento humano (poucos dados de coach disponíveis ainda — ver `plan-generation-eval-set`
"Correção de escopo", CA3). Rodar um bake-off de 4 modelos hoje, com esse juiz, arrisca decidir o
motor de geração de plano da produção com base num sinal de qualidade que ninguém validou contra um
coach real. Esta change não substitui a calibração (que continua dependendo de volume real —
[[project_calibracao_juiz_eval]], a decidir quando houver dado suficiente); ela reduz o ruído do
juiz **sem depender de calibração**, com técnicas da literatura de LLM-as-judge validadas
empiricamente (G-Eval, Liu et al. EMNLP 2023; MT-Bench, Zheng et al. NeurIPS 2023) antes de confiar
nele para uma decisão de produção com impacto real em custo e latência para 100 atletas.

## What Changes

- **Adaptador Anthropic de saída estruturada** (nova classe ao lado de `LlmJsonSchemaBuilder`, que
  hoje só produz `OpenAiChatOptions` — `LlmJsonSchemaBuilder.java:24-37`): tool única com
  `input_schema` = schema v2 e `ToolChoiceTool` forçado (`AnthropicChatOptions` +
  `ToolCallback`/`ToolChoice`, Spring AI 1.1). A resposta deve desserializar no mesmo
  `PlanoSemanalLlmDto`/schema v2 que os candidatos OpenAI produzem — sem parsing especial por
  provider no grader.
- **2 ChatClients novos** (`claudeSonnetPlanoClient`, `claudeHaikuPlanoClient`), no padrão de
  `MultiModelConfig.java` — reaproveitam `modeloAnthropicComTimeout` já existente, mas com as
  opções do novo adaptador (tool forçada), não `opcoesAnthropic` genérico.
- **Orquestrador do bake-off**: reaproveita `EvalCandidateRunner` (já agnóstico de provider — só
  recebe um `ChatClient` de fora, `EvalCandidateRunner.java:40-45`) contra os 4 candidatos e as
  fixtures de candidato do F5 (`src/test/resources/eval/plan-generation/candidato/`). Roda o grader
  determinístico (`EvalDeterministicGrader`, já existe) e o juiz-LLM (`EvalLlmJudge`, rubrica
  completa) contra a resposta de cada candidato.
- **Juiz fixo**: o `EvalLlmJudge` do bake-off é sempre construído sobre um `ChatClient` GPT-4o
  dedicado (não um dos 4 candidatos) — decisão registrada na conversa que abriu esta change. Motivo
  duplo: (1) mitiga self-enhancement bias (MT-Bench) entre os 2 candidatos Claude e o juiz; (2) é
  pré-requisito técnico do probability-weighted scoring abaixo, que só existe no módulo OpenAI do
  Spring AI (confirmado por decompilação do JAR local — `AnthropicChatOptions` e todo o módulo
  `spring-ai-anthropic` 1.1.6 não têm nenhuma referência a logprobs).
- **Confiabilidade do juiz sem calibração** (aplicada a `EvalLlmJudge`/`EvalJudgeSchemaBuilder`,
  usado tanto no gate contínuo de PR quanto no bake-off):
  - CoT auto-gerado antes da nota (form-filling, G-Eval): o schema do juiz ganha um campo de
    justificativa por eixo, preenchido antes da nota, não depois.
  - Reference-guided grading (MT-Bench): para eixos que exigem raciocínio (progressão de carga,
    segurança/risco de lesão), o juiz é instruído a formular seu próprio critério/resposta de
    referência antes de comparar com o plano avaliado, em vez de julgar "a cru".
  - Probability-weighted scoring (G-Eval): `score = Σ p(sᵢ)·sᵢ`, usando os logprobs do próprio
    `ChatResponse` do juiz (`ChatGenerationMetadata.get("logprobs")`, confirmado disponível via
    `OpenAiChatOptions.logprobs`/`topLogprobs`) em vez da nota discreta bruta do schema — reduz o
    "variance collapse" que G-Eval documenta (juiz convergindo sempre pro mesmo dígito).
- **Relatório do bake-off**: tabela markdown por candidato — nota do grader determinístico, nota do
  juiz (ponderada), p50 de latência, custo/plano em USD (via `EvalCostCalculator`, já existe) —
  decisão por qualidade → latência → custo, nessa ordem (critério já definido no roadmap).
- **`llm-pricing.yml`**: corrige `claude-sonnet-4-6` → `claude-sonnet-5` (stale — o modelo atual do
  ambiente é `claude-sonnet-5`, ver system prompt/model IDs correntes); adiciona a entrada do
  sucessor OpenAI quando o candidato for decidido (Open Question).
- **Rollout do vencedor**: atualiza `MultiModelConfig`/`app.llm.routing.plano` para o modelo
  vencedor, mantendo `gpt-4o` disponível para rollback. Mecanismo de flag **por tenant** citado no
  roadmap não tem infraestrutura hoje neste backend (nenhuma classe `FeatureFlag`/`FeatureToggle`
  encontrada) — decidir na implementação se essa change adiciona a primeira, ou se o rollout inicial
  é global com flag por tenant como follow-up (Open Question).

### Fora de escopo

- Upgrade para Spring AI 2.0 / `outputSchema` nativo (exige Spring Boot 4 — change de plataforma
  própria, já registrada como fora do "agora" no roadmap).
- Tool calling de leitura de dados do atleta (avaliado e descartado em `add-llm-tool-use`/roadmap —
  overhead, fora do escopo aqui).
- Calibração do juiz contra julgamento humano (`EvalJudgeCalibration`, `MINIMO_CASOS = 20`) —
  continua dependendo de volume real de coach, não desta change.
- RAG e personalização por metodologia do coach (F7) — dependem do bake-off decidido, não o
  contrário.

## Critérios de aceite

- **CA1** — Given os 4 candidatos configurados como `ChatClient` (`gpt-4o`, sucessor OpenAI,
  `claude-sonnet-5`, `claude-haiku-4-5`), When o orquestrador do bake-off roda contra as fixtures de
  candidato do F5, Then produz uma tabela com nota do grader determinístico, nota do juiz-LLM
  ponderada, p50 de latência e custo/plano, por candidato.
- **CA2** — Given os 2 candidatos Claude, When o adaptador de schema estruturado monta a tool
  forçada com `input_schema` = schema v2, Then a resposta desserializa no mesmo
  `PlanoSemanalLlmDto` que os candidatos OpenAI produzem, sem `if (provider == ...)` no grader —
  provado por um teste que roda o mesmo grader contra uma resposta OpenAI e uma resposta Claude
  sintéticas equivalentes.
- **CA3** — Given o juiz fixo GPT-4o, When avalia qualquer um dos 4 candidatos (inclusive quando o
  candidato também é `gpt-4o`), Then o `ChatClient` usado para julgar nunca é o mesmo usado para
  gerar a resposta do candidato — provado por teste que injeta `ChatClient`s distintos (mock) e
  verifica qual foi chamado em cada papel.
- **CA4** — Given a rubrica do juiz atualizada, When avalia uma fixture, Then a nota inclui um
  campo de justificativa não vazio por eixo (CoT), e o score final é a média ponderada por
  `p(sᵢ)` via logprobs do `ChatResponse` — provado por teste que injeta uma distribuição de
  logprobs sintética e assere que o score pondera, não trunca no inteiro do schema.
- **CA5** — Given os 4 candidatos avaliados, When o vencedor é escolhido pelo critério
  qualidade → latência → custo, Then `llm-pricing.yml` e `app.llm.routing.plano` refletem o
  vencedor, com `gpt-4o` continuando disponível como rota de rollback (não removida).

**Gate:** eval do vencedor ≥ baseline (`gpt-4o`) em qualidade (nota do grader determinístico +
juiz), com latência p50 ≤ 15s.

## Métrica de sucesso

**Antes:** o modelo de geração de plano (`gpt-4o`) nunca foi comparado objetivamente contra
alternativas — decisão herdada, não medida.
**Depois:** troca de modelo (se houver) é decidida por uma tabela reprodutível do harness de eval
(F5), não por preferência; qualquer reavaliação futura (novo modelo, novo provider) reusa o mesmo
orquestrador em vez de amostragem manual.

## Open Questions & Assumptions

- **Em aberto**: qual é exatamente "o sucessor atual da OpenAI na mesma faixa" — o roadmap não fixa
  um model ID. Decidir na implementação, com base no que estiver disponível/estável no momento de
  rodar o bake-off; se nenhum sucessor claro existir, o bake-off roda com 3 candidatos
  (`gpt-4o`, `claude-sonnet-5`, `claude-haiku-4-5`) e a 4ª vaga fica registrada como follow-up.
- **Em aberto**: mecanismo de rollout do vencedor por tenant. Não existe infraestrutura de feature
  flag neste backend hoje — decidir se esta change constrói a primeira peça (mínima: coluna/config
  por tenant) ou se o rollout inicial é global, com segmentação por tenant como follow-up separado.
- **Assumido**: o juiz fixo GPT-4o introduz um viés residual assimétrico — ele pode favorecer os 2
  candidatos OpenAI (mesma família do juiz) sobre os 2 candidatos Claude, mesmo sem ser o candidato
  avaliado (self-enhancement bias documentado no MT-Bench se estende a "mesma família", não só
  "mesmo modelo exato"). Esta change não neutraliza esse viés (um juiz cruzado por família dobraria
  a complexidade do orquestrador); ele fica documentado no relatório do bake-off como limitação
  conhecida, para quem ler a tabela não tratar a nota do juiz como neutra entre providers.
- **Assumido**: probability-weighted scoring (CA4) só se aplica ao juiz (sempre OpenAI); não se
  aplica à geração do candidato em si, que continua sendo avaliada pelo grader determinístico
  (sem logprobs) e pela nota discreta do juiz transformada em contínua.
