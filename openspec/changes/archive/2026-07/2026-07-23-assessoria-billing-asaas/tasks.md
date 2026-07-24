# Tasks — assessoria-billing-asaas

> Só `menthoros-backend`. Ordem: spec (0) -> migrations (0.2) -> entidade/gateway (1-2) -> endpoints admin (3) -> webhook (4) -> job (5) -> retrofit de campos legados (6) -> testes (7).
> Validação global: `./mvnw clean test` (rodar do diretório `apps/menthoros-backend`).
> Migration livre confirmada no início da implementação (2026-07-23): última é **V67** → **V68** (tb_assinatura), **V69** (idempotência webhook), **V70** (remoção legada, destrutiva), **V71** (reversão da V70, só se precisar rollback).
> Nota de sequência: a V70 (remoção de colunas de `tb_assessoria`) roda **junto com o retrofit da §6** — se criada antes, o Flyway a aplica no próximo `./mvnw test` e o `ddl-auto: validate` quebra (entidade `Assessoria` ainda teria os 4 campos). Por isso a 0.2.3 fica adiada para a §6.
> Enum `StatusAssinatura` = `PENDENTE`/`ATIVA`/`INADIMPLENTE`/`SUSPENSA`/`CANCELADA` (design.md Decisão 2 + 9). `PENDENTE` é estado transitório de criação (falha parcial), não estado de negócio.
> **Provider mockado por enquanto (decisão do usuário 2026-07-23):** ainda não há ligação real com o Asaas. Flag `asaas.mock` (default `true`) seleciona `AsaasGatewayMock`; o `AsaasGatewayImpl` real fica condicional (`asaas.mock=false`) para quando o provider estiver conectado. O `AsaasGatewayImplTest` continua testando a impl real (constrói direto, sem Spring).

## 0. Spec (DoR)

- [x] 0.1 `specs/assessoria-billing/spec.md` — cenários Given/When/Then para CA1-CA15, espelhando o padrão de `changes/archive/2026-07/2026-07-22-athlete-onboarding-baseline/specs/athlete-onboarding/spec.md` (a spec de onboarding vive no archive; `openspec/specs/` canônico só tem `fc-limiar-zones`/`prova-crud`). **Feito no gate de DoR (2026-07-23).** **verify:** os 15 CAs têm ao menos um `#### Scenario` Given/When/Then; falha parcial (CA13), idempotência do POST (CA14) e atomicidade PATCH/DELETE (CA15) cobertos.

## 0.2. Migrations (Flyway)

