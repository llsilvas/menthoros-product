# Proposal: fix-tsb-rest-days-materialization

> **Precedência:** as seções "Revisões do pre-mortem" e "Mecânica transacional" do `design.md`
> (R1–R9) e o `tasks.md` **superam** o desenho A–D e os critérios 4, 5 e 8 abaixo onde divergirem:
> job **horário** (não 00:30), detecção por buraco (não `MAX(data)`), blocos de 400 dias (não pula),
> reparo por `recalcularDesde` com fim = hoje do atleta, gate `./mvnw clean verify`. Critérios
> adicionais: (9) recálculo atômico — falha no meio não altera linhas; (10) ingestão concorrente com o
> job nunca deixa métrica com TSS antigo; (11) gauge `tsb.atletas_defasados` = 0 após o job.

**Tamanho:** M · **Trilha:** Full (backend-only, sem migration e sem mudança de contrato — mas
introduz um **job agendado novo** que escreve em `tb_metricas_diarias` de todos os atletas
(cross-tenant por natureza), mexe no núcleo do cálculo CTL/ATL/TSB que alimenta PMC, home do atleta,
dashboard do coach e fila de atenção, e exige **reparo de dados em produção**. Pelos critérios do
`config.yaml`: incerteza de design + risco de integridade → Full.)

## Status

- Proposta inicial (2026-10-20). Origem: founder reportou o gráfico PMC do dashboard "com os dados
  desligados" (série em ilhas a partir de 30/09, com anotações "Sem dado no período" sobrepostas).
- Diagnóstico feito em código (ver "Por que"); confirmado pelo próprio dado: CTL de ~15 em 29/09 cai
  para 0,3 em 19/10 — impossível com τ = 42 dias, só acontece com reset a zero.

## Por que

O PMC lê `tb_metricas_diarias` (uma linha por atleta-dia) via
`AtletaProgressServiceImpl.getHistoricoPmc`. O front (`pmcChartModel.ts`) deliberadamente **não
inventa** valor para dia sem linha: marca `missing`, hachura o trecho e escreve "Sem dado no período".
O gráfico está desenhando fielmente um dado quebrado. A quebra está em como as linhas nascem:

1. **Ninguém materializa dias de descanso.** Uma linha só nasce quando um treino é ingerido:
   `TsbServiceImpl.recalcularDesde(atleta, dataTreino)` percorre de `dataTreino` até hoje e para.
   `processarDiasDescanso` existe, mas é código morto (sem caller de produção, como o próprio Javadoc
   de `atualizarTsbDia` registra). Não há `@Scheduled` que rode o TSB diariamente.
2. **O seed do dia é estritamente D-1, com fallback zero.** `TsbDiaPersister.buscarMetricasDiaAnterior`
   faz `findByAtletaIdAndData(atletaId, data.minusDays(1))`; sem linha, `obterCtlAnterior`/
   `obterAtlAnterior` devolvem `0.0`. Treino em 07/10 → linha em 07/10; nada em 08/10; treino em
   09/10 → procura 08/10, não acha, **CTL e ATL recomeçam do zero**. É a "ilha" do gráfico.
3. **Por que estava contínuo até 29/09:** aquele trecho é produto de um backfill
   (`recalcularHistoricoCompleto` percorre todos os dias em blocos). Dali em diante só rodou o
   caminho incremental. A entrada do pull do intervals.icu sobre cursor (`fix-sync-cursor-data-loss`,
   30/09) passou a alimentar treinos espaçados num fluxo que nunca soube lidar com dia sem treino —
   o defeito é anterior; o intervals.icu só o expôs.

Impacto no treinador: CTL/ATL/TSB errados em **tudo** que lê `tb_metricas_diarias` — PMC, faixa de
forma (`FaixaTsb`), ramp rate, home do atleta, diagnóstico e fila de atenção do coach. O coach decide
a semana olhando um atleta "destreinado" (CTL ≈ 0) que na verdade está em forma.

## O que muda

Backend (`apps/menthoros-backend`), em três camadas que se cobrem mutuamente:

- **A. `recalcularDesde` fecha o buraco para trás.** Se `findDataUltimaMetrica(atleta)` existe e é
  anterior a `data - 1`, o laço começa em `ultimaMetrica + 1`, não em `data`. Os dias de descanso
  entre o último treino e o novo nascem com TSS = 0 e estado carregado (decaimento correto).
