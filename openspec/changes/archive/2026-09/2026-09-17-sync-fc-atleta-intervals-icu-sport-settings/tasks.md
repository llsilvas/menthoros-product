# tasks — sync-fc-atleta-intervals-icu-sport-settings

Repositório único: `apps/menthoros-backend`, branch `feature/sync-fc-atleta-intervals-icu-sport-settings`.

## 1. Client HTTP

- [x] 1.1 **Feito.** `IntervalsIcuClient.atualizarSportSettings(String token, String
      externalAthleteId, String sportSettingsId, JsonNode payload)` declarado, Javadoc citando
      `PUT /api/v1/athlete/{id}/sport-settings/{id}?recalcHrZones=true`.
- [x] 1.2 **Feito** (3 testes, `IntervalsIcuClientImplTest$AtualizarSportSettings`, WireMock). PUT
      com Bearer + `recalcHrZones=true` + corpo `{"lthr":142,"max_hr":172}` → sucesso; erro HTTP
      404 → `IntervalsIcuApiException` com status certo; token não vaza em log (500).
- [x] 1.3 **Feito.** `IntervalsIcuClientImpl.atualizarSportSettings` — mesmo estilo de
      `atualizarEvento` (`executa("atualizar sport-settings", ...)`), `recalcHrZones=true` como
      query param via `UriBuilder`.
      *verify:* 30/30 em `IntervalsIcuClientImplTest`.

## 2. Hook na conexão OAuth

- [x] 2.1 **Feito.** Teste RED confirmado antes do fix (CA1): `sincronizaFcQuandoAtletaTemAmbos` —
      atleta com `fcLimiar=142`/`fcMaxima=172` conecta → `atualizarSportSettings` chamado com
      `{"lthr":142,"max_hr":172}`.
- [x] 2.2 **Feito.** Teste (CA2): `naoSincronizaQuandoAtletaSemFc` — atleta sem `fcLimiar` nem
      `fcMaxima` conecta → nenhuma chamada de sport-settings. Já passava antes do fix (hoje nunca
      chama); serve de regressão daqui pra frente.
- [x] 2.3 **Feito.** Teste RED confirmado (CA4): `sincronizaSoLthrQuandoFaltaFcMaxima` — só
      `fcLimiar=142` → corpo `{"lthr":142}`, sem `max_hr`.
- [x] 2.4 **Feito.** Teste (CA3): `falhaNoSyncNaoDerrubaConexao` — `atualizarSportSettings` lança
      `IntervalsIcuApiException` → `exchangeCodeForToken` ainda retorna `Resultado.SUCESSO`.
- [x] 2.5 **Feito.** `IntervalsIcuOAuthServiceImpl.exchangeCodeForToken` — passo 8, logo após
      `pausarStravaAutomaticamente`: `sincronizarFcBestEffort(atleta, token.accessToken(),
      externalAthleteId)` — monta o `JsonNode` só com os campos não-nulos, retorna cedo se ambos
      forem `null`, `try/catch (RuntimeException)` com log sem o token.
      *verify:* 26/26 em `IntervalsIcuOAuthServiceImplTest`.

## 3. Validação e fechamento

- [x] 3.1 **Feito.** `./mvnw clean verify` verde — 190 testes de integração, 0 falhas.
- [x] 3.2 **Feito.** PR **#132** `feature/sync-fc-atleta-intervals-icu-sport-settings` → `develop`,
      mergeado em 2026-09-17.
