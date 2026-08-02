# Design: intervals-icu-activity-laps

Detalha as decisões de design da change. O "porquê" e o escopo estão em `proposal.md`.

## Contexto: o pipeline como está hoje

```
IntervalsIcuActivityIngestionServiceImpl.importarAtividade   (NÃO transacional)
  0. dedup por (tenant, INTERVALS_ICU, externalId) ────────── early return
  1. precondição de pausa Strava
  2. conexão ativa + atleta + guard de externalAthleteId duplicado
  3. buscarAtividade  →  GET /api/v1/activity/{id}          ← ÚNICA chamada HTTP
  4. guard cross-atleta (athleteId == externalAthleteId)
  5. filtro de modalidade
  6-9. persister.persistir(...)                              (@Transactional)
        ├─ recheck de conexão ativa (TOCTOU)
        ├─ mapper.map(dto, atleta)  → TreinoRealizado  (etapasRealizadas SEMPRE vazio)
        ├─ dedupHelper.saveIdempotent
        └─ TSS, TSB, reconciliação, evento
```

A separação orquestrador/persister é deliberada e está documentada no javadoc do impl: **nunca
segurar conexão de banco durante IO externo**. Todo este design existe para respeitar essa regra ao
adicionar uma segunda chamada HTTP.

---

## D1 — Onde entra a segunda chamada HTTP

**Decisão:** no orquestrador, como **passo 3b**, logo depois do guard cross-atleta (passo 4) e antes
de chamar o persister.

```
  3.  buscarAtividade      → IcuActivityDto
  4.  guard cross-atleta                          ← barato, roda ANTES de gastar a 2ª chamada
  5.  filtro de modalidade                        ← idem
  3b. buscarIntervalos     → List<IcuActivityIntervalDto>   (best-effort, ver D3)
  6-9. persister.persistir(dto, etapas, atleta, tenantId, externalId)
```

**Por quê nessa posição:**

- **Depois dos guards 4 e 5**, não antes: uma activity de outro atleta ou de modalidade não suportada
  aborta o import de qualquer jeito — gastar a segunda chamada nesses casos é desperdiçar rate limit
  do intervals.icu à toa, e no caso do guard 4 seria confirmar externamente a existência de uma
  activity que a resposta ao coach vai negar (404).
- **Fora do persister**, não dentro: o persister é `@Transactional`. Buscar laps lá dentro seguraria
  uma conexão do pool Hikari durante uma chamada de rede — exatamente a dívida que o caminho Strava
  carrega (`StravaActivityServiceImpl.attachLaps` é chamado de dentro de métodos `@Transactional`).
  Esta change **não** conserta o Strava (non-goal), mas **não replica** o problema.

**Alternativa descartada:** chamar de dentro do persister e aceitar a simetria com o Strava.
Descartada porque a regra do módulo é explícita (External Call Resilience no CLAUDE.md do backend) e
porque o scheduler em lote multiplicaria o dano.

---

## D2 — Contrato do DTO de intervalo

