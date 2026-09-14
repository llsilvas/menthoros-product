**Tamanho:** XS · **Trilha:** Fast

## Status

- ready-for-agent (2026-09-13): spec produzida a partir do achado colateral documentado em
  `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` e confirmado como pré-requisito
  Important pela revisão adversarial do Codex sobre a change `remove-redundant-tsb-baseline-recalc`
  (item 1 de 3 a fechar antes daquela remoção ser segura). Seam único identificado
  (`IntervalsIcuActivityPersisterTest`), pronta para `/implement init
  fix-intervals-icu-retroactive-tsb-recalc`.

## Problem Statement

Quando o treinador ou o atleta conecta o intervals.icu e o sistema importa uma atividade
individual que aconteceu no passado (não hoje), os dias seguintes a essa atividade ficam com
CTL/ATL/TSB desatualizados — o sistema não sabe que a carga de treino mudou retroativamente, e
o treinador pode ver um estado de prontidão do atleta (TSB) que não reflete a atividade recém
importada.

## Solution

`IntervalsIcuActivityPersister.persistir` passa a chamar `TsbService.recalcularDesde` (que
propaga a recorrência CTL/ATL a partir do dia afetado até hoje) em vez de
`TsbService.atualizarTsbDia` (que só atualiza o dia importado, sem tocar nos dias seguintes já
materializados).

## User Stories

1. Como treinador, quero que a métrica de prontidão (TSB) do atleta reflita corretamente uma
   atividade importada retroativamente do intervals.icu, para que eu não tome decisões de plano
   com base num dado defasado.
2. Como atleta que conecta o intervals.icu depois de já ter treinado há alguns dias sem
   registrar nada no Menthoros, quero que meu histórico de carga fique correto assim que a
   sincronização acontecer, para que meu plano seguinte considere a carga real, não uma carga
   subestimada.
3. Como desenvolvedor do motor de treino, quero que todos os caminhos de ingestão de treino real
   usem o mesmo método correto de recálculo de TSB (`recalcularDesde`, não `atualizarTsbDia`
   isolado) para importações potencialmente retroativas, seguindo o próprio contrato documentado
   em `TsbService`, para não ter dois comportamentos divergentes no mesmo tipo de operação.

## Implementation Decisions

- **Módulo alterado:** `IntervalsIcuActivityPersister` (`br.com.menthoros.backend.services.helper`).
- Trocar `tsbService.atualizarTsbDia(atleta.getId(), salvo.getDataTreino())`
  (`IntervalsIcuActivityPersister.java:64`) por
  `tsbService.recalcularDesde(atleta.getId(), salvo.getDataTreino())`.
- **Nenhuma outra mudança estrutural.** `IntervalsIcuActivityPersister` continua fora do seam
  `IngestaoTreinoRealizadoService.registrar()` — essa decisão já foi tomada e justificada na
  change arquivada `ingestao-treino-realizado` (conflito de ordem entre reconciliação e evento,
  pre-mortem #10 de `intervals-icu-activity-ingestion`). Este fix não reabre essa decisão; só
  corrige qual método de `TsbService` é chamado dentro da implementação direta já existente.
- **Efeito colateral aceito:** `recalcularDesde` é mais caro que `atualizarTsbDia` quando a
  atividade importada é de uma data muito antiga (reprocessa todos os dias entre a data e hoje).
  Isso é aceitável porque é o comportamento correto e idêntico ao que `IngestaoTreinoRealizadoServiceImpl`
  já faz para todo outro caminho de ingestão retroativa (FIT, Strava, reconciliação manual) — não
  é uma regressão de performance nova, é alinhar este caminho ao padrão já estabelecido.

## Testing Decisions

- Um bom teste aqui verifica que o método correto do `TsbService` é chamado com a data certa —
  comportamento observável da interação entre `IntervalsIcuActivityPersister` e seu colaborador,
  não detalhe de implementação interna do `TsbService` (que já tem sua própria suíte).
- **Módulo testado:** `IntervalsIcuActivityPersister`, via o teste unitário já existente
  `IntervalsIcuActivityPersisterTest`. É o seam mais alto disponível — não há necessidade de um
  seam novo.
- **Mudança necessária no teste existente:** as quatro ocorrências de `atualizarTsbDia` em
  `IntervalsIcuActivityPersisterTest.java` (linhas 107, 127, 219, 236 — duas asserções de
  chamada com argumentos, duas de `never()`) trocam para `recalcularDesde`, mantendo a mesma
  semântica de cada teste (import novo chama o recálculo; corrida de concorrência/duplicata não
  chama).
- **Prior art:** `IngestaoTreinoRealizadoServiceImplTest` já testa `recalcularDesde` sendo
  chamado com a data correta para os caminhos análogos — mesmo padrão de asserção.
- **Gate de validação:** `./mvnw clean test` (não precisa de `*IT` — não há mudança de schema,
  transação ou contrato externo).

## Out of Scope

- Migrar `IntervalsIcuActivityPersister` para o seam `IngestaoTreinoRealizadoService.registrar()`
  — decisão já tomada e justificada em outra change; não reaberta aqui.
- Qualquer mudança em `TsbService.recalcularDesde` ou `atualizarTsbDia` em si.
- A remoção da chamada redundante em `BaselineCalculatorImpl` (`remove-redundant-tsb-baseline-recalc`)
  — este fix é um pré-requisito dela, não a change em si. As outras duas lacunas apontadas pelo
  Codex (recálculo de `semanasProgressaoContinua` fora do caminho incremental; backfill de TSS
  legado pendente em produção) continuam abertas e fora do escopo deste fix.

## Métrica de sucesso

Uma atividade do intervals.icu importada com data retroativa (ex.: 5 dias atrás) atualiza
corretamente o CTL/ATL/TSB de todos os dias entre a data da atividade e hoje — verificável pelo
teste unitário atualizado e, manualmente, comparando `tb_metricas_diarias` antes/depois de um
import retroativo real em stage/HomeLab.

## Open Questions & Assumptions

- **Assumido:** não há nenhum motivo de design para `IntervalsIcuActivityPersister` ter usado
  `atualizarTsbDia` em vez de `recalcularDesde` especificamente — parece ter sido escrito antes
  de `recalcularDesde` existir como método público, ou uma simplificação não intencional. Não
  encontrada nenhuma nota no design.md arquivado de `ingestao-treino-realizado` que justifique
  essa escolha especificamente (a decisão documentada lá é sobre não migrar para o seam
  `registrar()`, não sobre qual método de `TsbService` chamar dentro da implementação direta).
