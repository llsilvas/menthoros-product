**Tamanho:** XS · **Trilha:** Fast

## Status

- ready-for-agent (2026-09-13): spec produzida via `/to-spec` a partir do achado documentado em
  `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md`, com causa raiz confirmada por
  leitura de código e investigação dedicada (ver "Further Notes"). Seam único identificado
  (`BaselineCalculatorTest`). Pronta para `/implement init remove-redundant-tsb-baseline-recalc`.
- Pré-requisito 1/3 fechado (2026-09-14): a revisão adversarial do Codex sobre esta spec (DoR
  NOT READY) apontou três lacunas que precisavam ser fechadas antes desta remoção ser segura —
  gap do `IntervalsIcuActivityPersister`, `semanasProgressaoContinua` não recalculado pelo
  caminho incremental, e backfill de TSS legado pendente em produção. A primeira foi corrigida
  pela change `fix-intervals-icu-retroactive-tsb-recalc` (PR backend #119, mergeado `cf84117`) —
  o persister agora usa `recalcularDesde`, fechando a defasagem que essa exceção documentada
  deixava. **Ainda faltam as outras duas** (progressão + backfill) antes de reabrir esta change
  para implementação.

## Problem Statement

Toda vez que o motor gera um plano semanal para um atleta que já tem baseline calibrado, a
geração fica mais lenta do que precisa — em casos observados, 26 a 28 segundos mais lenta —
porque o sistema reprocessa **todo o histórico de treino do atleta desde o primeiro registro**
(mais de um ano em alguns casos) só para descobrir um número que ele já sabia: o CTL e o ATL
mais recentes. O treinador vê a geração de plano demorar sem motivo aparente, e o atraso cresce
sem limite conforme cada atleta acumula mais meses de treino registrado.

## Solution

Parar de recalcular o histórico inteiro no cálculo do baseline de onboarding. O valor mais
recente de CTL/ATL já é mantido em dia, de forma incremental e barata, toda vez que um treino
real é registrado (Strava, `.fit`, reconciliação manual) — o cálculo do baseline pode ler esse
valor já pronto em vez de reconstruir a série inteira do zero.

## User Stories

1. Como treinador, quero que a geração de plano semanal não demore segundos extras à toa, para
   que eu não associe lentidão do sistema a um problema no meu atleta ou na minha conexão.
2. Como treinador de uma assessoria com muitos atletas, quero que o tempo de geração de plano não
   cresça conforme o histórico de treino dos meus atletas aumenta, para que o sistema continue
   rápido mesmo com atletas de longa data.
3. Como atleta, quero que meu plano semanal seja gerado sem atraso perceptível, para que a
   experiência do app não pareça travada nos dias em que o coach gera o plano.
4. Como desenvolvedor mantendo o motor de cálculo de TSB/CTL/ATL, quero que exista só um caminho
   de verdade para "qual é o CTL/ATL atual do atleta" (o incrementalmente mantido), para não
   precisar raciocinar sobre duas fontes divergentes do mesmo dado.
5. Como desenvolvedor investigando um bug de métricas de treino no futuro, quero que o código do
   cálculo de baseline não contenha uma chamada cara e aparentemente redundante sem explicação,
   para não perder tempo reinvestigando o que esta spec já esclareceu.

## Implementation Decisions

- **Módulo alterado:** `BaselineCalculatorImpl` (`br.com.menthoros.backend.services.onboarding.impl`).
- **Remover** a chamada a `TsbService.recalcularHistoricoCompleto(atletaId)` dentro de
  `BaselineCalculatorImpl.calcular`. O método já lê, logo em seguida, a métrica mais recente via
  `MetricasDiariasRepository.findLatestByAtletaId` — essa leitura permanece como está e passa a
  ser a única fonte do CTL/ATL "real" usado no blend com a heurística.
- **Remover a dependência de `TsbService`** da classe: campo, import e parâmetro de construtor,
  já que não sobra nenhum outro uso depois da remoção da chamada. `@RequiredArgsConstructor`
  gera o novo construtor automaticamente a partir dos campos restantes.
- **Nenhuma mudança de contrato:** a interface `BaselineCalculator.calcular(...)` e o tipo de
  retorno `BaselineResult` continuam idênticos. Nenhum outro chamador de `BaselineCalculator`
  precisa mudar.
- **`TsbService.recalcularHistoricoCompleto` não é removido do sistema** — continua existindo e
  sendo usado pelo único consumidor legítimo identificado na investigação:
  `AtletaServiceImpl.recalcularMetricasAtleta`, acionado manualmente via endpoint administrativo.
  Este change não mexe nesse caminho.
- **Fora do escopo desta change, mas registrado:** o gap encontrado em
  `IntervalsIcuActivityPersister` (usa `atualizarTsbDia` em vez de `recalcularDesde` para import
  retroativo de atividade individual) é um bug distinto, não relacionado a esta remoção. Não
  corrigido aqui.

## Testing Decisions

- Um bom teste aqui verifica comportamento observável: que `calcular` continua devolvendo o
  mesmo `BaselineResult` correto a partir do CTL/ATL mais recente, e que **não** aciona mais o
  recálculo caro — não testa detalhes de implementação além dessa interação externa
  (`TsbService` deixa de existir como colaborador, então a ausência de chamada é estrutural, não
  apenas verificada por `never()`).
- **Módulo testado:** `BaselineCalculatorImpl`, via o teste unitário já existente
  `BaselineCalculatorTest` (`src/test/java/br/com/menthoros/backend/services/onboarding/`).
  Esse é o seam mais alto disponível e já cobre os cenários A/B/C do blend real+heurística — não
  há necessidade de um seam novo.
- **Mudança necessária no teste existente:** o cenário "Cenario A — 8+ semanas de historico
  real" tem hoje a asserção `verify(tsbService).recalcularHistoricoCompleto(atletaId)`
  (`BaselineCalculatorTest.java:64`) — ela deixa de existir porque `tsbService` deixa de ser
  colaborador da classe. O mock `@Mock private TsbService tsbService` e a chamada de construtor
  `new BaselineCalculatorImpl(tsbService, metricasDiariasRepository)` são atualizados para
  remover o parâmetro. Os demais cenários (B, C, heurística por nível, `tsb = ctl - atl`,
  validação de `atletaId` nulo) continuam válidos sem alteração.
- **Prior art:** o padrão de teste (`@ExtendWith(MockitoExtension.class)`, `@Nested` por método,
  Mockito estrito) já está estabelecido no próprio `BaselineCalculatorTest` — seguir o mesmo
  estilo, sem introduzir convenção nova.
- **Gate de validação:** `./mvnw clean test` (não precisa de `*IT` — não há mudança de schema,
  transação ou integração externa).

## Out of Scope

- ~~Corrigir o gap de `IntervalsIcuActivityPersister`~~ — já corrigido pela change
  `fix-intervals-icu-retroactive-tsb-recalc` (PR backend #119, mergeado `cf84117`).
- Mudar o caminho incremental (`TsbService.recalcularDesde`) ou o caminho manual
  (`AtletaServiceImpl.recalcularMetricasAtleta`) — nenhum dos dois está errado.
- Mover qualquer recálculo de TSB para fora do caminho síncrono de geração de plano — deixa de
  ser necessário, porque o custo que motivaria isso desaparece com a remoção da chamada.
- Qualquer alteração na fórmula de CTL/ATL/TSB em si (constantes de tempo, EMA) — isso é escopo
  de `refine-tss-tsb-precision`, uma change existente e não relacionada.

## Métrica de sucesso

Tempo de geração de plano para atletas com baseline estabelecido deixa de incluir o passo de
"RECALCULANDO HISTÓRICO COMPLETO" no log — verificável diretamente pela ausência dessa linha de
log em gerações reais pós-deploy, e pela queda do p95 de latência de persistência de plano
(hoje inflado pelos 26-28s observados nos casos afetados).

## Open Questions & Assumptions

- **Assumido:** não há nenhum caminho de persistência de treino real, hoje ou historicamente,
  que insira/atualize `TreinoRealizado` sem passar por `IngestaoTreinoRealizadoService`
  (`registrar`/`reprocessar`) — confirmado por investigação de código em 2026-09-13 cobrindo
  Strava (sync e webhook), `.fit`, reconciliação manual e intervals.icu (laps). Se essa premissa
  cair no futuro (um novo integrador que persista `TreinoRealizado` diretamente), o novo
  caminho precisa chamar `recalcularDesde` — não é motivo para reverter esta change, é uma
  responsabilidade do novo integrador.
- **Open Question (bloqueante da implementação, não da aprovação da spec):** por que a chamada a
  `recalcularHistoricoCompleto` foi escrita originalmente em `BaselineCalculatorImpl`? A task 1.1
  exige ler o histórico do PR de `athlete-onboarding-baseline` **antes** de tocar em código —
  se a leitura revelar um motivo de integridade real (ex.: o caminho incremental não existia
  ainda naquele momento), a implementação para e reporta em vez de prosseguir para a remoção.
  Se não revelar motivo válido, a remoção segue como planejada.

## Rollback / Risco

- **Rollback:** reverter o commit único desta change. Não há migration nem mudança de contrato
  público — a reversão é puramente de código e teste, sem dado a migrar de volta.
- **Risco principal:** a premissa "nenhum caminho de persistência de treino real ignora o
  incremental" (ver Open Question acima) estar errada ou ficar errada no futuro. Mitigado pela
  task 1.1 (gate antes de implementar) e pelo fato de que um novo integrador que quebrasse essa
  premissa seria responsabilidade dele chamar `recalcularDesde`, não motivo para reverter esta
  change.
- **Risco secundário:** algum teste hoje esconde uma dependência de `TsbService` sendo estubado
  nesse fluxo (ex.: em `OnboardingServiceTest` ou `CalibrationServiceTest`) e quebra
  silenciosamente após a remoção. Mitigado pela task 4.1, que roda a suíte completa do módulo
  antes de considerar a change concluída.
