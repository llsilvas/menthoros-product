# Tasks — refactor-threshold-call-outside-transaction

Repo: `apps/menthoros-backend`. Validação padrão: `./mvnw clean test` (inner loop),
`./mvnw clean verify` antes de entregar. Sem mudança de comportamento observável — todo teste novo
é de regressão (mesmo resultado de antes) ou estrutural (a ordem de execução mudou como o design
prevê).

## 1. Projeções novas + `ThresholdInferenceService` ganha overload de primitivos

- [x] 1.1 **Feito.** `AtletaRepository.findLimiarPaceStatusById(UUID atletaId):
      Optional<LimiarPaceStatusProjection>` — projeção com `assessoriaId`/`paceLimiar`/
      `dataUltimoTestePace`, 1 round-trip só, sem carregar o agregado `Atleta` inteiro (design.md
      D1). Nova `LimiarPaceStatusProjection` em `repository/projection/`.
      *verify:* `AtletaRepositoryTest` → 13/13 (3 testes novos: campos corretos, campos nulos sem
      erro, atleta inexistente vazio).
- [x] 1.1b **Feito.** `PlanoMetadadosRepository.findPaceLimiarEstimadoByAtletaId(UUID atletaId):
      Optional<BigDecimal>` — projeção pro valor anterior (só o log de outlier usa), **não**
      `buscarOuCriarMetadados` (esse cria registro se não existir — mutação fora de transação,
      design.md D1). Nome real da classe é `PlanoMetadadosRepository` (minúsculo em "dados"), não
      `PlanoMetaDadosRepository` como o design.md/tasks.md grafavam.
      *verify:* `PlanoMetaDadosRepositoryTest` novo → 2/2 (com registro, sem registro).
- [x] 1.1c **Feito.** `ThresholdInferenceService.isPaceLimiarDesatualizado(BigDecimal paceLimiar,
      LocalDate dataUltimoTestePace, LocalDate hoje)` — novo overload de primitivos; o overload
      existente `(Atleta, LocalDate)` passa a delegar pro novo, sem mudar os 2 callers atuais
      (`CoachAthleteProfileServiceImpl`, `ThresholdConstraintFormatter`) — design.md D1b.
      *verify:* `ThresholdInferenceServiceTest` → 50/50 (5 cenários do overload novo + 1 teste de
      delegação); `CoachAthleteProfileServiceImplTest` (26/26) confirma o caller existente intacto.

## 2. `AthleteThresholdUpdater` — separar decisão de aplicação

- [x] 2.1 **Feito.** Record `PaceLimiarResolvido(FonteLimiarInferencia fonte, BigDecimal valor,
      ConfiancaInferencia confianca)` — arquivo próprio em `services/helper/`.
- [x] 2.2 **Feito.** `AthleteThresholdUpdater.resolverFontePace(UUID atletaId, UUID tenantId,
      LocalDate hoje, List<TreinoRealizado> treinos30d, BigDecimal paceLimiarAnterior):
      Optional<PaceLimiarResolvido>` — extraído de `atualizarPaceLimiarInferido` (prova válida >
      quintil), sem receber `PlanoMetaDados` (design.md D1). Puro, log de outlier incluso (só
      precisa do valor anterior).
      *verify:* 4 testes novos (prova válida, só quintil, nenhuma fonte, delta de outlier).
- [x] 2.3 **Feito.** `AthleteThresholdUpdater.aplicarPaceLimiar(PlanoMetaDados metaDados,
      PaceLimiarResolvido resolvido, LocalDate hoje)` — só a mutação, sem lógica de decisão.
      `atualizarLimiares` (público) chama `resolverFontePace` + `aplicarPaceLimiar` em sequência —
      assinatura pública inalterada.
      *verify:* `AthleteThresholdUpdaterTest` → 19/19 (todos os testes pré-existentes de
      `atualizarLimiares` continuam verdes, sem alteração — regressão confirmada — + 2 testes novos
      de `aplicarPaceLimiar` isolado).

