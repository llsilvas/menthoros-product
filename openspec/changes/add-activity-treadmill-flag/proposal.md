# add-activity-treadmill-flag — marcar treino realizado feito na esteira

**Tamanho:** S · **Trilha:** Full (schema de banco + contrato de API; gates leves pelo tamanho)
**Status:** proposta
**Criado:** 2026-11-09
**Repos afetados:** `apps/menthoros-backend`

> Primeira das changes dos cards de esteira (artboard "Compartilhar treino — cards sociais", seção
> "Esteira (sem GPS)"). Sequência decidida pelo founder em 2026-11-09, depois do product review:
> esta → `athlete-share-cards-esteira` (card v2 I). A série de pace/FC e o card Curva
> (`add-activity-time-series` → `athlete-share-cards-curva`) só entram se o card Esteira for usado
> (gate em "Métrica de sucesso").

## Why

Corrida na esteira não tem trajeto GPS e perde os cards Rota e Foto. O card Esteira (selo, km, pace,
FC, TSS) só precisa saber que o treino foi na esteira. O `.fit` traz isso em
`SessionMesg.subSport = TREADMILL`, e o intervals.icu em `type = "Treadmill"`, mas o backend lê os dois
só como filtro de modalidade e descarta (`FitParseServiceImpl.java:173` lê `sport`, não `subSport`;
`IntervalsIcuActivityMapper.java:54`).

Valor para o treinador: indireto, a hipótese de aquisição da trilha (assinatura da assessoria no
card). O founder confirma que vários atletas do pilot treinam na esteira com frequência.

## Escopo

1. Coluna `esteira BOOLEAN NOT NULL DEFAULT false` em `tb_treino_realizado` (design D1).
2. `true` **só com evidência positiva** (pre-mortem Codex, product review):
   - `.fit` (ingestão Garmin e upload manual): `SessionMesg.subSport == TREADMILL`;
   - intervals.icu: `type == "Treadmill"`;
   - todo o resto: `false`. `INDOOR_RUNNING` (a Garmin separa pista coberta de esteira) e
     `VirtualRun` ficam de fora.
3. Contrato: `GET /me/treinos` ganha `esteira: boolean`.
4. Sem backfill nem reprocessamento: o `.fit` não é retido (`add-activity-gps-trace`, D5).

## Fora do escopo

- O card (front) — `athlete-share-cards-esteira`.
- Série de pace/FC — `add-activity-time-series`.
- Strava: `RUN_SPORT_TYPES` não importa esteira hoje (`StravaActivityServiceImpl.java:65`).
- Usar o flag em TSS, zonas, limiar, projeção ou qualquer tela do coach.

## Critérios de aceite

**CA1 — `.fit` de esteira**
> **Dado** um `.fit` com `SessionMesg.subSport = TREADMILL`
> **Quando** ele é ingerido (Garmin ou upload)
> **Então** `TreinoRealizado.esteira = true`.

**CA2 — Sem evidência, não é esteira**
> **Dado** um `.fit` com `subSport` `INDOOR_RUNNING`, `GENERIC`, `STREET`, `TRAIL`, `TRACK` ou nulo
> **Quando** ele é ingerido
> **Então** `esteira = false`.

**CA3 — intervals.icu**
> **Dado** uma atividade com `type = "Treadmill"`
> **Quando** ela é importada
> **Então** `esteira = true`; com `Run`, `TrailRun` ou `VirtualRun`, `false`.

**CA4 — Contrato**
> **Dado** um treino realizado com `esteira = true`
> **Quando** o atleta chama `GET /me/treinos`
> **Então** o item traz `esteira: true`; treinos anteriores ao deploy trazem `false`.

## Métrica de sucesso

- Sanidade do flag: % de treinos `esteira = true` por semana bate, ±5 p.p., com a contagem de
  `TREADMILL_RUNNING` nos pings Garmin do mesmo período.
- **Gate da série/Curva** (medido em `athlete-share-cards-esteira`): 4 semanas depois do card
  Esteira em produção, pelo menos 30% dos atletas do pilot com ≥ 1 treino `esteira = true` geraram
  ao menos um card Esteira. Abaixo disso, `add-activity-time-series` e `athlete-share-cards-curva`
  não entram.

## Open Questions & Assumptions

- **Premissa a validar (task 1.1):** relógios Garmin do pilot gravam `subSport = TREADMILL` em
  corrida de esteira. Validar com 1 `.fit` real; sem ele, a premissa fica registrada.
- **Premissa:** o intervals.icu manda `"Treadmill"` para esteira registrada fora da Garmin.
- **Aberto:** se a sanidade do flag divergir muito do ping, olhar `activityType` do ping como fonte
  extra. Fora desta change até haver dado.

## Rollback

A coluna tem default e é ignorada pela versão anterior. Remover exige `DROP` e passa pelo gate de
confirmação.

## Riscos e mitigações

- **Selo errado em pista coberta ou corrida virtual.** Só `TREADMILL`/`Treadmill` liga o flag (CA2).
- **Flag sempre falso por premissa errada.** Métrica de sanidade contra o ping detecta em 1 semana.
