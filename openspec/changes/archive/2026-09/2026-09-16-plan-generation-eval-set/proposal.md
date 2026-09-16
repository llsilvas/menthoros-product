**Tamanho:** M · **Trilha:** Full

## Correção de escopo (DoR rodada 1 — pre-mortem Codex, 2026-09-15)

O pre-mortem cross-model (`codex exec`) rejeitou a primeira versão deste proposal (**NOT READY**,
5 bloqueadores). Verificados contra o código antes de aceitar, 3 procederam como falhas reais de
arquitetura, corrigidas em `design.md` (seção "Correção de escopo" no topo):

1. **A versão original nunca reexecutava o prompt/schema candidato** — gradava só a resposta
   histórica congelada no ledger. Mudar o prompt não muda esse JSON, então o gate (CA5) aprovaria
   qualquer regressão sem nunca testá-la. **Fix:** o runner ganha um "modo candidato" que reconstrói
   o prompt a partir de um contexto de entrada congelado e chama a LLM de verdade com o código atual
   do checkout — é esse modo, não o de auditoria, que o gate exige.
2. **A fixture original não carregava o que os checkers precisam** — `PlanQualityChecker` exige
   `List<Constraint>`, `SkeletonComplianceChecker` exige `WeekPlanSkeleton`; nenhum dos dois vem do
   `response_json`. **Fix:** a fixture agora congela também `constraintsAtivas` e `skeleton`.
3. **Desserialização ignorava schema v2** — uma fixture com `schema_version=schema-v2` tem
   `response_json` no shape de blocos, não de etapas; desserializar direto para
   `PlanoSemanalLlmDto` falha. **Fix:** o grader despacha por `schema_version`, reaproveitando
   `SessionResolver` para v2 antes dos checkers.

Os outros 2 achados eram reais mas menores (redação de PII não cobria o snapshot do plano final;
texto do CA3 prometia mais enforcement do que o design entregava) — corrigidos sem mudar
arquitetura.

## Correção de escopo (DoR rodada 2 — Codex + `spec-reviewer`, confirmados, 2026-09-15)

A correção da rodada 1 não fechou de verdade: **o ledger não retém o que seria preciso para
reconstruir uma geração histórica.** `WeekPlanSkeleton` completo nunca é persistido (só um hash,
`PlannerShadowService.persistirAuditoria:344`); `List<Constraint>` nunca é persistida;
`PlanoTreinoPromptBuilder.buildOptimizedPrompt` consulta repositórios ao vivo com `LocalDate.now()`
internamente (`:217`), não aceitando uma data histórica por parâmetro. Duas revisões independentes
(Codex e `spec-reviewer`) chegaram à mesma conclusão de forma convergente.

**Fix arquitetural (não outro patch): duas famílias de fixture, cada uma fazendo só o que os dados
disponíveis sustentam de verdade.**

- **Fixtures de auditoria** (reais, ledger, 40-60 casos): alimentam só **juiz-LLM** +
  **grader de concordância** — os dois únicos graders que não precisam de constraints/skeleton
  histórico. Job: medir saúde/drift do que já está em produção.
- **Fixtures de candidato** (sintéticas, estendem os 5 arquétipos já existentes em
  `src/test/resources/golden/plano-prompt/`, mesmo wiring de `PlanoPromptArquetipos`/
  `PlanoTreinoPromptBuilderGoldenTest`): alimentam o **grader determinístico completo**
  (`PlanQualityChecker` + `SkeletonComplianceChecker`, com constraints/skeleton construídos frescos,
  não recuperados) + **juiz-LLM**. Job: testar se um prompt/schema/modelo candidato — o código atual
  do checkout — produz planos conformes e bons. É esta família, não a do ledger, que responde à
  pergunta do CA5/CA6 ("essa mudança piorou?").

Ver `design.md` para o detalhe técnico completo; os dois artefatos convergiram nesta versão depois
de 2 rodadas de DoR.

## Correção de escopo (execução da task 1.3, 2026-09-15) — volume real disponível é menor que o assumido