## 3. `TsbDiaPersister` — novo bean pra fase transacional

- [x] 3.0 **Feito.** Inventário: `atualizarTsbDia`(3-arg) + `atualizarMetaDados` +
      `contarDiasConsecutivosTreino` + `recalcularSemanasProgressao` usam
      `treinoRealizadoRepository`, `planoMetaDadosRepository`, `metricasDiariasRepository`,
      `atletaRepository`, `metricasAlertaService`, `athleteThresholdUpdater`,
      `planoMetadadosService` — 7 dependências, todas movidas pro construtor de `TsbDiaPersister`.
- [x] 3.1 **Feito, com 2 achados durante a implementação não previstos no design:**
      1. **`atualizarLimiares` mistura FC e pace no mesmo método** — não dava pra `TsbDiaPersister`
         chamar só a parte de FC (pace já vem pré-resolvido) sem duplicar a lógica de FC. Extraído
         `AthleteThresholdUpdater.atualizarFcLimiar(Atleta, PlanoMetaDados, LocalDate)` — mesma
         lógica de FC de sempre, chamável isoladamente; `atualizarLimiares` passou a delegar pra
         ele + pro par `resolverFontePace`/`aplicarPaceLimiar` (compatibilidade, ainda usado pela
         consolidação de `recalcularHistoricoCompleto`, fora de escopo).
      2. **`contarDiasConsecutivosTreino`/`recalcularSemanasProgressao` também são usados pela
         consolidação de `recalcularHistoricoCompleto`** (fora de escopo, D2b) — em vez de
         duplicar, ficaram package-private em `TsbDiaPersister` e o `atualizarMetaDados` retido em
         `TsbServiceImpl` (só usado por essa consolidação) passou a chamar
         `tsbDiaPersister.contarDiasConsecutivosTreino(...)`/`.recalcularSemanasProgressao(...)`
         por injeção, sem duplicar lógica de negócio.
      `TsbDiaPersister.atualizarDiaTransacional(UUID, LocalDate, boolean, PaceLimiarResolvido)`
      extrai o corpo do método privado de 3 argumentos literalmente (D2 — bean novo evita
      auto-invocação).
      *verify:* 3 testes migrados de `TsbServiceImplTest` pra `TsbDiaPersisterTest`
      (`TsbDiaPersisterRampRateTest`, `TsbDiaPersisterDiasConsecutivosTest`,
      `TsbDiaPersisterSomarTssContabilizadoTest` — package-private direto, sem reflection).

## 4. `TsbServiceImpl` — 2 pontos de entrada viram orquestradores sem `@Transactional`

`recalcularHistoricoCompleto` fica **fora do escopo** (design.md D2b — staleness sem benefício
real, achado da 2ª rodada de pre-mortem) — nenhuma task aqui o toca, além de precisar reaproveitar
`tsbDiaPersister.contarDiasConsecutivosTreino`/`.recalcularSemanasProgressao` (achado de 3.1) e ter
a lambda de `recalcularPeriodoComProgresso` redirecionada pra
`tsbDiaPersister.atualizarDiaTransacional(id, data, false, null)` (mecânico — o método privado que
ela chamava mudou de endereço, comportamento idêntico).

- [x] 4.1 **Feito.** `resolverPaceSeNecessario(UUID atletaId, LocalDate hoje): PaceLimiarResolvido`
      — método privado de `TsbServiceImpl` (design.md D2/3ª rodada de pre-mortem): busca
      `findLimiarPaceStatusById` (1.1), se vazio retorna `null` (mesmo guard de hoje, atleta sem
      assessoria); checa `paceStale` via o overload de primitivos (1.1c); se stale, busca
      `treinos30d` + `findPaceLimiarEstimadoByAtletaId` (1.1b) e chama
      `athleteThresholdUpdater.resolverFontePace(...)`.
      *verify:* `TsbServiceImplOrquestracaoTest` (novo, Mockito) → 3 testes cobrindo os 3 cenários.
