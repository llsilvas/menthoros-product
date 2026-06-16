# Tasks: harden-actuator-admin-exposure

> **Foldada em `add-current-user-endpoint`** (decisão do usuário): implementada direto na branch
> `feature/add-current-user-endpoint`, não como branch separada. Esta change serve de registro.

## 1. Actuator health

- [x] 1.1 `management.endpoint.health.show-details: always` → `when-authorized` (`application.yml`).
  Anônimos recebem só `{"status":"UP"}`; detalhes de componentes só para autenticados.
- [x] 1.2 Probes do Railway continuam OK: o status geral segue sendo retornado em `/actuator/health`
  para chamadas anônimas (apenas os detalhes de componentes são omitidos). Sem mudança de config.
- [x] 1.3 `CoreSecurityConfigTest.should_hide_health_details_when_unauthenticated`: `/actuator/health`
  sem auth → 200 com `$.status` e sem `$.components`.

## 2. Isenção /api/admin/**

- [x] 2.1 Contrato documentado em `JwtTenantFilter.shouldNotFilter`: rotas admin são tenant-less por
  design (plataforma/provisionamento), protegidas por role admin, não por isolamento de tenant.
- [x] 2.2 Comportamento definido (Javadoc): rota admin que precise de tenant deve resolvê-lo
  explicitamente (por parâmetro), nunca via `getRequiredTenantId()` (evita `IllegalStateException`
  silenciosa → 403). Nenhuma rota `/api/admin/**` existe hoje no código.

## 3. Validação

- [x] 3.1 `./mvnw clean test` — verde.
