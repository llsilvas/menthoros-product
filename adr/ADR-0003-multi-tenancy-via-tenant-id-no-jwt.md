# ADR 0003 - Estratégia de multi-tenancy via `tenant_id` no JWT

## Status
Aceito

## Data
2026-05-01

## Decisores
Arquiteto, Backend Lead, Security Lead

## Contexto
Menthoros atende múltiplas assessorias/coaches e precisa garantir isolamento lógico de dados entre tenants. O sistema já utiliza Keycloak e autenticação JWT no backend Spring Boot.

## Opções consideradas
1. Isolamento por `tenant_id` em claim de JWT com enforcement na aplicação
2. Banco por tenant
3. Schema por tenant

## Decisão
Adotar estratégia de isolamento por `tenant_id` no JWT, com enforcement na camada de aplicação e persistência.

Justificativa:
- Menor complexidade operacional inicial.
- Boa integração com stack atual (Keycloak + Spring Security).
- Permite escalar com governança de filtros e validações centralizadas.

## Consequências
### Positivas
- Menor custo operacional que estratégias de banco/schema por tenant.
- Onboarding de novos tenants mais rápido.
- Compatível com arquitetura atual do backend.

### Negativas / Trade-offs
- Forte dependência de enforcement correto em todos os fluxos.
- Risco alto se filtros/validações forem omitidos em algum ponto.
- Exige testes específicos de isolamento em rotas e repositórios.

## Plano de revisão
Revisar em 6 meses ou antes se houver:
- incidente de vazamento entre tenants;
- crescimento significativo de requisitos de isolamento/regulação;
- necessidade de segregação física por compliance.

## Referências
- `apps/menthoros-backend/src/main/java`
- `apps/menthoros-backend/CLAUDE.md`
- `apps/menthoros-backend/AGENTS.md`
