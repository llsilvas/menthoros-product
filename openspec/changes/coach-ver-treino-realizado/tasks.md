# Tasks — coach-ver-treino-realizado

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (fluxo cruza o contrato da API: E2E cobre abrir o dialog).
Referência visual: canvas artboard B e `prototype/execucao-treino` (`d02e770`).

## Plano de execução (refinado no `/implement init`, 2026-11-05)

Branch `feat/coach-ver-treino-realizado` nos dois repos, base `origin/develop` (backend `bac3833`,
front `d1a687e`). Worktrees: `.worktrees/backend-coach-ver-treino-realizado` e
`.worktrees/front-coach-ver-treino-realizado`.

Sequência e dependências:

1. **0.1** primeiro (usa `src/test/resources/fit/corrida-15km-16laps.fit`, 570 KB, mais um `.fit`
   longo real): destrava 1.2 e 2.2.
2. **Backend 1.1 → 1.2 → 1.3 → 1.4**; **1.5** e **1.6** independentes (podem vir em qualquer ponto).
3. **2.1** é puro e não depende de nada: pode ir junto com a seção 1. **2.2** depende de 0.1, 1.1 e
   1.3; **2.3** de 1.4 e 2.2; **2.4** de 2.2.
4. **Front 3.x** depende só do contrato (D3), não do backend rodando: tipos à mão + fixture.
   A fixture real (R3) é capturada depois de 1.4/2.3 e substitui a escrita à mão.
5. **4.x** depende de 3.x. **4.5** (E2E) roda contra o backend local com 1.x e 2.x.
6. **0.8** e **0.2** antes de abrir o PR; **0.9** antes do merge.
7. PRs: **front primeiro** (recomendação do QA, ver seção QA — confirmar no `/pr`); backend depois. Se 0.8 der cobertura
   baixa, as tasks 2.x saem num PR seguinte do backend (Q3).

## 0. Validação antes de implementar

- [x] 0.1 **Bloqueia 1.2 e 2.2.** Ler mensagens `record` (`timestamp`, `heart_rate`) de um `.fit`
  real de 2 h e de um ultra, medindo tempo e memória do parse (A7, R6). Registrar aqui.
  verify: número de amostras, intervalo típico entre amostras e tempo de parse anotados aqui.
  **Resultado (2026-11-05):** sonda com FIT SDK 21.205.0 sobre `corrida-15km-16laps.fit` (o
  `.fit` de `~/Downloads` é a mesma atividade; não havia `.fit` de 2 h ou ultra à mão). 5.619
  `record`, todos com FC; intervalo de 1 s em 5.613 casos e 5 pausas maiores que 5 s (10, 34, 56 e
  247 s, mais uma); nenhum timestamp repetido. Parse completo em 40–95 ms, ~50 MB de heap
  transitório (dominado pelo SDK). Session: elapsed 6.032 s, timer 5.613 s, `enhanced_max_speed`
  3,387 m/s, temperatura 19–27 °C. Soma esperada pelas regras do D6: 5.613 + 5 × 5 + 1 = 5.639 s.
  Extrapolação para ultra de 24 h a 1 Hz: ~86 mil amostras, ~3 MB em `(long, int)` e ~1,5 s de
  parse — aceitável sem streaming; R6 fica sem ação.
- [x] 0.2 Semântica de `duracaoMin` por origem (`.fit`, Strava, intervals.icu, manual): elapsed ou
  tempo em movimento (A5). Registrar aqui.
  verify: uma linha por origem, com o arquivo:linha onde `duracaoMin` é preenchido.
  **Resultado (2026-11-05):**
  - `.fit`: **elapsed** (`FitTreinoPersister.java:127`, `Session.total_elapsed_time`); o tempo em
    movimento fica em coluna própria (`total_timer_time`).
  - Strava: **movimento** (`StravaActivityServiceImpl.java:650`, `moving_time`).
  - intervals.icu: **movimento** (`IntervalsIcuActivityMapper.java:89`, `moving_time`).
  - manual: o que o atleta digita (`TreinoServiceImpl.java:587`).
  Consequência: o comparativo já usa tempo em movimento com fallback (D5). No D6, a cobertura
  mínima passa a usar o mesmo denominador (tempo em movimento, fallback `duracaoMin`): com
  elapsed, um treino com pausa longa cairia abaixo de 50 % sem falta de FC.
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

