# Tasks — coach-ver-treino-realizado

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (fluxo cruza o contrato da API: E2E cobre abrir o dialog).
Referência visual: canvas artboard B e `prototype/execucao-treino` (`d02e770`).

## 0. Validação antes de implementar

- [ ] 0.1 **Bloqueia 1.2 e 2.2.** Ler mensagens `record` (`timestamp`, `heart_rate`) de um `.fit`
  real de 2 h e de um ultra, medindo tempo e memória do parse (A7, R6). Registrar aqui.
- [ ] 0.2 Semântica de `duracaoMin` por origem (`.fit`, Strava, intervals.icu, manual): elapsed ou
  tempo em movimento (A5). Registrar aqui.
- [ ] 0.4 Reexecutar o pre-mortem Codex sobre esta revisão (o DoR de 2026-11-05 cobriu parte).
- [ ] 0.8 Contar nos tenants piloto: atletas com zonas de FC confiáveis (D6) e fração dos treinos
  realizados das últimas 4 semanas por fonte (`.fit`/Garmin × Strava × intervals.icu × manual)
  (Q3). Aprovação: dono do produto. Se a cobertura esperada da faixa for baixa, entregar o dialog
  sem a faixa primeiro e as tasks 2.x num PR seguinte. Registrar aqui.
- [ ] 0.9 Validar as tolerâncias da diferença (A8) com 1 treinador piloto sobre 5 a 10 treinos
  reais, **antes do merge**: cor errada ensina o treinador a ignorar a tela. Reprovada → ajustar as
  constantes, sem mudar o desenho. Registrar aqui.
- [x] 0.3 Fonte das zonas (R7), resolvida no DoR (2026-11-05): `ZonaTreinoService.zonasFC(atleta)`
  via `AthleteZones.de`, como o `ZoneResolver`; só zonas confiáveis contam (D6).
- [x] 0.5 Confirmado no FIT SDK 21.205.0: `enhanced_max_speed`, `min_temperature`,
  `max_temperature` na Session (pre-mortem parcial, 2026-11-03).
- [x] 0.6 Q2 decidida (2026-11-03): só RPE e comentário do atleta na tela.
- [x] 0.7 Q1 decidida (2026-11-04): dialog, conforme protótipo B.

## 1. Backend — sessão e contrato

- [ ] 1.1 Migration `V111` (só `ADD COLUMN ... NULL`): `velocidade_max_kmh`, `temperatura_min_c`,
  `temperatura_max_c`, `tempo_em_zonas JSONB` em `tb_treino_realizado`; campos em `TreinoRealizado`.
  Reconferir `V109`/`V110` em `develop` e branches abertas.
- [ ] 1.2 `FitParseServiceImpl`: `velocidadeMediaKmh`, `velocidadeMaxKmh`, `temperaturaMinC`,
  `temperaturaMaxC` da Session (D2) em `FitSessionData`/`SessaoBruta`; teste com `.fit` com e sem
  os campos (CA12).
- [ ] 1.3 `FitTreinoPersister`: gravar os campos novos e o ritmo/velocidade média da sessão; teste.
- [ ] 1.4 `TreinoRealizadoOutputDto` + `TreinoMapper`: `velocidadeMaxKmh`, `temperaturaMinC`,
  `temperaturaMaxC`, `elapsedTimeSeg`; `EtapaRealizadaOutputDto`: elevação ganho/perda (D3). Teste
  do mapper e `@WebMvcTest` do `GET /realizados/{id}` com presença e ausência (`NON_NULL`).
- [ ] 1.5 `TreinoPlanejadoResumoDto` (`AtletaPerfilCoachOutputDto`): `treinoRealizadoId`, montado
  do vínculo planejado↔realizado, e `ritmoAlvo`; distância ausente sai nula, não `0.0` (D3, CA1,
  CA4). Teste da montagem com e sem vínculo e com distância ausente.
- [ ] 1.6 Teste de isolamento de tenant no `GET /realizados/{id}` (CA14), se ainda não existir.
- Validação: `./mvnw clean verify`.

## 2. Backend — tempo em zonas

- [ ] 2.1 `TempoEmZonasCalculator.calcular(amostras, zonas)` puro, com as regras do D6. Testes:
  série regular; pausa > 5 s; última amostra; timestamp repetido/invertido; amostra sem FC; borda
  compartilhada; lacuna entre faixas manuais; FC abaixo de Z1 e acima de Z5; cobertura < 50 % →
  nulo; sem amostras; soma ±1 s (CA9).
