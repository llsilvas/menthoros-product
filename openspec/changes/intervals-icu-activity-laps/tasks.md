# Tasks: intervals-icu-activity-laps

Ordem de execução TDD (teste primeiro, sempre). Em `apps/menthoros-backend`:

- **Inner loop (blocos 1–6, tudo `*Test`):** `./mvnw clean test`.
- **Gate de entrega (blocos 7–8):** `./mvnw clean verify` — `test` sozinho **não** roda nenhum
  `*IT`. O gate está **verde** em `develop` desde o PR #59 (`fix-reconciliation-it-auth`), então
  qualquer falha no `verify` é desta change. Ao escrever `*IT`: `@WithMockUser` não produz um `Jwt`,
  logo o `JwtTenantFilter` não popula o `TenantContext` e todo request responde 403 — autenticar com
  JWT real, subject UUID com `Usuario` semeado e authorities explícitas.

Branch: `feature/intervals-icu-activity-laps` no repo `apps/menthoros-backend` — criar **antes** de
qualquer código.

---

## 0. Gate de DoR — smoke contra a API real (BLOQUEADOR)

Nada abaixo pode começar antes deste bloco fechar. É o gate que pegou os dois bugs de unidade da
change anterior (cadência de perna única, `average_speed` em m/s).

Endpoint **já confirmado** pelo founder: `GET /api/v1/activity/{id}?intervals=true` — mesmo endpoint
do import de hoje, um query param. Falta o contrato do corpo.

- [x] 0.1 ~~Confirmar o path real~~ — resolvido: `?intervals=true`, sem chamada separada.
- [ ] 0.2 Capturar o **payload real** de duas activities: uma corrida contínua com auto-lap e uma
      vinda de treino estruturado (com blocos). Salvar os dois JSONs como fixtures de teste.
- [ ] 0.3 Registrar o **nome do campo** que carrega a lista no corpo da activity (`icu_intervals`?) e
      se ele vem ausente ou nulo quando não há intervalos.
- [ ] 0.4 Preencher a tabela de contrato: para cada campo de D2, **existe? nome exato? unidade?**.
      Corrigir `design.md` D2/D4 com o que divergir.
- [ ] 0.5 Responder as premissas 2, 3 e 4 do proposal: cadência é de perna única? distância em
      metros? o payload classifica o tipo do intervalo?
- [ ] 0.6 Medir o **tamanho do corpo e a latência** com `intervals=true` — confirmar que o read
      timeout de 10s do `IntervalsIcuWebClientConfig` continua folgado.
- **Validação:** `design.md` D2/D4 atualizados com dados reais; fixtures commitadas.

## 1. DTO do intervalo

- [ ] 1.1 Teste primeiro: desserialização do fixture real (0.2) em `IcuActivityIntervalDto` — todos
      os campos esperados preenchidos, campo desconhecido no JSON não quebra.
- [ ] 1.2 Criar `dto/intervalsicu/IcuActivityIntervalDto.java` como `record` com
      `@JsonIgnoreProperties(ignoreUnknown = true)` e `@JsonProperty` conforme 0.3.
- **Validação:** `./mvnw clean test`

## 2. Client — query param `intervals=true`

- [ ] 2.1 Teste primeiro (`IntervalsIcuClientImplTest`): a URI da chamada inclui `intervals=true`
      quando `comIntervalos` é verdadeiro, e não inclui quando falso.
- [ ] 2.2 Teste primeiro: desserialização da activity com intervalos preenche o novo campo; activity
      sem o campo → nulo, sem NPE.
- [ ] 2.3 Teste primeiro: erro HTTP (404, 429, 500) → `IntervalsIcuApiException` com o status
      preservado (comportamento atual, não pode regredir).
- [ ] 2.4 Alterar `buscarAtividade` em `IntervalsIcuClient` para
      `buscarAtividade(apiKey, activityId, comIntervalos)` e implementar em `IntervalsIcuClientImpl`
      (`:135-142`), acrescentando o query param ao `uri(...)` e mantendo `executa(...)` e
      `basic(h, apiKey)`. **Trocar a assinatura, não sobrecarregar** (D7) — o compilador aponta cada
      chamador.
- [ ] 2.5 Acrescentar o campo de lista de intervalos a `IcuActivityDto` e atualizar todos os pontos
      que constroem o record à mão (o construtor canônico muda) — fixtures e
      `IntervalsIcuActivityMapperTest`.
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
- [ ] 3.7 Teste primeiro: `map(dto, atleta)` devolve o treino **já com** as etapas anexadas e com o
      back-reference `treinoRealizado` setado em cada uma (D6).
- [ ] 3.8 Implementar `mapEtapas(...)` em `IntervalsIcuActivityMapper` e chamá-lo de dentro de
      `map(dto, atleta)`, reusando os helpers privados do próprio mapper — **sem** chamar
      `StravaActivityServiceImpl`.
