**Tamanho:** S · **Trilha:** Fast

# Proposal: harden-actuator-admin-exposure

## Status

Proposed

## Why

Auditoria de segurança do QA de `add-current-user-endpoint` apontou duas exposições pré-existentes:

1. `management.endpoint.health.show-details: always` (`application.yml`) com `/actuator/health` em
   `public-paths` — expõe detalhes de dependências (banco, pool, status de componentes) sem
   autenticação.
2. `JwtTenantFilter.shouldNotFilter` isenta `/api/admin/**` incondicionalmente, sem contrato
   documentado. Um controller sob esse prefixo que chame `TenantContext.getRequiredTenantId()` falha
   com `IllegalStateException` → 403 difícil de diagnosticar.

## What Changes

- `health.show-details` para `when-authorized` (ou `never` em produção); manter o liveness/readiness
  público mínimo necessário.
- Documentar e endurecer a isenção `/api/admin/**`: explicitar quais rotas admin são tenant-less por
  contrato e o comportamento esperado para as que precisam de tenant.

## Impact

- **Arquivos de produção (trabalho futuro):** `application.yml` (+ perfis), `JwtTenantFilter` /
  documentação de contrato. Sem migração nova.
- **Comportamento:** detalhes do health deixam de ser públicos — ajuste de monitoração externa pode
  ser necessário (verificar probes do Railway).
- Descoberto em: QA de `add-current-user-endpoint` (sec#5, sec#6).
