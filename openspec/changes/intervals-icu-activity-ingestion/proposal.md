# Proposal: intervals-icu-activity-ingestion

**Tamanho:** M · **Trilha:** Full (novo contrato de API + decisão de design na reconciliação;
backend-only, **uma migration aditiva** — `tb_integracao_externa.auto_sync_pausado` (nova coluna
boolean, V54) para a flag de pausa do Strava por atleta; a dedup DENTRO da mesma fonte,
`uk_treino_realizado_tenant_fonte_external` de V29, já cobre `INTERVALS_ICU` sem migration
adicional)

## Status

DoR 2026-07-15: NOT READY → bloqueador de dedup cross-fonte substituído por flag de pausa do
Strava por atleta (decisão do founder); demais gaps do DoR corrigidos (gate de pareamento, guard
de matching, matriz de erros, non-goals). Re-DoR pendente.

Abre o sentido **pull** da integração intervals.icu entregue em `intervals-icu-workout-push`
(arquivada em `archive/2026-07/2026-07-15-intervals-icu-workout-push/`), que cobriu apenas o
sentido push (planejados → relógio).

## Why

Hoje treinos **realizados** só entram no Menthoros via Strava ou upload de `.fit`. Atletas já
conectados ao intervals.icu (conexão por API key criada pela change-mãe do push) têm suas
atividades concentradas lá — agregadas do Garmin e de outras origens — mas o coach não tem como
trazê-las para dentro do produto. Sem o dado realizado não existe reconciliação com o planejado,
não existe TSS/PMC atualizado e não existe análise pós-treino.

Esta change fecha o ciclo **plano → execução** para o atleta intervals.icu: o coach busca **uma
atividade específica** (id visível na URL do intervals.icu) e a ingere como `TreinoRealizado`,
reutilizando a conexão e o client HTTP já existentes — sem novo onboarding, sem OAuth novo.

Valor para o coach: menos "buraco" no acompanhamento — o treino executado aparece no Menthoros,
reconciliado com o planejado, minutos depois da execução, mesmo para atletas fora do Strava.

## What Changes (backend `apps/menthoros-backend`)

1. **Client:** novo método `buscarAtividade(apiKey, activityId)` no `IntervalsIcuClient`
   (`GET /api/v1/activity/{id}`) + novo record `IcuActivityDto` (padrão dos DTOs `Icu*` atuais).
2. **Serviço de ingestão** (`IntervalsIcuActivityIngestionService`): resolve a conexão ativa do
   atleta (`conexaoAtiva`, tenant-scoped), busca a atividade, valida que é corrida e que pertence
   ao atleta conectado, mapeia para `TreinoRealizado` (`fonteDados=INTERVALS_ICU`,
   `externalId=<icu activity id>`, `status=REALIZADO`), dedup via
   `TreinoDedupHelper.saveIdempotent`, e no insert novo executa o pós-ingestão no padrão
   `FitTreinoPersister`: TSS (`TssCalculatorService`), TSB (`TsbService.atualizarTsbDia`) e
   `TreinoRegistradoEvent`.
3. **Reconciliação imediata:** a decisão de matching (`MatchingDecisionEngine`) roda **inline**
   para o treino importado — o passo de persistência da decisão é extraído do
   `DailyActivitySyncSchedulerImpl` para um colaborador reutilizável. Motivo: o scheduler opera em
   janela D-1..D+1; um treino de dias atrás ficaria `PENDENTE` para sempre e invisível na fila
   manual (que filtra `AMBIGUO`/`NAO_PLANEJADO`). Antes de implementar a heurística de janela, um
   **gate de pareamento** (ver design.md D4) verifica se a activity retornada referencia o evento
   pareado pelo push (`external_id = menthoros-<treinoPlanejadoId>`, gravado pela change-mãe
   `intervals-icu-workout-push`) — se existir, esse vínculo direto vira o match PRIMÁRIO e a
   heurística D-1..D+1 vira fallback só para activities sem evento pareado.
