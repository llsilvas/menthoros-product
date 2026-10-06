# Design: add-athlete-best-efforts

Detalha as decisões de desenho. O "porquê" e o escopo estão em `proposal.md`.

## Contexto

Hoje não persistimos stream em lugar nenhum: intervals.icu → laps (`tb_etapa_realizada`), Strava →
splits, `.fit` → session+laps. Tudo granularidade de volta/intervalo. Melhor esforço em 400m/800m/
1mi/1.5k exige granularidade sub-volta, que só os streams dão.

## Contrato verificado (2026-09-17, activity i187587373, atleta i641775)

Confirmado contra a API real com Bearer OAuth. A resposta de
`GET /api/v1/activity/{id}/streams?types=time,distance` é uma **lista** (não um objeto), um item por
tipo de stream pedido:

```json
[
  { "type": "time",     "name": null, "data": [0, 1, 2, ..., 3040],           "data2": null, "valueType": "java.lang.Integer", "valueTypeIsArray": false, "anomalies": null, "custom": false, "allNull": false },
  { "type": "distance", "name": null, "data": [1.24, 2.77, ..., 8011.63],     "data2": null, "valueType": "java.lang.Float",   "valueTypeIsArray": false, "anomalies": null, "custom": false, "allNull": false }
]
```

| Item | Valor |
|---|---|
| Topo | `List` de streams — um objeto por `type` (`time`, `distance`) |
| Campos úteis | `type` + `data` (array numérico). O resto (`name`, `data2`, `valueType`, `anomalies`, `custom`, `allNull`) é metadata a ignorar |
| `time.data` | inteiros, **cumulativo em segundos**, de `0` até `elapsed_time` (não `moving_time`) |
| `distance.data` | floats, **cumulativo em metros**, monotônico, mesmo tamanho do `time` (arrays paralelos) |
| Amostragem | base 1 Hz, mas **variável**: em paradas o stream pula amostras e o `time` salta (gaps). Contínua: 3041 pontos/3040 s; intervalada: 3161 pontos/3254 s |
| Custo | ~38 KB JSON para uma corrida de 50 min (sem compressão) |

**Fixture golden (i187587373, 8011 m, elapsed 3040 s, pace médio 6:19/km):** o algoritmo two-pointer
devolveu `400m 2:21 (5:52/km)`, `800m 4:45 (5:56/km)`, `1.5k 9:00 (6:00/km)`, `1mi 9:39 (5:59/km)`,
`3k 18:18 (6:06/km)`, `5k 30:39 (6:07/km)`, sem `10k` — coerente com a média.

**Fixture golden (i172320214, intervalada, 8009 m, moving 3157 s vs elapsed 3254 s):** 400m 2:08
(5:20/km), 800m 4:25 (5:31/km), 1.5k 8:57 (5:58/km), 1mi 9:32 (5:55/km), 3k 18:22 (6:07/km), 5k
30:44 (6:08/km), sem 10k.

**`time` é elapsed com gaps, não moving.** Na intervalada (i172320214) o stream pulou 2 blocos de
parada (saltos de 34 s e 62 s = 96 s parado, batendo com os 97 s de moving vs elapsed). Ou seja:
tempo parado aparece como **gap no `time`** (delta > 1 s entre amostras), não como distância
congelada (só 3 s de freeze). Uma janela de melhor esforço que cruza um gap inclui a parada e infla
o resultado — ver D2 para a mitigação.

## D1 — Fonte: streams, computação local (decisão do founder)

`GET /api/v1/activity/{id}/streams?types=time,distance` devolve dois arrays paralelos por amostra
(cumulativos): tempo e distância. Contrato verificado contra a API real — ver seção acima.

A independência conquistada é da **computação**: o algoritmo e a tabela não conhecem a fonte. v1
ingere streams do intervals.icu (pipeline ativo); Strava e `.fit` reusam tudo, trocando só o
adapter de ingestão, em follow-up.

## D2 — Algoritmo de janela rolante (two-pointer sobre distância acumulada)

Para cada distância alvo `D` (metros), achar o menor `time[j] - time[i]` tal que
`distance[j] - distance[i] >= D`:

```
i = 0; melhor = infinito
para j de 0..n-1:
  enquanto distance[j] - distance[i] >= D:
    melhor = min(melhor, time[j] - time[i])
    i++
```

O(n) por distância, O(7n) no total. Distâncias alvo: 400, 800, 1500, 1609.34, 3000, 5000, 10000
metros (labels `400m`, `800m`, `1.5k`, `1mi`, `3k`, `5k`, `10k`).

Casos de borda:
- Activity mais curta que `D` → sem esforço para aquela distância.
- **Tempo parado (gap no `time`):** paradas viram saltos de `time` entre amostras (delta > 1 s).
  Uma janela `time[j]-time[i]` que cruza um gap inclui a parada. **Mitigação:** detectar gaps (delta
  > limiar, ex. 3 s) e subtrair a duração dos gaps dentro da janela — "moving time" por janela. Sem
  isso, o melhor esforço de 5k/10k pode sair inflado por uma parada no meio do treino.
- Amostras irregulares/GPS gap → o two-pointer sobre distância acumulada é robusto a isso por
  construção (não assume cadência fixa).

## D3 — Persistência: só o derivado, nunca o stream

O stream cru (1 amostra/s × dezenas de min × muitas activities) é grande e não é reutilizável por
esta feature. Persistimos só o resultado.

Migration `V<próxima livre>__create_tb_melhor_esforco.sql`:

