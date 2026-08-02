# Proposal: intervals-icu-activity-laps

**Tamanho:** M · **Trilha:** Full (backend-only, **uma migration aditiva** — `V74`, três colunas
nullable em `tb_etapa_realizada` para zona, intensidade e inclinação por volta. O contrato de laps
já está verificado contra payload real, mas a mudança de schema mantém a trilha Full pelo critério
do `config.yaml`)

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
- **Correção de premissa do founder (2026-08-02), durante o `/implement init`:** não existe endpoint
  separado de laps — é `GET /api/v1/activity/{id}?intervals=true`, o mesmo endpoint já usado. A
  segunda chamada HTTP, em torno da qual boa parte do design e das duas revisões girava, **nunca
  existiu**. Consequências: custo de rede zero em vez de +100%; o achado HIGH #1 do Codex resolvido
  por construção e não por mitigação; `lapsStatus` e a métrica de falha de laps deletados; D9
  reduzido à lacuna histórica; assinaturas de `persistir` e do orquestrador inalteradas. **A change
  ficou menor e mais segura.** Registro da lição em design.md, Pre-mortem, hipótese 0.
- **Bloco 0 fechado (2026-08-02)** com payload real (atleta `i641775`, activity `i171415754`) e
  validação cruzada contra o export CSV da mesma activity. Quatro correções de contrato e uma
  armadilha de carga de treino evitada — ver design.md D2/D4.
- **Escopo ampliado por decisão do founder (2026-08-02):** zona, intensidade e inclinação por volta
  entram na change, com a migration `V74`. A change deixa de ser "sem migration"; a trilha continua
  Full (agora também pelo critério de mudança de schema). Ver design D10.

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

> **Correção de premissa (founder, 2026-08-02):** a versão anterior deste documento presumia um
> endpoint separado de laps, por simetria com o Strava. **Não existe.** Os intervalos vêm no mesmo
> payload da activity: `GET /api/v1/activity/{id}?intervals=true`. Isso derruba metade do que estava
> desenhado aqui — e derruba junto os problemas que esse desenho criava.

- **`IntervalsIcuClient.buscarAtividade`**: ganha o parâmetro `comIntervalos`. **Nenhum método novo,
  nenhuma chamada HTTP a mais.**
- **`IcuActivityIntervalDto`** (novo record, `dto/intervalsicu/`): contrato de um intervalo, com
  `@JsonIgnoreProperties(ignoreUnknown = true)`, seguindo o padrão de `IcuActivityDto`.
- **`IcuActivityDto`**: ganha o campo de lista dos intervalos (nome a confirmar no smoke).
- **`IntervalsIcuActivityMapper`**: novo `mapEtapas(...)` chamado de dentro de `map(dto, atleta)` —
  o treino já sai do mapper com as etapas anexadas. Sanitização isolada da do Strava (mesma regra da
  cadência: a fórmula pode coincidir, o código não acopla).
- **`IntervalsIcuActivityIngestionServiceImpl` e `IntervalsIcuActivityPersister`**: praticamente
  inalterados. As etapas persistem por `cascade = CascadeType.ALL` (`TreinoRealizado.java:107`).
- **Backfill de etapas** (`POST .../activities/backfill-laps`): ação do coach que completa os treinos
  intervals.icu importados **antes** desta change, que o guard de dedup impede de corrigir por
  re-import. É um **UPDATE** que grava só as etapas — não sobrescreve o summary.
- **Zona, intensidade e inclinação por volta** (decisão do founder, 2026-08-02): migration `V74` com
  três colunas nullable em `tb_etapa_realizada`, mais os campos no `EtapaRealizada`, no mapper e no
  `EtapaRealizadaOutputDto`. São as colunas que dizem *o que aquela volta foi* — o treinador já as vê
  no intervals.icu, e o dado chega de graça no payload que a change passa a buscar. Ver design D10.

## Capabilities

### Modified Capabilities
- `intervals-icu-ingestion`: a atividade importada passa a trazer também as etapas (laps/intervalos)
  como `EtapaRealizada`, quando o payload as tiver.

