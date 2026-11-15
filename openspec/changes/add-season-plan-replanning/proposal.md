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

## Bloqueado por

- `add-season-plan-load-enforcement` (ticket 9), mais um ciclo no piloto.

## Dependências e rollout

- Flag: `macrociclo.replanejamento.enabled=false`.
- Métrica de saúde: taxa de aceite das propostas ≥ 50%.
