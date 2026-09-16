## 1. Confirmar premissa histórica (Open Question do proposal.md)

- [ ] 1.1 Ler o histórico de commits/PR de `athlete-onboarding-baseline` no ponto em que
      `BaselineCalculatorImpl.calcular` passou a chamar `tsbService.recalcularHistoricoCompleto`.
      Confirmar que não havia (ou não há mais) uma razão de integridade real por trás — só então
      seguir para a remoção.
      **Verify:** anotar a conclusão nesta task antes de marcar `[x]`; se encontrar um motivo
      válido, parar e reportar ao invés de prosseguir para a seção 2.

## 2. Remover a chamada redundante

- [ ] 2.1 Em `BaselineCalculatorImpl`, remover a linha
      `tsbService.recalcularHistoricoCompleto(atletaId);` dentro de `calcular(...)`.
- [ ] 2.2 Remover o campo `private final TsbService tsbService;`, o import de `TsbService` e
      confirmar que `@RequiredArgsConstructor` passa a gerar o construtor só com
      `MetricasDiariasRepository`.
      **Verify:** `./mvnw clean compile` sem erros de dependência não resolvida.

## 3. Atualizar o teste existente (seam único, `BaselineCalculatorTest`)

- [ ] 3.1 Remover `@Mock private TsbService tsbService` e o import correspondente.
- [ ] 3.2 Atualizar a chamada de construtor em `setUp()` para
      `new BaselineCalculatorImpl(metricasDiariasRepository)`.
- [ ] 3.3 Remover a asserção `verify(tsbService).recalcularHistoricoCompleto(atletaId);` do
      cenário "Cenario A — 8+ semanas de historico real" — as demais asserções desse teste
      (ctl/atl/tsb/origem) continuam como estão.
      **Verify:** `./mvnw clean test -Dtest=BaselineCalculatorTest` verde, sem
      `UnnecessaryStubbingException`.

## 4. Validação completa

- [ ] 4.1 Rodar a suíte completa do módulo para garantir que nenhum outro teste dependia do
      comportamento removido. **Achado do pre-mortem (confirmado no código):**
      `BaselineCalculatorImpl.calcular` roda **duas vezes** por geração de plano para atleta em
      calibração — via `OnboardingServiceImpl.montarContexto:115` (sempre) e via
      `PlanGenerationPersister:191` → `OnboardingServiceImpl.avaliarCalibracaoSeAplicavel:367` →
      `CalibrationServiceImpl.avaliarSemana:72` (quando aplicável). Os dois call sites
      compartilham o mesmo `BaselineCalculatorImpl` — a remoção resolve ambos de uma vez, mas
      **conferir especificamente `CalibrationServiceImplTest`** (não só confiar em "suíte
      completa") por um mock de `TsbService` estubado nesse fluxo.
      **Verify:** `./mvnw clean test` verde, com `CalibrationServiceImplTest` citado
      nominalmente no relatório de validação.

## 5. Fechar o registro do achado

- [ ] 5.1 Após merge em `develop`, atualizar
      `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md` marcando o achado como
      resolvido, com o link/número do PR.
- [ ] 5.2 Atualizar a linha correspondente no radar de `menthoros-product/openspec/SPRINTS.md`
      (seção "Radar — specs no horizonte") para refletir a entrega, ou removê-la se o padrão do
      radar for não manter itens entregues.
