# Tasks: harden-tenant-isolation

## 1. Propagação de contexto em threads

- [x] 1.1 Auditoria concluída. Pontos async/scheduled que tocam `TenantContext`:
  `StravaWebhookServiceImpl` (@Async — `setTenantId`/`clear` explícito), `StravaActivitySyncScheduler`
  (@Scheduled — `setTenantId`/`clear` por iteração), `WorkoutAnalysisListener` (@Async — recebe
  `tenantId` via evento, não lê o contexto), `DailyActivitySyncSchedulerImpl` (não usa contexto,
  isola por atleta). Executors: `stravaWebhookExecutor`, `workoutAnalysisExecutor`, `llmTaskExecutor`
  — nenhum com `TaskDecorator`. **Conclusão:** nenhum fluxo depende da herança do
  `InheritableThreadLocal`; trocar para `ThreadLocal` é seguro.
- [x] 1.2 `InheritableThreadLocal` → `ThreadLocal` em `TenantContext`. `TenantContextTest`
  (thread filha não herda; ciclo set/get/clear).
- [x] 1.3 N/A (decisão: YAGNI). A auditoria (1.1) mostrou que nenhum async atual depende de
  propagação: todos setam o tenant explicitamente com `clear()` no `finally`. `TaskDecorator` seria
  defesa-em-profundidade para async futuro — não adicionado. Convenção documentada no comentário de
  `TenantContext` ("código assíncrono deve setar o tenant explicitamente").
- [x] 1.4 Teste de regressão em `TenantContextTest`: thread de pool reutilizada não vaza tenant entre
  tarefas (padrão set+clear).

## 2. Repositórios sem filtro de tenant

- [x] 2.1 Inventário concluído. Escopo declarado: `findByKeycloakId` (seguro — `keycloak_id` único
  global; usado por `JwtTenantFilter` fallback e `UsuarioSyncServiceImpl`), `findByEmail` (sem call
  site), `findByIdBasic` (usado por `StravaOAuthServiceImpl.findAtletaForCallback`, callback OAuth sem
  tenant no contexto), `findByIdForUpdate` (sem call site, lock pessimista). Achados ADICIONAIS fora
  do escopo declarado: `IntegracaoExternaRepository.findActiveByExternalAthleteIdAndPlataforma`
  (webhook público Strava), `TreinoRealizadoRepository.findByExternalIdAndAtletaId`/`findByIdWithEtapas`
  (valida tenant após busca), `AtletaRepository.findAllWithStravaConnected` (scheduler, valida no loop),
  `SkillExecutionRepository.findTop...` (sem call site).
- [x] 2.2 `findByEmail` e `findByIdForUpdate` removidos (sem call site; footguns). `findByKeycloakId`
  documentado como seguro-por-design (chave única global; não escopável sem quebrar o sync).
  `findByIdBasic` documentado como uso restrito (callback OAuth sem tenant; atletaId do state da app).
  `@Lock`/`LockModeType` imports órfãos removidos. Decisão: "tudo que dá" se resolve em remover os
  mortos; os 2 vivos não podem ser escopados sem quebrar sync/OAuth.
- [x] 2.3 Confirmado: `syncUsuarioFromJwt` resolve por `findByKeycloakId` (chave única) e cria/vincula
  com `tenantId` (`assessoria.findById`, `findByEmailAndAssessoria_Id`) — sem cruzamento de tenant.
- [x] 2.4 Coberto por `RepositoryTenantIsolationTest` (isolamento negativo `findByIdAndTenantId` em 5
  entidades). Seção não adicionou query escopada nova; métodos vivos são não-escopados por design.

> **Follow-up (fora do escopo, decisão do usuário):** finders sem tenant adicionais —
> `IntegracaoExternaRepository.findActiveByExternalAthleteIdAndPlataforma` (webhook **público** Strava,
> risco mais alto), `TreinoRealizadoRepository.findByExternalIdAndAtletaId`/`findByIdWithEtapas`,
> `AtletaRepository.findAllWithStravaConnected`/`findProjectedAtletas`/`findById`,
> `SkillExecutionRepository.findTop...` — ficam para uma change própria (ex.:
> `harden-strava-ingestion-tenancy`), alinhada ao deferimento do Strava.
>
> **Follow-up de segurança (QA, criticidade alta):** OAuth Strava usa `state = atletaId` em texto
> plano (sem nonce/HMAC vinculado à sessão) — vetor CSRF/IDOR no callback (`StravaOAuthServiceImpl` /
> `StravaAuthController.callback` → `findByIdBasic`). Trocar por token opaco/HMAC de uso único.
> Caveat já anotado no Javadoc de `findByIdBasic`.
>
> **Follow-up (inconsistência):** `DailyActivitySyncSchedulerImpl.executeDailySync` itera atletas
> multi-tenant sem `setTenantId`/`clear` por iteração (não é regressão — não chama
> `getRequiredTenantId()`; isola por atleta), mas diverge do padrão de `StravaActivitySyncScheduler`.

## 3. Validação

- [x] 3.1 `./mvnw clean test` — verde. (678 testes, 0 falhas/erros.)
