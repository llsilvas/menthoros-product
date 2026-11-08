# Design — add-activity-gps-trace

**Data:** 2026-11-08 · **Base:** DoR do `spec-reviewer` (READY COM AJUSTES) + leitura do código.

## D1 — `deviceName` existente é a única fonte do modelo; não há coluna nova

`TreinoRealizado.deviceName` (`V13`, `VARCHAR(200)`) já existe e já chega aos DTOs
(`TreinoRealizadoOutputDto`, `AtletaHomeDto`, `AtletaPerfilCoachOutputDto`,
`AthleteWorkoutAnalysisOutputDto`). Hoje é preenchido pelo `deviceName` do ping Garmin, pelo
`device_name` do Strava/intervals.icu, e fica nulo no upload manual.

Decisão: o parser passa a ler o modelo do `.fit` e o `FitTreinoPersister` usa como **fallback**,
nunca sobrescrevendo um valor já presente. Precedência: ping Garmin → `.fit` → nulo.

Leitura do `.fit`: `DeviceInfoMesg.getProductName()` quando não nulo (texto legível, ex.
`"Forerunner 265"`); senão `FileIdMesg.getProductName()`; senão nulo. **Não** traduzir
`getGarminProduct()` (inteiro) para nome: exigiria um mapa de produtos a manter. A atribuição
"Garmin [modelo]" exigida pela Garmin usa `deviceName`; com nulo, o front escreve só "Garmin".

## D2 — Formato: JSONB com polyline codificada + FC paralela

Coluna `gps_trace JSONB NULL` em `tb_treino_realizado`, mapeada com `@JdbcTypeCode(SqlTypes.JSON)`
(padrão já usado em `RaceProjectionSnapshot.projectionsJson`). Conteúdo:

```json
{ "v": 1, "n": 312, "polyline": "<Google encoded polyline, precisão 5>",
  "tSeg": [0, 4, 9, ...], "fc": [112, 118, null, ...] }
```

- `polyline` codificada: ~5 bytes/ponto; 400 pontos ≈ 2 KB.
- `tSeg` (segundos desde o início) e `fc` são arrays paralelos ao trajeto simplificado; o front
  deriva zona a partir de `fc` com as zonas do atleta.
- JSONB em vez de `TEXT` + `SMALLINT[]`: um campo só, versionável (`v`), e sem mapeamento de
  array no Hibernate.

Migration `V113__Add_gps_trace_to_treino_realizado.sql`: **aditiva**, coluna nula, sem backfill.
Rollback de deploy é seguro: a coluna fica ignorada. Remover a coluna é `DROP` e cai no gate de
confirmação do `CLAUDE.md`.

## D3 — Simplificação em streaming, sem reter 60k pontos

O `RecordMesgListener` já tem teto `MAX_AMOSTRAS = 200_000`. Para GPS:

1. **Decimação on-line** no listener: guarda o ponto só se a distância ao último ponto guardado
   for ≥ 5 m (usa `RecordMesg.getDistance()` acumulada; fallback haversine se nulo). Uma corrida de
   42 km vira ≤ ~8.400 pontos em memória, não 60k.
   **Teto rígido** `MAX_PONTOS_GPS = 20_000` (Codex): se a lista decimada atingir o teto, re-decimar
   a lista atual com o passo dobrado (5 → 10 → 20 m…) e seguir coletando com o novo passo. O
   orçamento de memória fica em 20k × ~40 bytes ≈ 800 KB por arquivo, qualquer que seja o tamanho
   da atividade ou o ruído do GPS.
2. **Douglas-Peucker** sobre a lista decimada, tolerância 10 m (`Q2`: validar com 3 arquivos
   reais), e teto **400 pontos** — se o DP ainda passar de 400, reaplicar com tolerância dobrada.
3. Pontos com `position_lat`/`position_long` nulos ou iguais a `0x7FFFFFFF` (inválido no SDK) são
   descartados; a ingestão segue.
4. Menos de 2 pontos válidos → `gpsTrace` nulo.

Conversão: `grau = semicírculo × (180 / 2^31)`.

## D4 — Contrato: endpoint próprio de trajeto, não na lista

Não existe endpoint de detalhe do treino realizado para o atleta (só `GET /me/treinos` e
`GET /me/realizados/{id}/analise`). Colocar 2–8 KB por item na lista é pesado para o atleta e
inútil para a maioria das telas.

Decisão: **`GET /api/v1/atletas/me/realizados/{id}/trajeto`** → `GpsTraceOutputDto` (o JSON de D2
mais `deviceName`), `404` quando o treino não é do atleta ou não tem trajeto. Para o coach,
`GET /api/v1/treinos-realizados/{id}/trajeto` com o mesmo DTO, no `TreinoRealizadoController`,
sob o filtro de tenant existente.

A lista `GET /me/treinos` ganha só um booleano `temTrajeto`, para o front saber se mostra o modelo
de card com mapa sem baixar nada.

## D5 — Sem reprocessamento

`GarminPingProcessorScheduler:174` baixa o `byte[]`, parseia e descarta; `FitUploadServiceImpl`
idem. O `.fit` não é retido. Treinos anteriores ao deploy ficam sem `gpsTrace`; o front trata como
"sem GPS". Reprocessamento sai do escopo (não há de onde reprocessar). Se um dia o `.fit` passar a
ser retido, o reprocessamento vira change própria.

## D6 — Privacidade

GPS/trajeto já é dado sensível declarado na Política (§ 2.1); esta change persiste o que o `.fit`
já trazia, dentro do mesmo `tenant_id`. **Nenhuma exposição nova para fora da plataforma**: isso é
`athlete-share-cards-mapa`, bloqueada por `lgpd-trajeto-cards-compartilhamento`. A visão do coach
recebe o trajeto do próprio atleta dele, o que a Política § 6.1 já cobre.

## Métricas (como medir)

- Cobertura: `SELECT count(*) FILTER (WHERE gps_trace IS NOT NULL) / count(*)` entre
  `tb_treino_realizado` com `fonte_dados IN ('GARMIN','FIT_UPLOAD')` e `data >= deploy`; meta 100%
  nos outdoor (esteira/indoor contam como "sem GPS" esperado).
- Tamanho: P95 de `pg_column_size(gps_trace)` ≤ 8 KB, medido em staging com os 3 arquivos de Q2.
- Treinador: contagem de aberturas do endpoint de trajeto do coach nas 4 primeiras semanas
  (métrica de uso; o benefício qualitativo é não precisar abrir o Garmin Connect).
