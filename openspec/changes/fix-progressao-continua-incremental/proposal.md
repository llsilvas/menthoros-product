**Tamanho:** XS · **Trilha:** Fast

## Status

Pré-requisito 2/3 de `remove-redundant-tsb-baseline-recalc` (ver o "Status" daquela change) —
o pre-mortem do Codex (2026-09-14) bloqueou a remoção do recálculo completo em
`BaselineCalculatorImpl` porque `semanasProgressaoContinua` só é recalculado dentro de
`TsbService.recalcularHistoricoCompleto`, nunca pelo caminho incremental
(`recalcularDesde`/`atualizarTsbDia`). Removê-lo sem esta correção congelaria o campo para sempre
no valor do último recálculo completo que rodar.

## Problem Statement

`TsbServiceImpl.recalcularSemanasProgressao` (`TsbServiceImpl.java:732-787`) atualiza
`PlanoMetaDados.semanasProgressaoContinua` — quantas semanas consecutivas o volume de treino do
atleta vem subindo. Esse campo **não é cosmético**: alimenta dois mecanismos de segurança reais:

- **Step-back de carga** (`LoadTargetResolver.java:22,83-85`) — força uma semana de descarga
  quando `semanasProgressaoContinua >= 3` (na 4ª semana consecutiva).
- **Alerta de sobrecarga** (`MetricasAlertaService.java`, `MetricasThresholds.SEMANAS_PROGRESSAO_ALERTA
  = 4`) — sinaliza o treinador quando o atleta acumula 4+ semanas de progressão sem quebra.

Hoje, o único caminho que chama `recalcularSemanasProgressao` é `recalcularHistoricoCompleto`
(`TsbServiceImpl.java:468`) — o recálculo caro que `remove-redundant-tsb-baseline-recalc` quer
eliminar do fluxo de geração de plano. O caminho incremental (`recalcularDesde`, chamado por todo
registro real de treino — Strava, `.fit`, reconciliação manual) nunca toca esse campo. Se o
recálculo completo deixar de rodar em toda geração de plano (o objetivo daquela change), o
step-back e o alerta de sobrecarga param de refletir a realidade — silenciosamente, sem erro,
sem log.

## Solution

Mover a chamada de `recalcularSemanasProgressao(atletaId)` para dentro de `atualizarMetaDados`
(`TsbServiceImpl.java:312-...`) — método já chamado tanto pelo caminho incremental
(`recalcularDesde` → `atualizarTsbDia(..., atualizarMetaDadosHoje=true)`, uma vez por chamada, não
por dia) quanto pelo recálculo completo (`recalcularHistoricoCompleto:467`). Remove a chamada
duplicada explícita em `recalcularHistoricoCompleto:468` (deixaria de ser necessária — já cai
dentro de `atualizarMetaDados`, chamado na linha 467 do mesmo bloco).

Resultado: `semanasProgressaoContinua` fica em dia a cada treino real registrado, independente de
`remove-redundant-tsb-baseline-recalc` remover ou não o recálculo completo do fluxo de plano — as
duas changes deixam de ser acopladas por esse gap.

## Literatura — a janela de 3-4 semanas já usada está alinhada com periodização padrão

Pesquisa rápida sobre o modelo de microciclo 3:1 (3 semanas de carga progressiva + 1 semana de
descarga) em treinamento de corrida/endurance: é o padrão mais citado na literatura de
periodização — "a typical periodized training pattern includes a three- to five-week period of
progressive loading, followed by a week of lighter, active-recovery workouts"; um estudo em
corredores amadores usou exatamente 3 semanas de carga + 1 de recuperação, repetido 3x em 12
semanas. A recomendação geral de deload (a cada 4-8 semanas, ou quando performance/sono/velocidade
caem juntos) também comporta esse ciclo dentro da janela recomendada.

**Conclusão:** `SEMANAS_PARA_STEP_BACK = 3` (step-back na 4ª semana) e `SEMANAS_PROGRESSAO_ALERTA
= 4` já estão dentro do range validado pela literatura (3-5 semanas de build antes de descarga) —
**não há justificativa, pela literatura levantada, para mudar esses valores nesta change.** Fica
registrado como fundamentação, não como mudança de escopo; ajustar os thresholds é decisão de
produto separada, não uma correção de bug.

Referência complementar (não aplicada aqui): a razão de carga aguda:crônica (Gabbett, *BJSM*
2016) usa uma métrica diferente (proporção de carga, não semanas de streak) para o mesmo
propósito de reduzir risco de lesão por progressão — já parcialmente coberta no código por
`RAMP_RATE_RELATIVO_ALTO`/`RAMP_RATE_RELATIVO_CRITICO` (`MetricasThresholds.java:59-65`), que é
uma change/discussão separada.

## Critérios de aceite

- **CA1** — Given um atleta com histórico de `MetricasDiarias`, When um `TreinoRealizado` novo é
  persistido pelo caminho real de ingestão (`IngestaoTreinoRealizadoService.registrar`, não uma
  chamada direta a `recalcularDesde`), Then `PlanoMetaDados.semanasProgressaoContinua` reflete o
  streak recalculado a partir de `MetricasDiarias` atual dentro da mesma transação da ingestão —
  sem precisar de `recalcularHistoricoCompleto` — e repetir o registro (idempotência) não altera o
  resultado. Se a consolidação do streak falhar, o registro do treino também reverte (achado do
  Codex: `atualizarMetaDados` passa a rodar em `REQUIRED`, dentro da transação de quem chama, não
  mais isolado em `REQUIRES_NEW` como só acontecia antes dentro de `recalcularHistoricoCompleto`
  — comportamento aceito, ver "Riscos e mitigações").