- [x] 0.2.1 `V68__create_tb_assinatura.sql` — nova tabela `tb_assinatura` (Table Design Standards do backend: `id UUID PK DEFAULT gen_random_uuid()`, `TIMESTAMPTZ`, constraints nomeadas). Colunas: `assessoria_id UUID NOT NULL REFERENCES tb_assessoria(id) ON DELETE CASCADE`, `CONSTRAINT uk_assinatura_assessoria UNIQUE (assessoria_id)`; `asaas_customer_id VARCHAR(50)` e `asaas_subscription_id VARCHAR(50)` (nullable — só preenchidos quando sai de `PENDENTE`), `CONSTRAINT uk_assinatura_asaas_sub UNIQUE (asaas_subscription_id)`; `status VARCHAR(20) NOT NULL` (`PENDENTE`/`ATIVA`/`INADIMPLENTE`/`SUSPENSA`/`CANCELADA`, `CHECK` inline); `data_proxima_cobranca TIMESTAMPTZ`, `valor NUMERIC(10,2)`, `overdue_desde TIMESTAMPTZ NULL`, `criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `atualizado_em TIMESTAMPTZ`. Índice `idx_assinatura_status_overdue ON (status, overdue_desde)` para a query do job (task 5.1). **Sem `tenant_id`** — `Assinatura` é cross-tenant por natureza (o job e o webhook não usam `TenantContext`), a assessoria é o vínculo. **verify:** migration roda limpa em dev; `\d tb_assinatura` confere schema, unique de `assessoria_id`/`asaas_subscription_id` e o índice composto.
- [x] 0.2.2 `V69__create_tb_asaas_webhook_evento_processado.sql` — **tabela dedicada** (o `StravaWebhookController` processa async sem dedup de evento, nada a reaproveitar): `evento_id VARCHAR(100) PK`, `tipo_evento VARCHAR(50)`, `processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`. **verify:** PK em `evento_id` rejeita insert duplicado; migration aplica limpa (repositório verde no Testcontainers).
- [x] 0.2.3 **(ADIADA para a §6 — requer confirmação explícita do usuário antes de rodar, guardrail do `CLAUDE.md` da raiz para remoção de coluna com dado)** `V70__remove_legacy_billing_fields_tb_assessoria.sql` — `ALTER TABLE tb_assessoria DROP COLUMN data_assinatura, DROP COLUMN data_expiracao, DROP COLUMN trial, DROP COLUMN data_fim_trial`. Roda junto com o retrofit da §6 (dependência de schema — ver nota de sequência no topo). Confirmar de novo nesse ponto que não há assessoria em produção com dado nessas colunas (proposal.md, "Sem backfill"). Reversão documentada é a `V71` (design.md Decisão 8), nunca editar a `V70` aplicada. **verify:** ausência das 4 colunas; a suíte pós-retrofit (task 6.3) continua verde.

## 1. Entidade e repositório `Assinatura`

- [x] 1.1 `entity/Assinatura.java` — `@Entity @Table(name = "tb_assinatura")`, campos conforme migration 0.2.1, `assessoriaId UUID` + lookup por repositório (mais simples de manter 1:1 sem lazy-loading; evita `LazyInitializationException` fora de transação). `asaasCustomerId`/`asaasSubscriptionId` nullable (vazios enquanto `PENDENTE`). **verify:** `./mvnw clean compile`; Hibernate mapeia sem erro de schema validation contra a V68.
- [x] 1.2 `enums/StatusAssinatura.java` — `PENDENTE`, `ATIVA`, `INADIMPLENTE`, `SUSPENSA`, `CANCELADA` (design.md Decisão 2). **verify:** compila; valores batem com o `CHECK` da migration.
- [x] 1.3 `repository/AssinaturaRepository.java` — `findByAssessoriaId(UUID)` (POST idempotente CA14 + retrofit), `findByAsaasSubscriptionId(String)` (lookup do webhook, Decisão 4), `findByStatusAndOverdueDesdeBefore(StatusAssinatura, LocalDateTime)` (query do job, task 5.1). **verify:** `@DataJpaTest` (Testcontainers) exercita as três queries com dados de fixture.

## 2. Cliente Asaas (gateway)

- [x] 2.1 `services/AsaasGateway.java` (interface) + `services/impl/AsaasGatewayImpl.java` (segue a convenção do `KeycloakOrganizationGateway`, não o path `services/gateway` sugerido) — `criarClienteEAssinatura(Assessoria, DadosCartaoInput, LocalDateTime nextDueDate, BigDecimal valor)` (usa `assessoriaId` como `externalReference` do customer e consulta customer por essa referência antes de criar — idempotência CA14/Decisão 9), `atualizarValor(String asaasSubscriptionId, BigDecimal novoValor)`, `cancelarAssinatura(String asaasSubscriptionId)`. `RestClient`/`WebClient` com **connect + read/response timeout obrigatórios** (`CLAUDE.md` backend — "External Call Resilience"), mesmo padrão do client do Keycloak. **verify:** teste do gateway com WireMock cobre sucesso, timeout e reaproveitamento de customer por `externalReference`.
- [x] 2.2 Configuração (`application.yml` bloco `asaas` + `AsaasProperties` + `AsaasRestClientConfig` com timeouts 5s/10s) — API key do Asaas, base URL (sandbox/produção por profile), token de autenticação do webhook (`asaas.webhook.access-token`). Secrets via variável de ambiente, nunca hardcoded. **verify:** app sobe nos dois profiles; propriedades resolvidas (teste `@SpringBootTest` mínimo ou binding test).
- [x] 2.3 Testes do gateway com WireMock (`AsaasGatewayImplTest`, padrão do `IntervalsIcuClientImplTest`): criação, idempotência do cliente (CA14), erros não-2xx → `AsaasIntegrationException`, e não-vazamento de token/API key em log/exceção. **verify:** `AsaasGatewayImplTest` verde (8 testes); contexto sobe com os beans novos (`OpenApiConfigTest`).

## 3. Endpoints administrativos

- [x] 3.1 **(PCI confirmado 2026-07-23: token pré-tokenizado)** `dto/input/AssinaturaInputDto.java` (+ `AssinaturaTierInputDto` para o PATCH) (record + Bean Validation — **token de cartão do Asaas `creditCardToken`, nunca PAN/CVV bruto**, `nextDueDate`, `valor`, tier) e `dto/output/AssinaturaOutputDto.java` (record + `@JsonInclude(NON_NULL)` — status, datas, tier; **nunca** expõe token/ids sensíveis). O campo do token é excluído de log/`toString`/persistência. **verify:** grep não acha `public class .*(Input|Output)Dto`; grep confirma que o token não aparece em nenhum `log.`/`toString`; compila.
- [x] 3.2 `services/AssinaturaService.java` (interface) + impl + `AssinaturaMapper` — `criar` (fluxo `PENDENTE`→Asaas→`ATIVA`, idempotente por `assessoriaId` — CA13/CA14), `atualizarTier` e `cancelar` (Asaas como última op da `@Transactional` — CA15). JavaDoc obrigatório de Idempotência/Side-effects/Tenant-aware em cada método público. Conflito de duplo-POST vira exceção de domínio mapeada no `GlobalExceptionHandler` (409). **verify:** testes da task 3.4 verdes.
- [x] 3.3 `controller/AssinaturaController.java` — `POST`/`PATCH`/`DELETE` em `/api/admin/assessorias/{id}/assinatura`, `@PreAuthorize("hasRole('ADMIN')")`, Swagger completo (`@Tag` `assinaturas` ASCII, `@Operation`, `@ApiResponses` inclusive 409/502), injeta só a interface, retorna `ResponseEntity<...OutputDto>`/`Void`. **verify:** springdoc valida os Swagger (`OpenApiConfigTest`); contexto sobe. **`@WebMvcTest` adiado (justificado):** controller é fino (só delega), `@WebMvcTest` seria infra sliced-security net-new no módulo; rota/status/`@PreAuthorize` cobertos centralmente (`CoreSecurityConfigTest`) e ponta a ponta pelo teste de integração da §7.
- [x] 3.4 Testes de serviço (`AssinaturaServiceImplTest`, Mockito, `@Nested`) cobrindo CA1/CA13 (PENDENTE→ATIVA, `InOrder` prova âncora antes do Asaas), CA13 (Asaas falha → fica `PENDENTE`, tier não gravado), CA14 (retry retoma `PENDENTE` sem novo insert; duplo-POST em `ATIVA` → conflito, sem Asaas), CA9/CA15 (`InOrder` local-antes-do-gateway; Asaas falha → exceção propaga p/ rollback), CA7 (cancela local + Asaas; PENDENTE sem subscription cancela local sem Asaas). **verify:** `AssinaturaServiceImplTest` verde (11 testes).

## 4. Webhook

- [x] 4.1 `controller/AsaasWebhookController.java` — `POST /api/v1/asaas/webhook`, sem `@PreAuthorize`, valida header `asaas-access-token` antes de qualquer processamento (CA11). **verify:** teste com header ausente/errado → rejeitado sem tocar o serviço.
- [x] 4.2 Registro do path em `CoreSecurityConfig`/`CoreSecurityProperties` (`permitAll()`, mesmo mecanismo de `strava-paths` — design.md Decisão 4; `CoreSecurityConfig.java:45` usa `getStravaPaths()`). **verify:** requisição não autenticada ao path passa pelo filtro; outros paths continuam protegidos.
- [x] 4.3 `services/AsaasWebhookEventService.java` — dispatch por tipo de evento (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`/`PAYMENT_OVERDUE`/`SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED`), checagem de idempotência (task 0.2.2) antes da transição (Decisão 2). Lookup por `asaasSubscriptionId` (sem `tenant_id` no payload). Eventos fora do conjunto: logados, sem transição. **verify:** teste por tipo de evento aplica a transição correta da tabela da Decisão 2.
- [x] 4.4 Testes cobrindo CA3, CA4, CA6, CA8, CA10 (idempotência — reenviar o mesmo `id` não duplica transição) e CA11 (header ausente/incorreto → rejeitado sem processar). **verify:** `./mvnw test -Dtest=AsaasWebhookEventServiceTest` verde.

