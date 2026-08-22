# Proposal: ingestao-treino-realizado

**Tamanho:** L · **Trilha:** Full (11 caminhos de escrita migram para um seam; muda a semântica do PMC —
treino cancelado sai da carga — e exige backfill do histórico; backend-only, **sem migration** —
`tssCalculado` já existe na entidade)

## Status

- Proposta inicial (2026-08-22), derivada do `/improve-codebase-architecture` e fechada em sessão de
  `/grilling` com o founder — 12 decisões registradas em `design.md`.
- Product review (2026-08-22, `product-reviewer`): **GO**, com 3 achados incorporados nesta revisão:
  (1) D5 amplia para o Strava um gap de coach-in-the-loop **pré-existente** — o resultado da análise
  por IA é lido pelo atleta via `AnaliseWorkoutController:31` (`isAuthenticated()`) sem gate do
  treinador; o único filtro hoje é `percepcaoEsforco != null` no listener. Registrado em "Riscos" e
  como Open Question (guard de revisão do treinador é outra change). (2) O aviso "cancelados saem do
  PMC" estava só no PR; Open Question sobre superfície in-app. (3) Métrica "zero recálculos manuais"
  sem baseline — task 0.4 registra a contagem atual antes do deploy.
- Pre-mortem cross-model (2026-08-22, Codex, 1ª rodada): **needs-attention, 5 achados, todos
  confirmados e incorporados** — recálculo para a frente (D13: `atualizarTsbDia` deriva de D-1,
  então só o dia deixava o PMC stale); dedup compatível com o find-or-new do Strava (D4); TSS do
  dispositivo preservado (D3.1); "treino que conta" nos agregadores (D8); `deleteTreino` vazio →
  fora do escopo.
- **DoR em `/implement init` (2026-08-22): `spec-reviewer` READY COM RESSALVAS (3 achados) · Codex
  NOT READY (3 achados) → todos verificados no código e corrigidos.** Bloqueadores reais do Codex:
  o predicado "treino que conta" excluiria NULL (status não é setado em FIT/manual — corrigido para
  `IS NULL OR <> CANCELADO`); `reprocessar(treinoId)` não tinha parâmetro para a data anterior
  (corrigido: `reprocessar(treinoId, dataAnterior?)`); inventário da task 7.7 apontava
  `PlannerShadowService` quando a query real é `PlanoServiceImpl.getDadosPlano:720-724` (corrigido).
  Do `spec-reviewer`: rollback do backfill e dependência com `intervals-icu-activity-sync-scheduler`
  na tabela de Riscos; nota in-app do PMC virou task 6.2b. Ver design.md "DoR".

## Why

O **treino realizado** entra no sistema por **dez caminhos** (FIT, intervals.icu, Strava sync,
três lançamentos manuais, `updateTreino`, reconciliação manual, backfill de laps, webhook de
exclusão do Strava; `deleteTreino` existe na interface mas é um método vazio) e cada um reimplementa o pós-processamento por conta própria. O
resultado, verificado no código em 2026-08-22:

- **`tssCalculado` só é gravado em 2 dos 10 caminhos** (FIT e intervals.icu). `RaceProjectionServiceImpl:231`
  lê esse campo: para atletas de Strava ou lançamento manual, a **projeção de prova opera com
  histórico de carga vazio** em silêncio.
- **4 caminhos alteram o treino e não recalculam nada.** Backfill de laps muda o TSS (etapas têm
  precedência sobre FC/pace — `TssCalculatorService:469`), mas CTL/ATL do dia ficam congelados.
  `updateTreino`, reconciliação e webhook de exclusão idem.
- **Todo import retroativo deixa o PMC stale dali em diante.** `atualizarTsbDia(D)` deriva CTL/ATL
  de `MetricasDiarias(D-1)` (`TsbServiceImpl:85-86`); os caminhos que recalculam só recalculam o
  dia do treino, então um Strava de três dias atrás corrige D e deixa D+1..hoje errados.
- **Treino cancelado continua contando.** O webhook do Strava marca `StatusSincronizacao.CANCELADO`
  e mantém a linha; `TsbServiceImpl` não filtra por status.
- **`MetricasDiarias` tem dois escritores na mesma transação.** `TreinoServiceImpl.atualizarVolumeDiario:96`
  grava distância do treino e `+1`; `TsbServiceImpl.atualizarVolumeDiario:188` grava a soma do dia.
  Última escrita vence, e qual é a última depende de dois `LocalDate.now()` avaliados em momentos
  diferentes — à meia-noite divergem em um dia.
