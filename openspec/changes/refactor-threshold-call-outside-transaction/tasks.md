# Tasks — refactor-threshold-call-outside-transaction

Repo: `apps/menthoros-backend`. Validação padrão: `./mvnw clean test` (inner loop),
`./mvnw clean verify` antes de entregar. Sem mudança de comportamento observável — todo teste novo
é de regressão (mesmo resultado de antes) ou estrutural (a ordem de execução mudou como o design
prevê).

## 1. `AthleteThresholdUpdater` — separar decisão de aplicação

- [ ] 1.1 `AtletaRepository.findAssessoriaIdById(UUID atletaId): Optional<UUID>` — projeção nova,
      sem carregar o agregado `Atleta` inteiro (design.md D1). Teste: retorna o tenant certo /
      vazio se atleta não existe.
- [ ] 1.2 Record `PaceLimiarResolvido(FonteLimiarInferencia fonte, BigDecimal valor,
      ConfiancaInferencia confianca)` (ou `Optional` vazio pra "nenhuma fonte disponível").
- [ ] 1.3 `AthleteThresholdUpdater.resolverFontePace(UUID atletaId, UUID tenantId, LocalDate hoje,
      List<TreinoRealizado> treinos30d, BigDecimal paceLimiarAnterior):
      Optional<PaceLimiarResolvido>` — extrai a lógica hoje em `atualizarPaceLimiarInferido`
      (prova válida > quintil), sem receber `PlanoMetaDados` (design.md D1). Puro: sem mutação, sem
      side effect (o log de outlier — `logSinalizacaoOutlierPace` — também roda aqui, já que só
      precisa do valor anterior, não da entidade).
      *verify:* `AthleteThresholdUpdaterTest` — mesmos 3 cenários que
      `atualizarPaceLimiarInferido` já cobre hoje (prova válida, só quintil, nenhuma fonte),
      reescritos pro método novo. TDD: escrever os testes contra a assinatura nova primeiro.
- [ ] 1.4 `AthleteThresholdUpdater.aplicarPaceLimiar(PlanoMetaDados metaDados,
      PaceLimiarResolvido resolvido)` — só a mutação (`setPaceLimiarEstimado`/
      `setConfiancaInferenciaPace`/`setFonteLimiarPace`/`setDataInferenciaLimiar`), sem lógica de
      decisão. `atualizarLimiares` (público) passa a chamar `resolverFontePace` +
      `aplicarPaceLimiar` em sequência — mesmo resultado de hoje pro caller que ainda usa o método
      público sem saber da separação (compatibilidade, nenhum outro caller muda ainda).
      *verify:* testes de 1.3 continuam verdes; `atualizarLimiares` ganha 1 teste confirmando que
      o resultado final (via as duas fases) é idêntico ao do método antigo, pros mesmos inputs.

## 2. `TsbDiaPersister` — novo bean pra fase transacional

- [ ] 2.1 Novo `@Component TsbDiaPersister` — extrai o corpo do método privado de 3 argumentos
      `atualizarTsbDia(atletaId, data, atualizarMetaDadosHoje)` de `TsbServiceImpl`, com um
      parâmetro a mais: `PaceLimiarResolvido paceResolvido` (pode ser `null`/vazio quando
      `!paceStale`), repassado pra `athleteThresholdUpdater.aplicarPaceLimiar` em vez de
      `atualizarLimiares` chamar `resolverFontePace` de novo. Método
      `atualizarDiaTransacional(UUID atletaId, LocalDate data, boolean atualizarMetaDadosHoje,
      PaceLimiarResolvido paceResolvido)`, `@Transactional` (design.md D2 — bean novo evita
      auto-invocação).
      *verify:* `TsbDiaPersisterTest` novo, cobrindo os cenários que `TsbServiceImplTest` já cobre
      pro método privado extraído (mover os testes relevantes, não duplicar).

## 3. `TsbServiceImpl` — 3 pontos de entrada viram orquestradores sem `@Transactional`

- [ ] 3.1 `atualizarTsbDia(UUID, LocalDate)` (2-arg, hoje `:68`) perde `@Transactional`; passa a:
      checar `paceStale` via `thresholdInferenceService.isPaceLimiarDesatualizado` (leitura
      simples), se `true` buscar `treinos30d`+`tenantId` (via 1.1) e chamar
      `athleteThresholdUpdater.resolverFontePace(...)`, depois chamar
      `tsbDiaPersister.atualizarDiaTransacional(atletaId, data, true, paceResolvido)`.
      *verify:* teste de regressão de valor (design.md D4 critério 1) + teste estrutural
      (`ArgumentCaptor`/`InOrder` confirmando que `resolverFontePace` roda antes de qualquer
      interação com os repositórios de persistência — design.md D4 critério 2). TDD: RED primeiro
      com o teste estrutural, confirma que ele pegaria a v1 (chamada dentro da transação) antes de
      implementar.
- [ ] 3.2 `recalcularDesde(UUID, LocalDate)` (`:80`) perde `@Transactional`; resolve
      `paceResolvido` **uma vez, com `hoje=fim`** (não a cada iteração — design.md D2), então o
      laço chama `tsbDiaPersister.atualizarDiaTransacional(...)` por dia, passando `paceResolvido`
      só quando `dia.equals(fim)`.
      *verify:* regressão de valor + teste confirmando que `resolverFontePace` roda **uma vez**
      (não uma vez por dia do intervalo) — `verify(athleteThresholdUpdater,
      times(1)).resolverFontePace(...)` num intervalo de N>1 dias.
- [ ] 3.3 `processarDiasDescanso` (`:379`) — nenhuma mudança de código (só chama
      `atualizarTsbDia(atletaId, dataAtual)`, já corrigido em 3.1); confirmar com 1 teste que
      continua funcionando sem alteração.
- [ ] 3.4 `recalcularHistoricoCompleto` (`:433`) — resolve `paceResolvido` **antes** do passo 2
      (`recalcularPeriodoComProgresso`, a parte custosa), usando `hoje=intervalo.fim()`; passa o
      valor resolvido pro lambda de `tsbRecalculoExecutor.consolidar(...)` (passo 3), que chama
      `tsbDiaPersister.atualizarDiaTransacional(...)` em vez de `atualizarMetaDados` diretamente.
      *verify:* teste de regressão do fluxo de recálculo histórico completo (fixture pequena,
      poucos dias) + teste estrutural equivalente a 3.1.

## 4. Encerramento

- [ ] 4.1 `./mvnw clean verify` verde (inclui os `*IT`, se algum tocar este fluxo).
- [ ] 4.2 Atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 4.3 Depois do merge: destravar `/implement init use-best-effort-for-threshold-inference`.
