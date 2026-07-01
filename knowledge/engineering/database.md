# Banco de Dados — Convenções do Menthoros

> Resumo: como o schema é versionado e as convenções de tabela que toda PRD com
> impacto em dados precisa considerar. Uma feature que exija nova tabela ou coluna
> deve nascer já compatível com essas regras — evita retrabalho na fase de
> implementação.

## O que é

- **PostgreSQL** como banco relacional único.
- **Flyway** para versionamento de schema — toda mudança de schema é uma migration
  versionada em `apps/menthoros-backend/src/main/resources/db/migration`.
- **pgvector** já é dependência do projeto (`com.pgvector:pgvector`), preparando
  terreno para `PgVectorStore` no roadmap de RAG (sprints 12-14 do roadmap macro).
- Migration mais recente relevante hoje: **V45** (reconciliação de schema).

## Por que importa para o Menthoros

- **Nenhuma mudança de schema fora de uma migration Flyway.** Uma PRD não deve
  assumir alteração direta de tabela em produção — sempre vira uma migration
  numerada, nunca uma edição de migration já aplicada.
- **Toda tabela nova segue convenções de nomenclatura fixas** (prefixo `tb_`,
  colunas snake_case, PK sempre UUID) — isso deveria já estar refletido em
  qualquer proposta de modelo de dados dentro de uma PRD/design técnico.
- **`tenant_id` é obrigatório em toda tabela com dado sensível**, mas **sem FK
  constraint** — o isolamento é garantido na camada de aplicação
  (`TenantContext`), não no banco. Uma PRD que proponha uma nova entidade
  multi-tenant deve prever a coluna `tenant_id` desde o desenho inicial.
- **pgvector já está disponível como dependência** — uma PRD de RAG/busca semântica
  não precisa propor adoção de uma nova lib de vetor; a infraestrutura já existe,
  falta o `PgVectorStore` ser efetivamente configurado (change
  `rag-tool-calling-prescription-engine`, sprints 12-14).

## Detalhes / modelo

### Padrão de tabela nova (obrigatório)

**Nomenclatura**
- Prefixo `tb_` + snake_case (ex. `tb_race_projection_snapshot`).
- Colunas em snake_case.

**Chave primária**
- Sempre `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Nunca `BIGSERIAL`, `SERIAL`, ou `AUTO_INCREMENT`.

**Chaves estrangeiras**
- `UUID [NOT NULL] REFERENCES tb_xxx(id) ON DELETE CASCADE` (ou `SET NULL` quando
  opcional).
- `tenant_id UUID NOT NULL` — sem FK, isolamento garantido na aplicação.

**Timestamps**
- `TIMESTAMPTZ NOT NULL DEFAULT NOW()` para criação.
- `TIMESTAMPTZ` nullable para eventos opcionais (`reviewed_at`, `synced_at`).
- Nunca `TIMESTAMP` sem timezone em tabela nova.

**Constraints e índices**
- Constraints nomeadas explicitamente: `CONSTRAINT uk_<table>_<cols> UNIQUE (...)`.
- `CREATE INDEX IF NOT EXISTS idx_<table>_<column> ON tb_xxx(col);`
- Índice composto `(tenant_id, <coluna_de_busca_principal>)` obrigatório em toda
  tabela tenant-scoped.

### Estrutura de arquivo de migration
```sql
-- =====================================================================
-- Vxx: Descrição curta do que a migration faz
-- =====================================================================

CREATE TABLE IF NOT EXISTS tb_xxx ( ... );

CREATE INDEX IF NOT EXISTS idx_xxx_col ON tb_xxx(col);

DO $$
BEGIN
    RAISE NOTICE '✅ Vxx - tb_xxx criada com sucesso';
END$$;
```

Número de versão: sempre conferir o último arquivo em `db/migration/` e
incrementar em 1 (ex. `V45` → `V46`).

## Fontes

- `apps/menthoros-backend/CLAUDE.md` (seção "Database and Migration Rules" /
  "Table Design Standards").
- `apps/menthoros-backend/src/main/resources/db/migration/` (histórico real de
  migrations, V1 a V45).
- `apps/menthoros-backend/pom.xml` (dependências `flyway-core`,
  `flyway-database-postgresql`, `pgvector`, `postgresql`).

## Status: fato estabelecido
