# ADR 0001 - Usar PostgreSQL como banco principal

## Status
Aceito

## Data
2026-05-01

## Decisores
Tech Lead, Arquiteto, Backend Lead

## Contexto
O Menthoros precisa armazenar dados transacionais de domínio (atletas, treinos, planos, métricas), garantir consistência e suportar evolução de schema com segurança. O backend atual já usa Spring Boot/JPA e há necessidade de consultas relacionais, integridade referencial e suporte a extensões para IA (embeddings via `pgvector`).

## Opções consideradas
1. PostgreSQL
2. MySQL
3. MongoDB

## Decisão
Adotar PostgreSQL como banco principal do sistema.

Justificativa:
- Excelente suporte relacional e consistência transacional.
- Ecossistema maduro com Spring Data JPA e Flyway.
- Suporte a `pgvector` para funcionalidades de IA sem introduzir outro banco.
- Boa observabilidade e tooling operacional para ambientes locais e cloud.

## Consequências
### Positivas
- Forte consistência para regras de negócio críticas.
- Menor complexidade arquitetural ao centralizar dados transacionais e vetoriais no mesmo engine.
- Evolução de schema controlada por migrations versionadas.

### Negativas / Trade-offs
- Necessidade de governança de migrations e tuning de índices.
- Escalabilidade horizontal exige estratégia (replicação, particionamento, caching).
- Custo de operação pode crescer com aumento de carga analítica.

## Plano de revisão
Revisar esta decisão em 6 meses ou antes se ocorrer um dos gatilhos:
- crescimento de carga acima do esperado;
- degradação recorrente de performance em consultas críticas;
- necessidade de workloads analíticas que justifiquem arquitetura híbrida.

## Referências
- `apps/menthoros-backend/pom.xml`
- `apps/menthoros-backend/src/main/resources/db/migration`
- `menthoros-product/openspec`
