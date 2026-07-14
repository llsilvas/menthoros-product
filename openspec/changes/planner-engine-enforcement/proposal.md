**Tamanho:** M · **Trilha:** Full

> Full porque altera o pipeline de geracao de plano (skeleton no prompt, compliance com retry, novo caminho de falha terminal) atras de feature flag. Zero migration nova (V54 vem da parte 1). Frontend minimo: superficie de review para planos marcados (achado do pre-mortem cross-model, ver abaixo).

## Split (2026-07-14)

Parte 2 de 2 do que nasceu como `deterministic-planner-engine` (L). A parte 1 (`deterministic-planner-engine`, M) entrega o motor completo + `SkeletonComplianceChecker` como logica pura + shadow mode + auditoria V54 + nucleo `domain/`. **Esta parte torna o skeleton vinculante**: injeta no prompt, liga o compliance ao retry existente e transforma o `SessionSlot` em prescricao estrutural por sessao.

## Pre-mortem cross-model (Codex, 2026-07-14)

Dois achados incorporados:

1. **[alto] Plano `FAILED` persistido sem superficie de revisao.** Com `fail-open=true` (default),
   o estagio 2 persistia `compliance_status=FAILED` + `requiresCoachReview=true` sendo que a UI da
   flag estava adiada para pos-rollout — gate de auditoria morta, contradizendo o ADR-3 da parte 1
   (gate estrutural, nao sugestao). **Resolucao (decisao do founder): a superficie minima de review
   entra nesta change** — o coach ve o plano marcado, com destaque e motivos, na propria aba de
   plano (ver "Superficie minima de review" no What Changes e design.md Decisao 8). O fail-open do
   estagio 2 so e defensavel com essa superficie existindo.
2. **[medio] Gate de calibracao era prosa.** A pre-condicao de divergencia "proxima de zero" nao
   tinha threshold, janela, dono nem criterio bloqueante — dava para fechar CA1-CA10 e ligar
   `enabled=true` com calibracao ruim sem violar nada escrito. **Resolucao: CA11 formaliza o gate**
   (taxa <= 2% em janela >= 2 semanas com >= 30 planos, fail-closed sem metrica; design.md
   Decisao 5, task 8.4).

## Why

Com a parte 1 em shadow, o sistema **sabe** o que a semana deveria ser (fase, TSS-alvo, taper, risco) e **mede** quando o plano gerado viola isso — mas nao age. A auditoria de codigo (2026-07-14) mostrou por que agir importa:

1. **Conselho nao e contrato.** Hoje o Java calcula fase/TSS-alvo/teto de pace e serializa como texto no prompt, confiando que o GPT-4o obedeca. O `PlanQualityChecker` **so loga** violacoes — ate treino em dia indisponivel (`DIAS_PERMITIDOS`) e apenas medido.
2. **Decisoes ja determinizadas estao orfas.** `WeeklyDistributionSkill` (353 linhas, testada) resolve a alocacao de dias deterministicamente e **nao tem nenhum caller de producao**; `TrainingPrescriptionGuardSkill` idem. A redistribuicao (`RedistribuicaoTreinoHelper`) ja ignora o dia escolhido pelo LLM no modo SEMANA_ATUAL.
3. **TSS por sessao e inventado pelo LLM.** O TSS-alvo semanal e deterministico, mas a reparticao por treino nao — e a formula existe (`duracao x IF^2 x 100/60`).
4. **Calibracao primeiro, enforcement depois.** Os thresholds do motor terao rodado semanas em shadow (parte 1) antes de qualquer plano ser bloqueado por eles.

## What Changes

### Skeleton vira contrato no prompt

- Com `planner-engine.enabled=true`, `PlanoServiceImpl` chama `PlannerEngine.planWeek()` **antes** do LLM e o `WeekPlanSkeleton` entra no prompt como bloco mandatorio (mesmo padrao do bloco [1] de Constraints).
- **`PeriodizacaoPromptFormatter` vira renderer**: para de calcular fase/TSS-alvo/step-back e passa a renderizar a saida do planner. Remove a duplicacao temporaria da parte 1 e a metrica `planner.phase.divergence.count`. A classe **nao e apagada** (preserva o plano de `migrate-plan-prompt-to-skills`).

### Compliance em dois estagios, sem segundo mecanismo de retry

Ground truth (parte 1, design Decisao 4): `PlanoResilienceService.gerarComResiliencia` retenta a **geracao pelo LLM** (`MAX_TENTATIVAS=2`) quando a funcao `validar` lanca excecao; a redistribuicao roda **depois**, sem retry proprio. Por isso:

