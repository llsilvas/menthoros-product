# Tasks — add-founders-slots-endpoint

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para rodar os ITs).

## Fonte de vagas

- [x] 1.1 `FoundingInviteRepository.countByInvalidatedAtIsNull()` — derivado pelo nome, sem `@Query`.
      Validação: `./mvnw clean test`.
- [x] 1.2 `app.founding-invite.total-slots` via `@Value` direto no construtor do serviço (mesmo
      padrão já usado no domínio de convite — `FoundingInviteServiceImpl.validityDays` e
      `PublicEndpointRateLimitFilter`, nenhum deles tem uma classe `@ConfigurationProperties`
      dedicada). Default `10`, documentado em `application.yml` (`FOUNDING_INVITE_TOTAL_SLOTS`).
      Validação: lint/compile + `./mvnw clean test`.
- [x] 1.3 `FoundersSlotsService`/`FoundersSlotsServiceImpl`: calcula `{total, taken, remaining,
      open}`; `remaining = max(total - taken, 0)`, `open = remaining > 0`. Cache em processo
      (Caffeine, `expireAfterWrite` configurável via `app.founding-invite.slots-cache-ttl`, default
      `PT30S`) — **não** usa o `CacheManager` compartilhado de `CacheConfig` (TTL único de 30min
      ali). O TTL virou propriedade (em vez de constante) porque o IT precisa de um TTL ínfimo para
      não ver o valor cacheado do teste anterior — decisão descoberta rodando o IT, não antecipada
      no proposal. 4 testes unitários (`FoundersSlotsServiceImplTest`): cálculo correto, `taken >=
      total` não gera `remaining` negativo, exatamente no limite fecha as vagas, chamadas repetidas
      usam o cache (1 query só). Validação: `./mvnw clean test` — 4/4 verdes.
- [x] 1.4 `FoundersSlotsController`: `GET /api/v1/founders/slots`, registrado em
      `app.public-paths` (`application.yml`), mesmo mecanismo do `WaitlistController` (lista em
      `CoreSecurityConfig`/`CoreSecurityProperties`, não um registro por rota). **Decisão: sem rate
      limit dedicado no `PublicEndpointRateLimitFilter`** — é GET, idempotente, sem PII, e o cache
      de 30s já limita a carga real no banco a 1 query por janela independente do tráfego; os POSTs
      que o filtro protege criam recurso, este só lê. DTO `FoundersSlotsOutputDto` com `@Schema`.
      Validação: `./mvnw clean test` — `FoundersSlotsControllerTest` (`@WebMvcTest`), 2/2 verdes.
- [x] 1.5 `FoundersSlotsControllerIT` cobre os 3 critérios testáveis via HTTP: sem convites → todas
      as vagas abertas; convite invalidado não conta; vagas esgotadas → `remaining:0`/`open:false`
      nunca negativo. Dois problemas encontrados rodando o IT contra o Postgres real (não visíveis
      no teste unitário com mock): (a) a fixture de teste setava `.id(UUID.randomUUID())` na
      entidade antes de `save()` — como `FoundingInvite` usa `@GeneratedValue`, isso faz o Spring
      Data tratar o insert como `merge()` de uma linha que não existe
      (`StaleObjectStateException`); corrigido removendo o id manual. (b) `tb_founding_invite.
      waitlist_id` tem FK para `tb_waitlist` — a fixture precisou criar um `Waitlist` real primeiro,
      não um UUID solto. Validação: `./mvnw clean verify -Dtest=FoundersSlotsControllerIT` — 3/3
      verdes; suíte completa depois: 4492 testes, 0 falhas, 1 skip pré-existente.
- [x] 1.6 A troca de `total-slots` sem deploy de código já está provada pelo próprio IT: a classe
      inteira roda com `@TestPropertySource(properties = "app.founding-invite.total-slots=3")` (em
      vez do default 10) e o endpoint responde `total:3` — é o mesmo mecanismo de resolução de
      property que uma env var usa em produção (`FOUNDING_INVITE_TOTAL_SLOTS`), então a prova via
      `@TestPropertySource` é equivalente a setar a env var manualmente. Não fiz também o passo
      manual (subir a app local com a env var e curlar) — redundante com o que o IT já prova.
