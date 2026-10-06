# Tasks — fix-treino-registro-fuso-atleta

Repo: `apps/menthoros-backend`, branch `fix/fix-treino-registro-fuso-atleta`. Validação padrão:
`./mvnw clean verify` (gate real — `test` sozinho não roda os `*IT`).

## 1. Registro manual usa o fuso do atleta

- [x] 1.1 `TreinoServiceImpl`: injeta `AtletaHojeResolver hojeResolver`.
- [x] 1.2 `addTreino`: troca `LocalDate.now(clock)` por `hojeResolver.hojeDe(atleta)` no fallback de
      `dataTreino`.
- [x] 1.3 `lancarTreino`: mesma troca no fallback de `dataTreino`.
- [x] 1.4 **Além do escopo original:** `registrarTreinoManualAtleta` (o endpoint real usado pela
      tela "Registrar treino" do atleta, `POST /me/treinos`) também usava `LocalDate.now(clock)`
      para a janela de validação de 7 dias — trocado por `hojeResolver.hojeDe(atleta)`. Isso exigiu
      reordenar o método (carregar o atleta antes da validação, já que o resolver precisa dele),
      mudando o comportamento de "atleta não encontrado" (antes nunca tocava `atletaRepository`
      para datas muito antigas; agora toca) — ajustado no teste correspondente.
      *verify:* `./mvnw clean test -Dtest=TreinoServiceImplTest,AtletaTreinoServiceImplTest`

## 2. Strava usa o fuso do atleta + parse sem `ZoneId.systemDefault()`

- [x] 2.1 `StravaActivityServiceImpl`: injeta `AtletaHojeResolver hojeResolver` (constructor
      injection manual — atualizadas as 4 chamadas diretas `new StravaActivityServiceImpl(...)` em
      teste, 6 call sites no total).
- [x] 2.2 `mergeActivityIntoTreino`: fallback `treinoDate == null` passa de `LocalDate.now()` para
      `hojeResolver.hojeDe(atleta)`.
- [x] 2.3 `parseActivityDate`: reescrito para tratar `startDateLocal` como hora de parede local
      (remove o sufixo "Z" antes de parsear como `LocalDateTime`, com fallback para
      `OffsetDateTime`) — sem round-trip por `ZoneId.systemDefault()`. Removido
      `parseActivityInstant` (ficou sem uso).
      *verify:* `./mvnw clean test -Dtest=StravaActivityServiceTest,StravaActivityServiceImplSyncTest,EnriquecerStravaServiceTest,StravaActivityPullTest`

## 3. Testes e fechamento

- [x] 3.1 `TreinoServiceImplTest`: novo caso em `addTreino` e em `lancarTreino` provando que o
      fallback usa `hojeResolver.hojeDe(atleta)` (data distinta de `LocalDate.now()`).
- [x] 3.2 `AtletaTreinoServiceImplTest`: novo caso provando que a janela de 7 dias usa
      `hojeResolver.hojeDe(atleta)`, não o relógio do servidor; teste de "atleta não encontrado"
      ajustado para o novo comportamento (carrega o atleta antes de validar).
- [x] 3.3 `StravaActivityServiceTest`: novos casos cobrindo (a) `startDateLocal` com sufixo "Z"
      (formato real do Strava) extrai a data literal certa; (b) sem sufixo de zona também funciona;
      (c) `startDateLocal` nulo usa `hojeResolver.hojeDe(atleta)`.
- [x] 3.4 `./mvnw clean verify` — **BUILD SUCCESS, 204 testes, 0 falhas, 0 erros.**
      (Nota: uma falha de descoberta de testes do JUnit5 por artefato de build incremental obsoleto
      — resolvida com `clean`, não é regressão desta change.)
      **Débito registrado, fora de escopo:** o campo `Clock clock` em `TreinoServiceImpl` ficou sem
      uso direto depois desta change (só sobrevive em comentários) — removê-lo tocaria o construtor
      e os mocks de vários testes; deixado como está para não expandir o escopo.
