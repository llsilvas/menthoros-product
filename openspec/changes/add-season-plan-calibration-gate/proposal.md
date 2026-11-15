**Tamanho:** S · **Trilha:** Fast

> **Ticket 4** do épico `add-season-plan-macrocycle`. Decisão Q9 do épico: atleta em calibração espera a
> graduação.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-generate-tracer` (ticket 2).

## Why

Atleta em calibração não tem CTL confiável; um `tssAlvo` sobre esse número repetiria o problema que o
regime de cold-start (ADR-0012) existe para evitar. A temporada só nasce quando o atleta gradua.

## What Changes

Tasks do épico: **2.6 (caso de calibração, substituído por recusa), 2.10 (teste de calibração), 7.7
(estado de calibração)**. Substitui "marcar como estimado em calibração".

- O status de calibração já é exposto pelo onboarding: responde 204 quando o atleta não está em
  calibração, e os estágios são OBSERVATION (semana 1), CALIBRATION (semana 2) e STABILIZATION
  (semanas 3–4). A geração usa a mesma fonte
- Geração recusada com 422 e o motivo enquanto houver estágio de calibração
- Na aba, "Gerar temporada" desabilitada com o motivo e a semana de calibração em que o atleta está

## Critérios de aceite

- **Dado** um atleta em calibração, **quando** o treinador gera, **então** recebe 422 com o motivo e
  nenhuma temporada é criada.
- **Dado** um atleta em calibração, **quando** o treinador abre a aba, **então** a ação "Gerar temporada"
  está desabilitada e o motivo é visível, com a semana de calibração.
- **Dado** um atleta que graduou, **quando** o treinador abre a aba, **então** a ação está habilitada.

## Métrica de sucesso

Zero temporadas geradas para atleta em calibração.

## Open Questions & Assumptions

- O texto do motivo fica a cargo do ticket; não há decisão de produto pendente.

## Bloqueado por

- `add-season-plan-generate-tracer` (ticket 2).