- **Duas fontes de verdade para o TSS.** O campo persistido e o recálculo ao vivo
  (`TsbServiceImpl:80`) usam o mesmo calculador, mas nada impede que divirjam — e já divergem por
  caminho de ingestão.
- **Deduplicação com três contratos.** `TreinoDedupHelper.saveIdempotent` é usado por 3 caminhos:
  FIT e icu abortam o pós-processamento se `inserted=false`; Strava ignora o resultado e faz merge.

Para o treinador, isso significa PMC e projeção de prova que discordam, carga inflada por treinos
que o atleta apagou, e métricas que só ficam certas depois de um recálculo histórico manual.

## What Changes

- **Novo módulo `IngestaoTreinoRealizadoService`** (`services/` + `services/impl/`), único dono do
  pós-processamento de um treino realizado, com duas operações:
  - `registrar(treino, externalId?)` — `tssCalculado` (preservando TSS de dispositivo) → save
    idempotente por `(atleta, externalId)` → `TreinoRegistradoEvent` (só em inserção) → recálculo
    da carga **de `dataTreino` até hoje**. Aceita entidade nova ou já gerenciada (quem precisa de
    merge no re-sync faz find-or-new antes, como o Strava já faz). Exige `dataTreino` não-nulo.
  - `reprocessar(treinoId, dataAnterior?)` — recarrega o treino, recalcula `tssCalculado` (se não é
    de dispositivo) e a carga **de `min(dataAnterior, dataTreino)` até hoje**; treino cancelado zera
    a contribuição. Não publica evento. `dataAnterior` é lida pelo chamador antes de mutar a
    entidade (não há como recuperá-la depois do save).
- **`TsbService.recalcularDesde(atletaId, data)`** — novo; recalcula dia a dia até o último dia
  materializado. É o gancho que `add-continuous-daily-load-management` precisa.
- **`tssCalculado` vira a única verdade.** `TsbService` passa a somar o campo dos *treinos que
  contam* em vez de recalcular; `TssCalculatorService` fica com um único chamador (o ingestor).
  TSS de dispositivo (`metodoCalculoTss = DISPOSITIVO`, FIT Garmin) é preservado — e passa a valer
  também no PMC, que hoje o ignora.
  Backfill único do histórico via `TsbService.recalcularHistoricoCompleto`, que passa a preencher o
  campo.
- **Treino que conta** = `statusSincronizacao IS NULL OR <> CANCELADO` (NULL é o estado normal de
  FIT/manual — nenhum desses caminhos define o campo hoje). Um predicado de repositório, usado pelo
  TSB **e pelos produtores que somam `tssCalculado`** (dashboard do coach, resumo semanal, projeção
  de prova, formatters de prompt, avaliador de risco de lesão, `PlanoServiceImpl.getDadosPlano`) —
  senão PMC e resumo semanal discordam.
- **`TsbService` é o único escritor de `MetricasDiarias`** — `TreinoServiceImpl.atualizarVolumeDiario`
  é removido.
- **Os 10 chamadores migram** para `registrar`/`reprocessar`. `TreinoDedupHelper` deixa de ser
  público. Fluxos manuais resolvem o default de data **uma vez**, com o `Clock` de `ClockConfig`,
  antes de chamar `registrar`.
- **`TreinoRegistradoEvent` em toda inserção**, independente da fonte (Strava e `addTreino` passam
  a publicar); guard de custo no `WorkoutAnalysisListener` para lote inicial de atleta recém-conectado.

### Fora do escopo (candidatos próprios do mesmo relatório)

- Merge de campos no re-sync de uma atividade já importada — continua no chamador que conhece o DTO
  da fonte (seam `ActivitySource`, candidato 4).
- Fuso horário do atleta e `Clock` nos demais módulos (candidato 7).
- Recálculo assíncrono (decidido: síncrono, na TX do chamador — ver design D1).
- Dias de descanso explícitos, prontidão e janela **futura** (`add-continuous-daily-load-management`);
  esta change só garante que o recálculo vá da data afetada até hoje.
- `deleteTreino` funcional — hoje é um método vazio; implementar remoção é outra change.
- Otimização do recálculo em carga inicial em lote (follow-up registrado em Riscos).

## Capabilities

### New Capabilities