A premissa "há geração em produção e o ledger (F0) fornece o dataset" (SPRINTS.md, nota da Camada C
reaberta) assumia volume suficiente para 40-60 casos. O ambiente disponível para extração (homelab)
tinha, na prática, **3 chamadas no ledger no total e apenas 1 com join válido em
`tb_plano_semanal`** — não sustenta o número original. Decisão: aceitar o volume real disponível
agora (1 fixture de auditoria commitada), sem bloquear a change por isso — a fatia 1 do grader
determinístico (fixtures de candidato, sintéticas) não depende deste número e continua entregando
valor completo. O número-alvo de fixtures de auditoria fica "o que houver disponível", reavaliado
quando mais uso real acumular (produção ou um ambiente com mais volume). CA1 ajustado para não
travar num número fixo.

## Correção de escopo (DoR rodada 3 — Codex + `spec-reviewer`, confirmados, 2026-09-15)

A rodada 3 validou a separação em duas famílias (rodada 2) como arquiteturalmente sólida — "o
isolamento candidato está sustentado" (Codex) — e achou só 2 gaps mais estreitos, ambos corrigidos
sem reabrir arquitetura:

1. **Proveniência de zonas na auditoria v2**: a fixture de auditoria passa a congelar um snapshot de
   `AthleteZones` (fcMáx/fcLimiar/paceLimiar) **no momento da extração**, rotulado explicitamente
   como aproximação (não histórico exato) — necessário para o grader de concordância resolver
   respostas v2 via `SessionResolver`.
2. **Rubrica do juiz em modo auditoria**: o eixo "progressão" (e segurança/lesão, se expandido para
   6) exige histórico de treino que a fixture de auditoria não carrega — fica marcado **N/A** nesse
   modo; só o modo candidato (que tem `ContextoTreino` completo) julga a rubrica inteira.
3. **(`spec-reviewer`) Integração com `SkeletonComplianceChecker`**: a assinatura correta exige
   `GeneratedPlanSnapshot`, não `PlanoSemanalLlmDto` direto — corrigido para reaproveitar
   `PlannerShadowService.checkPreRedistribution(PlanoSemanalLlmDto, WeekPlanSkeleton, Atleta,
   LocalDate)`, o mesmo método público que produção já usa (`IaServiceImpl:349-350`), em vez de
   reconstruir `GeneratedPlanSnapshot`/`ComplianceContext` do zero.

Ver `design.md` para o detalhe completo de cada correção.

## Decisão de decomposição (2b)

**Mantida como uma change só**, sequenciada em 3 fatias internas que já formam um walking skeleton
(cada fatia entrega valor sozinha, a próxima só adiciona um grader):

1. **Fundação + grader determinístico** — extração/anonimização das fixtures do ledger, runner
   Maven `-Peval`, grader determinístico (reaproveita `PlanQualityChecker` +
   `WeeklyFocusConsistencyChecker` + compliance). Sozinha já produz uma tabela de eval executável.
2. **Grader LLM-juiz** — rubrica de coach validada por um coach real em 20 casos. É a fatia de
   maior incerteza de design (rubrica subjetiva, validação humana externa ao código).
3. **Grader de concordância com o plano final** + **gate de CI/PR**.

Justificativa para não abrir 3 changes: o próprio roadmap já dimensiona o conjunto em M (~15
tasks) — dividir em 3 changes de ~5 tasks cada é o anti-padrão "uma change por fatia trivial", e
adiciona 2 rodadas extras de proposal/DoR/QA/PR sem isolar risco que a sequência interna já isola.
F6 (`plan-llm-provider-bakeoff`) depende do conjunto completo (precisa dos 3 graders para comparar
candidatos de modelo com uma nota só), então fatiar em changes não adianta a dependência — só atrasa
a entrega do harness completo que F6 espera. Precedente: mesma decisão tomada em F4
(`semantic-session-schema`), confirmada pelo usuário.

## Why

`plan-generation-repair-turn` (F3) e `semantic-session-schema` (F4) mudaram como a LLM gera plano
duas vezes em duas semanas, cada mudança validada só por testes unitários/golden e julgamento manual
do desenvolvedor. Não há hoje nenhuma forma de responder, com número, "essa mudança de prompt/schema
piorou a qualidade do plano para atletas com lesão ativa?" ou "quantas gerações reais violam a
polarização recomendada?". O ledger (`tb_llm_call`, F0) já acumula gerações reais desde 2026-08 —
existe dado de produção suficiente para montar uma baseline, condição que a nota da Camada C
("REABERTA... quando houver uso real") marcava como pré-requisito e que já foi atingida.

