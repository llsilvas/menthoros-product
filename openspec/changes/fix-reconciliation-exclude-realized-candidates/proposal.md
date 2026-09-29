# Proposal: fix-reconciliation-exclude-realized-candidates

**Tamanho:** S · **Trilha:** Fast (só backend; é um filtro no seletor de candidatos da reconciliação
automática, sem migration, sem contrato de API e sem mudança de pesos ou limiares do score)

## Status

- Proposta inicial (2026-09-29), a partir da investigação dos logs de um treino do Leandro que não
  vinculou ao plano.

## Why

A reconciliação automática considera como candidato um treino planejado que **já foi realizado e
vinculado a outra atividade**. Quando o atleta treina em dias seguidos com volumes parecidos, o treino
de ontem disputa com o de hoje, o motor vê dois scores próximos e declara empate (`TIE_BREAK`). A
atividade fica `AMBIGUO`, o planejado do dia continua `PENDENTE` e o coach precisa resolver na mão
um vínculo que era óbvio.

Caso real, 2026-09-29 (homelab, tenant `1b5ce37e`, atleta Leandro Silva `d83c4c31`):

| | Treino | Data | Tipo | Distância | Duração |
|---|---|---|---|---|---|
| Realizado | `66b660a2` (intervals.icu `i191473718`) | 29/09 | CONTINUO | 6,07 km | 40 min |
| Candidato 1 | `afdc6eaa`, `PENDENTE` | 29/09 | REGENERATIVO | 6,1 km | 50 min |
| Candidato 2 | `cc589087`, **já `REALIZADO`**, vinculado a `a6a276b5` | 28/09 | CONTINUO | 5,0 km | 40 min |

Scores (`MatchingScoreCalculatorImpl`: data 0,45 · duração 0,35 · distância 0,20):

- Candidato 1: 1,0 × 0,45 + 0,7 × 0,35 + 1,0 × 0,20 = **0,90**
- Candidato 2: 0,9 × 0,45 + 1,0 × 0,35 + 0,5 × 0,20 = **0,86**

A diferença de 0,04 fica abaixo do `TIE_BREAK_THRESHOLD` (0,10), e o resultado foi
`AMBIGUO / TIE_BREAK`, com score 0,90. O candidato certo ganhou, mas o vínculo foi bloqueado por um
candidato que nunca deveria ter concorrido.

Causa no código: `CandidateSelector.buscarCandidatos` usa
`TreinoPlanejadoRepository.findByAtletaIdAndDataBetween` (janela D-1..D+1) e filtra só por
compatibilidade de tipo e por tenant. Não olha se o planejado já está ocupado.

## What Changes

- **`CandidateSelector`**: descarta o planejado que **já tem outro treino realizado vinculado**
  (`tb_treino_realizado.treino_planejado_id` apontando para ele, com `id` diferente do realizado em
  análise).
- A query compartilhada `findByAtletaIdAndDataBetween` **não muda**. Ela é usada por aderência,
  fila de atenção, progresso, treino de hoje e check-in, e todos esses precisam dos planejados
  realizados. O filtro fica no seletor, que é específico da reconciliação automática, ou numa query
  nova e dedicada. A escolha fica para a implementação, com uma restrição: a verificação de vínculo
  não pode gerar N+1 por candidato.

O critério é **vínculo existente**, e não `status_treino`. O status é um efeito colateral do vínculo
(`ReconciliationDecisionExecutor.persistir`) e pode divergir dele: um desvínculo manual que não
devolva o status para `PENDENTE`, ou um `REALIZADO` marcado à mão sem atividade. O vínculo é a
verdade sobre "este planejado já tem dono".

## Impact

- `services/helper/CandidateSelector.java`. Se precisar de query dedicada, também
  `repository/TreinoRealizadoRepository.java` ou `TreinoPlanejadoRepository.java`.
- Os dois callers se beneficiam sem mudar: `IntervalsIcuActivityPersister` (import inline) e
  `DailyActivitySyncSchedulerImpl` (batch do Strava).
- **Migration:** nenhuma. **Contrato de API:** nenhum. **Front:** nenhum.

## Critérios de aceite

- **CA1: planejado já vinculado não concorre (caso real)**
  - **Given** o realizado de 29/09 (CONTINUO, 6,07 km, 40 min), o planejado de 29/09 (REGENERATIVO,
    6,1 km, 50 min, sem vínculo) e o planejado de 28/09 (CONTINUO, 5 km, 40 min) já vinculado a
    outro realizado
  - **When** a reconciliação automática roda para o realizado de 29/09
  - **Then** o único candidato é o planejado de 29/09, o status fica `VINCULADO_AUTOMATICO` com
    score 0,90 e motivo `AUTO_MATCH`, e o planejado de 29/09 passa a `REALIZADO`

