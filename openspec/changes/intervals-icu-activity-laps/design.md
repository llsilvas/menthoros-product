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
segurar conexão de banco durante IO externo**. Esta change preserva essa estrutura sem tensioná-la —
ver D1.

---

## D1 — Não há segunda chamada HTTP: os intervalos vêm no mesmo payload

**Correção de premissa (founder, 2026-08-02).** O design original desta change presumia um endpoint
separado de laps, espelhando o Strava (`GET /activities/{id}/laps`). **Errado.** O intervals.icu
devolve os intervalos na própria activity, sob um query param:

```
GET /api/v1/activity/{id}?intervals=true
```

O fluxo, portanto, **não muda de forma** — só o passo 3 ganha um parâmetro:

```
  3.  buscarAtividade(apiKey, id, comIntervalos=true)  → IcuActivityDto (com intervalos dentro)
  4.  guard cross-atleta                                (inalterado)
  5.  filtro de modalidade                              (inalterado)
  6-9. persister.persistir(dto, atleta, tenantId, externalId)
```

**O que essa correção elimina:**

| Problema do design anterior | Estado |
|---|---|
| Onde posicionar a 2ª chamada sem gastar rate limit à toa | **Não existe** |
| Segurar conexão de banco durante IO extra | **Não existe** — continua uma chamada só, já fora de transação |
| +1 chamada HTTP por atividade; o dobro sob o scheduler | **Custo zero** — mesmo número de chamadas de hoje |
| Falha "só nos laps" virando perda permanente (achado HIGH do Codex) | **Não existe** — ver D3 |

A regra de External Call Resilience continua satisfeita por construção: a chamada já acontecia no
orquestrador não-transacional, e continua sendo uma só.

**O caminho Strava permanece intocado** (non-goal). A assimetria entre as duas integrações é da
fonte, não do nosso código: o Strava exige a chamada extra, o intervals.icu não.

---

## D2 — Contrato do DTO de intervalo