- `ingestao-treino-realizado`: todo treino realizado, de qualquer fonte, entra no sistema pelo mesmo
  seam e produz as mesmas consequências — unicidade, TSS calculado, evento e carga do dia.

### Modified Capabilities

- `tsb-metricas` (carga diária): passa a derivar de `tssCalculado` persistido e exclui treinos
  cancelados.

## Critérios de aceite

- **CA1 — toda fonte grava TSS.** Given um treino realizado de qualquer `FonteDados` (FIT, STRAVA,
  INTERVALS_ICU, MANUAL), When `registrar` conclui, Then `tssCalculado` é não-nulo; se o treino
  trouxe TSS de dispositivo, esse valor é preservado; senão é igual ao que
  `TssCalculatorService.calcularTss` devolve.
- **CA2 — uma linha por externalId.** Given um treino já registrado com `(atleta, externalId)`,
  When `registrar` recebe uma entidade nova com o mesmo `externalId`, Then nenhuma segunda linha é
  criada, `inserted=false`, nenhum evento é publicado, e a carga reflete a linha existente.
- **CA2b — re-sync mescla.** Given o mesmo cenário, When o chamador faz find-or-new, mescla e passa
  a entidade gerenciada, Then o save é UPDATE, `inserted=false`, nenhum evento, e `tssCalculado` e
  a carga refletem os campos mesclados.
- **CA3 — carga do dia consistente.** Given um treino registrado no dia D, When `registrar` conclui,
  Then `MetricasDiarias(D).tss` é a soma de `tssCalculado` dos treinos que contam em D, e `volumeKm`
  e `treinosRealizados` refletem a mesma lista.
- **CA4 — evento só em inserção.** Given um treino novo, When `registrar` insere, Then exatamente um
  `TreinoRegistradoEvent` é publicado após o commit; Given `reprocessar` ou duplicata, Then nenhum.
- **CA5 — laps mudam a carga.** Given um treino registrado sem etapas, When etapas são adicionadas e
  `reprocessar` é chamado, Then `tssCalculado` e `MetricasDiarias(D)` refletem o TSS por etapas.
- **CA6 — data mudou, dois dias e tudo depois.** Given um treino em D1, When a data muda para D2 e
  `reprocessar` é chamado, Then `MetricasDiarias` de `min(D1,D2)` até o último dia materializado são
  recalculadas.
- **CA6b — retroativo propaga.** Given métricas materializadas de D até hoje, When um treino é
  registrado em D-3, Then CTL/ATL/TSB de D-3..hoje mudam de forma consistente (cada dia derivado do
  anterior).
- **CA7 — cancelado não conta.** Given um treino que conta em D, When ele vira `CANCELADO` e
  `reprocessar` é chamado, Then `MetricasDiarias(D..hoje)` não inclui seu TSS; `tssCalculado`
  permanece gravado. Given um treino FIT/manual com `statusSincronizacao` NULL, Then ele continua
  contando (NULL ≠ cancelado).
- **CA7b — cancelado não conta em lugar nenhum.** Given o mesmo treino, When o resumo semanal, o
  dashboard do coach e a projeção de prova são lidos, Then nenhum deles soma seu TSS (Bloco 2).
- **CA8 — data obrigatória.** Given um treino com `dataTreino` nulo, When `registrar` é chamado,
  Then falha com `DomainRuleViolationException` e nada é persistido.
- **CA9 — atomicidade.** Given uma falha no recálculo de carga, When `registrar` é chamado, Then o
  treino **não** fica persistido (a TX do chamador é revertida).
- **CA10 — tenant pela entidade.** Given um scheduler sem `TenantContext`, When `registrar` é chamado
  com um treino cujo atleta pertence ao tenant T, Then a carga é gravada em T.
- **CA11 — único escritor.** Given qualquer caminho de ingestão, When ele conclui, Then
  `MetricasDiarias` foi escrita apenas por `TsbService` (verificável por ausência de
  `metricasDiariasRepository.save` fora de `TsbServiceImpl`/`TsbRecalculoExecutor`).
- **CA12 — backfill.** Given o histórico com `tssCalculado` nulo, When
  `recalcularHistoricoCompleto` roda, Then todo treino que conta tem `tssCalculado` preenchido e o
  dataset de referência de `TsbRecalculoEquivalenciaIT` continua equivalente (exceto dias com
  treinos cancelados, que passam a excluí-los).

## Métrica de sucesso

- **Zero treinos que contam com `tssCalculado` nulo** após o backfill (query de verificação em
  stage), mantido em zero por 30 dias.
