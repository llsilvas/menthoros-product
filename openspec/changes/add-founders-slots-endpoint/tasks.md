# Tasks — add-founders-slots-endpoint

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para rodar os ITs).

## Fonte de vagas

- [ ] 1.1 `FoundingInviteRepository`: método `countByInvalidatedAtIsNull()` (derivado, sem `@Query`
      — Spring Data resolve direto do nome). Validação: `./mvnw clean test`.
- [ ] 1.2 `app.founding-invite.total-slots` em `CacheProperties`-style `@ConfigurationProperties`
      (ou extensão de uma classe de properties já existente do domínio de convite, se houver) —
      `@Min(1)`, default `10`. Validação: `./mvnw clean test`.
- [ ] 1.3 Serviço (`FoundersSlotsService`/`Impl`): calcula `{total, taken, remaining, open}` a
      partir do método 1.1 e da property 1.2; `remaining = max(total - taken, 0)`,
      `open = remaining > 0`. Cache em processo (Caffeine, `expireAfterWrite` ~30s, mesmo padrão de
      `PublicEndpointRateLimitFilter.java`) — não usar o `CacheManager` compartilhado de
      `CacheConfig` (TTL único de 30min ali, documentado como gap conhecido). Validação:
      `./mvnw clean test` com teste unitário do cálculo (incluindo `taken >= total` não gerar
      `remaining` negativo).
- [ ] 1.4 `FoundersSlotsController`: `GET /api/v1/founders/slots`, público — registrar em
      `SecurityConfig` (ou onde as rotas públicas já são liberadas, ver `WaitlistController`/
      `StatusController` como referência) e em `PublicEndpointRateLimitFilter` se o endpoint
      precisar de rate limit próprio (decidir: é GET, baixo custo, idempotente — avaliar se cabe no
      padrão de `consultaConvite` ou se não precisa de limite por ser só leitura agregada). DTO de
      saída com `@Schema`/OpenAPI, seguindo o padrão de `WaitlistOutputDto`. Validação:
      `./mvnw clean test`.
- [ ] 1.5 Teste de integração (`FoundersSlotsControllerIT` ou nome equivalente ao padrão do repo):
      cobre os 5 critérios de aceite do `proposal.md` — contagem correta, convite invalidado não
      conta, vagas esgotadas (`remaining: 0`, `open: false`, nunca negativo), e a resposta do
      endpoint bate com o formato `{total, taken, remaining, open}`. Validação: `./mvnw clean
      verify`.
- [ ] 1.6 Confirmar manualmente (ou via teste) que a property `total-slots` muda sem alteração de
      código — setar via variável de ambiente numa execução local e checar a resposta do endpoint.
      Validação: inspeção manual, documentar o resultado aqui.