**VERIFICADO contra payload real** (smoke 2026-08-02, atleta `i641775`, activity `i171415754` —
"São Paulo - 15.5 Km - LONGO", 17 intervalos). O bloco 0 está fechado para este contrato.

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public record IcuActivityIntervalDto(
        Long id,                                                // opaco (ex. 7130765) — NÃO é índice
        String type,                                            // WORK, RECOVERY (ver D5)
        String label,                                           // null nesta activity
        @JsonProperty("start_index") Integer startIndex,        // índice de sample — confere a ordem
        Double distance,                                        // metros            (1001.92)
        @JsonProperty("moving_time") Integer movingTimeSeg,     // segundos          (388)
        @JsonProperty("elapsed_time") Integer elapsedTimeSeg,   // segundos          (388)
        @JsonProperty("average_speed") Double averageSpeed,     // m/s               (2.582268)
        @JsonProperty("average_heartrate") Double averageHeartrate,  //              (127)
        @JsonProperty("max_heartrate") Double maxHeartrate,          //              (145)
        @JsonProperty("average_cadence") Double averageCadence, // perna única       (81.3866)
        @JsonProperty("average_watts") Double averageWatts,     // null em corrida
        @JsonProperty("total_elevation_gain") Double totalElevationGain,  // metros  (2.4000244)
        @JsonProperty("average_stride") Double averageStride,   // metros            (0.95185256)
        @JsonProperty("average_stance_time") Double averageStanceTime,               // ms  (263.24)
        @JsonProperty("average_stance_time_balance") Double averageStanceTimeBalance,// %   (50.82)
        @JsonProperty("average_vertical_oscillation") Double averageVerticalOscillation, // mm (107.69)
        @JsonProperty("average_vertical_ratio") Double averageVerticalRatio,         // %   (10.85)
        @JsonProperty("average_temp") Double averageTemp                             // °C  (19.25)
) {}
```

### O que o smoke derrubou do design anterior

| Presumido | Real |
|---|---|
| `id` serve como `splitIndex` | **Opaco** (`7130765`, `6086337`, …) — não ordena nada. Ordem vem da posição na lista, confirmada por `start_index` crescente |
| `total_elevation_loss` existe | **Não existe.** Só `total_elevation_gain` — `elevacaoPerdaMetros` fica null |
| Envelope separado com `icu_groups` a desembrulhar | `icu_intervals` é lista nua dentro da activity; `icu_groups` é agregação de repetições, **não usada** |
| Running dynamics provavelmente ausentes | **Presentes e preenchidos** nos 17 intervalos — GCT, oscilação, razão vertical, balanço, temperatura, passada |
| Cadência de perna única (premissa 2) | **Confirmado**: 81.39 → 162.8 spm total, coerente com 6:27/km |
| Distância em metros (premissa 3) | **Confirmado**: 1001.92 por volta; summary 15004.61 para 15,5 km |
| O payload classifica o tipo (premissa 4) | **Confirmado**: `type` = `WORK` / `RECOVERY` (ver D5) |

### O query param não é opcional

Sem `?intervals=true`, `icu_intervals` **nem vem no corpo** (verificado: chave ausente, valor nulo).
Custo real medido: **4.649 → 44.072 bytes** (9,5×) e 0,69 s de latência total — folga larga contra o
read timeout de 10 s do `IntervalsIcuWebClientConfig`. Task 0.6 fechada.

**Onde a lista mora:** os intervalos vêm **dentro** do corpo da activity (D1), no campo
`icu_intervals`:

```java
public record IcuActivityDto(
        // ... campos atuais, inalterados ...
        @JsonProperty("icu_intervals") List<IcuActivityIntervalDto> intervalos
) {}
```

Campo **nullable**: quando o import é feito sem `intervals=true`, ou quando a activity não tem
intervalos, ele vem ausente ou nulo. O mapper trata `null` como lista vazia — nunca NPE.

**Compatibilidade:** acrescentar um componente a um `record` muda o construtor canônico. Todo ponto
que constrói `IcuActivityDto` à mão (fixtures de teste, `IntervalsIcuActivityMapperTest`) precisa ser
atualizado no mesmo commit. A desserialização via Jackson não é afetada.

---

## D3 — Semântica de falha: não existe "falha só nos laps"

**Esta seção mudou por inteiro com a correção de premissa do D1.** A versão anterior desenhava uma
política de best-effort para uma segunda chamada que **não existe**, e o pre-mortem do Codex atacou
corretamente as consequências dela. Com uma chamada só, o problema é resolvido **por construção**:

- Se a chamada falhar (401, 404, 429, 5xx, timeout), o import inteiro falha — **exatamente como
  hoje**, pelo caminho de erro que `buscarAtividade` já implementa (`IntervalsIcuActivityIngestionServiceImpl:128-150`).
- Não há estado intermediário "treino importado com sucesso, mas sem etapas por falha transitória".
- O scheduler continua abortando o lote em rate-limit e **não avança o cursor** — a atividade é
  reprocessada no ciclo seguinte, com os intervalos. Nenhuma perda permanente.

**O achado HIGH #1 do Codex fica resolvido, não mitigado.** Ele estava certo sobre o design que leu;
o design que leu partia de uma premissa errada minha.

**O que ainda pode acontecer:** a activity vir com `intervals` ausente, nulo ou vazio. Isso não é
falha — é uma corrida sem laps registrados. O treino é salvo sem etapas, como qualquer treino sem
esse dado, e nenhum tratamento especial é necessário.

**Consequências da simplificação:**

- **`lapsStatus` deixa de existir.** Não há o que classificar: ou a chamada deu certo (e os
  intervalos vieram, ou genuinamente não existem), ou o import falhou. Nada a gravar em
  `metadadosSincronizacao`.
- **A métrica de falha de laps deixa de existir.** As falhas da chamada já são as falhas de import,
  que a change anterior já instrumenta.
- **CA3 do proposal perde o objeto** e é reescrito.

**Deserialização quebrada** continua sendo bug de contrato, não indisponibilidade — mas agora
derruba o import inteiro (o Jackson falha ao ler a activity), o que é o comportamento correto e já
existente.

---

## D4 — Mapeamento `IcuActivityIntervalDto` → `EtapaRealizada`

Fica em `IntervalsIcuActivityMapper` (componente puro, sem IO — coerente com o que ele já é).

| `EtapaRealizada` | Origem | Nota |
|---|---|---|
| `ordem` | posição na lista, 1-based | fonte de verdade da ordenação (`@OrderBy("ordem ASC")`); `start_index` crescente confirma que a lista já vem cronológica |
| `splitIndex` | **posição**, não o `id` | `id` é opaco (D2) — usar ele quebraria a semântica que o Strava dá ao campo |
| `tipoEtapa` | `type` normalizado | `WORK`/`RECOVERY` confirmados — ver D5 |
| `descricao` | `label` se presente; senão `"Lap " + ordem` | `label` veio null na activity de corrida livre |
| `duracao` / `tempoMovimento` | `Duration.ofSeconds(movingTimeSeg)` | |
| `distanciaKm` | `distance / 1000`, scale 3 | scale 3 igual ao Strava (`toKm(..., 3)`) |
| `fcMedia` / `fcMax` | arredondamento de `averageHeartrate` / `maxHeartrate` | |
| `velocidadeMedia` | `averageSpeed * 3.6`, scale 2 | **m/s → km/h**, o bug que a change anterior cometeu |
| `paceMedia` | `movingTime / distanceKm`, fallback `1000 / averageSpeed` | mesma prioridade de `calculatePace` |
| `cadenciaMedia` | `averageCadence * 2`, sanitizado 60–200 | perna única **confirmada** no smoke |
| `potenciaMedia` | arredondamento de `averageWatts` | sempre null em corrida |
| `elevacaoGanhoMetros` | arredondamento de `totalElevationGain` | |
| `elevacaoPerdaMetros` | **null** | a fonte não expõe perda por intervalo (D2) — **não** derivar nem zerar |
| `passadaMediaM` | `averageStride`, scale 2 | metros, direto |
| `gctMedioMs` | arredondamento de `averageStanceTime` | ms, direto |
| `gctEquilibrioPct` | `averageStanceTimeBalance`, scale 1 | % do pé esquerdo, convenção Garmin — mesma do campo |
| `oscilacaoVerticalCm` | `averageVerticalOscillation / 10`, scale 1 | **mm → cm.** 107,69 mm = 10,8 cm; gravar 107,69 num campo `precision 4 scale 1` estoura o range e mente na análise |
| `proporcaoVerticalPct` | `averageVerticalRatio`, scale 1 | % direto |
| `temperaturaMediaC` | `averageTemp`, scale 1 | °C direto |
| `treinoRealizado` | setado dentro do mapper (D6) | |
| `etapaPlanejada` | **null** | pareamento etapa-a-etapa é non-goal |

**Running dynamics são um ganho não previsto.** O design original nem os considerava; o payload
traz os seis preenchidos e o `EtapaRealizada` já tem as colunas desde V53. Mapeá-los é quase de
graça e dá ao treinador, por volta, dados que hoje ele não tem em fonte nenhuma. **A única conversão
de unidade é a oscilação vertical (mm → cm)** — as demais entram diretas.

**Regra de acoplamento (mesma da change anterior):** não chamar helpers de
`StravaActivityServiceImpl`. As fórmulas coincidem; as fontes são independentes e podem divergir. Os
helpers privados do `IntervalsIcuActivityMapper` (`toKmh`, `sanitizeCadenciaIntervalsIcu`,
`calculatePace`) são reusados **dentro do próprio mapper**.

### Intervalo degenerado: descartar (regra ajustada pelo smoke)

O payload real trouxe **17 intervalos, mas `icu_lap_count = 16`**. O excedente é lixo:

```
id=6086337  type=RECOVERY  distance=2.4 m  moving_time=1 s  average_speed=2.4
```

Um "intervalo" de 1 segundo e 2,4 metros. A regra que eu tinha escrito — descartar quando distância
**e** duração forem nulas ou zero — **não pegaria este caso**, porque ambos têm valor. Persistido,
ele entra nos cálculos de drift de FC e progressão de pace das skills como se fosse uma volta.

**Regra corrigida:** descartar o intervalo quando `movingTimeSeg < 5` **ou** `distance < 20`. Os
limiares são conservadores de propósito — o tiro legítimo mais curto que um treinador prescreve
(strides de 15–20 s) fica com folga acima, e nada plausível como etapa de corrida cai abaixo deles.

**Sanidade:** após o filtro, a contagem deve bater com `icu_lap_count`. Divergência não é erro
fatal (o campo pode ter outra semântica em outras activities), mas vira log em DEBUG — é o sinal
barato de que a regra de descarte descolou da fonte.

---

## D5 — `tipoEtapa`: o intervals.icu classifica (confirmado)

O smoke confirmou a premissa 4: cada intervalo traz `type`. Na activity de corrida livre apareceram
`WORK` e `RECOVERY`. Mapeamento:

| `type` da fonte | `tipoEtapa` |
|---|---|
| `WORK` | `PRINCIPAL` |
| `RECOVERY` | `RECUPERACAO` |
| `WARMUP` | `AQUECIMENTO` |
| `COOLDOWN` | `DESAQUECIMENTO` |
| qualquer outro / ausente | **null** |

`WARMUP` e `COOLDOWN` **não foram observados** — são extrapolação do vocabulário. Se não existirem,
caem no ramo "desconhecido → null" sem quebrar nada. Valor desconhecido nunca vira chute: é null.

**Isto é uma vantagem real sobre o Strava**, que só numera laps. Um treino intervalado importado do
intervals.icu chega com a estrutura de esforço/recuperação explícita.

**Não** inferir tipo por duração/FC quando a fonte não classificar — seria heurística nova e não
testada num lugar onde o dado da fonte existe. Fica para change própria, se o treinador sentir falta.

**Ainda não verificado:** uma activity vinda de **treino estruturado** (com blocos prescritos). É ela
que responde se `label` vem preenchido e se `WARMUP`/`COOLDOWN` existem de fato. Não bloqueia a
implementação — o ramo null cobre —, mas vale capturar quando houver uma à mão.

---

## D6 — Attach e persistência

**A assinatura de `persistir` não muda.** Como os intervalos chegam dentro do `IcuActivityDto` (D1),
o mapper — que já recebe o dto inteiro — passa a montar o treino **com** as etapas. Nada precisa
atravessar o orquestrador:

```java
// IntervalsIcuActivityMapper.map(dto, atleta) — passa a terminar com:
List<EtapaRealizada> etapas = mapEtapas(dto.intervalos());   // null → List.of()
for (EtapaRealizada etapa : etapas) {
    etapa.setTreinoRealizado(treino);
}
treino.getEtapasRealizadas().addAll(etapas);
return treino;
```

`IntervalsIcuActivityPersister.persistir` fica **inalterado** — o `treino` que ele recebe do mapper
já vem completo, e o `saveIdempotent` persiste as filhas por cascade. Isso também elimina o risco de
anexar etapas ao registro vencedor no ramo `inserted == false`: não há attach fora do mapper.

**Sem save explícito de etapa:** `TreinoRealizado.etapasRealizadas` tem
`cascade = CascadeType.ALL, orphanRemoval = true` (`TreinoRealizado.java:107`) — o `save` do treino
persiste as filhas. Nenhum `EtapaRealizadaRepository` novo.

**O attach acontece dentro do mapper, sobre um `treino` recém-construído** — nunca sobre o registro
devolvido pelo ramo `inserted == false` (corrida de concorrência). Nesse ramo o vencedor da corrida
já persistiu as próprias etapas; anexar de novo duplicaria linhas. Isso é garantido por construção
(o persister não manipula etapas), mas o teste fixa a garantia.

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

## D9 — Backfill: só a lacuna histórica

**Escopo reduzido pela correção do D1.** O D9 nasceu para cobrir dois casos; com uma chamada só,
**um deles deixou de existir** (o treino cuja busca de laps falhou — ver D3). Resta um:

> Treinos intervals.icu importados **antes** desta change, que nunca tiveram etapas porque o
> pipeline não as buscava. O guard de dedup impede que um re-import os corrija.

**Operação:** `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-laps` — ação do
coach (coach-in-the-loop), mesma autorização do import manual.

```
Para cada TreinoRealizado do atleta com fonteDados=INTERVALS_ICU e etapasRealizadas vazio:
  1. buscarAtividade(apiKey, externalId, comIntervalos=true)   ← fora de transação
  2. mapEtapas(dto.intervalos())
  3. attach + save                                              ← UPDATE, não INSERT
