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

- [x] 4.1 Etapas vindas do mapper chegam intactas ao `saveIdempotent` e persistem por
      `cascade = CascadeType.ALL`. Nenhum `EtapaRealizadaRepository`.
- [x] 4.2 Ramo `inserted == false` não duplica etapas no registro vencedor.
- [x] 4.3 Activity sem intervalos preserva o comportamento anterior.
- [x] 4.4 **Confirmado: `IntervalsIcuActivityPersister` não precisou de nenhuma alteração.** Os três
      testes passaram de primeira — são guardas de regressão, não TDD vermelho-primeiro, e existem
      para o caso de alguém adicionar attach ali depois.
- **Validação:** `./mvnw clean test`

## 5. Orquestrador — atualizar o ponto de chamada

- [x] 5.1 Dedup do passo 0 sem chamada HTTP — já coberto desde a change anterior.
- [x] 5.2 UMA chamada externa por import, com `comIntervalos=true`. **Validado por mutação:** trocar
      `true` por `false` na produção mata o teste.
- [x] 5.3 Erros do client (401/403, 404, 422, 429, 5xx, transporte) mapeados como antes — 7 testes
      existentes seguem verdes.
- [x] 5.4 Chamada atualizada em `IntervalsIcuActivityIngestionServiceImpl:130`.
- [x] 5.5 Nenhuma anotação `@Transactional` nova no caminho da chamada externa.
- **Validação:** `./mvnw clean test` — 2348 testes, 0 falhas.

## 5b. Backfill de etapas (D9 — lacuna histórica)

- [x] 5b.1 Candidatos escopados por tenant + atleta + `INTERVALS_ICU`, com `externalId` não-nulo.
- [x] 5b.2 Etapas gravadas via UPDATE, sem passar pelo guard de dedup e sem criar treino novo.
- [x] 5b.3 **Summary não é sobrescrito.** `mapEtapas` foi extraído de `map` exatamente para isso —
      o backfill nunca chama `map`, o que o teste verifica com `verify(mapper, never()).map(...)`.
- [x] 5b.4 Idempotência: sem candidatos é no-op; o persister também ignora treino que já tem etapas.
- [x] 5b.5 Falha em um treino não aborta os demais; nada é marcado, então ele segue candidato.
- [x] 5b.6 HTTP fora de transação no orquestrador; persistência por treino em `REQUIRES_NEW`.
- [x] 5b.7 `TreinoRealizadoRepository.findSemEtapasByAtletaAndFonte` com `not exists` sobre
      `EtapaRealizada`, tenant-scoped.
- [x] 5b.8 `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-laps` com
      `@PreAuthorize`, `@RequireTenant`, `@Operation`, `@ApiResponses` e `BackfillEtapasOutputDto`
      tipado. 4 testes de auth (TECNICO 200, ATLETA 403, sem auth 401, cross-tenant 403).
- **Validação:** `./mvnw clean test` — 2358 testes, 0 falhas.

## 6. Observabilidade

- [x] 6.1 Contador `intervals_icu.import.etapas`, com tags `tenant` e `resultado`
      (`com_etapas`/`sem_etapas`), incrementado apenas em import novo — numa corrida de
      concorrência quem inseriu já contou. Cardinalidade da tag `tenant` = nº de assessorias:
      aceitável no piloto, ressalva registrada no javadoc.
- **Validação:** `./mvnw clean test`

## 7. Integração

- [x] 7.1 (CA1) Import de ponta a ponta grava `tb_etapa_realizada` com `ordem` sequencial e FK.
- [x] 7.2 Re-import (passo 0) serializa o treino **com** etapas sem `LazyInitializationException` —
      a suíte roda sem `@Transactional` de classe de propósito, reproduzindo a ausência de sessão
      ambiente da produção.
- [x] 7.3 (CA7) — coberto pelos testes de skill existentes, que consomem `EtapaRealizadaResumo`;
      com as etapas presentes o caminho degradado deixa de ser usado.
- [x] 7.4 (CA9) Zona, intensidade e inclinação chegam convertidas ao banco (0,0011977 → 0,1;
      113,24 mm → 11,3 cm).
- [x] 7.5 Backfill completa um treino legado **sem sobrescrever o summary**, e é idempotente.
- **Validação:** `./mvnw clean verify` — **2366 unitários + 62 de integração, 0 falhas**.

## 8. Fechamento

- [x] 8.1 `/qa` — `code-reviewer`, `security-reviewer` e `clean-code-reviewer` em paralelo.
      **3 achados Importantes e 1 Low aplicados**; segurança sem nenhum Critical/High/Medium.
      Ver "Achados do QA" no design.
- [x] 8.2 `design.md` atualizado com o que o smoke e a implementação revelaram.
- [x] 8.3 **Open Question #6 decidido:** o backfill fica **manual** (ação do coach). O passivo é
      finito, o cap de 50 por execução protege o rate limit, e `restantes` diz quando repetir.
      Promover a job agendado só se a métrica de cobertura por assessoria mostrar volume que
      justifique — decisão reversível, sem custo de migration.
- [x] 8.4 PR #61 aberto para `develop` (llsilvas/menthoros-backend), sem merge local.
- **Validação:** CI verde e `./mvnw clean verify` local **sem nenhuma falha**.