- [ ] 2.2 Parse coleta `(timestamp, heartRate)` dos `record` (D2); persister resolve as zonas por
  `ZonaTreinoService.zonasFC(atleta)` só quando confiáveis (D6), chama o calculador e grava
  `tempo_em_zonas` com os limites. Testes: atleta `MANUAL`, atleta com `fcLimiar`, atleta só com
  FC estimada → nulo, `.fit` real (CA9, CA10).
- [ ] 2.3 Expor `tempoEmZonas` no DTO (D3); teste do mapper e do `@WebMvcTest`.
- [ ] 2.4 Teste: mudar as zonas do atleta depois do import não altera `tempoEmZonas` do treino
  (CA9).
- Validação: `./mvnw clean verify`.

## 3. Frontend — contrato e dados

- [ ] 3.1 Tipo de leitura `TreinoRealizadoDetalhe` alinhado ao DTO (D3); `TreinoService.obterRealizado`
  passa a devolvê-lo. Conferir consumidores atuais (`useDecouplingRealizado`).
  `treinoRealizadoId` e `ritmoAlvo` em `types/AtletaPerfilCoach.ts` (resumo; distância anulável) e
  `treinoRealizadoId` em `types/PlanoReview.ts`; ajustar consumidores do resumo ao `null`.
- [ ] 3.2 Adapter `buildExecucaoFromDetalhe(detalhe, planejado)` (D4, D5): linhas do comparativo
  com diferença e critério, zonas com alvo normalizado (`Z2`, `z2-z3`, inválido → vazio) e
  "% no alvo", linhas das etapas e Total da sessão, grupos do acordeão, `--` para ausente, vírgula
  decimal. Testes com fixture capturada do backend (R3), incluindo treino manual sem voltas e sem
  zonas.
- [ ] 3.3 `useTreinoRealizadoDetalhe(id)` e `useAnaliseTreinoRealizado(id, temRpe)` com
  `status`/`data`/`refetch` (D4). Mapeamento 200 `COMPLETED` → pronta, 204 + RPE → indisponível,
  204 sem RPE → semRpe, `FAILED`/erro → erro, sem banner (CA5–CA7). Testes.
- Validação: `npm run lint && npm run build && npm run test:run`.

## 4. Frontend — tela

- [ ] 4.1 `ExecucaoTreinoDialog` + `ExecucaoAnaliseBanner` + `ExecucaoComparativo` (CA3–CA7, CA13).
- [ ] 4.2 `ExecucaoZonas` (CA8, CA10) e `ExecucaoEtapas` com cabeçalho fixo e estado vazio (CA11).
- [ ] 4.3 `ExecucaoDadosRelogio` (acordeão fechado; só RPE e comentário em percepção — Q2).
- [ ] 4.4 Botão "Ver realizado": `TreinoPlanejadoCard` via `actions`/`rodape` em `CurrentWeekPlan`
  e `PlanoDetalhePanel`; `TreinoCard` (Planos) via `onVerRealizado`, trocando o fetch inline da
  análise pelo hook da 3.3 e repassando o estado inteiro ao dialog (D4, CA3) (CA1, CA2). Testes:
  abrir antes da resposta da análise, depois de 204 e depois de falha, com uma única chamada; testes
  de componente com router real (regra de links do front).
- [ ] 4.5 E2E: (a) Planos → "Ver realizado" → comparativo, faixa de zonas, etapas, acordeão;
  (b) shell do coach (`CurrentWeekPlan`) → "Ver realizado" abre o mesmo dialog; (c) análise 204
  com RPE (texto de indisponível) e sem RPE.
- Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 5. Verificação manual

- [ ] 5.1 Importar um `.fit` real de corrida e conferir o dialog contra o Garmin Connect do mesmo
  treino, incluindo o tempo em zonas (com as zonas do atleta iguais às do relógio).
- [ ] 5.2 Quatro semanas após o deploy: consulta de cobertura (D7) e entrevista com os pilotos.

## Follow-ups (fora desta change)

- Efeito de treino, respiração, stamina, Body Battery, autoavaliação do relógio no acordeão.
- Distinguir `PENDING` de inexistente em `GET /api/v1/analises/treino/{id}`.
- Tempo em zonas para Strava e intervals.icu.
- Alvo de zona por etapa em treino intervalado.
- Telemetria de produto no front (change própria, transversal).
