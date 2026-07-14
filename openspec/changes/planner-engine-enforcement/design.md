# Design — planner-engine-enforcement (parte 2/2: skeleton vinculante)

## Contexto

A parte 1 (`deterministic-planner-engine`) deixou pronto: `PlannerEngine` completo em `domain/planner`, `SkeletonComplianceChecker` puro em `domain/compliance` (com `checkPreRedistribution`/`checkPostRedistribution`), migration V54, shadow mode coletando distribuicao de fases, taxa de review, violacoes hipoteticas e divergencia planner x formatter. Esta parte liga o enforcement.

Referencias (estado atual):
- `services/helper/PlanoResilienceService.java:42-71` — `gerarComResiliencia(gerar, validar, promptBase)`, `MAX_TENTATIVAS=2`; retenta a geracao do LLM quando `validar` lanca excecao
- `services/impl/IaServiceImpl.java:309-361` — chama `gerarComResiliencia` com `validarENormalizarPlanoGerado` como `validar` (apos `refactor-iaservice-decomposition`: `PlanoLlmValidator`)
- `services/impl/PlanoServiceImpl.java:163-284` — `persistirPlanoCompleto` -> `obterTreinosParaPlano` -> `redistribuicaoHelper.redistribuirTreinos` (sem retry)
- `skills/prescription/WeeklyDistributionSkill` — alocacao deterministica de dias, 353 linhas, testada, **zero callers de producao**
- `services/helper/ZonaTreinoService`, `services/helper/PaceZoneCalculator` — zonas FC (Friel/LTHR) e pace (com ajuste por TSB) ja calculadas e injetadas no prompt

## Decisao 1 — Estagio 1 dentro do retry existente

`checkPreRedistribution` roda **dentro** da funcao `validar` passada a `planoResilienceService.gerarComResiliencia(...)`, lado a lado com a validacao estrutural existente. Cobre o que independe do dia final: fase, sessionCount, TSS total +-10%, teto de longo, sessoes intensas, sessao pesada 48-72h antes de prova (na posicao gerada), constraints duras, e — novo nesta parte — aderencia dos treinos aos `SessionSlot` (tipo e TSS por slot).

Violacao lanca a **mesma excecao** que `validarENormalizarPlanoGerado` ja lanca (`LLMException`), com as `PlannerViolation` serializadas no feedback estruturado do retry — o LLM recebe o que violou. Nenhum mecanismo paralelo de resiliencia.

Ponto de insercao: `PlanoLlmValidator` (pos-refactor) ou `IaServiceImpl.geraPlanoSemanalAvancado` (pre-refactor — confirmar com o usuario antes, ver proposal Impact). O checker permanece puro em `domain/compliance`; o wrapper que converte `List<PlannerViolation>` em excecao + metrica vive na camada de service.

## Decisao 2 — Estagio 2 pos-redistribuicao, terminal

Apos `redistribuicaoHelper.redistribuirTreinos` retornar em `PlanoServiceImpl`, `checkPostRedistribution` roda sobre o plano persistivel. Cobre so o que a redistribuicao pode ter quebrado: dias permitidos, sessao pesada perto de prova apos reposicionamento, taper/race-week.

**Sem retry** — o LLM ja nao esta em escopo; retenta-lo custaria uma geracao inteira nova, fora do padrao de resiliencia existente. Violacao e terminal e segue a matriz fail-open (Decisao 3).

Risco herdado registrado na parte 1 (design Decisao 17): `obterTreinosParaPlano:274` passa `LocalDate.now()` proprio a redistribuicao; divergencia de relogio num job que atravessa meia-noite pode gerar falso positivo/negativo no check de dia. Mitigacao nesta change: o wrapper do estagio 2 recebe o mesmo `referenceDate` do snapshot e o usa nos checks; a redistribuicao em si nao e alterada (fora de escopo).

