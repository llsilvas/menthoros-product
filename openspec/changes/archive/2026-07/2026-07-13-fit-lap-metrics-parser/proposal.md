# Proposal: fit-lap-metrics-parser

**Tamanho:** S · **Trilha:** Fast

## Status

Proposed (2026-07-12). Primeira de uma sequência de três changes derivadas da análise do gap
entre o CSV exportado pelo Garmin Connect e o que o pipeline de import .fit persiste hoje:

1. **`fit-lap-metrics-parser` (esta)** — campos que o SDK expõe e já têm coluna no banco.
2. `fit-running-dynamics-ingestion` — running dynamics + contexto (exige migration).
3. `fit-lap-derived-metrics` — métricas derivadas por lap (curva de EF, Pw:HR, GAP interno).

## Why

O parser .fit (`FitParseServiceImpl`) extrai hoje apenas 4 campos por lap (duração, distância,
FC média/máx) e 8 por sessão — mas o SDK da Garmin (`com.garmin.fit`) expõe elevação, potência e
cadência nas mesmas mensagens `LapMesg`/`SessionMesg`, e as colunas de destino **já existem** em
`tb_etapa_realizada` (`elevacao_ganho_metros`, `elevacao_perda_metros`, `potencia_media`,
`cadencia_media`) e em `tb_treino_realizado` (herdadas de `TreinoBase` + próprias). Os splits do
Strava já populam esses campos; o import .fit os deixa nulos, criando assimetria entre fontes.

Sem esses dados: o coach não vê terreno nem potência das voltas de treinos importados de .fit,
o gate de CV do `DecouplingCalculatorService` reprova treinos ondulados sem que haja como
compensar por gradiente, e o decoupling Pw:HR (change 3) fica sem insumo.

## What Changes

### Backend (`apps/menthoros-backend`)

- `FitLapData`: + `subidaMetros`, `descidaMetros`, `potenciaMediaWatts`, `cadenciaMediaPpm`.
- `FitSessionData`: + os mesmos 4 campos no nível de sessão.
- `FitParseServiceImpl`: ler nos listeners de `LapMesg` e `SessionMesg`:
  - `getTotalAscent()` / `getTotalDescent()` (metros, `Integer`);
  - `getAvgPower()` (watts, `Integer`);
  - `getAvgRunningCadence()` — **atenção à unidade**: a FIT grava passos de UMA perna/min;
    multiplicar por 2 (e somar `getAvgFractionalCadence()` quando presente) para chegar em ppm.
- `FitTreinoPersister.montarTreino()`: mapear os novos campos para `EtapaRealizada` (por lap)
  e `TreinoRealizado` (sessão). Campo ausente no arquivo → coluna permanece `null` (mesma regra
  de "não fabricar valor" das demais métricas — CA5 de `fit-file-upload-ingestion`).
- Sanitização de cadência: reusar o mesmo teto/critério de `StravaActivityServiceImpl.sanitizeCadence`
  para manter simetria entre fontes.

### Fora de escopo

- Running dynamics (GCT, oscilação vertical, passada), temperatura, calorias, tempo em movimento —
  exigem migration (change `fit-running-dynamics-ingestion`).
- Qualquer métrica derivada (GAP, EF, Pw:HR) — change `fit-lap-derived-metrics`.
- Backfill de treinos .fit já importados.
- Mudança no frontend (os campos já existem em `EtapaRealizadaOutputDto`/DTOs de treino ou são
  aditivos; nenhuma tela nova).

## Critérios de aceite

- **CA1 — Lap completo:** .fit com elevação/potência/cadência por lap → `EtapaRealizada` persiste
  `elevacaoGanhoMetros`, `elevacaoPerdaMetros`, `potenciaMedia` e `cadenciaMedia` (ppm, duas pernas).
- **CA2 — Sessão:** os agregados da `SessionMesg` populam os campos equivalentes do `TreinoRealizado`.
- **CA3 — Cadência convertida:** `avgRunningCadence=82` (uma perna) + fracional persiste ~164-165 ppm,
  consistente com o que o dispositivo mostra.
- **CA4 — Dados parciais:** .fit sem power meter / sem barômetro → campos correspondentes `null`,
  import não falha e demais campos persistem.
- **CA5 — Simetria com Strava:** para um mesmo treino, os campos por etapa preenchidos via .fit têm
  a mesma semântica/unidade dos preenchidos via split do Strava.
- **CA6 — Sem regressão:** `./mvnw clean test` verde.

## Métrica de sucesso

Treinos importados de .fit passam a exibir terreno e potência por volta no drilldown do atleta sem
nenhuma ação extra do coach — % de etapas de imports .fit com `elevacao`/`cadencia` não-nulos sobe
de 0% para a taxa real dos dispositivos (esperado >90% em relógios Garmin recentes).

## Open Questions & Assumptions

- **Assumido:** `LapMesg.getAvgPower()` retorna potência de corrida (running power) quando o
  dispositivo a calcula nativamente (Fenix/Forerunner recentes) — validar com .fit real na Task 1.
- **Assumido:** o teto de sanitização de cadência do Strava (`sanitizeCadence`) serve para .fit sem ajuste.
- **Aberto:** persistir `getMaxPower()`/`getMaxRunningCadence()`? Não há coluna — fica para a
  change 2 decidir se entra na migration.