- [x] 1.1 Migration `V111` (só `ADD COLUMN ... NULL`): `velocidade_max_kmh`, `temperatura_min_c`,
  `temperatura_max_c`, `tempo_em_zonas JSONB` em `tb_treino_realizado`; campos em
  `entity/TreinoRealizado.java`. Reconferir `V109`/`V110` em `develop` e branches abertas.
  verify: `./mvnw clean verify` sobe o contexto com Flyway (Testcontainers) sem erro de validação.
- [x] 1.2 `services/impl/FitParseServiceImpl.java`: `velocidadeMediaKmh`, `velocidadeMaxKmh`,
  `temperaturaMinC`, `temperaturaMaxC` da Session (D2) em `dto/fit/FitSessionData.java` /
  `SessaoBruta`; teste com `.fit` com e sem os campos (CA12).
  verify: `FitParseServiceImplTest` com `corrida-15km-16laps.fit` lê os quatro campos; sentinela → `null`.
- [x] 1.3 `services/helper/FitTreinoPersister.java`: gravar os campos novos e o ritmo/velocidade
  média da sessão; teste.
  verify: `FitTreinoPersisterTest` afirma os campos persistidos e o fallback quando ausentes.
  **Feito parcialmente de propósito (2026-11-05):** grava `velocidadeMedia` (km/h), mas
  `paceMedia` continua nulo no `.fit`. `paceMedia` alimenta TSS (`TssCalculatorService`),
  inferência de limiar, projeção de prova e prompts. Preenchê-lo mudaria esses cálculos para todo
  import `.fit`, fora do escopo desta change. O ritmo da tela sai da velocidade (front, 3.2).
  Velocidade fora de (0, 150] km/h → nula.
- [x] 1.4 `dto/output/TreinoRealizadoOutputDto.java` + `mapper/TreinoMapper.java`:
  `velocidadeMaxKmh`, `temperaturaMinC`, `temperaturaMaxC`, `elapsedTimeSeg`;
  `dto/output/EtapaRealizadaOutputDto.java`: elevação ganho/perda (D3). Teste do mapper e
  `@WebMvcTest` do `GET /realizados/{id}` com presença e ausência (`NON_NULL`).
  verify: `TreinoRealizadoControllerTest` isolado (memória: verify local mascarou contexto quebrado).
- [x] 1.5 `TreinoPlanejadoResumoDto` (`AtletaPerfilCoachOutputDto`): `treinoRealizadoId`, montado
  de `TreinoPlanejado.treinoRealizado` em `CoachAthleteProfileServiceImpl.java:329`, e
  `ritmoAlvo`; distância ausente sai nula, não `0.0` (D3, CA1, CA4). Teste da montagem com e sem
  vínculo e com distância ausente.
  verify: `CoachAthleteProfileServiceImplTest` cobre os três casos; sem N+1 novo (vínculo já
  carregado ou `JOIN FETCH`).
- [x] 1.6 Teste de isolamento de tenant no `GET /realizados/{id}` (CA14), se ainda não existir.
  verify: teste de outro tenant → 404.
  **Já existia:** `OnboardingSensitiveDataAccessIT.outroTenantERejeitado` (TECNICO de outro tenant
  → 404, via `findByIdAndTenantId`). Nada novo.
- Validação: `./mvnw clean verify`.

## 2. Backend — tempo em zonas

- [x] 2.1 `TempoEmZonasCalculator.calcular(amostras, zonas)` puro, com as regras do D6. Testes:
  série regular; pausa > 5 s; última amostra; timestamp repetido/invertido; amostra sem FC; borda
  compartilhada; lacuna entre faixas manuais; FC abaixo de Z1 e acima de Z5; cobertura < 50 % →
  nulo; sem amostras; soma ±1 s (CA9).
  verify: teste unitário por regra, sem Spring.
