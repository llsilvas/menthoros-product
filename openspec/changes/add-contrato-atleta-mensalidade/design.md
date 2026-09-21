# Design — add-contrato-atleta-mensalidade

## Context

Hoje `Atleta` tem `tipoPlanoAtleta` e `dataVencimentoPlano` (V57, `add-athlete-billing-plan`),
lidos por `AtletaMapper`, `CoachDashboardServiceImpl.montarResumo` e
`CoachAthleteProfileServiceImpl`, e derivados em `StatusVencimentoPlano.resolver(data, hoje)`
com janela de 7 dias. No front, `AtletaDialog` edita os dois campos e `billingPlanAdapters.ts`
resolve o badge para roster e perfil.

Papéis: `TECNICO`, `PROPRIETARIO` (composite de `TECNICO`, espelhado em `Usuario.owner`), `ADMIN`
(plataforma), `ATLETA`. Endpoints de dono da assessoria usam `hasRole('PROPRIETARIO')` ou
`hasAnyRole('PROPRIETARIO','ADMIN')` (`AtletaController:86`, `AssessoriaSettingsController`).

Jobs sobre entidades tenant-scoped seguem `SugestaoCoachGeneratorJob`: listam os tenants, e para
cada um fazem `TenantContext.setTenantId` / trabalho / `TenantContext.clear()` em `finally`, com
falha isolada por tenant. O padrão sem `TenantContext` de `AssinaturaSuspensaoScheduler` vale só
para `Assinatura`, que é B2B e global. Próxima migration livre: `V96`.

## Goals / Non-Goals

**Goals:** contrato por atleta que gera mensalidades sozinho; baixa e cancelamento pelo
proprietário; status derivado correto todo mês sem edição manual; valor invisível a quem não é
proprietário; remoção dos campos soltos de `Atleta`.

**Non-Goals:** dinheiro real, aviso (change 2), pausa, parcial, histórico de contrato, relatório,
gate por tier, experiência do atleta.

## Decisions

### D1. Duas entidades, tenant-scoped, sem tabela de evento

`ContratoAtleta` e `Mensalidade`, ambas com `tenant_id` e filtro de tenant como toda entidade de
domínio (diferente de `Assinatura`, que é cross-tenant por ser B2B). Sem `SubscriptionEvent` ou
histórico: o par (mensalidade, `pagoEm`, `valorPago`) já é o registro que o proprietário precisa;
auditoria fina não tem consumidor.

```sql
-- V96
CREATE TABLE tb_contrato_atleta (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  atleta_id uuid NOT NULL REFERENCES tb_atleta(id),
  periodicidade varchar(20) NOT NULL CHECK (periodicidade IN ('MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL')),
  valor numeric(10,2),
  dia_vencimento smallint NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  inicio date NOT NULL,
  encerrado_em timestamptz,
  aviso_atleta_ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL, atualizado_em timestamptz
);
CREATE UNIQUE INDEX uq_contrato_atleta_ativo ON tb_contrato_atleta(atleta_id) WHERE encerrado_em IS NULL;
CREATE INDEX idx_contrato_atleta_tenant ON tb_contrato_atleta(tenant_id, atleta_id);

CREATE TABLE tb_mensalidade (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  contrato_id uuid NOT NULL REFERENCES tb_contrato_atleta(id),
  vencimento date NOT NULL,
  valor numeric(10,2),
  status varchar(20) NOT NULL CHECK (status IN ('EM_ABERTO','PAGA','CANCELADA')),
  pago_em date,
  valor_pago numeric(10,2),
  criado_em timestamptz NOT NULL, atualizado_em timestamptz,
  CONSTRAINT uq_mensalidade_contrato_vencimento UNIQUE (contrato_id, vencimento)
);
CREATE INDEX idx_mensalidade_tenant_status_venc ON tb_mensalidade(tenant_id, status, vencimento);
```

O índice parcial `uq_contrato_atleta_ativo` é o que garante "um contrato ativo por atleta" no
banco, mantendo a porta aberta para histórico depois (contratos encerrados coexistem).

### D2. `ContratoAtletaService` como único dono das regras

Um serviço, transacional, com: `criarOuAtualizar`, `encerrar`, `darBaixa`, `desfazerBaixa`,
`cancelarMensalidade`, `garantirProximaMensalidade(contrato, hoje)` e
`resolverStatus(atletaId, hoje)`. Controller e scheduler só chamam; a aritmética de vencimento
vive numa classe pura `CalendarioVencimento` (testável sem Spring):

