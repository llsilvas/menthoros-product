# Proposal: fix-tenant-validation-not-found

**Tamanho:** M · **Trilha:** Full (**muda contrato de API** — o status de erro de todo endpoint
anotado com `@RequireTenant` passa de 403 para 404 no caminho negado, o que ripple para o cliente
gerado do front; e mexe em **guarda de multi-tenancy**, que é superfície de segurança. Backend-only,
**sem migration**. Pelos critérios do `config.yaml`, dois deles isolados já exigiriam Full)

## Status

- Proposta inicial (2026-08-02) — aguardando DoR antes de `/implement init`.
- Origem: bug reportado pelo founder ("erro ao aprovar o treino"), com log de produção local.
- Decisões de escopo do founder (2026-08-02): **backend-only** nesta change; e **não vazar
  existência de recurso entre tenants** — 404 nos dois casos, com a distinção ficando só no log.

## Why

O coach clicou em aprovar um plano e recebeu **403 "Acesso negado"** sobre um plano da **própria
assessoria**. O log mostra o `TenantValidationAspect` recusando, e registrando:

```
SECURITY_VIOLATION: Tentativa de acesso cross-tenant
| tenant=1b5ce37e-… | resourceId=bc30656e-… | method=aprovar
```

Investigação: o `resourceId` **não existe em nenhuma tabela do banco** — não é recurso de outro
tenant, é recurso nenhum. O `TenantValidationRepository` cobre `PlanoSemanal` corretamente; ele
devolveu `false` pelo motivo certo (não há o que encontrar), e o aspect traduziu isso para a
conclusão errada.

O aspect trata **"não existe"** e **"é de outro tenant"** como o mesmo caso
(`TenantValidationAspect:82-99`). Duas consequências, e a segunda é a grave:

1. **A mensagem mente para o treinador.** "Acesso negado" sobre um plano dele mesmo não sugere
   nenhuma ação. Um "não encontrado" ao menos diz "recarregue a tela".
2. **O log de segurança fica envenenado.** Um plano deletado gera `SECURITY_VIOLATION: Tentativa de
   acesso cross-tenant`. Isso é pior que ruído: **treina quem lê o log a ignorar exatamente a linha
   que existe para sinalizar ataque real.** Hoje, num alerta de multi-tenancy, não dá para saber se
   houve tentativa de invasão ou se alguém clicou num botão com a tela velha.

Como a guarda cobre **29 controllers**, isso não é um defeito de um endpoint: é o comportamento
padrão de negação de toda a aplicação.

## What Changes

- **`TenantValidationRepository`** ganha `resourceExistsInAnyTenant(UUID)` — mesma varredura por
  repositório, sem o filtro de tenant. Roda **apenas no caminho já negado**, que é raro.
- **`TenantValidationAspect`** passa a distinguir os dois casos:

  | Situação | Status | Log |
  |---|---|---|
  | Recurso não existe em lugar nenhum | **404** | `DEBUG` — evento operacional banal |
  | Recurso existe em OUTRO tenant | **404** | `WARN SECURITY_VIOLATION` — agora significa alguma coisa |

- **Mesmo status nos dois casos, de propósito** (decisão do founder): um 403 no segundo caso
  confirmaria ao chamador que aquele id existe em algum tenant — vazamento pequeno, mas real, de
  enumeração. A diferença fica no log, que é interno.
- **`@ApiResponses` dos 29 controllers** com `@RequireTenant`: o 403 documentado como "atleta de
  outro tenant" vira 404.
- **`GlobalExceptionHandler`**: mapeamento da nova exceção, se necessário.

## Impact

**Custo real, medido antes de escrever a spec** (o escopo é maior do que "trocar um status"):

| Superfície | Volume |
|---|---|
| Controllers com `@RequireTenant` a reanotar | **29** |
| Arquivos de teste que assertam 403 cross-tenant | **5** (~20 asserções a revisar) |
| Cliente gerado do front | precisa ser regerado — o status documentado muda |

**Migration:** nenhuma.

**Contrato de API:** muda o status de erro do caminho negado. É a razão de a change ser Full apesar
do diff pequeno em linhas de produção.

## Critérios de aceite

