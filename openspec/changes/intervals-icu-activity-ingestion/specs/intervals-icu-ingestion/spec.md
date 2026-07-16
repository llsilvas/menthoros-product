# Spec delta: intervals-icu-ingestion

> Capability nova: ingestão pontual de uma atividade realizada do intervals.icu como
> `TreinoRealizado`, disparada pelo coach (coach-in-the-loop), com dedup, pós-ingestão (TSS,
> TSB, evento) e reconciliação imediata com o treino planejado. Sentido inverso (pull) da
> capability `intervals-icu-push`. Formato: requirements com cenários BDD verificáveis.

## Requirement: Import manual de uma atividade específica pelo coach

O coach (TECNICO/ADMIN) DEVE poder importar uma atividade de corrida específica do intervals.icu
de um atleta do seu tenant que possua conexão ativa, informando o id da atividade; o resultado é
um `TreinoRealizado` com `fonteDados=INTERVALS_ICU`.

#### Scenario: Import bem-sucedido de atividade de corrida
- **Given** um atleta do tenant com conexão intervals.icu ativa
- **And** uma atividade de corrida existente no intervals.icu acessível pela API key do atleta
- **When** o coach envia `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}`
- **Then** um `TreinoRealizado` é criado com `fonteDados=INTERVALS_ICU`, `externalId={activityId}`
  e métricas mapeadas (data, duração, distância, pace, FC média/máx, RPE quando presente)
- **And** a resposta é 200 com o `TreinoRealizadoOutputDto`

#### Scenario: activityId colado como URL completa é normalizado
- **Given** um atleta do tenant com conexão intervals.icu ativa
- **When** o coach cola a URL inteira do intervals.icu no parâmetro `activityId`
  (ex. `https://intervals.icu/activities/i86400275`)
- **Then** o sistema extrai apenas o segmento final (`i86400275`) e prossegue com o import
- **And** um valor contendo `/`, `?` ou `%` que não seja um id simples nem uma URL reconhecível
  resulta em 400, sem chamada externa

#### Scenario: Atleta sem conexão ativa
- **Given** um atleta do tenant sem conexão intervals.icu ativa
- **When** o coach chama o endpoint de import
- **Then** a resposta é 409 e nada é persistido nem chamado externamente

#### Scenario: Atividade inexistente ou de outro atleta
- **Given** um id de atividade inexistente, ou pertencente a atleta diferente do conectado
- **When** o coach chama o endpoint de import
- **Then** a resposta é 404 e nada é persistido

#### Scenario: Modalidade não suportada
- **Given** uma atividade que não é corrida (ex.: Ride)
- **When** o coach chama o endpoint de import
- **Then** a resposta é 422 e nada é persistido

#### Scenario: Rate limit do intervals.icu
- **Given** o intervals.icu responde com rate limit (429) à chamada `GET /api/v1/activity/{id}`
- **When** o coach chama o endpoint de import
- **Then** a resposta é 429 puro — nunca 409 — com mensagem indicando para tentar novamente mais
  tarde
- **And** nada é persistido; nenhum retry automático é feito nesta change

#### Scenario: Isolamento de tenant
- **Given** um `atletaId` que pertence a outro tenant
- **When** o coach chama o endpoint de import
- **Then** a resposta é 403/404 via validação de tenant
- **And** nenhuma chamada ao intervals.icu é feita

## Requirement: Idempotência por dedup de fonte externa

O import DEVE ser idempotente pela chave `(tenant, INTERVALS_ICU, externalId)`: re-imports não
criam duplicatas nem repetem side effects.

#### Scenario: Re-import da mesma atividade
- **Given** uma atividade já importada anteriormente
- **When** o coach chama o endpoint de import novamente com o mesmo id
- **Then** nenhum registro novo é criado
- **And** a resposta é 200 com o treino existente
- **And** nenhum `TreinoRegistradoEvent` é republicado e o TSB não é recalculado

#### Scenario: Corrida de concorrência no insert
- **Given** dois imports simultâneos da mesma atividade
- **When** ambos tentam persistir
- **Then** exatamente um registro existe ao final (constraint única) e ambos respondem 200

## Requirement: Pós-ingestão no padrão das demais fontes

No insert novo, o sistema DEVE calcular TSS quando houver insumos, atualizar o TSB do dia do
treino e publicar `TreinoRegistradoEvent` exatamente uma vez.