## 5. Job de carência

- [x] 5.1 `scheduler/AssinaturaSuspensaoScheduler.java` — job diário (padrão do `DailyActivitySyncScheduler`, cross-tenant, sem `TenantContext`), query `findByStatusAndOverdueDesdeBefore(INADIMPLENTE, agora.minusDays(5))`, transiciona para `SUSPENSA` + `Assessoria.ativo=false` (CA5). `overdueDesde` setado pelo webhook `PAYMENT_OVERDUE` (Decisão 2), não recalculado pelo job. **verify:** teste do scheduler roda a query e aplica a transição.
- [x] 5.2 Teste do scheduler — BVA na fronteira: `overdueDesde` há exatamente 4 dias **não** suspende; há mais de 5 dias suspende. **verify:** `./mvnw test -Dtest=AssinaturaSuspensaoSchedulerTest` verde.

## 6. Retrofit de `Assessoria` (depende da migration 0.2.3)

- [x] 6.1 `entity/Assessoria.java` — remove `dataAssinatura`/`dataExpiracao`/`trial`/`dataFimTrial`; `isValida()` (`:154-162`) simplifica para `return ativo;` (design.md Decisão 8); `podeAdicionarAtleta(int)` inalterado. **verify:** compila; nenhum campo removido referenciado.
- [x] 6.2 `grep -rn 'trial\|dataFimTrial\|dataAssinatura\|dataExpiracao'` em `src/main` e `src/test` — remover/atualizar cada uso (DTOs, mappers, testes existentes de `Assessoria`). **verify:** grep pós-edição não retorna referência viva aos 4 campos.
- [x] 6.3 `./mvnw clean test` completo — garantir que a suíte pré-existente de `Assessoria`/`AssessoriaService` continua verde após a remoção. **verify:** build verde, zero falhas/erros.

