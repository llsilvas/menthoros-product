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

## Fontes

- `apps/menthoros-backend/CLAUDE.md` (seção "External Call Resilience").
- `PROJECT.md` (seção "Infra / deploy", family `strava-*` no roadmap).
- Código-fonte: `br.com.menthoros.backend.controller.Strava*`,
  `br.com.menthoros.backend.services.impl.KeycloakOrganizationGatewayImpl`.

## Status: fato estabelecido (restrição jurídica do Strava é uma decisão de negócio,
não uma limitação técnica — revisar com o time de produto/jurídico antes de assumir
que mudou)
