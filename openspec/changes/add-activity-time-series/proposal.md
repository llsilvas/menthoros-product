# add-activity-time-series — série de pace/FC no treino realizado

**Tamanho:** M · **Trilha:** Full (schema de banco + contrato de API)
**Status:** proposta — **bloqueada pelo gate de adoção** de `athlete-share-cards-esteira`
**Criado:** 2026-11-09
**Repos afetados:** `apps/menthoros-backend`

> Fundação de dado do card Curva (artboard "Compartilhar treino — cards sociais", `v2 J · Curva de
> pace e FC`). Sequência: `add-activity-treadmill-flag` → `athlete-share-cards-esteira` → **gate** →
> esta → `athlete-share-cards-curva`. Só começa se o gate de `add-activity-treadmill-flag` ("Métrica
> de sucesso") passar.

## Why

O card Curva desenha pace e FC ao longo do treino. O parser já percorre cada `RecordMesg` com FC
(`FitAmostraFc`, usado só no tempo em zonas e descartado) e velocidade, mas só persiste série quando
há GPS (`gps_trace`, arrays paralelos ao trajeto). Na esteira, nada sobra. A série também serve à
corrida de rua: o card Curva não depende de esteira.

Valor para o treinador: indireto (hipótese de aquisição da trilha).

## Escopo

1. Coluna `serie_temporal JSONB NULL` em `tb_treino_realizado`: tempo, velocidade e FC agregados em
   **baldes fixos** de tempo, no máximo **300** (design D2, D3).
2. **Velocidade por distância**: a velocidade do balde é distância percorrida no balde ÷ tempo coberto,
   não média das amostras (pre-mortem Codex, D3). Conserva a distância com amostragem irregular.
3. **Pausas preservadas**: balde com cobertura abaixo de 50% vira `null` (D4).
4. **Calibração** pela distância da sessão (D5), para a curva bater com o pace do card.
5. **Âncora na sessão**: `tSeg` conta a partir de `SessionMesg.startTime`, e o payload traz a duração
   decorrida da sessão (D2).
6. Contrato: `GET /me/treinos` ganha `temSerie: boolean`; endpoint novo
   `GET /api/v1/atletas/me/realizados/{id}/serie`; `404` sem série ou fora do atleta/tenant.
7. Sem backfill nem reprocessamento.

## Fora do escopo

- O card (front) — `athlete-share-cards-curva`.
- Série do intervals.icu (`/activity/{id}/streams`) e do Strava.
- Unificar com `gps_trace` (D6).
- Usar a série em TSS, zonas, limiar, projeção ou telas do coach.

## Critérios de aceite

**CA1 — Série extraída e limitada**
> **Dado** um `.fit` de corrida, com ou sem GPS
> **Quando** ele é ingerido
> **Então** `serieTemporal` tem entre 2 e 300 pontos; `tSeg[0] = 0` corresponde a `startTime` da
> sessão; `tSeg` é estritamente crescente com passo `baldeSeg`; e `duracaoSeg` é o tempo decorrido da
> sessão.

**CA2 — Distância conservada**
> **Dado** um balde com 1 s a 1 m/s e 15 s a 3 m/s (amostragem irregular)
> **Quando** a série é gerada
> **Então** a velocidade do balde é 46 m ÷ 16 s = 2,875 m/s, e a soma de `velMs × baldeSeg` nos baldes
> não nulos fica a ±1% da distância dos records nesses baldes.

**CA3 — Pausa preservada**
> **Dado** uma pausa de 90 s no meio do treino, com baldes de 10 s
> **Quando** a série é gerada
> **Então** os baldes cobertos pela pausa têm `velMs = null` e `fc = null`; nenhum balde mistura a
> pausa com corrida a ponto de mostrar velocidade inventada.

**CA4 — Calibração**
> **Dado** um `.fit` em que a sessão diz 10,00 km e o último record diz 9,40 km
> **Quando** a série é gerada
> **Então** a distância implícita da série fica a ±1% de 10,00 km, e o pace médio derivado fica a
> ±2 s/km do pace da sessão (tempo em movimento). Com `k` fora de [0,5; 1,5], não calibra e registra
> `warn`.

**CA5 — Sem dado útil, sem série**
> **Dado** um `.fit` com menos de 2 records com timestamp, ou sem distância **e** sem FC em nenhum
> record
> **Quando** ele é ingerido
> **Então** `serieTemporal` é nulo e a ingestão termina normalmente.

**CA6 — Contrato e isolamento**
> **Dado** um treino realizado com série
> **Quando** o atleta chama `GET /me/realizados/{id}/serie`
> **Então** recebe o JSON de D2; para treino de **outro atleta do mesmo tenant** ou de **outro
> tenant**, 404 (teste de integração com banco real, não só `@WebMvcTest`); `GET /me/treinos` traz
> `temSerie: true`.

**CA7 — Tamanho**
> **Dado** um `.fit` de ultramaratona perto de `MAX_AMOSTRAS`
> **Quando** ele é ingerido
> **Então** `pg_column_size(serie_temporal)` ≤ 8 KB; acima de `MAX_AMOSTRAS` o comportamento atual
> (`amostrasExcedidas`) se mantém e a série fica nula.

## Métrica de sucesso

- 100% dos `.fit` ingeridos após o deploy têm `serie_temporal` não nula (query em `design.md`).
- P95 de `pg_column_size(serie_temporal)` ≤ 8 KB.
- Para o treinador: cards Curva gerados por semana (instrumentação de `athlete-share-cards-extra`).

## Open Questions & Assumptions

- **Q1 — Velocidade ou pace?** Resolvida: velocidade em m/s (D2); parada não vira infinito.
- **Premissa a validar (task 1.4):** a correção "calibrar e salvar" do relógio muda
  `SessionMesg.totalDistance` e não os records. Sem 1 `.fit` real de esteira corrigida, D5 fica
  premissa registrada.
- **Premissa:** `RecordMesg.getDistance()` existe na esteira (acelerômetro ou foot pod). Sem distância
  em nenhum record, a série sai só com FC.

## Rollback

Coluna nula ignorada pela versão anterior; endpoint novo deixa de existir. Remover a coluna exige
`DROP` e passa pelo gate de confirmação.

## Riscos e mitigações

- **Pace da curva diferente do card.** Velocidade por distância (D3) e calibração (D5); CA2 e CA4.
- **Pausa sumindo.** Baldes fixos calculados no fim, com cobertura (D4); sem fusão de baldes. CA3.
- **Memória.** Reaproveita o teto `MAX_AMOSTRAS` que o parser já usa para FC; os records ficam em
  memória só durante o parse, como hoje.
- **Pre-mortem Codex (2026-11-09), NOT READY sobre a versão anterior:** média por contagem não
  conservava distância, fusão de baldes apagava pausas, origem no primeiro record encurtava o treino,
  `INDOOR_RUNNING` não comprovava esteira. Os três primeiros estão em D3, D4 e D2; o quarto saiu
  com o flag para `add-activity-treadmill-flag`.
- **Product review (2026-11-09) → Refine:** baldes fixos em vez de dobra em streaming (D3), série
  depois do card Esteira com gate de adoção. Incorporado.
