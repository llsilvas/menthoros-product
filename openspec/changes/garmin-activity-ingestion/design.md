# Design — garmin-activity-ingestion

## Context

Ver `proposal.md` e ADR-0013. Estado que molda o desenho:

- `FitUploadServiceImpl.importar(atletaId, InputStream)` = `FitParseService.parse(in)` (fora de
  transação) → `FitTreinoPersister.persistir(atletaId, dados)` (transacional): monta
  `TreinoRealizado(fonteDados=GARMIN, criadoPor=GARMIN, externalId=<atletaId>-<serial>-<start>,
  tipoTreino=CONTINUO)` com etapas e chama `IngestaoTreinoRealizadoService.registrar` (dedup por
  `UNIQUE(tenant_id, fonte_dados, external_id)`, TSS, evento de análise, carga do dia). Não há
  `deviceName` em `FitSessionData`; `TreinoRealizado.deviceName` existe (o intervals.icu preenche).
- `TreinoRealizadoOutputDto` tem `fonteDados` e `externalId`, não `deviceName`.
- Webhook Garmin (`garmin-connection`): `POST /api/v1/garmin/webhook/{segredo}`, corpo roteado
  pela chave da lista; `activityFiles` hoje cai em "chave desconhecida → 200".
- Activity API: item de `activityFiles` traz `userId`, `summaryId`, `fileType` (FIT/TCX/GPX),
  `callbackURL` (token próprio, válido 24 h, segundo download → 410), `activityType`,
  `deviceName`, `startTimeInSeconds`, `activityId`, `manual`. Starter: 50 downloads/min por client
  ID. Push tem timeout de 30 s; responder 200 antes de processar.
- `IntervalsIcuRetrySchedulerImpl` é o molde de `@Scheduled` que processa um lote de linhas
  pendentes com transações curtas e HTTP fora delas.
- `MelhorEsforcoServiceImpl` usa `pace-curves` do intervals.icu (não existe no Garmin).
- Front: `TodayFeedbackCard`, `RecentTrainingsPanel`, `CoachCalendarPage`, análise do treino,
  exports; `SyncStatusChip`, `CoachWatchLine`; flag `garminHabilitado` de `garmin-connection`.

## Goals / Non-Goals

**Goals:**
- Zero mapper novo: o FIT é a verdade e o pipeline já existe.
- Nunca perder um arquivo por causa do download único: o ping é persistido antes do 200.
- Nunca guardar o binário (licença 15.11(e)).
- Atribuição completa na primeira entrega (licença 6.4; 14 dias para corrigir).

**Non-Goals:**
- Resumos `activities`/`activityDetails`/`moveIQ`; TCX/GPX (raros — descartados com motivo);
  histórico (Starter não tem); inferência de `TipoTreino`; cálculo de melhores esforços a partir
  do FIT (`add-athlete-best-efforts`); aviso de migração aos atletas do intervals.icu.

## Decisions

### D1: `tb_garmin_ping` como fila durável mínima
Colunas: `id`, `tenant_id`, `atleta_id` (resolvido na recepção via `IntegracaoExterna(GARMIN,
externalAthleteId=userId)`), `user_id`, `summary_id` UNIQUE, `activity_id`, `callback_url`,
`activity_type`, `device_name`, `start_time`, `manual`, `status` (PENDENTE, PROCESSADO,
DESCARTADO, ERRO), `motivo`, `tentativas`, `treino_realizado_id` nullable, `criado_em`,
`processado_em`. Sem `bytea`. Padrão de tabela do CLAUDE.md do backend (UUID, TIMESTAMPTZ,
índice `(tenant_id, status)` e `(status, criado_em)`). Alternativa rejeitada: baixar inline no
request — se a persistência falhar depois do 200, o arquivo some para sempre.

### D2: Recepção decide descarte sem rede
`GarminWebhookController` → `GarminPingService.registrar(List<JsonNode>)` em transação curta:
`summaryId` repetido → ignora; `activityType` fora do conjunto de corrida, `manual=true`,
`fileType != FIT`, ou `userId` sem conexão ativa → `DESCARTADO` com motivo; senão `PENDENTE`. O
controller responde 200 depois disso (dois `INSERT`, bem abaixo de 30 s). Conjunto de corrida:
`RUNNING, TRAIL_RUNNING, TREADMILL_RUNNING, INDOOR_RUNNING, VIRTUAL_RUN, TRACK_RUNNING, ULTRA_RUN`.

