# Especificação Técnica: Lacunas para Implantação de Multi-Tenancy

## 1. Objetivo

Este documento descreve o estado atual da implementação de multi-tenancy no backend do Menthoros e especifica o que ainda falta para considerar a feature pronta para implantação em produção.

O modelo observado no projeto é **shared database, shared schema, isolamento por `tenant_id`**, com autenticação via Keycloak e propagação do tenant via JWT.

## 2. Resumo Executivo

O projeto já possui fundações importantes:

- tabela de tenant (`tb_assessoria`);
- coluna `tenant_id` nas principais tabelas de domínio;
- `TenantContext` para propagar o tenant na thread;
- `JwtTenantFilter` para extrair `tenant_id` do token;
- integração com Keycloak e sincronização de usuário local.

Apesar disso, a feature **ainda não está pronta para produção**. O principal motivo é que o isolamento entre tenants ainda depende de disciplina manual em services e repositories, e não de enforcement estrutural consistente. Hoje existe risco real de:

- leitura cruzada entre tenants;
- escrita cruzada em entidades relacionadas;
- colisão de cache entre tenants;
- execução sem autenticação obrigatória;
- divergência entre schema do banco e mapeamento JPA.

## 3. Escopo da Implantação

Para esta feature ser considerada implantada, o sistema deve garantir simultaneamente:

1. Toda requisição autenticada resolve exatamente um tenant válido.
2. Toda leitura e escrita de dados de negócio é filtrada pelo tenant atual.
3. Não existe fallback automático para tenant default em ambiente produtivo.
4. Cache, jobs, integrações e operações assíncronas preservam o contexto de tenant.
5. O banco reforça integridade mínima para evitar vínculos entre entidades de tenants diferentes.
6. Existem testes automatizados cobrindo isolamento positivo e negativo.

## 4. Estado Atual

### 4.1 O que já existe

- O contexto do tenant está implementado em [`TenantContext.java`](../src/main/java/com/menthoros/multitenancy/TenantContext.java).
- O filtro JWT extrai `tenant_id`, popula o contexto e limpa ao final da request em [`JwtTenantFilter.java`](../src/main/java/com/menthoros/security/JwtTenantFilter.java).
- As migrations de multi-tenancy já criam `tb_assessoria`, `tb_usuario` e adicionam `tenant_id` às tabelas principais em [`V17__Create_multi_tenancy_tables.sql`](../src/main/resources/db/migration/V17__Create_multi_tenancy_tables.sql).
- Algumas consultas já são tenant-aware, por exemplo [`AtletaRepository.java`](../src/main/java/com/menthoros/repository/AtletaRepository.java).
- Há compose e documentação para ambiente com Keycloak.

### 4.2 O que indica implementação parcial

- A segurança HTTP ainda está aberta com `permitAll()` para todas as rotas em [`SecurityConfig.java`](../src/main/java/com/menthoros/config/SecurityConfig.java).
- Há fallback explícito para “primeira assessoria ativa” em [`AtletaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/AtletaServiceImpl.java) e [`ProvaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/ProvaServiceImpl.java).
- Diversos services ainda usam `findById(...)` sem filtro de tenant.
- Os caches atuais usam chave por ID simples ou `allEntries`, sem segmentação por tenant.
- O banco tem `tenant_id` em `tb_plano_metadados`, mas a entidade [`PlanoMetaDados.java`](../src/main/java/com/menthoros/entity/PlanoMetaDados.java) não mapeia esse campo.

## 5. Lacunas Técnicas

### 5.1 Bloqueador P0: autenticação ainda não obrigatória

Situação atual:

- [`SecurityConfig.java`](../src/main/java/com/menthoros/config/SecurityConfig.java) mantém `.anyRequest().permitAll()` nas linhas 31-35.

Impacto:

- Requisições podem executar sem JWT.
- O `JwtTenantFilter` só atua quando existe autenticação válida.
- O restante da aplicação passa a depender de fallbacks locais, o que invalida o modelo de isolamento.

Especificação necessária:

- Remover `permitAll()` global.
- Manter públicos apenas `health`, `swagger` e endpoints explicitamente públicos.
- Exigir JWT válido para toda rota de negócio.
- Adicionar testes de integração para `401`, `403` e token sem `tenant_id`.

Critério de aceite:

- Nenhum endpoint de negócio responde sem bearer token válido.

### 5.2 Bloqueador P0: fallback para tenant default

Situação atual:

- [`AtletaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/AtletaServiceImpl.java) linhas 43-52 resolvem tenant pela primeira assessoria ativa se o contexto estiver vazio.
- [`ProvaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/ProvaServiceImpl.java) repete o mesmo padrão.
- A migration [`V17__Create_multi_tenancy_tables.sql`](../src/main/resources/db/migration/V17__Create_multi_tenancy_tables.sql) cria e utiliza uma assessoria `default` para backfill.

