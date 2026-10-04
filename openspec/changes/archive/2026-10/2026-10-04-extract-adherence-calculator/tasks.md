# tasks — extract-adherence-calculator

Repositório único: `apps/menthoros-backend`, branch `refactor/extract-adherence-calculator`
(tipo dominante: refactor — ver "Diretrizes de Git" no `CLAUDE.md` do workspace).

## 1. Criar `AdherenceCalculator` com os métodos de `AtletaProgressServiceImpl`

- [x] 1.1 **Feito.** Blocos `getAderencia4Semanas`/`getAderenciaSemanal` recriados em
      `AdherenceCalculatorTest` (mesmas asserções, tenantId agora explícito).
- [x] 1.2 **Feito.** `AdherenceCalculator` criado (`@Component`, pacote `services.impl`) com os
      dois métodos movidos de `AtletaProgressServiceImpl`, mesma lógica.
      *verify:* `./mvnw test -Dtest=AdherenceCalculatorTest` — 20 testes verdes.
- [x] 1.3 **Feito.** `AtletaProgressServiceImpl` injeta `AdherenceCalculator`; os dois métodos
      públicos viraram fachada fina (resolve tenantId + valida atleta, delega o resto).
- [x] 1.4 **Feito.** `AtletaProgressServiceImplTest`: blocos antigos substituídos por 2 testes de
      delegação por método (atleta não existe → exceção sem tocar o calculator; delega e repassa
      o retorno). `treinoPlanejadoComRealizado` e o import de `StatusSincronizacao` removidos
      (ficaram sem uso).
      *verify:* `./mvnw test -Dtest=AtletaProgressServiceImplTest` — verde.

## 2. Mover os dois caminhos de `ProgressaoTreinoServiceImpl` para `AdherenceCalculator`

- [x] 2.1 **Feito.** Baseline: 44 `@Test` em `ProgressaoTreinoServiceImplTest` antes de tocar
      nos métodos de janela.
- [x] 2.2 **Feito.** Testes diretos de `calcularAderenciaJanelaFechada`/`calcularAderenciaRegraAntiga`
      escritos em `AdherenceCalculatorTest` (CA2–CA12, borda do teto, 3 avulsos, regressões Codex)
      — são testes **novos** chamando o calculator direto, não cópia literal: antes da extração
      esses métodos eram privados e só eram exercitados indiretamente via `calcularHistorico`.
- [x] 2.3 **Feito.** Os dois métodos + `AderenciaJanela` movidos para `AdherenceCalculator`
      (público, aninhado). `@Value` do flag intocado — default continua `false` (CA2).
      *verify:* `./mvnw test -Dtest=AdherenceCalculatorTest` — 20 testes verdes.
- [x] 2.4 **Feito.** Métodos privados e record deletados de `ProgressaoTreinoServiceImpl`;
      `calcularHistorico` chama `adherenceCalculator` direto, mesma composição (data do atleta só
      no caminho novo, `treinoPlanejadoRepository` saiu do campo da classe — só o calculator usa).
- [x] 2.5 **Feito, com desvio deliberado do plano:** em vez de migrar/reescrever os testes de
      `calcularHistorico`, eles ficaram **intocados** — só a construção do
      `ProgressaoTreinoServiceImpl` no `setUp()` passou a injetar um `AdherenceCalculator` real
      (mesmos mocks de repositório). Como nenhuma asserção foi removida ou remockada, o risco que
      o Codex apontou (perder cobertura de orquestração na migração) não se materializa — não há
      "caso de virada de data atleta↔servidor" novo a adicionar, porque nada mudou no que já
      cobria isso (`janelasLegadasNaoUsamFusoDoAtleta`, fora de escopo desta aderência nova).
      *verify:* `./mvnw test -Dtest=ProgressaoTreinoServiceImplTest` — 44 testes verdes.

## 3. Validação e fechamento

- [x] 3.1 **Feito.** Contagem pós-mudança: 44 `@Test` (igual ao baseline de 2.1) — nenhuma
      asserção de orquestração perdida.
- [x] 3.2 **Parcial — ambiente sem Docker.** `./mvnw clean test`: 4.429 testes, 0 Failures, 244
      Errors — todos de `ApplicationContext` falhando em classes `*IT`/`@SpringBootTest` que
      exigem Testcontainers (`docker info` confirma daemon indisponível nesta sessão), nenhum nos
      3 arquivos tocados por esta change. `./mvnw clean verify` não pôde ser executado
      integralmente por essa mesma razão — fica para a sessão que rodar com Docker disponível,
      antes do merge. Confirmado sem regressão nos chamadores (Mockito puro, sem container):
      `AdherenceCalculatorTest` (20), `AtletaProgressServiceImplTest`,
      `ProgressaoTreinoServiceImplTest` (44), `CoachDashboardServiceImplTest`,
      `CoachAthleteProfileServiceImplTest` (73 juntos), `AtletaProgressControllerTest` (25) — todos
      verdes.
- [x] 3.3 **Feito.** `AtletaProgressService` sem mudança de assinatura (CA3, confirmado pelo
      compile dos chamadores). `ProgressaoTreinoServiceImpl` não declara mais
      `calcularAderenciaJanelaFechada`/`calcularAderenciaRegraAntiga`/`AderenciaJanela` (CA4,
      `grep` confirma ausência).
- [x] 3.4 **Feito.** PR **#161** `refactor/extract-adherence-calculator` → `develop`, aberto em
      2026-10-04 e mergeado em 2026-10-04T15:01:20Z (CI com Docker cobriu o `verify` completo,
      pendência da sessão local sem Docker).