### D3: `GarminPingProcessorScheduler` a cada minuto
Lote de até 20 pings `PENDENTE` ordenados por `criado_em` (mais antigo primeiro = mais perto de
expirar), com `tentativas < 5` e `criado_em > now − 24 h`. Para cada um: marca `SINCRONIZANDO`
(claim em TX própria, como o processor do intervals.icu); fora de TX, `GarminClient.baixarArquivo`
+ `FitParseService.parse`; em TX, `FitTreinoPersister.persistir(atletaId, dados, deviceName)` e
`PROCESSADO` com `treino_realizado_id`. Erros: 5xx/timeout → `PENDENTE`, `tentativas+1`; 410/404
→ `ERRO`; `FitParseException` → `ERRO` sem retry; `DataIntegrityViolation` do dedup é tratado por
`registrar` (treino existente) → `PROCESSADO`. Pings com mais de 24 h → `ERRO "expirado"` pelo
mesmo job. Alternativa rejeitada: `@Async` por ping — perde o controle de lote e de retry que o
scheduler dá de graça. `shortcut: 20 pings/min por instância; com 50/min de cota do Garmin e
mais de ~200 corridas/dia, subir o lote`.

### D4: `deviceName` entra pelo persister
`FitTreinoPersister.persistir(UUID atletaId, FitSessionData dados, @Nullable String deviceName)`;
`FitUploadServiceImpl` passa `null`. `TreinoMapper` expõe `deviceName` no
`TreinoRealizadoOutputDto`. Alternativa rejeitada: `UPDATE` depois da persistência — segunda
escrita para um campo que cabe na primeira.

### D5: Limpeza dos pings
`@Scheduled` diário apaga pings `PROCESSADO`/`DESCARTADO` com mais de 30 dias; `ERRO` fica 90
dias para investigação.

### D6: Atribuição por componente único no front
`FonteAttribution({ fonteDados, deviceName })` renderiza "Garmin [deviceName]" ou "Garmin" para
`GARMIN`, nada para as demais fontes; usado nos cinco pontos de exibição e nos exports (texto
plano em CSV, linha abaixo do título no PDF). Não usa o logo (evita as regras do tag logo).
Alternativa rejeitada: `fonteDados.label` genérico — a licença pede o modelo do dispositivo.

### D7: Melhores esforços
`MelhoresEsforcosPanel`/`EffortsBlock`: se a conexão de canal é Garmin, renderiza aviso e não
chama o endpoint. Backend: `MelhorEsforcoServiceImpl` devolve 409 "indisponível para o canal
Garmin" quando a conexão de canal não é intervals.icu, em vez de tentar `pace-curves`.

### D8: Flag `garminHabilitado` removida
Último passo da change; a conexão Garmin passa a ser oferecida a todo atleta com marca GARMIN.

## Risks / Trade-offs

- [Falha entre download e persistência] → o link já foi consumido (410 no retry); o ping vai a
  `ERRO` com motivo e o treinador vê "treino não chegou" via `watch-connection-guide`; o atleta
  pode subir o FIT à mão (mesmo dedup). Aceito: janela de risco de milissegundos.
- [FIT de relógio antigo sem `serialNumber`] → `externalId` usa `0` como serial (comportamento
  atual do persister); colisão só se dois arquivos do mesmo atleta tiverem o mesmo `startTime`.
- [Cota de 50 downloads/min] → lote de 20/min por instância, uma instância. Ver D3.
- [`deviceName` ausente] → "Garmin" (permitido pelas brand guidelines).
- [Atribuição esquecida num ponto novo da UI] → teste de componente cobre os cinco pontos; a
  licença dá 14 dias para corrigir.

## Migration Plan

1. Migration `tb_garmin_ping` + deploy; o webhook já recebe `activityFiles` e começa a enfileirar.
2. Habilitar `activityFiles` no Developer Portal (endpoint configuration) para o ambiente de
   testes; validar CA1–CA7 com relógio real.
3. Produção: habilitar o summary type após a troca do webhook; remover `garminHabilitado`.
4. Rollback: desabilitar o summary type no portal ("On Hold" segura até 7 dias sem perder dado);
   reverter o deploy.

## Open Questions

- Se o Garmin mandar `activityFiles` também para atividade editada depois (mesmo `activityId`,
  `summaryId` novo), o dedup do persister já evita duplicar; decidir se atualiza o treino
  existente só quando aparecer um caso real. Não muda spec nem tasks.
