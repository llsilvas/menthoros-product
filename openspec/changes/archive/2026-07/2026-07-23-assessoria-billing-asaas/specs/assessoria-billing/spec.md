# assessoria-billing Specification

> Cenários Given/When/Then para os critérios de aceite CA1-CA15 do `proposal.md`. Espelha o padrão de
> `changes/archive/2026-07/2026-07-22-athlete-onboarding-baseline/specs/athlete-onboarding/spec.md`
> (a spec de onboarding vive no archive; a pasta canônica `openspec/specs/` só tem `fc-limiar-zones` e
> `prova-crud`). Contexto de código: `entity/Assessoria.java`, `controller/StravaWebhookController.java`
> + `config/core/CoreSecurityConfig.java` (bypass de tenant), `services/DailyActivitySyncScheduler.java`
> (padrão do job de carência), `enums/PlanoAssessoria.java`. Decisões de desenho em
> `design.md` (Decisões 1-9) e nos `ADR-0004`/`ADR-0005` do backend.
>
> `StatusAssinatura` = `PENDENTE` / `ATIVA` / `INADIMPLENTE` / `SUSPENSA` / `CANCELADA` (design.md Decisão 2 + 9).

## New Requirements

### Requirement: Criação de assinatura (CA1)

O sistema SHALL criar cliente e assinatura no Asaas e persistir uma `Assinatura` local `ATIVA` quando um
ADMIN cria a cobrança de uma assessoria.

#### Scenario: Criação bem-sucedida
- **Given** uma `Assessoria` sem `Assinatura` associada
- **And** um ADMIN autenticado com `hasRole('ADMIN')`
- **When** `POST /api/admin/assessorias/{id}/assinatura` é chamado com cartão, `nextDueDate` e `valor`
- **Then** uma `Assinatura` local é persistida com `status=ATIVA`, `asaasCustomerId` e `asaasSubscriptionId` preenchidos
- **And** `PlanoAssessoria` reflete o tier vendido (não `GRATUITO`)

### Requirement: Assessoria sem assinatura preserva comportamento atual (CA2)

O sistema SHALL manter o comportamento preexistente de `Assessoria` quando não há `Assinatura` associada —
sem gate de cobrança.

#### Scenario: Assessoria sem Assinatura permanece editável
- **Given** uma `Assessoria` sem nenhuma `Assinatura`
- **When** operações administrativas sobre a assessoria são executadas
- **Then** `Assessoria.ativo` mantém o comportamento atual (editável, sem bloqueio por cobrança)
- **And** nenhuma sincronização de status de cobrança é aplicada

### Requirement: Inadimplência não suspende imediatamente (CA3)

O sistema SHALL transicionar a `Assinatura` para `INADIMPLENTE` sem alterar `Assessoria.ativo` ao receber
um evento de pagamento vencido, iniciando a carência.

#### Scenario: PAYMENT_OVERDUE inicia a carência
- **Given** uma `Assinatura` em `status=ATIVA`
- **When** o webhook `PAYMENT_OVERDUE` é processado para essa assinatura
- **Then** `status` passa a `INADIMPLENTE`
- **And** `overdueDesde` é gravado com o instante do processamento
- **And** `Assessoria.ativo` permanece inalterado

### Requirement: Pagamento resolvido durante a carência (CA4)

O sistema SHALL retornar a `Assinatura` para `ATIVA` quando o pagamento é confirmado ainda dentro da
carência, sem nunca ter alterado `Assessoria.ativo`.

#### Scenario: PAYMENT_CONFIRMED dentro da carência
- **Given** uma `Assinatura` em `status=INADIMPLENTE` dentro dos 5 dias de carência
- **When** o webhook `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` é processado
- **Then** `status` volta para `ATIVA`
- **And** `overdueDesde` é limpo (null)
- **And** `Assessoria.ativo` nunca foi alterado

### Requirement: Suspensão após a carência (CA5)

O sistema SHALL suspender a `Assinatura` e desativar a assessoria quando a inadimplência ultrapassa 5 dias
corridos sem pagamento confirmado.