4. **Flag de pausa de sincronização Strava por atleta (substitui matching cross-fonte):** novo
   campo `autoSyncPausado` em `IntegracaoExterna`, endpoints coach-only
   `PATCH /api/v1/strava/pausar-sync/{atletaId}` e `PATCH /api/v1/strava/retomar-sync/{atletaId}`,
   e guarda nos DOIS caminhos automáticos de ingestão do Strava: (a) `DailyActivitySyncSchedulerImpl`
   (via `AtletaRepository.findAllWithStravaConnected`, mais late-check antes de cada persistência)
   e (b) `StravaWebhookServiceImpl.requireIntegration` (evento em tempo real do Strava — skip
   silencioso, sem exceção, para preservar o contrato HTTP 200 do webhook). Decisão do founder: em
   vez de detectar/bloquear colisão cross-fonte automaticamente por heurística de
   tempo+distância+duração (complexidade alta, falsos positivos/negativos), o coach pausa
   manualmente a sincronização automática do Strava do atleta ao habilitá-lo para intervals.icu —
   eliminando a colisão na origem. A flag só cumpre essa promessa cobrindo AMBOS os caminhos
   automáticos (scheduler e webhook) — cobrir só o scheduler deixaria o webhook como brecha aberta.
   Ver design.md D5.2 e "Riscos e mitigações" abaixo para o risco residual (coach esquece de pausar)
   e a precondição bloqueante (409) que fecha o gap do primeiro import.
5. **Endpoint de import:** `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}`
   — `TECNICO`/`ADMIN`, `@RequireTenant(resourceParamIndex = 0)`, retorna o
   `TreinoRealizadoOutputDto` do treino ingerido (200 no insert novo, 200 idempotente se já
   existia — mesma semântica do dedup helper). `activityId` é query param (não path variable — ver
   design.md D5) para não colidir com URLs completas coladas pelo coach. **Precondição bloqueante
   (2ª rodada de pre-mortem, ver "Riscos e mitigações"):** quando o atleta tem Strava ativo **e**
   `autoSyncPausado=false`, o import retorna **409** sem persistir nada — o coach precisa pausar o
   Strava primeiro (ou o atleta não ter Strava conectado).

### Fora de escopo

- Listagem/navegação de atividades do intervals.icu (o coach informa o id; UX de escolha é change
  futura).
- Sync automático, scheduler ou webhook de atividades (esta change é ação manual coach-in-the-loop).
- Frontend (o endpoint fica disponível; tela vem em change própria).
- Modalidades além de corrida: recorte **próprio** desta change {Run, TrailRun, VirtualRun,
  Treadmill} — não é um espelho exato do `RUN_SPORT_TYPES` do Strava, que é {Run, TrailRun,
  VirtualRun} sem Treadmill (verificado em `StravaActivityServiceImpl:53`). Justificativa: esteira
  é corrida para efeito de PMC/TSS mesmo sem GPS; ver design.md D2.
- Streams/samples por segundo (apenas o summary da atividade; laps/etapas ficam para evolução).
- Criptografia at-rest da credencial e circuit breaker (débitos já registrados em
  `add-external-call-resilience`).
- **Backfill/import em lote:** esta change é import manual, uma atividade por vez. Backfill
  paginado com checkpoint (histórico de atividades antigas) é change própria futura.
- **Desligamento *automático* do sync Strava** (levantado no product review, achado confirmado):
  cogitado e descartado em favor da **flag de pausa manual por atleta, controlada pelo coach**
  (item 4 do "What Changes" acima) — resolvida **nesta própria change**, não adiada. Import sem a
  pausa ativa é **bloqueado com 409** (precondição, não aviso — ver CA11); não há matching
  automático por tempo+distância+duração entre fontes diferentes.
- **Refresh de campos em re-import:** re-importar uma activity já alterada na fonte não atualiza os
  campos mapeados (idempotência de criação continua garantida — ver CA2); débito documentado.

## Critérios de aceite

- **CA1 — Ingestão feliz:** Given atleta com conexão intervals.icu ativa e uma activity de corrida
  válida, When o coach chama o endpoint de import, Then um `TreinoRealizado` é criado com
  `fonteDados=INTERVALS_ICU`, `externalId` igual ao id da activity, campos mapeados (data, duração,
  distância, FC média/máx, pace) e a resposta é 200 com o DTO do treino.
- **CA2 — Idempotência:** When o mesmo import é chamado duas vezes, Then a segunda chamada não cria
  registro novo (dedup por `(tenant, fonte, externalId)`), retorna 200 com o treino existente e não
  republica `TreinoRegistradoEvent` nem recalcula TSB.
