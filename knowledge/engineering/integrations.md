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
| **Strava** | Sincronização de atividades reais do atleta | **Descontinuado para atletas novos, mas ATIVO em produção para atletas já conectados** — `StravaActivitySyncScheduler` roda a cada 2h sem flag de desligamento (ver "Estado real" abaixo) |
| **Railway** | Hosting/deploy do backend e frontend | Ativo (infraestrutura, não integração de domínio) |
| **Intervals.icu** | Fonte de dados principal — push de treinos ao relógio e ingestão de atividades realizadas | Ativo, em produção. Push via `IntervalsIcuPushListener`. Ingestão via `IntervalsIcuActivitySyncScheduler` (polling); não há endpoint de webhook implementado apesar do nome da change `intervals-icu-webhook-ingestion` |

## Por que importa para o Menthoros

- **Strava está descontinuado só para atletas NOVOS — atletas já conectados seguem
  sincronizando de verdade.** `CanalIntegracao` não oferece mais `STRAVA` no onboarding,
  mas `StravaActivitySyncScheduler.runDailyIncrementalSync()` roda a cada 2h
  (`@Scheduled(fixedDelayString = "PT2H", ...)`, sem flag de desligamento) para todo
  atleta com integração ativa e não pausada. Esse dado cai em `FonteDados.STRAVA` e
  alimenta o `WorkoutAnalysisListener` (análise por IA) e o `CoachAttentionSignalEvaluator`
  (fila de atenção do coach) — **exatamente o que os termos da API do Strava (nov/2024)
  proíbem**: mostrar dado do atleta ao coach e usá-lo em IA. Qualquer PRD que assuma
  "Strava não está mais em uso" também está errado. Achado da auditoria de 2026-09-23,
  ver `knowledge/product/strategic-compass.md` seção "Estado atual" — decisão sobre
  desligar o pipeline legado depende do founder.
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

### Strava (legado, ativo para atletas já conectados)
- Endpoints ativos: `StravaAuthController`, `StravaActivityController`,
  `StravaWebhookController`, `StravaStatusController`.
- OAuth, sync de atividades (`StravaActivitySyncScheduler`, a cada 2h) e webhooks
  seguem rodando em produção — **não estão desligados**, só não são mais oferecidos
  no onboarding de atletas novos (`CanalIntegracao` só lista `INTERVALS_ICU`/`MANUAL`).
- `StravaRateLimitException` já mapeada no `GlobalExceptionHandler`.
- Sem migração ou flag para desligar/sinalizar os atletas Strava-only remanescentes.

### Intervals.icu (ativo — fonte de dados principal)
- **Push de treinos:** `IntervalsIcuConnectionController` (POST/GET/DELETE
  `/api/v1/integracoes/me/intervals-icu`), `IntervalsIcuPushListener`
  (`PlanoAprovadoEvent` → `AFTER_COMMIT` + `@Async`), `IntervalsIcuWorkoutConverter`
  (conversão `TreinoPlanejado` → `workout_doc` JSON).
- **Ingestão de atividades realizadas:** via `IntervalsIcuActivitySyncScheduler`
  (polling), não via webhook — a change `intervals-icu-webhook-ingestion` que
  implementaria um endpoint de push ainda está em Parcial (1/32 tasks).
- Sem abstração de fonte (`ActivitySource`/`DataSource`): `IntervalsIcuClient` está
  acoplado direto nos services — o guardrail da bússola de isolar o fornecedor
  único ainda não foi aplicado.
- Sem detecção de atividades "stub" vindas de Strava→intervals.icu.
- Auth: API Key por atleta (HTTP Basic `API_KEY:<key>`), validada na conexão
  via `GET /api/v1/athlete/0`.
- Idempotência: client-side via `external_id = "menthoros-<treinoId>"` (a API
  do intervals.icu NÃO deduplica por `external_id` — comprovado empiricamente).
- Rate limit: 5.000 chamadas/dia por key (MVP: ~5-7 POSTs por aprovação de plano).
- Guia do usuário: `docs/guides/conectar-intervals-icu.md` (a definir local).

## Fontes

- `apps/menthoros-backend/CLAUDE.md` (seção "External Call Resilience").
- Código-fonte: `br.com.menthoros.backend.services.StravaActivitySyncScheduler`,
  `br.com.menthoros.backend.controller.Strava*`, `br.com.menthoros.backend.enums.CanalIntegracao`,
  `br.com.menthoros.backend.enums.FonteDados`.
- Auditoria completa: `knowledge/product/strategic-compass.md` seção "Estado atual"
  (2026-09-23).

## Status: fato estabelecido a partir de leitura direta de código em 2026-09-23 (revisar
na próxima auditoria semanal, e sempre que o pipeline legado do Strava for desligado)