- **B. Job diário de decaimento** (`TsbDecaimentoDiarioScheduler`, 00:30 America/Sao_Paulo): para
  cada atleta com métricas cuja última linha é anterior a ontem (fuso do atleta via
  `AtletaHojeResolver`), chama `recalcularDesde(atleta, ultimaMetrica + 1)`. Sem isso, o PMC só
  avança quando chega treino e a home mostra CTL/TSB de dias atrás.
- **C. Fallback defensivo no persister.** `buscarMetricasDiaAnterior` passa a buscar a **última linha
  anterior a `data`** (`findTopByAtletaIdAndDataBeforeOrderByDataDesc`) em vez de só D-1, aplicando
  o decaimento pelos dias de distância. Não substitui A/B — impede o reset a zero se algo escapar
  (ex.: recálculo parcial abortado em `recalcularHistoricoCompleto`).
- **D. Reparo dos dados** (operação, não código novo): após o deploy, `recalcularDesde(atleta,
  2026-09-30)` para os atletas afetados — com A em vigor, a chamada já reconstrói a sequência inteira.

## Fora de escopo

- Front (`pmcChartModel.ts`, `PMCChart.tsx`): continua **não inventando** valor para dia `missing`.
  A sobreposição das labels "Sem dado no período" é cosmética e desaparece com a causa; se voltar a
  aparecer em outra situação legítima (backfill parcial), abre change própria de UI.
- Reativar `processarDiasDescanso` como está: é removido (código morto, e seu acoplamento a "hoje"
  já estava registrado como armadilha no Javadoc de `atualizarTsbDia`).
- `@Version` em `PlanoMetaDados` / janela de concorrência do pace (registrada em
  `refactor-threshold-call-outside-transaction`, segue fora).
- Mudar a fórmula de CTL/ATL (τ, arredondamento) — `refine-tss-tsb-precision` é change separada.
- ShedLock / lock distribuído para o job: hoje o backend roda em instância única no Railway;
  registrado em Open Questions.

## Critérios de aceite

1. **Given** atleta com última métrica em D0 e nenhuma linha em D0+1..D0+k, **When** um treino é
   ingerido em D0+k+1 (manual, `.fit`, Strava ou intervals.icu), **Then** existem linhas para todos
   os dias D0+1..D0+k+1, com TSS = 0 nos dias sem treino e CTL/ATL decaindo a partir de D0 (nunca
   reset a zero).
2. **Given** atleta sem nenhuma métrica, **When** o primeiro treino é ingerido, **Then** o
   comportamento atual é preservado (série começa no dia do treino, seed zero).
3. **Given** treino retroativo anterior à última métrica, **When** ingerido, **Then** o laço começa
   em `dataTreino` (comportamento de `fix-intervals-icu-retroactive-tsb-recalc` preservado).
4. **Given** atleta com última métrica em D0 e hoje (fuso do atleta) = D0+n, n ≥ 1, **When** o job
   diário roda, **Then** passam a existir linhas até hoje com decaimento correto; atletas já em dia
   não são tocados.
5. **Given** o job falha para um atleta, **When** continua, **Then** os demais atletas são
   processados e a falha é logada com o id — sem abortar o lote.
6. **Given** linha de D-1 ausente mas existe linha em D-k (k > 1), **When** `atualizarDiaTransacional`
   roda para D, **Then** o seed é a linha de D-k decaída por k dias, não zero.
7. `GET /api/v1/atletas/{id}/progress/pmc` para um atleta reparado devolve série densa (um ponto por
   dia) entre a primeira métrica e hoje.
8. `./mvnw clean test` verde; sem migration.

## Métrica de sucesso

Zero trechos `missing` no PMC de qualquer atleta ativo (medível por `gapAreas.kind === 'missing'`
vazio no front, ou por `COUNT(*) = dias` em `tb_metricas_diarias` por atleta no intervalo). Para o
treinador: a faixa de forma e o CTL que ele vê no dashboard voltam a ser confiáveis — nenhum atleta
em forma aparece como "destreinado" por buraco de cálculo.

## Open Questions & Assumptions

