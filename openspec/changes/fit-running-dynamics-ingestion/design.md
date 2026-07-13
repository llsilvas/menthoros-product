# Design: fit-running-dynamics-ingestion

## D1 — Colunas e tipos (migration V53)

Padrão de `db/migration` (tabelas `tb_`, snake_case, constraints nomeadas). Todas nullable —
running dynamics é dado opcional por natureza (depende de sensor).

```sql
-- =====================================================================
-- V53: Running dynamics + contexto por etapa e sessão (import .fit)
-- =====================================================================

ALTER TABLE tb_etapa_realizada
    ADD COLUMN IF NOT EXISTS gct_medio_ms          INTEGER,
    ADD COLUMN IF NOT EXISTS gct_equilibrio_pct    NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS passada_media_m       NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS oscilacao_vertical_cm NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS proporcao_vertical_pct NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS temperatura_media_c   NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS tempo_movimento       INTERVAL;

ALTER TABLE tb_treino_realizado
    ADD COLUMN IF NOT EXISTS gct_medio_ms          INTEGER,
    ADD COLUMN IF NOT EXISTS gct_equilibrio_pct    NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS passada_media_m       NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS oscilacao_vertical_cm NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS proporcao_vertical_pct NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS temperatura_media_c   NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS tempo_movimento       INTERVAL,
    ADD COLUMN IF NOT EXISTS calorias              INTEGER;
```

Sem índices novos: nenhum lookup filtra por essas colunas; são payload de leitura do drilldown.

## D2 — Mapa SDK → coluna (unidades)

| SDK (`LapMesg`/`SessionMesg`) | Tipo SDK | Unidade FIT | Coluna | Conversão |
|---|---|---|---|---|
| `getAvgStanceTime()` | Float | ms | `gct_medio_ms` | round → Integer |
| `getAvgStanceTimeBalance()` | Float | % (pé esquerdo) | `gct_equilibrio_pct` | 1 casa |
| `getAvgStepLength()` | Float | **mm** | `passada_media_m` | ÷1000, 2 casas |
| `getAvgVerticalOscillation()` | Float | **mm** | `oscilacao_vertical_cm` | ÷10, 1 casa |
| `getAvgVerticalRatio()` | Float | % | `proporcao_vertical_pct` | 1 casa |
| `getAvgTemperature()` | Byte | °C | `temperatura_media_c` | direto, 1 casa |
| `getTotalTimerTime()` | Float | s | `tempo_movimento` | `Duration.ofMillis(round(s*1000))` |
| `getTotalCalories()` (Session) | Integer | kcal | `calorias` | direto |

Regra transversal: getter `null` → coluna `null`; nunca 0 fabricado. Sanidade defensiva no
persister: descartar (→ null) valores fisiologicamente impossíveis (GCT fora de 100–500 ms,
equilíbrio fora de 30–70%, passada fora de 0,3–3,0 m) com `log.warn` — protege contra lixo de
firmware sem derrubar o import.

## D3 — Entidades e DTOs

- `EtapaRealizada` + `TreinoRealizado`: campos novos espelhando as colunas (`Integer`,
  `BigDecimal`, `Duration` com `@JdbcTypeCode(SqlTypes.INTERVAL_SECOND)` como o `duracao` atual).
- `FitLapData`/`FitSessionData`: campos novos como tipos-fonte (`Integer`/`Double`/`Duration`),
  conversão de escala acontece no persister (parser entrega o valor cru convertido de unidade,
  persister aplica arredondamento/BigDecimal — mesma divisão de responsabilidade do fix
  `velocidadeMedia`/`paceMedia`).
- `EtapaRealizadaOutputDto` e DTO do treino: campos aditivos com `@Schema(description, example)`;
  `NON_NULL` já é o padrão do record.

## D4 — Decisão: sem camada de análise nesta change

A tentação é já emitir alertas ("assimetria > X%"). Deliberadamente fora: thresholds de forma são
decisão de produto/treinamento que exige dado acumulado para calibrar. Esta change entrega o dado
bruto persistido e exposto; `fit-lap-derived-metrics` e/ou `add-workout-metrics-analyzer` consomem.

## D5 — Interação com Strava

Splits do Strava não trazem running dynamics — os campos ficam `null` para essa fonte, o que é
correto e já sinalizado pelo `NON_NULL` no DTO. Nenhuma mudança no `StravaActivityServiceImpl`.

## Pre-mortem (resumo)

- *"A migration quebra em produção"* → colunas nullable + `IF NOT EXISTS`, sem rewrite de tabela
  (ALTER ADD COLUMN nullable é metadata-only no PostgreSQL).
- *"Unidade errada passa despercebida"* → CA3 valida contra CSV real do Garmin Connect; testes
  fixam conversões mm→m e mm→cm.
- *"Dispositivo grava lixo"* → faixa de sanidade do D2 descarta outliers com warn.
- *"Ninguém consome o dado"* → métrica de sucesso monitora % preenchido; consumo no front é a
  change seguinte do funil — se não for priorizada em 2 sprints, revisar antes de expandir.
