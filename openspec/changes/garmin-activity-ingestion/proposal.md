**Tamanho:** M · **Trilha:** Full

# Proposal — garmin-activity-ingestion

Terceira das três changes do canal Garmin direto (ADR-0013). Depende de `garmin-connection`
(mapeia `userId` → atleta; o webhook já existe). Entrega a **ingestão do treino realizado** pelo
push `activityFiles` da Activity API: o FIT original do relógio entra pelo pipeline FIT que já
existe. Fecha o canal e remove a flag `garminHabilitado`.

## Status

- ready-for-agent (2026-10-23): grilling concluído, ADR-0013 aceito, seams confirmadas, revisão
  ponytail aplicada (sem mapper novo, sem binário no banco, sem worker assíncrono dedicado).
  Bloqueada por `garmin-connection` em produção no ambiente de testes.

## Why

Sem o realizado, o treinador não vê a execução do atleta Garmin que saiu do intervals.icu — e a
Direção 3 da bússola (planejado × executado) fica cega para o canal novo. A Activity API entrega,
por push, o arquivo FIT que o relógio gravou; `FitParseServiceImpl` e `FitTreinoPersister` já
transformam esse arquivo em treino realizado com etapas e running dynamics, deduplicado por
`atletaId-serial-startTime`. O que falta é receber o ping, baixar o arquivo dentro de 24 h e
registrar a atribuição "Garmin [modelo]" que a licença exige.

## What Changes

- Webhook Garmin (de `garmin-connection`) passa a aceitar a chave `activityFiles`: cada item é
  gravado numa tabela de pings e a resposta é 200 antes de qualquer download. Só corrida e só
  atividade de dispositivo (`manual=false`) entram; o resto é marcado como descartado sem baixar.
- Um job a cada minuto processa pings pendentes: baixa o FIT pelo `callbackURL` (uma vez só; o
  link vale 24 h e repetir dá 410), parseia em memória, persiste via `FitTreinoPersister` e
  descarta o binário. Falha de download/parse fica registrada no ping com tentativas limitadas.
- `FitTreinoPersister.persistir` recebe `deviceName` opcional; `TreinoRealizadoOutputDto` expõe
  `deviceName` para a atribuição.
- Front: atribuição **"Garmin [modelo]"** (ou "Garmin" quando desconhecido) visível junto ao
  título em todo lugar que mostra treino realizado com `fonteDados = GARMIN` — card do atleta,
  análise, calendário/lista do treinador e exports. Flag `garminHabilitado` removida: o canal
  fica disponível ao atleta Garmin.
- "Melhores esforços" fica indisponível para atleta de canal Garmin (painel com aviso), até
  `add-athlete-best-efforts` calcular a partir do FIT.
- Migration única: `tb_garmin_ping`.

## Capabilities

### New Capabilities
- `garmin-activity-ingestion`: recepção do push de atividade do Garmin, download único do FIT
  dentro da janela, filtro de modalidade e de atividade manual, persistência pelo pipeline FIT,
  atribuição de origem "Garmin [modelo]" em toda exibição do treino.

### Modified Capabilities
- `watch-connection-guide`: a linha "Relógio" do treinador e o chip de sincronização passam a
  refletir a conexão Garmin direta (última atividade recebida, erro de permissão
  `ACTIVITY_EXPORT`).

## Impact

- **Backend:** `GarminWebhookController` (chave `activityFiles`), entidade/tabela
  `tb_garmin_ping`, `GarminPingProcessorScheduler` (`@Scheduled` 1 min, lotes pequenos, transação
  só na persistência), `GarminClient.baixarArquivo(callbackUrl)`, `FitTreinoPersister.persistir(…,
  deviceName)`, `TreinoRealizadoOutputDto.deviceName`, `TreinoMapper`. Dedup e TSS/carga do dia
  continuam em `IngestaoTreinoRealizadoService.registrar` — nada novo ali.
- **Frontend:** componente `FonteAttribution` ("Garmin [modelo]") usado em `TodayFeedbackCard`,
  análise do treino, `RecentTrainingsPanel`, calendário do treinador e exports PDF/CSV;
  `MelhoresEsforcosPanel`/`EffortsBlock` com estado "indisponível para Garmin";
  `SyncStatusChip`/`CoachWatchLine` com dados da conexão Garmin; remoção de `garminHabilitado`.
