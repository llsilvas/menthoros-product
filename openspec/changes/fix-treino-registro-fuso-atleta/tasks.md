# Tasks — fix-treino-registro-fuso-atleta

Repo: `apps/menthoros-backend`, branch `fix/fix-treino-registro-fuso-atleta`. Validação padrão:
`./mvnw clean verify` (gate real — `test` sozinho não roda os `*IT`).

## 1. Registro manual usa o fuso do atleta

- [ ] 1.1 `TreinoServiceImpl`: injeta `AtletaHojeResolver hojeResolver`.
- [ ] 1.2 `addTreino`: troca `LocalDate.now(clock)` por `hojeResolver.hojeDe(atleta)` no fallback de
      `dataTreino` (linha ~95-97).
- [ ] 1.3 `lancarTreino`: mesma troca no fallback de `dataTreino` (linha ~361-363).
      *verify:* `./mvnw clean test -Dtest=TreinoServiceImplTest`

## 2. Strava usa o fuso do atleta + parse sem `ZoneId.systemDefault()`

- [ ] 2.1 `StravaActivityServiceImpl`: injeta `AtletaHojeResolver hojeResolver` (constructor
      injection manual — atualizar as 4 chamadas diretas `new StravaActivityServiceImpl(...)` em
      teste).
- [ ] 2.2 `mergeActivityIntoTreino`: fallback `treinoDate == null` passa de `LocalDate.now()` para
      `hojeResolver.hojeDe(atleta)`.
- [ ] 2.3 `parseActivityDate`: reescrito para o mesmo padrão de
      `IntervalsIcuActivityMapper.parseDataTreino` (LocalDateTime → OffsetDateTime → Instant/UTC,
      sem `ZoneId.systemDefault()`). Remove `parseActivityInstant` (fica sem uso).
      *verify:* `./mvnw clean test -Dtest=StravaActivityServiceTest`

## 3. Testes e fechamento

- [ ] 3.1 `TreinoServiceImplTest`: novo caso cobrindo que o fallback de data usa
      `hojeResolver.hojeDe(atleta)` (mock retornando uma data diferente de `LocalDate.now()`, para
      provar que não é o clock cru sendo usado) — em `addTreino` e em `lancarTreino`.
- [ ] 3.2 `StravaActivityServiceTest`: novo caso cobrindo (a) `parseActivityDate` com
      `startDateLocal` sem offset/zona (hora de parede pura, ex.: `"2026-10-05T23:45:00"`) extrai a
      data literal; (b) fallback `treinoDate == null` usa `hojeResolver.hojeDe(atleta)`.
- [ ] 3.3 `./mvnw clean verify` — colar o resultado (0 falhas) na entrega.
