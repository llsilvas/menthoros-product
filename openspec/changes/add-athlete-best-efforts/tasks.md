# Tasks — add-athlete-best-efforts (L · Full · backend + front)

## 0. Discovery

- [x] **0.1** CONTRATO VERIFICADO (2026-09-17, activity i187587373) — registrado na seção
  "Contrato verificado" do design.md. `time` = inteiros cumulativos em segundos (elapsed, 1 Hz);
  `distance` = floats cumulativos em metros; response é uma lista, um objeto por tipo, com `type`+
  `data` (resto é metadata). ~38 KB por corrida de 50 min.
- [x] **0.2** Fixtures golden capturadas: i187587373 (contínua, 8011 m) e i172320214 (intervalada,
  8009 m, 96 s parado em 2 gaps de 34 s e 62 s). Caso de borda confirmado: tempo parado = gap no
  `time` (delta > 1 s), e a janela que cruza o gap infla o resultado — mitigação registrada no D2.
- [ ] **0.3** Confirmar no código: ponto de inserção na ingestão
  (`IntervalsIcuActivityIngestionServiceImpl`), o attach por cascade
  (`IntervalsIcuActivityMapper`/`Persister`), e o backfill de laps como molde.

## 1. Algoritmo de janela rolante (TDD, isolado)

- [ ] **1.1** `BestEffortCalculator` puro (input: arrays cumulativos time[]/distance[]; output:
  melhor tempo por distância alvo) — teste golden contra a fixture do 0.2 (CA6)
- [ ] **1.2** Casos de borda: activity mais curta que D; tempo parado; amostra irregular; distância
  não-monotônica
- [ ] **1.3** Distâncias alvo e labels (`400m`…`10k`) como constante testada
- [ ] Validação: `./mvnw test -Dtest=BestEffortCalculatorTest`

## 2. Persistência

- [ ] **2.1** Migration `tb_melhor_esforco` (colunas, FK, unique `(treino_realizado_id, distancia_label)`);
  resolver o número exato contra a última migration aplicada
- [ ] **2.2** Entidade `MelhorEsforco` + repository + cascade no `TreinoRealizado`
- [ ] **2.3** Teste: persister grava esforços por cascade; re-import não duplica (unique)

## 3. Ingestão de streams

- [ ] **3.1** Client: `buscarStreams(apiKey, activityId)` → DTO de stream (time[], distance[])
- [ ] **3.2** Integrar no orquestrador de ingestão (fora de transação, só modalidades de corrida)
- [ ] **3.3** Falha de streams degrada (treino entra sem esforços, log), não derruba o import
- [ ] **3.4** Teste de integração: import de corrida persiste esforços; não-corrida não chama
  streams; falha de streams não aborta
- [ ] Validação: `./mvnw test -Dtest=*Ingestion*Test`

## 4. Backfill

- [ ] **4.1** `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-best-efforts` (coach)
- [ ] **4.2** Conjunto candidato tenant-scoped: corridas INTERVALS_ICU sem linha em `tb_melhor_esforco`
- [ ] **4.3** Idempotente; falha em um treino não aborta os demais; não sobrescreve o treino
- [ ] **4.4** Testes do backfill service (molde do backfill de laps)

## 5. Endpoint + agregação

- [ ] **5.1** `MelhorEsforcoDto` (`distancia`, `tempoSegundos`, `paceMinKm`, `data`)
- [ ] **5.2** `AtletaProgressService.getMelhoresEsforcos(atletaId)` — agrega min por distância na
  janela configurável (default 42d), pace derivado, ordenação canônica
- [ ] **5.3** Rotas `/me/melhores-esforcos` e `/{id}/melhores-esforcos` em `AtletaProgressController`
- [ ] **5.4** Testes de service (janela filtra, min, vazio, sem integração) e controller (authz)
- [ ] Validação: `./mvnw clean verify`

## 6. Front

- [ ] **6.1** Hook `useAthleteMelhoresEsforcos` + serviço em `AthleteProgressService`
- [ ] **6.2** Adapter `melhoresEsforcosAdapter` (tempo `HH:MM:SS`, pace `M:SS/km`) + teste
- [ ] **6.3** Nova aba "Esforços" em `AthleteProgressPage` (loading/erro/vazio)
- [ ] **6.4** Tabela no `CoachAthleteProfilePage`, perto de "Seus PRs"
- [ ] Validação: `npm run lint && npm run build`

## 7. Fechamento

- [ ] **7.1** Confirmar que `recordes` e "Provas"/"Seus PRs" não regrediram (CA5)
- [ ] **7.2** Atualizar este `tasks.md` (entregue vs. adiado) antes do `/done`