- `primeiroVencimento(inicio, dia)`: primeiro dia `dia` ≥ `inicio` (mesmo mês se ainda não
  passou, senão o mês seguinte), com clamp ao último dia do mês.
- `proximoVencimento(anterior, periodicidade, dia)`: `anterior` + N meses, dia clamped. O clamp
  usa sempre `dia` do contrato, não o dia do anterior — assim 31 → 28 (fev) → 31 (mar), não 28.

### D3. Renovação: "sempre existe uma mensalidade com vencimento ≥ hoje"

Regra única, idempotente, usada na criação do contrato e no `MensalidadeRenovacaoScheduler`
(`0 0 4 * * *`): enquanto o contrato está ativo e a mensalidade de maior vencimento tem
`vencimento < hoje`, gera a próxima a partir dela. **Sem mensalidade nenhuma, gera a partir de
`primeiroVencimento(max(inicio, hoje), dia)`** — nunca no passado: o sistema não inventa dívida
que ele não viu nascer (pre-mortem, achado 1). Violação do `UNIQUE` tratada como "já existe".

**Teto de 24 gerações por contrato por execução.** Ao atingir, o job loga `WARN` com contrato e
tenant e segue; a execução seguinte continua de onde parou, então o invariante se satisfaz em
poucas rodadas em vez de ficar falso em silêncio (pre-mortem, achado 5). Teste cobre atraso > 24
períodos.

**Isolamento (pre-mortem, achado 3):** o scheduler itera `tenantIds` distintos de
`tb_contrato_atleta` ativos, e por tenant faz `TenantContext.setTenantId` → gera → `clear()` em
`finally`, como `SugestaoCoachGeneratorJob`. Todo repositório usado recebe o tenant pelo contexto;
o contrato é relido por `(id, tenantId)` antes de gerar. IT com dois tenants, incluindo falha no
primeiro.

**Concorrência (pre-mortem, achado 4):** `ContratoAtleta` ganha `@Version`, e
`garantirProximaMensalidade` abre com `findByIdForUpdate` (lock pessimista, `PESSIMISTIC_WRITE`)
dentro da transação; `criarOuAtualizar`, `encerrar` e a geração passam pelo mesmo lock. Assim
"editar vale só para as futuras" e "encerrado não gera" são garantidos pela serialização, não
pela sorte. O `UNIQUE (contrato_id, vencimento)` fica como rede de segurança. Testes de corrida:
scheduler × encerrar, scheduler × editar valor/periodicidade.

Consequência: a mensalidade seguinte só nasce quando a anterior venceu. Com período mínimo de um
mês, ela existe pelo menos 21 dias antes de vencer, o que cobre o aviso de 7 dias da change 2.
Pagou antecipado? A mensalidade PAGA continua sendo a "de maior vencimento"; a próxima só nasce
quando ela vencer, que é o comportamento esperado.

Cancelar a mensalidade de maior vencimento **não** gera outra no mesmo período: o cancelamento é
"este período não cobra", e a próxima nasce quando o vencimento cancelado passar.

### D4. Status derivado a partir das mensalidades em aberto

`StatusVencimentoPlano` é renomeado para `StatusCobrancaAtleta` e passa a receber a lista de
vencimentos EM_ABERTO do atleta: `VENCIDO` se algum `< hoje`; `PROXIMO_VENCIMENTO` se o menor
está em `[hoje, hoje+7]`; senão `EM_DIA`. Sem mensalidade em aberto e sem contrato ativo →
ausente. Sem mensalidade em aberto com contrato ativo (caso teórico entre o vencimento e o job) →
`EM_DIA`. `proximoVencimento` = menor vencimento EM_ABERTO.

Para roster (`montarResumo`, N atletas) uma query só:
`findEmAbertoByTenantIdAndAtletaIdIn(...)` agrupada em memória — sem N+1.

### D5. Valor só sai pelo endpoint do proprietário

Os DTOs de atleta ganham `statusCobranca` e `proximoVencimento` e nada mais. `ContratoAtletaOutputDto`
e `MensalidadeOutputDto` existem só em `ContratoAtletaController`, com
`@PreAuthorize("hasAnyRole('PROPRIETARIO','ADMIN')")` em classe. Um teste de serialização garante
que nenhum DTO de atleta tem campo com `valor` no nome.

### D6. Ações da mensalidade por transição explícita

| Ação | De | Para | Guarda |
|---|---|---|---|
| baixa | EM_ABERTO | PAGA | `pagoEm` obrigatório (default hoje), `valorPago` default `valor` |
| desfazer baixa | PAGA | EM_ABERTO | limpa `pagoEm`/`valorPago` |
| cancelar | EM_ABERTO | CANCELADA | — |

