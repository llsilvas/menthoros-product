# Proposal: intervals-icu-activity-ingestion

**Tamanho:** M · **Trilha:** Full (novo contrato de API + decisão de design na reconciliação;
backend-only, **uma migration aditiva** — `tb_integracao_externa.auto_sync_pausado` (nova coluna
boolean, V54) para a flag de pausa do Strava por atleta; a dedup DENTRO da mesma fonte,
`uk_treino_realizado_tenant_fonte_external` de V29, já cobre `INTERVALS_ICU` sem migration
adicional)

## Status

- DoR 2026-07-15, rodada 1: NOT READY (spec-reviewer + pre-mortem Codex) → bloqueador convergente de
  dedup cross-fonte resolvido com a flag `autoSyncPausado` por atleta (decisão do founder), no lugar
  de matching heurístico; demais gaps corrigidos (gate de pareamento, guard de matching, matriz de
  erros, non-goals).
- DoR rodada 2: achado do pre-mortem — aviso não-bloqueante ainda deixava o primeiro import duplicar
  → corrigido para precondição bloqueante (409).
- DoR rodada 3: achado CRÍTICO do pre-mortem — a flag só guardava o scheduler diário, não o webhook
  Strava em tempo real (segundo caminho automático) → guard estendido a `StravaWebhookServiceImpl`;
  corrigida também a ordem CA2/409 (dedup roda antes da precondição Strava).
- Correção de premissa do founder (2026-07-16): a pausa deixa de ser um passo manual primário (que o
  coach podia esquecer) e passa a ser efeito colateral automático de conectar qualquer uma das duas
  integrações, nos dois sentidos (ver design.md D5.2); os endpoints `pausar-sync`/`retomar-sync`
  viram override explícito do coach, não o mecanismo primário.
- DoR rodada 4 (2026-07-16, spec-reviewer Claude + pre-mortem Codex, em paralelo): NOT READY —
  achado convergente e independente nos dois: nenhum dos quatro arquivos definia o que acontece com
  `autoSyncPausado` quando o intervals.icu é desconectado enquanto o Strava permanece pausado. Codex
  acrescentou que um único campo booleano não distingue pausa automática de pausa manual, bloqueando
  qualquer regra segura de auto-retomada sem um campo de proveniência. Decisão do founder: NUNCA
  auto-retomar (`desconectar` não toca na flag; risco residual aceito e documentado — ver design.md
  D5.2 e "Riscos e mitigações"). Corrigidos na mesma rodada: métrica de sucesso desatualizada
  (contador de 409 ainda descrevia "atletas não pausados", framing da era manual-primária), wording
  `nullable/default` vs `NOT NULL DEFAULT` no Rollback, e cobertura de teste ausente para reconexão
  do Strava com flag herdada (tasks.md 6.11).
- DoR rodada 5 (2026-07-16, spec-reviewer Claude + pre-mortem Codex, em paralelo): spec-reviewer
  READY; Codex READY COM RESSALVAS — confirmou todas as correções da rodada 4 e apontou dois achados
  novos e pequenos, ambos corrigidos na mesma rodada: TOCTOU residual entre `retomar-sync` manual e
  um hook automático em transações concorrentes (documentado como risco aceito, mesma classe dos
  demais TOCTOUs sem lock já aceitos neste design — ver design.md D5.2); cobertura de teste ausente
  (mas lógica já segura por construção) para "Strava já pausado manualmente + intervals.icu conecta"
  (task 6.10). Investigou também o caso simétrico (desconectar o Strava em si com intervals.icu
  ativo) — confirmado não ser gap: `ativo=false` já exclui o atleta dos dois guards
  independentemente de `autoSyncPausado` (nota em design.md D5.2).
- **DoR: READY** (2026-07-16) → `/implement init` executado, branch
  `feature/intervals-icu-activity-ingestion` criada, implementação em andamento (`/implement run
  --step`).
