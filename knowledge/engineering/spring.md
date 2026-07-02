# Spring — Convenções do Backend Menthoros

> Resumo: como o Spring Boot é configurado e usado no backend — segurança, IA,
> observabilidade e as convenções de controller/service que toda PRD com escopo
> backend precisa respeitar ao descrever endpoints ou fluxos.

## O que é

- **Spring Boot 3.5.x** (`spring-boot-starter-parent` 3.5.14), Spring Data JPA,
  Spring Security OAuth2 Resource Server.
- **Spring AI** (`1.1.6`) para integração com OpenAI e Anthropic.
- **springdoc-openapi** (`2.8.5`) gera a documentação OpenAPI consumida pelo
  gerador de cliente do front.
- **Micrometer + Prometheus** para métricas.
- **Resilience4j** disponível para circuit breaker (adoção formal ainda pendente,
  ver `knowledge/engineering/integrations.md`).

## Por que importa para o Menthoros

- **Todo endpoint segue o prefixo `/api/v1/` + nome de recurso no plural** (ex.
  `/api/v1/atletas`, `/api/v1/planos`). Uma PRD que proponha um endpoint deve
  já nascer com esse padrão em mente.
- **Controllers não têm lógica de negócio nem try/catch para erro HTTP.** Toda
  regra de negócio vive no service; todo mapeamento de exceção para status HTTP
  vive centralizado em `GlobalExceptionHandler` (`@RestControllerAdvice`). Uma
  nova exceção de domínio sempre implica um `@ExceptionHandler` novo no mesmo PR.
- **Retorno de controller é sempre `ResponseEntity<Xxx>` tipado** — nunca
  `Map<String, Object>` cru. Isso afeta como o cliente gerado do front tipa a
  resposta; um retorno mal tipado quebra silenciosamente o cliente TypeScript.
- **`@Tag` do Swagger precisa de `name` ASCII kebab-case** (sem acento/espaço) —
  o gerador de cliente do front deriva o nome do serviço TypeScript a partir desse
  campo. Um nome PT-BR acentuado gera serviço corrompido no front
  (`AnLiseDeTreinoService`). Texto rico em PT-BR vai na `description`, não no `name`.
- **Endpoints de coleção (`List<>`) precisam declarar `array` explicitamente no
  200**, ou omitir o schema override e deixar o springdoc inferir do tipo de
  retorno. Um `@Schema(implementation = X.class)` solto em endpoint de lista gera
  tipo de **objeto único** no cliente do front, quebrando `.map`/`.slice` em
  runtime — bug silencioso clássico dessa stack.
- **Resolução de tenant é sempre via `TenantContext.getRequiredTenantId()`**, nunca
  lendo `@RequestHeader("X-Tenant-ID")` manualmente no controller — isso bypassa o
  filtro de tenant (`JwtTenantFilter`) e quebra o isolamento multi-tenant.

## Detalhes / modelo

### Anotação de tenant em endpoint de recurso
```java
@GetMapping("/{id}")
@RequireTenant(resourceParamIndex = 0)  // valida que {id} pertence ao tenant atual
public ResponseEntity<AtletaOutputDto> getAtleta(@PathVariable UUID id) { ... }
```
`@RequireTenant` é anotação de método, não de classe. Endpoints self-resolving (ex.
`GET /me`, que resolve o chamador pelo `sub` do JWT) não usam essa anotação — devem
documentar a omissão em comentário.

### Semântica HTTP
- `GET`: leitura, sem efeito colateral.
- `POST`: criação ou ação (inclusive operações que mutam estado, como
  recalcular/sincronizar).
- `PUT`: atualização completa.
- `PATCH`: atualização parcial.
- `DELETE`: remoção, retorna 204.

### Injeção de dependência
Preferir `@RequiredArgsConstructor` (Lombok) para injeção via construtor, todos os
campos injetados `private final`.

## Fontes

- `apps/menthoros-backend/pom.xml` (versões de Spring Boot, Spring AI, springdoc).
- `apps/menthoros-backend/CLAUDE.md` (seção "Controller Standards").

## Status: fato estabelecido
