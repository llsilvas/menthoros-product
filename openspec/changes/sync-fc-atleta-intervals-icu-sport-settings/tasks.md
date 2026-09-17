# tasks — sync-fc-atleta-intervals-icu-sport-settings

Repositório único: `apps/menthoros-backend`, branch `feature/sync-fc-atleta-intervals-icu-sport-settings`.

## 1. Client HTTP

- [ ] 1.1 `IntervalsIcuClient` — declarar `void atualizarSportSettings(String token, String
      externalAthleteId, String sportSettingsId, JsonNode payload)`, Javadoc citando
      `PUT /api/v1/athlete/{id}/sport-settings/{id}?recalcHrZones=true`.
- [ ] 1.2 Testes (WireMock, seguindo `IntervalsIcuClientImplTest`): PUT com Bearer correto e corpo
      `{"lthr":142,"max_hr":172}` → sucesso (`toBodilessEntity`); erro HTTP (404/500) →
      `IntervalsIcuApiException` com o status certo; token não vaza em log (mesmo padrão de
      `tokenNaoVazaEmLogNem401`).
- [ ] 1.3 `IntervalsIcuClientImpl.atualizarSportSettings` — implementação no mesmo estilo de
      `atualizarEvento` (`executa("atualizar sport-settings", ...)`), `.uri(...,
      "recalcHrZones", true)` como query param.
      *verify:* os testes de 1.2 passam.

## 2. Hook na conexão OAuth

- [ ] 2.1 Teste que falha: `IntervalsIcuOAuthServiceImplTest` (ou onde já existir cobertura de
      `exchangeCodeForToken`) — atleta com `fcLimiar=142`/`fcMaxima=172` conecta com sucesso →
      `intervalsIcuClient.atualizarSportSettings` chamado com `{"lthr":142,"max_hr":172}` (CA1).
- [ ] 2.2 Teste que falha: atleta com `fcLimiar=null`/`fcMaxima=null` conecta → nenhuma chamada de
      sport-settings (CA2).
- [ ] 2.3 Teste que falha: atleta com só `fcLimiar=142` (`fcMaxima=null`) conecta → corpo
      `{"lthr":142}`, sem `max_hr` (CA4).
- [ ] 2.4 Teste que falha: `atualizarSportSettings` lança `IntervalsIcuApiException` → método ainda
      retorna `Resultado.SUCESSO`, exceção não propaga, log sem o token (CA3).
- [ ] 2.5 Implementação em `IntervalsIcuOAuthServiceImpl.exchangeCodeForToken`: logo após o passo 7
      existente (`pausarStravaAutomaticamente`), método privado `sincronizarFcBestEffort(atleta,
      token.accessToken(), externalAthleteId)` — monta o `JsonNode` só com os campos não-nulos,
      `return` cedo se ambos forem `null` (sem chamada), `try/catch (RuntimeException)` em volta da
      chamada ao client, log de aviso sem token no catch.
      *verify:* os 4 testes (2.1–2.4) passam; `./mvnw test -Dtest=IntervalsIcuOAuthServiceImplTest`.

## 3. Validação e fechamento

- [ ] 3.1 `./mvnw clean verify` verde.
- [ ] 3.2 PR `feature/sync-fc-atleta-intervals-icu-sport-settings` → `develop`.
