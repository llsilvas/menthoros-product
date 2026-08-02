# Tasks: intervals-icu-activity-laps

Ordem de execução TDD (teste primeiro, sempre). Em `apps/menthoros-backend`:

- **Inner loop (blocos 1–6, tudo `*Test`):** `./mvnw clean test`.
- **Gate de entrega (blocos 7–8):** `./mvnw clean verify` — `test` sozinho **não** roda nenhum
  `*IT`. Red conhecido em `develop`: 14 falhas em `Task5p1ControllerIT` (`@WithMockUser` não produz
  `Jwt`); confirmar que as falhas do `verify` são só essas.

Branch: `feature/intervals-icu-activity-laps` no repo `apps/menthoros-backend` — criar **antes** de
qualquer código.

---

## 0. Gate de DoR — smoke contra a API real (BLOQUEADOR)

Nada abaixo pode começar antes deste bloco fechar. É o gate que pegou os dois bugs de unidade da
change anterior (cadência de perna única, `average_speed` em m/s).

- [ ] 0.1 Confirmar o **path real** do endpoint de intervalos de uma activity no intervals.icu
      (presumido `GET /api/v1/activity/{id}/intervals`), usando a API key de um atleta de teste.
- [ ] 0.2 Capturar o **payload real** de duas activities distintas: uma corrida contínua com auto-lap
      e uma vinda de treino estruturado (com blocos). Salvar os dois JSONs como fixtures de teste.
- [ ] 0.3 Preencher a tabela de contrato: para cada campo de D2, registrar **existe? nome exato?
      unidade?**. Corrigir `design.md` D2/D4 com o que for divergente.
- [ ] 0.4 Responder as premissas 2, 3 e 4 do proposal: cadência é de perna única? distância em
      metros? o payload classifica o tipo do intervalo?
- [ ] 0.5 Registrar a **forma do envelope** (lista nua vs objeto com `icu_intervals`).
- [ ] 0.6 Medir a **taxa de falha** da chamada numa amostra. **Gatilho:** > 5% obriga a revisitar o
      design antes de fechar o DoR (retry na segunda chamada, ou re-sync forçado dentro desta
      change). ≤ 5% segue como risco aceito e observado.
- **Validação:** `design.md` D2/D4 atualizados com dados reais; fixtures commitadas.

## 1. DTO do intervalo

- [ ] 1.1 Teste primeiro: desserialização do fixture real (0.2) em `IcuActivityIntervalDto` — todos
      os campos esperados preenchidos, campo desconhecido no JSON não quebra.
- [ ] 1.2 Criar `dto/intervalsicu/IcuActivityIntervalDto.java` como `record` com
      `@JsonIgnoreProperties(ignoreUnknown = true)` e `@JsonProperty` conforme 0.3.
- **Validação:** `./mvnw clean test`

## 2. Client — busca de intervalos

- [ ] 2.1 Teste primeiro (`IntervalsIcuClientImplTest`): chamada ao path correto com a API key;
      envelope desembrulhado em `List<IcuActivityIntervalDto>`.
- [ ] 2.2 Teste primeiro: corpo vazio / lista ausente → lista vazia, sem NPE.
- [ ] 2.3 Teste primeiro: erro HTTP (404, 429, 500) → `IntervalsIcuApiException` com o status
      preservado.
- [ ] 2.4 Adicionar `buscarIntervalos(String apiKey, String activityId)` a `IntervalsIcuClient` e
      implementar em `IntervalsIcuClientImpl` (D7). Sem timeout novo — reusa
      `IntervalsIcuWebClientConfig`.
- **Validação:** `./mvnw clean test`

## 3. Mapper — intervalo → EtapaRealizada

- [ ] 3.1 Teste primeiro: mapeamento campo a campo do fixture real conforme a tabela de D4.
- [ ] 3.2 Teste primeiro — **unidades** (o bloco que pega os bugs históricos): `velocidadeMedia` em
      km/h a partir de m/s; `cadenciaMedia` dobrada e sanitizada em 60–200 (fora da faixa → null);
      `distanciaKm` = metros/1000 com scale 3.
- [ ] 3.3 Teste primeiro: `ordem` sequencial 1-based independente do `id` do payload; `splitIndex`
      vindo do `id` quando presente, do índice quando ausente.
- [ ] 3.4 Teste primeiro: `paceMedia` por `movingTime/distância`, com `averageSpeed` só como
      fallback (mesma prioridade de `calculatePace` — não inverter).
- [ ] 3.5 Teste primeiro: lista vazia → lista vazia; lista null → lista vazia; intervalo sem
      distância nem duração → descartado.
- [ ] 3.6 Teste primeiro: `tipoEtapa` normalizado quando o payload classifica; valor desconhecido →
      null; payload sem classificação → null em todas as etapas (D5).
- [ ] 3.7 Implementar `mapEtapas(List<IcuActivityIntervalDto>)` em `IntervalsIcuActivityMapper`,
      reusando os helpers privados do próprio mapper — **sem** chamar `StravaActivityServiceImpl`.
- **Validação:** `./mvnw clean test`

## 4. Persister — attach com cascade

- [ ] 4.1 Teste primeiro (`IntervalsIcuActivityPersisterTest`): etapas recebidas ficam com
      `treinoRealizado` back-referenciado e entram em `treino.getEtapasRealizadas()` antes do
      `saveIdempotent`.
- [ ] 4.2 Teste primeiro: ramo `inserted == false` (corrida de concorrência) **não** anexa etapas ao
      registro vencedor (D6).
- [ ] 4.3 Teste primeiro: lista de etapas vazia preserva exatamente o comportamento atual — treino
      salvo, nenhum side effect novo.
