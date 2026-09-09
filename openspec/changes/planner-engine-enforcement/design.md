# Design — planner-engine-enforcement (parte 2/2: skeleton vinculante)

## Contexto

A parte 1 (`deterministic-planner-engine`) deixou pronto: `PlannerEngine` completo em `domain/planner`, `SkeletonComplianceChecker` puro em `domain/compliance` (com `checkPreRedistribution`/`checkPostRedistribution`), migration V58, shadow mode coletando distribuicao de fases, taxa de review, violacoes hipoteticas e divergencia planner x formatter. Esta parte liga o enforcement.

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

## Decisao 2 — Estagio 2 apos TODAS as transformacoes, terminal

**Revisao DoR (2026-09-08, Codex blocker 4):** o estagio 2 roda **depois de todas as transformacoes
deterministicas que mexem em sessoes**, nao so a redistribuicao. Em particular, `PlanGenerationPersister`
executa `garantirProvasNaSemana` **apos** `redistribuirTreinos`, podendo inserir/mover sessoes e
invalidar contagem/TSS/slots que um check ancorado logo apos a redistribuicao teria aprovado. O gate
do estagio 2 e o **ultimo passo antes de persistir/aprovar/emitir eventos**, e revalida todas as
invariantes afetadas por qualquer transformacao (redistribuicao + prova-na-semana + demais ajustes).
Cobre: dias permitidos, sessao pesada perto de prova apos reposicionamento, taper/race-week, e a
coerencia dia/tipo/TSS por slot apos a inclusao de prova.

**Sem retry** — o LLM ja nao esta em escopo; retenta-lo custaria uma geracao inteira nova, fora do padrao de resiliencia existente. Violacao e terminal e segue a matriz fail-open (Decisao 3).

Risco herdado registrado na parte 1 (design Decisao 17): `obterTreinosParaPlano:274` passa `LocalDate.now()` proprio a redistribuicao; divergencia de relogio num job que atravessa meia-noite pode gerar falso positivo/negativo no check de dia. Mitigacao nesta change: o wrapper do estagio 2 recebe o mesmo `referenceDate` do snapshot e o usa nos checks; a redistribuicao em si nao e alterada (fora de escopo).

## Decisao 3 — Matriz fail-open (dois pontos de falha distintos)

Flags: `planner-engine.enabled=false` default; `planner-engine.fail-open=true` default inicial.

**Precedencia de invariantes obrigatorias (revisao DoR 2026-09-08, Codex blocker 2 + decisao conjunta
com `fix-cold-start-calibration-plan-generation`):** ha duas classes de violacao, e a classe governa
o comportamento **acima** do flag `fail-open`:

- **Obrigatoria (hard)** — um plano que viola isto **nao e revisavel** (estrutura quebrada). **Falha
  fechado sempre: 422, nada persistido — inclusive com `fail-open=true`.** Esta change **DEFINE a
  lista minima obrigatoria** a partir do que **ja e bloqueante hoje no codigo** (lanca `LLMException`
  em `IaServiceImpl`): estrutura de etapas por tipo (`validarEstrutura3Etapas`; intervalado
  `validarTreinoIntervalado` >= 6 etapas + balanceamento), `repeticoes == 1` (`validarRepeticoes`).
  O oraculo desses ja existe. `fix-cold-start-calibration-plan-generation` (§13) **ESTENDE** essa
  lista depois — promovendo checks hoje WARN (triangulo pace×distancia×duracao, soma-etapas×distancia)
  a obrigatorios —, sob aprovacao de produto. Ordem: enforcement primeiro (baseline), cold-start
  estende. **Esta change nao depende do rascunho do cold-start.**
- **Revisavel (soft)** — divergencia de fase, TSS fora de faixa, recomendacoes de qualidade,
  distribuicao. Seguem a matriz `fail-open` abaixo (persistir `FAILED` + `requiresCoachReview`).

