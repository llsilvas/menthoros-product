# Tasks — use-best-effort-for-threshold-inference

Repo: `apps/menthoros-backend`. Validação padrão: `./mvnw clean test` (inner loop),
`./mvnw clean verify` antes de entregar.

**Refinado contra o código real em `develop` (2026-09-19, `/implement init`).** Anchors
confirmados: `FonteLimiarInferencia` hoje só tem `{PROVA_REGISTRADA, MEDIA_TREINOS}`
(`enums/FonteLimiarInferencia.java:3`); `AthleteThresholdUpdater.resolverFontePace`
(`services/helper/AthleteThresholdUpdater.java:140-160`) e `logSinalizacaoOutlierPace`
(`:183-199`, `private`, assinatura atual `(UUID atletaId, BigDecimal paceAntigo, BigDecimal
paceNovo, UUID provaId)`); `TsbServiceImpl` tem 10 campos injetados via `@RequiredArgsConstructor`
(`services/impl/TsbServiceImpl.java:34-43`) e `resolverPaceSeNecessario` privado em `:133`;
`MelhorEsforcoDto(String distanciaLabel, double distanciaMetros, int tempoSegundos, String
paceLabel)` (`dto/output/MelhorEsforcoDto.java`); `MelhorEsforcoService.buscar(UUID atletaId,
String janela): List<MelhorEsforcoDto>` (`services/MelhorEsforcoService.java:24`).

## 1. `ThresholdInferenceService` — fórmula e enum

- [x] 1.1 `FonteLimiarInferencia` ganha `MELHOR_ESFORCO` (design.md D6) — sem migration
      (`VARCHAR(20)` já comporta).
- [x] 1.2 `ThresholdInferenceService.inferirPaceLimiarDeMelhorEsforco(MelhorEsforcoDto
      melhorEsforco): BigDecimal` — réplica isolada da fórmula de Riegel de
      `inferirPaceLimiarDeProva` (design.md D3), mesmas constantes `EXPONENTE_RIEGEL`/
      `OFFSET_LIMIAR_SEC_KM` já package-private na classe.
      *verify:* teste com valores conhecidos (ex.: 10k em 40min → mesmo cálculo manual verificado
      em `infer-threshold-from-race-result`), TDD: escrever o teste com o valor esperado calculado
      à parte antes de implementar.

## 2. `AthleteThresholdUpdater` — seleção e precedência

- [x] 2.1 `encontrarMelhorEsforcoValido(List<MelhorEsforcoDto> marcas): Optional<MelhorEsforcoDto>`
      — filtra por rótulo `"10k"`/`"5k"` (design.md D2), 10k vence quando ambos presentes.
      *verify:* 4 cenários (só 10k, só 5k, os dois → 10k vence, nenhum dos dois → vazio).
- [x] 2.2 `resolverFontePace` ganha parâmetro `List<MelhorEsforcoDto> melhoresEsforcos` — novo
      degrau entre prova e quintil (design.md D1): sem prova válida, tenta melhor esforço válido
      (2.1) antes do quintil; retorna `PaceLimiarResolvido` com `fonte=MELHOR_ESFORCO`,
      `confianca=ALTA`. **Decisão de assinatura (observação do DoR):** `logSinalizacaoOutlierPace`
      hoje é `private (UUID atletaId, BigDecimal paceAntigo, BigDecimal paceNovo, UUID provaId)` —
      o último parâmetro é específico de prova. Generaliza pra
      `logSinalizacaoOutlierPace(UUID atletaId, BigDecimal paceAntigo, BigDecimal paceNovo, String
      origemDescricao)`, onde o caller de prova passa `"provaId=" + prova.getId()` (preserva o texto
      de log atual) e o caller de melhor esforço passa `"distanciaLabel=" + marca.distanciaLabel() +
      ", tempoSegundos=" + marca.tempoSegundos()` — um único método, sem overload, sem duplicar a
      lógica de outlier/INFO. Estende esse método pra sempre logar INFO com fonte/marca usada — não
      só no caso "primeira vez"/outlier (design.md D7, achado da 2ª rodada de pre-mortem: sem isso,
      um atleta sem `paceLimiarAnterior` não deixa rastro auditável se a marca usada for espúria).
      *verify:* estende `AthleteThresholdUpdaterTest$ResolverFontePace` — melhor esforço vence
      sobre quintil quando sem prova, com asserção explícita de que `paceLimiarEstimado` reflete o
      tempo/distância da marca de 10k usada (não só a `fonte`, achado de pre-mortem — um bug que
      seleciona 10k mas calcula com 5k precisa falhar aqui); prova continua vencendo sobre melhor
      esforço quando ambos disponíveis (regressão da precedência já testada); sem nenhuma das 3
      fontes disponível retorna `Optional.empty()` (mesmo comportamento já testado hoje pra
      "nenhuma fonte", sem mudança); log INFO com fonte/marca dispara sempre que
      `fonte=MELHOR_ESFORCO`, com ou sem `paceLimiarAnterior`, com ou sem delta de outlier; **e** o
      WARN de outlier existente pra `fonte=PROVA_REGISTRADA` continua disparando sem alteração
      (teste de não-regressão — achado da 3ª rodada de pre-mortem: estender
      `logSinalizacaoOutlierPace` pro novo degrau pode acidentalmente mover/silenciar o `if` que
      protege o caminho de prova já existente).