## Impact

**Código:** `IntervalsIcuClient` (+ `IntervalsIcuClientImpl`), `IcuActivityIntervalDto` (novo),
`IntervalsIcuActivityMapper`, `IntervalsIcuActivityIngestionServiceImpl`,
`IntervalsIcuActivityPersister`, `IntervalsIcuActivityController` (+1 endpoint de backfill).

**Migration:** `V74__add_zone_intensity_gradient_to_tb_etapa_realizada.sql` — aditiva, três colunas
nullable, rollback documentado. Os demais campos já existem: `split_index`, `distancia_km`,
`pace_media`, `fc_media`, `fc_max`, `cadencia_media`, `potencia_media`, `elevacao_ganho_metros`,
`tipo_etapa` (V14) e os running dynamics (V53).

**Contrato de API (front):** `TreinoRealizadoOutputDto.etapasRealizadas` já existe e já é
serializado; o front passa a **receber conteúdo** onde hoje recebe lista vazia.
`EtapaRealizadaOutputDto` ganha três campos aditivos (`zone`, `intensityPct`, `avgGradientPct`) com
`@JsonInclude(NON_NULL)` — nada quebra no cliente gerado. Exibi-los na UI é trabalho separado.

**Custo de rede:** **zero chamadas adicionais** — mesmo endpoint, mesmo número de requisições de
hoje, um query param a mais. O corpo da resposta fica maior; confirmar no smoke que o read timeout
de 10s continua folgado.

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

- **CA3 — Comportamento de erro do import inalterado**
  - **Given** o intervals.icu responde com erro (401, 404, 429, 5xx, timeout)
  - **When** o coach importa a atividade
  - **Then** a resposta é exatamente a de hoje — os intervalos virem no mesmo payload não introduz
    nenhum modo de falha parcial

- **CA4 — Custo de rede inalterado**
  - **Given** um import de atividade
  - **When** o fluxo executa
  - **Then** exatamente **uma** chamada ao intervals.icu é feita, como hoje

- **CA5 — Dedup preservado**
  - **Given** uma atividade já importada
  - **When** o coach importa de novo
  - **Then** o guard de idempotência (passo 0) retorna o registro existente **sem** chamada HTTP

- **CA6 — Isolamento cross-atleta preservado**
  - **Given** uma atividade cujo `athleteId` não bate com o `externalAthleteId` da conexão
  - **When** o import é tentado
  - **Then** a resposta é 404 e nada é persistido

- **CA8 — Backfill completa treinos sem etapas**
  - **Given** um atleta com treinos intervals.icu importados antes desta change, portanto sem etapas
  - **When** o coach dispara o backfill de etapas para esse atleta
  - **Then** cada treino do conjunto recebe suas etapas via UPDATE, sem passar pelo guard de dedup
  - **And** o summary do treino não é sobrescrito
  - **And** rodar o backfill de novo é no-op para os já corrigidos

- **CA9 — Zona, intensidade e inclinação persistidas por volta**
  - **Given** uma atividade cujos intervalos trazem `zone`, `intensity` e `average_gradient`
  - **When** o coach importa a atividade
  - **Then** cada etapa grava `zone` e `intensityPct` diretos
  - **And** `avgGradientPct` é gravado em **percentual**, convertido da fração da origem
    (`0.0011977` → `0.1`)
  - **And** os três campos aparecem no `EtapaRealizadaOutputDto`

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

1. ~~**O intervals.icu expõe laps numa chamada separada.**~~ **PREMISSA DERRUBADA** pelo founder
   (2026-08-02): é `GET /api/v1/activity/{id}?intervals=true` — mesmo endpoint, um query param. Toda
   a estrutura de "segunda chamada" que estava desenhada aqui caiu junto. **O que resta não
   verificado:** o nome do campo que carrega a lista no corpo (`icu_intervals`?) e a forma de cada
   item. **Bloqueador de DoR mantido: os nomes de campo e as unidades têm de ser confirmados contra
   um payload real antes de escrever o DTO** — é o gate que pegou os dois bugs de unidade da change
   anterior (cadência de perna única, `average_speed` em m/s).