#### Scenario: Pós-ingestão completa
- **Given** um import que resulta em insert novo
- **When** a transação conclui
- **Then** `tssCalculado` está preenchido (insumos presentes), `atualizarTsbDia` foi chamado para
  a data do treino e `TreinoRegistradoEvent(treinoId, tenantId)` foi publicado uma única vez

## Requirement: Reconciliação imediata com o planejado

O treino importado DEVE sair da requisição com decisão de reconciliação gravada (mesma janela de
candidatos D-1..D+1, mesmos thresholds e auditoria do fluxo batch), sem depender do agendamento
do scheduler — a decisão de import inline e de batch deve ser idêntica para o mesmo caso.

#### Scenario: Planejado compatível na janela
- **Given** um `TreinoPlanejado` do atleta na janela D-1..D+1 da data da atividade com alta
  compatibilidade (score ≥ 0.80)
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=VINCULADO_AUTOMATICO`, vínculo ao planejado,
  planejado marcado como realizado e auditoria `TreinoReconciliacao(RECONCILIACAO_AUTOMATICA)`

#### Scenario: Sem planejado compatível
- **Given** nenhum `TreinoPlanejado` do atleta na janela D-1..D+1 da atividade
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=NAO_PLANEJADO` e aparece na fila de pendentes
  da reconciliação manual

#### Scenario: Campos nulos do realizado não geram vínculo automático
- **Given** uma activity do intervals.icu (o lado `realizado`) com `duracaoMin` OU `distanciaKm`
  ausentes (summary incompleto — ex. esteira sem GPS)
- **And** um `TreinoPlanejado` na janela D-1..D+1 com data muito próxima (que sozinha bateria o
  threshold de score)
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=AMBIGUO` — NUNCA `VINCULADO_AUTOMATICO` quando
  duração ou distância do realizado estão ausentes, independentemente do score calculado

#### Scenario: Campos nulos do planejado não geram vínculo automático
- **Given** uma activity do intervals.icu com `duracaoMin` e `distanciaKm` presentes (o lado
  `realizado` está completo)
- **And** um `TreinoPlanejado` candidato na janela D-1..D+1 (o lado `planejado`) com `duracaoMin`
  OU `distanciaKm` ausentes, e data muito próxima (que sozinha bateria o threshold de score)
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=AMBIGUO` — NUNCA `VINCULADO_AUTOMATICO` quando
  duração ou distância do planejado estão ausentes, independentemente do score calculado

#### Scenario: Match primário via evento pareado pelo push (quando aplicável)
- **Given** um `TreinoPlanejado` que foi empurrado ao intervals.icu pela change-mãe
  `intervals-icu-workout-push` (evento com `external_id = menthoros-<treinoPlanejadoId>`)
- **And** o gate de pareamento (design.md D4.0) confirmou que a activity referencia esse evento
- **When** o atleta executa o evento e a activity correspondente é importada
- **Then** o vínculo ao `TreinoPlanejado` é resolvido diretamente pela referência do evento
  (match primário), sem depender da heurística de janela D-1..D+1 — este cenário só se aplica se o
  probe do gate D4.0 confirmar a existência do campo de referência no payload real

#### Scenario: Scheduler mantém paridade após a extração
- **Given** o `CandidateSelector` e o `ReconciliationDecisionExecutor` extraídos e reutilizados
  pelo import inline e pelo scheduler
- **When** o scheduler roda seu ciclo normal sobre outros treinos pendentes
- **Then** as decisões produzidas são idênticas às que o import inline produziria para um caso
  equivalente, e as suítes de teste do scheduler permanecem verdes

## Requirement: Segurança da credencial e do canal

A API key do atleta NUNCA deve aparecer em logs ou respostas; erros do intervals.icu não devem
vazar corpo de resposta; a atividade buscada DEVE pertencer ao atleta da conexão.

#### Scenario: Divergência de athlete_id
- **Given** uma resposta do intervals.icu cujo `athlete_id` difere do `externalAthleteId` da conexão
- **When** o serviço valida a atividade
- **Then** o import falha com 404 e nada é persistido

#### Scenario: Credencial revogada não é confundida com atividade inexistente
- **Given** uma conexão cuja API key foi revogada no intervals.icu (o provedor responde 401/403)
- **When** o coach chama o endpoint de import
- **Then** o erro indica falha de autenticação/necessidade de reconexão, distinto de "atividade
  não encontrada"