- **Assumido:** instância única do backend → `@Scheduled` simples basta; se for para múltiplas
  réplicas, entra ShedLock (como qualquer outro job daqui).
- **Assumido:** "dia de descanso" = TSS 0; o job não cria `TreinoRealizado`, só métricas.
- **Assumido:** o reparo (D) é rodado pelo founder, uma vez, na base do homelab, via script —
  sem automação nesta change e sem passo de produção.
- **Aberto:** o job deve limitar a quantos dias para trás? (atleta inativo há 6 meses → 180 dias ×
  1 transação cada). Proposta no design: teto de 400 dias, acima disso loga e pula — igual ao
  critério do `recalcularHistoricoCompleto`.
- **Resolvido:** `atualizarMetaDados` roda no último dia do recálculo (mesma semântica de
  `recalcularDesde`); o job estabelece o `TenantContext` por atleta para não degradar a fonte do
  limiar (design R5).
- **Resolvido (revisado):** o teto de 400 dias deixou de pular o atleta; vira bloco de 400 dias por
  execução (design R7).
- **Revisado:** "instância única → sem lock" estava errado. A concorrência relevante é
  ingestão × job na mesma instância; entra advisory lock por atleta (design R2).
- **Decidido (founder, 2026-10-20):** o reparo é aplicado **somente na base do homelab** (a do
  `.env`); **ainda não há atletas em produção**. Logo: sem reparo em produção, sem comunicação a
  assessorias, sem baseline de aceitação contaminada. Sugestões/alertas antigos do homelab são dado
  de teste — regenerar/descartar à mão se atrapalhar. O product-review voltaria a valer (comunicar o
  "pulo" de CTL/`FaixaTsb`, tratar sugestões geradas sobre CTL ≈ 0) **se este bug chegasse a produção
  com atletas**; o job + a correção na ingestão garantem que não chegue.

**Rollback:** sem migration, desfazer = reverter o deploy; as linhas de descanso geradas são
recalculáveis por `recalcularDesde`. Dependências `fix-intervals-icu-retroactive-tsb-recalc` e
`refactor-threshold-call-outside-transaction` tratadas como entregues (arquivadas em 2026-09, confirmado no DoR).

## Revisões e riscos (reviews da trilha Full, 2026-10-20)

**Product-reviewer: REFINE.** Valor real e correção certa (bug de confiança no dado central do
coach); faltava cuidar do que o coach vê quando o número muda e dos consumidores que já usaram o
dado errado. Incorporado: relatório/validação do reparo, gauge de atletas defasados, perguntas
abertas acima. Sugestão de sequência (D1+D5 primeiro) acatada na ordem das tasks (bloco 1 e 6.x
priorizados), sem dividir a change — D1–D3 compartilham o mesmo método e o mesmo teste de IT.

**Pre-mortem Codex: NO-GO no design original → design revisado** (`design.md`, "Revisões do
pre-mortem"). Riscos e mitigações:

| Risco | Mitigação |
|---|---|
| Job × ingestão sobrescrevem métrica com TSS antigo | advisory lock por atleta em `recalcularDesde` + IT com barreira (R2) |
| Reparo interrompido deixa série densa com seeds errados, invisível a `MAX(data)` | recálculo atômico por atleta + detecção por buraco, não por `MAX(data)` (R1, R3) |
| "Transação por dia" não existe na ingestão (herda a do chamador) | R1 assume a transação única; custo medido no IT; blocos de 400 dias (R7, R9) |
| D3 vira "ausência de métrica = ausência de treino" | decai só se não há treino no intervalo; senão `WARN` + seed zero (R6) |
| 00:30 BRT não cobre Acre/Manaus; `LocalDate.now()` do servidor no laço | job horário + `fim` explícito = hoje do atleta (R4) |
| Job sem `TenantContext` degrada limiar para `MEDIA_TREINOS` | tenant por atleta, `finally clear()` (R5) |
| Teto de 400 dias + reparo sem fim explícito = atleta bloqueado para sempre | blocos de 400 dias, fim = hoje, diagnóstico inclui `MAX < hoje` (R7) |
| Regressão do job invisível ao coach | gauge `tsb.atletas_defasados` (R8) |

Gate de entrega muda para `./mvnw clean verify`.