#### Scenario: Job diário suspende após 5 dias corridos
- **Given** uma `Assinatura` em `status=INADIMPLENTE` com `overdueDesde` há mais de 5 dias corridos
- **When** o job diário de carência executa
- **Then** `status` passa a `SUSPENSA`
- **And** `Assessoria.ativo` passa a `false` (bloqueio total do tenant, atleta incluído)

#### Scenario: Fronteira de 4 dias não suspende (BVA)
- **Given** uma `Assinatura` em `status=INADIMPLENTE` com `overdueDesde` há exatamente 4 dias
- **When** o job diário de carência executa
- **Then** `status` permanece `INADIMPLENTE`
- **And** `Assessoria.ativo` permanece inalterado

### Requirement: Reativação após suspensão (CA6)

O sistema SHALL reativar a `Assinatura` e a assessoria quando o pagamento é resolvido após a suspensão.

#### Scenario: PAYMENT_CONFIRMED com assinatura suspensa
- **Given** uma `Assinatura` em `status=SUSPENSA`
- **When** o webhook `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` é processado
- **Then** `status` volta para `ATIVA`
- **And** `Assessoria.ativo` volta para `true`

### Requirement: Cancelamento sempre administrativo (CA7)

O sistema SHALL cancelar a assinatura no Asaas e marcá-la `CANCELADA` localmente apenas por ação
administrativa.

#### Scenario: DELETE cancela no Asaas e localmente
- **Given** uma `Assinatura` associada a uma assessoria
- **And** um ADMIN autenticado
- **When** `DELETE /api/admin/assessorias/{id}/assinatura` é chamado
- **Then** a API de cancelamento do Asaas é invocada para `asaasSubscriptionId`
- **And** `status` passa a `CANCELADA`
- **And** `Assessoria.ativo` passa a `false`

### Requirement: Reconciliação de segurança no cancelamento externo (CA8)

O sistema SHALL tratar eventos de cancelamento vindos do Asaas como reconciliação de segurança,
levando a `Assinatura` para `CANCELADA` mesmo sem `DELETE` administrativo prévio.

#### Scenario: SUBSCRIPTION_DELETED sem cancelamento prévio
- **Given** uma `Assinatura` em qualquer estado não-`CANCELADA`
- **And** nenhum `DELETE` administrativo foi executado (cancelamento feito direto no painel do Asaas)
- **When** o webhook `SUBSCRIPTION_DELETED` ou `SUBSCRIPTION_INACTIVATED` é processado
- **Then** `status` passa a `CANCELADA`
- **And** `Assessoria.ativo` passa a `false`

### Requirement: Troca de tier é sempre administrativa (CA9)

O sistema SHALL atualizar o `PlanoAssessoria` local e o valor da assinatura no Asaas na mesma operação de
serviço, sem nunca inferir tier a partir de evento do Asaas.

#### Scenario: PATCH atualiza os dois lados
- **Given** uma `Assinatura` `ATIVA` de uma assessoria no tier `BASIC`
- **And** um ADMIN autenticado
- **When** `PATCH /api/admin/assessorias/{id}/assinatura` troca o tier para `PRO`
- **Then** `PlanoAssessoria` local passa a `PRO`
- **And** o valor da assinatura é atualizado no Asaas na mesma operação
- **And** nenhum código infere tier a partir de `SUBSCRIPTION_UPDATED` ou outro evento do Asaas

### Requirement: Idempotência do webhook (CA10)

O sistema SHALL processar cada evento do Asaas uma única vez, ignorando reenvios (entrega *at-least-once*).

#### Scenario: Reenvio do mesmo evento não duplica a transição
- **Given** um evento de webhook já processado (mesmo `id` de evento / `payment.id`)
- **When** o mesmo evento é reenviado pelo Asaas
- **Then** o sistema responde `200` sem reaplicar a transição de estado nem repetir o side-effect

### Requirement: Autenticação do webhook (CA11)

O sistema SHALL rejeitar requisições de webhook sem o header `asaas-access-token` válido, antes de
qualquer processamento do payload.

