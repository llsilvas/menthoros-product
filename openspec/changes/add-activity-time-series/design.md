# Design — add-activity-time-series

## D1 — Fonte: os records que o parser já guarda

O `RecordMesgListener` já acumula `FitAmostraFc` em memória até `MAX_AMOSTRAS` (200.000), para o
tempo em zonas. A série reaproveita o mesmo laço e o mesmo teto: cada amostra passa a carregar também
a distância acumulada do record (`getDistance()`). Nada de segunda passada no arquivo, nada de coletor
em streaming.

A série é calculada **depois** do parse, quando `SessionMesg` (início, tempo decorrido, distância) já
foi lida. Por isso os baldes podem ser fixos (D3).

## D2 — Formato: JSONB com arrays paralelos

```json
{ "v": 1, "n": 286, "baldeSeg": 10, "duracaoSeg": 2862,
  "tSeg":  [0, 10, 20, ...],
  "velMs": [2.91, 3.02, null, ...],
  "fc":    [118, 124, null, ...] }
```

- `tSeg`: início do balde, em segundos desde `SessionMesg.startTime` (não desde o primeiro record).
  Record antes do início da sessão é descartado.
- `duracaoSeg`: tempo decorrido da sessão (`totalElapsedTime`). O front desenha o eixo até aqui, mesmo
  que os últimos baldes sejam `null`.
- `velMs`: velocidade do balde (D3), em m/s com 2 casas, já calibrada (D5); `null` sem cobertura (D4).
- `fc`: média da FC ponderada pelo tempo, em bpm inteiro; `null` sem cobertura.

Mesmo estilo de `gps_trace` (arrays paralelos, `v` de versão). Tamanho: 300 × ~14 bytes ≈ 4–5 KB.

## D3 — Baldes fixos; velocidade por distância

`baldeSeg = max(1, ceil(duracaoSeg / 300))`, arredondado para cima em {1, 2, 5, 10, 15, 20, 30, 60,
…} para o eixo ficar legível. No máximo 300 baldes.

Cada intervalo entre dois records consecutivos `(t_i, d_i) → (t_{i+1}, d_{i+1})` com
`0 < Δt ≤ 10 s` é **coberto**: seu tempo e sua distância `Δd` são repartidos entre os baldes que ele
atravessa, proporcionalmente ao tempo. Intervalo com `Δt > 10 s` é lacuna (pausa ou falha de
gravação) e não cobre nada.

Velocidade do balde = `Σ Δd coberto ÷ Σ Δt coberto`. É integração no tempo, não média de amostras: o
exemplo do pre-mortem (1 s a 1 m/s + 15 s a 3 m/s) dá 46 m ÷ 16 s = 2,875 m/s, e a soma dos baldes
devolve a distância dos records. `Δd` negativo (distância voltando) conta como zero.

FC do balde = média da FC dos intervalos cobertos, ponderada por `Δt`.

## D4 — Pausas: cobertura mínima

Balde com tempo coberto abaixo de 50% de `baldeSeg` vira `null` em `velMs` e `fc`. Não há fusão de
baldes depois de calculados, então uma pausa nunca se mistura com corrida. Uma parada curta dentro
de um balde coberto aparece como velocidade mais baixa naquele balde, e o front corta abaixo de
0,5 m/s (`athlete-share-cards-curva`, CA3).

## D5 — Calibração pela distância da sessão

Na esteira, o relógio estima a distância pelo pulso ou foot pod. O atleta pode corrigir a distância ao
salvar; a Garmin grava a correção em `SessionMesg.totalDistance` e nas voltas, não nos records
(premissa a validar, task 1.4).

`k = sessão.totalDistance ÷ (d_último − d_primeiro dos records)`, aplicado a toda `velMs`, quando os
dois existem, são finitos e positivos e `0,5 ≤ k ≤ 1,5`. Fora disso não calibra e registra `warn`.
Vale também para outdoor, onde `k ≈ 1`. Uma regra só, sem `if esteira`.

## D6 — Duplicação com `gps_trace` (dívida declarada)

`gps_trace` carrega `tSeg` e `fc` por ponto do trajeto. A série nova tem outra granularidade (tempo,
não espaço) e outra finalidade. Unificar mudaria `/trajeto` e o front do mapa, já em produção. Fica
como está.

## D7 — Contrato

- `GET /api/v1/atletas/me/realizados/{id}/serie` → `TimeSeriesOutputDto` (JSON de D2),
  `hasRole('ATLETA')`, consulta por projeção filtrada por `atletaId` e `tenantId` (mesmo padrão de
  `findGpsTrace`). `404` para treino de outro atleta, outro tenant ou sem série.
- `GET /me/treinos`: `temSerie: boolean` (`serieTemporal != null`) no mesmo mapper de `temTrajeto`.
- `@ApiResponse` com schema explícito; o cliente curado do front recebe à mão.

## D8 — Privacidade

FC e pace já são dado de saúde tratado pela Política (§ 2.1). Sem localização, a série não entra no
consentimento de trajeto. Mesma finalidade, resolução menor.

## Métricas (como medir)

```sql
select count(*) filter (where serie_temporal is not null)::float / count(*)
from tb_treino_realizado
where fonte_dados in (:fontes_fit) and created_at >= :deploy;

select percentile_cont(0.95) within group (order by pg_column_size(serie_temporal))
from tb_treino_realizado where serie_temporal is not null;
```

Nomes de `fonte_dados` e da coluna de criação a confirmar na task 3.1.
