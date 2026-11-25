**Tamanho:** M · **Trilha:** Full

> **Ticket 10** do épico `add-season-plan-macrocycle`, separado por D4 (o PRD põe o replanejamento em
> "experimentar depois"). Proposal, design (Decisão 11) e decisões vivem no épico.

## Status

- ready-for-human (2026-11-15): bloqueado por `add-season-plan-load-enforcement` (ticket 9) rodando um
  ciclo no piloto, e pelo grilling do limite de desvio (abaixo).

## Why

Quando a realidade diverge da temporada de forma persistente, o treinador recebe uma proposta de
replanejamento — em vez de a temporada ficar desatualizada ou de o motor compensar sozinho.

## What Changes

Tasks do épico: **6.0–6.9, 7.6**.

- Valor novo em `TipoSugestao` para proposta de temporada
- `ReplanejamentoTriggerService`: desvio acumulado em janela (default 3 semanas), lesão, mudança de data
  ou meta da prova; avaliação no encerramento da semana
- Proposta como `SugestaoCoach`, alterando só semanas futuras; desfecho registrado
- `SeasonReplanProposalCard` no front

## Critérios de aceite

- **Dado** três semanas consecutivas abaixo do alvo acumulando desvio acima do limite, **quando** a semana
  é encerrada, **então** uma proposta é criada com as semanas futuras recalculadas e as passadas
  preservadas.
- **Dado** uma única semana abaixo do alvo dentro do limite, **quando** a semana é encerrada, **então**
  nenhuma proposta é criada.
- **Dado** mudança de data da prova-alvo, **quando** é salva, **então** uma proposta é criada.
- **Dado** uma proposta rejeitada, **então** o desfecho é registrado e a temporada não muda.

## Aberto antes de começar (grilling desta change)

- Limite de desvio acumulado: valor inicial, e se é medido por volume ou por aderência.
- Gatilho por prova-teste só depois de `add-running-field-tests`.

### Evidência para o grilling — banco do homelab (2026-11-25)

Consulta só de leitura e agregada (sem nome de atleta) sobre `tb_plano_semanal` (`CONCLUIDO` +
`APROVADO`), `tb_treino_planejado` e `tb_treino_realizado`: planejado × realizado por semana e acumulado
em janela de 3.

- **Amostra:** 30 semanas com treino realizado, de 2 atletas — um deles com 3 semanas, na prática um
  atleta só. **Nenhuma semana encerrada tem `season_week_id`** (o único preenchido é a semana corrente):
  o desvio contra o alvo da temporada, que é o que este ticket mede, ainda não existe nos dados. O valor
  do limite continua dependendo do ciclo no piloto com `season-plan.enforcement.enabled`.
- **Medir por volume (km), não por TSS.** Em 7 semanas de julho e agosto há km realizado com
  `tss_calculado = 0`; por TSS elas aparecem como −100% sem o atleta ter faltado.
- **Desvio nos dois sentidos.** De fevereiro a maio o realizado ficou de +56% a +361% acima do
  planejado. O critério de aceite só cobre "abaixo do alvo": decidir se o gatilho também dispara acima.
- **Janela de semanas consecutivas.** Há buracos entre semanas planejadas (ex.: 06/07 → 17/08); uma
  janela de "3 linhas" junta semanas separadas por um mês. A janela tem de ser por calendário.
- **Frequência indicativa (um atleta, contra planos semanais, não contra a temporada):** ±30% no
  acumulado de 3 semanas dispararia em cerca de metade das semanas; ±50% em cerca de um terço, quase
  tudo em fevereiro–maio. Sugere que o limite só é calibrável sobre o alvo da temporada.

## Bloqueado por

- `add-season-plan-load-enforcement` (ticket 9), mais um ciclo no piloto.

## Dependências e rollout

- Flag: `macrociclo.replanejamento.enabled=false`.
- Métrica de saúde: taxa de aceite das propostas ≥ 50%.
