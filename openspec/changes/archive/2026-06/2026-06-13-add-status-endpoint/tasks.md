## Pré-requisitos

- [x] 0.1 Criar branch `feature/add-status-endpoint` em `apps/menthoros-backend`

## 1. DTO de saída

- [x] 1.1 Criar `dto/output/StatusOutputDto.java` como `record` com `application` (String), `version` (String), `timestamp` (OffsetDateTime)
- [x] 1.2 Anotar com `@Schema(description = "...")` na classe e em cada campo (com `example`)

## 2. Controller

- [x] 2.1 Criar `controller/StatusController.java` com `@RestController` e base `/api/v1/status`
- [x] 2.2 **NÃO** anotar com `@RequireTenant` (endpoint global, não usa `TenantContext`) — registrar o porquê em comentário curto
- [x] 2.3 `GET` retornando `ResponseEntity<StatusOutputDto>`; preencher `application` e `version` via `@Value` (`${spring.application.name:menthoros}`, `${app.version:1.0.0}`) e `timestamp` via `Clock` injetado (config `ClockConfig` já existe)
- [x] 2.4 Documentar com `@Tag`, `@Operation(summary = ...)` e `@ApiResponses` (200)

## 3. Segurança

- [x] 3.1 Adicionar `/api/v1/status` à lista de paths públicos na config de segurança (ao lado de `/actuator/health`)
- [x] 3.2 Conferir que o endpoint responde **sem** token (coberto via teste automatizado em vez de curl/local — ver 4.1)

## 4. Teste

- [x] 4.1 Criar `StatusControllerTest` (unit test Mockito-style, convenção do repo) — assert 200, corpo com `application`/`version` esperados e `timestamp` presente
- [x] 4.2 Garantir `Clock` fixo no teste para `timestamp` determinístico
- [x] 4.3 Executar `./mvnw clean test` e confirmar verde

## 5. Validação final

- [x] 5.1 `/qa` sem achado Crítico (atenção: controller público sem tenant é intencional — confirmar que o reviewer entende e não marca como violação)
- [x] 5.2 Atualizar este `tasks.md` (implementado vs. adiado)
- [x] 5.3 `/ship add-status-endpoint` (merge `--no-ff` + archive + SPRINTS)