- **CA2** — Given `recalcularHistoricoCompleto` rodando **com histórico existente** (caso sem
  histórico retorna cedo em `zerarMetaDadosSemHistorico`, `TsbServiceImpl.java:447-451`, e nunca
  chama o recálculo do streak — não se aplica), When completa, Then
  `findByAtletaIdOrderByDataAsc` (usado por `recalcularSemanasProgressao`) é invocado exatamente
  uma vez por execução — não duas — verificável por contagem de chamadas ao repositório, não só
  pelo valor final (que não distingue execução única de duplicada).
- **CA3** — Given os testes existentes de `LoadTargetResolver`/`MetricasAlertaService` que
  consomem `semanasProgressaoContinua`, When esta mudança é aplicada, Then nenhum deles muda de
  comportamento (a interface do campo não muda, só quem o mantém atualizado).

**Gate:** `./mvnw clean verify` verde (não `test` — a chamada passa a participar da transação de
ingestão real, achado do Codex; só `*IT` exercita esse caminho), incluindo um teste novo cobrindo CA1 (hoje inexistente —
`TsbServiceImplRecalculoSemanticaTest`/`TsbServiceImplRecalculoHistoricoTest` só usam
`semanasProgressaoContinua` como valor de fixture, não asserram que o caminho incremental o
atualiza).

## Métrica de sucesso

**Antes:** `semanasProgressaoContinua` só reflete a realidade logo após um `recalcularHistoricoCompleto`
rodar (hoje, a cada geração de plano) — entre uma geração e outra, o step-back
(`LoadTargetResolver`) e o alerta de sobrecarga (`MetricasAlertaService`) podem estar decidindo com
um streak desatualizado.
**Depois:** o campo fica em dia a cada treino real registrado (Strava, `.fit`, reconciliação),
independente de quando a próxima geração de plano acontecer — verificável comparando, para uma
amostra de atletas pós-deploy, o `semanasProgressaoContinua` persistido contra o streak recalculado
manualmente a partir de `MetricasDiarias` (devem bater a qualquer momento, não só logo após um
recálculo completo).

## Rollback

Reverter o commit único desta change. Não há migration nem mudança de contrato público — a
reversão é puramente de código e teste (mover a chamada de volta para
`recalcularHistoricoCompleto`), sem dado a migrar.

## Riscos e mitigações

- **Risco:** `recalcularSemanasProgressao` faz uma query de todo o histórico de `MetricasDiarias`
  do atleta (`findByAtletaIdOrderByDataAsc`) e agrupa em memória por semana — hoje só roda 1x por
  geração de plano (via o recálculo completo); passa a rodar a cada treino real registrado
  (Strava sync, webhook, `.fit`, reconciliação). Mais frequente, mas muito mais barato que o
  recálculo completo que está sendo evitado (não recalcula CTL/ATL, não toca `TreinoRealizado`,
  só agrega `volumeKm` já persistido). Sem otimização adicional nesta change — se o volume de
  chamadas incrementais em produção mostrar custo real, otimizar fica como follow-up (ex.: limitar
  a query às últimas N semanas em vez do histórico completo).
- **Risco:** duplicar a chamada (deixar em `recalcularHistoricoCompleto` E em
  `atualizarMetaDados`) faria o streak ser recalculado 2x na mesma operação — sem bug funcional
  (idempotente), mas custo desnecessário. CA2 cobre isso explicitamente.
- **Risco (achado do Codex, pre-mortem):** `atualizarMetaDados` roda em `@Transactional` `REQUIRED`
  — no caminho incremental, isso significa que o recálculo do streak passa a rodar **dentro da
  mesma transação da ingestão do treino** (`IngestaoTreinoRealizadoService`), não mais isolado.
  Hoje, uma falha em `recalcularSemanasProgressao` só existia dentro do `REQUIRES_NEW` de
  `recalcularHistoricoCompleto` (`TsbRecalculoExecutor.java:117`) e nunca revertia o registro do
  treino em si. Depois desta change, uma falha no cálculo do streak passa a reverter também a
  ingestão do treino que a disparou. **Aceito deliberadamente**: o comportamento é mais
  consistente (treino registrado e metadados atualizados são atômicos, ou nenhum dos dois), e
  `recalcularSemanasProgressao` é uma agregação pura sobre dado já persistido (sem I/O externo,
  sem chamada de rede) — baixa probabilidade de falha nova. Coberto por CA1 (teste via ingestão
  real, não só `recalcularDesde` isolado).

## Out of Scope

- Mudar os valores de `SEMANAS_PARA_STEP_BACK`/`SEMANAS_PROGRESSAO_ALERTA` — literatura confirma
  que os atuais já estão no range recomendado (ver seção acima).
- Otimizar a query de `recalcularSemanasProgressao` para não escanear o histórico completo — só
  vira necessário se o custo em produção se mostrar real (não medido aqui).
- Qualquer mudança em `remove-redundant-tsb-baseline-recalc` em si — esta change só fecha um dos
  dois pré-requisitos dela.
