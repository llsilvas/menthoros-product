# Tasks — assessoria-billing-asaas

> Só `menthoros-backend`. Ordem: spec (0) -> migrations (0.2) -> entidade/gateway (1-2) -> endpoints admin (3) -> webhook (4) -> job (5) -> retrofit de campos legados (6) -> testes (7).
> Validação: `./mvnw clean test`.
> Próxima migration livre no momento da criação desta change: **V68** (conferir de novo no início da implementação — outras changes podem ter avançado o número em paralelo).

## 0. Spec (DoR)

- [ ] 0.1 `specs/assessoria-billing/spec.md` — cenários Given/When/Then para CA1-CA12, espelhando o padrão de `specs/athlete-onboarding/spec.md`.

## 0.2. Migrations (Flyway)

- [ ] 0.2.1 `V68__create_tb_assinatura.sql` — nova tabela `tb_assinatura` (`UNIQUE(assessoria_id)`): `id UUID PK`, `assessoria_id UUID FK ON DELETE CASCADE`, `asaas_customer_id VARCHAR(50)`, `asaas_subscription_id VARCHAR(50) UNIQUE`, `status VARCHAR(20) NOT NULL` (`ATIVA`/`INADIMPLENTE`/`SUSPENSA`/`CANCELADA`), `data_proxima_cobranca TIMESTAMP`, `valor NUMERIC(10,2)`, `overdue_desde TIMESTAMP NULL`, `criado_em TIMESTAMP NOT NULL DEFAULT NOW()`, `atualizado_em TIMESTAMP`. Índice em `(status, overdue_desde)` para a query do job de carência (task 5.1). **verify:** migration roda limpa em dev, `\d tb_assinatura` confere o schema.
- [ ] 0.2.2 Tabela/coluna de controle de idempotência do webhook (ex.: `tb_asaas_webhook_evento_processado`: `evento_id VARCHAR(100) PK`, `processado_em TIMESTAMP`) — decidir entre tabela dedicada ou reaproveitar um padrão existente antes de escrever a migration. **verify:** unique constraint em `evento_id` rejeita insert duplicado.
- [ ] 0.2.3 **(requer confirmação explícita do usuário antes de rodar — guardrail do `CLAUDE.md` da raiz para remoção de coluna com dado)** `V69__remove_legacy_billing_fields_tb_assessoria.sql` — `ALTER TABLE tb_assessoria DROP COLUMN data_assinatura, DROP COLUMN data_expiracao, DROP COLUMN trial, DROP COLUMN data_fim_trial`. Confirmar de novo nesse ponto que não há assessoria em produção com dado nessas colunas (proposal.md, "Sem backfill"). **verify:** `\d tb_assessoria` confere ausência das 4 colunas; suíte de testes de `AssessoriaServiceImplTest`/`AssessoriaControllerTest` (se existirem) continua verde após o retrofit da task 6.

## 1. Entidade e repositório `Assinatura`

- [ ] 1.1 `entity/Assinatura.java` — `@Entity @Table(name = "tb_assinatura")`, campos conforme migration 0.2.1, `@OneToOne` com `Assessoria` (ou só `assessoriaId UUID` + lookup por repositório, mais simples de manter 1:1 sem lazy-loading — decidir na implementação).
- [ ] 1.2 `enums/StatusAssinatura.java` — `ATIVA`, `INADIMPLENTE`, `SUSPENSA`, `CANCELADA` (design.md Decisão 2).
- [ ] 1.3 `repository/AssinaturaRepository.java` — `findByAssessoriaId(UUID)`, `findByAsaasSubscriptionId(String)` (lookup do webhook, design.md Decisão 4), `findByStatusAndOverdueDesdeBefore(StatusAssinatura, LocalDateTime)` (query do job, task 5.1).

## 2. Cliente Asaas (gateway)

- [ ] 2.1 `services/gateway/AsaasGateway.java` (interface) + `AsaasGatewayImpl.java` — `criarClienteEAssinatura(Assessoria, DadosCartaoInput, LocalDateTime nextDueDate, BigDecimal valor)`, `atualizarValor(String asaasSubscriptionId, BigDecimal novoValor)`, `cancelarAssinatura(String asaasSubscriptionId)`. `WebClient`/`RestClient` com timeout de connect/read (obrigatório por `CLAUDE.md` — "External Call Resilience"), mesmo padrão do client do Keycloak/Strava.
- [ ] 2.2 Configuração (`application.yml` + `@ConfigurationProperties`) — API key do Asaas, base URL (sandbox/produção por profile), token de autenticação do webhook (`asaas.webhook.access-token`).
- [ ] 2.3 Testes unitários do gateway com mock do client HTTP (WireMock, seguindo `wiremock-standalone-docker` se aplicável ao padrão já usado em outros gateways externos).