- **CA2: planejado sem vínculo continua candidato**
  - **Given** dois planejados na janela, nenhum vinculado, com scores a menos de 0,10 um do outro
  - **When** a reconciliação roda
  - **Then** o resultado continua `AMBIGUO / TIE_BREAK`. O desempate legítimo não muda.

- **CA3: reprocessamento do mesmo realizado não se autoexclui**
  - **Given** um planejado vinculado ao **próprio** realizado em análise
  - **When** o seletor busca candidatos para esse realizado
  - **Then** esse planejado continua candidato. A exclusão vale só para vínculo com **outro**
    realizado.

- **CA4: todos os candidatos ocupados**
  - **Given** o único planejado da janela já vinculado a outro realizado
  - **When** a reconciliação roda
  - **Then** o resultado é `NAO_PLANEJADO / NO_CANDIDATES`, igual a quando não há planejado na
    janela

## Métrica de sucesso

- Queda de `reconciliation_reason_code = 'TIE_BREAK'` em que o segundo candidato já estava vinculado.
  Hoje é possível medir no banco, cruzando `tb_treino_reconciliacao` com a data dos planejados
  vinculados na janela.
- O caso de 29/09, reprocessado depois do deploy, vincula sozinho.

## Open Questions & Assumptions

1. **Um planejado, uma atividade.** A premissa é que o vínculo é 1:1: se o atleta dividir o treino
   em duas atividades (pausa no relógio), a segunda não vincula ao mesmo planejado e cai em
   `NAO_PLANEJADO`. Esse já é o comportamento esperado do modelo (`treino_planejado_id` no
   realizado, um planejado com um realizado). A change só deixa isso explícito no seletor.
2. **Revisão manual mostra o mesmo candidato ocupado.** `ReconciliacaoPendentesServiceImpl` monta
   a lista de candidatos para o coach com a mesma janela, sem filtro. O coach verá o treino de
   segunda ao revisar o de hoje. **Fora do escopo desta change**, já que ali o coach decide e pode
   ter motivo para reatribuir. Fica registrado como follow-up: decidir se o candidato ocupado deve
   ser escondido ou só sinalizado ("já vinculado a …").
3. **Treino de 29/09 já `AMBIGUO`.** A correção não reprocessa atividades antigas. O caso real se
   resolve pela revisão manual do coach, ou por reprocessamento se o fluxo existente permitir.
   Nenhum backfill está previsto.

## Riscos e mitigações

- **N+1 na verificação de vínculo** (BAIXO): checar candidato por candidato multiplica queries no
  batch. Mitigação: uma única consulta pelos ids da janela (`treinoPlanejado.id in :ids and id <>
  :realizadoId`), ou uma query dedicada com `not exists`.
- **Mudar a query compartilhada por engano** (MÉDIO): alteraria aderência, fila de atenção e
  progresso. Mitigação: a restrição está explícita em "What Changes", e há teste do seletor em vez
  de mudança no repositório compartilhado.

## Non-goals

- Mudar pesos, limiares (`AUTO_MATCH_THRESHOLD`, `TIE_BREAK_THRESHOLD`) ou a janela de ±1 dia.
- Filtrar candidatos na lista de revisão manual (Open Question 2).
- Reprocessar ou fazer backfill de atividades já marcadas `AMBIGUO`.
- Reduzir o reprocessamento a cada 2h de atividades órfãs no `DailyActivitySyncScheduler` (visto no
  mesmo log, atleta Carla Oliveira, `NO_CANDIDATES`). Não tem relação com esta causa.

## Referências

- `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/helper/CandidateSelector.java`
- `services/helper/ReconciliationDecisionExecutor.java` (persistência do vínculo e status)
- `services/impl/MatchingDecisionEngineImpl.java` (limiares e `isTieBreaker`)
- `services/impl/MatchingScoreCalculatorImpl.java` (pesos)
- `repository/TreinoPlanejadoRepository.java:45-50` (query compartilhada, sem filtro de status)
- Testes existentes: `CandidateSelectorTest`, `ReconciliationDecisionExecutorTest`
- Log: `logs/menthoros-2026-09-29.0.log`, 08:58:46, `Marked activity 66b660a2... as ambiguous (score:
  0.90)`; auditoria `tb_treino_reconciliacao` id 37748