**Presumido, a confirmar no smoke (bloqueador de DoR — ver proposal, Open Questions #1):**

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public record IcuActivityIntervalDto(
        Integer id,                                            // ordem/índice do intervalo
        String type,                                           // WARMUP / WORK / RECOVERY / COOLDOWN ?
        String label,                                           // rótulo textual, quando houver
        Double distance,                                        // metros (presumido)
        @JsonProperty("moving_time") Integer movingTimeSeg,
        @JsonProperty("elapsed_time") Integer elapsedTimeSeg,
        @JsonProperty("average_speed") Double averageSpeed,     // m/s (presumido)
        @JsonProperty("average_heartrate") Double averageHeartrate,
        @JsonProperty("max_heartrate") Double maxHeartrate,
        @JsonProperty("average_cadence") Double averageCadence, // perna única (presumido)
        @JsonProperty("average_watts") Double averageWatts,
        @JsonProperty("total_elevation_gain") Double totalElevationGain,
        @JsonProperty("total_elevation_loss") Double totalElevationLoss
) {}
```

`@JsonIgnoreProperties(ignoreUnknown = true)` é obrigatório, mesmo padrão de `IcuActivityDto` — o
payload de terceiro pode ganhar campos a qualquer momento.

**O smoke tem de responder, por campo:** existe? qual o nome exato? qual a unidade? Não assumir
simetria com o summary — foi exatamente essa suposição que produziu os dois bugs de unidade da
change anterior (cadência de perna única não dobrada; `average_speed` em m/s atribuído direto a
km/h).

**Envelope da resposta:** o endpoint pode devolver um objeto envelope (ex.
`{ "icu_intervals": [...], "icu_groups": [...] }`) em vez de uma lista nua. O client absorve essa
diferença e devolve `List<IcuActivityIntervalDto>` — o mapper nunca vê o envelope.

---

## D3 — Falha na busca de laps é não-fatal

**Decisão:** a segunda chamada é **best-effort**. Qualquer falha (404, 429, 5xx, timeout, corpo
vazio) resulta em lista vazia, WARN estruturado e métrica — o import do summary prossegue e responde
200.

```java
private List<IcuActivityIntervalDto> buscarIntervalosBestEffort(IntegracaoExterna conexao, String activityId) {
    try {
        return intervalsIcuClient.buscarIntervalos(conexao.getAccessToken(), activityId);
    } catch (IntervalsIcuApiException e) {
        log.warn("Laps intervals.icu indisponíveis — import prossegue sem etapas: activityId={}, status={}",
                activityId, e.getStatus());
        // métrica: intervals_icu_laps_fetch_failure{status=...}
        return List.of();
    }
}
```

**Por quê:** o import de summary está em produção e funciona. Fazer a falha de um dado
*complementar* derrubar um import que hoje é bem-sucedido seria uma regressão de disponibilidade —
troca ruim. O comportamento degradado é exatamente o comportamento de hoje.

### Correção após pre-mortem (Codex, 2026-08-02) — best-effort SEM recuperação era perda de dado

A versão original desta decisão dizia "a contrapartida é que o import nunca se auto-corrige, aceitar
e revisitar se a taxa de falha for alta". **Isso estava errado sob o scheduler**, e o achado é
convergente com o do product review:

- A change ativa `intervals-icu-activity-sync-scheduler` aborta o lote do atleta em rate-limit/timeout
  justamente para **não avançar o cursor** sobre uma janela mal processada.
- Com o D3 original, um 429 **só na chamada de laps** vira um import bem-sucedido (200). O cursor
  avança, o dedup do passo 0 bloqueia o re-import, e o treino fica **permanentemente sem etapas** —
  exatamente no caminho automático que esta change existe para proteger.
- Uma falha transitória de segundos viraria perda de dado definitiva. Troca inaceitável.

**Decisão revisada:** o best-effort continua (não derrubar o import é certo), mas deixa de ser
terminal. A falha passa a ser **registrada e recuperável** — ver D9. Classificação da falha:

| Resposta da chamada de laps | `lapsStatus` | Recuperável? |
|---|---|---|
| 200 com laps | `OK` | — |
| 200 com lista vazia, ou 404 | `EMPTY` | Não — a activity genuinamente não tem laps |
| 429, 5xx, timeout | `FAILED` | **Sim** — transitório, entra na fila de recuperação |
| 200 com corpo que não desserializa | `FAILED` + ERROR | Sim, mas é quebra de contrato — alarme |

`lapsStatus` é gravado como mais uma chave do `metadadosSincronizacao` (coluna
`metadados_sincronizacao TEXT`, já existente desde V13, já escrita pelo mapper via Jackson).
**Sem migration.**

**Não confundir com mascarar erro sistemático:** o WARN e a métrica por status são obrigatórios. Uma
quebra de contrato (o endpoint mudou, todo mundo dá 404) tem de ser visível no Prometheus, não
descoberta pelo coach.

**Deserialização quebrada NÃO é best-effort silencioso.** Se o corpo chega mas o Jackson falha, é
bug de contrato, não indisponibilidade: logar em ERROR (não WARN) e seguir sem etapas.

---

## D4 — Mapeamento `IcuActivityIntervalDto` → `EtapaRealizada`

Fica em `IntervalsIcuActivityMapper` (componente puro, sem IO — coerente com o que ele já é).

| `EtapaRealizada` | Origem | Nota |
|---|---|---|
| `ordem` | índice na lista, 1-based | fonte de verdade da ordenação (`@OrderBy("ordem ASC")`) |
| `splitIndex` | `id` do intervalo, se presente; senão o índice | espelha o uso de `lapIndex` no Strava |
| `tipoEtapa` | `type` normalizado | **null se o payload não trouxer** — ver D5 |
| `descricao` | `label` se presente; senão `"Lap " + ordem` | fallback igual ao do Strava |
| `duracao` | `Duration.ofSeconds(movingTimeSeg)` | |
| `distanciaKm` | `distance / 1000`, scale 3 | scale 3 igual ao Strava (`toKm(..., 3)`) |
| `fcMedia` / `fcMax` | arredondamento de `averageHeartrate` / `maxHeartrate` | |
| `velocidadeMedia` | `averageSpeed * 3.6`, scale 2 | **m/s → km/h**, o bug que a change anterior cometeu |
| `paceMedia` | `movingTime / distanceKm`, fallback `1000 / averageSpeed` | mesma prioridade de `calculatePace` |
| `cadenciaMedia` | `averageCadence * 2`, sanitizado 60–200 | mesma regra de `sanitizeCadenciaIntervalsIcu` |
| `potenciaMedia` | arredondamento de `averageWatts` | |
| `elevacaoGanhoMetros` / `elevacaoPerdaMetros` | campos dedicados quando existirem | se só houver diferença líquida, aplicar a lógica de sinal do Strava |
| `tempoMovimento` | `Duration.ofSeconds(movingTimeSeg)` | |
| `treinoRealizado` | setado no attach (D6) | |
| `etapaPlanejada` | **null** | pareamento etapa-a-etapa é non-goal |

**Regra de acoplamento (mesma da change anterior):** não chamar helpers de
`StravaActivityServiceImpl`. As fórmulas coincidem; as fontes são independentes e podem divergir. Os
helpers privados do `IntervalsIcuActivityMapper` (`toKmh`, `sanitizeCadenciaIntervalsIcu`,
`calculatePace`) são reusados **dentro do próprio mapper**.

**Intervalo sem métricas úteis** (distância e duração ambas nulas/zero) é descartado, não persistido
como etapa vazia — evita poluir a análise com linhas sem sinal.

---

## D5 — `tipoEtapa`: mapear o que vier, não inventar

Se o payload trouxer classificação do intervalo, normalizar para o vocabulário que
`EtapaRealizada.tipoEtapa` já documenta (`AQUECIMENTO`, `PRINCIPAL`, `INTERVALADO`, `RECUPERACAO`,
`DESAQUECIMENTO`). Valor desconhecido → null, nunca chute.

Se o payload **não** classificar, `tipoEtapa` fica null em todas as etapas — mesmo patamar do
Strava. **Não** inferir tipo por duração/FC nesta change: seria uma heurística nova e não testada
num lugar onde o dado da fonte pode simplesmente existir. Fica para uma change própria, se o
treinador sentir falta.

Este é o ponto onde o intervals.icu pode ficar **melhor** que o Strava — vale confirmar no smoke com
uma activity vinda de treino estruturado, não só de corrida livre.

---

## D6 — Attach e persistência

`persistir` ganha o parâmetro das etapas já mapeadas:

```java
@Transactional
public TreinoRealizado persistir(IcuActivityDto dto, List<EtapaRealizada> etapas,
                                 Atleta atleta, UUID tenantId, String externalId) {
    // ... recheck TOCTOU de conexão (inalterado)
    TreinoRealizado treino = intervalsIcuActivityMapper.map(dto, atleta);

    for (EtapaRealizada etapa : etapas) {
        etapa.setTreinoRealizado(treino);
    }
    treino.getEtapasRealizadas().addAll(etapas);

    TreinoDedupHelper.SaveResult resultado = treinoDedupHelper.saveIdempotent(treino, externalId, atleta.getId());
    // ... TSS, TSB, reconciliação, evento (inalterado)
}
```

**Sem save explícito de etapa:** `TreinoRealizado.etapasRealizadas` tem
`cascade = CascadeType.ALL, orphanRemoval = true` (`TreinoRealizado.java:107`) — o `save` do treino
persiste as filhas. Nenhum `EtapaRealizadaRepository` novo.

**O attach acontece antes do `saveIdempotent`, sobre um `treino` recém-construído** — nunca sobre o
registro devolvido pelo ramo `inserted == false` (corrida de concorrência). Nesse ramo o vencedor da
corrida já persistiu as próprias etapas; anexar de novo duplicaria linhas. O código acima satisfaz
isso por construção, mas o teste tem de fixar a garantia.

**Ordem dos side effects inalterada.** TSS, TSB, reconciliação e evento continuam iguais: nenhum
deles lê `etapasRealizadas` hoje. Se algum passar a ler, é outra change.

### Dívida adjacente encontrada (NÃO corrigir aqui)

`persistir` é `@Transactional` e chama `TreinoDedupHelper.saveIdempotent`, cujo contrato é
"insert-or-ignore" via catch de `DataIntegrityViolationException`. Pela regra que o CLAUDE.md do
backend passou a documentar, esse idiom **quebra silenciosamente** dentro de uma transação: o Spring
marca a transação como rollback-only quando a constraint dispara, o catch engole a exceção, e o
commit falha depois do bloco — 500 exatamente no caminho que o contrato promete ser seguro para
retry. O ramo `inserted == false` do persister, portanto, provavelmente nunca funcionou como
anunciado sob concorrência real.

Isso **precede** esta change e vale para o caminho Strava também. Fora de escopo aqui (a regra é
"stay within task scope"), mas registrado porque o teste 4.2 exercita justamente esse ramo — se ele
passar só com mock e falhar em integração, a causa é esta, não o attach de etapas. Merece change
própria.

---

## D9 — Recuperação: backfill de etapas (fecha os dois achados HIGH do pre-mortem)

Um único mecanismo resolve as duas lacunas que o Codex e o product review apontaram por portas
diferentes — o treino que falhou o lap fetch (D3) e o treino histórico importado antes desta change.
Ambos têm a **mesma assinatura em banco**: `fonteDados = INTERVALS_ICU` e `etapasRealizadas` vazio.

**Operação:** `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-laps` — ação do
coach (coach-in-the-loop), mesma autorização do import manual.

```
Para cada TreinoRealizado do atleta com fonteDados=INTERVALS_ICU e etapasRealizadas vazio,
excluindo os marcados lapsStatus=EMPTY:
  1. buscarIntervalos(apiKey, externalId)         ← fora de transação, igual ao D1
  2. mapEtapas(...)
  3. attach + save                                 ← UPDATE, não INSERT
```

**Por que isto contorna o dedup:** o guard do passo 0 protege contra **inserir** um treino
duplicado. O backfill não insere nada — ele completa um registro existente. O dedup nunca é
consultado, então a barreira que tornava a falha permanente simplesmente não se aplica.

**Por que não retentar dentro do import:** um retry inline paga o pior caso duas vezes exatamente
quando o intervals.icu já está sob pressão — é a regra de External Call Resilience do módulo
("nunca retentar um timeout"). A recuperação é assíncrona e deliberada, disparada quando o serviço
já se recuperou.

**Por que ação do coach e não job automático:** volume de pilot é pequeno, o coach sabe qual atleta
importa, e um job cross-tenant repetindo chamadas ao intervals.icu recria o problema de rate limit
que o D3 tenta contornar. Promover a job agendado é decisão para depois de medir — não antes.

**Filtro `lapsStatus=EMPTY`:** sem ele, toda activity que genuinamente não tem laps seria consultada
de novo a cada backfill, para sempre. O filtro roda em memória (`metadados_sincronizacao` é `TEXT`,
não `jsonb`) — aceitável no volume do pilot. Se crescer, promover a coluna própria com migration, em
change própria.

**Idempotência:** rodar o backfill duas vezes é seguro — na segunda passada os treinos corrigidos já
têm etapas e saem do conjunto de candidatos.

---

## D7 — Assinatura do client

```java
/** GET /api/v1/activity/{id}/intervals — erro HTTP vira IntervalsIcuApiException(status, mensagem). */
List<IcuActivityIntervalDto> buscarIntervalos(String apiKey, String activityId);
```

Mesma convenção de erro dos métodos existentes: erro HTTP → `IntervalsIcuApiException` com status,
tratamento de política fica na camada de serviço (D3). Timeouts vêm do `IntervalsIcuWebClientConfig`
já existente (5s/10s) — nenhuma configuração nova.

---

## D8 — Testes

| Camada | Cobertura |
|---|---|
| `IntervalsIcuActivityMapperTest` | mapeamento campo a campo; unidades (m/s→km/h, cadência dobrada, metros→km scale 3); lista vazia; intervalo sem métricas descartado; `tipoEtapa` desconhecido → null |
| `IntervalsIcuClientImplTest` | endpoint chamado; envelope desembrulhado; erro HTTP → `IntervalsIcuApiException` |
| `IntervalsIcuActivityIngestionServiceImplTest` | laps buscados só depois dos guards 4 e 5; falha de laps não derruba o import (CA3); dedup do passo 0 não faz nenhuma chamada (CA5); guard cross-atleta aborta antes da 2ª chamada (CA6) |
| `IntervalsIcuActivityPersisterTest` | attach com back-reference e cascade; ramo `inserted == false` não anexa etapas |
| `IntervalsIcuActivityImportIntegrationTest` | etapas realmente persistidas em `tb_etapa_realizada` com `ordem` correta; re-import (passo 0) serializa o output com etapas sem `LazyInitializationException` |

Regra de sempre: strict stubbing, sem `LENIENT`. Skills não entram — elas já consomem
`EtapaRealizadaResumo` e não mudam.

---

## Pre-mortem

### Rodada 1 — Codex, 2026-08-02: **needs-attention**, 2 achados HIGH aceitos, 1 MEDIUM rejeitado

- **[HIGH, aceito] Best-effort transformava 429 transitório em perda permanente sob o scheduler.**
  O achado mais afiado das duas revisões: o D3 original conflitava com o design do scheduler, que
  aborta o lote para não avançar o cursor. Um 429 só nos laps virava import 200, cursor avançava,
  dedup bloqueava o conserto. **Corrigido:** D3 revisado com classificação de falha
  (`EMPTY` vs `FAILED`) + D9 (backfill).
- **[HIGH, aceito] Backfill deixado como open question no início da implementação.** Convergente com
  o achado #2 do product review, mas mais duro: exige mecanismo concreto de recuperação como
  requisito de DoR, não decisão adiada. **Corrigido:** D9 vira escopo desta change, não non-goal.
- **[MEDIUM, rejeitado] "A premissa de sem-migration não se sustenta — `tb_etapa_realizada` não tem
  `split_index` nem colunas de elevação."** **Falso positivo por checkout errado.** O Codex rodou a
  partir de `menthoros-product/` e leu `infra/scripts/flyway/` — uma cópia legada com 9 migrations,
  parada em V9. A cadeia real do backend é
  `apps/menthoros-backend/src/main/resources/db/migration/` (73 migrations): V14 adiciona
  `split_index`, `elevacao_ganho_metros` e `elevacao_perda_metros`; V45 as reconcilia. O próprio
  `EtapaRealizada.java:82-89` mapeia as três. A premissa de sem-migration está correta.
  **Ação separada, fora desta change:** a cópia legada em `menthoros-product/infra/scripts/flyway/`
  enganou um revisor e enganaria um humano — merece ser removida ou marcada como legado.

### Hipóteses ainda em aberto (para a rodada 2, pós-smoke)

1. **O endpoint presumido não existe** ou devolve outra forma → toda a D2 cai. É por isso que o
   smoke é gate de DoR.
2. **`ordem` colide com o índice `idx_etapa_realizada_ordem`** se o payload trouxer índices
   repetidos (grupos de repetição). A ordem 1-based da posição na lista protege, mas `splitIndex`
   pode repetir — confirmar que nada depende de `splitIndex` ser único.
3. **Activity com muitos intervalos** (tiro curto, 40+ repetições) → 40 inserts por import; sob o
   scheduler em lote, volume relevante. Estimar no DoR.
4. **Ordem de merge com `intervals-icu-activity-sync-scheduler`** — as duas mexem em
   `IntervalsIcuActivityPersister`, e agora também compartilham a semântica de falha do D3.