- [x] 4.2 **Feito.** `atualizarTsbDia(UUID, LocalDate)` (2-arg) perde `@Transactional`; chama
      `resolverPaceSeNecessario` fora de qualquer transação, depois
      `tsbDiaPersister.atualizarDiaTransacional(atletaId, data, true, paceResolvido)`.
      *verify:* teste estrutural com `InOrder` confirmando que `resolverFontePace` roda antes de
      `tsbDiaPersister.atualizarDiaTransacional` (design.md D4 critério 2).
- [x] 4.3 **Feito.** `recalcularDesde(UUID, LocalDate)` perde `@Transactional`; resolve
      `paceResolvido` **uma vez, com `hoje=fim`**, laço chama
      `tsbDiaPersister.atualizarDiaTransacional(...)` por dia.
      *verify:* teste confirmando `findLimiarPaceStatusById`/`resolverFontePace` chamados 1x
      (não 5x) num intervalo de 5 dias, `atualizarDiaTransacional` chamado 5x (design.md critério
      D2/D4).
- [x] 4.4 **Feito.** `processarDiasDescanso` — nenhuma mudança de código (chama o
      `atualizarTsbDia` 2-arg já corrigido); sem teste dedicado (método já não tinha nenhum
      caller/teste em produção antes desta change — confirmado por busca, código mantido como
      estava).
- [x] 4.5 **Feito.** Teste de reflexão (`TsbServiceImplOrquestracaoTest`): `atualizarTsbDia(UUID,
      LocalDate)` e `recalcularDesde` não carregam `@Transactional`.
      *verify:* suíte completa (`./mvnw clean test`) → 3772/3772 verde; `./mvnw clean verify`
      (com os `*IT`) → 190 IT, 0 falhas.

## 4.6 QA (2026-09-18) — `code-reviewer` + `security-reviewer` + `clean-code-reviewer` em paralelo

Nenhum achado Crítico. 2 revisores independentes convergiram na mesma área
(duplicação/`processarDiasDescanso`), 1 achado real de concorrência:

- [x] Corrigido (`clean-code-reviewer`): `TsbServiceImpl.resolverPaceSeNecessario` duplicava a
      query "treinos 30d que contam na carga" que já existia em
      `AthleteThresholdUpdater.buscarTreinos30d` (privado). Exposto `public` (pacotes diferentes —
      `services.helper` vs. `services.impl` — package-private não alcança) e reaproveitado.
- [x] Documentado, não corrigido (`security-reviewer`, achado M1): decisão de pace roda fora de
      transação e é aplicada depois sem revalidar staleness nem comparar com o estado atual —
      `PlanoMetaDados` não tem `@Version`, sem detecção de escrita concorrente. Dois disparos quase
      simultâneos do mesmo atleta podem persistir a decisão mais antiga por último. Documentado no
      JavaDoc de `atualizarTsbDia` como janela aceita (mesma classe de trade-off já documentada pra
      leitores concorrentes); adicionar `@Version` fica fora do escopo desta change mecânica.
- [x] Documentado, não corrigido (`code-reviewer`, Importante #1): FC sempre resolve staleness com
      `LocalDate.now()`, pace usa a `data` recebida — só diverge se `processarDiasDescanso`
      (código morto, sem caller de produção nem na interface `TsbService`) for reativado.
      Documentado no JavaDoc de `atualizarTsbDia`.

*verify:* `./mvnw clean test` → 3772/3772 verde após os fixes.

## 5. Encerramento

- [x] 5.1 **Feito.** `./mvnw clean verify` verde.
- [x] 5.2 **Feito.** `tasks.md` atualizado (entregue vs. adiado, QA em 4.6). PR aberto a seguir.
- [ ] 5.3 Depois do merge: destravar `/implement init use-best-effort-for-threshold-inference`.