## 7. Testes de integração

- [x] 7.1 Teste de integração ponta a ponta (`@SpringBootTest` + WireMock mock do Asaas): criar assinatura (`PENDENTE`→`ATIVA`) → webhook `PAYMENT_OVERDUE` → job de carência → `SUSPENSA` → webhook `PAYMENT_CONFIRMED` → `ATIVA`, cobrindo CA1/CA3/CA5/CA6 numa sequência só, com `Assessoria.ativo` acompanhando. **verify:** `./mvnw test -Dtest=AssinaturaBillingIntegrationTest` verde.

## 8. QA gate (2026-07-23) — reviewers + fixes

Rodados code-reviewer + security-reviewer + clean-code-reviewer sobre o diff limpo (merge-base..HEAD). Suíte completa: 2083 testes verdes.

- [x] C1 (security, Critical) — autorização cross-tenant nos endpoints admin. **Decisão do usuário:** `ADMIN` em `/api/admin/**` é role de **staff de plataforma Menthoros** (não admin por-tenant), consistente com o `AssessoriaController` pré-existente → **não há IDOR**. Documentado no JavaDoc do `AssinaturaController`. Sem fix de código.
- [x] C2 (clean-code, Critical) — `criarAssinatura` não idempotente (2ª subscription no retry → cobrança duplicada). Fix: `GET /subscriptions?externalReference` antes do POST. Teste `reaproveitaAssinaturaExistente`.
- [x] I1 (Important) — `cancelar()`/`atualizarTier()` sem guarda de `CANCELADA`. Fix: no-op/conflito. Testes `jaCanceladaNoOp`/`canceladaConflita`.
- [x] I2 (Important) — retry sobre `PENDENTE` não sincronizava `valor`/`nextDueDate`. Fix: sempre do input corrente. Teste `retrySincronizaValorCorrigido`.
- [x] I3 (Important) — passo 3 do `criar` (ATIVA + tier) não atômico. Fix: `TransactionTemplate`.
- [x] M1 (Minor) — corrida na idempotência do webhook. Fix: controller trata `DataIntegrityViolationException` → 200.
- [ ] Follow-ups adiados (não bloqueiam): reassinatura pós-`CANCELADA` (win-back) — documentar/decidir; `/api/admin` vs `/api/v1/` (padrão pré-existente); dedupe do try/catch no gateway.

**Pré-`/pr`:** atualizar a branch com `develop` (está atrás — merge do `athlete-onboarding-baseline` PR #47). **Pré-go-live:** virar `ASAAS_MOCK=false` (provider real).

## Entrega

- **PR backend #49 mergeado em `develop`** (2026-07-23, merge commit `f6992a4`). Suíte completa: **2083 testes, 0 falhas**.
- **Provider mockado** (`asaas.mock=true`, `AsaasGatewayMock`) — a integração real (`AsaasGatewayImpl`) entra ao setar `ASAAS_MOCK=false` + credenciais, sem mudar código.
- **Ciclo validado ao vivo por HTTP** (app real + JWT ADMIN + mock): criar (201/ATIVA) → `PAYMENT_OVERDUE` (INADIMPLENTE) → idempotência (evento repetido não duplica) → `PAYMENT_CONFIRMED` (ATIVA) → cancelar (204/CANCELADA + assessoria inativa).
- Arquivada em `changes/archive/2026-07/2026-07-23-assessoria-billing-asaas/`.
