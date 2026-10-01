# Design — fix-progression-adherence-window

## D1. Janela de semanas fechadas

`janela = [segundaAtual − 21 dias, segundaAtual − 1 dia]` — as 3 semanas ISO fechadas antes da atual, no
fuso do atleta (`AtletaHojeResolver`). Todo planejado da janela já venceu, então o caso "hoje só se feito"
não aparece aqui. Consulta: `findComRealizadoByAtletaAndPeriodoAteData(atletaId, tenantId, inicio, fim)`
(criada em `fix-adherence-count-until-today`, PR #154).

**Correção da DoR (2026-10-01):** não existe hoje nenhum predicado de "treino devido" (exclusão de
`DESCANSO`) compartilhado com o painel — a change anterior só adicionou o teto de data. O predicado é
**construído nesta change** (task 1.7), local a `calcularHistorico`; compartilhar com o painel fica fora
de escopo (consolidação futura, não esta correção).

**Risco de assinatura (achado Codex, não endereçado no design original):** `AtletaHojeResolver.hojeDe`
exige a entidade `Atleta` completa, mas `ProgressaoTreinoServiceImpl.calcularHistorico(UUID atletaId)` só
recebe o ID — assim como `PlanGenerationContextLoader` e `PlannerShadowService`, que chamam
`calcularHistorico` só com o UUID. Implementar D1 como está exige ou (a) carregar o `Atleta` dentro de
`calcularHistorico` (uma query extra, mas sem mudar assinatura pública), ou (b) propagar `Atleta` pelos
três call sites. **Decisão: opção (a)** — `calcularHistorico` já tem acesso ao repositório de atletas
(ou ganha essa dependência); menor blast radius, não se propaga para o loader nem para o shadow. Task 1.2
inclui essa busca.

## D2. Classificação de cada planejado da janela

| Planejado | Conta |
|---|---|
| `DESCANSO` | fora |
| vinculado a um realizado que **conta na carga** (`realizado.contaNaCarga()`) | cumprido (numerador e denominador) |
| vinculado a um realizado **cancelado** (`!realizado.contaNaCarga()` — `statusSincronizacao = CANCELADO`) | falta (só denominador) |
| sem vínculo, com realizado avulso no mesmo dia **ainda não triado** (`reconciliationStatus` ausente, `PENDENTE` ou `AMBIGUO`) | **pendente** — fora |
| sem vínculo, com realizado avulso no mesmo dia **já triado como não-correspondente** (`reconciliationStatus = NAO_PLANEJADO`) | falta (só denominador) |
| sem vínculo, sem realizado no dia | falta (só denominador) |

**Correção da DoR (2026-10-01) — dois achados Alto do Codex:**
1. A linha original "vinculado a um realizado → cumprido" não checava se o realizado continuava válido
   (o vínculo via FK `TreinoPlanejado.treinoRealizado` sobrevive a um cancelamento no Strava —
   `StravaWebhookServiceImpl.markAsCanceled` só marca `statusSincronizacao = CANCELADO`, nunca desfaz o
   FK). Corrigido: "cumprido" exige `contaNaCarga()`, mesmo helper já usado por `ProgressaoTreinoServiceImpl`
   para carga/volume (D8 de `ingestao-treino-realizado`).
2. A linha original de "pendência" classificava qualquer coincidência de data como pendente, mesmo quando
   o coach já tinha confirmado manualmente (`ManualReconciliationServiceImpl.markAsNotPlanned`) que o
   avulso não corresponde a planejamento nenhum (`reconciliationStatus = NAO_PLANEJADO`). Nesse caso a
   ambiguidade já foi resolvida pelo coach — tratar como pendente escondia uma falta real do denominador.
   Corrigido: só conta como pendente o que ainda está em aberto para triagem.

Realizados avulsos da janela vêm da consulta de realizados que `calcularHistorico` já faz (42 dias).
`aderencia = cumpridos / (cumpridos + faltas)`; ausente quando o denominador é 0 ou quando
`pendentes / planejadosNaoDescanso > 25%`.

## D3. Tabela de decisão com aderência ausente

| Aderência | TSB / RPE | Estado |
|---|---|---|
| presente | — | regra atual (limiares 60/70/80) |
| ausente | fadiga (TSB < −22 ou RPE > 8,5) | REDUZIR |
| ausente | sem fadiga | MANTER |

Aderência ausente nunca libera PROGREDIR nem PROGREDIR_LEVE. O TSB nulo virar zero é anterior e fica como
está.

## D4. Gate de merge

Script/teste de comparação (regra antiga × nova, flag ligada e desligada) sobre os atletas ativos do
homelab, nos três dias de geração (sexta, sábado, domingo): estado, aderência e motivo por atleta.
Critérios de bloqueio e de recalibração no proposal — **atenção à correção de 2026-10-01**: o motivo
"treino realizado sem vínculo" por si só não bloqueia (é o efeito pretendido de CA3); só bloqueia quando a
causa raiz é pendência mal classificada ou semana em curso vazando pra janela. Resultado registrado no
`tasks.md` antes do PR.

## D5. Um histórico por geração

`PlanGenerationContextLoader` calcula o histórico e a decisão; `PlannerShadowService` recalcula o
histórico por conta própria. Os dois devem usar o mesmo resumo e o mesmo instante — passar o resumo
calculado adiante em vez de recalcular (confirmar o caminho na DoR).

## D6. `ProgressaoHistoricoResumo`

`treinosRealizados21d` (histórico mínimo), `treinosCumpridos`, `treinosFaltas`, `treinosPendentes` e
`aderencia` (nullable). `treinosPlanejados21d` sai. Os campos só são lidos dentro do serviço (conferido em
2026-09-30), mas o construtor é usado em fixtures do planner, do golden set e do shadow: inventariar e
reconstruir.

## D7. Flag

`menthoros.progressao.aderencia-devidos.enabled` (padrão: ligada depois do gate). Desligada, o cálculo da
aderência volta à regra antiga — rollback sem deploy. Sai numa change de limpeza depois de 4 semanas
estáveis.

## Riscos

- **Plano muda para atletas reais.** Mitigação: gate D4; flag D7; coach revisa todo plano.
- **Limiares calibrados com a regra antiga.** Mitigação: gatilho de recalibração no gate.
- **Reconciliação pendente.** Mitigação: pendência fora da conta, com teto (D2).
- **Decisão persistida não volta com rollback.** Mitigação: flag + monitoramento da aceitação na primeira
  semana.

## Rollback

Desligar a flag (imediato); reverter o PR (definitivo). Sem migration.

## Revisão da DoR (2026-10-01)

Codex adversarial (`/implement init`) deu **NO-GO** na primeira versão deste design com 3 achados Alto —
todos incorporados acima:
1. D2 contava vínculo com realizado cancelado como cumprimento (corrigido: exige `contaNaCarga()`).
2. D2 tratava avulso já triado pelo coach (`NAO_PLANEJADO`) como pendência em vez de falta (corrigido).
3. D4 (gate de merge) bloqueava, pela letra, o próprio efeito pretendido de CA3 (corrigido: a causa
   "parou de inflar com extra" não bloqueia; só pendência mal classificada ou semana em curso vazando).

Achados médios também corrigidos: D1 assumia um predicado de "treino devido" compartilhado com o painel
que não existe (é construído aqui, task 1.7); D1 não tinha resolvido o descompasso de assinatura entre
`AtletaHojeResolver(Atleta)` e `calcularHistorico(UUID)` (decisão: carregar o `Atleta` dentro do serviço,
sem propagar a assinatura).
