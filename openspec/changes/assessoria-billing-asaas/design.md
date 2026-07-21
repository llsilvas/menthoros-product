# Design — assessoria-billing-asaas

## Contexto

`Assessoria` (`entity/Assessoria.java`) já carrega um bloco `PLANO E COBRANÇA` (`plano`, `maxAtletas`, `maxTecnicos`, `dataAssinatura`, `dataExpiracao`, `trial`, `dataFimTrial`, `ativo`, 4 feature flags), mas nenhuma integração de pagamento real existe hoje — é só o plano declarativo. `AssessoriaController.criarAssessoria` (`/api/admin/assessorias`, `@PreAuthorize("hasRole('ADMIN')")`) confirma que o cadastro de assessoria já é um fluxo interno (sales-led), não self-service.

Referências (estado atual):
- `entity/Assessoria.java` — bloco de plano/cobrança atual (linhas ~94-135)
- `enums/PlanoAssessoria.java` — `GRATUITO`/`BASIC`/`PRO`/`ENTERPRISE`
- `controller/AssessoriaController.java` — padrão de endpoint admin a seguir
- `controller/StravaWebhookController.java` + `config/core/CoreSecurityConfig.java` (`strava-paths` em `application.yml`) — padrão de bypass de tenant filter para webhook público
- `DailyActivitySyncScheduler` — padrão de job agendado a seguir para o job de carência

## Decisão 1 — `Assinatura` como entidade separada, 1:1, sem histórico local (ADR-0004)

`Assinatura` é uma entidade nova (`tb_assinatura`), não campos soltos em `Assessoria` — separa "identidade do tenant" de "estado de cobrança". Relação 1:1 (`assessoria_id UNIQUE`), sobrescrita a cada evento — sem tabela de histórico local, porque o Asaas já é o sistema de registro de cobrança (fatura, tentativa de pagamento, nota fiscal). Ver ADR-0004 para o raciocínio completo, incluindo por que isso diverge do padrão `AthleteBaselineState`/`History` adotado horas antes na mesma sessão de grilling.

Campos: `id`, `assessoriaId` (FK, unique), `asaasCustomerId`, `asaasSubscriptionId`, `status` (enum), `dataProximaCobranca` (`LocalDateTime`, substitui `dataExpiracao`), `valor` (`BigDecimal`), `overdueDesde` (`LocalDateTime`, nullable — usado só pelo job de carência), `criadoEm`/`atualizadoEm`.

## Decisão 2 — Máquina de estados de `status`

Enum `StatusAssinatura`: `ATIVA` / `INADIMPLENTE` / `SUSPENSA` / `CANCELADA`. Sem estado `TRIAL` (ver Decisão 5 / ADR-0005) — trial é uma `ATIVA` comum com primeira cobrança agendada no futuro.

Transições e gatilhos:

| De | Para | Gatilho |
|---|---|---|
| — | `ATIVA` | `POST .../assinatura` (CA1) |
| `ATIVA` | `INADIMPLENTE` | webhook `PAYMENT_OVERDUE` (CA3) |
| `INADIMPLENTE` | `ATIVA` | webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` dentro da carência (CA4) |
| `INADIMPLENTE` | `SUSPENSA` | job diário, > 5 dias corridos em `INADIMPLENTE` (CA5) |
| `SUSPENSA` | `ATIVA` | webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` (CA6) |
| qualquer | `CANCELADA` | `DELETE .../assinatura` (CA7, sempre origem admin) ou webhook `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` (CA8, reconciliação de segurança) |

`SUSPENSA`/`CANCELADA` escrevem `Assessoria.ativo=false`; `ATIVA` (a partir de `SUSPENSA`) escreve `Assessoria.ativo=true`. `Assessoria.ativo` nunca é editado manualmente a partir desta change em diante — só por esta sincronização.