Sem isso, toda mudança de prompt/schema/modelo (incluindo o já planejado F6 bake-off de modelo)
continua sendo avaliada por amostragem manual — lento, não reproduzível, e sem trilha auditável para
o coach ou para o time de produto confirmarem que uma mudança não piorou a experiência real.

**Beneficiário direto vs. indireto (nota do `product-reviewer`, GO):** o harness em si não toca
nenhuma tela do treinador — o beneficiário direto é o pipeline de qualidade/engenharia. O coach é
beneficiário indireto: sem essa instrumentação, uma regressão silenciosa de qualidade (plano pior
proposto pela IA) só aparece quando o coach edita mais e a confiança "a IA propõe algo bom" —
pré-condição do coach-in-the-loop funcionar sem virar trabalho extra — já erodiu, sem número que
mostre o porquê. O valor é "parar de arriscar a experiência do coach às cegas", não uma feature nova
para ele.

## What Changes

- **Fixtures de auditoria** (`src/test/resources/eval/plan-generation/auditoria/`): 40-60 casos
  reais extraídos de `tb_llm_call` (join em `generation_request_id` com `tb_plano_semanal`),
  estratificados por arquétipo do atleta, cold-start vs. atleta com histórico, e veredito do coach.
  Cada fixture congela **só o que o ledger de fato retém**: `response_json` histórico +
  `schema_version`/`prompt_version` + o plano final persistido — nada de constraints/skeleton
  (não existem retroativamente, ver Correção de escopo acima). Anonimização expande
  `LlmCallLedger.redigirNome` para cobrir idade, nome de prova, cidade/clube e todo texto livre da
  fixture (resposta + plano persistido).
- **Fixtures de candidato** (estendem os 5 arquétipos existentes em
  `src/test/resources/golden/plano-prompt/`, mesmo wiring de `PlanoPromptArquetipos`/
  `PlanoTreinoPromptBuilderGoldenTest`): sintéticas, reproduzíveis, com `WeekPlanSkeleton`/
  `ComplianceContext`/`AthleteConstraints` construídos frescos para os casos com
  `planner-engine.enabled`. Não precisam de anonimização (dado sintético).
- **Grader determinístico** (só roda contra fixtures de candidato): `PlanQualityChecker` com as
  `Constraint` que `PlanoTreinoPromptBuilder.PromptGerado.regras()` devolve na mesma chamada de
  montagem do prompt (nunca inferidas à parte) + `SkeletonComplianceChecker` quando há skeleton,
  despachando por `schema_version` (v2 via `SessionResolver` antes dos checkers).
  `WeeklyFocusConsistencyChecker` fica fora do escopo (assinatura de outra feature).
- **Grader LLM-juiz** (roda contra as duas famílias): chamada real à LLM com rubrica de coach
  (progressão, polarização, especificidade para a prova, clareza), validada comparando a nota do
  juiz contra o julgamento de um coach humano em 20 das fixtures de auditoria antes de confiar no
  juiz nos outros 20-40. **Nota do `product-reviewer` (GO, com ressalva):** faltam eixos de
  exequibilidade/realismo de carga e de segurança/gestão de lesão — decisão explícita na task 2.1:
  manter 4 eixos ou expandir para 6.
- **Grader de concordância** (só roda contra fixtures de auditoria): compara `response_json`
  histórico (via `SessionResolver` quando `schema_version=schema-v2`) contra o plano final
  persistido. **Limite assumido e documentado**: não existe histórico de edição por campo — a
  comparação é contra o snapshot atual, não contra um diff de "o que o coach mudou e por quê".