- [x] 2.2 Parse coleta `(timestamp, heartRate)` dos `record` (D2); persister resolve as zonas por
  `services/helper/ZonaTreinoService.zonasFC(atleta)` só quando confiáveis (D6), chama o
  calculador e grava `tempo_em_zonas` com os limites. Testes: atleta `MANUAL`, atleta com
  `fcLimiar`, atleta só com FC estimada → nulo, `.fit` real (CA9, CA10).
  verify: com `corrida-15km-16laps.fit`, soma das zonas = 5.639 s (±1 s; ver 0.1).
  **Feito (2026-11-05):** `FitAmostraFc` em `dto/fit`; parse guarda até 200 mil amostras (~55 h a
  1 Hz) e acima disso descarta todas, sem recusar o arquivo. Zona do topo grava `bpmMax` nulo (ela
  recebe tudo acima). FC de limiar `0` não conta como informada.
- [x] 2.3 Expor `tempoEmZonas` no DTO (D3); teste do mapper e do `@WebMvcTest`.
  verify: JSON do `GET /realizados/{id}` no formato do D3; ausente quando nulo.
  **Já entregue na 1.4** (`TreinoMapperExecucaoTest`, `TreinoRealizadoControllerTest`).
- [x] 2.4 Teste: mudar as zonas do atleta depois do import não altera `tempoEmZonas` do treino
  (CA9).
  verify: teste de integração com troca de zonas entre import e leitura.
  **Feito:** `FitTempoEmZonasHistoricoIT` (import real → muda o limiar → detalhe igual).
- Validação: `./mvnw clean verify`.

## 3. Frontend — contrato e dados

- [x] 3.1 Tipo de leitura `TreinoRealizadoDetalhe` alinhado ao DTO (D3); `TreinoService.obterRealizado`
  (`src/api/services/TreinoService.ts`) passa a devolvê-lo. Conferir consumidores atuais
  (`useDecouplingRealizado`). `treinoRealizadoId` e `ritmoAlvo` em `src/types/AtletaPerfilCoach.ts`
  (resumo; distância anulável) e `treinoRealizadoId` em `src/types/PlanoReview.ts`; ajustar
  consumidores do resumo ao `null` (`CurrentWeekPlan`, `coachInboxAdapters`).
  verify: `npm run build` sem erro de tipo; testes atuais de `CurrentWeekPlan` verdes.
- [x] 3.2 Adapter `features/coach/adapters/treinoRealizadoDetalheAdapters.ts`
  (`buildExecucaoFromDetalhe(detalhe, planejado)`, D4, D5): linhas do comparativo com diferença e
  critério, zonas com alvo normalizado (`Z2`, `z2-z3`, inválido → vazio) e "% no alvo", linhas das
  etapas e Total da sessão, grupos do acordeão, `--` para ausente, vírgula decimal. Testes com
  fixture capturada do backend (R3), incluindo treino manual sem voltas e sem zonas.
  verify: `*.test.ts` puro cobre cada linha do D5 e cada forma de `zonaAlvo`.
  **Feito (2026-11-05), com uma pendência:** a fixture do teste segue a forma do D3 com os números
  da sonda da 0.1, mas **não foi capturada de um backend rodando** (R3). Capturar na 4.5, com o
  backend local, e trocar a fixture se divergir. View model em `features/coach/types/ExecucaoTreino.ts`
  (nome distinto do tipo de API `TreinoRealizadoDetalhe`). Ritmo do `.fit` sai de `velocidadeMedia`
  (ver 1.3).
- [x] 3.3 `features/coach/hooks/useTreinoRealizadoDetalhe(id)` e `useAnaliseTreinoRealizado(id,
  temRpe)` com `status`/`data`/`refetch` (D4). Mapeamento 200 `COMPLETED` → pronta, 204 + RPE →
  indisponível, 204 sem RPE → semRpe, `FAILED`/erro → erro, sem banner (CA5–CA7). Testes.
  verify: teste de hook por estado, com o serviço mockado.
  **Feito:** status ganhou `ociosa` (sem id). Sem RPE o hook não chama o backend (a análise depende
  do RPE), como o `TreinoCard` já fazia. `PENDING` conta como indisponível.