## 3. `TsbServiceImpl` — busca best-effort, fora de transação

- [ ] 3.1 `MelhorEsforcoService` injetado em `TsbServiceImpl` (11º campo `private final`, junto dos
      10 existentes em `services/impl/TsbServiceImpl.java:34-43`, via `@RequiredArgsConstructor` —
      atualizar todos os testes que constroem `TsbServiceImpl` manualmente, ex.
      `TsbServiceImplOrquestracaoTest.construirService()`). Constante `JANELA_MELHOR_ESFORCO =
      "42d"` (design.md D8). **Efeito colateral:** `AthleteThresholdUpdater.resolverFontePace`
      ganha o parâmetro `melhoresEsforcos` (task 2.2) — atualizar a assinatura em
      `AthleteThresholdUpdaterTest` e no único caller real, `TsbServiceImpl.resolverPaceSeNecessario`
      (`:133`), e no caller de `atualizarLimiares` (`AthleteThresholdUpdater.java:68-69`, chamado
      internamente — passa lista vazia, esse caminho não tem acesso a `MelhorEsforcoService` e
      permanece fora de escopo, ver design.md D4).
- [ ] 3.2 `buscarMelhorEsforcoSeguro(UUID atletaId): List<MelhorEsforcoDto>` — chama
      `melhorEsforcoService.buscar(atletaId, JANELA_MELHOR_ESFORCO)`, captura `RuntimeException` e
      devolve lista vazia em caso de falha (design.md D5, best-effort — nunca propaga).
      *verify:* sucesso devolve a lista; exceção (simular `IntervalsIcuApiException` e uma
      `RuntimeException` genérica) devolve lista vazia sem propagar, com log WARN — **e**, no nível
      de `TsbServiceImplOrquestracaoTest` (não neste teste isolado), asserção adicional de que
      `TsbDiaPersister.atualizarDiaTransacional` é chamado mesmo quando `buscarMelhorEsforcoSeguro`
      falha (efeito observável, AC4 do proposal — achado da 3ª rodada de pre-mortem: não propagar
      não prova, por si só, que a persistência de TSB do dia ocorreu).
- [ ] 3.3 `resolverPaceSeNecessario` passa a chamar `buscarMelhorEsforcoSeguro` (fora de
      transação, confirmado no design.md D4 que a pré-condição já está satisfeita por
      `refactor-threshold-call-outside-transaction`) e repassa o resultado pra
      `athleteThresholdUpdater.resolverFontePace`.
      *verify:* estende `TsbServiceImplOrquestracaoTest$ResolverPaceSeNecessario` — melhor esforço
      resolvido corretamente no caminho feliz; teste estrutural (4.2 existente) continua provando
      que a resolução roda antes do persister, agora incluindo a chamada ao `MelhorEsforcoService`;
      teste de reflexão (4.5 existente) continua verde (nenhum `@Transactional` novo).
- [ ] 3.4 Teste de regressão pro achado do pre-mortem (design.md Riscos, `TenantContext` por
      convenção): confirmar que `StravaActivitySyncScheduler` e
      `IntervalsIcuActivitySyncScheduler` continuam setando `TenantContext` antes de descer até
      `TsbService.recalcularDesde` — critério de aceite 5 do proposal.
      *verify:* teste (unit ou `*IT`, o que for mais direto sem reescrever os schedulers) que prova
      o **binding correto tenant→atleta**, não só ordenação/não-nulidade (achado da 2ª rodada de
      pre-mortem: um teste que só verifica `TenantContext` setado antes da chamada passaria mesmo
      se o scheduler setasse o tenant do atleta errado numa iteração de loop com múltiplos
      atletas/tenants). Cenário mínimo: processar 2 atletas de tenants diferentes no mesmo laço do
      scheduler e capturar (via spy/captor em `MelhorEsforcoService.buscar` ou equivalente) o
      `tenantId` efetivamente lido por `TenantContext.getRequiredTenantId()` durante o
      processamento de cada um — assert que bate com o tenant do atleta daquela iteração, não do
      anterior (regressão de vazamento entre iterações do loop).

## 4. Encerramento

- [ ] 4.1 `./mvnw clean verify` verde (inclui os `*IT` — checar se algum `*IT` de TSB/limiar
      precisa de fixture nova pro cenário de melhor esforço).
- [ ] 4.2 Atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 4.3 Depois do merge: item de fechamento do proposal (conferir valores reais em produção
      quando `add-athlete-best-efforts` for promovida a `main`) fica registrado, não bloqueia.