- **CA1 — Recurso inexistente responde 404 sem alarme falso**
  - **Given** um id que não existe em nenhuma tabela
  - **When** um endpoint com `@RequireTenant` é chamado com ele
  - **Then** a resposta é 404
  - **And** **nenhuma** linha `SECURITY_VIOLATION` é emitida

- **CA2 — Cross-tenant real continua sendo sinalizado**
  - **Given** um id que existe, mas pertence a outro tenant
  - **When** o endpoint é chamado
  - **Then** a resposta é 404 (idêntica ao caso acima, para não vazar existência)
  - **And** uma linha `WARN SECURITY_VIOLATION` é emitida, com tenant, resourceId e método

- **CA3 — Indistinguibilidade externa**
  - **Given** os dois cenários acima
  - **When** o cliente compara as respostas
  - **Then** status, corpo e headers são idênticos — a diferença existe apenas no log do servidor

- **CA4 — Caminho feliz intocado**
  - **Given** um recurso do tenant atual
  - **When** o endpoint é chamado
  - **Then** o comportamento é exatamente o de hoje, sem query extra

- **CA5 — Custo da varredura extra só no caminho negado**
  - **Given** uma chamada autorizada
  - **When** o aspect valida
  - **Then** `resourceExistsInAnyTenant` **não** é invocado

- **CA6 — Documentação de API coerente**
  - **Given** os 29 controllers com `@RequireTenant`
  - **When** o OpenAPI é gerado
  - **Then** nenhum deles documenta 403 para "recurso de outro tenant"

## Métrica de sucesso

- **Sinal de segurança recuperado:** toda linha `SECURITY_VIOLATION` no log passa a exigir
  investigação. Hoje elas são majoritariamente falsas — a meta é que a taxa de falso positivo caia a
  zero, medida sobre uma janela de logs após o deploy.
- **Rotina do treinador:** o coach deixa de receber "acesso negado" sobre recurso próprio; a
  mensagem passa a indicar recarregar a tela.

## Open Questions & Assumptions

1. **Por que o front mandou um id fantasma** continua em aberto — é o **problema 2**, fora desta
   change por decisão de escopo. `CoachPlanReviewPage.tsx:133` envia `selected.id`, vindo de uma
   lista que o backend devolveu, então o id já foi válido em algum momento. Hipótese não confirmada:
   lista velha após regeneração do plano. **Esta change não conserta isso** — apenas faz o erro
   dizer a verdade. Precisa de change própria no front.
2. **`resourceExistsInAnyTenant` varre N repositórios sem filtro de tenant.** Só roda no caminho
   negado, mas é uma query por entidade. Aceitável pela raridade; se virar problema, trocar por uma
   única query com `UNION ALL`.
3. **Presumo que nenhum cliente dependa do 403** para lógica de fluxo (ex.: redirecionar para
   login). O `request.ts` do front tem tratamento genérico por status — **a confirmar no DoR** antes
   de mexer, porque um 404 caindo num handler que espera 403 pode mudar comportamento de tela.

## Riscos e mitigações

- **Regressão silenciosa em telas que tratam 403** (MÉDIO): ver premissa 3. Mitigação: varrer o
  front por tratamento de 403 antes de implementar; se houver, a change cresce para dois repos.
- **29 controllers reanotados à mão** (MÉDIO): volume convida a erro de desatenção. Mitigação: teste
  que varre o OpenAPI gerado e falha se algum endpoint com `@RequireTenant` ainda documentar 403 de
  tenant (CA6) — vale mais que revisão visual.
- **Perda de granularidade de depuração** (BAIXO, aceito): com 404 nos dois casos, quem depura em
  produção depende do log para distinguir. É o preço da decisão de não vazar, tomada
  conscientemente.

## Non-goals

- Corrigir a origem do id fantasma no front (Open Question #1) — change própria.
- Rever quais entidades o `TenantValidationRepository` cobre.
- Mudar `@RequireTenant` em si (assinatura, `resourceParamIndex`).
- Unificar a varredura em query única (Open Question #2).

## Referências

- Log de origem: `POST /api/v1/coach/planos/{id}/aprovar` → 403, 2026-08-02 19:15:03.
- Código: `TenantValidationAspect:82-99`, `TenantValidationRepository`.
