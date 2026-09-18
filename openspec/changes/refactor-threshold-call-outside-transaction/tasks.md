# Tasks — refactor-threshold-call-outside-transaction

Repo: `apps/menthoros-backend`. Validação padrão: `./mvnw clean test` (inner loop),
`./mvnw clean verify` antes de entregar. Sem mudança de comportamento observável — todo teste novo
é de regressão (mesmo resultado de antes) ou estrutural (a ordem de execução mudou como o design
prevê).

## 1. Projeções novas + `ThresholdInferenceService` ganha overload de primitivos

- [ ] 1.1 `AtletaRepository.findLimiarPaceStatusById(UUID atletaId):
      Optional<LimiarPaceStatusProjection>` — projeção com `assessoriaId`/`paceLimiar`/
      `dataUltimoTestePace`, 1 round-trip só, sem carregar o agregado `Atleta` inteiro (design.md
      D1). Teste: retorna os 3 campos certos / vazio se atleta não existe.
- [ ] 1.1b `PlanoMetaDadosRepository.findPaceLimiarEstimadoByAtletaId(UUID atletaId):
      Optional<BigDecimal>` — projeção pro valor anterior (só o log de outlier usa), **não**
      `buscarOuCriarMetadados` (esse cria registro se não existir — mutação fora de transação,
      design.md D1).
- [ ] 1.1c `ThresholdInferenceService.isPaceLimiarDesatualizado(BigDecimal paceLimiar, LocalDate
      dataUltimoTestePace, LocalDate hoje)` — novo overload de primitivos; o overload existente
      `(Atleta, LocalDate)` passa a delegar pro novo, sem mudar os 2 callers atuais
      (`CoachAthleteProfileServiceImpl`, `ThresholdConstraintFormatter`) — design.md D1b.
      *verify:* mesmos casos de teste do overload existente, mais 1 confirmando que o overload
      `Atleta` delega corretamente (não duplica a lógica).

## 2. `AthleteThresholdUpdater` — separar decisão de aplicação

- [ ] 2.1 Record `PaceLimiarResolvido(FonteLimiarInferencia fonte, BigDecimal valor,
      ConfiancaInferencia confianca)` (ou `Optional` vazio pra "nenhuma fonte disponível").
- [ ] 2.2 `AthleteThresholdUpdater.resolverFontePace(UUID atletaId, UUID tenantId, LocalDate hoje,
      List<TreinoRealizado> treinos30d, BigDecimal paceLimiarAnterior):
      Optional<PaceLimiarResolvido>` — extrai a lógica hoje em `atualizarPaceLimiarInferido`
      (prova válida > quintil), sem receber `PlanoMetaDados` (design.md D1). Puro: sem mutação, sem
      side effect (o log de outlier — `logSinalizacaoOutlierPace` — também roda aqui, já que só
      precisa do valor anterior, não da entidade).
      *verify:* `AthleteThresholdUpdaterTest` — mesmos 3 cenários que
      `atualizarPaceLimiarInferido` já cobre hoje (prova válida, só quintil, nenhuma fonte),
      reescritos pro método novo. TDD: escrever os testes contra a assinatura nova primeiro.
- [ ] 2.3 `AthleteThresholdUpdater.aplicarPaceLimiar(PlanoMetaDados metaDados,
      PaceLimiarResolvido resolvido)` — só a mutação (`setPaceLimiarEstimado`/
      `setConfiancaInferenciaPace`/`setFonteLimiarPace`/`setDataInferenciaLimiar`), sem lógica de
      decisão. `atualizarLimiares` (público) passa a chamar `resolverFontePace` +
      `aplicarPaceLimiar` em sequência — mesmo resultado de hoje pro caller que ainda usa o método
      público sem saber da separação (compatibilidade, nenhum outro caller muda ainda).
      *verify:* testes de 2.2 continuam verdes; `atualizarLimiares` ganha 1 teste confirmando que
      o resultado final (via as duas fases) é idêntico ao do método antigo, pros mesmos inputs.

## 3. `TsbDiaPersister` — novo bean pra fase transacional