Impacto:

- Em produção, uma request sem contexto de tenant pode operar em dados de outro tenant.
- O tenant default, que deveria servir para migração/bootstrap, vira rota de execução normal.

Especificação necessária:

- Substituir todos os usos de `resolveTenantId()` por `TenantContext.getRequiredTenantId()`.
- Restringir tenant default para uso de migração, bootstrap e ambientes locais explicitamente sinalizados.
- Se for necessário modo dev sem auth, esse modo deve ser controlado por profile/propriedade e nunca ser o comportamento padrão.

Critério de aceite:

- Sem `TenantContext`, uma request de negócio falha de forma determinística.

### 5.3 Bloqueador P0: repositories e services ainda permitem acesso cross-tenant

Situação atual:

- [`BaseRepository.java`](../src/main/java/com/menthoros/repository/BaseRepository.java) ainda expõe `findById`.
- [`AtletaRepository.java`](../src/main/java/com/menthoros/repository/AtletaRepository.java) mantém `findById`, `findByIdBasic` e `findByIdForUpdate` sem enforcement de tenant.
- [`TreinoServiceImpl.java`](../src/main/java/com/menthoros/services/impl/TreinoServiceImpl.java) usa `atletaRepository.findById(...)` e `treinoPlanejadoRepository.findById(...)`.
- [`PlanoServiceImpl.java`](../src/main/java/com/menthoros/services/impl/PlanoServiceImpl.java) usa `atletaRepository.findById(...)`, `planoMetadadosRepository.findById(...)` e `planoSemanalRepository.findById(...)`.
- [`TsbServiceImpl.java`](../src/main/java/com/menthoros/services/impl/TsbServiceImpl.java), [`PlanoMetadadosServiceImpl.java`](../src/main/java/com/menthoros/services/impl/PlanoMetadadosServiceImpl.java), [`IaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/IaServiceImpl.java) e [`MetricasAgregadasServiceImpl.java`](../src/main/java/com/menthoros/services/impl/MetricasAgregadasServiceImpl.java) também consultam por ID global.
- [`ProvaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/ProvaServiceImpl.java) resolve atleta pelo tenant, mas depois resolve prova com `provaRepository.findById(...)` e valida apenas pelo atleta em memória.

Impacto:

- O isolamento depende do chamador “fazer a coisa certa”.
- Qualquer novo service/repository pode reintroduzir vazamento.
- Operações indiretas em plano, prova, treino e metadados ainda podem acessar registros fora do tenant.

Especificação necessária:

- Adotar uma estratégia única de enforcement:
  - opção recomendada: repositories tenant-aware com métodos explícitos `findByIdAndTenantId`, `existsByIdAndTenantId`, `deleteByIdAndTenantId`, etc.;
  - opção complementar: filtro Hibernate/JPA global por `tenant_id`;
  - opção de defesa em profundidade: Row Level Security no PostgreSQL.
- Remover ou restringir métodos genéricos sem tenant em repositories de domínio.
- Toda consulta por relacionamento deve validar tenant no mesmo select.
- Padronizar `TenantAwareRepositorySupport` ou Specification base para reduzir repetição.

Critério de aceite:

- Não existe mais caminho de leitura/escrita de domínio acessível por request HTTP que dependa de `findById` global.

### 5.4 Bloqueador P0: cache não é tenant-aware

Situação atual:

- [`AtletaServiceImpl.java`](../src/main/java/com/menthoros/services/impl/AtletaServiceImpl.java) usa `@Cacheable(value = "atletas", key = "#id")` e `@Cacheable(value = "atletas-list")`.
- [`PlanoMetadadosServiceImpl.java`](../src/main/java/com/menthoros/services/impl/PlanoMetadadosServiceImpl.java) usa `@Cacheable(value = "metadados-atleta", key = "#atleta.id")`.
- Os próprios comentários no código já registram TODOs para chaves tenant-aware.

Impacto:

- Mesmo com UUID global, o cache fica semanticamente incorreto e perigoso para listas.
- `allEntries = true` causa invalidação ampla entre tenants.
- Em Redis compartilhado, o problema aparece com mais força.

Especificação necessária:

- Toda chave de cache deve incluir `tenantId`.
- Toda invalidação deve ser segmentada por tenant.
- Em componentes sem `TenantContext`, o cache deve ser desabilitado ou explicitamente parametrizado com tenant.
- Avaliar prefixo global por tenant no `CacheManager`.

Critério de aceite:

- Não há cache hit possível entre tenants para listas, buscas por ID e metadados.

### 5.5 Bloqueador P0: divergência entre schema e entidades JPA

Situação atual:

