## 1. Cálculo dinâmico do volume realizado

- [x] 1.1 Em `PlanoServiceImpl`, criar método privado `calcularVolumeRealizadoKm(UUID atletaId, LocalDate semanaInicio, LocalDate semanaFim)` que chama `treinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween(atletaId, semanaInicio, semanaFim)` e soma `distanciaKm` (tratando `null` como `0`, via `Optional.ofNullable(t.getDistanciaKm()).orElse(BigDecimal.ZERO)`)
- [x] 1.2 Atualizar `PlanoServiceImpl.buscarPlanoPorAtleta()` para calcular o volume via 1.1 e sobrescrever o DTO já mapeado com `planoSemanalMapper.toOutputDto(planoSemanal).toBuilder().volumeRealizadoKm(volume).build()` (mesmo padrão de `PlanoReviewServiceImpl.enriquecerComConfidenceTier()`) — sem alterar `PlanoSemanalMapper`
- [x] 1.3 Validação: `./mvnw clean test`

## 2. Testes

- [x] 2.1 `PlanoServiceImplTest` — `buscarPlanoPorAtleta`: dado um atleta com treinos via `.fit`/Strava/coach (sem `treinoPlanejadoId` vinculado) dentro da semana do plano, `volumeRealizadoKm` no DTO retornado reflete a soma correta (mock de `treinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween`)
- [x] 2.2 Treino fora da janela `semanaInicio`/`semanaFim` não é somado — coberto por construção: o mock só stuba a query para a janela exata do plano, e a exclusão de datas fora da janela é responsabilidade do próprio `findByAtletaIdAndDataTreinoBetween` (derived query já usada e coberta em outros serviços); não há lógica adicional no código novo que precise de teste isolado para esse caso
- [x] 2.3 `PlanoServiceImplTest` — plano sem nenhum treino realizado retorna `volumeRealizadoKm = 0` (não `null`, não lança exceção)
- [x] 2.4 `PlanoServiceImplTest` — treino com `distanciaKm = null` não quebra a soma (tratado como `0`)
- [x] 2.5 Validação: `./mvnw clean test` — `PlanoServiceImplTest` completo: 28/28 passando. Suíte completa do módulo (`./mvnw clean test`) tem 102 erros pré-existentes em 4 classes de teste de integração (`RaceProjectionSnapshotRepositoryTest`, `RepositoryTenantIsolationTest`, `SkillExecutionRepositoryTest`, `TreinoPlanejadoRepositoryTest`) por falha de contexto Spring/Testcontainers — confirmado via `git stash` que ocorrem identicamente sem as mudanças deste change (ambiente local, não é regressão introduzida aqui)

## 3. Validação manual (smoke)

- [x] 3.1 Backend local rodado contra Postgres/Keycloak reais (homelab, via `.env`), autenticado como atleta real (`leandro`, org `Assessoria Demo`); registrado treino manual sem `treinoPlanejadoId` vinculado (2026-07-22, 6.3km, dia sem treino planejado) via `POST /api/v1/atletas/me/treinos` — caminho historicamente quebrado (sem match, sem atualizar `volumeRealizadoKm`)
- [x] 3.2 `GET /api/v1/planos/{atletaId}` antes: `volumeRealizadoKm=12.62`; depois do registro: `volumeRealizadoKm=18.92` (12.62 + 6.3) — confirma que o endpoint consumido pela tela `/athlete/plan` reflete o treino imediatamente, sem job assíncrono
- [x] 3.3 Validação: `./mvnw clean test` já executada na Task 2.5 (regressão final) — nenhuma alteração de frontend necessária, não roda `npm run build`
