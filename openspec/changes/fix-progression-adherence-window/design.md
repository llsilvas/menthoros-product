# Design — fix-progression-adherence-window

## D1. Janela de semanas fechadas

`janela = [segundaAtual − 21 dias, segundaAtual − 1 dia]` — as 3 semanas ISO fechadas antes da atual, no
fuso do atleta (`AtletaHojeResolver`). Todo planejado da janela já venceu, então o caso "hoje só se feito"
não aparece aqui; o predicado de `fix-adherence-count-until-today` continua valendo para `DESCANSO`.
Consulta: `findComRealizadoByAtletaAndPeriodoAte(atleta, tenant, inicio, fim)` (criada na change
anterior).

## D2. Classificação de cada planejado da janela

| Planejado | Conta |
|---|---|
| `DESCANSO` | fora |
| vinculado a um realizado | cumprido (numerador e denominador) |
| sem vínculo, com realizado avulso no mesmo dia | **pendente** — fora |
| sem vínculo, sem realizado no dia | falta (só denominador) |

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
Critérios de bloqueio e de recalibração no proposal. Resultado registrado no `tasks.md` antes do PR.

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