1. **Estagio 1 (pre-redistribuicao):** `SkeletonComplianceChecker.checkPreRedistribution` roda **dentro** da funcao `validar` passada a `gerarComResiliencia` (em `IaServiceImpl.geraPlanoSemanalAvancado` ou, apos `refactor-iaservice-decomposition`, em `PlanoLlmValidator`), junto com `validarENormalizarPlanoGerado`. Violacao lanca a mesma excecao ja usada, reaproveitando o retry existente.
2. **Estagio 2 (pos-redistribuicao):** apos `redistribuicaoHelper.redistribuirTreinos`, `checkPostRedistribution` roda sobre o plano persistivel. **Sem retry** — o LLM ja nao esta em escopo. Violacao e terminal: `compliance_status=FAILED`, `requiresCoachReview=true`, persiste ou bloqueia conforme `planner-engine.fail-open`.

### SessionSlot prescritivo (absorve a skill orfa)

O `SessionSlot` do skeleton (criado na parte 1) ganha prescricao estrutural por sessao:

- **dia da semana** — alocacao deterministica absorvendo a logica da `WeeklyDistributionSkill` orfa (longao no dia preferido/inferido, intensos nunca adjacentes, leves preenchem);
- **TSS-alvo por sessao** — reparticao do `WeeklyLoadTarget` semanal via `duracao x IF^2 x 100/60` (IF da tabela de intensidade por tipo);
- **zona FC e faixa de pace por slot** — referencia as zonas ja calculadas (`ZonaTreinoService`/`PaceZoneCalculator`), que o compliance passa a validar.

O papel do LLM colapsa para: preencher o conteudo de cada slot (estrutura fina do treino) + redigir os textos — exatamente o ADR-4 ("quanto e quando" deterministico, "o que" criativo).

### Flags e fallback operacional

- `planner-engine.enabled=false` default; `planner-engine.fail-open=true` default inicial.
- Falha do planner **antes** do LLM com `fail-open=true` -> pipeline legado + `planner.fallback_legacy.count`.
- Estagio 1 esgota retry: `fail-open=true` -> pipeline legado inteiro + `compliance_status=FALLBACK`; `fail-open=false` -> erro de dominio.
- Estagio 2 falha: `fail-open=true` -> persiste com `FAILED` + `requiresCoachReview=true`; `fail-open=false` -> erro de dominio, nada persistido. Nunca "volta" ao pipeline legado (o plano novo ja foi gerado e redistribuido).
- Batch: falha de compliance apos retry vira erro individual sanitizado no `BatchPlanJob` (`CONCLUIDO_COM_ERROS`), sem abortar o lote.
- Metricas novas: `planner.compliance.failure.count{reason,phase,stage}`, `planner.fallback_legacy.count{reason}`, `planner.retry.count{reason}`.

### Superficie minima de review (backend DTO + frontend)

Absorve o achado [alto] do pre-mortem cross-model — sem isso, `requiresCoachReview` seria flag
persistida que ninguem ve:

- **DTO da visao do coach** passa a expor `plannerComplianceStatus`, `plannerRequiresCoachReview`
  (ja persistidos pela V54) e um resumo legivel das `PlannerViolation` (extraido do
  `planner_metadata_json`).
- **Aba de plano do coach:** plano com `requiresCoachReview=true` ou `compliance_status=FAILED`
  ganha destaque visual (badge "Revisao obrigatoria") com os motivos das violacoes. **Sem novo
  fluxo de aprovacao** — reusa a superficie existente; o objetivo e o coach VER e agir, nao um
  workflow novo. Fila/filtro dedicado de planos marcados fica pos-rollout.
- **Visao do atleta: sem mudanca** (o fluxo de aprovacao existente ja e o gate de consumo).

### Correcao de divergencia template x schema (carona justificada)

O template diz "3-7 treinos" e "minimo 7 etapas p/ intervalado"; o schema impoe 3-5 treinos e `minItems: 2`. Como esta change reescreve o bloco de contrato do prompt, alinha os dois pelo valor do schema (fonte da verdade).

## Criterios de aceite

