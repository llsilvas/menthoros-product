# Tasks — fix-fit-import-athlete-timezone

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`; bloco final `./mvnw clean verify`
também com `TZ=UTC`. Branch: `fix/fix-fit-import-athlete-timezone`, em worktree.

## 1. Teste que reproduz

- [ ] 1.1 Teste unitário do caminho FIT com instante fixo (2026-11-16T02:30:00Z), JVM simulada em UTC
      (`TimeZone.setDefault` restaurado no `@AfterEach`, ou parser recebendo o fuso): espera
      `dataTreino` = 2026-11-15 (CA1) e o fuso de um atleta não padrão (CA2).
      Verify: vermelho antes da correção.

## 2. Correção

- [ ] 2.1 A data do treino FIT passa a ser calculada no fuso do atleta. Preferência: o parser mantém
      só o instante (`startTimeEpochSeconds` já existe em `FitSessionData`) e o `FitTreinoPersister`,
      que conhece o atleta, converte com o mesmo fuso de `AtletaHojeResolver`. Sem
      `ZoneId.systemDefault()` no caminho.
      Verify: 1.1 verde; `FitParseServiceImplTest` e testes do persister ajustados.
- [ ] 2.2 Conferir o caminho Garmin (`GarminPingProcessorScheduler`) usa o mesmo cálculo (CA4).
      Verify: teste do caminho Garmin com instante noturno.

## 3. Testes de integração

- [ ] 3.1 `TreadmillFlagIT`, `GpsTraceIT`, `AtletaTreinoFeedbackAnaliseIT`: rodar com `TZ=UTC`.
      Se ainda dependerem do relógio (`Instant.now().minusSeconds(7200)`), fixar um instante de início
      que não vire o dia em nenhum fuso relevante.
      Verify: `TZ=UTC ./mvnw verify -Dit.test=TreadmillFlagIT,GpsTraceIT,AtletaTreinoFeedbackAnaliseIT` verde (CA3).

## 4. Fechamento

- [ ] 4.1 `./mvnw clean verify`; PR → `develop`.
- [ ] 4.2 Rodar a consulta de treinos FIT/Garmin gravados no dia seguinte e registrar o número no
      proposal (Open Question).