- A migration [`V17__Create_multi_tenancy_tables.sql`](../src/main/resources/db/migration/V17__Create_multi_tenancy_tables.sql) adiciona `tenant_id` obrigatório em `tb_plano_metadados`.
- A entidade [`PlanoMetaDados.java`](../src/main/java/com/menthoros/entity/PlanoMetaDados.java) não possui campo `tenantId` nem relação com `Assessoria`.

Impacto:

- O modelo de dados fica inconsistente.
- Perde-se a possibilidade de filtrar metadados diretamente por tenant.
- A criação inicial de metadados em [`PlanoMetadadosServiceImpl.java`](../src/main/java/com/menthoros/services/impl/PlanoMetadadosServiceImpl.java) não popula tenant explicitamente.

Especificação necessária:

- Mapear `tenant_id` em `PlanoMetaDados`.
- Definir se o padrão será:
  - relação `@ManyToOne Assessoria`, como em `Atleta`, `PlanoSemanal` e `Prova`; ou
  - coluna UUID simples, como em `TreinoBase` e `MetricasDiarias`.
- Padronizar o estilo em todas as entidades de domínio.
- Revisar outras possíveis divergências entre entity e DDL de multi-tenancy.

Critério de aceite:

- Todas as tabelas com `tenant_id` possuem mapeamento JPA coerente e persistência correta.

### 5.6 Bloqueador P1: falta de integridade relacional por tenant

Situação atual:

- O banco garante FK simples para `tenant_id`, mas não impede cenários como:
  - `tb_treino_realizado.tenant_id != tb_atleta.tenant_id`;
  - `tb_plano_semanal.tenant_id != tb_plano_metadados.tenant_id`;
  - `tb_prova.tenant_id != tb_atleta.tenant_id`.

Impacto:

- Um bug de aplicação pode salvar relacionamentos inconsistentes.
- Depois disso, consultas tenant-aware podem ter comportamento imprevisível.

Especificação necessária:

- Adicionar constraints compostas quando viável, por exemplo:
  - `(atleta_id, tenant_id)` referenciando atleta;
  - `(plano_semanal_id, tenant_id)` referenciando plano semanal;
  - `(plano_metadados_id, tenant_id)` referenciando plano metadados.
- Se o desenho atual impedir FK composta sem refactor, implementar validação transacional obrigatória antes do save e criar backlog para endurecimento do schema.

Critério de aceite:

- Não é possível persistir relacionamento entre entidades de tenants diferentes.

### 5.7 Bloqueador P1: deduplicação e consultas funcionais não segmentadas por tenant

Situação atual:

- [`TreinoServiceImpl.java`](../src/main/java/com/menthoros/services/impl/TreinoServiceImpl.java) deduplica treino por `fonteDados + externalId` sem tenant.
- Diversos repositories consultam por `atletaId` somente.

Impacto:

- IDs externos de integrações podem colidir entre tenants.
- Reprocessamentos podem afetar ou bloquear dados de outro tenant.

Especificação necessária:

- Incluir tenant em toda chave natural usada por integrações externas.
- Criar índices/constraints compostos como:
  - `unique (tenant_id, fonte_dados, external_id)` onde aplicável.
- Revisar todas as consultas funcionais que hoje assumem unicidade global.

Critério de aceite:

- Nenhuma consulta funcional depende de unicidade global quando o dado é tenant-scoped.

### 5.8 Bloqueador P1: ausência de testes automatizados de isolamento

Situação atual:

- Não foram encontrados testes cobrindo cenários de isolamento entre tenants.

Impacto:

- Regressões de segurança passam despercebidas.
- O time não tem rede de proteção para refactors.

Especificação necessária:

- Adicionar testes em três níveis:
  - repository: consultas retornam apenas dados do tenant atual;
  - service: requests com IDs de outro tenant falham como `404` ou `403`;
  - integração/end-to-end: JWT de tenant A não acessa nem altera dados de tenant B.
- Incluir testes para cache e para rotas sem token.

Critério de aceite:

- Existe suíte automatizada cobrindo pelo menos os fluxos de atleta, prova, plano semanal, treino realizado e metadados.

### 5.9 Bloqueador P1: contexto de tenant não está preparado para execução assíncrona

Situação atual:

- [`TenantContext.java`](../src/main/java/com/menthoros/multitenancy/TenantContext.java) usa `InheritableThreadLocal`.

Impacto:

- Isso não garante propagação correta em pools reutilizados.
- Jobs, executors, schedulers e callbacks podem executar sem tenant ou com contexto stale.

Especificação necessária:

- Implementar propagação explícita de contexto para qualquer executor assíncrono.
- Criar `TaskDecorator` para copiar e limpar tenant por task.
- Proibir leitura de `TenantContext` em jobs batch sem atribuição explícita de tenant.

Critério de aceite:

- Toda execução assíncrona que toca dados tenant-scoped recebe tenant explicitamente.