- **Achado CRÍTICO durante a implementação do Bloco 6 (2026-07-16) — sobreviveu a 5 rodadas de DoR
  textual:** o guard aplicado nas rodadas 1-5 (`AtletaRepository.findAllWithStravaConnected`,
  consumido por `DailyActivitySyncSchedulerImpl`) protege o scheduler ERRADO. Leitura completa do
  código (só possível ao implementar, não ao revisar a spec) revelou que
  `DailyActivitySyncSchedulerImpl` é reconciliação-only — nunca insere um `TreinoRealizado` novo, só
  decide/grava reconciliação sobre registros Strava JÁ persistidos com `statusSincronizacao=PENDENTE`.
  O caminho automático REAL de ingestão diária é `StravaActivitySyncScheduler` (nome parecido, pacote
  diferente, sem sufixo `Impl`) → `IntegracaoExternaRepository.findAllActiveByPlataforma(STRAVA)` →
  `stravaActivityService.syncActivities(atletaId)`. Guard corrigido: filtro `autoSyncPausado` movido
  para `findAllActiveByPlataforma` + late-check em `StravaActivitySyncScheduler
  .runDailyIncrementalSync` antes de cada `syncActivities`. O guard original em
  `findAllWithStravaConnected` foi mantido como defesa em profundidade adicional (evita reconciliar
  um registro Strava pré-existente para um atleta cuja fonte de verdade migrou para intervals.icu),
  mas não é mais descrito como a defesa primária em lugar nenhum da spec. Ver design.md, seção
  "Pre-mortem", "6ª rodada" para o detalhamento completo (incluindo por que nenhuma das 5 rodadas
  textuais pegou isso). Nenhuma mudança de contrato de negócio (CA10 continua válido como escrito) —
  só a implementação que o cumpre mudou de alvo.

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
4. **Pausa automática de sincronização Strava por atleta, nos dois pontos de conexão (substitui
   matching cross-fonte e o modelo manual-primário das rodadas anteriores):** novo campo
   `autoSyncPausado` em `IntegracaoExterna`, setado AUTOMATICAMENTE como efeito colateral de
   conectar as integrações — não mais um passo manual primário. Dois hooks: (a)
   `IntervalsIcuConnectionServiceImpl.conectar` — ao conectar intervals.icu com Strava já ativo, a
   integração Strava do atleta é marcada `autoSyncPausado=true`; (b)
   `StravaOAuthServiceImpl.exchangeCodeForToken` — ao conectar/reconectar Strava com intervals.icu
   já ativo, a integração Strava NASCE com `autoSyncPausado=true`. Guarda nos DOIS caminhos
   automáticos de ingestão do Strava: (i) `StravaActivitySyncScheduler.runDailyIncrementalSync`
   (via `IntegracaoExternaRepository.findAllActiveByPlataforma`, mais late-check antes de cada
   chamada a `syncActivities` — achado de implementação do Bloco 6: o scheduler que efetivamente
   insere não é `DailyActivitySyncSchedulerImpl`, que é reconciliação-only sobre registros já
   `PENDENTE`; guard mantido lá também como defesa em profundidade adicional, ver design.md D5.2)
   e (ii) `StravaWebhookServiceImpl.requireIntegration` (evento em tempo real do Strava — skip
   silencioso, sem exceção, para preservar o contrato HTTP 200 do webhook). Decisão do founder: em
   vez de detectar/bloquear colisão cross-fonte automaticamente por heurística de
   tempo+distância+duração (complexidade alta, falsos positivos/negativos), a pausa acontece
   automaticamente nos dois pontos de conexão — eliminando a colisão na origem sem depender de o
   coach lembrar de um passo manual separado. Os endpoints coach-only
   `PATCH /api/v1/strava/pausar-sync/{atletaId}` e `PATCH /api/v1/strava/retomar-sync/{atletaId}`
   continuam existindo, mas como **override explícito do coach** sobre a mesma flag — não mais o
   mecanismo primário; `retomar-sync` é o único jeito de reativar o Strava deliberadamente enquanto
   intervals.icu segue ativo, aceitando o risco. Ver design.md D5.2 e "Riscos e mitigações" abaixo
   para o risco residual (override deliberado via `retomar-sync`, ou TOCTOU já documentado) e a
   precondição bloqueante (409), que agora funciona como safety net residual em vez de defesa
   primária.
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
- **Desligamento automático do sync Strava por heurística de matching cross-fonte** (levantado no
  product review, achado confirmado): cogitado e descartado em favor da **flag `autoSyncPausado`,
  setada automaticamente nos dois pontos de conexão** (item 4 do "What Changes" acima, decisão
  final do founder que substitui o modelo anterior de flag manual-primária) — resolvida **nesta
  própria change**, não adiada. Diferença chave: a alternativa descartada aqui é detectar/bloquear
  a colisão DEPOIS, por heurística de tempo+distância+duração entre fontes diferentes (não
  implementada); a flag, por outro lado, elimina a colisão automaticamente NA ORIGEM, como efeito
  colateral de conectar as integrações — sem heurística, sem falsos positivos/negativos. Os
  endpoints `pausar-sync`/`retomar-sync` continuam existindo como override explícito do coach.
  Import sem a pausa ativa é **bloqueado com 409** (precondição, agora safety net residual — ver
  CA11).
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
- **CA10 — Pausa automática de sincronização Strava nos dois pontos de conexão:** Given atleta com
  Strava ativo (`autoSyncPausado` ainda `false` ou indefinido), When o coach conecta o atleta ao
  intervals.icu (`IntervalsIcuConnectionServiceImpl.conectar`), Then a integração Strava do mesmo
  atleta fica `autoSyncPausado=true` automaticamente, sem qualquer chamada aos endpoints manuais
  `pausar-sync`/`retomar-sync`. Given o mesmo atleta sem Strava conectado, When conecta o
  intervals.icu, Then nada acontece (no-op — não há integração Strava para pausar). Given atleta
  com intervals.icu ativo, When conecta ou reconecta o Strava via OAuth
  (`StravaOAuthServiceImpl.exchangeCodeForToken`), Then a integração Strava já NASCE com
  `autoSyncPausado=true` no mesmo save (sem dois saves separados); sem intervals.icu ativo, a
  integração Strava nasce com o default `autoSyncPausado=false` da migration, sem regressão do
  fluxo OAuth existente. Os endpoints `pausar-sync`/`retomar-sync` continuam funcionando como
  **override explícito do coach** sobre a mesma flag — o guard nos dois caminhos automáticos de
  ingestão do Strava (scheduler via `StravaActivitySyncScheduler`/`findAllActiveByPlataforma` +
  late-check, e webhook via `StravaWebhookServiceImpl.requireIntegration`) responde à flag `autoSyncPausado`
  independentemente de como ela foi setada (automaticamente na conexão, ou manualmente via
  override) — o atleta pulado é pulado igual nos dois casos, e cobrir só o scheduler não seria
  suficiente: o webhook é um caminho automático independente para a mesma colisão cross-fonte que a
  flag existe para eliminar. **Os dois hooks são monotônicos** — só setam `true`, nunca resetam para
  `false`: Given uma integração Strava já existente com `autoSyncPausado=true` (herdada) e o
  intervals.icu já desconectado, When o coach reconecta o Strava via OAuth, Then `autoSyncPausado`
  permanece `true` (não é resetado). **Desconectar o intervals.icu NÃO reverte a pausa** (decisão do
  founder — nunca auto-retomar, achado do 5º pre-mortem): Given atleta com Strava pausado, When o
  coach desconecta o intervals.icu, Then `autoSyncPausado` permanece `true`, inalterado, e o atleta
  só volta a sincronizar Strava após `retomar-sync` manual — risco residual aceito e documentado em
  "Riscos e mitigações".