- **Runner Maven `-Peval`, dois modos mapeados 1:1 às famílias de fixture**: profile novo (não
  existe hoje nenhum runner sob demanda). **Modo auditoria** (default): juiz-LLM + concordância
  contra fixtures reais — saúde/drift do que já foi gerado em produção. **Modo candidato**
  (`-Dmodo=candidato`): monta o prompt manualmente (fora do Spring, wiring de
  `PlanoPromptArquetipos`) a partir das fixtures sintéticas, chama a LLM de verdade com o
  prompt/schema **atual do código no checkout**, roda grader determinístico + juiz-LLM contra a
  resposta nova — é este modo que de fato testa uma mudança antes do merge. Custo calculado em
  memória a partir do `Usage` de cada chamada real (não por soma pós-hoc no ledger).
- **Gate de PR**: nenhuma change que toca prompt/schema/modelo (arquivos sob `resources/prompts/`,
  `dto/llm/**`, ou rotas de `llm-pricing.yml`) mergeia sem a tabela do **modo candidato** colada na
  descrição do PR. Fase 1 é checagem manual documentada no `CLAUDE.md` do backend (checklist de PR);
  enforcement automatizado (CI bloqueando merge sem a tabela) fica fora de escopo — ver Open Questions.

## Critérios de aceite

- **CA1** — Given o ledger disponível com gerações reais, When o script de amostragem roda, Then
  produz **até 40-60** fixtures de auditoria (o que houver disponível no ambiente, sem bloquear por
  não atingir o número — achado da execução real de 2026-09-15: ambiente com 1 caso utilizável) —
  saída histórica + plano final persistido, sem constraints/skeleton (não existem retroativamente)
  — em `src/test/resources/eval/plan-generation/auditoria/`, cada uma rotulada com arquétipo,
  cold-start (sim/não) e veredito do coach, e **nenhum bloco da fixture** contém nome completo,
  idade exata, nome de prova ou cidade/clube do atleta original (verificado por revisão manual
  sobre a(s) fixture(s) real(is) extraída(s), não só um JSON sintético isolado).
- **CA2** — Given uma fixture de candidato v1 e uma v2 (estendendo os arquétipos de
  `golden/plano-prompt/`, com skeleton/`Constraint` disponíveis via `PromptGerado.regras()` e o
  `Atleta` sintético), When o grader determinístico roda em modo candidato, Then reporta as mesmas
  violações que `PlanQualityChecker.check`/`PlannerShadowService.checkPreRedistribution`
  reportariam com os mesmos `regras`/`skeleton`/`atleta` (o método público que produção já usa,
  não uma reconstrução própria de `GeneratedPlanSnapshot`) — para a fixture v2, após passar por
  `SessionResolver` (assertado por teste cobrindo os dois branches de `schema_version`).
- **CA3** — Given as 20 fixtures de auditoria escolhidas para calibração, When o grader LLM-juiz
  roda contra elas (rubrica **reduzida** — sem progressão/segurança, N/A em modo auditoria), Then a
  nota do juiz e a nota do coach humano concordam (mesmo quadrante: aprova/revisar/rejeita) em pelo
  menos 16/20 casos; abaixo disso, a coluna do juiz na tabela de auditoria é marcada "NÃO
  CALIBRADO". A coluna do juiz em **modo candidato** (rubrica completa, achado da rodada 4 de DoR)
  fica sempre "NÃO CALIBRADO" nesta versão — a calibração dos 20 casos não valida a rubrica
  completa — e o checklist do PR (CA5) instrui a não usar essa nota isolada como evidência de
  aprovação. O gate continua com decisão humana nos dois modos, nunca bloqueio automático.
- **CA4** — Given o profile `-Peval` em modo auditoria (default), When executado, Then roda
  juiz-LLM + grader de concordância contra as fixtures de auditoria e imprime uma tabela com nota
  por grader/fixture + custo total em USD (calculado em memória a partir do `Usage` de cada chamada
  real, zero se o juiz não estiver calibrado a ponto de rodar).
- **CA5** — Given uma PR que altera `resources/prompts/**`, `dto/llm/**` ou `llm-pricing.yml`, When
  o checklist do PR é seguido, Then a descrição da PR contém a tabela do **modo candidato** (CA6) da
  rodada mais recente (documentado no `CLAUDE.md` do backend, seção Delivery Checklist).
