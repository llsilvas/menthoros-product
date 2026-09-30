# Proposal: fix-reconciliation-audit-planned-id

**Tamanho:** XS · **Trilha:** Fast (só backend; preenche dois campos que já existem no evento de
auditoria, sem migration, sem contrato de API e sem leitor afetado)

## Status

- Proposta inicial (2026-09-29), achada ao validar `fix-reconciliation-exclude-realized-candidates`
  no homelab: a reconciliação automática vinculou o treino certo, mas a auditoria não disse a qual.

## Why

A auditoria da reconciliação automática não registra **qual planejado foi vinculado**.
`ReconciliationDecisionExecutor.persistir` monta o `TreinoReconciliacao` sem preencher
`afterPlannedIdUuid` nem `beforePlannedIdUuid`. Só chama `setBeforePlannedId(null)`, e esse é o
campo `Long` legado, marcado como DEPRECATED. O fluxo manual (`ManualReconciliationServiceImpl`)
preenche os dois.

Estado do homelab em 2026-09-29 (`tb_treino_reconciliacao`):

| Ação | Status final | Com UUID do planejado | Linhas |
|---|---|---|---|
| Automática | `VINCULADO_AUTOMATICO` | não | 15.574 |
| Automática | `AMBIGUO` | não | 8.822 |
| Automática | `NAO_PLANEJADO` | não | 7.665 |
| Manual | `VINCULADO_MANUAL` | **sim** | 12 |

O defeito é anterior à extração do executor (`f2cf9e8`, 2026-07-16): o
`DailyActivitySyncSchedulerImpl` original já gravava assim.

**Impacto hoje:** nenhum código lê essas colunas, nem no backend nem no front, então nada quebra. O
que se perde é o histórico. `tb_treino_realizado.treino_planejado_id` diz para onde a atividade aponta
**agora**, mas não para onde a reconciliação automática apontou **naquele momento**. Isso importa quando
o coach desfaz ou troca o vínculo depois: a trilha de auditoria não mostra de onde a atividade saiu.

## What Changes

Em `ReconciliationDecisionExecutor.persistir`:

- **`beforePlannedIdUuid`:** o planejado vinculado ao realizado **antes** desta reconciliação, ou nulo.
  Precisa ser capturado **antes** de o método mutar a associação, a partir de
  `realizado.getTreinoPlanejado()`. **Não** pode vir de `realizado.getTreinoPlanejadoId()`: esse campo
  é um espelho somente leitura da FK (`insertable = false, updatable = false`), só reflete o banco no
  momento do load e não acompanha o `setTreinoPlanejado` em memória.
- **`afterPlannedIdUuid`:** o planejado selecionado quando o status final é `VINCULADO_AUTOMATICO`.
  Nulo em `AMBIGUO` e `NAO_PLANEJADO`, porque nesses casos não há vínculo. O candidato do topo de um
  `AMBIGUO` não é um "depois", é uma sugestão.
- Os campos `Long` legados (`before_planned_id`, `after_planned_id`) continuam como estão.

## Impact

- `services/helper/ReconciliationDecisionExecutor.java` e `ReconciliationDecisionExecutorTest`.
- Os dois callers (`DailyActivitySyncSchedulerImpl`, `IntervalsIcuActivityPersister`) passam a gravar
  auditoria completa sem mudar.
- **Migration:** nenhuma; as colunas existem desde V19/V20. **Contrato de API:** nenhum.
  **Front:** nenhum.

## Critérios de aceite

- **CA1: vínculo automático registra o planejado**
  - **Given** um realizado sem vínculo e um candidato com score ≥ 0,80, sem empate
  - **When** a reconciliação decide `VINCULADO_AUTOMATICO`
  - **Then** o evento de auditoria traz `afterPlannedIdUuid` igual ao id do planejado vinculado e
    `beforePlannedIdUuid` nulo

- **CA2: sem vínculo, sem "depois"**
  - **Given** uma decisão `AMBIGUO` (incluindo a vinda da guarda de campos ausentes) ou `NAO_PLANEJADO`
  - **When** o evento é gravado
  - **Then** `afterPlannedIdUuid` é nulo

- **CA3: vínculo anterior é preservado**
  - **Given** um realizado que já estava vinculado ao planejado X quando a reconciliação roda
  - **When** a decisão é gravada
  - **Then** `beforePlannedIdUuid` é X, capturado antes de o executor mutar a associação

## Métrica de sucesso

- Depois do deploy, 100% dos eventos `RECONCILIACAO_AUTOMATICA` com `after_status =
  VINCULADO_AUTOMATICO` trazem `after_planned_id_uuid` preenchido:
  `select count(*) from tb_treino_reconciliacao where action_type = 'RECONCILIACAO_AUTOMATICA' and
  after_status = 'VINCULADO_AUTOMATICO' and after_planned_id_uuid is null and occurred_at > <deploy>`
  deve dar 0.

## Open Questions & Assumptions

1. **CA3 acontece na prática?** Os dois callers hoje só reconciliam realizados sem vínculo: o daily
   sync pega `statusSincronizacao = PENDENTE` e o import do intervals.icu reconcilia na criação. O
   `before` tende a ser sempre nulo. O critério existe para a auditoria ficar correta se um caller
   futuro reconciliar um realizado já vinculado, e o custo é uma linha.

## Riscos e mitigações

- **Ler o "antes" depois da mutação** (MÉDIO se ignorado): gravaria o planejado novo também como
  "antes". Mitigação: capturar no início de `persistir` e cobrir com o CA3.
- **Usar o espelho `treinoPlanejadoId`** (MÉDIO se ignorado): para um realizado recém-criado ele é
  nulo mesmo depois do vínculo em memória, e o CA1 passaria com um valor errado se o teste usasse
  ele. Mitigação: a regra está explícita em "What Changes", e o teste assere o id do planejado
  selecionado.

## Non-goals

- **Backfill** das 32 mil linhas antigas. O vínculo atual em `tb_treino_realizado` pode ter mudado
  desde cada evento, então preencher o histórico gravaria dado falso.
- **`beforeStatus` fixo em `PENDENTE`.** O executor grava sempre `PENDENTE`, mesmo quando reprocessa
  uma órfã já `NAO_PLANEJADO` (o daily sync faz isso a cada 2h). É o mesmo tipo de imprecisão de
  auditoria, mas muda outra coluna e merece decisão própria.
- **Volume da tabela.** Os números acima não batem com o tamanho da base (534 treinos realizados):
  parte vem de reprocessamento de órfãs a cada 2h e parte, provavelmente, de testes gravando no banco
  do homelab. Não investigado aqui.
- Remover os campos `Long` legados.

## Referências

- `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/helper/ReconciliationDecisionExecutor.java`
  (`persistir`, montagem do `auditEvent`)
- `services/impl/ManualReconciliationServiceImpl.java` (referência: preenche os dois UUIDs)
- `entity/TreinoReconciliacao.java` (campos `*PlannedIdUuid`), `entity/TreinoRealizado.java:166-167`
  (espelho somente leitura `treinoPlanejadoId`)
- Change de origem: `archive/2026-09/2026-09-29-fix-reconciliation-exclude-realized-candidates/`
