**Tamanho:** L · **Trilha:** Full

> Full porque muda schema de banco (`tb_assinatura` nova + remoção de 4 colunas de `tb_assessoria`), muda contrato de API (endpoints admin novos + webhook público novo) e carrega risco de segurança/multi-tenancy (webhook precisa bypassar o filtro de tenant, como o `StravaWebhookController`; falha na sincronização de status afeta cobrança real de uma assessoria).

## Status

- Sessão de grilling / domain modeling (2026-07-21): 11 decisões resolvidas sobre o modelo de cobrança B2B, 2 ADRs criados em `apps/menthoros-backend/docs/adr/` (ADR-0004, ADR-0005), glossário atualizado em `apps/menthoros-backend/CONTEXT.md` (entrada `Assinatura`). Nenhum código implementado ainda — esta change parte do zero.

## Why

O Menthoros hoje cobra as assessorias (tenants B2B) de forma manual/informal: `Assessoria.plano` (`PlanoAssessoria` — GRATUITO/BASIC/PRO/ENTERPRISE) e os campos `trial`/`dataFimTrial`/`dataAssinatura`/`dataExpiracao` existem no schema, mas não há nenhuma integração de pagamento, nenhuma cobrança real, nenhum jeito automático de suspender uma assessoria inadimplente. Isso significa:

1. **Risco de calote sem alavanca**: uma assessoria pode ficar em trial ou plano pago indefinidamente sem que o Menthoros tenha um mecanismo de cobrança real nem de suspensão automática.
2. **Trabalho manual de cobrança**: sem integração com um provedor de pagamento, toda cobrança e reconciliação é manual — não escala.
3. **Trial sem compromisso**: hoje não há captura de forma de pagamento no início do relacionamento comercial, então o time não tem garantia de conversão trial → pago.

**Esta change integra o Asaas como motor de cobrança** (cartão recorrente, Pix, boleto, nota fiscal, régua de dunning nativa) e mantém no Menthoros apenas o serviço de entitlement — o que a assessoria pode acessar (`Assessoria.plano`/limites/feature flags, inalterado) — sincronizado com o estado de pagamento via webhook. Não se constrói motor de cobrança próprio.

## What Changes

### Backend (`menthoros-backend`) — única área afetada; sem mudança no frontend nesta change

- **Entidade `Assinatura`** (nova, 1:1 com `Assessoria`, sem histórico local — ver ADR-0004): `asaasCustomerId`, `asaasSubscriptionId`, `status` (`PENDENTE`/`ATIVA`/`INADIMPLENTE`/`SUSPENSA`/`CANCELADA` — `PENDENTE` é estado transitório de criação, ver design.md Decisão 9), `dataProximaCobranca`, `valor`, `overdueDesde`.
- **Cliente Asaas** (`services/gateway` novo) — criação de customer + subscription (com token de cartão e `nextDueDate` configurável, suportando trial com cobrança diferida — ver ADR-0005), atualização de valor, cancelamento.
- **Endpoints administrativos** (`/api/admin/assessorias/{id}/assinatura`, `@PreAuthorize("hasRole('ADMIN')")`, mesmo padrão de `AssessoriaController`):
  - `POST` — cria `Assinatura` (Asaas + local).
  - `PATCH` — troca de tier (`PlanoAssessoria` local + valor no Asaas, sempre nesta ordem — nunca inferido de evento do Asaas).
  - `DELETE` — cancela (Asaas + local).
- **Webhook público** (`/api/v1/asaas/webhook`, sem JWT, mesmo padrão de bypass do `StravaWebhookController`) — consome `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`/`PAYMENT_OVERDUE` e `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` (reconciliação de segurança, não gatilho primário de cancelamento). Autenticado via header `asaas-access-token`. Idempotente via `id` do evento/`payment.id` (Asaas usa entrega *at-least-once*, até 5 reenvios).
- **Job diário de carência** (mesmo padrão do `DailyActivitySyncScheduler`) — `Assinatura` em `INADIMPLENTE` há mais de 5 dias corridos sem pagamento confirmado → `SUSPENSA` + `Assessoria.ativo=false` (bloqueio total do tenant, atleta incluído — decisão deliberada).
- **Remoção de `trial`/`dataFimTrial`/`dataAssinatura`/`dataExpiracao` de `Assessoria`** — os dois últimos migram para `Assinatura`; os dois primeiros são removidos sem substituto (trial deixa de ser conceito rastreado no Menthoros, vira só um `nextDueDate` futuro na assinatura do Asaas). `Assessoria.ativo` passa a ser escrito só por sincronização a partir do status de `Assinatura`.
- **Sem backfill** — zero assessorias em produção hoje com este modelo de billing.