#### Scenario: `externalAthleteId` duplicado entre atletas do mesmo tenant é bloqueado
- **Given** duas conexões `IntegracaoExterna` ativas do mesmo tenant apontando para a mesma
  `externalAthleteId` do intervals.icu
- **When** um import é tentado para qualquer um dos dois atletas
- **Then** a requisição falha com 409 antes de qualquer chamada externa

## Requirement: Pausa de sincronização Strava por atleta

O coach (TECNICO/ADMIN) DEVE poder pausar e retomar a sincronização automática do Strava de um
atleta específico do seu tenant. Esta flag substitui a detecção automática de duplicidade
cross-fonte (Strava × intervals.icu): ao habilitar um atleta para o import manual de intervals.icu,
o coach pausa o Strava daquele atleta, eliminando a colisão na origem em vez de detectá-la depois.

#### Scenario: Coach pausa a sincronização Strava do atleta
- **Given** um atleta do tenant com integração Strava ativa
- **When** o coach chama `PATCH /api/v1/strava/pausar-sync/{atletaId}`
- **Then** a resposta é 200 com `autoSyncPausado=true`

#### Scenario: Scheduler pula atleta com Strava pausado
- **Given** um atleta com `autoSyncPausado=true` na integração Strava
- **When** o scheduler diário (`DailyActivitySyncSchedulerImpl`) roda seu ciclo
- **Then** o atleta não aparece na lista de atletas processados e nenhuma tentativa de sync é
  feita para ele

#### Scenario: Coach retoma a sincronização Strava do atleta
- **Given** um atleta com `autoSyncPausado=true`
- **When** o coach chama `PATCH /api/v1/strava/retomar-sync/{atletaId}`
- **Then** a resposta é 200 com `autoSyncPausado=false`
- **And** o atleta volta a aparecer para o scheduler no próximo ciclo

#### Scenario: Pausar sync para atleta sem integração Strava
- **Given** um atleta do tenant que nunca conectou o Strava
- **When** o coach chama `PATCH /api/v1/strava/pausar-sync/{atletaId}`
- **Then** a resposta é 404

## Requirement: Precondição de pausa do Strava antes do import

O import de intervals.icu DEVE ser bloqueado por precondição — não mais apenas avisado — quando o
atleta tem sincronização automática do Strava ativa e não pausada. Esta é a correção da 2ª rodada
de pre-mortem: a versão anterior (aviso não-bloqueante) deixava o **primeiro import duplicar de
qualquer forma** quando o coach esquecia de pausar o Strava do atleta antes de habilitá-lo para
intervals.icu — o aviso era pós-facto (aparecia só depois do import já ter persistido), não
preventivo. Sem conexão Strava, ou já pausada, o import prossegue normalmente, sem qualquer
matching cross-fonte.

#### Scenario: Import bloqueado quando Strava está ativo e não pausado
- **Given** um atleta do tenant com integração Strava ativa e `autoSyncPausado=false` (ou nunca
  definido)
- **When** o coach tenta importar uma atividade via intervals.icu para esse atleta
- **Then** a resposta é 409 com mensagem curada ("pause a sincronização Strava deste atleta antes
  de importar do intervals.icu")
- **And** nada é persistido — nenhum `TreinoRealizado`, nenhuma chamada ao client intervals.icu

#### Scenario: Import prossegue quando Strava está pausado ou não conectado
- **Given** um atleta com `autoSyncPausado=true`, ou sem integração Strava conectada
- **When** o coach importa uma atividade via intervals.icu para esse atleta
- **Then** o import prossegue normalmente (200), sem qualquer verificação adicional de matching
  cross-fonte

#### Scenario: Late-check do scheduler pula o atleta pausado no meio do lote
- **Given** o scheduler diário (`DailyActivitySyncSchedulerImpl`) já listou os atletas elegíveis
  para sync do Strava no início do ciclo corrente (via `findAllWithStravaConnected`)
- **And** o coach pausa a sincronização automática do Strava de um desses atletas ENQUANTO o
  scheduler ainda está processando o lote (antes de chegar a esse atleta especificamente)
- **When** o scheduler revalida `autoSyncPausado` imediatamente antes de persistir a atividade
  daquele atleta
- **Then** o atleta é pulado nesse mesmo ciclo (log + métrica, sem erro) — não apenas a partir do
  próximo ciclo