- **CA11 — Precondição de pausa do Strava (bloqueante, agora safety net residual — com a pausa
  automática de CA10 cobrindo o caso comum, este 409 protege o cenário residual de `retomar-sync`
  deliberado com intervals.icu ainda ativo; ver "Riscos e mitigações"):** Given atleta com Strava
  conectado
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
- **Observabilidade:** contador de imports **bloqueados por 409 de precondição Strava** (com a pausa
  automática como camada primária, este contador deixa de sinalizar "atletas não pausados" e passa a
  sinalizar uso do override `retomar-sync` — quantas vezes um coach reabriu o Strava deliberadamente
  e tentou importar mesmo assim; o coach vê o bloqueio na hora, não precisa de métrica para
  descobrir) + log estruturado de cada late-check que pulou um atleta no scheduler
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
- **Resolvido (gate 3.0, 2026-07-16): formato do activity id** — confirmado `i<dígitos>` (ex.
  `i166338796`), mesmo padrão do `athlete_id` (`i641775`); `String` opaca segue correta.
- **Resolvido (gate 3.0, 2026-07-16): campo de pareamento** — NÃO existe (`paired_event_id` da
  activity e `paired_activity_id` do event ambos `null` mesmo após execução real confirmada; sem
  badge de vínculo na UI). A heurística D-1..D+1 é o único mecanismo de reconciliação nesta change
  — ver design.md D4.0 para a evidência completa.
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
  própria change; revisão pós-pre-mortem 2026-07-16, com correção de premissa desta mesma data à
  tarde — decisão do founder): fontes diferentes não deduplicam entre si `(tenant, fonteDados,
  externalId)`. Achado do 2º pre-mortem cross-model: a versão original (aviso não-bloqueante)
  deixava o **primeiro import duplicar de qualquer forma** quando o atleta já tinha Strava
  conectado e o coach esquecia de pausar — o aviso era pós-facto, não preventivo. **Corrigido na 2ª
  revisão:** o import passou a exigir uma precondição bloqueante (409).
  **Corrigido nesta revisão (decisão do founder): a premissa de que a pausa é um passo MANUAL que o
  coach pode esquecer estava errada na origem.** O esquecimento deixa de existir como cenário
  primário porque a pausa passa a ser **automática**, efeito colateral de conectar as integrações,
  nos dois sentidos: (1) `IntervalsIcuConnectionServiceImpl.conectar` pausa o Strava do atleta se
  ele já tiver uma integração Strava ativa; (2) `StravaOAuthServiceImpl.exchangeCodeForToken` faz o
  Strava nascer pausado se o atleta já tiver intervals.icu ativo. Ver design.md D5.2 (subseção
  "Pausa automática nos dois pontos de conexão") para os dois hooks de código exatos.

  **O que sobrevive como risco residual, agora que a pausa é automática — defesa em profundidade,
  não uma única camada:**
  1. **Pausa automática (camada primária):** cobre o caso comum — atleta conecta uma integração
     tendo a outra já ativa, em qualquer ordem. Elimina a colisão na origem, sem depender de o
     coach lembrar de um passo separado.
  2. **Precondição bloqueante (409) no import (safety net residual, não mais defesa primária):**
     `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}` continua
     retornando **409** com mensagem curada ("pause a sincronização Strava deste atleta antes de
     importar do intervals.icu") quando o atleta tem Strava ativo **E** `autoSyncPausado=false` —
     mas esse cenário só é alcançável agora se o coach usar deliberadamente `retomar-sync`
     (override explícito) enquanto o intervals.icu segue ativo, e então tentar importar mesmo
     assim. Não é mais a defesa contra "esquecimento" (esse esquecimento praticamente deixa de
     existir); é o freio para uma decisão humana deliberada de reabrir o Strava. Quando a activity
     já foi importada antes, o dedup do CA2 tem prioridade sobre esta precondição (ver CA11). `429`
     de rate-limit do intervals.icu é propagado como `429` (sem sobrecarregar o mesmo código 409,
     consistente com `StravaRateLimitException`→429 já existente no `GlobalExceptionHandler`).
  3. **Late-check no scheduler real de ingestão (`StravaActivitySyncScheduler`, achado de
     implementação do Bloco 6 — não é `DailyActivitySyncSchedulerImpl`, que só reconcilia registros
     já `PENDENTE`, sem inserir nada novo):** revalida `autoSyncPausado` com query fresca
     imediatamente antes de cada chamada a `syncActivities`, cobrindo o TOCTOU entre a listagem
     inicial do ciclo (`findAllActiveByPlataforma`) e o atleta específico sendo processado.
  4. **Guard no webhook do Strava (achado CRÍTICO da 3ª rodada de pre-mortem):** existe um SEGUNDO
     caminho automático de ingestão do Strava, em tempo real, que não passa pelo scheduler — o
     webhook (`StravaWebhookServiceImpl.handleEventAsync` →
     `processCreateEvent`/`processUpdateEvent` → `requireIntegration`,
     `StravaWebhookServiceImpl.java:69-95`). `requireIntegration` pula silenciosamente (sem
     exceção, 200 preservado) quando `autoSyncPausado=true` — fecha o segundo caminho automático
     que o scheduler sozinho não cobre (ver CA10 e design.md D5.2).

  Cada camada cobre o que a anterior não cobre: a pausa automática elimina a origem para o caso
  comum; o 409 no import é o freio residual para o caso de override deliberado do coach; o
  late-check fecha o TOCTOU de timing dentro do scheduler; o guard do webhook fecha o segundo
  caminho automático (tempo real) que o scheduler não vê.

  **Residual aceito e documentado** (não há forma barata de eliminar sem lock distribuído): TOCTOU
  de duas camadas — (1) entre o momento em que `autoSyncPausado` passa a `true` (automaticamente ao
  conectar, ou via `pausar-sync` manual) e o `StravaActivitySyncScheduler`, cuja seleção inicial
  (`findAllActiveByPlataforma`) já rodou; mitigado pelo late-check (camada 3 acima); (2) sync
  automático do Strava inserindo entre a checagem de precondição e o insert do import manual
  (janela de milissegundos, ação humana) — aceito, não coberto por lock nesta change. Sem limpeza
  automática de duplicatas já existentes antes desta change (fora de escopo).

  **Residual aceito e documentado (achado convergente do 4º→5º pre-mortem, Claude spec-reviewer e
  Codex independentemente): desconectar o intervals.icu NÃO reverte a pausa do Strava.**
  `IntervalsIcuConnectionServiceImpl.desconectar` não tem hook simétrico — decisão do founder de
  NUNCA auto-retomar (ver design.md D5.2). Motivo: como os hooks automáticos e os endpoints manuais
  `pausar-sync`/`retomar-sync` escrevem o MESMO campo booleano, o sistema não tem como distinguir
  "essa pausa era só efeito colateral de uma conexão que acabou de sumir" de "essa pausa é
  intencional e deve continuar" sem um campo de proveniência (cogitado e descartado — o founder
  optou pela regra mais simples). Consequência aceita: um atleta cujo intervals.icu é desconectado
  fica com Strava pausado indefinidamente até o coach chamar `retomar-sync` manualmente — mesma
  dependência de memória do coach que esta change existe para eliminar, agora do lado da saída.
  Mitigação mínima: log estruturado no `desconectar` quando o atleta tinha Strava pausado (tasks.md
  6.12); sem alerta proativo nesta change (frontend fora de escopo).
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
`auto_sync_pausado`, `NOT NULL DEFAULT false`) é aditiva e não precisa de down-migration — reverter
o PR deixa a coluna órfã (sem código que a leia), sem risco para dados existentes; se necessário,
uma migration de limpeza pode ser feita em change futura. Treinos já ingeridos permanecem válidos
(fonte `INTERVALS_ICU` já é um valor legítimo do enum) e podem ser excluídos pelo fluxo normal se
indesejados. Atletas com `auto_sync_pausado=true` no momento do rollback voltam a sincronizar
Strava automaticamente assim que o campo deixa de ser lido (comportamento pré-change) — avisar o
coach antes de reverter em produção.
