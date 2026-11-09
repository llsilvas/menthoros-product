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
5. O flag pertence ao **registro da fonte** (design D4). Reenvio do mesmo `.fit` não reescreve o flag.

## Fora do escopo

- O card (front) — `athlete-share-cards-esteira`.
- Série de pace/FC — `add-activity-time-series`.
- Strava: `RUN_SPORT_TYPES` não importa esteira hoje (`StravaActivityServiceImpl.java:65`).
- Usar o flag em TSS, zonas, limiar, projeção ou qualquer tela do coach.
- Consolidar o mesmo treino vindo de duas fontes (Garmin e intervals.icu). Hoje elas já geram dois
  registros com `externalId` diferentes; os flags de cada um seguem a sua fonte (D4).

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

**CA5 — Reenvio**
> **Dado** um treino de esteira já gravado pelo ping Garmin
> **Quando** o mesmo `.fit` é reenviado (upload manual ou ping repetido)
> **Então** o registro existente segue com `esteira = true`, sem duplicar.

**CA6 — Evidência real antes do PR**
> **Dado** a implementação pronta
> **Quando** o PR for aberto
> **Então** `tasks.md` registra o `subSport` observado em 1 `.fit` real de esteira do pilot e o `type`
> observado em 1 payload real do intervals.icu de corrida na esteira. Fonte sem evidência real fica
> marcada como não validada no PR e na métrica.

## Métrica de sucesso

- Sanidade do flag, **só registros de fonte Garmin**: % de treinos `fonte_dados = GARMIN` com
  `esteira = true` por semana bate, ±5 p.p., com a fração de pings `TREADMILL_RUNNING` no mesmo
  período. Medição manual pelo dev, por SQL, 1 semana depois do deploy; resultado no `tasks.md`.
- **Gate da série/Curva** (medido em `athlete-share-cards-esteira`): 4 semanas depois do card
  Esteira em produção, pelo menos 30% dos atletas do pilot com ≥ 1 treino `esteira = true` geraram
  ao menos um card Esteira. Abaixo disso, `add-activity-time-series` e `athlete-share-cards-curva`
  não entram.

## Open Questions & Assumptions

- **Premissa a validar antes do PR (CA6):** relógios Garmin do pilot gravam `subSport = TREADMILL`
  em corrida de esteira. Sem `.fit` retido nem backfill, premissa errada perde dados até ser notada.
- **Premissa a validar antes do PR (CA6):** o intervals.icu manda `"Treadmill"` para corrida na
  esteira. Não validada → fonte marcada como não validada; a métrica olha só Garmin.
- **Aberto:** se a sanidade do flag divergir muito do ping, olhar `activityType` do ping como fonte
  extra. Fora desta change até haver dado.

## Rollback

A coluna tem default e é ignorada pela versão anterior. Remover exige `DROP` e passa pelo gate de
confirmação.

## Riscos e mitigações

- **Selo errado em pista coberta ou corrida virtual.** Só `TREADMILL`/`Treadmill` liga o flag (CA2).
- **Flag sempre falso por premissa errada.** Evidência real obrigatória antes do PR (CA6); a métrica
  de sanidade contra o ping detecta em 1 semana o que escapar.
- **Mesmo treino com flags divergentes em duas fontes.** Limitação aceita (D4): a duplicação entre
  fontes é anterior a esta change; a métrica conta só Garmin.
