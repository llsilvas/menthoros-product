## Why

Não há um endpoint **público e leve** que informe nome da aplicação, versão e horário do servidor. O `/actuator/health` cobre liveness/readiness para a infra, mas expõe detalhes de actuator e não carrega versão de forma simples para consumo externo (frontend, monitor de uptime, smoke test de deploy). Um `/api/v1/status` enxuto serve a esse propósito sem acoplar o consumidor ao formato do actuator.

Esta change também é a **cobaia do workflow** (`/implement` → `/qa` → `/ship`): pequena, sem lógica de domínio e sem tenant — exercita justamente o caso de um controller que **não** usa `TenantContext` e, portanto, **não** leva `@RequireTenant`.

## What Changes

- Novo endpoint **`GET /api/v1/status`** (público, sem autenticação), retornando um record tipado com nome da app, versão e timestamp do servidor.
- `StatusController` seguindo os Controller Standards (sem Repository, `ResponseEntity<StatusOutputDto>`, `@Tag`/`@Operation`/`@ApiResponses`).
- `StatusOutputDto` como `record` com `@Schema`.
- Liberação do path `/api/v1/status` na configuração de segurança (permit-all), ao lado de `/actuator/health`.

## Capabilities

### Added Capabilities

- `app-status`: status público da aplicação (nome, versão, horário do servidor) para frontend, monitores de uptime e smoke test de deploy — independente do formato do actuator.

## Impact

**Código novo:**
- `controller/StatusController.java` (GET `/api/v1/status`; **sem** `@RequireTenant` — não usa tenant).
- `dto/output/StatusOutputDto.java` (`record` com `application`, `version`, `timestamp`).
- Teste: `controller/StatusControllerTest.java` (ou `@WebMvcTest`).

**Código alterado:**
- Configuração de segurança: adicionar `/api/v1/status` à lista de paths públicos (junto de `/actuator/health`).

**Sem impacto em banco** (nenhuma migration). **Sem tenant** (endpoint global).

**Fonte da versão:** usar propriedade `app.version` (default a partir do `project.version`, hoje `1.0.0`) injetada via `@Value`. Opcional (fora do escopo mínimo): expor via `BuildProperties` habilitando o goal `build-info` do `spring-boot-maven-plugin`.

## Riscos e mitigações

- **Expor versão publicamente pode dar dica a um atacante** (impacto Baixo): versão de app é informação de baixa sensibilidade; não expor commit hash, perfis, nem variáveis de ambiente. Manter o DTO mínimo.
- **Duplicar responsabilidade do actuator** (impacto Baixo): escopo deliberadamente distinto — `/actuator/health` para infra; `/api/v1/status` para consumo de produto. Não replicar checks de saúde de dependências aqui.