- [ ] 3.1 Novo `@Component TsbDiaPersister` — extrai o corpo do método privado de 3 argumentos
      `atualizarTsbDia(atletaId, data, atualizarMetaDadosHoje)` de `TsbServiceImpl`, com um
      parâmetro a mais: `PaceLimiarResolvido paceResolvido` (pode ser `null`/vazio quando
      `!paceStale`), repassado pra `athleteThresholdUpdater.aplicarPaceLimiar` em vez de
      `atualizarLimiares` chamar `resolverFontePace` de novo. Método
      `atualizarDiaTransacional(UUID atletaId, LocalDate data, boolean atualizarMetaDadosHoje,
      PaceLimiarResolvido paceResolvido)`, `@Transactional` (design.md D2 — bean novo evita
      auto-invocação).
      *verify:* `TsbDiaPersisterTest` novo, cobrindo os cenários que `TsbServiceImplTest` já cobre
      pro método privado extraído (mover os testes relevantes, não duplicar).

## 4. `TsbServiceImpl` — 2 pontos de entrada viram orquestradores sem `@Transactional`

`recalcularHistoricoCompleto` fica **fora do escopo** (design.md D2b — staleness sem benefício
real, achado da 2ª rodada de pre-mortem) — nenhuma task aqui o toca.

- [ ] 4.1 `resolverPaceSeNecessario(UUID atletaId, LocalDate hoje): PaceLimiarResolvido` — **novo
      método privado de `TsbServiceImpl`** (não de `AthleteThresholdUpdater` — design.md D2/3ª
      rodada de pre-mortem): busca `findLimiarPaceStatusById` (1.1), se vazio retorna `null` (mesmo
      guard de hoje, atleta sem assessoria); checa `paceStale` via o overload de primitivos (1.1c);
      se stale, busca `treinos30d` + `findPaceLimiarEstimadoByAtletaId` (1.1b) e chama
      `athleteThresholdUpdater.resolverFontePace(...)`.
      *verify:* teste cobrindo `paceStale=false` (não busca treinos nem chama
      `resolverFontePace`), atleta sem assessoria (retorna `null`, loga warning), caminho feliz.
- [ ] 4.2 `atualizarTsbDia(UUID, LocalDate)` (2-arg, hoje `:68`) perde `@Transactional`; passa a
      chamar `resolverPaceSeNecessario` (4.1) fora de qualquer transação, depois
      `tsbDiaPersister.atualizarDiaTransacional(atletaId, data, true, paceResolvido)`.
      *verify:* teste de regressão de valor (design.md D4 critério 1) + teste estrutural
      (`ArgumentCaptor`/`InOrder` confirmando que `resolverPaceSeNecessario`/`resolverFontePace`
      roda antes de qualquer interação com os repositórios de persistência — design.md D4 critério
      2). TDD: RED primeiro com o teste estrutural, confirma que ele pegaria a v1 (chamada dentro
      da transação) antes de implementar.
- [ ] 4.3 `recalcularDesde(UUID, LocalDate)` (`:80`) perde `@Transactional`; resolve
      `paceResolvido` **uma vez, com `hoje=fim`** (não a cada iteração — design.md D2), então o
      laço chama `tsbDiaPersister.atualizarDiaTransacional(...)` por dia, passando `paceResolvido`
      só quando `dia.equals(fim)`.
      *verify:* regressão de valor + teste confirmando que `resolverPaceSeNecessario` roda **uma
      vez** (não uma vez por dia do intervalo) num intervalo de N>1 dias.
- [ ] 4.4 `processarDiasDescanso` (`:379`) — nenhuma mudança de código (só chama
      `atualizarTsbDia(atletaId, dataAtual)`, já corrigido em 4.2); confirmar com 1 teste que
      continua funcionando sem alteração.
- [ ] 4.5 Teste de reflexão (design.md D4 critério 3): `atualizarTsbDia(UUID, LocalDate)` e
      `recalcularDesde` não carregam mais `@Transactional` — pega uma anotação esquecida que o
      teste estrutural (InOrder) de 4.2/4.3 sozinho não pegaria.

## 5. Encerramento

- [ ] 5.1 `./mvnw clean verify` verde (inclui os `*IT`, se algum tocar este fluxo).
- [ ] 5.2 Atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
- [ ] 5.3 Depois do merge: destravar `/implement init use-best-effort-for-threshold-inference`.
