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
2. **Backfill**: reusar `AtletaServiceImpl.recalcularMetricasAtleta` (endpoint admin existente,
   `POST /api/admin/atletas/{id}/recalcular-metricas` ou equivalente — chama
   `TsbService.recalcularHistoricoCompleto` por atleta) num loop sobre os atletas afetados
   identificados no diagnóstico — mesmo padrão manual usado em stage/HomeLab (não construir
   endpoint batch novo só para isso; é operação única, não recorrente).
3. **Confirmação explícita de produção**: esta é uma operação sobre dados reais de produção —
   **não será executada por este agente sem autorização explícita do usuário em cada etapa**
   (dump/backup antes, execução, verificação depois), seguindo o mesmo protocolo já usado em
   `ingestao-treino-realizado` task 6.2 (dump de `tb_metricas_diarias` antes de rodar).
4. **Verificação pós-backfill**: reexecutar a query de diagnóstico — zero linhas com
   `tss_calculado` nulo entre os treinos que contam.
5. **Remover o fallback** (`TsbServiceImpl.java:151-165`, código + o `log.warn` que referencia a
   task 8.2) só depois da verificação confirmar zero nulos.

## Critérios de aceite

- **CA1** — Given a query de diagnóstico rodando contra produção, When executada, Then reporta a
  contagem real de treinos afetados (pode ser 0 — não invalida a change, só simplifica: sem
  treinos afetados, pula direto para a remoção do fallback).
- **CA2** — Given atletas com treinos afetados identificados, When o backfill roda (via endpoint
  admin existente, um atleta por vez, com dump de `tb_metricas_diarias` antes), Then a query de
  verificação pós-backfill retorna zero.
- **CA3** — Given o backfill confirmado (CA2), When o fallback é removido de
  `somarTssContabilizado`, Then `TreinoRealizado` com `tssCalculado` nulo (não deveria mais
  existir) passa a contar como TSS zero na soma do dia — sem cálculo silencioso — e um teste
  cobre esse caso.
- **CA4** — Given a mesma alteração, Then a task 8.2 de `ingestao-treino-realizado` e o
  pré-requisito 3/3 de `remove-redundant-tsb-baseline-recalc` são marcados fechados, referenciando
  esta change.

**Gate:** verificação de produção com zero `tssCalculado` nulo confirmada antes de remover o
fallback — CA3 não é executado sem CA2 fechado.

## Riscos e mitigações

- **Risco principal — operação em produção.** Mitigado pelo protocolo de 3 passos (dump → backfill
  por atleta → verificação), idêntico ao já validado em stage/HomeLab em 2026-08-22. Nenhum passo
  contra produção roda sem confirmação explícita nesta sessão.
- **Risco: contagem de atletas afetados grande o suficiente para justificar um mecanismo batch.**
  Se o diagnóstico (CA1) revelar um número alto (dezenas+), reavaliar antes de rodar atleta por
  atleta manualmente — pode justificar um endpoint/job batch dedicado. Decisão fica para depois do
  diagnóstico, não assumida agora.
- **Risco: remover o fallback cedo demais** (antes do backfill realmente fechar a lacuna) faria
  `tssCalculado` nulo contar como TSS zero silenciosamente em vez de ser calculado on-the-fly —
  regressão de dado. Mitigado pelo gate explícito (CA3 depende de CA2).

## Out of Scope

- Construir um endpoint/job de backfill batch novo, a menos que o diagnóstico (CA1) justifique
  (ver Riscos).
- Qualquer mudança na fórmula de cálculo de TSS (`TssCalculatorService`) — só persistência do
  valor já calculável.
- `fix-progressao-continua-incremental` (pré-requisito 2/3) e a remoção do recálculo completo em
  si (`remove-redundant-tsb-baseline-recalc`) — changes separadas.
