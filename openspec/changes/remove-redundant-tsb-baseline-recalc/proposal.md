**Tamanho:** XS · **Trilha:** Fast

## Status

- ready-for-agent (2026-09-13): spec produzida via `/to-spec` a partir do achado documentado em
  `apps/menthoros-backend/docs/ia/01-otimizacao-recalculo-tsb.md`, com causa raiz confirmada por
  leitura de código e investigação dedicada (ver "Further Notes"). Seam único identificado
  (`BaselineCalculatorTest`). Pronta para `/implement init remove-redundant-tsb-baseline-recalc`.

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

- Corrigir o gap de `IntervalsIcuActivityPersister` (usa `atualizarTsbDia` em vez de
  `recalcularDesde` para import retroativo) — bug real, mas distinto; fica registrado no radar
  separadamente se/quando priorizado.
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
- **Open Question (não bloqueante):** por que a chamada a `recalcularHistoricoCompleto` foi
  escrita originalmente em `BaselineCalculatorImpl`? Vale uma leitura rápida do histórico do PR
  de `athlete-onboarding-baseline` antes de implementar, para checar se havia uma razão real
  (ex.: o caminho incremental não existia ainda naquele momento) que a remoção precisaria
  substituir por outra coisa. Se a leitura não revelar motivo válido, a remoção segue como
  planejada.