```
tb_melhor_esforco
  id UUID PK
  atleta_id UUID NOT NULL            (FK tb_atleta)
  treino_realizado_id UUID NOT NULL  (FK tb_treino_realizado, ON DELETE CASCADE)
  distancia_label VARCHAR(16) NOT NULL   -- "400m".."10k"
  distancia_metros NUMERIC(8,2) NOT NULL
  tempo_segundos INT NOT NULL
  data_treino DATE NOT NULL
  UNIQUE (treino_realizado_id, distancia_label)
```

Uma linha por (treino, distância) com esforço. ~20 activities em 42 dias × ≤7 distâncias =
~140 linhas/atleta. Trivial. O `paceMinKm` é derivado no read (`tempo / (metros/1000)`), não
persistido. Sem soft-delete: a linha morre com o treino (cascade).

**Resolver o número exato da migration na implementação** — já houve colisão de versão antes
(`V91` ocupada por outra change). Conferir a última migration aplicada em
`apps/menthoros-backend/src/main/resources/db/migration/`.

A janela rolante é aplicada **na leitura** (`data_treino >= hoje - window_days`), então trocar a
janela não exige re-ingestão — só mudar o parâmetro.

## D4 — Ingestão: +1 chamada, fora de transação

No `IntervalsIcuActivityIngestionServiceImpl`, depois de `buscarAtividade(...)` e antes de
persistir, para atividades de corrida (`Run`/`TrailRun`/`VirtualRun`/`Treadmill`): buscar streams,
computar os 7 esforços e anexar ao treino como uma lista `melhoresEsforcos` que o persister grava
por cascade (mesmo padrão do attach de etapas em `intervals-icu-activity-laps`).

- A chamada de streams fica **fora de transação**, junto da chamada de activity — preserva a regra
  de nunca segurar conexão de banco durante IO externo.
- Falha na chamada de streams **não derruba o import**: o treino entra sem esforços (degradação) e
  o backfill (D5) recupera. Erro logado. Evita que rate-limit transitório vire perda permanente.
- Custo: +1 chamada por atividade de corrida. A cota é 100 req/usuário/dia; o scheduler ingere 1–2
  atividades novas/dia, então o steady-state é ~2–4 chamadas/dia. O backfill é o único pico, e é
  manual (D5).

## D5 — Backfill: passivo finito, ação do coach

Mesmo molde do backfill de laps (`intervals-icu-activity-laps` D9): `POST
/api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-best-efforts` (coach-in-the-loop).
Para cada `TreinoRealizado` de corrida com `fonteDados=INTERVALS_ICU` sem linha em
`tb_melhor_esforco`: buscar streams, computar, anexar, salvar. Idempotente. Só grava esforços, não
sobrescreve nada do treino. Corridas genuinamente sem streams são reconsultadas a cada run — aceito
(passivo pequeno e finito, como no laps).

## D6 — Não prometer paridade

Nosso número e o do intervals.icu podem divergir (moving vs elapsed, suavização de GPS, tratamento
de descida). Aceitamos. A tela não deve alegar "igual ao intervals.icu". Se o coach reportar
divergências grandes, reabrir como bug com evidência.

## D7 — Contrato do endpoint (simétrico ao `recordes`)

```
GET /api/v1/atletas/{id}/melhores-esforcos   (TECNICO/ADMIN, tenant-aware)
GET /api/v1/atletas/me/melhores-esforcos     (ATLETA, JWT)
```

Response: `[{ "distancia": "5k", "tempoSegundos": 1796, "paceMinKm": "5:59", "data": "2026-09-10" }]`,
ordenada por distância (ordem canônica). Agregação: `min(tempo_segundos)` por `distancia_label` em
`data_treino >= hoje - window_days`.

## D8 — Tenant e fonte por atleta

Atleta sem `IntegracaoExterna` INTERVALS_ICU ativa → `200 []`. Validação reusa
`validarAtletaNoTenant` do `AtletaProgressServiceImpl`.

## D9 — Front

Tabela (distância × tempo × pace/km) na nova aba "Esforços" da `AthleteProgressPage` (abas: Visão
Geral / Forma / Volume / Esforços / Provas) e no `CoachAthleteProfilePage` perto de "Seus PRs".
Hook `useAthleteMelhoresEsforcos` + adapter `melhoresEsforcosAdapter` (padrão
`useAthleteRecordes`/`recordsAdapter`).

## Riscos residuais

- **Contrato de streams diferente do presumido** (Médio): Bloco 0 resolve.
- **Divergência de número vs. intervals.icu** (Médio, aceito): D6.
- **Rate limit no backfill** (Baixo): backfill é manual e limitado pela cota; se o passivo for
  grande, paginar/limitar.
- **1.5k vs 1mi** (Baixo): bandas próximas, exibimos os dois sem deduplicar.

## Estratégia de teste

- **Algoritmo** (unitário, TDD): fixtures de streams cumulativos com resultado golden; activity
  mais curta que D; tempo parado; amostra irregular. CA6.
- **Client** (unitário): URI com `types=time,distance`; erro HTTP → degradação (não lança).
- **Persister** (unitário): cascade grava esforços; re-import não duplica (unique constraint).
- **Service/agregação** (unitário): janela de 42 dias filtra corretamente; min por distância;
  ordenação canônica; vazio.
- **Controller** (`*IT`, molde `AtletaProgressControllerTest`): `/me` resolve JWT; `/{id}` bloqueia
  cross-atleta/tenant.
- **Front** (unitário): adapter (tempo `HH:MM:SS`, pace `M:SS/km`); página (loading/erro/vazio).
- **Gate**: `./mvnw clean verify` (backend) e `npm run lint && npm run build` (front).
