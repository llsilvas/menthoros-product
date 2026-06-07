## 0. Pré-requisito: Exception Handler para Tenant Ausente

- [x] 0.1 `GlobalExceptionHandler`: `@ExceptionHandler(IllegalStateException.class)` retorna 403 com mensagem genérica segura

## 1. Segurança: Autenticação Obrigatória

- [x] 1.1 `SecurityConfig` já usava `.anyRequest().authenticated()` — pré-existente, nenhuma mudança necessária
- [x] 1.2 Rotas públicas (`/swagger-ui/**`, `/api-docs/**`, `/actuator/health`) confirmadas com `permitAll` via `CoreSecurityProperties`
- [x] 1.3 Testes confirmam 401 para endpoints sem JWT — SecurityConfig correto
- [ ] 1.4 `application-local.yml` com profile local — **adiado para pós-piloto**
- [ ] 1.5 Mock JWT nos testes de integração — **adiado: requer Docker para testes de integração**

## 2. Remoção do Fallback de Tenant Default

- [x] 2.1 `AtletaServiceImpl`: `resolveTenantId()` removido, todos os usos substituídos por `TenantContext.getRequiredTenantId()`
- [x] 2.2 `ProvaServiceImpl`: mesmo padrão removido, `TenantContext.getRequiredTenantId()` direto
- [x] 2.3 Grep confirmou: nenhum outro service com `findFirstByAtivoTrue()` ou fallback

## 3. Repositories Tenant-Aware

- [x] 3.1 `PlanoSemanalRepository.findByIdAndTenantId` — JPQL filtrando por `assessoria.id`
- [x] 3.2 `TreinoPlanejadoRepository.findByIdAndTenantId` — já existia, testado
- [x] 3.3 `TreinoRealizadoRepository.findByIdAndTenantId` — já existia, testado
- [x] 3.4 `PlanoMetadadosRepository.findByIdAndTenantId` — adicionado via `atleta.assessoria.id`
- [x] 3.5 `ProvaRepository.findByIdAndTenantId` — adicionado

## 4. Services: Troca de findById por Variantes Tenant-Aware

- [x] 4.1 `TreinoServiceImpl` — `atletaRepository.findById` → `findByIdAndTenantId`
- [x] 4.2 `TreinoServiceImpl` — `treinoPlanejadoRepository.findById` → tenant-aware
- [x] 4.3 `TreinoServiceImpl` — deduplicação corrigida para incluir `tenantId`
- [x] 4.4 `PlanoServiceImpl` — `atletaRepository.findById` → `findByIdAndTenantId`
- [x] 4.5 `PlanoServiceImpl` — `planoSemanalRepository.findById` → tenant-aware
- [x] 4.6 `PlanoServiceImpl` — `planoMetadadosRepository.findById` → tenant-aware
- [x] 4.7 `ProvaServiceImpl` — `provaRepository.findById` → `findByIdAndTenantId`
- [x] 4.8 `IaServiceImpl` — `atletaRepository.findById` → `findByIdAndTenantId`

## 5. Entidade PlanoMetaDados: Mapear tenant_id

- [x] 5.1 `PlanoMetaDados`: campo `@ManyToOne assessoria` com `@JoinColumn(name = "tenant_id")` adicionado
- [x] 5.2 `PlanoMetadadosServiceImpl`: popula `assessoria` ao criar usando `TenantContext`
- [x] 5.3 `PlanoMetadadosRepository`: queries de busca usam `assessoria.id`
- [x] Migration `V28__Add_tenant_id_to_plano_metadados.sql` criada

## 6. Cache Segmentado por Tenant

- [x] 6.1 `AtletaServiceImpl` — `@Cacheable "atletas"`: chave inclui `tenantId`
- [x] 6.2 `AtletaServiceImpl` — `@Cacheable "atletas-list"`: chave = tenant
- [x] 6.3 `AtletaServiceImpl` — todos os `@CacheEvict` com chaves tenant-aware
- [x] 6.4 `PlanoMetadadosServiceImpl` — `@Cacheable "metadados-atleta"`: inclui tenant
- [x] 6.5 Todos os comentários `TODO(tenant-isolation)` removidos

## 7. Migration: Constraints e Índice de Deduplicação

- [x] 7.1 `V29__Fix_treino_realizado_deduplication_by_tenant.sql`:
  - `DROP INDEX uk_treino_realizado_external_id` (global, V8)
  - `CREATE UNIQUE INDEX uk_treino_realizado_tenant_fonte_external (tenant_id, fonte_dados, external_id)` com filtro parcial
- [x] 7.2 Query de diagnóstico: índice criado com filtro parcial — duplicatas cross-tenant não conflitam com registros intra-tenant existentes
- [ ] 7.3 `./mvnw flyway:migrate` — **pendente: requer banco PostgreSQL ativo (Docker)**

## Testes criados (TDD)

- `GlobalExceptionHandlerTenantTest` — 2 testes
- `AtletaServiceTenantTest` — 5 testes
- `ProvaServiceTenantTest` — 5 testes
- `TreinoServiceTenantTest` — 5 testes
- `PlanoServiceTenantTest` — 4 testes
- `RepositoryTenantIsolationTest` — 10 testes (requerem Docker)
- `PlanoMetaDadosTenantTest` — 2 testes (requerem Docker)
- `AtletaServiceCacheTenantTest` — 2 testes (requerem Docker)