Qualquer outra transição → `409` (`IllegalStateException` mapeada no `GlobalExceptionHandler`
como já é feito para plano). Sem "descancelar" em v1: o proprietário que cancelou por engano cria
o mesmo período de novo? Não — o `UNIQUE` impede; a mitigação é a mensagem clara e o fato de que
cancelamento é raro. Registrado em Open Questions.

### D7. Migração expand-only nesta change; o DROP fica para a change 2

`V96` cria as tabelas e faz backfill **só do contrato**, em SQL puro:

```sql
INSERT INTO tb_contrato_atleta (id, tenant_id, atleta_id, periodicidade, dia_vencimento, inicio, criado_em)
SELECT gen_random_uuid(), a.tenant_id, a.id, COALESCE(a.tipo_plano_atleta, 'MENSAL'),
       EXTRACT(DAY FROM a.data_vencimento_plano), a.data_vencimento_plano, now()
FROM tb_atleta a WHERE a.data_vencimento_plano IS NOT NULL;
```

Nenhuma mensalidade nasce na migration. A primeira vem da regra D3 na próxima execução do job
(ou de um `garantirProximaMensalidade` disparado no startup, a decidir na implementação): data
legada no futuro → mensalidade nessa data; data legada no passado → mensalidade no próximo
vencimento a partir de hoje. O badge `VENCIDO` que o modelo antigo mostrava para data passada
some para esses atletas — deliberado: o modelo antigo dizia "a data passou", não "há N dívidas"
(pre-mortem, achado 1).

As colunas `tipo_plano_atleta` e `data_vencimento_plano` **ficam no banco** nesta change: a
entidade e os DTOs deixam de mapeá-las (JPA ignora coluna não mapeada; ambas são nullable). O
`DROP` vai como `V97` na change `add-aviso-mensalidade`, depois de uma janela em produção sem
leitores legados e com rollback do binário ainda possível (pre-mortem, achado 2). Rollback desta
change: reverter o binário; as colunas antigas continuam lá com o dado original.

### D8. Front: seção Cobrança gated por role

`CoachAthleteProfilePage` lê `roles` de `useUserInfo`; só com `PROPRIETARIO` monta
`<CobrancaAtletaSection>` (novo, em `features/coach/components/`), que faz a chamada ao
endpoint. Formulário do contrato reusa o padrão de dialog do projeto; a lista de mensalidades é
uma tabela simples com ações inline. `billingPlanAdapters.ts` vira `cobrancaAdapters.ts` lendo
os nomes novos.

## Risks / Trade-offs

- **Renomear `statusVencimentoPlano` → `statusCobranca`** quebra o front até o PR dele mergear.
  Aceito: ordem backend → front, ambos na mesma janela. Alternativa seria manter o nome velho, e
  o glossário diz para evitar "plano".
- **Sem `DROP` aqui.** Colunas legadas ficam órfãs por uma change; custo zero, rollback trivial.
- **Backfill não recria dívida passada.** Atleta com data legada no passado perde o badge
  `VENCIDO` até a primeira mensalidade nova vencer. Aceito e registrado no proposal.
- **Lock pessimista no contrato** serializa geração e mutações; volume é por atleta, sem
  contenção real.
- **Scheduler diário tem até 24h de atraso** para gerar a próxima mensalidade depois do
  vencimento. O status nesse intervalo é `VENCIDO` (mensalidade anterior em aberto) ou `EM_DIA`
  (paga), ambos corretos.
- **Sem descancelar.** Ver D6.

## Migration Plan

1. Backend: V96 (expand + backfill de contrato) + entidades + serviço + scheduler + endpoints +
   DTOs renomeados (tests verdes). PR backend → develop.
2. Front: seção Cobrança, dialog sem campos, roster com nomes novos. PR front → develop.
3. Change 2 (`add-aviso-mensalidade`): `V97` DROP das colunas legadas, após janela de observação.

## Pre-mortem (2026-09-21, Codex adversarial review)

Cinco achados, todos incorporados: backfill não infere dívida (D3/D7); DROP separado (D7);
scheduler por tenant com `TenantContext` (D3); lock + `@Version` para corrida (D3); teto de 24
com `WARN` e continuação (D3).

## Open Questions

- Descancelar mensalidade: fica sem. Se aparecer em uso real, é uma transição a mais.
- Valor obrigatório no formulário (recomendado) — decidir na implementação do front.