#### Scenario: Requisição sem token válido é rejeitada
- **Given** o endpoint público `POST /api/v1/asaas/webhook`
- **When** uma requisição chega sem o header `asaas-access-token` ou com valor incorreto
- **Then** a requisição é rejeitada
- **And** nenhum lookup de `Assinatura` nem transição de estado é executado

### Requirement: Trial com cartão capturado (CA12)

O sistema SHALL aceitar `nextDueDate` no futuro na criação, cobrando só na data e já refletindo o tier
vendido — sem estado `TRIAL` dedicado.

#### Scenario: Assinatura em modo trial com cobrança diferida
- **Given** um ADMIN criando uma `Assinatura` com `nextDueDate` = hoje + 60 dias
- **When** `POST /api/admin/assessorias/{id}/assinatura` é processado
- **Then** o cartão é validado no Asaas na criação, mas a primeira cobrança fica agendada para `nextDueDate`
- **And** `status` é `ATIVA` (não há estado `TRIAL`)
- **And** `PlanoAssessoria` reflete o tier vendido desde a criação, não `GRATUITO`

### Requirement: Falha parcial na criação preserva âncora local (CA13)

O sistema SHALL persistir uma `Assinatura` local `PENDENTE` antes de chamar o Asaas, de forma que uma
falha na chamada externa nunca deixe um cliente/assinatura órfão no Asaas sem âncora local rastreável
(design.md Decisão 9).

#### Scenario: Asaas indisponível durante a criação
- **Given** uma `Assessoria` sem `Assinatura`
- **When** `POST .../assinatura` grava a `Assinatura` local `PENDENTE` e a chamada ao Asaas falha
- **Then** a `Assinatura` permanece `PENDENTE` (sem `asaasCustomerId`/`asaasSubscriptionId`)
- **And** o endpoint responde erro, sinalizando que a criação não foi concluída
- **And** nenhuma `Assinatura` fica `ATIVA` sem correspondência no Asaas

#### Scenario: Sucesso confirma a assinatura
- **Given** uma `Assinatura` `PENDENTE` recém-criada
- **When** a chamada ao Asaas retorna `customerId` e `subscriptionId`
- **Then** a `Assinatura` é atualizada com os ids do Asaas e `status` passa a `ATIVA`

### Requirement: Idempotência do POST de criação (CA14)

O sistema SHALL evitar criar um segundo cliente/assinatura no Asaas quando o POST é reexecutado para uma
assessoria que já possui `Assinatura` (retry de uma criação `PENDENTE` ou colisão de duplo-POST),
respeitando `UNIQUE(assessoria_id)` sem erro genérico não tratado (design.md Decisão 9).

#### Scenario: Retry retoma a assinatura PENDENTE
- **Given** uma `Assinatura` `PENDENTE` para a assessoria (criação anterior falhou na etapa do Asaas)
- **When** `POST .../assinatura` é chamado de novo para a mesma assessoria
- **Then** o sistema retoma a criação a partir da `Assinatura` existente
- **And** usa a referência externa (`assessoriaId`) para não criar um cliente duplicado no Asaas

#### Scenario: Duplo-POST sobre assinatura já ativa
- **Given** uma `Assinatura` já `ATIVA` para a assessoria
- **When** `POST .../assinatura` é chamado de novo para a mesma assessoria
- **Then** o sistema responde um erro de conflito tratado (não cria segunda assinatura no Asaas)

### Requirement: Atomicidade lógica de PATCH e DELETE (CA15)

O sistema SHALL executar a chamada ao Asaas como última operação dentro da transação local em `PATCH` e
`DELETE`, de forma que uma falha externa reverta a transação local e nenhum lado fique alterado
(garantia operacional do CA9 — "nunca só um lado"; design.md Decisão 9).

#### Scenario: Asaas falha durante o PATCH
- **Given** uma `Assinatura` `ATIVA` no tier `BASIC`
- **When** `PATCH .../assinatura` atualiza o tier local para `PRO` e a chamada `atualizarValor` ao Asaas falha
- **Then** a transação local é revertida
- **And** `PlanoAssessoria` permanece `BASIC` (nenhum lado alterado)