## Critérios de aceite

- **CA1 — Criação de assinatura:** `POST /api/admin/assessorias/{id}/assinatura` cria cliente + assinatura no Asaas (cartão capturado, `nextDueDate` configurável) e persiste `Assinatura` local com `status=ATIVA`.
- **CA2 — Assessoria sem `Assinatura` continua funcionando:** assessoria sem `Assinatura` associada mantém `Assessoria.ativo` com o comportamento atual (editável, sem gate de cobrança) — comportamento preexistente preservado.
- **CA3 — Inadimplência não suspende na hora:** webhook `PAYMENT_OVERDUE` → `Assinatura` vai para `INADIMPLENTE`; `Assessoria.ativo` permanece inalterado (carência).
- **CA4 — Pagamento resolvido durante a carência:** `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` com `Assinatura` em `INADIMPLENTE` dentro dos 5 dias → volta para `ATIVA`; `Assessoria.ativo` nunca foi alterado.
- **CA5 — Suspensão após carência:** job diário encontra `Assinatura` em `INADIMPLENTE` há mais de 5 dias corridos sem pagamento confirmado → `status=SUSPENSA` + `Assessoria.ativo=false` (bloqueio total).
- **CA6 — Reativação pós-suspensão:** `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` com `Assinatura` em `SUSPENSA` → volta para `ATIVA` + `Assessoria.ativo=true`.
- **CA7 — Cancelamento sempre administrativo:** `DELETE /api/admin/assessorias/{id}/assinatura` chama a API de cancelamento do Asaas e marca `CANCELADA` localmente + `Assessoria.ativo=false`.
- **CA8 — Reconciliação de segurança:** webhook `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` também leva `Assinatura` para `CANCELADA` + `Assessoria.ativo=false`, mesmo sem cancelamento prévio via CA7.
- **CA9 — Troca de tier é sempre administrativa:** `PATCH /api/admin/assessorias/{id}/assinatura` atualiza `PlanoAssessoria` local e o valor da assinatura no Asaas na mesma operação; nenhum código infere tier a partir de evento do Asaas.
- **CA10 — Idempotência do webhook:** reenvio do mesmo evento (mesmo `id`/`payment.id`) não duplica transição de estado nem side-effect.
- **CA11 — Autenticação do webhook:** requisição sem header `asaas-access-token` válido é rejeitada, sem processar o payload.
- **CA12 — Trial com cartão capturado:** `Assinatura` criada em modo trial aceita `nextDueDate` no futuro (ex.: +60 dias); `PlanoAssessoria` já reflete o tier vendido desde a criação, não `GRATUITO`.
- **CA13 — Falha parcial na criação preserva âncora local:** o `POST` grava `Assinatura` local `PENDENTE` antes de chamar o Asaas; se a chamada falhar, a `Assinatura` fica `PENDENTE` (âncora local) e nenhum customer/subscription órfão fica invisível no Asaas; sucesso confirma para `ATIVA` (design.md Decisão 9).
- **CA14 — Idempotência do POST de criação:** reexecução do `POST` para uma assessoria que já tem `Assinatura` retoma a `PENDENTE` (sem duplicar customer no Asaas, via `externalReference`) ou responde conflito tratado se já `ATIVA` — nunca cria segunda assinatura nem estoura o `UNIQUE(assessoria_id)` com erro não tratado.
- **CA15 — Atomicidade lógica de PATCH/DELETE:** a chamada ao Asaas é a última operação dentro da transação local; falha externa reverte o lado local — nenhum lado fica alterado (garantia operacional do CA9).

## Revisão de produto (2026-07-21, `product-reviewer`)

**Veredito: GO**, com 3 pontos abertos para refinar antes ou durante a implementação:

1. **Aviso ao coach antes do bloqueio total (CA5)** — hoje a suspensão é silenciosa do ponto de vista do produto (o Asaas notifica a assessoria por e-mail/WhatsApp, mas ninguém no app avisa o coach). Um treinador pode acordar bloqueado sem entender por quê. Fica como débito para uma change futura (banner de cobrança pendente), não bloqueia esta.
2. **Modelo de taxas do Asaas** — quem absorve a taxa de processamento (cartão recorrente, tipicamente 3-4%)? Não é uma decisão técnica desta change, mas afeta o pricing das tiers — levar para o time comercial/CTO antes do rollout.
3. **Timing** — confirmar se esta change é para o MVP da primeira assessoria paga ou para quando já houver múltiplas assessorias cobradas simultaneamente; isso não muda o desenho, mas pode mudar a prioridade no roadmap.