- **Não toca:** `FitParseServiceImpl`, `IngestaoTreinoRealizadoService`, scheduler/pull do
  intervals.icu, Strava.

## Critérios de aceite

- **CA1 — Ping gravado antes de processar.** Given POST com `{"activityFiles":[…]}` e segredo
  correto, When recebido, Then cada item vira linha `PENDENTE` em `tb_garmin_ping` (unicidade por
  `summaryId`; repetido é ignorado) e a resposta 200 sai sem nenhuma chamada ao Garmin.
- **CA2 — Filtro.** Given item com `activityType` fora de {RUNNING, TRAIL_RUNNING,
  TREADMILL_RUNNING, INDOOR_RUNNING, VIRTUAL_RUN, TRACK_RUNNING, ULTRA_RUN} ou `manual=true`,
  Then a linha nasce `DESCARTADO` com motivo e o `callbackURL` nunca é chamado.
- **CA3 — Ingestão.** Given ping `PENDENTE` de `userId` conectado e `callbackURL` que devolve
  `corrida-15km-16laps.fit`, When o job roda, Then existe `TreinoRealizado(fonteDados=GARMIN,
  deviceName="Garmin Forerunner 970", externalId=<atletaId>-<serial>-<start>)` com 16 etapas, TSS
  calculado e carga do dia atualizada; o ping fica `PROCESSADO` com o id do treino; nenhum byte do
  FIT persiste.
- **CA4 — Idempotente com upload manual.** Given o atleta já subiu o mesmo FIT à mão, When o ping
  chega, Then nenhum treino novo é criado e o ping fica `PROCESSADO` apontando para o existente.
- **CA5 — Download falha.** Given `callbackURL` responde 5xx ou timeout, Then o ping volta a
  `PENDENTE` com `tentativas+1`; na 5ª falha fica `ERRO` com motivo. Given 410 (já baixado),
  Then `ERRO` imediato sem retry.
- **CA6 — userId desconhecido ou conexão inativa.** Then o ping fica `DESCARTADO` com motivo,
  sem download.
- **CA7 — Janela de 24 h.** Given ping `PENDENTE` com `criadoEm` > 23 h, Then o job o processa
  antes dos demais; passado de 24 h sem sucesso, fica `ERRO` "expirado".
- **CA8 — Atribuição.** Given treino `fonteDados=GARMIN` com `deviceName`, When exibido no card de
  hoje, na análise, na lista do treinador, no calendário e num export, Then o texto "Garmin
  Forerunner 970" aparece junto ao título, fora de tooltip ou área recolhida; sem `deviceName`,
  aparece "Garmin". Treino de outra fonte não mostra atribuição Garmin.
- **CA9 — Esforços.** Given atleta com conexão Garmin ativa, Then a aba/painel de melhores
  esforços mostra "Indisponível para o canal Garmin por enquanto" em vez de chamar o intervals.icu.
- **CA10 — Flag removida.** Then `garminHabilitado` não existe mais e o atleta Garmin vê "Conectar
  Garmin" sem configuração.

## Métrica de sucesso

- ≥ 95 % dos pings `activityFiles` de corrida processados em até 15 min, nas 4 primeiras semanas.
- Zero pings expirados (CA7) por mês após a estabilização.

## Open Questions & Assumptions

- **Assumido:** `deviceName` do ping é a string que a licença chama de "device model" ("Garmin
  Forerunner 970"); exibida como vem, sem normalização.
- **Assumido:** `TipoTreino` do treino Garmin segue a regra atual do pipeline FIT (`CONTINUO`
  fixo, D0.6 da change de FIT). Inferir LONGO/TEMPO_RUN como o intervals.icu faz é melhoria
  separada.
- **Assumido:** manter o ping processado por 30 dias para auditoria e depois apagar
  (`@Scheduled` diário); sem o FIT, a linha é pequena.
- **Aberto (fora desta change):** aviso e prazo de 30 dias para atletas Garmin ainda no
  intervals.icu — change XS própria quando o número (Q11) existir.
