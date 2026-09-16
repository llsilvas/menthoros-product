**Tamanho:** S · **Trilha:** Fast

## Status

Pré-requisito 3/3 de `remove-redundant-tsb-baseline-recalc` — a última lacuna antes de reabrir
aquela change. Também fecha a task `8.2` deixada pendente em `ingestao-treino-realizado`
(arquivada 2026-08-24): "Remover o fallback 'nulo → calcular' de 4.1 (backfill já rodou em
produção)" — o backfill **rodou em stage/HomeLab (2026-08-22, verificado, zero
`tssCalculado` nulo) mas nunca foi confirmado em produção** (`SPRINTS.md:1066-1069`, "Pendente:
rodar em prod (Railway) — requer confirmação explícita separada, é ambiente de produção").

## Problem Statement

`TreinoRealizado` registrado antes da migração de `tssCalculado` (change `ingestao-treino-
realizado`) pode não ter esse campo persistido. `TsbServiceImpl.somarTssContabilizado`
(`TsbServiceImpl.java:151-165`) tem um fallback: se `tssCalculado` é nulo, calcula e persiste na
hora — mas só para o dia que está sendo processado **naquele momento**. Dias antigos que nenhuma
atividade nova vai revisitar incrementalmente (`recalcularDesde` só anda pra frente a partir de
uma data) nunca passam por esse fallback — só o recálculo completo (`recalcularHistoricoCompleto`)
percorre o histórico inteiro e fecha a lacuna para trás.

Consequência dupla:
1. **Enquanto o backfill de produção não roda**, `remove-redundant-tsb-baseline-recalc` não pode
   ser reaberta com segurança — remover o recálculo completo do fluxo de plano eliminaria o único
   mecanismo que ainda fecha essa lacuna para atletas com histórico legado.
2. **O fallback em si é dívida técnica permanente** enquanto não for confirmado e removido — task
   8.2, aberta desde 2026-08-24.

## Solution

1. **Diagnóstico (read-only, seguro)**: query contra produção contando `TreinoRealizado` que
   contam (`status_sincronizacao is null or <> 'CANCELADO'`) com `tss_calculado is null` — mesma
   query de verificação já usada em stage (`ingestao-treino-realizado` task 6.2). Determina o
   tamanho real do problema antes de decidir o mecanismo de backfill.
2. **Backfill**: reusar `AtletaController.recalcularMetricasAtleta`
   (`POST /api/v1/atletas/{id}/recalcular-metricas`, confirmado em código — chama
   `TsbService.recalcularHistoricoCompleto` por atleta) num loop sobre os atletas afetados
   identificados no diagnóstico — mesmo padrão manual usado em stage/HomeLab (não construir
   endpoint batch novo só para isso; é operação única, não recorrente). **Achado do pre-mortem**:
   este endpoint tem `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` **sem** `@RequireTenant`
   (`AtletaController.java:138-150` — compare com `/convite` logo abaixo, que tem os dois). Ou
   seja, qualquer `TECNICO` autenticado pode disparar o recálculo de um atleta de **outro**
   tenant — gap pré-existente, não introduzido por esta change, e fora de escopo consertar aqui
   (é um achado de segurança autônomo — candidato a registrar como follow-up de segurança
   separado, no mesmo padrão de `fix-tenant-validation-not-found`). **Mitigação operacional para
   este backfill**: rodar o loop com uma credencial `ADMIN` de plataforma dedicada, nunca um JWT
   `TECNICO` de uma assessoria específica — reduz (não elimina) o raio de exposição durante a
   execução.
3. **Confirmação explícita de produção, com mecânica definida** (achado do pre-mortem: "requer
   confirmação" sem comando nomeado é um checkbox vazio que uma sessão futura pode preencher mal):
   - Query de diagnóstico e verificação: via console SQL do Railway (Postgres gerenciado) ou
     `psql` com a connection string de produção — **nunca embutida em código ou commitada**; o
     usuário fornece o acesso na hora, na sessão que executar.
   - Dump: `pg_dump` das duas tabelas afetadas (ver task 2.2 — inclui `tb_treino_realizado`, não
     só `tb_metricas_diarias`), salvo localmente com timestamp no nome, mesmo padrão do backup de
     `ingestao-treino-realizado` (`~/menthoros-backup/`).
   - Backfill: chamadas HTTP ao endpoint acima, uma por atleta, com o `ADMIN` token de produção.
   - Cada uma das 3 sub-etapas acima só roda depois de o usuário confirmar explicitamente **essa
     etapa especificamente** na conversa — não uma autorização única para "rodar tudo".
4. **Verificação pós-backfill**: reexecutar a query de diagnóstico — zero linhas com
   `tss_calculado` nulo entre os treinos que contam.
5. **Remover o fallback** (`TsbServiceImpl.java:151-165`, código + o `log.warn` que referencia a
   task 8.2) só depois da verificação confirmar zero nulos **e** do teste de contrato (CA5) provar
   que o pipeline de ingestão atual nunca persiste `tssCalculado` nulo em treino novo — sem isso,
   uma regressão futura no pipeline reabriria a lacuna sem que nada pegue (achado do pre-mortem:
   `IngestaoTreinoRealizadoServiceImpl.aplicarTssSeNecessario` hoje sempre preenche o campo, mas
   isso não está travado por teste de contrato, só por leitura de código).

## Critérios de aceite

- **CA1** — Given a query de diagnóstico rodando contra produção, When executada, Then reporta a
  contagem real de treinos afetados (pode ser 0 — não invalida a change, só simplifica: sem
  treinos afetados, pula direto para a remoção do fallback).
- **CA2** — Given atletas com treinos afetados identificados, When o backfill roda (via
  `POST /api/v1/atletas/{id}/recalcular-metricas`, um atleta por vez, com dump **de
  `tb_metricas_diarias` E `tb_treino_realizado`** antes — as duas tabelas que o recálculo escreve),
  Then a query de verificação pós-backfill retorna zero.
- **CA3** — Given o backfill confirmado (CA2), When o fallback é removido de
  `somarTssContabilizado`, Then `TreinoRealizado` com `tssCalculado` nulo (não deveria mais
  existir) passa a contar como TSS zero na soma do dia — sem cálculo silencioso — e um teste
  cobre esse caso.
- **CA4** — Given a mesma alteração, Then a task 8.2 de `ingestao-treino-realizado` e o
  pré-requisito 3/3 de `remove-redundant-tsb-baseline-recalc` são marcados fechados, referenciando
  esta change.
- **CA5** — Given o pipeline de ingestão atual (`IngestaoTreinoRealizadoServiceImpl`), When um
  treino é registrado por qualquer fonte (MANUAL/STRAVA/INTERVALS_ICU/FIT), Then `tssCalculado`
  nunca fica nulo — provado por um teste de contrato (não existe hoje) que trava essa garantia,
  para que uma regressão futura no pipeline seja pega pela suíte antes de reabrir a lacuna que o
  fallback removido fechava.

**Gate:** verificação de produção com zero `tssCalculado` nulo confirmada antes de remover o
fallback — CA3 não é executado sem CA2 fechado, e CA5 precisa estar verde antes de CA3 também
(achado do pre-mortem — sem o teste de contrato, remover o fallback é uma aposta, não uma garantia).

## Métrica de sucesso

**Antes:** o fallback "nulo → calcula e persiste agora" (`TsbServiceImpl.java:151-165`) é o único
mecanismo que ainda fecha a lacuna de TSS legado, e só fecha dia a dia, incidentalmente, quando
esse dia específico é reprocessado — dívida técnica aberta desde 2026-08-24 (task 8.2).
**Depois:** zero `tssCalculado` nulo em produção (verificável pela query de diagnóstico) **e**
`remove-redundant-tsb-baseline-recalc` desbloqueada para reabertura (os 3 pré-requisitos do
pre-mortem do Codex fechados).

## Rollback

Dump de `tb_metricas_diarias` **e** `tb_treino_realizado` antes de qualquer chamada de backfill
(task 2.2) — se o backfill de um atleta precisar ser desfeito, restaurar as duas tabelas desse
atleta a partir do dump. Critério de abortar o loop: se qualquer chamada do backfill falhar
(atleta N de M), parar o loop, não continuar para os atletas seguintes, e reportar antes de
decidir se restaura o dump ou investiga a causa da falha pontual.

## Riscos e mitigações

- **Risco principal — operação em produção.** Mitigado pelo protocolo de 3 passos com mecânica
  nomeada (dump de 2 tabelas → backfill por atleta via ADMIN → verificação), idêntico em espírito
  ao já validado em stage/HomeLab em 2026-08-22. Nenhum passo contra produção roda sem confirmação
  explícita **por etapa** nesta sessão.
- **Risco (achado do pre-mortem): o "backfill" não é cirúrgico — `recalcularHistoricoCompleto`
  apaga e reconstrói em blocos TODO o histórico de `MetricasDiarias` do atleta, do primeiro ao
  último treino, não só os dias com `tssCalculado` nulo** (`TsbServiceImpl.java:444-462`).
  Consequência: CTL/ATL/TSB visíveis ao atleta/coach podem mudar de valor além de só fechar o
  campo nulo — mesmo mecanismo já usado e aceito em `ingestao-treino-realizado` (que teve nota
  in-app para o coach, `PmcBackfillNotice`), não um mecanismo novo desta change. **Aceito**: não é
  regressão de fórmula (a fórmula de TSB não mudou desde a migração), só reafirma o valor correto
  — mas registrado aqui para quem rodar o backfill não ser pego de surpresa por um PMC que mudou
  de aparência para o atleta afetado. Nota in-app como a de `ingestao-treino-realizado` fica fora
  de escopo (nenhum atleta novo esperado nesta rodada, dado o volume real observado em stage —
  reavaliar se o diagnóstico de produção mostrar volume alto).
- **Risco (achado do pre-mortem): o endpoint de recálculo reusado não valida tenant**
  (`AtletaController.recalcularMetricasAtleta`, sem `@RequireTenant`) — gap de autorização
  pré-existente, não desta change. Mitigado operacionalmente rodando o loop com credencial `ADMIN`
  de plataforma, não um token `TECNICO` de assessoria. **Não corrigido nesta change** — registrar
  como achado de segurança autônomo (candidato a change própria, mesmo padrão de
  `fix-tenant-validation-not-found`).
- **Risco: contagem de atletas afetados grande o suficiente para justificar um mecanismo batch.**
  Se o diagnóstico (CA1) revelar um número alto (dezenas+), reavaliar antes de rodar atleta por
  atleta manualmente — pode justificar um endpoint/job batch dedicado. Decisão fica para depois do
  diagnóstico, não assumida agora.
- **Risco: remover o fallback cedo demais** (antes do backfill realmente fechar a lacuna, ou sem
  uma garantia de que o pipeline atual não reabre a lacuna) faria `tssCalculado` nulo contar como
  TSS zero silenciosamente em vez de ser calculado on-the-fly — regressão de dado. Mitigado pelo
  gate explícito (CA3 depende de CA2 **e** CA5).

## Out of Scope

- Construir um endpoint/job de backfill batch novo, a menos que o diagnóstico (CA1) justifique
  (ver Riscos).
- Qualquer mudança na fórmula de cálculo de TSS (`TssCalculatorService`) — só persistência do
  valor já calculável.
- `fix-progressao-continua-incremental` (pré-requisito 2/3) e a remoção do recálculo completo em
  si (`remove-redundant-tsb-baseline-recalc`) — changes separadas.