- **Validação:** `./mvnw clean test`

## 4. Persister — persistência por cascade (assinatura inalterada)

- [ ] 4.1 Teste primeiro (`IntervalsIcuActivityPersisterTest`): as etapas que vêm do mapper são
      persistidas junto com o treino, sem `EtapaRealizadaRepository` — `cascade = CascadeType.ALL`
      (`TreinoRealizado.java:107`).
- [ ] 4.2 Teste primeiro: ramo `inserted == false` (corrida de concorrência) não duplica etapas no
      registro vencedor (D6).
- [ ] 4.3 Teste primeiro: activity sem intervalos preserva exatamente o comportamento atual — treino
      salvo, nenhum side effect novo.
- [ ] 4.4 Confirmar que **nenhuma alteração** foi necessária em `IntervalsIcuActivityPersister`. Se
      alguma for, é sinal de que o mapper não está completando o treino como o D6 prevê.
- **Validação:** `./mvnw clean test`

## 5. Orquestrador — atualizar o ponto de chamada

Bloco pequeno de propósito: com uma chamada só, o orquestrador quase não muda.

- [ ] 5.1 Teste primeiro: dedup do passo 0 retorna o registro existente **sem nenhuma** chamada HTTP
      (CA5).
- [ ] 5.2 Teste primeiro (CA4): exatamente **uma** chamada ao intervals.icu por import — nenhuma
      requisição extra foi introduzida.
- [ ] 5.3 Teste primeiro (CA3): o comportamento de erro do import não regride — 401/403, 404, 422 e
      429 continuam mapeados como hoje (`IntervalsIcuActivityIngestionServiceImpl:128-150`).
- [ ] 5.4 Atualizar a chamada a `buscarAtividade` para passar `comIntervalos=true`.
- [ ] 5.5 Verificar que nenhuma anotação `@Transactional` foi introduzida no caminho da chamada
      externa.
- **Validação:** `./mvnw clean test`

## 5b. Backfill de etapas (D9 — lacuna histórica)

Cobre os treinos intervals.icu importados **antes** desta change, que o guard de dedup impede de
corrigir por re-import. O caso "lap fetch falhou" deixou de existir com a correção de premissa.

- [ ] 5b.1 Teste primeiro: o conjunto de candidatos é `fonteDados=INTERVALS_ICU` **e**
      `etapasRealizadas` vazio, do atleta e tenant informados — treinos de outro tenant nunca entram.
- [ ] 5b.2 Teste primeiro (CA8): treino candidato recebe as etapas via UPDATE, sem passar pelo guard
      de dedup e sem criar um `TreinoRealizado` novo.
- [ ] 5b.3 Teste primeiro: o **summary não é sobrescrito** — distância, pace, FC e descrição do
      treino permanecem como estavam, mesmo que o payload traga valores diferentes.
- [ ] 5b.4 Teste primeiro: idempotência — segunda execução é no-op para os já corrigidos.
- [ ] 5b.5 Teste primeiro: falha na chamada de um treino não aborta os demais; aquele treino segue
      elegível na próxima execução.
- [ ] 5b.6 Teste primeiro: as chamadas de rede do backfill ocorrem **fora de transação** — a
      persistência de cada treino é sua própria transação curta.
- [ ] 5b.7 Nova query em `TreinoRealizadoRepository` para os candidatos — o repositório hoje só tem
      lookup por `externalId` (`:33`, `:49`), nada por atleta + fonte + ausência de etapas. Query
      tenant-scoped, com `LEFT JOIN`/`NOT EXISTS` sobre `tb_etapa_realizada`.
- [ ] 5b.8 Implementar o serviço de backfill e o endpoint
      `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-laps` em
      `IntervalsIcuActivityController` (`@RequestMapping("/api/v1/intervals-icu")`, `:30`), espelhando
      o endpoint de import (`:36-49`): `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")`,
      `@Operation`, `@ApiResponses` e DTO de saída tipado (nunca `Map<String,Object>`).
- **Validação:** `./mvnw clean test`

## 6. Observabilidade

A métrica de falha de laps foi **deletada** com a correção de premissa — não há falha de laps
independente para contar. Resta o instrumento de cobertura.

- [ ] 6.1 Expor a **cobertura de etapas segmentada por tenant/assessoria** (métrica de sucesso do
      proposal) no registry Micrometer já existente — é o que torna a lacuna histórica observável em
      vez de dependente de reclamação do coach. Sem dependência nova, sem circuit breaker (ADR-0008).
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
- [ ] 8.3 Com a cobertura por assessoria em mãos, confirmar que o backfill manual do coach dá conta
      do passivo histórico e registrar a decisão no proposal.
- [ ] 8.4 `/pr intervals-icu-activity-laps` — PR para `develop`, sem merge local.
- **Validação:** CI verde e `./mvnw clean verify` local **sem nenhuma falha** — o gate está verde em
  `develop`, então qualquer vermelho é desta change.
