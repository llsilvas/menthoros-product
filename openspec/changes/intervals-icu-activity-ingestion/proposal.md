# Proposal: intervals-icu-activity-ingestion

**Tamanho:** M · **Trilha:** Full (novo contrato de API + decisão de design na reconciliação;
backend-only, **zero migration** — a dedup `uk_treino_realizado_tenant_fonte_external` de V29 já
cobre a fonte `INTERVALS_ICU`)

## Status

Proposed (2026-07-15). Abre o sentido **pull** da integração intervals.icu entregue em
`intervals-icu-workout-push` (arquivada em `archive/2026-07/2026-07-15-intervals-icu-workout-push/`),
que cobriu apenas o sentido push (planejados → relógio).

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
   manual (que filtra `AMBIGUO`/`NAO_PLANEJADO`).
4. **Endpoint:** `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/{activityId}/import`
   — `TECNICO`/`ADMIN`, `@RequireTenant(resourceParamIndex = 0)`, retorna o
   `TreinoRealizadoOutputDto` do treino ingerido (200 no insert novo, 200 idempotente se já
   existia — mesma semântica do dedup helper).

### Fora de escopo

- Listagem/navegação de atividades do intervals.icu (o coach informa o id; UX de escolha é change
  futura).
- Sync automático, scheduler ou webhook de atividades (esta change é ação manual coach-in-the-loop).
- Frontend (o endpoint fica disponível; tela vem em change própria).
- Modalidades além de corrida (mesmo recorte `RUN_SPORT_TYPES` do Strava).
- Streams/samples por segundo (apenas o summary da atividade; laps/etapas ficam para evolução).
- Criptografia at-rest da credencial e circuit breaker (débitos já registrados em
  `add-external-call-resilience`).

## Critérios de aceite

- **CA1 — Ingestão feliz:** Given atleta com conexão intervals.icu ativa e uma activity de corrida
  válida, When o coach chama o endpoint de import, Then um `TreinoRealizado` é criado com
  `fonteDados=INTERVALS_ICU`, `externalId` igual ao id da activity, campos mapeados (data, duração,
  distância, FC média/máx, pace) e a resposta é 200 com o DTO do treino.
- **CA2 — Idempotência:** When o mesmo import é chamado duas vezes, Then a segunda chamada não cria
  registro novo (dedup por `(tenant, fonte, externalId)`), retorna 200 com o treino existente e não
  republica `TreinoRegistradoEvent` nem recalcula TSB.
- **CA3 — Reconciliação imediata:** Given um `TreinoPlanejado` compatível na mesma data, When o
  import conclui, Then o treino importado sai com `reconciliationStatus` decidido
  (`VINCULADO_AUTOMATICO` com score ≥ 0.80, ou `AMBIGUO`/`NAO_PLANEJADO` conforme thresholds do
  `MatchingDecisionEngine`) e auditoria `TreinoReconciliacao` gravada — sem depender do scheduler.
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

## Métrica de sucesso

- **Ciclo fechado sem Strava:** no smoke real (atleta founder), um treino executado com o relógio
  aparece no Menthoros **reconciliado ao planejado** em < 2 minutos de ação do coach (colar o id e
  importar), sem tocar em Strava ou arquivo `.fit`.
- **Confiabilidade:** 0 duplicatas criadas por re-import nos testes e no smoke; 100% dos imports
  com planejado compatível na data saem com decisão de reconciliação gravada na mesma requisição.

## Open Questions & Assumptions

- **Assumido: o coach obtém o activity id manualmente** (URL do intervals.icu, ex.
  `.../activities/i86400275`). Aceitável para o walking skeleton; a listagem de atividades para
  seleção é a evolução natural (change futura).
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

## Riscos e mitigações

- **Extração do passo de persistência da decisão de matching** (Médio): refatorar
  `persistMatchingDecision` do scheduler para colaborador compartilhado pode regredir o fluxo
  batch → cobertura existente do scheduler deve permanecer verde sem afrouxar asserções (CA9).
- **Mapeamento de unidades** (Médio): intervals.icu usa m/s e segundos; erro de conversão gera
  pace/TSS errados → testes de mapper com valores de referência reais (fixture de activity).
- **Multi-tenancy** (Alto, mitigado): `@RequireTenant` no endpoint + `conexaoAtiva` tenant-scoped +
  conferência do `athlete_id` da activity contra a conexão.
- **Credencial em log** (Alto, mitigado): seguir o padrão do client atual — API key nunca logada,
  body de erro nunca logado.

## Rollback

Aditiva: reverter o PR remove endpoint, serviço e método do client. Nenhuma migration; treinos já
ingeridos permanecem válidos (fonte `INTERVALS_ICU` já é um valor legítimo do enum) e podem ser
excluídos pelo fluxo normal se indesejados.