- **CA6** — Given o profile `-Peval -Dmodo=candidato` rodando numa branch que alterou
  `resources/prompts/**`/`dto/llm/**`, When executado, Then monta o prompt manualmente (fora do
  Spring, wiring de `PlanoPromptArquetipos`) a partir de cada fixture de candidato, chama a LLM real
  com o prompt/schema **do checkout atual**, roda grader determinístico + juiz-LLM contra a resposta
  nova, e a nota resultante difere da nota de uma execução anterior quando a mudança de fato altera
  o comportamento da LLM — provado por um teste que roda o modo candidato duas vezes contra a mesma
  fixture, com um prompt de teste deliberadamente alterado na segunda, e assere que as notas
  divergem.

## Métrica de sucesso

**Antes:** validar uma mudança de prompt/schema/modelo custa uma tarde de amostragem manual, sem
número reprodutível — F3 e F4 foram validadas assim.
**Depois:** `./mvnw -Peval verify` produz, em menos de X minutos (a medir na implementação), uma
tabela com nota objetiva por grader — tempo do coach/dev por decisão de "essa mudança piora a
qualidade?" cai de uma tarde de amostragem manual para a leitura de uma tabela.

## Open Questions & Assumptions

- **Assumido**: o "plano final editado pelo coach" comparável no grader de concordância é o estado
  atual de `tb_plano_semanal`/`tb_treino_planejado` — não existe histórico de edição por campo no
  banco (confirmado por busca no schema). Se o produto quiser medir "o que exatamente o coach mudou"
  em vez de "o plano final difere do que a LLM propôs", isso é uma change futura de auditoria de
  edição, fora de escopo aqui.
- **Assumido**: enforcement do gate de PR (CA5) é checklist documentado, não bloqueio automatizado
  de CI. Automatizar (ex. Actions comentando na PR quando o diff toca os paths sensíveis e a
  descrição não tem tabela) é natural mas não crítico para o valor do harness — decidir na
  implementação se cabe no mesmo PR ou vira melhoria incremental.
- **Em aberto**: quem é o "coach real" que valida as 20 fixtures de calibração do CA3 — precisa de
  um coach disponível (da assessoria fundadora?) antes da fatia 2 poder fechar. Sem isso, a fatia 2
  fica bloqueada em "grader implementado, não validado". **Ação recomendada pelo `product-reviewer`
  (GO)**: confirmar disponibilidade do coach *antes* de iniciar a fatia 2 (não antes de abrir a
  change — a fatia 1 entrega valor sozinha e não depende disso), para não descobrir a falta de coach
  com trabalho em andamento.
- **Em aberto**: budget de custo por rodada de eval — o juiz LLM faz chamada real por fixture, nas
  duas famílias; o modo candidato (o que roda por PR sensível, CA5) usa só as ~5-8 fixtures que
  estendem `golden/plano-prompt/`, bem menor que as 40-60 de auditoria — custo por PR deve ser
  pequeno, mas vale confirmar ordem de grandeza na implementação.
- **Assumido**: escopo de PII a redigir nas fixtures de auditoria (nome, idade, prova, cidade/clube)
  é suficiente para uso interno versionado em git privado — não é anonimização com garantia formal
  (k-anonimidade etc.), é a mesma bar já aceita para golden tests hoje. Fixtures de candidato são
  sintéticas e não precisam de redação.
- **Assumido (correção da rodada 2 de DoR)**: compliance de skeleton (`SkeletonComplianceChecker`)
  só é testável contra fixtures de candidato (sintéticas) — o `WeekPlanSkeleton` completo de uma
  geração real nunca é persistido (só um hash), então não há como auditar retroativamente se planos
  já em produção respeitaram o skeleton deles. Se o produto quiser essa auditoria real no futuro, é
  uma change separada que primeiro estende o ledger para persistir o skeleton completo — fora de
  escopo aqui.
- **Em aberto (correção da rodada 4 de DoR)**: a nota do juiz-LLM em modo candidato fica sempre "NÃO
  CALIBRADO" nesta versão — os 20 casos humanos de calibração validam só a rubrica reduzida de
  auditoria (sem progressão/segurança), não a rubrica completa que o candidato julga. Calibrar o
  candidato exigiria um segundo lote de avaliação humana sobre as fixtures sintéticas — decidir se
  vale o esforço fica para depois que o harness estiver em uso e o grader determinístico (que não
  depende de calibração) já estiver servindo de evidência primária do gate.