- **CA3 — Reconciliação imediata:** Given um `TreinoPlanejado` compatível na **mesma janela D-1..D+1
  usada hoje pelo scheduler/revisão manual** (não "mesma data" — ver design.md D4), When o import
  conclui, Then o treino importado sai com `reconciliationStatus` decidido
  (`VINCULADO_AUTOMATICO` com score ≥ 0.80, ou `AMBIGUO`/`NAO_PLANEJADO` conforme thresholds do
  `MatchingDecisionEngine`) e auditoria `TreinoReconciliacao` gravada — sem depender do scheduler,
  e com a MESMA decisão que o scheduler produziria para o caso equivalente (seleção de candidatos
  compartilhada, não duplicada).
- **CA4 — Sem conexão:** Given atleta sem conexão intervals.icu ativa, Then 409 com mensagem clara
  e nada persistido.
- **CA5 — Activity inexistente/inacessível:** Given activity id inexistente ou de outro atleta
  (API key sem acesso → 403/404 do intervals.icu), Then 404 no Menthoros e nada persistido.
- **CA6 — Modalidade não suportada:** Given activity que não é corrida (ex.: Ride), Then 422 e nada
  persistido.
- **CA7 — Isolamento de tenant:** Given `atletaId` de outro tenant, Then 404/403 via
  `@RequireTenant` — nenhuma chamada externa é feita.
- **CA8 — Pós-ingestão:** no insert novo, `tssCalculado` preenchido quando os insumos existem,
  `atualizarTsbDia` chamado para a data do treino e `TreinoRegistradoEvent` publicado exatamente
  uma vez; se a activity tem RPE (`icu_rpe`), ele é mapeado para `percepcaoEsforco`.
- **CA9 — Sem regressão:** `./mvnw clean test` verde; suítes do push intervals.icu, Strava sync e
  reconciliação intactas.
- **CA10 — Pausa de sincronização Strava cobre os DOIS caminhos automáticos:** Given atleta com
  `autoSyncPausado=true` na integração Strava, When o scheduler diário
  (`DailyActivitySyncSchedulerImpl`) roda, Then o atleta é pulado (não aparece em
  `AtletaRepository.findAllWithStravaConnected`, nenhuma tentativa de sync é feita para ele). Given
  o mesmo atleta com `autoSyncPausado=true`, When um evento webhook do Strava (create/update) chega
  para ele em tempo real (`StravaWebhookServiceImpl.handleEventAsync`), Then nenhum
  `TreinoRealizado` é criado/atualizado por esse caminho e o webhook responde 200 normalmente (sem
  exceção — contrato do webhook preservado). Cobrir só o scheduler não é suficiente: o webhook é um
  caminho automático independente para a mesma colisão cross-fonte que a flag existe para eliminar.
- **CA11 — Precondição de pausa do Strava (bloqueante):** Given atleta com Strava conectado
  (`ativo=true`) e **sem** `autoSyncPausado=true`, When o coach chama o import, Then **409** com
  mensagem curada ("pause a sincronização Strava deste atleta antes de importar do intervals.icu")
  e **nada é persistido**. Given atleta com Strava pausado ou sem conexão Strava, Then o import
  prossegue normalmente (200). Given o coach pausa a flag enquanto o scheduler do Strava já está
  processando o lote do ciclo corrente, Then o late-check antes de cada persistência pula aquele
  atleta no ciclo em andamento (sem erro). **Ordem com CA2 (idempotência):** esta precondição só é
  avaliada quando a activity ainda NÃO foi importada antes — Given uma activity já importada
  anteriormente e o atleta com Strava ativo e não pausado, When o coach reenvia o import da mesma
  activity, Then a resposta é 200 com o treino existente, **sem** checar esta precondição (dedup por
  `externalId` tem prioridade — ver design.md D3/D3.1).
- **CA12 — Credencial intervals.icu revogada:** Given atleta com a API key do intervals.icu
  revogada ou expirada (o provedor responde 401/403), When o coach tenta importar uma atividade
  desse atleta, Then a resposta é **409** com mensagem indicando necessidade de reconexão ao
  intervals.icu — distinto de "atividade não encontrada" (CA5), que usa 404.

## Métrica de sucesso

- **Ciclo fechado sem Strava:** no smoke real (atleta founder), um treino executado com o relógio
  aparece no Menthoros **reconciliado ao planejado** em < 2 minutos de ação do coach (colar o id e
  importar), sem tocar em Strava ou arquivo `.fit`.
- **Confiabilidade:** 0 duplicatas criadas por re-import nos testes e no smoke; 100% dos imports
  com planejado compatível na data saem com decisão de reconciliação gravada na mesma requisição.
