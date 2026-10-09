# Tasks — add-waitlist-funnel-endpoint

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## Agregação

- [ ] 1.1 `WaitlistFunnelBucketOutputDto` (ou nome equivalente) com `utmSource`, `utmContent`,
      `total`, `qualified`, `invited`, `active`; `WaitlistFunnelOutputDto` como lista desses
      buckets. `@Schema`/OpenAPI nos dois.
- [ ] 1.2 `WaitlistFunnelService`/`Impl`: lê `WaitlistRepository.findAll()` (com filtro opcional de
      período aplicado em memória ou via query derivada `findByCreatedAtBetween`) e
      `FoundingInviteRepository.findAll()`; indexa convites por `waitlistId` (invited = existe
      convite não invalidado; active = existe convite com `convertedAt` não nulo); agrupa por
      `(utmSource, utmContent)`, incluindo o grupo `null/null`. Validação: `./mvnw clean test` com
      testes unitários cobrindo os critérios 1-4.
- [ ] 1.3 `FoundersSlotsController`-like `WaitlistFunnelController`: `GET
      /api/admin/waitlist/funnel`, `@PreAuthorize("hasRole('ADMIN')")`, params opcionais
      `desde`/`ate` (`LocalDate`). Validação: `./mvnw clean test`.

## Testes de ponta a ponta

- [ ] 2.1 Teste de integração cobrindo os 6 critérios de aceite do `proposal.md`: agregação
      correta, `invited`/`active` a partir de `FoundingInvite`, grupo sem UTM, 403/401 sem role
      `ADMIN`, filtro de período. Mesmo padrão de IT de `FoundersSlotsControllerIT` (JWT com role
      `ADMIN` — ver como outros testes admin montam o token, ex.
      `FoundingInviteAdminControllerTest`/IT equivalente).
- [ ] 2.2 `./mvnw clean verify` completo (suíte inteira) sem regressão. Validação: registrar total
      de testes e falhas aqui.