## Métrica de sucesso

**Nota de escopo:** diferente da maioria das changes do produto, esta não otimiza diretamente a rotina do treinador (coach) — é uma capability de operação/financeiro do próprio Menthoros sobre seus clientes B2B (as assessorias). Sinalizado para o `product-reviewer` avaliar se esse desvio do North Star é aceitável para uma change de infraestrutura de negócio.

**Do time comercial/financeiro:** redução de reconciliação manual de cobrança (hoje 100% manual, sem qualquer integração) e eliminação do risco de assessorias inadimplentes sem gatilho de suspensão.

**Sinais mensuráveis (com mecanismo de medição):**
- **Zero intervenção manual de status:** nenhuma escrita direta em `Assessoria.ativo` fora da sincronização a partir de `Assinatura` (Decisão 2) — auditável por `grep`/revisão de código no PR (nenhum caller manual sobra) e, em runtime, pela ausência de `Assinatura` "presa" em `PENDENTE` (query `SELECT count(*) FROM tb_assinatura WHERE status='PENDENTE' AND criado_em < now() - interval '1 hour'` deve ser 0; alvo de alerta operacional).
- **Latência de suspensão dentro do SLA:** toda `Assinatura` que ultrapassa a carência é suspensa pelo job diário em ≤ 24h após o 5º dia — verificável por `overdue_desde` vs. o instante da transição para `SUSPENSA` (log estruturado do scheduler).
- **Cobertura de assinatura:** proporção de assessorias com contrato comercial ativo que têm `Assinatura` não-`PENDENTE` associada — query direta em `tb_assinatura`/`tb_assessoria`; meta 100% para as assessorias pagas onboardadas por esta capability.

Como hoje há **zero** assessorias cobradas, o baseline é 0 e a primeira assessoria paga é o primeiro ponto de medição — não há histórico manual a comparar, o ganho é a existência do mecanismo automático em si.

## Impact

- **Depende de:** nada (change independente).
- **Repos:** apenas `menthoros-backend`.
- **Não bloqueia nem altera:** `athlete-onboarding-baseline`, `deterministic-planner-engine`.

## Open Questions & Assumptions

- ✅ **Entidade separada `Assinatura`, 1:1, sem histórico local** (decisão 2026-07-21, ADR-0004).
- ✅ **Nome `Assinatura`; remoção — não duplicação — de `dataAssinatura`/`dataExpiracao`/`trial`/`dataFimTrial`** (decisão 2026-07-21).
- ✅ **Criação de `Assinatura` é ação admin separada de `criarAssessoria`** (decisão 2026-07-21).
- ✅ **Carência de 5 dias corridos antes de suspender** (decisão 2026-07-21) — job diário, mesmo padrão do `DailyActivitySyncScheduler`.
- ✅ **Suspensão é bloqueio total (atleta incluído), sem carve-out de leitura** (decisão 2026-07-21).
- ✅ **Trial com cartão capturado + `nextDueDate` diferido, sem estado `TRIAL` em `Assinatura`** (decisão 2026-07-21, ADR-0005).
- ✅ **Troca de tier sempre administrativa, nunca inferida do Asaas** (decisão 2026-07-21).
- ✅ **Cancelamento sempre administrativo; webhook de cancelamento é reconciliação, não gatilho primário** (decisão 2026-07-21).
- ✅ **Sem backfill — zero assessorias em produção hoje** (decisão 2026-07-21).
- **Trial sem cartão (negociação enterprise à parte)** — fica fora de escopo desta change como caso manual excepcional (ADR-0005); revisitar se o comercial pedir isso com volume.
- **Sem UI administrativa nesta v1** — pressuposto assumido, não confirmado com o usuário: o time comercial opera via Swagger/Postman direto nos endpoints admin, sem tela própria no frontend. Se o volume de assessorias crescer, uma UI interna pode virar change própria.
- **Banner de cobrança pendente para o coach dentro do produto** — fora de escopo desta change (o Asaas já notifica a assessoria diretamente por e-mail/WhatsApp via sua própria régua de dunning); revisitar se o time quiser reforçar esse aviso dentro do app.