- Validação: `npm run lint && npm run build && npm run test:run`.

## 4. Frontend — tela

- [x] 4.1 `ExecucaoTreinoDialog` (sobre `src/shared/components/CoachDialog.tsx`) +
  `ExecucaoAnaliseBanner` + `ExecucaoComparativo` (CA3–CA7, CA13).
  verify: testes de componente para carregando, erro com "Tentar de novo" e os quatro estados da
  análise.
- [x] 4.2 `ExecucaoZonas` (CA8, CA10) e `ExecucaoEtapas` com cabeçalho fixo e estado vazio (CA11).
  verify: testes de alvo único, faixa, sem alvo, sem `tempoEmZonas`, sem voltas.
- [x] 4.3 `ExecucaoDadosRelogio` (acordeão fechado; só RPE e comentário em percepção — Q2).
  verify: teste confirma fechado por padrão e `--` em ausentes.
- [x] 4.4 Botão "Ver realizado": `features/coach/components/TreinoPlanejadoCard.tsx` via
  `actions`/`rodape` em `CurrentWeekPlan` e `PlanoDetalhePanel`; `TreinoCard` (Planos, renderizado
  em `PlanoSemanaPanel.tsx:195`) via `onVerRealizado`, trocando o fetch inline da análise pelo
  hook da 3.3 e repassando o estado inteiro ao dialog (D4, CA3) (CA1, CA2). Testes:
  abrir antes da resposta da análise, depois de 204 e depois de falha, com uma única chamada; testes
  de componente com router real (regra de links do front).
  verify: botão presente só com `treinoRealizadoId` nos três lugares; uma chamada de análise.
  **Feito (2026-11-05):** `VerRealizadoAcao` (botão + dialog) usado nos três cards. No `TreinoCard`
  de Planos o botão e o dialog ficam dentro do próprio card, que já é dono do estado da análise —
  em vez do prop `onVerRealizado` do D4, que obrigaria o pai a receber esse estado. Sem router nos
  testes de componente: o dialog não tem links.
- [x] 4.5 E2E em `tests/e2e/coach/` (novo `execucao-treino.spec.ts`): (a) Planos → "Ver realizado"
  → comparativo, faixa de zonas, etapas, acordeão; (b) shell do coach (`CurrentWeekPlan`) → "Ver
  realizado" abre o mesmo dialog; (c) análise 204 com RPE (texto de indisponível) e sem RPE.
  verify: `npm run test:e2e -- execucao-treino` verde e visitando os três caminhos.
  **Feito:** 4 cenários verdes; suíte E2E completa verde (142). Como os demais specs do coach, o
  backend é interceptado com `page.route` (não roda contra o backend local, como este item
  previa); o payload segue o D3. **Pendente da 3.2/R3:** capturar o JSON real de um `.fit`
  importado no backend local e conferir contra a fixture — vai junto da 5.1.
- Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## QA (2026-11-05)

Revisores Claude (code, security, clean-code backend; frontend, clean-code front), Codex no front
(no backend o Codex recusou por capacidade duas vezes; DeepSeek no lugar). Corrigido:
- N+1 no plano vigente do perfil do coach: realizado e sensações em fetch join
  (`PlanoSemanalRepositoryVigenteRealizadoIT`).
- Nota de execução da IA em escala 1–10 (o front mostrava /100).
- Tolerâncias do D5 decididas pelo valor exato, não pelo arredondado da tela; folga de ponto
  flutuante na fronteira.
- Teto do peso por amostra adaptativo (`max(5 s, 2 × intervalo típico)`, D6) — decisão do dono do
  produto: gravação inteligente do Garmin subcontaria com teto fixo.
- Regra de zonas confiáveis em `ZonaTreinoService.zonasFCConfiaveis`; `NaN` de velocidade descarta o
  campo; tabela de voltas focável; valores parciais sem zero inventado.
- **Ordem dos PRs — recomendação:** front primeiro. O backend tira `distanciaKm = 0.0` do resumo; com o
  front antigo em produção, treino sem distância mostraria "undefined km". O front novo funciona
  com o backend antigo (sem vínculo, o botão não aparece).

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
