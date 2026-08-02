# Proposal: intervals-icu-activity-laps

**Tamanho:** M · **Trilha:** Full (incerteza de design real — o contrato de laps do intervals.icu
NÃO está verificado contra payload real; decisão de resiliência sobre falha parcial da segunda
chamada HTTP. Backend-only, **sem migration** — `tb_etapa_realizada` já existe desde V14 com todos
os campos necessários)

## Status

- Proposta inicial (2026-08-02) — aguardando DoR (`spec-reviewer`) e pre-mortem cross-model (Codex)
  antes de `/implement init`.
- Origem: bug reportado pelo founder em `IntervalsIcuActivityIngestionServiceImpl` ("deveria trazer
  as etapas do treino km a km"). Investigação confirmou que **não é regressão** — é o non-goal
  declarado em `archive/2026-07/2026-07-16-intervals-icu-activity-ingestion/proposal.md:148`
  ("laps/etapas ficam para evolução") que nunca foi fechado.
- Decisão de escopo do founder (2026-08-02): granularidade = **laps/intervalos do dispositivo**
  (espelha o Strava e o modelo `EtapaRealizada.splitIndex`), não splits fixos de 1 km derivados de
  streams. Change **única**, não dividida.
- Product review (2026-08-02, `product-reviewer`): **GO** com 4 achados de refinamento, todos
  incorporados nesta revisão — ligação explícita com risco de retenção da assessoria (não só atrito
  do coach); Open Question #5 trocada de "esperar reclamação" para observável + decisão datada;
  métrica não-mensurável removida; nota de que a change é infraestrutura de dado, não feature de IA.
  Gatilho numérico definido para o Open Question #6 (>5% de falha).
- Pre-mortem cross-model (2026-08-02, Codex): **needs-attention**, 2 achados HIGH aceitos e
  incorporados — (a) o best-effort original transformava um 429 transitório em perda **permanente**
  de etapas sob o scheduler, porque o cursor avança e o dedup bloqueia o conserto; (b) deixar o
  backfill como open question no início da implementação não é aceitável. Ambos fechados pelo **D9
  (backfill de etapas)**, que sai de non-goal e entra no escopo. Um achado MEDIUM foi **rejeitado**
  como falso positivo (ver design.md, Pre-mortem): o Codex leu a cópia legada de migrations em
  `menthoros-product/infra/scripts/flyway/` em vez da cadeia real do backend — a premissa de
  sem-migration se sustenta.

## Prioridade no roadmap

Classificação: **URGENTE** (decisão do founder, 2026-08-02).

O caminho intervals.icu é o canal validado para Garmin (gate 2026-07-14) e é para onde a base de
atletas do pilot está migrando. Enquanto as etapas não chegam, todo treino importado por esse
caminho é **cego no detalhe** para o treinador — e o problema piora sozinho: a change ativa
`intervals-icu-activity-sync-scheduler` vai automatizar a ingestão em lote, multiplicando o volume
de treinos sem etapas antes que alguém perceba.

## Why

Hoje **todo** `TreinoRealizado` importado do intervals.icu nasce com `etapasRealizadas` vazio. O
pipeline nunca busca laps: `IntervalsIcuClient` não tem endpoint de laps, `IcuActivityDto` só tem
campos de summary, `IntervalsIcuActivityMapper.map` não popula a coleção e
`IntervalsIcuActivityPersister.persistir` não faz attach. O caminho Strava faz exatamente isso —
`StravaActivityServiceImpl.attachLaps` → `GET /activities/{id}/laps` → `mapToEtapaRealizada`.

Consequência para a rotina do treinador (a estrela-guia):

- **O desdobramento do treino some.** O coach que abre um treino vindo do intervals.icu vê só o
  agregado (distância, pace médio, FC média). Para saber se o atleta cumpriu os tiros, se apagou no
  final, ou como foi cada volta, precisa sair do produto e abrir o intervals.icu em outra aba —
  exatamente o custo de contexto que o Menthoros existe para eliminar.
- **Duas skills de análise caem em fallback degradado.** `LongRunAnalysisSkill` e
  `IntervalWorkoutAnalysisSkill` priorizam `EtapaRealizadaResumo` e só calculam drift de FC e
  progressão de pace quando há etapas. Com a coleção vazia, o treinador recebe uma análise mais
  pobre para o atleta intervals.icu do que para o atleta Strava, sem nenhum aviso de que a diferença
  é de dado faltando, não de desempenho.
- **Assimetria silenciosa entre fontes.** Dois atletas da mesma assessoria, mesmo treino, análises
  de qualidade diferente só por causa da integração escolhida. **Isso é risco de retenção do
  comprador, não só atrito de UX do coach:** quem paga é a assessoria, e o defeito aparece para ela
  como "o treino desse atleta veio mais pobre" — uma percepção de qualidade inconsistente do produto,
  no estágio em que ainda não existe relação estabelecida para absorver o atrito. É o que sustenta a
  classificação URGENTE para quem lê só este documento.

**O que esta change NÃO é:** não é feature de IA nem gera sinal novo de aprendizado. É infraestrutura
de dado — pré-condição de qualidade para as skills de análise que já existem (CA7). Nenhuma saída
nova de IA é exposta ao atleta; o coach-in-the-loop fica inalterado.

## What Changes

Fatia vertical fina sobre o pipeline de ingestão que já existe:

- **`IntervalsIcuClient`**: novo método `buscarIntervalos(apiKey, activityId)` sobre o endpoint de
  intervalos da activity (path exato a confirmar no smoke — ver Open Questions).
- **`IcuActivityIntervalDto`** (novo record, `dto/intervalsicu/`): contrato de um lap/intervalo, com
  `@JsonIgnoreProperties(ignoreUnknown = true)`, seguindo o padrão de `IcuActivityDto`.
- **`IntervalsIcuActivityMapper`**: novo `mapEtapas(List<IcuActivityIntervalDto>)` →
  `List<EtapaRealizada>`, com sanitização isolada da do Strava (mesma regra da cadência: fórmula
  pode coincidir, o código não acopla).
- **`IntervalsIcuActivityIngestionServiceImpl`**: a busca de laps é uma **segunda chamada HTTP** e
  fica no passo 3 do orquestrador, **fora de qualquer transação** — não dentro do persister
  (`@Transactional`). Isso corrige, para o caminho novo, a dívida que o caminho Strava carrega
  (`attachLaps` roda dentro de `@Transactional`, segurando conexão de banco durante IO externo).
- **`IntervalsIcuActivityPersister`**: recebe as etapas já mapeadas e faz o attach antes do
  `saveIdempotent`. Não precisa de save explícito das etapas — `TreinoRealizado.etapasRealizadas`
  tem `cascade = CascadeType.ALL` (`TreinoRealizado.java:107`).
- **Falha de laps é não-fatal, mas recuperável**: se a segunda chamada falhar, o import do summary
  prossegue e o treino é salvo sem etapas — o comportamento de hoje. A falha é **classificada** e
  gravada em `metadadosSincronizacao` (`lapsStatus`: `OK` / `EMPTY` / `FAILED`), além de log e
  métrica.
- **Backfill de etapas** (`POST .../activities/backfill-laps`): ação do coach que completa os treinos
  intervals.icu sem etapas — tanto os que falharam o lap fetch quanto os importados antes desta
  change. É um **UPDATE**, não um insert, então o guard de dedup não se aplica. Entrou no escopo por
  achado HIGH do pre-mortem: sem ele, um 429 de segundos vira perda de dado permanente sob o
  scheduler.

## Capabilities

### Modified Capabilities
- `intervals-icu-ingestion`: a atividade importada passa a trazer também as etapas (laps/intervalos)
  como `EtapaRealizada`, quando o payload as tiver.

## Impact

**Código:** `IntervalsIcuClient` (+ `IntervalsIcuClientImpl`), `IcuActivityIntervalDto` (novo),
`IntervalsIcuActivityMapper`, `IntervalsIcuActivityIngestionServiceImpl`,
`IntervalsIcuActivityPersister`, `IntervalsIcuActivityController` (+1 endpoint de backfill).

**Migration:** NENHUMA. `tb_etapa_realizada` existe desde V14 e já tem `split_index`,
`distancia_km`, `pace_media`, `fc_media`, `fc_max`, `cadencia_media`, `potencia_media`,
`elevacao_ganho_metros`, `elevacao_perda_metros`, `tipo_etapa`.

**Contrato de API (front):** `TreinoRealizadoOutputDto.etapasRealizadas` já existe e já é serializado
— nenhum campo novo. O front passa a **receber conteúdo** onde hoje recebe lista vazia. Nenhuma
mudança no cliente gerado.

**Custo de rede:** +1 chamada HTTP por atividade importada. Sob a change ativa
`intervals-icu-activity-sync-scheduler` isso vira +1 por atividade × N atletas por ciclo — o dobro
de chamadas ao intervals.icu. Ver Riscos.

## Critérios de aceite

- **CA1 — Etapas persistidas no import**
  - **Given** uma atividade de corrida no intervals.icu com laps no payload
  - **When** o coach importa a atividade
  - **Then** o `TreinoRealizado` é criado com uma `EtapaRealizada` por lap, com `ordem` sequencial
    a partir de 1, `splitIndex` preenchido, e `distanciaKm`/`duracao`/`fcMedia` mapeados

- **CA2 — Atividade sem laps não quebra**
  - **Given** uma atividade cujo payload de intervalos vem vazio ou ausente
  - **When** o coach importa a atividade
  - **Then** o treino é criado normalmente com `etapasRealizadas` vazio, sem erro

- **CA3 — Falha na busca de laps não derruba o import**
  - **Given** o intervals.icu responde 429 ou timeout **apenas** à chamada de intervalos
  - **When** o coach importa a atividade
  - **Then** o treino é criado com o summary e sem etapas, a resposta é 200, e um WARN + métrica
    registram a degradação

- **CA4 — A chamada de laps acontece fora de transação**
  - **Given** o fluxo de import
  - **When** a busca de intervalos é executada
  - **Then** ela ocorre no orquestrador não-transacional, antes de `persister.persistir` — nenhuma
    conexão de banco é mantida durante o IO externo

- **CA5 — Dedup preservado**
  - **Given** uma atividade já importada
  - **When** o coach importa de novo
  - **Then** o guard de idempotência (passo 0) retorna o registro existente **sem** fazer nenhuma
    das duas chamadas HTTP

- **CA6 — Isolamento cross-atleta preservado**
  - **Given** uma atividade cujo `athleteId` não bate com o `externalAthleteId` da conexão
  - **When** o import é tentado
  - **Then** a resposta é 404 e a chamada de intervalos **não** é feita

- **CA8 — Backfill completa treinos sem etapas**
  - **Given** um atleta com treinos intervals.icu sem etapas — uns importados antes desta change,
    outros cujo lap fetch falhou com `lapsStatus=FAILED`
  - **When** o coach dispara o backfill de etapas para esse atleta
  - **Then** cada treino do conjunto recebe suas etapas via UPDATE, sem passar pelo guard de dedup
  - **And** treinos marcados `lapsStatus=EMPTY` são pulados, sem chamada de rede
  - **And** rodar o backfill de novo é no-op para os já corrigidos

- **CA7 — As skills de análise deixam de degradar**
  - **Given** um treino longo importado do intervals.icu com laps
  - **When** `LongRunAnalysisSkill` é executada
  - **Then** ela usa o caminho de `EtapaRealizadaResumo` (drift de FC e progressão de pace
    calculados), não o fallback de agregado

## Métrica de sucesso

- **Cobertura de etapas:** ≥ 90% dos `TreinoRealizado` com `fonteDados=INTERVALS_ICU` importados
  após a change têm `etapasRealizadas` não-vazio, medido sobre atividades cujo payload contém laps.
  **Segmentada por tenant/assessoria** — é o instrumento que torna a lacuna histórica observável
  (Open Question #5) em vez de dependente de reclamação.
- **Paridade de análise:** taxa de fallback degradado em `LongRunAnalysisSkill` /
  `IntervalWorkoutAnalysisSkill` para treinos intervals.icu cai de 100% para o mesmo patamar do
  Strava.

Com as duas acima atingidas, o treinador deixa de precisar sair do produto para ver o desdobramento
de um treino — consequência esperada, não uma terceira métrica (não há telemetria de navegação fora
do produto, e não vale construir uma só para isto).

## Open Questions & Assumptions

**Premissas assumidas (a validar no DoR / smoke):**

1. **O intervals.icu expõe laps por activity numa chamada separada.** Presumido
   `GET /api/v1/activity/{id}/intervals`, com o corpo trazendo a lista de intervalos (e possivelmente
   grupos). **NÃO VERIFICADO** — a doc pública é Swagger UI renderizada por JS e não foi possível
   ler o schema. É o mesmo tipo de incerteza que a change anterior resolveu com smoke contra payload
   real (gate 3.0, 2026-07-16, atleta `i641775`, activity `i166338796`) e que produziu dois bugs
   reais (cadência de perna única, `average_speed` em m/s). **Bloqueador de DoR: o path e os nomes
   de campo têm de ser confirmados contra um payload real antes de escrever o DTO.**
2. **Cadência do lap segue a mesma convenção do summary** (passos/min de uma perna, dobrar). Mesma
   fonte, mas a confirmar no mesmo smoke — não assumir por simetria.
3. **Distância do lap vem em metros e duração em segundos**, como no summary.
4. **O intervals.icu classifica o tipo do intervalo** (aquecimento/trabalho/recuperação) quando a
   atividade veio de um treino estruturado. Se sim, `tipoEtapa` pode ser preenchido melhor que no
   Strava (que só numera laps). Se não vier, `tipoEtapa` fica null — não inventar heurística nesta
   change.

**Em aberto:**

5. ~~**Backfill dos treinos já importados.**~~ **RESOLVIDO** (pre-mortem HIGH + product review #2):
   deixou de ser open question e virou escopo — o endpoint de backfill do D9 cobre tanto o histórico
   quanto as falhas, porque os dois casos têm a mesma assinatura em banco (`INTERVALS_ICU` +
   `etapasRealizadas` vazio). A métrica de cobertura por assessoria continua sendo o instrumento que
   diz **quando** rodar.
6. ~~**Uma atividade cuja busca de laps falhou fica permanentemente sem etapas.**~~ **RESOLVIDO**
   pelo mesmo D9 — "permanente" era a premissa errada. O gatilho de **> 5%** de falha na amostra
   (task 0.6) permanece, mas agora decide outra coisa: se o backfill manual do coach basta, ou se o
   volume de falhas exige promovê-lo a job agendado.
7. **`lapsStatus` em `metadadosSincronizacao` (TEXT) é filtrado em memória**, não em SQL. Aceitável
   no volume do pilot; se crescer, promover a coluna própria com migration. Change própria.

## Riscos e mitigações

- **Contrato externo não verificado** (ALTO): o DTO pode ser escrito contra um schema imaginado.
  Mitigação: smoke contra payload real é gate de DoR, não de QA — o mesmo protocolo que pegou os
  dois bugs de unidade da change anterior.
- **Dobro de chamadas ao intervals.icu** (MÉDIO): sob o scheduler em lote, o consumo de rate limit
  dobra. Mitigação: quantificar no design a partir do custo por ciclo já estimado na change do
  scheduler; a falha não-fatal (CA3) garante que estourar o limite degrada, não quebra.
- **Regressão no caminho que hoje funciona** (MÉDIO): o import de summary está em produção e não
  pode quebrar. Mitigação: CA2 e CA3 são testes explícitos de que a ausência ou falha de laps
  preserva exatamente o comportamento atual.
- **Interferência com `intervals-icu-activity-sync-scheduler`** (MÉDIO→ALTO após o pre-mortem): além
  de tocarem o mesmo pipeline, as duas agora compartilham **semântica de falha**. O scheduler aborta
  o lote em rate-limit para não avançar o cursor; esta change deixa um 429 de laps passar como
  sucesso. Sem o D9, essa combinação produzia perda permanente de etapas. Mitigação: D9 + declarar a
  ordem de merge no `/implement init`; quem chegar depois resolve o conflito em
  `IntervalsIcuActivityPersister`.
- **`LazyInitializationException` em `etapasRealizadas`** (MÉDIO): a coleção é `FetchType.LAZY` e já
  causou falha real nesta mesma capability (ver `archive/.../intervals-icu-activity-ingestion/tasks.md:438`
  — o passo 0 de dedup retorna um treino e o `TreinoMapper.toOutputDto` acessa a coleção lazy).
  Agora que a coleção deixa de ser sempre vazia, o risco fica maior. Mitigação: teste de integração
  cobrindo o caminho de re-import (passo 0) com etapas presentes.

## Non-goals

- Splits fixos de 1 km derivados de streams (decisão de escopo do founder, 2026-08-02).
- Streams/samples por segundo.
- **Job agendado** de backfill — o D9 entrega a ação manual do coach; automatizar depende de medir o
  volume de falhas primeiro (Open Question #6).
- Promover `lapsStatus` a coluna própria com migration (Open Question #7).
- Qualquer mudança no caminho Strava — incluindo mover o `attachLaps` dele para fora da transação.
  A dívida fica documentada, não é corrigida aqui.
- Mudança no contrato de API consumido pelo front.

## Referências

- Bug de origem: `IntervalsIcuActivityIngestionServiceImpl` — investigação 2026-08-02.
- Non-goal que esta change fecha: `archive/2026-07/2026-07-16-intervals-icu-activity-ingestion/proposal.md:148`.
- Referência de implementação: `StravaActivityServiceImpl.attachLaps` / `mapToEtapaRealizada`.
- Change ativa relacionada: `intervals-icu-activity-sync-scheduler`.
