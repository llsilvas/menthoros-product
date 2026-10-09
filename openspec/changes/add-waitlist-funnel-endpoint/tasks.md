# Tasks — add-waitlist-funnel-endpoint

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## Agregação

- [x] 1.1 `WaitlistFunnelBucketOutputDto` com `utmSource`, `utmContent`, `total`, `qualified`,
      `invited`, `active`; o controller devolve `List<WaitlistFunnelBucketOutputDto>` direto, sem
      wrapper (`@ArraySchema` no OpenAPI). `@Schema` em todos os campos.
- [x] 1.2 `WaitlistFunnelService`/`WaitlistFunnelServiceImpl`: `WaitlistRepository.findAll()` +
      filtro de período em memória (`isBefore`/`isAfter`, semântica inclusiva nas duas bordas) e
      `FoundingInviteRepository.findAll()`, indexado por `waitlistId` via `groupingBy` (sem N+1 —
      as duas chamadas rodam uma vez cada, fora de qualquer loop); invited = convite não
      invalidado, active = convite com `convertedAt` não nulo; agrupa por `(utmSource, utmContent)`
      incluindo o grupo `null/null`. Desempate determinístico na ordenação (por `total` desc, depois
      `utmSource`/`utmContent`) — achado do QA gate, grupos empatados não tinham ordem estável.
      7 testes unitários (`WaitlistFunnelServiceImplTest`), incluindo um de borda exata do período
      (`createdAt == desde`/`== ate`), também achado do QA gate. Validação: `./mvnw clean test`.
- [x] 1.3 `WaitlistFunnelController`: `GET /api/admin/waitlist/funnel`,
      `@PreAuthorize("hasRole('ADMIN')")`, params opcionais `desde`/`ate` (`Instant`, ISO-8601) —
      mesmo padrão de `FoundingInviteAdminController`/`CoreSecurityConfig` (rota `/api/admin/**` já
      isenta do `JwtTenantFilter`, `@EnableMethodSecurity` + `jwtAuthenticationConverter` mapeando
      `realm_access.roles`). 3 testes `@WebMvcTest` (ADMIN 200, TECNICO 403, sem JWT 401).
      Validação: `./mvnw clean test`.

## Testes de ponta a ponta

- [x] 2.1 `WaitlistFunnelControllerIT`: agregação correta contra Postgres real (Testcontainers),
      convite não convertido conta como `invited`, convertido também conta como `active`, e
      `SecurityMockMvcRequestPostProcessors.jwt()` exercitando o filtro de segurança completo (não
      só a slice) — ADMIN 200, sem role 403.
- [x] 2.2 `./mvnw clean verify` completo: **4513 testes unitários/slice (0 falhas, 1 skip
      pré-existente) + 213 testes de integração (0 falhas)**. (Uma primeira tentativa reportou 248
      erros não relacionados — Docker Desktop havia parado entre sessões, derrubando todo
      Testcontainers; reiniciado e a suíte voltou a verde, confirmando que não era regressão desta
      change.)

## QA gate (Fast track: code-reviewer)

- [x] 3.1 Revisão via `menthoros-workflow:code-reviewer`: sem achados Critical/Important. Confirmou
      JavaDoc mandatório correto (`Tenant-aware: NO` genuíno — `Waitlist`/`FoundingInvite` não têm
      coluna de tenant, não é o caso ambíguo "cross-tenant por design"), identifier language
      consistente com o precedente já aceito em `WaitlistServiceImpl`, ausência de N+1, e wiring de
      segurança idêntico ao de `FoundingInviteAdminController` (verificado linha a linha, não só por
      semelhança superficial). 2 achados Minor corrigidos nesta rodada: desempate de ordenação e
      teste de borda do filtro de período (ambos descritos acima).
