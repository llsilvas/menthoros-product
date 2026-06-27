# ADR Index

## Purpose

This index tracks all Architecture Decision Records (ADRs) for Menthoros, their status, and replacement history.

## Conventions

- File naming: `ADR-XXXX-kebab-case-title.md`
- Numbering: sequential (`0001`, `0002`, ...)
- Status values: `Proposto`, `Aceito`, `Substituído`, `Rejeitado`
- If an ADR supersedes another, reference both records explicitly.

## ADR Catalog

| ADR | Título | Status | Data | Substitui | Substituído por |
|---|---|---|---|---|---|
| [ADR-0001-postgresql-como-banco-principal.md](./ADR-0001-postgresql-como-banco-principal.md) | Usar PostgreSQL como banco principal | Aceito | 2026-05-01 | - | - |
| [ADR-0002-openspec-como-gate-obrigatorio.md](./ADR-0002-openspec-como-gate-obrigatorio.md) | OpenSpec como gate obrigatório de feature | Aceito | 2026-05-01 | - | - |
| [ADR-0003-multi-tenancy-via-tenant-id-no-jwt.md](./ADR-0003-multi-tenancy-via-tenant-id-no-jwt.md) | Estratégia de multi-tenancy via `tenant_id` no JWT | Aceito | 2026-05-01 | - | - |
| [ADR-0004-flyway-como-unica-estrategia-de-schema.md](./ADR-0004-flyway-como-unica-estrategia-de-schema.md) | Flyway como única estratégia de evolução de schema | Aceito | 2026-05-01 | - | - |
| [ADR-0005-pipeline-de-ferramentas-ai-first.md](./ADR-0005-pipeline-de-ferramentas-ai-first.md) | Pipeline de ferramentas AI-first no ciclo de desenvolvimento | Aceito | 2026-05-01 | - | - |
| [ADR-0006-governanca-de-prompts-e-idioma.md](./ADR-0006-governanca-de-prompts-e-idioma.md) | Governança de prompts e política de idioma | Aceito | 2026-05-01 | - | - |
| [ADR-0007-backend-spring-boot-arquitetura-em-camadas.md](./ADR-0007-backend-spring-boot-arquitetura-em-camadas.md) | Backend em Spring Boot com arquitetura em camadas | Aceito | 2026-05-01 | - | - |
| [ADR-0008-frontend-react-typescript-contratos-tipados.md](./ADR-0008-frontend-react-typescript-contratos-tipados.md) | Frontend React + TypeScript com contratos tipados | Aceito | 2026-05-01 | - | - |
| [ADR-0009-gate-de-qualidade-em-pr.md](./ADR-0009-gate-de-qualidade-em-pr.md) | Gate de qualidade em Pull Requests | Aceito | 2026-05-01 | - | - |
| [ADR-0010-frontend-color-system-premium-v2.md](./ADR-0010-frontend-color-system-premium-v2.md) | Sistema de cor do frontend Premium v2.0 (instrument-grade) | Proposto | 2026-06-27 | - | - |

## Update Checklist

When creating or updating an ADR:

1. Create/update the ADR file using `ADR_TEMPLATE.md`.
2. Update this `INDEX.md` table.
3. If status changed to `Substituído`, fill replacement links in both ADRs.
4. Keep dates in `YYYY-MM-DD` format.