- **CA1 — Estagio 1 com retry existente:** violacao de fase/sessionCount/TSS/longo/intensidade/prova-na-semana antes da redistribuicao lanca a mesma excecao de `validarENormalizarPlanoGerado` e aciona `PlanoResilienceService` (`MAX_TENTATIVAS=2`); nenhum mecanismo paralelo de retry e criado.
- **CA2 — Compliance estrutural:** checker reprova plano que respeita TSS total mas viola dia do slot, long-run cap, prova na semana, taper ou intensidade maxima.
- **CA3 — Estagio 2 terminal:** se a redistribuicao move treino para dia indisponivel ou viola prova/taper, o check pos-redistribuicao falha sem retry e marca `FAILED` + `requiresCoachReview=true`.
- **CA4 — Matriz fail-open:** os 4 caminhos (estagio 1 esgotado x fail-open true/false; estagio 2 falho x fail-open true/false) se comportam conforme "Flags e fallback" e persistem o `compliance_status` correto (`PASSED`, `RETRIED_PASSED`, `FALLBACK`, `FAILED`).
- **CA5 — Formatter so renderiza:** `PeriodizacaoPromptFormatter` nao contem mais calculo de fase/TSS-alvo/step-back; renderiza exclusivamente a saida do planner; a metrica de divergencia da parte 1 e removida.
- **CA6 — Dia por slot respeitado:** com `enabled=true`, cada treino do plano final cai no dia do seu `SessionSlot`; a alocacao segue as regras absorvidas da `WeeklyDistributionSkill` (longao ancorado, intensos nao adjacentes).
- **CA7 — TSS por sessao:** cada treino fica dentro da tolerancia do TSS-alvo do seu slot; a soma respeita o alvo semanal +-10%.
- **CA8 — Batch isolado:** em lote, falha de compliance de um atleta vira erro individual sanitizado; demais atletas concluem; status `CONCLUIDO_COM_ERROS`.
- **CA9 — Flag off intacta:** com `enabled=false`, o pipeline e byte-a-byte o legado (shadow da parte 1 pode continuar ligado de forma independente).
- **CA10 — Prompt x schema alinhados:** template e JSON schema declaram os mesmos limites de treinos/etapas.
- **CA11 — Gate de rollout medido:** `enabled=true` em qualquer ambiente compartilhado exige taxa de divergencia de fase do shadow (`planner.phase.divergence.count / planner.generated.count`, metrica da parte 1) **<= 2%** em janela de **>= 2 semanas** com **>= 30 planos gerados**; divergencias acima do threshold exigem explicacao caso a caso registrada no `tasks.md`; metrica indisponivel ou amostra insuficiente = gate reprovado (**fail-closed** — nao liga). Medicao e veredito registrados na task 8.4 antes do flip.
- **CA12 — Superficie de review:** plano persistido com `requiresCoachReview=true` ou `compliance_status=FAILED` aparece com destaque e motivos na visao do coach; plano `PASSED` nao exibe destaque; visao do atleta inalterada.

## Metrica de sucesso

**North-star do par:** taxa MODIFIED/REJECTED das `SugestaoCoach` com PlannerEngine <= taxa sem ele, segmentada por `planner_version`, `planner_phase` e `compliance_status` (persistidos desde a parte 1). Sem esses metadados, a metrica nao e considerada implementada.

Guard-rail operacional: `planner.fallback_legacy.count` e `planner.compliance.failure.count{stage=POST}` abaixo de threshold acordado apos 2 semanas de `enabled=true` em staging — acima disso, recalibrar thresholds antes do rollout.

## Impact

- **Depende de (hard):** `deterministic-planner-engine` (parte 1 — motor, checker, V54, shadow calibrado)
- **Depende de (recomendado):** `refactor-iaservice-decomposition` mergeada — o estagio 1 e inserido em `PlanoLlmValidator` em vez do `IaServiceImpl` de ~1500 linhas. Se a ordem inverter, confirmar com o usuario antes de implementar a secao 4 das tasks.
- **Coordena com:** `migrate-plan-prompt-to-skills` — esta change reescreve o bloco de periodizacao do prompt e reduz `PeriodizacaoPromptFormatter` a renderer; quando a migracao chegar la, o skill de periodizacao consome `WeekPlanSkeleton` em vez de reimplementar a decisao. Recomendado nota de coordenacao no proposal de la antes de abrir branch (fora do escopo desta editar sem autorizacao).
- **Repos:** menthoros-backend + menthoros-front (superficie minima de review — badge e motivos na visao do coach). O follow-up de produto da superficie de review foi **absorvido nesta change** (achado do pre-mortem cross-model); fila/filtro dedicado de planos marcados permanece candidata pos-rollout.
- **Change candidata relacionada:** "prescription stamping" (XS/S — carimbar `tsbInicio/Fim`, agregados, `fcAlvo`/`ritmoAlvo` no pos-processamento, removendo-os do contrato do LLM). Complementar a esta; apos o refactor.

## Open Questions & Assumptions

- ✅ **Sem retry pos-redistribuicao** — decisao de arquitetura do replanejamento 2026-07-13 (validada contra `PlanoResilienceService` real)
- ✅ **SessionSlot prescritivo + absorcao da WeeklyDistributionSkill** — aprovado no split 2026-07-14
- **Tolerancia de TSS por sessao** — nasce como +-20% por slot (mais frouxa que os +-10% semanais); calibrar com dado do shadow antes do rollout
- **Destino da `WeeklyDistributionSkill` original** — absorvida a logica, a skill orfa e aposentada ou mantida como wrapper; decidir na implementacao com base no custo de manter o contrato de skill