- **Observabilidade:** contador de imports **bloqueados por 409 de precondição Strava** (sinaliza
  quantos atletas ainda não foram pausados — o coach vê o bloqueio na hora, não precisa de
  métrica para descobrir) + log estruturado de cada late-check que pulou um atleta no scheduler
  (tenantId/atletaId/ciclo) para auditoria do residual TOCTOU documentado em "Riscos e mitigações".

## Open Questions & Assumptions

- **Assumido: o coach obtém o activity id manualmente** (URL do intervals.icu, ex.
  `.../activities/i86400275`). Aceitável para o walking skeleton (MVP com ação manual, fricção
  reconhecida e intencional); a listagem de atividades para seleção com um clique é a evolução
  natural imediata (change futura), não uma promessa vaga de "melhorar depois".
- **Assumido: `GET /api/v1/activity/{id}` com a API key do atleta só acessa atividades do próprio
  atleta** (403/404 caso contrário). Validar no smoke; o serviço ainda confere o
  `athlete_id` retornado contra o `externalAthleteId` da conexão (defesa em profundidade).
- **Assumido: o summary da activity traz os campos necessários** (`distance`, `moving_time`,
  `average_heartrate`, `max_heartrate`, `average_speed`, `icu_rpe`, `type`, `start_date_local`).
  Campos ausentes viram `null` (mesma tolerância do sync Strava).
- **Aberto: TSS da casa vs `icu_training_load`.** Decisão desta change: calcular com
  `TssCalculatorService` (consistência com `.fit`/PMC interno) e guardar o valor do intervals.icu
  em `metadadosSincronizacao` para comparação futura.
- **Aberto: formato/prefixo do activity id** (`i86400275` vs numérico). O endpoint aceita o id como
  `String` opaca e repassa ao intervals.icu; validar formato real no smoke.
- **Aberto: nome real do campo de pareamento na resposta da activity** (gate 0, design.md D4) — o
  probe do smoke precisa confirmar se/como o intervals.icu referencia o evento pareado
  (`external_id = menthoros-<treinoPlanejadoId>`) no payload de `GET /api/v1/activity/{id}`; se não
  houver referência nenhuma, a heurística D-1..D+1 permanece como único mecanismo (não há fallback
  para acionar).
- **Relação com `first-party-ingestion-architecture`:** dado do intervals.icu é third-party
  agregado (Garmin/outras origens repassadas pelo intervals.icu, não capturado diretamente do
  dispositivo). Para o ML acceptance predictor futuro, fica sujeito à MESMA restrição já declarada
  para o Strava naquela change — a decisão formal sobre uso desse dado em modelos de ML pertence a
  `first-party-ingestion-architecture`, não a esta change.

## Riscos e mitigações

Revisado com pre-mortem cross-model (Codex) e product review — 15 + 5 achados incorporados;
detalhamento completo em `design.md` (seção "Pre-mortem"). Síntese dos riscos que sobrevivem à
mitigação de design:

- **Extração do scheduler é mais ampla que persistência da decisão** (Alto): a seleção de
  candidatos (janela D-1..D+1) também precisa ser compartilhada, não só a persistência — do
  contrário import inline e scheduler decidem diferente para o mesmo treino. Mitigado: D4 extrai
  `CandidateSelector` + `ReconciliationDecisionExecutor` juntos, com teste de caracterização do
  comportamento atual ANTES do refactor (Bloco 3 do tasks.md).
- **Premissas não confirmadas da API do intervals.icu** (Alto): formato de `athlete_id`, unidade
  de `average_cadence`, presença de `average_speed` vs `moving_time`/`distance`, semântica exata
  de `start_date_local`. Mitigado: gate de smoke real (D6) trava essas premissas em dado real
  antes de considerar a change concluída — se divergirem, D2/D3 são ajustados no mesmo bloco.
- **Credencial revogada é confundida com "atividade não existe"** (Médio): distinção 401/403 vs
  404 explícita no client e no service (D1, D3).
- **Vazamento cross-atleta via `externalAthleteId` duplicado** (Alto, sem migration nesta change):
  guard em código (D5.1) bloqueia conexão duplicada ativa por `(tenant, plataforma,
  external_athlete_id)`; constraint de banco registrada como débito para change futura.
