**Tamanho:** S · **Trilha:** Fast

> Fast porque é uma correção pontual de conversão de data no backend, sem schema, sem contrato de API
> e com precedente direto (`fix-treino-registro-fuso-atleta`, arquivada em 2026-10-06).

**Status:** proposta (2026-11-16, `/change`)
**Criado:** 2026-11-16

## Por que

Três testes de integração (`TreadmillFlagIT`, `GpsTraceIT.esteiraSemTrajeto`,
`AtletaTreinoFeedbackAnaliseIT`) quebram no CI quando ele roda entre ~00h e ~03h UTC, com
`400 — data não pode ser futura: <amanhã>`. Os PRs `menthoros-backend#237` e `#238` falharam assim em
2026-11-16, sem relação com o que mudavam. Reproduzido localmente com `TZ=UTC`.

**Não é só teste instável — é bug de produção.** `FitParseServiceImpl` (linha ~289) converte o início
da sessão com `ZoneId.systemDefault()`:

```java
s.startInstant().atZone(ZoneId.systemDefault()).toLocalDate()
```

Em produção a JVM roda em UTC (registrado em `StravaActivityServiceImpl`). Um treino iniciado entre
21h e 24h no horário de Brasília recebe a **data do dia seguinte**. Depois,
`TsbServiceImpl.validarNaoFuturo` compara essa data com o "hoje" **no fuso do atleta**
(`AtletaHojeResolver`, padrão `America/Sao_Paulo`) e rejeita. Efeitos:

- **Import manual de FIT** (`FitUploadServiceImpl`) de treino noturno feito no mesmo dia: 400.
- **Canal Garmin direto** (`GarminPingProcessorScheduler`, mesmo parser): treino noturno processado
  antes da meia-noite de Brasília é rejeitado; processado depois, entra com o **dia errado** (dia
  seguinte), o que desloca aderência, TSB e o casamento com o treino planejado que o coach vê.

Strava e intervals.icu já foram corrigidos por `fix-treino-registro-fuso-atleta`; o FIT ficou de fora.

## O que muda

- A data do treino vinda de FIT passa a ser calculada **no fuso do atleta** (o mesmo que
  `AtletaHojeResolver` usa), não no fuso do servidor.
- Os três ITs deixam de depender do horário em que o CI roda.

## Fora de escopo

- Os demais `ZoneId.systemDefault()` do backend (`IntervalsIcuConnectionServiceImpl`,
  `OnboardingServiceImpl`): não derivam data de treino; ficam para outra change se houver bug.
- Corrigir datas de treinos FIT já gravados com o dia errado (ver Open Questions).
- Mudar o fuso da JVM no Railway.

## Critérios de aceite

- **CA1** — GIVEN um FIT com início em 2026-11-15T23:30 em `America/Sao_Paulo` (02:30Z do dia 16) e
  JVM em UTC, WHEN importado, THEN `dataTreino` = 2026-11-15 e a resposta é 201 (teste unitário com
  instante fixo, sem `Instant.now()`).
- **CA2** — GIVEN um atleta com `timezone` diferente do padrão, THEN a data usa o fuso dele
  (teste unitário).
- **CA3** — GIVEN `TreadmillFlagIT`, `GpsTraceIT` e `AtletaTreinoFeedbackAnaliseIT`, WHEN rodados com
  `TZ=UTC` em qualquer horário, THEN passam (o teste não depende do relógio da máquina).
- **CA4** — GIVEN o canal Garmin, THEN o mesmo cálculo vale para `GarminPingProcessorScheduler`
  (o parser é compartilhado; um teste cobre o caminho Garmin).

## Métrica de sucesso

- Zero falhas de CI dos três ITs por horário de execução (hoje: falham toda madrugada UTC).
- Nenhum treino FIT/Garmin noturno rejeitado ou gravado no dia seguinte: o coach vê o treino no dia em
  que o atleta correu, que é o que alimenta aderência e a revisão semanal.

## Open Questions & Assumptions

- **Aberto (founder):** quantos treinos FIT/Garmin já estão gravados com o dia seguinte? Uma consulta
  em `tb_treino_realizado` (fonte FIT/Garmin, início entre 00h e 03h UTC) mede. Se houver, corrigir é
  change própria (afeta TSB/aderência históricos).
- **Assumido:** o fuso do atleta (`Atleta.timezone`, padrão `America/Sao_Paulo`) é a referência certa,
  como em `fix-treino-registro-fuso-atleta`. O FIT tem `local_timestamp` na mensagem Activity, mas nem
  todo arquivo traz; o fuso do atleta é consistente com o resto do sistema.
- **Assumido:** a JVM do Railway roda em UTC (comentário em `StravaActivityServiceImpl`); não verificado
  no painel.