| Falha | fail-open=true | fail-open=false |
|---|---|---|
| Planner antes do LLM | pipeline legado + `planner.fallback_legacy.count` | erro de dominio |
| Estagio 1 esgota o orcamento — contagem ou deadline (ver Decisao 3b) | erro de dominio (422), **sem nova geracao** (o orcamento ja foi consumido pelo estagio 1) | erro de dominio antes de persistir |
| Estagio 2 falha — violacao **soft** | persiste plano com `compliance_status=FAILED` + `requiresCoachReview=true` | erro de dominio, nada persistido |
| Qualquer estagio — violacao **obrigatoria (hard)** | **422, nada persistido** (precedencia sobre fail-open) | 422, nada persistido |

Estagio 2 **nunca** reusa o fallback do estagio 1 — nao ha como "voltar" ao pipeline legado depois que o plano novo foi gerado e redistribuido. `compliance_status` final = pior resultado entre os estagios (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`).

## Decisao 3b — Orcamento unico de geracao por requisicao (revisao DoR, Codex blocker 1)

O `PlanoResilienceService` atual reinicia `MAX_TENTATIVAS` e o relogio (`DEADLINE_TOTAL`) **a cada
invocacao**. Como o fallback do estagio 1 chamaria o pipeline legado — que invoca `gerarComResiliencia`
de novo —, a composicao permitiria **ate 4 geracoes** numa requisicao, violando o limite de 2 acordado
(e que o cold-start reusa).

Contrato desta change (dona do orcamento):

1. **Orcamento com escopo de requisicao**, nao de invocacao: **no maximo 2** geracoes logicas por
   requisicao inteira (enforced + fallback + qualquer caminho legado contam no mesmo teto), com o
   relogio `DEADLINE_TOTAL` preservado entre as etapas — nao reiniciado pelo fallback.
2. **Debito antes da chamada** ao LLM, inclusive quando a chamada falha (uma resposta invalida ou uma
   falha de infra consomem tentativa).
3. **Depois que o estagio 1 roda, esgotar o orcamento (contagem de geracoes OU o relogio
   `DEADLINE_TOTAL`) ⇒ nenhuma nova geracao e iniciada ⇒ erro de dominio (422)**, tanto com
   `fail-open=true` quanto `false`. Como o "pipeline legado" tambem gera via LLM (nao ha plano legado
   deterministico sem LLM neste codigo) e o estagio 1 ja consumiu o orcamento, **nao ha fallback com
   geracao apos o estagio 1**. O `compliance_status=FALLBACK` fica reservado ao caso "planner falha
   **antes** do LLM" (matriz Decisao 3, 1ª linha): ali o pipeline legado e a **primeira e unica**
   geracao, dentro do orcamento.
4. Implementacao: tornar o orcamento um objeto/parametro passado a `gerarComResiliencia` (ou o
   service com escopo de requisicao), de forma que o cold-start **consuma o mesmo contador** sem criar
   um segundo. Detalhe mecanico fechado na implementacao; o **contrato** (1–3) e o que a spec exige.

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

## Decisao 4b — Composicao de sessoes por fase (RASCUNHO — fecha a lacuna da secao 2)

> A `WeeklyDistributionSkill` **redistribui sessoes que ja existem**; ela nao decide QUANTAS nem de
> QUAIS tipos. O `PlannerEngine` (hoje passa `sessions=List.of()`) precisa gerar os slots ANTES de
> alocar dia/TSS/zonas. Essa composicao nao estava especificada — rascunho abaixo, **requer aprovacao
> de produto** (⚠️) por ser prescricao. Principio: treino polarizado (~80/20), maioria aerobica facil,
> uma sessao-chave longa, sessoes duras crescendo por fase e **nunca adjacentes** (a alocacao ja
> garante o espacamento). Tipos = enum `TipoTreino` real; a sessao dura conta contra o orcamento de
> intensidade da fase.

- **`sessionCount`** = nº de dias disponiveis do atleta (`AthleteConstraints.diasDisponiveis`),
  **limitado** pelo teto da fase (evita overreaching). Piso 1 (o LONGO), exceto RECOVERY/POST_RACE.
- **Sessao-chave**: 1 `LONGO` por semana em BASE/BUILD/PEAK (o longao que a skill ancora no dia
  preferido); reduzido/omitido em TAPER/RACE_WEEK; ausente em RECOVERY/POST_RACE.
- **Orcamento de sessoes duras** (INTERVALADO/TIRO/TEMPO_RUN/SUBIDA/FARTLEK), por fase:

| Fase | sessionCount (teto) | Sessoes duras | Chave (LONGO) | Resto |
|---|---|---|---|---|
| BASE | dias disp. (≤6) | 0–1 (só TEMPO_RUN leve) | 1 | FACIL/CONTINUO/REGENERATIVO |
| BUILD | dias disp. (≤6) | 1–2 (INTERVALADO/TEMPO_RUN) | 1 | FACIL/CONTINUO |
| PEAK | dias disp. (≤6) | 2 (INTERVALADO + TEMPO_RUN/TIRO) | 1 | FACIL |
| TAPER | ≤4 | ≤1 (afiamento curto) | reduzido | FACIL/REGENERATIVO |
| RACE_WEEK | ≤3 | 0 | — | REGENERATIVO/FACIL + `PROVA` no dia |
| RECOVERY / POST_RACE | ≤3 | 0 | — | REGENERATIVO/FACIL |
| RETURN_TO_TRAINING | ≤4 | 0 | 1 (curto) | FACIL/CONTINUO |
| CALIBRATION | — | — | — | reservada ao cold-start (nao emitida aqui) |

- **`durationMinutes` por slot** deriva do TSS-alvo do slot e do IF do tipo (relacao inversa do TSS:
  `duracao = tss × 60 / (IF^2 × 100)`), coerente com a reparticao da Decisao 4.
- **Determinismo**: dada a mesma entrada (fase, dias, loadTarget, prova), a composicao e identica —
  requisito de golden set (task 2.5). Empates resolvidos por ordem canonica de dias/tipos.

**⚠️ Pontos de aprovacao de produto:** os tetos de `sessionCount` e o orcamento de duras por fase
(numeros da tabela) e se `SUBIDA`/`FARTLEK` entram no mix de BUILD/PEAK. Sem isso fechado, a secao 2
nao tem oraculo. Ajuste fino calibravel com o shadow (mesma porta 1 do rollout).

### Blockers do pre-mortem (Codex 2026-09-08) — resolver ANTES de implementar a secao 2

Este rascunho recebeu **NO-GO** do Codex; a direcao e plausivel, mas faltam regras executaveis e
seguras. A secao 2 fica **bloqueada** ate fechar (exige entrada de produto/ciencia do esporte, nao e
invencao do implementador):

1. **[BLOCKER] Repartição TSS×duração é circular** — `tss = duracao×IF²×100/60` e
   `duracao = tss×60/(IF²×100)` sao inversas uma da outra; nenhuma ancora. Definir primeiro **pesos ou
   duracoes independentes por slot**, normalizar ao alvo semanal, arredondamento e limites de duracao
   (min/max por tipo); se os limites inviabilizarem o alvo, dizer como reduzir a carga.
2. **[BLOCKER] Composição não-deterministica e inviavel** — faixas "0–1"/"1–2", "LONGO reduzido/
   omitido" e `sessionCount` maior que os dias (ex.: PEAK exige 3 com 2 dias) nao sao executaveis.
   Especificar **precedencia** (chave → duras → resto), reducao das duras conforme vagas, espacamento
   real (inclusive dias consecutivos e a fronteira domingo→segunda), e a saida quando faltam dias.
3. **[BLOCKER] `PROVA` sem contrato** — definir se conta no teto, se a carga entra no alvo semanal,
   como tratar prova fora dos dias disponiveis, e a recuperacao ao redor (zero duras nao pode tornar a
   prova "invisivel" a fadiga). Reservar data+carga da prova primeiro, compor o resto depois.
4. **[MAJOR] RETURN_TO_TRAINING nao pode depender so de disponibilidade** — frequencia/duracao devem
   depender da capacidade recente; LONGO opcional; regra conservadora sem historico.
5. **[MAJOR] Polarizacao nao e provada por contagem de tipos** — definir a metrica de ~80/20 (por
   tempo/carga em zona), intensidade explicita de "TEMPO_RUN leve"/CONTINUO, e recuperacao do LONGO.

Recomendacao: tratar a composicao por fase como **artefato de design proprio** (revisado com o
founder + shadow para calibrar), possivelmente uma sub-change; ate la, secoes 2–8 nao iniciam.

## Decisao 5 — PeriodizacaoPromptFormatter vira renderer (fim da duplicacao)

Na parte 1, o `PeriodizationPlanner` duplicou temporariamente a logica de fase do formatter, com metrica de divergencia. Nesta parte:

1. no caminho `enabled=true`, o formatter para de calcular fase/TSS-alvo/step-back/tipo de semana;
2. passa a renderizar exclusivamente `WeekPlanSkeleton`/`WeeklyLoadTarget` como texto de prompt;
3. **só a divergência dual-calc do formatter** (as duas fontes no caminho `enabled=true`) deixa de
   existir; a métrica de divergência do **shadow** (parte 1, independente do formatter, coletada
   também com `enabled=false`) é **preservada** — o gate de rollout depende dela — e só é aposentada
   após a promoção geral;
4. a classe **nao e apagada** — `migrate-plan-prompt-to-skills` decide seu destino final (skill de periodizacao consumindo o skeleton).

**Compatibilidade com CA9 (revisao DoR 2026-09-08, Codex major 6):** a virada do formatter para
renderer e **condicionada ao flag** `planner-engine.enabled`. Com `enabled=false`, o caminho de prompt
legado (formatter calculando fase/TSS/step-back) e preservado **sem alteracao observavel** — o
formatter mantem os dois modos ate a remocao do legado ser decidida em `migrate-plan-prompt-to-skills`.
Assim CA9 ("flag off preserva o legado") deixa de conflitar com a reescrita do bloco de contrato do
prompt: a reescrita so vale no caminho `enabled=true`. Alinhamento de textos template×schema (Decisao 7)
que nao muda comportamento pode valer nos dois modos.

**Gate de rollout mensuravel (CA11 — achado [medio] do pre-mortem cross-model; ampliado na revisao
DoR 2026-09-08, Codex major 5):** a divergencia de fase sozinha mede o acordo planner×formatter, **nao**
a qualidade dos novos slots (dia/TSS/zona) para atletas COM historico — que esta parte tambem passa a
prescrever. Por isso os criterios sao **repartidos entre duas portas** (nao todos como pre-condicao
de `enabled=true`), medidos **por coorte e por fase** em janela **>= 2 semanas** com **>= 30 planos
gerados**:

1. divergencia de fase (`planner.phase.divergence.count / planner.generated.count`) **<= 2%** — a
   unica disponivel ANTES de ligar (vem do shadow da parte 1);
2. `planner.compliance.failure` (estagio 1 e 2) e `planner.fallback_legacy` dentro de limiares
   **fixados**: retry < 15%, `FAILED` < 5%, fallback < 5% — só existem DEPOIS do piloto;
3. taxa de rejeicao/edicao do coach (`SugestaoCoach` MODIFIED/REJECTED) **nao pior** que o baseline
   pre-enforcement da mesma coorte — só existe DEPOIS do piloto.

Rollout **gradual em duas portas** (resolve o ovo-e-galinha: as metricas (2)/(3) so existem depois de
ligar para alguem, entao nao podem gatear a entrada no piloto):

- **Porta 1 — entrada no PILOTO (coorte restrita):** gated **apenas** na divergencia de fase do
  **shadow** (metrica da parte 1, disponivel com `enabled=false`) <= 2% + defaults seguros
  (`fail-open=true`). Nao exige as metricas de enforcement, que ainda nao existem.
- **Porta 2 — promocao GERAL:** gated nas metricas coletadas **durante o piloto** — criterios (2) e
  (3) acima, por coorte/fase, com os limiares **fixados** (nao "propostos"): retry < 15%, `FAILED`
  < 5%, fallback < 5%, e `SugestaoCoach` MODIFIED/REJECTED nao pior que o baseline.

Qualquer criterio da porta aplicavel acima do limiar, metrica indisponivel ou amostra insuficiente =
**fail-closed**, nao avanca; a evidencia por coorte e preservada antes de remover qualquer metrica.
Medicao e veredito na task 8.4 antes de cada porta.

## Decisao 6 — Batch: falha de compliance e erro individual

`coach-batch-plan-generation` processa cada atleta isolado em virtual threads com erro individual no `BatchPlanJob`. O enforcement segue o contrato: violacao irrecuperavel apos retry vira erro individual sanitizado ("Plano violou restricoes de seguranca" — detalhe tecnico so no log estruturado), lote continua, status `CONCLUIDO_COM_ERROS`. Metricas com `batch=true/false`.

## Decisao 7 — Alinhamento template x schema

O template (`plano-treino-otimizado-claude.txt`) declara "3-7 treinos" e "minimo 7 etapas p/ intervalado"; o schema (`IaServiceImpl.buildSchemaTightInlineOrDefs`) impoe 3-5 treinos e `minItems: 2`. Como esta change reescreve o bloco de contrato do prompt (slots), alinha os textos pelo schema (fonte da verdade). Sem mudanca de comportamento do schema — so o texto para de prometer o que o schema nao aceita.

## Decisao 8 — Superficie minima de review (achado do pre-mortem cross-model)

`fail-open=true` no estagio 2 persiste um plano que o sistema **sabe** estar violado; a flag
`requiresCoachReview` so cumpre o ADR-3 (gate estrutural, nao sugestao) se alguem a ve. Escopo
minimo, nesta change:

1. **DTO da visao do coach** expoe `plannerComplianceStatus`, `plannerRequiresCoachReview` (colunas
   V58 ja persistidas) e um resumo legivel das `PlannerViolation` extraido do `planner_metadata_json`.
   **Revisao DoR (2026-09-08, Codex blocker 3):** o `PlannerAuditMetadata` da parte 1 guarda hoje so
   contagem + motivo geral; esta change **persiste a lista estruturada de `PlannerViolation`** (motivo
   por violacao) no `planner_metadata_json` — mesma coluna, sem migration, so o conteudo JSON. Sem
   isso o badge nao tem o que mostrar.
2. **Aba de plano do coach:** badge "Revisao obrigatoria" + motivos quando
   `requiresCoachReview=true` ou `compliance_status=FAILED`. Componente de apresentacao; logica no
   hook/adapter (convencao do repo front).
3. **Nenhum fluxo novo de aprovacao** — o coach age pelas ferramentas existentes (editar/regerar/
   aprovar). Fila/filtro dedicado de planos marcados e follow-up pos-rollout.
4. **Visao do atleta intacta** — o gate de consumo do atleta continua sendo o fluxo de aprovacao
   existente.
5. **Veto a auto-aprovacao (revisao DoR 2026-09-08, Codex blocker 3):** hoje o `PlanGenerationPersister`
   decide aprovacao/estado olhando o skeleton, **sem** consultar o resultado final de compliance. Esta
   change torna obrigatorio: plano com `compliance_status=FAILED` ou `requiresCoachReview=true` **nunca**
   e auto-aprovado — entra `AGUARDANDO_REVISAO`, fora das consultas de "apenas aprovados", ate o coach
   agir. Editar/aprovar pelo fluxo existente reavalia o compliance e limpa o `requiresCoachReview` do
   plano resultante (o badge some quando o motivo deixa de existir).

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
