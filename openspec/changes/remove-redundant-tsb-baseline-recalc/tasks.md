## 1. Confirmar premissa histórica (Open Question do proposal.md)

- [x] 1.1 Verificado independentemente (além do achado do pre-mortem): `design.md` Decisão 11 da
      change arquivada `athlete-onboarding-baseline` (`changes/archive/2026-07/2026-07-22-athlete-onboarding-baseline/design.md:213-239`)
      descreve `ctlReal`/`atlReal` como saída de `TsbService.recalcularHistoricoCompleto` +
      `MetricasDiariasRepository.findLatestByAtletaId`, sem nenhuma menção a staleness, race
      condition ou motivo pelo qual o caminho incremental não bastaria. Sem motivo de integridade
      real encontrado — seguindo para a remoção.
      **Verify:** conclusão documentada acima e no proposal.md.

## 2. Remover a chamada redundante

- [x] 2.1 Removida a linha `tsbService.recalcularHistoricoCompleto(atletaId);` dentro de
      `calcular(...)`.
- [x] 2.2 Removido o campo `private final TsbService tsbService;` e o import de `TsbService`;
      `@RequiredArgsConstructor` gera o construtor só com `MetricasDiariasRepository`.
      **Verify:** `./mvnw clean compile` — OK, sem erros de dependência não resolvida.

## 3. Atualizar o teste existente (seam único, `BaselineCalculatorTest`)

- [x] 3.1 Removido `@Mock private TsbService tsbService` e o import correspondente.
- [x] 3.2 Construtor em `setUp()` atualizado para `new BaselineCalculatorImpl(metricasDiariasRepository)`.
- [x] 3.3 Removida a asserção `verify(tsbService).recalcularHistoricoCompleto(atletaId);` do
      cenário "Cenario A — 8+ semanas de historico real" — as demais asserções desse teste
      (ctl/atl/tsb/origem) continuam como estão. **TDD confirmado**: vermelho antes (erro de
      compilação, construtor com aridade errada), verde depois.
      **Verify:** `./mvnw clean test -Dtest=BaselineCalculatorTest` — 6/6 verde, sem
      `UnnecessaryStubbingException`.

## 4. Validação completa

- [x] 4.1 Suíte completa rodada. **Correção de nome**: o teste que cobre `CalibrationServiceImpl`
      é `CalibrationServiceTest` (`src/test/java/.../services/onboarding/CalibrationServiceTest.java`),
      não `CalibrationServiceImplTest` — mocka `BaselineCalculator` (a interface), não `TsbService`
      diretamente, então é insulado da mudança de construtor interno. Rodado isoladamente primeiro
      (6.1/6.1 — na verdade, verde) antes da suíte completa.
      **Verify:** `./mvnw clean test -Dtest=CalibrationServiceTest` verde; `./mvnw clean test`
      (suíte completa) verde, 0 erros; `./mvnw clean test-compile failsafe:integration-test failsafe:verify`
      (toda `*IT`) verde, 0 erros.

## 5. Fechar o registro do achado

- [ ] 5.1 Após merge em `develop`, atualizar
      `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` marcando o achado como
      resolvido, com o link/número do PR.
- [ ] 5.2 Atualizar a linha correspondente no radar de `menthoros-product/openspec/SPRINTS.md`
      (seção "Radar — specs no horizonte") para refletir a entrega, ou removê-la se o padrão do
      radar for não manter itens entregues.