- [ ] 4.4 Alterar a assinatura de `persistir` para receber `List<EtapaRealizada> etapas` e fazer o
      attach. Sem repositório novo — `cascade = CascadeType.ALL` persiste as filhas.
- **Validação:** `./mvnw clean test`

## 5. Orquestrador — segunda chamada fora de transação

- [ ] 5.1 Teste primeiro (`IntervalsIcuActivityIngestionServiceImplTest`): a busca de intervalos
      ocorre **depois** dos guards de cross-atleta e de modalidade — activity de outro atleta ou de
      modalidade não suportada aborta **sem** chamar `buscarIntervalos` (CA6).
- [ ] 5.2 Teste primeiro: dedup do passo 0 retorna o registro existente sem fazer **nenhuma** das
      duas chamadas HTTP (CA5).
- [ ] 5.3 Teste primeiro (CA3): `buscarIntervalos` lança `IntervalsIcuApiException` (429 e timeout)
      → import prossegue, treino salvo sem etapas, resposta 200, WARN registrado.
- [ ] 5.4 Teste primeiro: falha de desserialização é logada em ERROR, não WARN (D3), e também não
      derruba o import.
- [ ] 5.5 Teste primeiro: `lapsStatus` gravado em `metadadosSincronizacao` conforme a tabela de
      classificação do D3 — `OK` com laps, `EMPTY` em 404 ou lista vazia, `FAILED` em 429/5xx/timeout
      e em falha de desserialização.
- [ ] 5.6 Implementar o passo 3b e `buscarIntervalosBestEffort` no orquestrador, passando as etapas
      mapeadas e o `lapsStatus` ao persister (D1, D3).
- [ ] 5.7 Verificar que nenhuma anotação `@Transactional` foi introduzida no caminho da chamada
      externa (CA4).
- **Validação:** `./mvnw clean test`

## 5b. Backfill de etapas (D9 — fecha os dois achados HIGH do pre-mortem)

Sem este bloco, um 429 de segundos vira perda permanente de etapas sob o scheduler. Não é opcional.

- [ ] 5b.1 Teste primeiro: o conjunto de candidatos é `fonteDados=INTERVALS_ICU` **e**
      `etapasRealizadas` vazio, do atleta e tenant informados — treinos de outro tenant nunca entram.
- [ ] 5b.2 Teste primeiro: treinos marcados `lapsStatus=EMPTY` são pulados **sem chamada de rede**.
- [ ] 5b.3 Teste primeiro (CA8): treino candidato recebe as etapas via UPDATE, sem passar pelo guard
      de dedup e sem criar um `TreinoRealizado` novo.
- [ ] 5b.4 Teste primeiro: idempotência — segunda execução é no-op para os já corrigidos.
- [ ] 5b.5 Teste primeiro: falha de laps durante o backfill de um treino não aborta os demais; o
      `lapsStatus` daquele treino permanece `FAILED` e ele segue elegível na próxima execução.
- [ ] 5b.6 Teste primeiro: as chamadas de rede do backfill ocorrem **fora de transação**, mesmo
      princípio do D1 — a persistência de cada treino é sua própria transação curta.
- [ ] 5b.7 Implementar o serviço de backfill e o endpoint
      `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-laps`, com `@Operation`,
      `@ApiResponses`, `@PreAuthorize` e DTO de saída tipado (nunca `Map<String,Object>`) — ver
      Controller Standards.
- **Validação:** `./mvnw clean test`

## 6. Observabilidade

- [ ] 6.1 Teste primeiro: contador `intervals_icu_laps_fetch_failure` incrementado com tag de status
      em cada falha da segunda chamada.
- [ ] 6.2 Registrar a métrica no registry Micrometer já existente — sem dependência nova, sem
      circuit breaker (ADR-0008).
- [ ] 6.3 Expor a **cobertura de etapas segmentada por tenant/assessoria** (métrica de sucesso do
      proposal) — é o instrumento que torna a lacuna do Open Question #5 observável em vez de
      dependente de reclamação do coach.
- **Validação:** `./mvnw clean test`

## 7. Integração

- [ ] 7.1 Teste primeiro (`IntervalsIcuActivityImportIntegrationTest`): import de ponta a ponta grava
      as linhas em `tb_etapa_realizada` com `ordem` sequencial e FK correta (CA1).
- [ ] 7.2 Teste primeiro: **re-import** de uma atividade que já tem etapas — o passo 0 retorna o
      registro e `TreinoMapper.toOutputDto` serializa as etapas **sem**
      `LazyInitializationException` (risco identificado no proposal; já falhou nesta capability).
- [ ] 7.3 Teste primeiro (CA7): treino longo importado com laps faz `LongRunAnalysisSkill` usar o
      caminho de `EtapaRealizadaResumo`, não o fallback de agregado.
- **Validação:** `./mvnw clean verify` — `IntervalsIcuActivityImportIntegrationTest` é `*Test`
  (Surefire), mas qualquer teste novo criado como `*IT` só roda em `verify`.

## 8. Fechamento

- [ ] 8.1 `/qa` — `code-reviewer` + `security-reviewer` + `test-master` (trilha Full).
- [ ] 8.2 Atualizar `design.md` com o que o smoke e a implementação revelaram (a change anterior
      registra que achados críticos só apareceram ao implementar, não ao revisar a spec).
- [ ] 8.3 Com o dado real de 0.6 e a cobertura por assessoria em mãos, decidir se o backfill manual
      do coach (D9) basta ou se o volume de falhas exige promovê-lo a job agendado — e registrar a
      decisão no proposal (Open Question #6).
- [ ] 8.4 `/pr intervals-icu-activity-laps` — PR para `develop`, sem merge local.
- **Validação:** CI verde e `./mvnw clean verify` local com as 14 falhas conhecidas de
  `Task5p1ControllerIT` como únicas — nenhuma falha nova.
