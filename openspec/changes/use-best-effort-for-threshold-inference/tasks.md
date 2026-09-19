# Tasks — use-best-effort-for-threshold-inference

Repo: `apps/menthoros-backend`. Validação padrão: `./mvnw clean test` (inner loop),
`./mvnw clean verify` antes de entregar.

## 1. `ThresholdInferenceService` — fórmula e enum

- [ ] 1.1 `FonteLimiarInferencia` ganha `MELHOR_ESFORCO` (design.md D6) — sem migration
      (`VARCHAR(20)` já comporta).
- [ ] 1.2 `ThresholdInferenceService.inferirPaceLimiarDeMelhorEsforco(MelhorEsforcoDto
      melhorEsforco): BigDecimal` — réplica isolada da fórmula de Riegel de
      `inferirPaceLimiarDeProva` (design.md D3), mesmas constantes `EXPONENTE_RIEGEL`/
      `OFFSET_LIMIAR_SEC_KM` já package-private na classe.
      *verify:* teste com valores conhecidos (ex.: 10k em 40min → mesmo cálculo manual verificado
      em `infer-threshold-from-race-result`), TDD: escrever o teste com o valor esperado calculado
      à parte antes de implementar.

## 2. `AthleteThresholdUpdater` — seleção e precedência

- [ ] 2.1 `encontrarMelhorEsforcoValido(List<MelhorEsforcoDto> marcas): Optional<MelhorEsforcoDto>`
      — filtra por rótulo `"10k"`/`"5k"` (design.md D2), 10k vence quando ambos presentes.
      *verify:* 4 cenários (só 10k, só 5k, os dois → 10k vence, nenhum dos dois → vazio).
- [ ] 2.2 `resolverFontePace` ganha parâmetro `List<MelhorEsforcoDto> melhoresEsforcos` — novo
      degrau entre prova e quintil (design.md D1): sem prova válida, tenta melhor esforço válido
      (2.1) antes do quintil; retorna `PaceLimiarResolvido` com `fonte=MELHOR_ESFORCO`,
      `confianca=ALTA`. Reaproveita `logSinalizacaoOutlierPace` pro novo degrau (design.md D7).
      *verify:* estende `AthleteThresholdUpdaterTest$ResolverFontePace` — melhor esforço vence
      sobre quintil quando sem prova; prova continua vencendo sobre melhor esforço quando ambos
      disponíveis (regressão da precedência já testada); sem prova nem melhor esforço cai pro
      quintil (regressão); log de outlier dispara pro novo degrau igual já dispara pra prova.

## 3. `TsbServiceImpl` — busca best-effort, fora de transação

- [ ] 3.1 `MelhorEsforcoService` injetado em `TsbServiceImpl` (novo campo). Constante
      `JANELA_MELHOR_ESFORCO = "42d"` (design.md D8).
- [ ] 3.2 `buscarMelhorEsforcoSeguro(UUID atletaId): List<MelhorEsforcoDto>` — chama
      `melhorEsforcoService.buscar(atletaId, JANELA_MELHOR_ESFORCO)`, captura `RuntimeException` e
      devolve lista vazia em caso de falha (design.md D5, best-effort — nunca propaga).
      *verify:* sucesso devolve a lista; exceção (simular `IntervalsIcuApiException` e uma
      `RuntimeException` genérica) devolve lista vazia sem propagar, com log WARN.
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
      *verify:* teste (unit ou `*IT`, o que for mais direto sem reescrever os schedulers) que falha
      se o set de `TenantContext` for removido/reordenado por engano numa mudança futura.

## 4. Encerramento

- [ ] 4.1 `./mvnw clean verify` verde (inclui os `*IT` — checar se algum `*IT` de TSB/limiar
      precisa de fixture nova pro cenário de melhor esforço).
- [ ] 4.2 Atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 4.3 Depois do merge: item de fechamento do proposal (conferir valores reais em produção
      quando `add-athlete-best-efforts` for promovida a `main`) fica registrado, não bloqueia.