- **Projeção de prova deixa de devolver histórico vazio** para atletas Strava/manual — hoje 100%
  deles; meta 0%.
- Para o treinador: **nenhum recálculo histórico manual** disparado por inconsistência de PMC nos
  30 dias após o deploy. Baseline registrada na task 0.4 (contagem dos últimos 30 dias antes do
  deploy, via logs de `recalcularHistoricoCompleto`) — sem denominador a métrica não é comparável.

## Relação com outras changes

- **`add-continuous-daily-load-management`** (ativa, 0/21): pede "recálculo automático da janela
  afetada quando entra treino lançado, editado, importado ou sincronizado". Esta change entrega o
  **gancho único** (`registrar`/`reprocessar`) que aquela precisa; o recálculo de *janela* (dias
  seguintes, descanso explícito) continua lá. **Sequenciar esta antes.**
- **`first-party-ingestion-architecture`** (ativa, 0/23): desenha `CompletedWorkout` +
  `WorkoutImportService` como modelo **paralelo** a `TreinoRealizado`. Esta change trabalha sobre o
  modelo existente. Ao retomar aquela, o passo "save → evento" do `WorkoutImportService` deve
  terminar em `registrar`, não numa tabela própria — caso contrário nasce o 12º caminho. Registrado
  como dependência, não re-litigado aqui.
- **`refine-tss-tsb-precision`** (ativa, 0/45): muda a fórmula dentro de `TssCalculatorService` e
  propõe `TreinoConsistenciaValidator` "antes do TSS". Ortogonal: esta muda *onde* o cálculo é
  chamado, aquela *como* calcula. Com esta mergeada, o validador tem um lugar só para viver.
- **`intervals-icu-activity-sync-scheduler`** (em implementação): `IntervalsIcuActivityPersister` é um
  dos 10 chamadores; migra no Bloco 1 sem mudar o contrato do scheduler.

## Open Questions & Assumptions

- **Assumido:** `TssCalculatorService.calcularTss(treino)` é determinístico dado o treino e o atleta
  (limiares). Se limiares do atleta mudarem depois, `tssCalculado` fica desatualizado até um
  `reprocessar`/backfill — mesmo comportamento de hoje para FIT/icu; aceito.
- **Assumido:** `TreinoRealizado.tenantId` é sempre derivável da entidade no `@PrePersist`
  (atleta ou plano com assessoria). Verificado em `TreinoRealizado.java:241-246`.
- **Assumido:** o dataset de referência de `TsbRecalculoEquivalenciaIT` não contém treinos
  `CANCELADO` nem FIT com TSS de dispositivo; se contiver, o esperado muda e o dataset é atualizado
  com nota (task 0.2).
- **Aberto (pre-mortem #1):** custo de `recalcularDesde` na carga inicial em lote. Medir em stage;
  se pesar, o scheduler de lote chama `recalcularHistoricoCompleto` uma vez ao final (follow-up).
- **Resolvido (DoR, product review #2):** aviso in-app da mudança de PMC — nota simples na tela de
  PMC para tenants afetados pelo backfill; task 6.2b no Bloco 1.
- **Resolvido (DoR, spec-reviewer):** rollback do backfill — dump de `tb_metricas_diarias` antes de
  rodar em produção; stage antes de prod é obrigatório (task 6.2b).
- **Aberto:** valor do guard de custo no `WorkoutAnalysisListener` (ex.: não analisar treinos de
  importação inicial com mais de N dias). Decidir no Bloco 1 com base no volume real do Strava.
- **Aberto:** se `updateTreino` deve publicar evento quando muda de "sem etapas" para "com etapas".
  Decisão provisória: não — `reprocessar` nunca publica.
- **Aberto (product review #1):** com D5, atletas Strava passam a receber análise por IA visível sem
  revisão do treinador — gap que já existe para FIT/icu. Decidir se o guard de 4.4 também condiciona
  a visibilidade à revisão do treinador, ou se isso vira change própria (recomendação: change própria;
  esta não muda a autoridade do treinador, só a cobertura do sinal).
- **Aberto (product review #2):** o backfill muda CTL/ATL históricos de atletas com treinos
  cancelados acumulados. Aviso só no PR ou também in-app (nota na tela de PMC para tenants afetados)?
  Recomendação: nota in-app simples no Bloco 1, já que o sintoma parece bug para quem não leu o PR.