2. **Cadência do lap segue a mesma convenção do summary** (passos/min de uma perna, dobrar). Mesma
   fonte, mas a confirmar no mesmo smoke — não assumir por simetria.
3. **Distância do lap vem em metros e duração em segundos**, como no summary.
4. **O intervals.icu classifica o tipo do intervalo** (aquecimento/trabalho/recuperação) quando a
   atividade veio de um treino estruturado. Se sim, `tipoEtapa` pode ser preenchido melhor que no
   Strava (que só numera laps). Se não vier, `tipoEtapa` fica null — não inventar heurística nesta
   change.

**Em aberto:**

5. ~~**Backfill dos treinos já importados.**~~ **RESOLVIDO** (pre-mortem HIGH + product review #2):
   deixou de ser open question e virou escopo — o endpoint de backfill do D9. A métrica de cobertura
   por assessoria continua sendo o instrumento que diz **quando** rodar.
6. ~~**Uma atividade cuja busca de laps falhou fica permanentemente sem etapas.**~~ **DEIXOU DE
   EXISTIR** com a correção de premissa: com uma chamada só, ou o import inteiro falha (e é
   reprocessado), ou vem completo. Não há estado parcial. O gatilho de >5% de falha some junto — não
   há falha de laps para medir.
7. **O backfill reconsulta, a cada execução, as activities que genuinamente não têm intervalos** —
   não há marcador que as distinga das ainda não corrigidas. Aceito: operação manual, passivo finito,
   uma chamada por treino. Não vale um campo de estado novo.

## Riscos e mitigações

- **Contrato externo não verificado** (ALTO): o DTO pode ser escrito contra um schema imaginado.
  Mitigação: smoke contra payload real é gate de DoR, não de QA — o mesmo protocolo que pegou os
  dois bugs de unidade da change anterior.
- ~~**Dobro de chamadas ao intervals.icu**~~ (ELIMINADO pela correção de premissa): o número de
  requisições não muda. Resta conferir no smoke se o corpo maior cabe folgado no read timeout de 10s.
- **Regressão no caminho que hoje funciona** (MÉDIO): o import de summary está em produção e não
  pode quebrar. Mitigação: CA2 e CA3 são testes explícitos de que a ausência ou falha de laps
  preserva exatamente o comportamento atual.
- **Interferência com `intervals-icu-activity-sync-scheduler`** (MÉDIO): as duas tocam o mesmo
  pipeline. O conflito de **semântica de falha** que o pre-mortem levantou desapareceu com a correção
  de premissa — com uma chamada só, o scheduler continua abortando o lote e não avançando o cursor,
  sem estado parcial possível. Resta o conflito textual: declarar a ordem de merge no
  `/implement init`; quem chegar depois resolve em `IntervalsIcuActivityMapper`.
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
- Marcar em banco quais activities genuinamente não têm intervalos, para o backfill pulá-las
  (Open Question #7).
- **Exibir zona, intensidade e inclinação na UI** — a V74 e o DTO entregam o dado; o front é change
  própria.
- Replicar zona/intensidade/inclinação em `tb_treino_realizado` (nível de sessão) — sem caso de uso.
- Qualquer mudança no caminho Strava — incluindo mover o `attachLaps` dele para fora da transação.
  A dívida fica documentada, não é corrigida aqui.
- Mudança no contrato de API consumido pelo front.

## Referências

- Bug de origem: `IntervalsIcuActivityIngestionServiceImpl` — investigação 2026-08-02.
- Non-goal que esta change fecha: `archive/2026-07/2026-07-16-intervals-icu-activity-ingestion/proposal.md:148`.
- Referência de implementação: `StravaActivityServiceImpl.attachLaps` / `mapToEtapaRealizada`.
- Change ativa relacionada: `intervals-icu-activity-sync-scheduler`.
