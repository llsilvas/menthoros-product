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
| sem vínculo, com realizado avulso no mesmo dia **ainda não triado por humano** (`reconciliationStatus` ausente, `PENDENTE`, `AMBIGUO`, ou `NAO_PLANEJADO` com `reconciledBy = "SYSTEM"`) | **pendente** — fora |
| sem vínculo, com realizado avulso no mesmo dia **triado por humano como não-correspondente** (`reconciliationStatus = NAO_PLANEJADO` **e** `reconciledBy != "SYSTEM"`) | falta (só denominador) |
| sem vínculo, sem realizado no dia | falta (só denominador) |

**Correção da DoR (2026-10-01, rodada 1) — dois achados Alto do Codex:**
1. A linha original "vinculado a um realizado → cumprido" não checava se o realizado continuava válido
   (o vínculo via FK `TreinoPlanejado.treinoRealizado` sobrevive a um cancelamento no Strava —
   `StravaWebhookServiceImpl.markAsCanceled` só marca `statusSincronizacao = CANCELADO`, nunca desfaz o
   FK). Corrigido: "cumprido" exige `contaNaCarga()`, mesmo helper já usado por `ProgressaoTreinoServiceImpl`
   para carga/volume (D8 de `ingestao-treino-realizado`).
2. A linha original de "pendência" classificava qualquer coincidência de data como pendente, mesmo quando
   o coach já tinha confirmado manualmente que o avulso não corresponde a planejamento nenhum. Corrigido:
   só conta como pendente o que ainda está em aberto para triagem.

**Correção da DoR (2026-10-01, rodada 2) — um achado Alto do Codex, sobre a correção acima:**
`reconciliationStatus = NAO_PLANEJADO` **não implica triagem humana.** `MatchingDecisionEngineImpl.decide`
atribui `NAO_PLANEJADO` automaticamente quando não há candidato ou o melhor score é `< 0.50`
("ORPHANED"/"NO_MATCH"/"NO_CANDIDATES") — o mesmo valor de enum que `ManualReconciliationServiceImpl
.markAsNotPlanned` grava quando o coach confirma manualmente. A diferença observável é `reconciledBy`:
o caminho automático grava `"SYSTEM"` (`ReconciliationDecisionExecutor.java:122`); o manual grava o
`actorId` de quem agiu. Um `NAO_PLANEJADO` automático é exatamente o mesmo tipo de dado incompleto que a
classificação de pendência pretende excluir (ninguém revisou); só a confirmação humana resolve a
ambiguidade de fato. Corrigido: a tabela acima agora exige `reconciledBy != "SYSTEM"` para contar como
falta; `NAO_PLANEJADO` automático continua pendente.

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

**Precedência (achado médio do Codex, 2026-10-01):** o gate de histórico mínimo (`treinosConcluidos21d <
3` → MANTER, "histórico insuficiente") é avaliado **antes** desta tabela, como já é hoje em
`calcularDecisao` — aderência/TSB/RPE só entram em jogo depois desse gate passar. Essa tabela de aderência
ausente só se aplica quando o histórico mínimo já foi atendido mas o denominador de devidos é 0 ou as
pendências passam do teto; não muda a precedência existente, só documenta.

## D4. Gate de merge

Script/teste de comparação (regra antiga × nova, flag ligada e desligada) sobre os atletas ativos do
homelab, nos três dias de geração (sexta, sábado, domingo): estado, aderência e motivo por atleta.
Critérios de bloqueio e de recalibração no proposal — **atenção à correção de 2026-10-01**: o motivo
"treino realizado sem vínculo" por si só não bloqueia (é o efeito pretendido de CA3); só bloqueia quando a
causa raiz é pendência mal classificada ou semana em curso vazando pra janela. Resultado registrado no
`tasks.md` antes do PR.

## D5. Um histórico por geração

`PlanGenerationContextLoader.calcularDecisaoProgressao` (linha ~255) e `PlannerShadowService.aplicarShadow`
(linha ~252) chamam `progressaoTreinoService.calcularHistorico` **independentemente**, em instantes
potencialmente diferentes — confirmado em código (achado Codex, rodada 1). Hoje só `DecisaoProgressao` é
propagada do loader adiante; `ProgressaoHistoricoResumo` não. **Decisão (DoR rodada 2, confirmada pelo
spec-reviewer):** propagar também o `ProgressaoHistoricoResumo` pelo `PlanGenerationContext`/persister até
o shadow, mesmo padrão já usado para a decisão — o shadow passa a receber o resumo já calculado em vez de
chamar `calcularHistorico` de novo.

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

**Rodada 2 (segunda passagem Codex + spec-reviewer):** spec-reviewer confirmou READY; Codex achou mais um
Alto — a correção da rodada 1 para "pendência" usava `reconciliationStatus = NAO_PLANEJADO` como proxy de
triagem humana, mas esse status também é atribuído automaticamente pelo motor de matching
(`MatchingDecisionEngineImpl`, score < 0.50), sem nenhum humano envolvido. Corrigido no D2 acima: só conta
como falta quando `reconciledBy != "SYSTEM"` (triagem humana de fato). Dois achados médios também
corrigidos: a narrativa do proposal ainda descrevia o denominador como "sem teto de data" (desatualizado
desde o merge do PR #154) e D3 não explicitava a precedência do gate de histórico mínimo sobre a tabela de
aderência ausente (já existia no código, só não estava documentada).
