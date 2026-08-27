# Tasks — kudos-janela-recentes

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`.

## 1. Janela de 7 dias para kudos recentes

- [x] 1.1 `KudosRepository`: trocar `findTop10ByAtletaIdAndTenantIdOrderByCreatedAtDesc` (LIMIT 10)
      por uma query filtrada por `createdAt >= :desde`, sem LIMIT, mesma ordenação
      (`ORDER BY createdAt DESC`). Renomear para refletir o novo contrato (ex.:
      `findRecentesByAtletaIdAndTenantId(atletaId, tenantId, desde)`).
      **Achado do DoR (Codex, confirmado):** atualizar também a documentação pública que promete
      "até os 10 kudos mais recentes" — `KudosService.listarRecentes` JavaDoc
      (`services/KudosService.java:37`) e `@Operation(description=...)` de
      `GET /me/kudos/recentes` (`controller/AtletaKudosController.java:33`) — para "kudos dos
      últimos 7 dias, mais recente primeiro". Semântica pública muda, não só o payload.
- [x] 1.2 `KudosServiceImpl.listarRecentes`: calcular
      `desde = Instant.now(clock).minus(7, ChronoUnit.DAYS)` e passar para o novo método do
      repository.
      Testes (`KudosServiceImplTest`, `Clock` fixo): kudo de 6 dias aparece; kudo de 8 dias não
      aparece; kudo de exatamente 7 dias aparece (limite inclusivo); sem kudos na janela → lista
      vazia; tenant preservado (kudo de outro tenant não aparece — se já não houver teste
      cobrindo isso).
      verify: `./mvnw clean test`.