Eventos do Asaas fora deste conjunto (`PAYMENT_CREATED`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_UPDATED`, etc.) são recebidos e logados, mas não disparam transição — consumo mínimo necessário para o CA1-CA12; ampliar sob demanda.

## Decisão 3 — Cliente Asaas e endpoints administrativos

Novo gateway (`services/gateway/AsaasGateway` + impl), mesmo padrão de `KeycloakOrganizationGateway`: `criarClienteEAssinatura(Assessoria, dadosCartao, nextDueDate, valor)`, `atualizarValor(asaasSubscriptionId, novoValor)`, `cancelarAssinatura(asaasSubscriptionId)`.

Endpoints em `AssinaturaController` (`/api/admin/assessorias/{id}/assinatura`, `@PreAuthorize("hasRole('ADMIN')")`, mesmo padrão de `AssessoriaController`):
- `POST` — chama `criarClienteEAssinatura`, persiste `Assinatura` local `ATIVA`. Aceita `nextDueDate` explícito no payload (suporta trial, Decisão 5).
- `PATCH` — atualiza `PlanoAssessoria` em `Assessoria` e chama `atualizarValor` no Asaas, na mesma transação de serviço (Decisão 6 / CA9) — nunca a ordem inversa.
- `DELETE` — chama `cancelarAssinatura`, marca `Assinatura.status=CANCELADA` + `Assessoria.ativo=false` (CA7).

## Decisão 4 — Webhook: segurança, idempotência e eventos consumidos

`AsaasWebhookController` (`/api/v1/asaas/webhook`, `@PostMapping`, sem `@PreAuthorize`) segue o padrão do `StravaWebhookController`: path adicionado à lista `permitAll()` em `CoreSecurityConfig`/`CoreSecurityProperties` (mesmo mecanismo de `strava-paths`, um novo `asaas-paths` ou reuso genérico).

**Autenticação (CA11):** valida o header `asaas-access-token` contra um segredo configurado (`application.yml`/variável de ambiente) — Asaas não assina o payload criptograficamente, só envia esse token estático (confirmado na doc oficial: https://docs.asaas.com/docs/duvidas-frequentes-webhooks). Requisição sem o header ou com valor incorreto é rejeitada antes de qualquer processamento.

**Idempotência (CA10):** Asaas entrega eventos *at-least-once* (até 5 reenvios com backoff crescente em caso de erro 4xx/5xx — https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks). Guarda o `id` do evento (ou `payment.id` para eventos de pagamento) numa tabela/coluna de controle antes de processar; evento já visto é respondido `200` sem reprocessar.

**Eventos consumidos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` (ver tabela da Decisão 2). Resolução de tenant: payload carrega `subscription.id`/`customer.id` do Asaas, não `tenant_id` — lookup por `Assinatura.asaasSubscriptionId` (unique).

## Decisão 5 — Trial com cartão capturado e cobrança diferida (ADR-0005)

`POST .../assinatura` aceita `nextDueDate` no futuro (o Asaas valida o cartão na criação, cobra só na data — confirmado em https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito). `PlanoAssessoria` já é setado para o tier vendido desde a criação, não `GRATUITO`. Não existe job/campo de expiração de trial: se a cobrança do dia N falhar, cai no fluxo normal de inadimplência (Decisão 2). Trial sem cartão (negociação enterprise à parte) é caso manual fora de escopo — a `Assinatura` simplesmente não existe até haver forma de pagamento.

## Decisão 6 — Troca de tier e cancelamento são sempre admin-originados (ADR-0004)

O Asaas não tem vocabulário de tier — só um `value` monetário na assinatura. `PlanoAssessoria` (`GRATUITO`/`BASIC`/`PRO`/`ENTERPRISE`) só existe no Menthoros. Por isso, toda mudança de tier e todo cancelamento parte de uma ação admin no Menthoros que reflete no Asaas — nunca o caminho inverso (nenhum código infere tier ou dispara cancelamento a partir de um evento genérico do Asaas). O webhook de cancelamento (`SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED`) é tratado apenas como reconciliação de segurança (CA8), para o caso de alguém cancelar direto no painel do Asaas.

## Decisão 7 — Job diário de carência

Novo scheduler (mesmo padrão do `DailyActivitySyncScheduler`, cross-tenant por natureza — não usa `TenantContext`, itera todas as `Assinatura` diretamente): busca `Assinatura` com `status=INADIMPLENTE` e `overdueDesde` há mais de 5 dias corridos, transiciona para `SUSPENSA` + `Assessoria.ativo=false` (CA5). `overdueDesde` é setado no momento em que o webhook `PAYMENT_OVERDUE` é processado (Decisão 2), não recalculado pelo job.

## Decisão 8 — Remoção dos campos legados de `Assessoria`

Migration remove `data_assinatura`, `data_expiracao`, `trial`, `data_fim_trial` de `tb_assessoria` (sem substituto para os dois últimos — ver ADR-0005). `dataAssinatura`/`dataExpiracao` não têm equivalente 1:1 em `Assinatura`: `dataProximaCobranca` cobre o caso de uso real (quando é a próxima cobrança), não uma data de expiração fixa. **Migration remove colunas com potencial de dado existente — requer confirmação explícita do usuário antes de rodar** (guardrail do `CLAUDE.md` da raiz), mesmo sabendo que não há assessorias em produção hoje (Decisão/CA do proposal.md).

`isValida()` (`entity/Assessoria.java:154-162`, hoje: `!ativo` → false; senão checa `trial`+`dataFimTrial` ou `dataExpiracao`) simplifica para `return ativo;` — toda a lógica de expiração migra para a sincronização `Assinatura` → `Assessoria.ativo` (Decisão 2), não sobra data nenhuma pra checar em `Assessoria`. `podeAdicionarAtleta(int)` (linhas 167-169) não referencia nenhum campo removido — permanece inalterado.