## Decisao 3 — Matriz fail-open (dois pontos de falha distintos)

Flags: `planner-engine.enabled=false` default; `planner-engine.fail-open=true` default inicial.

| Falha | fail-open=true | fail-open=false |
|---|---|---|
| Planner antes do LLM | pipeline legado + `planner.fallback_legacy.count` | erro de dominio |
| Estagio 1 esgota retry (`MAX_TENTATIVAS=2`) | pipeline legado inteiro (sem skeleton) + `compliance_status=FALLBACK` | erro de dominio antes de persistir |
| Estagio 2 falha | persiste plano novo com `compliance_status=FAILED` + `requiresCoachReview=true` | erro de dominio, nada persistido |

Estagio 2 **nunca** reusa o fallback do estagio 1 — nao ha como "voltar" ao pipeline legado depois que o plano novo foi gerado e redistribuido. `compliance_status` final = pior resultado entre os estagios (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`).

O caminho "estagio 2 falha com fail-open=true" (persistir `FAILED` + `requiresCoachReview=true`)
so e aceitavel porque **esta change entrega a superficie de review** (Decisao 8): o coach ve o
plano marcado com os motivos. Sem essa superficie, o gate seria auditoria morta — achado [alto]
do pre-mortem cross-model (Codex, 2026-07-14).

## Decisao 4 — SessionSlot prescritivo absorvendo a WeeklyDistributionSkill orfa

O `SessionSlot` (record da parte 1) ganha, nesta parte, preenchimento completo pelo `PlannerEngine`:

- **`diaSemana`** — alocacao deterministica com as regras da `WeeklyDistributionSkill` (hoje orfa): longao ancorado no dia preferido/inferido (`inferirDiaPrioritarioLongo` ja e deterministico), treinos intensos nunca adjacentes, leves preenchem, descanso respeitado. A logica e **movida/absorvida** para `domain/planner` (nao chamada via skill — o registry de skills nao pode virar dependencia do nucleo); a skill original e aposentada ou vira wrapper fino (decidir na implementacao).
- **`tssAlvo`** — reparticao do `WeeklyLoadTarget.targetTss()` por slot: `duracao x IF^2 x 100/60`, IF da tabela de intensidade por tipo de treino. Tolerancia por slot +-20% (calibravel com dado do shadow).
- **`zonaFc` / `faixaPace`** — referencia das zonas ja calculadas (`ZonaTreinoService`/`PaceZoneCalculator`), incluidas no slot para o compliance validar (a *fonte* continua sendo os services existentes; o slot so carrega o recorte da semana).

Consequencia no prompt: o bloco mandatorio passa a listar os slots (dia, tipo, TSS, zonas); o LLM preenche a estrutura fina de cada slot e os textos. Consequencia no compliance: estagio 1 valida tipo/TSS por slot; estagio 2 valida que o dia final == dia do slot (a redistribuicao no modo SEMANA_ATUAL ja ignora o dia do LLM — com slots, ela passa a receber os dias do skeleton como alvo em vez de recalcular do zero; mudanca minima no `RedistribuicaoTreinoHelper`, so a origem do dia-alvo).

## Decisao 5 — PeriodizacaoPromptFormatter vira renderer (fim da duplicacao)

Na parte 1, o `PeriodizationPlanner` duplicou temporariamente a logica de fase do formatter, com metrica de divergencia. Nesta parte:

1. o formatter para de calcular fase/TSS-alvo/step-back/tipo de semana;
2. passa a renderizar exclusivamente `WeekPlanSkeleton`/`WeeklyLoadTarget` como texto de prompt;
3. a metrica `planner.phase.divergence.count` e removida (nao ha mais duas fontes);
4. a classe **nao e apagada** — `migrate-plan-prompt-to-skills` decide seu destino final (skill de periodizacao consumindo o skeleton).

**Gate de rollout mensuravel (CA11 — achado [medio] do pre-mortem cross-model):** `enabled=true`
em ambiente compartilhado exige taxa de divergencia de fase
(`planner.phase.divergence.count / planner.generated.count`, shadow da parte 1) **<= 2%** numa
janela de **>= 2 semanas** com **>= 30 planos gerados**. Divergencias acima do threshold exigem
explicacao caso a caso registrada no `tasks.md` (divergencia alta = regra transcrita errado em um
dos lados). Metrica indisponivel ou amostra insuficiente = gate reprovado — **fail-closed**, nao
liga. Medicao e veredito registrados na task 8.4 antes de qualquer flip.

## Decisao 6 — Batch: falha de compliance e erro individual

`coach-batch-plan-generation` processa cada atleta isolado em virtual threads com erro individual no `BatchPlanJob`. O enforcement segue o contrato: violacao irrecuperavel apos retry vira erro individual sanitizado ("Plano violou restricoes de seguranca" — detalhe tecnico so no log estruturado), lote continua, status `CONCLUIDO_COM_ERROS`. Metricas com `batch=true/false`.

## Decisao 7 — Alinhamento template x schema

O template (`plano-treino-otimizado-claude.txt`) declara "3-7 treinos" e "minimo 7 etapas p/ intervalado"; o schema (`IaServiceImpl.buildSchemaTightInlineOrDefs`) impoe 3-5 treinos e `minItems: 2`. Como esta change reescreve o bloco de contrato do prompt (slots), alinha os textos pelo schema (fonte da verdade). Sem mudanca de comportamento do schema — so o texto para de prometer o que o schema nao aceita.

## Decisao 8 — Superficie minima de review (achado do pre-mortem cross-model)

`fail-open=true` no estagio 2 persiste um plano que o sistema **sabe** estar violado; a flag
`requiresCoachReview` so cumpre o ADR-3 (gate estrutural, nao sugestao) se alguem a ve. Escopo
minimo, nesta change:

1. **DTO da visao do coach** expoe `plannerComplianceStatus`, `plannerRequiresCoachReview` (colunas
   V54 ja persistidas) e um resumo legivel das `PlannerViolation` extraido do
   `planner_metadata_json` — leitura apenas, nenhuma escrita nova.
2. **Aba de plano do coach:** badge "Revisao obrigatoria" + motivos quando
   `requiresCoachReview=true` ou `compliance_status=FAILED`. Componente de apresentacao; logica no
   hook/adapter (convencao do repo front).
3. **Nenhum fluxo novo de aprovacao** — o coach age pelas ferramentas existentes (editar/regerar/
   aprovar). Fila/filtro dedicado de planos marcados e follow-up pos-rollout.
4. **Visao do atleta intacta** — o gate de consumo do atleta continua sendo o fluxo de aprovacao
   existente.

## Observabilidade

- `planner.compliance.failure.count{reason,phase,stage}` (stage=PRE/POST);
- `planner.retry.count{reason}`;
- `planner.fallback_legacy.count{reason}`;
- `planner.generated.count` ganha tag `enforced=true/false`.

Logs estruturados: `atletaId`, `tenantId`, `plannerVersion`, `phase`, `skeletonHash`, `stage`, `batchJobId` quando existir.

## Fora de escopo

- "Prescription stamping" (carimbar `tsbInicio/Fim`, `fcAlvo`, `ritmoAlvo`, agregados no pos-processamento e remover do contrato LLM) — change candidata separada
- Gerador deterministico da estrutura fina do treino (etapas de intervalado por template parametrico) — v2
- Fila/filtro dedicado de planos marcados para review — a superficie minima (badge + motivos na
  aba de plano do coach) entra nesta change (Decisao 8); a gestao em lote fica pos-rollout
- Alterar a logica interna do `RedistribuicaoTreinoHelper` alem da origem do dia-alvo
- Recalibracao automatica apos `SugestaoCoach.REJECTED` (v2)