```

**Por que isto contorna o dedup:** o guard do passo 0 protege contra **inserir** um treino duplicado.
O backfill não insere nada — completa um registro existente. O dedup nunca é consultado.

**Só o summary é ignorado.** O backfill relê a activity inteira mas grava **apenas** as etapas — não
sobrescreve distância, pace, FC nem nada que o coach possa ter editado desde o import.

**Por que ação do coach e não job automático:** é uma operação de uma vez só, sobre um passivo
finito. Um job agendado ficaria varrendo para sempre um conjunto que tende a zero. Se o volume do
pilot tornar o disparo manual incômodo, promover depois.

**Activities genuinamente sem laps são reconsultadas a cada execução** — não há marcador que as
distinga de "ainda não corrigidas". Aceitável: o backfill é manual, o passivo é pequeno e finito, e
cada reconsulta é uma chamada. Não vale um campo de estado novo para isso.

**Idempotência:** rodar duas vezes é seguro — na segunda passada os treinos corrigidos já têm etapas
e saem do conjunto.

---

## D7 — Assinatura do client

Nenhum método novo. `buscarAtividade` ganha o parâmetro que liga os intervalos:

```java
/** GET /api/v1/activity/{id}?intervals={comIntervalos} — erro HTTP vira IntervalsIcuApiException. */
IcuActivityDto buscarAtividade(String apiKey, String activityId, boolean comIntervalos);
```

Implementação em `IntervalsIcuClientImpl:135-142`, acrescentando o query param ao `uri(...)` e
mantendo o helper `executa(...)` e o `basic(h, apiKey)` intactos.

**Todos os chamadores atuais passam `true`** — não há caso de uso para importar sem os intervalos, e
manter uma sobrecarga de dois braços só cria a chance de alguém chamar o braço errado e reintroduzir
o bug que esta change conserta. Trocar a assinatura em vez de sobrecarregar força o compilador a
apontar cada ponto de chamada.

Timeouts vêm do `IntervalsIcuWebClientConfig` já existente (5s/10s) — nenhuma configuração nova. O
payload fica maior (activity + intervalos num corpo só), o que é argumento para **conferir** se o
read timeout de 10s continua folgado no smoke, não para mexer nele preventivamente.

---

## D8 — Testes

| Camada | Cobertura |
|---|---|
| `IntervalsIcuActivityMapperTest` | mapeamento campo a campo; unidades (m/s→km/h, cadência dobrada, metros→km scale 3); lista vazia; intervalo sem métricas descartado; `tipoEtapa` desconhecido → null |
| `IntervalsIcuClientImplTest` | query param `intervals=true` presente na URI; erro HTTP → `IntervalsIcuApiException` |
| `IntervalsIcuActivityIngestionServiceImplTest` | dedup do passo 0 não faz nenhuma chamada (CA5); comportamento de erro do import inalterado |
| `IntervalsIcuActivityPersisterTest` | etapas persistidas por cascade; ramo `inserted == false` não duplica etapas |
| `IntervalsIcuBackfillServiceTest` | conjunto de candidatos tenant-scoped; UPDATE sem insert; idempotência; falha em um treino não aborta os demais; summary não é sobrescrito |
| `IntervalsIcuActivityImportIntegrationTest` | etapas realmente persistidas em `tb_etapa_realizada` com `ordem` correta; re-import (passo 0) serializa o output com etapas sem `LazyInitializationException` |

Regra de sempre: strict stubbing, sem `LENIENT`. Skills não entram — elas já consomem
`EtapaRealizadaResumo` e não mudam.

---

## Pre-mortem

### Rodada 1 — Codex, 2026-08-02: **needs-attention**, 2 achados HIGH aceitos, 1 MEDIUM rejeitado

- **[HIGH, aceito] Best-effort transformava 429 transitório em perda permanente sob o scheduler.**
  O achado mais afiado das duas revisões: o D3 original conflitava com o design do scheduler, que
  aborta o lote para não avançar o cursor. Um 429 só nos laps virava import 200, cursor avançava,
  dedup bloqueava o conserto. **Resolvido — e não pela mitigação que eu tinha escrito.** A correção
  de premissa do D1 (uma chamada só, `?intervals=true`) elimina a classe inteira do problema: não
  existe "falha só nos laps". O achado estava certo sobre o design que leu; o design que ele leu
  partia de uma premissa minha errada.
- **[HIGH, aceito] Backfill deixado como open question no início da implementação.** Convergente com
  o achado #2 do product review, mas mais duro: exige mecanismo concreto de recuperação como
  requisito de DoR, não decisão adiada. **Corrigido:** D9 vira escopo desta change, agora reduzido à
  lacuna histórica (o caso "lap fetch falhou" deixou de existir).
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

0. **Correção de premissa (founder, 2026-08-02) — a mais barata das três rodadas.** O design inteiro
   presumia um endpoint separado de laps, por simetria com o Strava. É `?intervals=true` no endpoint
   que já usamos. Duas revisões e um pre-mortem atacaram consequências de uma premissa que uma frase
   do founder derrubou. Lição para a rodada 2: **confirmar o contrato externo antes de desenhar em
   cima dele**, não depois — exatamente o que o bloco 0 existe para forçar.
1. **O nome do campo dos intervalos no corpo** (`icu_intervals`?) e a forma de cada item continuam
   não verificados → a D2 ainda depende do smoke.
2. **`ordem` colide com o índice `idx_etapa_realizada_ordem`** se o payload trouxer índices
   repetidos (grupos de repetição). A ordem 1-based da posição na lista protege, mas `splitIndex`
   pode repetir — confirmar que nada depende de `splitIndex` ser único.
3. **Activity com muitos intervalos** (tiro curto, 40+ repetições) → 40 inserts por import; sob o
   scheduler em lote, volume relevante. Estimar no DoR.
4. **Ordem de merge com `intervals-icu-activity-sync-scheduler`** — as duas mexem em
   `IntervalsIcuActivityPersister`, e agora também compartilham a semântica de falha do D3.
