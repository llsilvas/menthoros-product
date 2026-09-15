## Correção de escopo (DoR rodada 3 — Codex, confirmado, 2026-09-15)

A rodada 3 validou a separação em duas famílias (rodada 2) como arquiteturalmente sólida — "o
isolamento candidato está sustentado" — mas achou 2 gaps remanescentes na fixture de **auditoria**,
menores que os das rodadas anteriores (não exigem nova arquitetura, só fechar 2 lacunas):

1. **[Confirmado] Proveniência de `AthleteZones` na auditoria v2.** `IaServiceImpl:307-308` monta
   `AthleteZones` a partir de `Atleta.getFcMaximaCalculada()/getFcLimiarCalculada()/getPaceLimiar()`
   — dados **atuais** do atleta no momento da geração. §1.5 (grader de concordância) dizia "monta a
   partir do perfil do atleta salvo na fixture" sem que a task 1.2 realmente capturasse esse perfil.
   Além disso, mesmo capturando, o valor é sempre "atual à extração", não "como era na geração
   original" — se o atleta atualizou o limiar depois, a resolução diverge por motivo alheio ao
   plano. **Fix:** a fixture de auditoria passa a capturar um snapshot de `AthleteZones` no momento
   da extração, **rotulado explicitamente como aproximação** (mesma categoria de limite já aceito
   para "sem histórico de edição por campo") — documentado em Open Questions, não escondido.
2. **[Confirmado] Rubrica do juiz pede contexto que a auditoria não fornece.** Julgar "progressão"
   exige o histórico de treino do atleta, que a fixture de auditoria não carrega (só a resposta e o
   plano persistido). Uma resposta bem escrita mas incoerente com o histórico real passaria sem
   penalidade. **Fix:** em modo auditoria, o eixo "progressão" (e qualquer eixo de
   segurança/lesão, se a task 2.1 expandir para 6) fica marcado **N/A** na tabela — só o modo
   candidato (que tem `ContextoTreino` completo e controlado) julga a rubrica inteira.

## Correção de escopo (DoR rodada 2 — pre-mortem Codex + `spec-reviewer`, confirmados, 2026-09-15)

A rodada 1 corrigiu 3 bloqueadores (ver histórico abaixo), mas a rodada 2 (Codex + `spec-reviewer`,
independentes, mesma conclusão) achou que a correção do "modo candidato" ainda não fechava: **o
ledger não retém o que seria preciso para reconstruir uma geração histórica**.

- `PlannerShadowService.persistirAuditoria:338-344` só grava `planner_skeleton_hash` (hash) e um
  resumo (`PlannerAuditMetadata`) — o `WeekPlanSkeleton` completo nunca é persistido em lugar
  recuperável.
- `List<Constraint>` nunca é persistida — `tb_llm_call` só guarda `prompt_hash` (`V94:24`), não o
  prompt/regras em si.