## 3. Endpoints administrativos

- [ ] 3.1 `dto/input/AssinaturaInputDto.java` (record — cartão, `nextDueDate`, `valor`, tier) e `dto/output/AssinaturaOutputDto.java` (record — status, datas, tier), seguindo **DTO & Records Standards** do `CLAUDE.md`.
- [ ] 3.2 `services/AssinaturaService.java` (interface) + impl — `criar`, `atualizarTier`, `cancelar`. JavaDoc de idempotência/side-effects/tenant-aware obrigatório em cada método público (padrão do `CLAUDE.md`).
- [ ] 3.3 `controller/AssinaturaController.java` — `POST`/`PATCH`/`DELETE` em `/api/admin/assessorias/{id}/assinatura`, `@PreAuthorize("hasRole('ADMIN')")`, Swagger completo (`@Tag` ASCII kebab-case, `@Operation`, `@ApiResponses`), mesmo padrão de `AssessoriaController`.
- [ ] 3.4 Testes de serviço (Mockito, `@Nested` por método) cobrindo CA1, CA7, CA9 — incluindo o caso "PATCH sempre atualiza Menthoros e Asaas na mesma operação, nunca só um lado".

## 4. Webhook

- [ ] 4.1 `controller/AsaasWebhookController.java` — `POST /api/v1/asaas/webhook`, sem `@PreAuthorize`, valida header `asaas-access-token` antes de qualquer processamento (CA11).
- [ ] 4.2 Registro do path em `CoreSecurityConfig`/`CoreSecurityProperties` (`permitAll()`, mesmo mecanismo de `strava-paths` — design.md Decisão 4).
- [ ] 4.3 `services/AsaasWebhookEventService.java` — dispatch por tipo de evento (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`/`PAYMENT_OVERDUE`/`SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED`), checagem de idempotência (task 0.2.2) antes de aplicar a transição de estado (design.md Decisão 2). Lookup de `Assinatura` por `asaasSubscriptionId` (não há `tenant_id` no payload).
- [ ] 4.4 Testes cobrindo CA3, CA4, CA6, CA8, CA10 (idempotência — reenviar o mesmo `id` de evento não duplica transição) e CA11 (header ausente/incorreto → rejeitado sem processar).

## 5. Job de carência

- [ ] 5.1 `scheduler/AssinaturaSuspensaoScheduler.java` — job diário (mesmo padrão do `DailyActivitySyncScheduler`, cross-tenant, sem `TenantContext`), query `findByStatusAndOverdueDesdeBefore(INADIMPLENTE, agora.minusDays(5))`, transiciona para `SUSPENSA` + `Assessoria.ativo=false` (CA5).
- [ ] 5.2 Teste do scheduler — `Assinatura` com `overdueDesde` há exatamente 4 dias não suspende; há mais de 5 dias suspende (BVA na fronteira).

## 6. Retrofit de `Assessoria` (depende das migrations 0.2.3)

- [ ] 6.1 `entity/Assessoria.java` — remove `dataAssinatura`/`dataExpiracao`/`trial`/`dataFimTrial`; `isValida()` simplifica para `return ativo;` (design.md Decisão 8).
- [ ] 6.2 Buscar todos os usos de `trial`/`dataFimTrial`/`dataAssinatura`/`dataExpiracao` no código (`grep -rn` em `src/main` e `src/test`) e remover/atualizar cada um — DTOs, mappers, testes existentes de `Assessoria`.
- [ ] 6.3 Rodar `./mvnw clean test` completo — garantir que a suíte pré-existente de `Assessoria`/`AssessoriaService` continua verde após a remoção.

## 7. Testes de integração

- [ ] 7.1 Teste de integração ponta a ponta (mock do Asaas via WireMock): criar assinatura → webhook `PAYMENT_OVERDUE` → job de carência → `SUSPENSA` → webhook `PAYMENT_CONFIRMED` → volta pra `ATIVA`, cobrindo o ciclo completo de CA1/CA3/CA5/CA6 numa sequência só.