- **Duplicata de `TreinoRealizado` com Strava + intervals.icu simultâneos** (Alto → mitigado nesta
  própria change, revisão pós-pre-mortem 2026-07-16): fontes diferentes não deduplicam entre si
  (`(tenant, fonteDados, externalId)`). Achado do 2º pre-mortem cross-model: a versão anterior
  (aviso não-bloqueante) deixava o **primeiro import duplicar de qualquer forma** quando o atleta
  já tinha Strava conectado e o coach esquecia de pausar — o aviso era pós-facto, não preventivo.
  **Corrigido: o import passa a exigir a precondição.**
  `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}` retorna **409**
  com mensagem curada ("pause a sincronização Strava deste atleta antes de importar do
  intervals.icu") quando o atleta tem conexão Strava ativa **E** `autoSyncPausado=false`; sem
  conexão Strava (ou já pausada), o import prossegue normal — e, quando a activity já foi importada
  antes, o dedup do CA2 tem prioridade sobre esta precondição (ver CA11). CA/cenário novo cobrindo
  os dois eixos: bloqueado (Strava ativo, sem pausa) e liberado (sem Strava, ou pausado). `409` aqui
  é reservado para essa precondição — `429` de rate-limit do intervals.icu é propagado como `429`
  (sem sobrecarregar o mesmo código, consistente com `StravaRateLimitException`→429 já existente no
  `GlobalExceptionHandler`).
  **Achado CRÍTICO da 3ª rodada de pre-mortem, corrigido nesta revisão:** a precondição bloqueante
  só protege o import manual; ela não fecha a colisão se a flag `autoSyncPausado` guardar apenas o
  scheduler diário. Existe um SEGUNDO caminho automático de ingestão do Strava, em tempo real, que
  não passa pelo scheduler — o webhook (`StravaWebhookServiceImpl.handleEventAsync` →
  `processCreateEvent`/`processUpdateEvent` → `requireIntegration`,
  `StravaWebhookServiceImpl.java:69-95`). Sem guard também ali, um coach que pausa o atleta acha que
  eliminou a colisão, mas um webhook em tempo real ainda insere a mesma atividade. **Corrigido: o
  guard da flag cobre os DOIS caminhos** — scheduler (listagem + late-check, já existente) e webhook
  (skip silencioso em `requireIntegration`, sem lançar exceção, para preservar o 200 HTTP exigido
  pelo contrato do webhook do Strava — ver CA10 e design.md D5.2).
  **Residual aceito e documentado** (não há forma barata de eliminar sem lock distribuído): TOCTOU
  de duas camadas — (1) entre o coach pausar e o scheduler diário do Strava, cuja seleção inicial
  (`findAllWithStravaConnected`) já rodou; mitigado por revalidar `autoSyncPausado` imediatamente
  antes de persistir cada atividade Strava (late-check), não só na listagem — se pausado nesse
  ponto, aquele atleta é pulado no ciclo corrente; (2) sync automático do Strava inserindo entre a
  checagem de precondição e o insert do import manual (janela de milissegundos, ação humana) —
  aceito, não coberto por lock nesta change. Sem limpeza automática de duplicatas já existentes
  antes desta change (fora de escopo).
- **Multi-tenancy** (Alto, mitigado): `@RequireTenant` no endpoint + `conexaoAtiva` tenant-scoped +
  `Atleta` carregado explicitamente por `findByIdAndTenantId` (não o UUID cru) + conferência do
  `athlete_id` da activity contra a conexão + guard do D5.1.
- **Credencial em log** (Alto, mitigado): seguir o padrão do client atual — API key nunca logada,
  body de erro nunca logado.
- **Fricção do fluxo manual vs sync automático do Strava** (Baixo, aceito conscientemente):
  MVP coach-in-the-loop; listagem com um clique é a evolução imediata, já registrada em "Fora de
  escopo".

## Rollback

Aditiva: reverter o PR remove endpoints, serviço e método do client. A migration V54 (coluna
`auto_sync_pausado`, nullable/default `false`) é aditiva e não precisa de down-migration — reverter
o PR deixa a coluna órfã (sem código que a leia), sem risco para dados existentes; se necessário,
uma migration de limpeza pode ser feita em change futura. Treinos já ingeridos permanecem válidos
(fonte `INTERVALS_ICU` já é um valor legítimo do enum) e podem ser excluídos pelo fluxo normal se
indesejados. Atletas com `auto_sync_pausado=true` no momento do rollback voltam a sincronizar
Strava automaticamente assim que o campo deixa de ser lido (comportamento pré-change) — avisar o
coach antes de reverter em produção.