- `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`:217`) chama
  `treinoHistoricoProvider.prepararContexto(atleta)` internamente, que consulta 3 repositórios ao
  vivo com `LocalDate.now()` como referência (`TreinoHistoricoProvider.java:49-74`) — não aceita uma
  data histórica por parâmetro. Reconstruir o prompt "de fora" sem substituir esse colaborador volta
  a acessar o banco e usa a janela de hoje, não a da geração original.
- O único precedente que resolve isso no código é `PlanoPromptArquetipos` +
  `PlanoTreinoPromptBuilderGoldenTest` (`src/test/java/.../services/prompt/`): monta o builder
  manualmente (fora do Spring), mocka só `TreinoHistoricoProvider`, injeta um `ContextoTreino`
  pronto e uma data congelada — mas isso só é possível quando **quem monta a fixture controla o
  contexto desde o início** (sintético), não quando tenta recuperá-lo de uma geração já acontecida.

**Fix (arquitetural, não outro patch): duas famílias de fixture, cada uma com um job que os dados
disponíveis realmente sustentam.**

1. **Fixtures de auditoria** (reais, extraídas do ledger, 40-60 casos): só carregam o que o ledger
   de fato retém — `response_json` histórico + `schema_version`/`prompt_version` + o plano final
   persistido. Alimentam **só** os graders que não precisam de skeleton/constraints/`ContextoTreino`
   histórico: **juiz-LLM** (avalia o texto da resposta) e **grader de concordância** (compara
   resposta vs. plano final). Job: medir saúde/drift do que já está em produção.
2. **Fixtures de candidato** (sintéticas, reproduzíveis, estendem os 5 arquétipos já existentes em
   `src/test/resources/golden/plano-prompt/`): montadas do zero com o mesmo wiring de
   `PlanoPromptArquetipos`/`PlanoTreinoPromptBuilderGoldenTest` — builder manual, `ContextoTreino`
   controlado, data congelada, `WeekPlanSkeleton`/`ComplianceContext`/`AthleteConstraints`
   construídos frescos (não recuperados). Alimentam o **grader determinístico completo**
   (`PlanQualityChecker` + `SkeletonComplianceChecker`, com as `Constraint`/skeleton que o próprio
   fixture constrói) e o **juiz-LLM**. Job: testar se um prompt/schema/modelo candidato — o código
   **atual do checkout** — produz planos conformes e bons, respondendo de fato à pergunta do CA5.

Nenhuma família tenta fazer o trabalho da outra. O grader de concordância nunca roda contra
candidato (não existe "plano final do coach" para um caso sintético que nunca foi de verdade
aprovado). O grader determinístico nunca roda contra auditoria (não há como reconstruir
constraints/skeleton históricos sem inventar dado que o sistema não guarda).

**Histórico da rodada 1** (já corrigido, mantido pela relevância): harness original só gradava
resposta histórica sem nunca reexecutar o prompt candidato (fixava o problema que a rodada 2 achou
mais profundo do que a rodada 1 percebeu); fixture original não carregava `Constraint`/
`WeekPlanSkeleton`; desserialização ignorava `schema_version`. A ideia de "modo candidato" da
rodada 1 sobrevive — só que agora usa fixtures sintéticas construídas do zero, não uma tentativa de
reconstruir contexto real do ledger.

## Correção de escopo (DoR rodada 3, achado 2 — `spec-reviewer`, confirmado, 2026-09-15)

`SkeletonComplianceChecker.checkPreRedistribution` exige `GeneratedPlanSnapshot`, não
`PlanoSemanalLlmDto` — a versão anterior deste design (§1.4/1.6) descrevia uma chamada que não
compila. Existe, porém, o método público que produção já usa exatamente para isso:
`PlannerShadowService.checkPreRedistribution(PlanoSemanalLlmDto planoGeradoPeloLlm, WeekPlanSkeleton
skeleton, Atleta atleta, LocalDate semanaInicio)` (`services/helper/PlannerShadowService.java:203-213`,
chamado por `IaServiceImpl:349-350`) — monta `ComplianceContext`/`AthleteConstraints` internamente
via `resolverConstraints(atleta)` e mapeia o DTO para `GeneratedPlanSnapshot`.

**Fix: o grader determinístico reaproveita esse método público, não uma reconstrução própria de
`GeneratedPlanSnapshot`/`ComplianceContext`.** Consequência aceita: `AthleteConstraints` fica com o
mesmo escopo pobre que produção usa hoje (só `diasDisponiveis`; `maxSessoesPorSemana`/
`duracaoMaximaMinutos`/`equipamentoIndisponivel` sempre vazios) — mas isso é uma vantagem para um
harness de eval, não uma limitação: testa exatamente o caminho de integração real, não uma versão
hipoteticamente mais rica que produção nunca exercita. O `Atleta` sintético já é construído pela
fixture de candidato para montar o prompt (§1.2/1.5) — passar o mesmo objeto para
`checkPreRedistribution` é reaproveitamento direto, sem trabalho novo.

## §0 — Estado real do código (confirmado através de 2 rodadas de DoR, 2026-09-15)

- **`tb_llm_call`** (`V94__Create_tb_llm_call.sql:9-39`): `response_json JSONB`, `cost_usd`,
  `schema_version`, `generation_request_id`. Não guarda prompt/constraints/skeleton.
- **`tb_plano_semanal.generation_request_id`** (`V95:8-15`): join, nada copiado.
- **Não existe histórico de edição do plano** — só estado atual das tabelas.
- **`PlannerShadowService.persistirAuditoria:338-344`**: só `planner_skeleton_hash` (hash) e
  `PlannerAuditMetadata` (resumo) — skeleton completo não é recuperável.
- **`PlanoTreinoPromptBuilder.PromptGerado`** (`:419`): `record PromptGerado(String system, String
  user, List<Constraint> regras)` — as `Constraint` usadas no prompt **já saem junto** da chamada de
  montagem; não precisam ser inferidas separadamente quando quem constrói o contexto é o próprio
  runner de eval (fixtures de candidato).
- **`PlanoTreinoPromptBuilder.buildOptimizedPrompt`** (`:211-217`): assinatura completa —
  `Atleta, PlanoMetaDados, Prova provaAlvo, LocalDate inicioSemana, List<DiaSemana> diasEfetivos,
  DecisaoProgressao, RevisaoSemanal, WeekPlanSkeleton, boolean usaV2` — chama
  `treinoHistoricoProvider.prepararContexto(atleta)` internamente (repositórios ao vivo,
  `LocalDate.now()`). Fixtures de candidato fornecem todos esses parâmetros diretamente (como
  `PlanoPromptArquetipos` já faz), sem passar pelo Spring nem pelo provider real.
- **`SessionResolver.resolverPlano(PlanoSemanalLlmDtoV2, AthleteZones)`**
  (`services/helper/SessionResolver.java:55`): `AthleteZones` é um record de 3 campos
  (`fcMaxima`, `fcLimiar`, `paceLimiar`) — monta-se trivialmente a partir do perfil do atleta da
  fixture, sem depender de `ContextoTreino`.
- **`PlanQualityChecker.check(PlanoSemanalLlmDto, List<Constraint>)`** e
  **`SkeletonComplianceChecker.checkPreRedistribution(GeneratedPlanSnapshot, WeekPlanSkeleton,
  ComplianceContext)`**: assinaturas confirmadas. `ComplianceContext` inclui `AthleteConstraints` +
  `ProvaSnapshot` + datas — construído fresco pelas fixtures de candidato, junto do skeleton.
- **Convenção de golden fixtures**: `src/test/resources/golden/plano-prompt/` — 5 arquétipos
  (`avancado-tsb-baixo`, `com-lesao-ativa`, `iniciante-sem-lesao`, `sem-dados`,
  `taper-semana-prova`), `system.txt`, `*.sha256`, `PlanoPromptArquetipos.java` com datas
  congeladas. É a base das fixtures de candidato — estendida, não recriada do zero.
- **Nenhum profile Maven de runner sob demanda existe hoje.** `pom.xml` só tem `docker` e
  `openapi-docs`.

## §1 — Fatia 1: Fundação (2 famílias de fixture + runner 2 modos + graders correspondentes)

### 1.1 Fixtures de auditoria (reais, ledger)

`EvalFixtureExtractor`: lê `tb_llm_call` join `tb_plano_semanal` via `generation_request_id`,
filtra `result = SUCCESS`, estratifica por arquétipo/cold-start/veredito do coach. Grava por
fixture: `respostaHistorica` (`response_json` + `schema_version` + `prompt_version`),
`planoFinalPersistido` (snapshot de `tb_plano_semanal`/`tb_treino_planejado`) e `zonasAtleta`
(snapshot de `AthleteZones` — `fcMaxima`/`fcLimiar`/`paceLimiar` do atleta **no momento da
extração**, rotulado como aproximação, não histórico exato — correção da rodada 3) + labels. **Não**
tenta capturar constraints/skeleton — essa é a correção da rodada 2: o extractor só grava o que o
ledger de fato retém ou pode ser lido como snapshot atual razoável.

`EvalPiiRedactor` (idade, prova, cidade/clube, ao lado de `redigirNome`) roda sobre os dois blocos
de texto livre antes de gravar. 40-60 fixtures em
`src/test/resources/eval/plan-generation/auditoria/<arquetipo>-<n>.json` + `manifest.sha256`.

**Teste de CA1**: `EvalPiiRedactor` rodado sobre fixtures reais extraídas (não só JSON sintético
isolado), assere ausência de PII nos dois blocos.

### 1.2 Fixtures de candidato (sintéticas, estendem `golden/plano-prompt/`)

Novo `EvalCandidateFixtures` (classe de teste/apoio, não runtime de produção): para cada um dos 5
arquétipos existentes — reaproveitando `PlanoPromptArquetipos` tal como está — monta também um
`WeekPlanSkeleton`/`ComplianceContext`/`AthleteConstraints` frescos (mesma construção que
`PlannerEngineGoldenSetTest` já demonstra) para os casos com `planner-engine.enabled=true`.
Adiciona os parâmetros que faltavam na tentativa da rodada 1: `provaAlvo`, `diasEfetivos`,
`decisaoProgressao`, `revisaoConsumida` — todos já definidos nos arquétipos synteticos existentes,
só precisam ser expostos ao runner de eval em vez de ficarem internos ao teste golden.

Não precisa de anonimização (dado sintético desde a origem).

### 1.3 Runner Maven `-Peval` — dois modos, agora mapeados 1:1 às famílias de fixture

Profile novo, `@Tag("eval")` excluído por padrão do surefire, incluído só sob `-Peval`.

- **Modo auditoria** (default): carrega fixtures de `.../auditoria/`, roda **juiz-LLM** +
  **grader de concordância** contra `respostaHistorica`.
- **Modo candidato** (`-Dmodo=candidato`): monta o `PlanoTreinoPromptBuilder` manualmente (fora do
  Spring, mesmo padrão de `PlanoPromptArquetipos`), mockando `TreinoHistoricoProvider` para devolver
  o `ContextoTreino` congelado de cada fixture de candidato, chama `ChatClient` +
  `LlmJsonSchemaBuilder` (v1 ou v2, pela flag do arquétipo) com o **código atual do checkout**,
  produz uma resposta nova, roda **grader determinístico** (`PlanQualityChecker` com
  `PromptGerado.regras()` + `SkeletonComplianceChecker` quando há skeleton) + **juiz-LLM** contra
  ela.

Tabela final: uma seção por modo (colunas diferentes, porque os graders aplicáveis diferem), custo
calculado em memória via `LlmPricingRegistry.precoDe` sobre o `Usage` de cada chamada real (juiz +
candidato), não por soma pós-hoc no ledger.

### 1.4 Grader determinístico (só modo candidato)

`EvalDeterministicGrader`: desserializa a resposta candidata pelo shape que o código atual produz
(v1 direto, v2 via `SessionResolver.resolverPlano` com `AthleteZones` montado do perfil do
arquétipo — mesmo dispatch por `schema_version` da rodada 1, agora aplicado só aqui). Chama
`PlanQualityChecker.check(plano, regras)` com as `Constraint` que **o próprio
`PlanoTreinoPromptBuilder.PromptGerado.regras()`** devolveu na mesma chamada — nunca inferidas à
parte. Quando o arquétipo tem skeleton, chama
`PlannerShadowService.checkPreRedistribution(plano, skeleton, atleta, semanaInicio)` — o método
público que produção usa (não uma reconstrução própria de `GeneratedPlanSnapshot`/
`ComplianceContext`, ver Correção de escopo acima) — reaproveitando o mesmo `Atleta` sintético já
montado para o prompt em 1.2. `MeterRegistry` isolado (`SimpleMeterRegistry` descartável) só onde
`PlanQualityChecker` de fato o exige — `SkeletonComplianceChecker`/`PlannerShadowService` não
dependem de métrica.

`WeeklyFocusConsistencyChecker` segue fora do escopo (assinatura de outra feature).

**Teste de CA2**: fixture de candidato v1 e v2 avaliadas produzem o mesmo conjunto de violações que
uma chamada direta aos checkers com os mesmos `regras`/`skeleton` produziria.

### 1.5 Grader de concordância (só modo auditoria) — dispatch por `schema_version` preservado

`EvalAgreementGrader`: para `respostaHistorica` com `schema_version=schema-v2`, resolve via
`SessionResolver.resolverPlano` (com o `zonasAtleta` congelado na fixture — aproximação "atual à
extração", não histórico exato, rótulo explícito na task 1.2) antes de comparar contra
`planoFinalPersistido`; para v1, compara direto. % de campos estruturais divergentes, sem
atribuição de causa (limite conhecido).

## §2 — Fatia 2: Grader LLM-juiz (roda nos dois modos)

`EvalLlmJudge`: chamada real com rubrica fixa. Em modo auditoria, avalia `respostaHistorica`; em
modo candidato, avalia a resposta nova gerada em 1.3. Mesmo mecanismo nos dois casos — o juiz não
precisa de constraints/skeleton, só do texto/JSON da resposta.

**Correção da rodada 3:** o eixo "progressão" (e qualquer eixo de segurança/lesão, se a task 2.1
expandir a rubrica para 6) exige histórico de treino do atleta para ser julgado com sentido — a
fixture de auditoria não carrega isso (só resposta + plano persistido), então em **modo auditoria**
esses eixos ficam marcados **N/A** na tabela, e a nota geral do juiz nesse modo é só sobre os eixos
observáveis a partir da resposta isolada (clareza, polarização, especificidade-para-a-prova quando a
prova está no `planoFinalPersistido`). Em **modo candidato**, o `ContextoTreino` congelado da
fixture dá o histórico completo — a rubrica roda inteira, sem eixo N/A.

**Decisão de eixos (task 2.1):** 4 originais (progressão, polarização, especificidade, clareza) ou
6 (+ exequibilidade de carga, + segurança/lesão — nota do `product-reviewer`, GO).

**Calibração (CA3) — status separado por modo (achado da rodada 4 de DoR, Codex):** 20 das fixtures
de auditoria recebem nota humana de um coach real, validando a **rubrica reduzida** que o modo
auditoria usa (sem progressão/segurança, marcados N/A ali). Isso **não** calibra a rubrica completa
que o modo candidato julga (progressão + segurança incluídos, com `ContextoTreino` disponível) — são
avaliações diferentes, uma não valida a outra. Por isso:
- Coluna do juiz em **modo auditoria**: "NÃO CALIBRADO" se concordância < 16/20 nos 20 casos.
- Coluna do juiz em **modo candidato**: sempre marcada **"NÃO CALIBRADO"** nesta primeira versão —
  não há avaliação humana da rubrica completa com contexto sintético ainda. O checklist do PR (CA5)
  instrui a não usar a nota isolada do juiz em modo candidato como evidência de aprovação;
  calibrar o candidato com contexto sintético fica como melhoria futura (documentado em Open
  Questions), não bloqueia esta change.

Aviso, nunca bloqueio de build nos dois casos.

**Custo:** calculado em memória via `LlmPricingRegistry.precoDe` sobre o `Usage` de cada chamada,
não por correlação pós-hoc no ledger.

## §3 — Fatia 3: Gate de PR

Sem grader novo — a "fatia 3" original (concordância) já está em §1.5, fatia 1, porque não depende
de nada da fatia 2. Fatia 3 fica só com o fechamento do gate:

**Gate de PR (CA5):** linha no Delivery Checklist do `CLAUDE.md` do backend exigindo a tabela do
**modo candidato** na descrição da PR quando o diff toca `resources/prompts/**`, `dto/llm/**` ou
`llm-pricing.yml`. Enforcement automatizado fica como Open Question (fora de escopo).

## §4 — Superfícies não tocadas (garantir zero regressão)

- `IaServiceImpl.geraPlanoSemanalAvancado`/`PlanoResilienceService` — modo candidato monta
  `PlanoTreinoPromptBuilder` manualmente pelo runner de eval, nunca via `IaServiceImpl`; pipeline de
  produção não é invocado em nenhum modo.
- `PlanQualityChecker`/`SkeletonComplianceChecker`/`SessionResolver`/`PlanoTreinoPromptBuilder` —
  reaproveitados por chamada direta, zero linha alterada.
- Testes existentes — `-Peval` exclui por padrão `@Tag("eval")`; `./mvnw clean verify` sem `-Peval`
  roda exatamente o que roda hoje.
