# Tasks — coach-ver-treino-realizado

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (consome o contrato da API: E2E cobre abrir o painel).

## 0. Validação antes de implementar

- [ ] 1.0 Confirmar no FIT SDK em uso que `SessionMesg` tem `getEnhancedMaxSpeed()`,
  `getMinTemperature()` e `getMaxTemperature()` (A2), e checar se a API do intervals.icu expõe
  `max_speed`/temperaturas na atividade (A3). Registrar o resultado aqui. (`min_temperature`
  confirmado no FIT SDK 21.205.0 no pre-mortem parcial.)
- [ ] 1.0b Semântica de `duracaoMin` por origem (`.fit`, Strava, intervals.icu, manual): elapsed ou
  tempo em movimento (A5). Registrar aqui.
- [ ] 1.0c Reexecutar o pre-mortem Codex (caiu por limite de uso em 2026-11-03).
- [x] 1.0d Q2 decidida (2026-11-03): a tela mostra só RPE e comentário do atleta; sono, estresse,
  dor, fadiga e recuperação ficam fora.

## 1. Backend

- [ ] 1.1 Migration (próximo número livre em `develop`; hoje `V108`): `velocidade_max_kmh`,
  `temperatura_min_c`, `temperatura_max_c` nulos em `tb_treino_realizado`; campos em
  `TreinoRealizado`.
- [ ] 1.2 `FitParseServiceImpl`: ler os três campos da Session (D2) para `FitSessionData`; teste com
  `.fit` que tem e que não tem os campos (CA8, CA9).
- [ ] 1.3 `FitTreinoPersister`: gravar os campos novos e o ritmo/velocidade média da sessão (hoje
  só os laps têm); teste de persistência.
- [ ] 1.4 `TreinoRealizadoOutputDto` + `TreinoMapper`: expor os três campos (D3) e `elapsedTimeSeg`; teste do mapper e
  do `@WebMvcTest` do `GET /realizados/{id}` com os campos e com ausência (`NON_NULL`).
- [ ] 1.5 Teste de isolamento de tenant no `GET /realizados/{id}` (CA10), se ainda não existir.
- Validação: `./mvnw clean verify`.

## 2. Frontend — contrato e dados

- [ ] 2.1 Tipo de leitura `TreinoRealizadoDetalhe` alinhado ao `TreinoRealizadoOutputDto` (D3),
  incluindo os campos novos; `TreinoService.obterRealizado` passa a devolvê-lo. Conferir os
  consumidores atuais (`useDecouplingRealizado`).
- [ ] 2.2 Adapter `buildTreinoRealizadoDetalheFromDto` (D4): seções da aba Estatísticas, linhas da
  aba Intervalos, linha Total da sessão, `--` para ausente, pace a partir de km/h, vírgula decimal.
  Testes com fixture capturada do backend (R3), incluindo treino manual sem voltas.
- [ ] 2.3 Hook `useTreinoRealizadoDetalhe(id)` com `loading`/`error`/`refetch`; teste.
- Validação: `npm run lint && npm run build && npm run test:run`.

## 3. Frontend — tela

- [ ] 3.1 `TreinoPlanejadoCard`: botão "Ver realizado" quando há `treinoRealizadoId`, via
  `actions`/`rodape` (D4); ligar em `CurrentWeekPlan` e `PlanoDetalhePanel` (CA1, CA2).
- [ ] 3.2 `TreinoRealizadoDrawer`: cabeçalho, resumo realizado vs. planejado, abas, estados de
  carregando/erro com tentar de novo (CA3, CA7).
- [ ] 3.3 `TreinoRealizadoEstatisticas` (CA4) e `TreinoRealizadoIntervalos` com estado vazio (CA5,
  CA6). Testes de componente.
- [ ] 3.4 Evento de abertura do painel (D5) ou pendência registrada aqui.
- [ ] 3.5 E2E: abrir o plano do atleta, clicar "Ver realizado", ver Estatísticas, trocar para
  Intervalos.
- Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 4. Verificação manual

- [ ] 4.1 Importar um `.fit` real de corrida e conferir os valores do painel contra o Garmin
  Connect do mesmo treino.