### 5.10 Bloqueador P2: sincronização de usuários e governança operacional ainda incompletas

Situação atual:

- [`UsuarioSyncService.java`](../src/main/java/com/menthoros/services/UsuarioSyncService.java) sincroniza usuário no request, mas o sync em background ainda está como TODO.

Impacto:

- Alterações administrativas no Keycloak podem demorar a refletir.
- Gestão operacional de usuários e roles por tenant fica incompleta.

Especificação necessária:

- Definir estratégia oficial:
  - sync somente no login/request; ou
  - sync híbrido com job administrativo.
- Se houver job, implementar cliente admin do Keycloak com atualização incremental.
- Registrar auditoria mínima de role e tenant do usuário sincronizado.

Critério de aceite:

- O comportamento de sincronização de usuário está definido, implementado e documentado.

## 6. Arquitetura Recomendada para Concluir a Feature

### 6.1 Padrão recomendado

Recomenda-se manter o modelo atual de **shared schema com `tenant_id`**, mas com defesa em profundidade:

1. JWT obrigatório em toda rota de negócio.
2. `TenantContext.getRequiredTenantId()` como única forma de obter tenant da request.
3. Repositories com métodos tenant-aware obrigatórios.
4. Cache com chave segmentada por tenant.
5. Constraints compostas e, se possível, Row Level Security no PostgreSQL para tabelas críticas.

### 6.2 Padrão de implementação

- Criar uma abstração comum de acesso tenant-aware.
- Padronizar nomenclatura:
  - `findByIdAndTenantId`
  - `findAllByTenantId`
  - `existsByIdAndTenantId`
  - `deleteByIdAndTenantId`
- Remover acessos diretos a `findById` em entidades tenant-scoped.
- Definir quais tabelas são:
  - tenant-owned;
  - globais;
  - derivadas de entidade tenant-owned.

## 7. Plano de Entrega Recomendado

### Fase 1: Enforcement de segurança

- Fechar `permitAll`.
- Remover fallback de tenant default.
- Exigir `TenantContext` em services de negócio.

### Fase 2: Refactor de persistência

- Tornar repositories tenant-aware.
- Remover acessos por ID global em services.
- Corrigir `PlanoMetaDados` e revisar entidades.

### Fase 3: Cache e integridade

- Segmentar cache por tenant.
- Adicionar constraints compostas e índices.
- Revisar deduplicação por `external_id`.

### Fase 4: Assíncrono, observabilidade e operação

- Propagar tenant em tasks assíncronas.
- Adicionar logs estruturados com tenant.
- Documentar runbooks de criação de tenant, provisionamento no Keycloak e troubleshooting.

### Fase 5: Testes de certificação

- Testes positivos e negativos por tenant.
- Testes de regressão para endpoints principais.
- Smoke test de ambiente com Keycloak + Redis + PostgreSQL.

## 8. Critérios de Pronto para Produção

A feature só deve ser considerada pronta quando todos os itens abaixo estiverem concluídos:

- autenticação obrigatória em todas as rotas de negócio;
- zero fallback automático para tenant default em produção;
- zero acesso a entidades tenant-scoped via `findById` global em fluxos HTTP;
- cache segmentado por tenant;
- entities e migrations alinhadas;
- constraints mínimas de integridade por tenant implementadas;
- testes automatizados cobrindo isolamento;
- documentação operacional atualizada para onboarding de novos tenants.

## 9. Riscos se Implantar no Estado Atual

- vazamento de dados entre assessorias;
- mutações acidentais em registros de outro tenant;
- comportamento inconsistente em cache Redis;
- suporte operacional difícil por falta de observabilidade por tenant;
- falsa sensação de segurança por existir `tenant_id` no schema, mas sem enforcement completo na aplicação.

## 10. Backlog Técnico Objetivo

### P0

- Fechar autenticação obrigatória.
- Remover fallback para tenant default.
- Refatorar flows críticos para `findByIdAndTenantId`.
- Corrigir cache tenant-aware.
- Mapear `tenant_id` em `PlanoMetaDados`.

### P1

- Adicionar constraints compostas por tenant.
- Revisar deduplicação e índices compostos.
- Cobrir isolamento com testes automatizados.
- Endurecer leitura/escrita de prova, plano, treino e metadados.

### P2

- Propagação de tenant em assíncrono.
- Job/admin sync do Keycloak.
- Observabilidade e runbooks operacionais.

## 11. Conclusão

O projeto está em **estágio intermediário de implementação de multi-tenancy**: a modelagem e a infraestrutura base já existem, mas o enforcement ainda é incompleto. A lacuna principal não é criar novas tabelas, e sim transformar o isolamento em uma garantia transversal de arquitetura.

Sem essa etapa, o sistema opera como “single-tenant com campos de tenant”, e não como um backend multi-tenant pronto para produção.
