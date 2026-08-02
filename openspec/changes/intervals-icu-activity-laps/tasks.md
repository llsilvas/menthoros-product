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
- [x] 0.2 Payload real capturado (atleta `i641775`, activity `i171415754`, 17 intervalos). Fixture
      enxuta em `src/test/resources/fixtures/intervalsicu/activity-com-intervalos.json`.
- [x] 0.3 Campo confirmado: **`icu_intervals`**, lista nua dentro da activity. Sem o query param a
      chave **nem existe** no corpo.
- [x] 0.4 Tabela de contrato preenchida — ver `design.md` D2. Correções relevantes: `id` é opaco (não
      ordena), `total_elevation_loss` não existe, running dynamics vêm preenchidos, oscilação
      vertical em **mm** (converter para cm).
- [x] 0.5 Premissas 2, 3 e 4 confirmadas: cadência de perna única, distância em metros, `type`
      classifica o intervalo (`WORK`/`RECOVERY`).
- [x] 0.6 Medido: 4.649 → 44.072 bytes (9,5×) e 0,69 s. Read timeout de 10 s com folga larga.
- [ ] 0.7 **Pendente, não bloqueante:** capturar uma activity vinda de treino estruturado para
      confirmar se `label` vem preenchido e se `WARMUP`/`COOLDOWN` existem (D5). O ramo
      "desconhecido → null" cobre a ausência.
- **Validação:** `design.md` D2/D4/D5 atualizados com dados reais; fixture commitada.

## 0b. Migration V74 — zona, intensidade e inclinação (D10)

- [x] 0b.1 `V74__add_zona_intensidade_inclinacao_tb_etapa_realizada.sql` — aditiva, três colunas
      nullable (`zona INTEGER`, `intensidade_pct NUMERIC(5,2)`, `inclinacao_media_pct NUMERIC(4,1)`),
      `ADD COLUMN IF NOT EXISTS`, rollback no cabeçalho. Nomes em PT seguindo a tabela (desvio
      deliberado do ADR-0007, ver D10).
- [x] 0b.2 Campos correspondentes em `EtapaRealizada` (`zona`, `intensidadePct`, `inclinacaoMediaPct`).
- [x] 0b.3 Campos aditivos em `EtapaRealizadaOutputDto` — MapStruct casa por nome, sem `@Mapping`.
- [x] 0b.4 `./mvnw clean compile` — verde.
- [x] 0b.5 V74 aplicada no banco local (o banco estava na V72; o Flyway subiu V73 e V74 limpo).
      Tipos conferidos: `zona` integer, `intensidade_pct` numeric(5,2), `inclinacao_media_pct` numeric(4,1).
- **Validação:** `./mvnw clean compile` e Flyway aplicando a V74 limpo.

## 1. DTO do intervalo

- [x] 1.1 `IcuActivityIntervalDtoTest` — 5 testes contra o payload real: campos do intervalo,
      running dynamics, zona/intensidade/inclinação (fração), campo desconhecido ignorado, e os 17
      intervalos com o degenerado no índice 1.
- [x] 1.2 `IcuActivityIntervalDto` criado como `record` com `@JsonIgnoreProperties(ignoreUnknown = true)`.
      As três conversões de unidade estão documentadas no javadoc do record, não só no design.
- [x] 1.3 `IcuActivityDto` ganhou `icu_intervals` e `icu_lap_count` (antecipa a task 2.5 — o teste do
      bloco 1 já exige o campo). Os 21 pontos de construção posicional nos testes foram atualizados.
- **Validação:** `./mvnw clean test`

## 2. Client — query param `intervals=true`

- [x] 2.1 `IntervalsIcuClientImplTest` — `comIntervalos=true` acrescenta `?intervals=true`; `false`
      não acrescenta (verificado com `wireMock.verify` sobre a URL exata).
- [x] 2.2 Activity com intervalos desserializa `icu_intervals` e `icu_lap_count`; sem o campo no
      corpo, ambos vêm nulos, sem NPE.
- [x] 2.3 Erros HTTP preservam o status no `IntervalsIcuApiException`. **Achado:** os stubs de erro
      usavam `urlEqualTo` sem query — com o param nenhum casava e o WireMock devolvia 404 por
      default. O teste de 403 quebrou e o de 404 **passava pelo motivo errado**; ambos corrigidos.
- [x] 2.4 Assinatura trocada para `buscarAtividade(apiKey, activityId, comIntervalos)`, sem
      sobrecarga. O compilador apontou o único chamador de produção
      (`IntervalsIcuActivityIngestionServiceImpl:130`), que passa `true`.
- **Validação:** `./mvnw clean test`

## 3. Mapper — intervalo → EtapaRealizada

- [x] 3.1 Métricas básicas da primeira volta do payload real (distância, duração, FC, tipo, descrição).
- [x] 3.2 Unidades: velocidade m/s → km/h (9,30) e cadência de perna única dobrada (163), com
      sanitização 60–200.
- [x] 3.3 `ordem` e `splitIndex` da posição 1-based, nunca do `id` opaco.
- [x] 3.4 Pace de `movingTime/distância`. **Achado:** o fallback por `average_speed` é
      **inalcançável** para etapas — o filtro de descarte já exige distância ≥ 20 m e duração ≥ 5 s,
      então o caminho primário nunca falha. O teste passou a cobrir a volta com parada (397 s de
      movimento → 6:38), que bate com a coluna Ritmo do CSV; com `elapsed` daria 10:15.
- [x] 3.5 BVA do descarte: 5 s e 20 m exatos passam; 4 s, 19,9 m e o intervalo real de 1 s/2,4 m caem.
      Lista nula e vazia não quebram.
- [x] 3.6 `tipoEtapa` pela tabela do D5, com desconhecido/ausente/vazio → null.
- [x] 3.7 Running dynamics, com a conversão mm → cm da oscilação vertical (113,24 mm → 11,3 cm).
- [x] 3.8 `elevacaoPerdaMetros` null — a fonte não expõe perda por intervalo.
- [x] 3.8b `duracao` de `moving_time` (397, não 614) e `tempoMovimento` idem.
- [x] 3.8c Zona e intensidade diretas; inclinação de fração para percentual (0,0011977 → 0,1;
      −0,008186669 → −0,8).
- [x] 3.9 Back-reference: toda etapa aponta para o treino que a contém.
- [x] 3.10 Sanidade contra `icu_lap_count`: 17 intervalos → 16 etapas; divergência vai para DEBUG.
- [x] 3.11 `mapEtapas` implementado dentro de `map(dto, atleta)`, com helpers próprios do mapper.
- **Validação:** `./mvnw clean test` — 2344 testes, 0 falhas.

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
- [ ] 7.4 Teste primeiro (CA9): as colunas da V74 chegam gravadas em `tb_etapa_realizada` e voltam
      serializadas no `EtapaRealizadaOutputDto`.
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
