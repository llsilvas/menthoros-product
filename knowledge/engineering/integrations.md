# Integrações Externas

> Resumo: quais sistemas externos o Menthoros já integra, seu estado atual (ativo,
> parcial, ou deferido) e as restrições que qualquer PRD envolvendo dados externos
> precisa considerar antes de propor uma nova integração ou expandir uma existente.

## O que é

Integrações externas do backend, por sistema:

| Sistema | Propósito | Estado |
|---|---|---|
| **Keycloak** | Identidade, autenticação JWT, multi-tenancy (claim `organization`) | Ativo, em produção |
| **OpenAI / Anthropic (via Spring AI)** | Geração de sugestões de plano, prescrição assistida por IA | Ativo, em produção |
| **Strava** | Sincronização de atividades reais do atleta | Implementado no código, **deferido** por clareza jurídica |
| **Railway** | Hosting/deploy do backend e frontend | Ativo (infraestrutura, não integração de domínio) |
| **Intervals.icu** | Push de treinos aprovados ao relógio do atleta via Garmin Connect | Em implementação (change `intervals-icu-workout-push`, Sprint 15); atividade-ingestão planejada (`intervals-icu-activity-ingestion`, Sprint 16) |

## Por que importa para o Menthoros

- **Strava está no código mas não em uso ativo.** Qualquer PRD que assuma "os dados
  já vêm do Strava" está errado — a família `strava-*` (`strava-oauth`,
  `strava-activity-sync`, `strava-async-import`, `strava-webhooks`,
  `strava-conditional-insights`, `strava-risk-semaphore`) está deferida no roadmap
  até haver clareza jurídica sobre uso de dados de terceiros para treinar/alimentar
  o preditor de aceitação de ML. **Nunca alimentar o modelo de ML com dados vindos
  da API do Strava** enquanto essa restrição estiver em vigor.
- **Um app Strava aceita apenas um Authorization Callback Domain.** Isso significa
  que dev e produção precisam de apps Strava separados — não é possível reusar a
  mesma credencial OAuth entre ambientes. Qualquer plano de retomar Strava precisa
  considerar esse custo de setup.
- **Keycloak resolve tenant via claim `organization`, não via Group.** Uma feature
  que precise de contexto de tenant deve ler esse claim — não inventar um mecanismo
  paralelo de multi-tenancy.
- **Chamadas ao LLM (OpenAI/Anthropic) ainda não têm timeout de resposta nem
  circuit breaker.** Uma feature que dependa de latência previsível do LLM (ex.
  geração síncrona de plano em tela) herda esse risco até a change
  `add-external-call-resilience` ser implementada.

## Detalhes / modelo

### Keycloak
- Protocolo: OAuth2 Resource Server, JWT.
- Multi-tenancy: `tenant_id` vem da Organization "Menthoros" (claim `organization`
  do token), resolvido em `TenantContext`.
- Cliente admin: `KeycloakAdminRestClientConfig`, com timeouts configurados
  (5s connect / 10s read) — referência para qualquer novo cliente externo.

### LLM (Spring AI)
- Dependências: `spring-ai-starter-model-openai`, `spring-ai-starter-model-anthropic`.
- `@EnableRetry` já configurado na camada de LLM.
- Gap conhecido: sem timeout de resposta, sem circuit breaker (Resilience4j é
  candidato, mas adoção formal está na change `add-external-call-resilience`).

### Strava (deferido)
- Endpoints já existem: `StravaAuthController`, `StravaActivityController`,
  `StravaWebhookController`, `StravaStatusController`.
- OAuth, sync de atividades, e webhooks estão implementados mas não habilitados
  para uso em produção pelo bloqueio jurídico.
- `StravaRateLimitException` já mapeada no `GlobalExceptionHandler`.

### Intervals.icu (em implementação)
- **Push de treinos (Sprint 15):** `IntervalsIcuConnectionController` (POST/GET/DELETE
  `/api/v1/integracoes/me/intervals-icu`), `IntervalsIcuPushListener`
  (`PlanoAprovadoEvent` → `AFTER_COMMIT` + `@Async`), `IntervalsIcuWorkoutConverter`
  (conversão `TreinoPlanejado` → `workout_doc` JSON).
- **Atividade-ingestão (Sprint 16, planejada):** pull de atividades realizadas
  do intervals.icu (fecha o ciclo prescreve → executa → analisa).
- Auth: API Key por atleta (HTTP Basic `API_KEY:<key>`), validada na conexão
  via `GET /api/v1/athlete/0`.
- Idempotência: client-side via `external_id = "menthoros-<treinoId>"` (a API
  do intervals.icu NÃO deduplica por `external_id` — comprovado empiricamente).
- Rate limit: 5.000 chamadas/dia por key (MVP: ~5-7 POSTs por aprovação de plano).
- Guia do usuário: `docs/guides/conectar-intervals-icu.md` (a definir local).
- Design doc: `openspec/changes/intervals-icu-workout-push/design.md`.

## Fontes

- `apps/menthoros-backend/CLAUDE.md` (seção "External Call Resilience").
- `PROJECT.md` (seção "Infra / deploy", family `strava-*` no roadmap).
- Código-fonte: `br.com.menthoros.backend.controller.Strava*`,
  `br.com.menthoros.backend.services.impl.KeycloakOrganizationGatewayImpl`.

## Status: fato estabelecido (restrição jurídica do Strava é uma decisão de negócio,
não uma limitação técnica — revisar com o time de produto/jurídico antes de assumir
que mudou)
