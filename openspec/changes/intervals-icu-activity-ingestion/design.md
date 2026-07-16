# Design: intervals-icu-activity-ingestion

Referências de código (estado atual, `apps/menthoros-backend`):

- Client/DTOs: `services/IntervalsIcuClient.java`, `services/impl/IntervalsIcuClientImpl.java`
  (Basic Auth `API_KEY:<key>` por chamada, timeouts 5s/10s, `IntervalsIcuApiException.traduz`),
  `dto/intervalsicu/IcuAthleteDto|IcuEventDto`.
- Conexão por atleta: `entity/IntegracaoExterna` (`accessToken` = API key,
  `externalAthleteId`), `IntervalsIcuConnectionServiceImpl.conexaoAtiva(atletaId, tenantId)`.
- Padrão de ingestão de referência: `services/helper/FitTreinoPersister` (find-or-new →
  `TreinoDedupHelper.saveIdempotent` → se `inserted()`: TSS + TSB + `TreinoRegistradoEvent`).
- Mapeamento fonte externa → treino: `StravaActivityServiceImpl.mergeActivityIntoTreino`.
- Reconciliação: `DailyActivitySyncSchedulerImpl` (janela D-1..D+1, `persistMatchingDecision`
  linhas ~236-289), `MatchingDecisionEngineImpl` (AUTO ≥ 0.80; 0.50-0.79 AMBIGUO; < 0.50
  NAO_PLANEJADO; tie-break < 0.10 → AMBIGUO), `MatchingScoreCalculatorImpl` (scores por peso:
  temporal 0.45, duração 0.35, distância 0.20 — trata `null` como score perfeito hoje, ver D4).
- Dedup: constraint `uk_treino_realizado_tenant_fonte_external` (V29) sobre
  `(tenant_id, fonte_dados, external_id)` — cobre DENTRO da mesma fonte; dedup cross-fonte
  (Strava × intervals.icu) é o que D5.2 resolve por flag, não por matching.
- Strava: `StravaActivityServiceImpl` (`RUN_SPORT_TYPES`, linha 53; `syncActivities`, o método que
  efetivamente busca e insere atividades novas), `StravaAuthController`
  (`/api/v1/strava/**`, padrão de endpoint coach-only `@RequireTenant(resourceParamIndex = 0)`),
  `StravaActivitySyncScheduler` (`services/`, SEM sufixo `Impl` — o scheduler diário REAL de
  ingestão, via `IntegracaoExternaRepository.findAllActiveByPlataforma(STRAVA)`, distinto de
  `DailyActivitySyncSchedulerImpl` que só reconcilia `TreinoRealizado` já `PENDENTE`, ver D5.2),
  `AtletaRepository.findAllWithStravaConnected()` (linhas 112-121, JPQL do scheduler de
  reconciliação, não de ingestão),
  `IntegracaoExternaRepository` (`findByAtletaIdAndPlataformaAndTenantId`,
  `findActiveByAtletaIdAndPlataformaAndTenantId`, ambos já tenant-scoped).

## D1 — Client: `buscarAtividade` + `IcuActivityDto`

Novo método na interface `IntervalsIcuClient`:

```java
/** GET /api/v1/activity/{id} — erro HTTP vira IntervalsIcuApiException(status, mensagem). */
IcuActivityDto buscarAtividade(String apiKey, String activityId);
```

- **Notação real da exceção (verificado em `exception/IntervalsIcuApiException.java`):** a classe
  NÃO tem um enum de causa (`NOT_FOUND`/`FORBIDDEN`/`AUTH_INVALIDA` não existem como símbolos) — o
  construtor é `IntervalsIcuApiException(@Nullable HttpStatusCode status, String message)`. A
  distinção 401/403 vs 404 é feita pelo CHAMADOR inspecionando `exception.getStatus()`, não por um
  tipo/enum diferente lançado pelo client.
- `activityId` é `String` opaca (intervals.icu usa ids como `i86400275`); nenhum parse local.
- Implementação: usar o helper privado `executa(String operacao, Supplier<T> chamada)` já existente
  em `IntervalsIcuClientImpl` (mesmo padrão de `criarEvento`/`atualizarEvento`/`listarEventos`) —
  ele já delega erros HTTP para o `traduz(WebClientResponseException, String)` privado, que
  preserva `e.getStatusCode()` no `status` da exceção e nunca loga body/API key. Nenhum método novo
  privado é necessário; `buscarAtividade` só adiciona a chamada GET dentro do padrão existente.
- `IcuActivityDto` (record, `@JsonIgnoreProperties(ignoreUnknown = true)`), campos mínimos lidos:

```java
public record IcuActivityDto(
        String id,
        @JsonProperty("athlete_id") String athleteId,
        String type,                                  // "Run", "TrailRun", "VirtualRun", "Ride", ...
        String name,
        @JsonProperty("start_date_local") String startDateLocal,
        @JsonProperty("moving_time") Integer movingTimeSeg,
        @JsonProperty("elapsed_time") Integer elapsedTimeSeg,
        Double distance,                              // metros
        @JsonProperty("average_speed") Double averageSpeed,   // m/s
        @JsonProperty("average_heartrate") Double averageHeartrate,
        @JsonProperty("max_heartrate") Double maxHeartrate,
        @JsonProperty("total_elevation_gain") Double totalElevationGain,
        @JsonProperty("average_cadence") Double averageCadence,
        @JsonProperty("icu_rpe") Double icuRpe,       // 1-10, pode ser null
        @JsonProperty("icu_training_load") Integer icuTrainingLoad,
        @JsonProperty("device_name") String deviceName,
        Integer calories
) {}
```

Campo ausente no JSON → `null` no record (mesma tolerância do Strava sync).

**Distinção 401/403 de auth vs 404 de atividade (pre-mortem #2):** `validarApiKey` já trata 401/403
como credencial inválida (`IntervalsIcuClientImpl` linha ~50), mas ali o padrão é diferente
(`Optional.empty()`, não exceção) porque é uma validação síncrona de conexão. Para
`buscarAtividade`, o client NÃO precisa de tratamento especial — `executa`/`traduz` já preservam o
`HttpStatusCode` real (401, 403 ou 404) dentro de `IntervalsIcuApiException.getStatus()`. A
distinção vira responsabilidade do **service** (D3, passo 3): `status.value() ∈ {401, 403}` →
mapear para exceção de domínio dedicada indicando reconexão necessária (409, CA12); `status ==
404` → `DomainNotFoundException` (404, CA5). Sem essa distinção no service, um atleta que revogou a
key no intervals.icu recebe silenciosamente "atividade não encontrada" para sempre, sem sinal de
que precisa reconectar.

**Nota (2ª revisão pós-pre-mortem):** este 409 de "reconexão intervals.icu necessária" é uma
exceção de domínio DIFERENTE da nova exceção de precondição de pausa Strava (D5.2/D3 passo 1) — as
duas mapeiam para o mesmo código HTTP 409, mas são tipos distintos, cada uma com mensagem curada
própria. Não há ambiguidade para o cliente: o `message` do corpo de erro sempre distingue a causa.

## D2 — Mapper `IcuActivityDto` → `TreinoRealizado`

Classe dedicada `IntervalsIcuActivityMapper` (`mapper/` ou `services/helper/`, componente puro,
sem IO), com null-check de entrada (`IllegalArgumentException`) por padrão do repo:

- `fonteDados = INTERVALS_ICU`, `externalId = dto.id()`, `status = REALIZADO`,
  `criadoPor = "INTERVALS_ICU"`, `statusSincronizacao = PENDENTE`, `sincronizadoEm = now`.
- `dataTreino`/hora ← `start_date_local` (a API entrega horário local do atleta; sem conversão de
  zona — mesma semântica usada no push).
- `distanciaKm = distance / 1000` quando `distance` presente, senão `null` (coluna nullable — ver
  nota de schema em D4); `duracaoMin = Duration.ofSeconds(movingTime)` quando `movingTime` presente,
  senão `Duration.ZERO` (coluna `duracao_min` é `NOT NULL` — `TreinoBase.java:45` — literal `null`
  não é representável; `Duration.ZERO` é a sentinela de "ausente", mesma convenção já usada pelo
  Strava sync); `elapsedTimeSeg` direto (nullable, sem sentinela).
- **Pace (pre-mortem #11):** derivar PRIMARIAMENTE de `moving_time / distance` — mesmo método do
  `StravaActivityServiceImpl` (linhas ~513-519) — e usar `average_speed` apenas como fallback
  quando `moving_time`/`distance` estiverem ausentes. Não inverter a prioridade: o Strava já prova
  que `moving_time`/`distance` é o dado mais confiável entre fontes.
- `fcMedia`/`fcMaxima` ← arredondamento de `average_heartrate`/`max_heartrate`.
- **Cadência (pre-mortem #12):** a unidade real de `average_cadence` do intervals.icu (rpm/spm,
  perna única ou total) NÃO está confirmada — não reaproveitar a regra ambígua do FIT/Strava sem
  validar. Criar função nomeada e isolada `sanitizeCadenciaIntervalsIcu` (não reusar
  `convertStravaCadence` por analogia); o Bloco 2 inclui verificação contra um payload real antes
  de fixar a fórmula (ver D6).
- `percepcaoEsforco` ← `icu_rpe` arredondado (1..10) quando presente.
- `metadadosSincronizacao` ← JSON pequeno com `{icuTrainingLoad, calories, totalElevationGain,
  deviceName}` (mantém o TSS deles para comparação sem poluir colunas).
- **Filtro de modalidade:** aceitar apenas `type` ∈ {Run, TrailRun, VirtualRun, Treadmill} —
  recorte **próprio** desta change, NÃO um espelho exato do Strava. Verificado em
  `StravaActivityServiceImpl.java:53`: `RUN_SPORT_TYPES = Set.of("Run", "TrailRun", "VirtualRun")`
  — SEM `Treadmill`. Esta change inclui `Treadmill` porque esteira é corrida para efeito de
  TSS/PMC mesmo sem GPS (distância/pace vêm de `moving_time`/velocidade estimada do relógio, não de
  GPS) — não há motivo de negócio para excluí-la aqui só porque o Strava sync (histórico, decisão
  anterior) não a inclui. Fora do conjunto → `DomainRuleViolationException` mapeada para 422.
- **Timezone de `start_date_local` (pre-mortem #4 — Alta):** NÃO assumir "sem conversão" como
  regra vaga. Seguir o mesmo parsing do `StravaActivityServiceImpl` (linhas ~436-453): se o valor
  vier como `LocalDateTime` sem offset, usar `toLocalDate()` direto (é literalmente a data/hora
  local do atleta); se vier com offset/instant, decidir explicitamente entre preservar a data local
  do payload ou converter — mas **preservar a data local é a opção segura**, pois o objetivo é
  casar com `TreinoPlanejado.dataTreino` do fuso do atleta, não do servidor. Teste obrigatório:
  atividade perto da meia-noite (23:30-00:30) não pode "vazar" para o dia seguinte por conversão
  de fuso do servidor.

## D3 — Serviço de ingestão

`IntervalsIcuActivityIngestionService` (interface + impl em `services/impl`), método único:

```java
/**
 * Importa uma atividade específica do intervals.icu como TreinoRealizado.
 * Idempotent: YES — re-import da mesma activity retorna o treino existente sem side effects novos.
 * Side Effects: chamada externa (intervals.icu GET), insert em tb_treino_realizado (quando novo),
 *   update de TSB do dia, publicação de TreinoRegistradoEvent, gravação de decisão de reconciliação.
 * Tenant-aware: YES — conexão resolvida por (atletaId, tenantId); tenant do treino via atleta.
 */
TreinoRealizadoOutputDto importarAtividade(UUID atletaId, String activityId, UUID tenantId);
```

Fluxo (renumerado na 3ª rodada de pre-mortem — a idempotência vira o primeiro passo, ver seção
"3ª rodada de pre-mortem" acima):

0. **Guarda de idempotência ANTES de qualquer outra verificação:** busca por
   `(tenant, INTERVALS_ICU, externalId)`; se já existe, retorna o DTO existente IMEDIATAMENTE (CA2
   sem custo de rede) — sem checar a precondição de pausa Strava (passo 1) e sem resolver
   `conexaoAtiva` (passo 2). Um re-import de uma activity já persistida não tem nada novo a
   persistir, logo não há risco de nova duplicata cross-fonte a proteger.
1. **Precondição bloqueante de pausa Strava (D5.2 — mantida como safety net residual; a versão
   original de "aviso não-bloqueante" já foi corrigida na 1ª revisão, e a motivação deste passo é
   atualizada nesta revisão):** com a pausa passando a ser automática nos dois pontos de conexão
   (D5.2, subseção "Pausa automática nos dois pontos de conexão"), este passo deixa de ser a defesa
   contra "o coach esqueceu de pausar" — esse cenário praticamente deixa de existir — e passa a ser
   o freio residual para o caso em que o coach usa `retomar-sync` deliberadamente enquanto o
   intervals.icu segue ativo, e tenta importar mesmo assim (mais o TOCTOU já documentado abaixo). A
   lógica técnica não muda: só avaliada quando o passo 0 NÃO encontrou a activity já importada.
   Verificar via
   `IntegracaoExternaRepository.findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA,
   tenantId)` se existe integração Strava ativa com `autoSyncPausado=false`. Se sim, lançar exceção
   de domínio dedicada (409, mensagem curada "pause a sincronização Strava deste atleta antes de
   importar do intervals.icu") sem qualquer persistência, sem consultar a conexão intervals.icu e
   sem chamar o client. Sem Strava conectado, ou já pausado, este passo é um no-op e o fluxo segue
   normalmente. Ver D5.2 para detalhamento completo.
2. `conexaoAtiva(atletaId, tenantId)` — ausente → `DomainRuleViolationException` (409, CA4).
   Também resolve e valida o `Atleta` via `findByIdAndTenantId` explícito (pre-mortem #15 — não
   confiar apenas no `@RequireTenant` de controller, que valida um UUID genérico contra vários
   repositórios; o service usa a entidade carregada, não o UUID cru, para o resto do fluxo).
3. `client.buscarAtividade(apiKey, activityId)` — captura `IntervalsIcuApiException` e inspeciona
   `exception.getStatus()` (D1): `status.value() ∈ {401, 403}` → `DomainRuleViolationException`
   dedicada (409, mensagem indicando reconexão necessária — não confundir com "não existe"; a
   conexão é marcada com `lastSyncError` para visibilidade); `status.value() == 404` →
   `DomainNotFoundException` (404, CA5); `status.value() == 422` → `DomainRuleViolationException`
   (422, modalidade/dado rejeitado pelo próprio provedor); `status.value() == 429` ou `5xx`/status
   nulo (falha de transporte) → `DomainRuleViolationException` transitória (mensagem "tente
   novamente mais tarde"; **sem retry automático nesta change** — ação manual do coach). Ver matriz
   completa abaixo.
4. **Defesa em profundidade:** `dto.athleteId()` ≠ `conexao.externalAthleteId` → 404 (não vazar
   existência).
5. Filtro de modalidade (D2) → 422 (CA6).
6. **Reload da conexão dentro da TX de persistência (pre-mortem #9 — TOCTOU, Alta):** entre os
   passos 2 e 6 pode haver tempo suficiente para o atleta desconectar a integração
   (`IntervalsIcuConnectionServiceImpl.desconectar`, outra TX). Antes de persistir, o colaborador
   transacional recarrega `conexaoAtiva` e aborta com 409 se não estiver mais ativa — não usar a
   referência carregada no passo 2 para decidir persistência.
7. Mapper → entidade; `TreinoDedupHelper.saveIdempotent(treino, externalId, atletaId)`. **Gap
   conhecido do helper (pre-mortem #8):** o retry de conflito busca por `(externalId, atletaId)`,
   não pela chave real da constraint `(tenant, fonte, externalId)`. Isso é seguro para a corrida
   normal (mesmo atleta, dois imports concorrentes) — é exatamente a chave de colisão nesse caso.
   Só quebraria (exceção 500 em vez de idempotência) se dois ATLETAS diferentes do mesmo tenant
   compartilhassem a mesma `externalAthleteId`/activity — cenário que a mitigação do pre-mortem
   #14 (abaixo) impede na origem. Não alterar o helper compartilhado nesta change.
8. Se `inserted()`: `tssCalculadorService.calcularTss`, `tsbService.atualizarTsbDia(atletaId,
   data)` — síncrono, dentro da TX (mesmo padrão do `FitTreinoPersister`).
9. Reconciliação inline (D4) — dentro da mesma TX, ANTES da publicação do evento.
10. **Publicação do evento após commit (pre-mortem #10):** `TreinoRegistradoEvent` é publicado via
    `ApplicationEventPublisher` mas consumido por listener `@TransactionalEventListener(phase =
    AFTER_COMMIT)` (mesmo padrão do `WorkoutAnalysisListener` — o listener existente já é
    AFTER_COMMIT; o cuidado aqui é publicar o evento SÓ depois que TSS/TSB/reconciliação já estão
    computados no mesmo commit, para que o consumidor veja o treino completo).

Transação: passos 6-9 dentro de `@Transactional`; a chamada HTTP (passos 3-4) fica FORA da
transação (nunca segurar conexão de banco durante IO externo — lição da change de hardening). Os
passos 0 (guarda de idempotência) e 1 (precondição Strava) também ficam FORA de transação — leituras
simples, sem lock, antes de qualquer outro I/O do fluxo.
Implementação: método público não-transacional orquestra; persistência+reconciliação em método
transacional de colaborador (ou self-injection do proxy — preferir colaborador, padrão
`IntervalsIcuPushProcessor`).

### D3.1 — Matriz de erros completa

Espelho do D4 da change-mãe (`intervals-icu-workout-push`), adaptado ao fluxo de leitura:

| Status intervals.icu | Causa | Exceção de domínio | HTTP Menthoros | Ação |
|---|---|---|---|---|
| 401/403 | API key inválida ou revogada | `DomainRuleViolationException` dedicada | 409 | Mensagem curada indicando reconexão; conexão marcada com `lastSyncError` |
| 404 | Activity não encontrada / não pertence ao atleta | `DomainNotFoundException` | 404 | Nada persistido |
| 422 | Modalidade não suportada (filtro D2) ou rejeição do provedor | `DomainRuleViolationException` | 422 | Nada persistido |
| 429 | Rate limit do intervals.icu | `DomainRuleViolationException` transitória | 429 | Mensagem "tente novamente mais tarde"; **sem retry automático** — ação manual do coach |
| 5xx / timeout / falha de transporte (`status` nulo) | Instabilidade do provedor ou rede | `DomainRuleViolationException` transitória | mesmo tratamento de 429 | Idem 429 — sem retry automático nesta change |

Nenhum destes casos aciona retry automático (débito já registrado em `add-external-call-resilience`
para a família de integrações externas como um todo).

**409 é reservado exclusivamente para precondições de conexão/estado — nunca para rate-limit.**
Quatro causas distintas de 409 nesta change, cada uma com exceção de domínio e mensagem própria
(sem ambiguidade para o cliente): (1) ausência de conexão intervals.icu ativa (D3 passo 2, CA4);
(2) credencial intervals.icu revogada — 401/403 do provedor (D3 passo 3, acima, CA12); (3)
precondição de pausa Strava não satisfeita (D3 passo 1, D5.2); (4) `externalAthleteId` duplicado no
tenant (D5.1).
`429` do intervals.icu é sempre propagado como `429` — nunca reaproveita o 409, consistente com
`StravaRateLimitException` já existente no `GlobalExceptionHandler`.

## D4 — Reconciliação inline (extração do scheduler)

### D4.0 — Gate de pareamento push→activity (probe ANTES da implementação da heurística)

A change-mãe `intervals-icu-workout-push` já grava, ao empurrar um `TreinoPlanejado` para o
relógio, um evento intervals.icu com `external_id = menthoros-<treinoPlanejadoId>` (ver
`IntervalsIcuPushProcessor`). Quando o atleta executa esse evento e a activity resultante é
buscada por `buscarAtividade` (D1), é possível que o payload da activity referencie de volta o
evento/workout pareado — o que tornaria a janela D-1..D+1 desnecessária para esse caso: bastaria
resolver o `treinoPlanejadoId` diretamente do `external_id` do evento pareado.

**Gate obrigatório antes de qualquer task de implementação de matching no Bloco 3 do tasks.md:**

1. O founder habilita o fluxo de atividades no intervals.icu (se ainda não habilitado) e registra
   uma corrida real executando um evento previamente empurrado pela change-mãe.
2. Probe manual do payload de `GET /api/v1/activity/{id}` para essa activity, procurando qualquer
   campo que referencie o evento/workout pareado (candidatos prováveis pela doc pública do
   intervals.icu: `workout_id`, `paired_event_id`, ou o próprio campo que carregue
   `menthoros-<treinoPlanejadoId>`; o nome exato só se confirma no payload real).
3. **Se existir referência ao evento pareado:** esse vínculo direto vira o match **PRIMÁRIO** —
   resolver `treinoPlanejadoId` diretamente do id/external_id referenciado (lookup por PK, sem
   score), e a heurística D-1..D+1 (`CandidateSelector`/`ReconciliationDecisionExecutor` abaixo)
   vira **fallback**, usado só quando a activity não tem evento pareado (activity registrada sem
   passar por um push prévio — treino não planejado no Menthoros, ou planejado mas não empurrado).
4. **Se NÃO existir referência nenhuma:** a heurística D-1..D+1 abaixo permanece como único
   mecanismo, sem alteração ao design original.

O resultado do gate deve ser registrado no `tasks.md` (Bloco 3) e, se o caso 3 se confirmar, o
fluxo primário/fallback deve ser refletido no `IntervalsIcuActivityIngestionService` (D3, passo 9)
antes de escrever testes/implementação do `CandidateSelector`.

Problema que a heurística de fallback resolve: `DailyActivitySyncSchedulerImpl` só reconcilia
pendentes na janela D-1..D+1 a cada 2h. Um import de treino antigo ficaria `PENDENTE` para sempre —
invisível na fila manual (filtra `AMBIGUO`/`NAO_PLANEJADO`).

**Correção de design pós-pre-mortem (achado #5, Alta):** a versão original desta seção usava
"candidato na mesma data", divergindo da janela D-1..D+1 real do scheduler e da revisão manual
(`ReconciliacaoPendentesServiceImpl`, também ±1 dia). Isso produziria decisões diferentes para o
mesmo treino dependendo de qual caminho o processa. **Decisão corrigida: extrair também a seleção
de candidatos**, não só a decisão, para eliminar a divergência na origem:

- Novo `CandidateSelector` (ou método público reaproveitado do que hoje é privado no scheduler):
  busca `TreinoPlanejado` do atleta na janela D-1..D+1 da data do treino — **mesma janela, mesmo
  filtro de compatibilidade usados hoje pelo scheduler**, extraído dele (não uma nova regra).
- Novo `ReconciliationDecisionExecutor` (`services/helper` ou `services/impl`): recebe o
  `TreinoRealizado` + candidatos do `CandidateSelector`, chama
  `MatchingScoreCalculator`/`MatchingDecisionEngine` e grava exatamente o que
  `persistMatchingDecision` grava hoje (status, score, reasonCode, reconciledAt/by="SYSTEM",
  vínculo quando `VINCULADO_AUTOMATICO`, auditoria `TreinoReconciliacao` com
  `RECONCILIACAO_AUTOMATICA`). **Salva explicitamente o `TreinoPlanejado` vinculado** (pre-mortem
  #7): o código atual do scheduler muta `planned.statusTreino=REALIZADO` sem `save()` explícito,
  contando com a entidade estar gerenciada na mesma TX de leitura; o executor não pode assumir
  isso quando os candidatos vierem de um `CandidateSelector` chamado por outro caller — carrega os
  candidatos DENTRO da própria TX do executor e salva o vínculo explicitamente.
- **Antes de tocar no scheduler (pre-mortem #6, Alta):** escrever teste de caracterização do
  comportamento atual primeiro. Achado confirmado no código: o método
  `TreinoRealizadoRepository.findByAtletaIdAndDataTreinoAndReconciliationStatus` tem nome
  enganoso — a JPQL real filtra por `t.statusSincronizacao = :status`, não por
  `reconciliationStatus`. A extração deve preservar esse comportamento exato (escolher
  `statusSincronizacao=PENDENTE` como filtro de elegibilidade, documentando a escolha), e o nome
  do método deve ser corrigido no mesmo commit para refletir o que ele realmente faz — sem mudar
  o comportamento.
- `DailyActivitySyncSchedulerImpl` passa a delegar para `CandidateSelector` +
  `ReconciliationDecisionExecutor` (comportamento idêntico, cobertura existente permanece verde —
  CA9).
- O serviço de ingestão chama `CandidateSelector` + `ReconciliationDecisionExecutor` após o
  insert, na mesma TX dos passos 8-9 do D3.
- Sem candidato na janela → executor decide `NAO_PLANEJADO` (mesma semântica do engine hoje).

**Guarda de matching (pre-mortem #13, elevada de Média para corrigida por decisão do founder):**
Confirmado em código: `MatchingScoreCalculatorImpl.calculateDurationScore` (linhas 56-59) e
`calculateDistanceScore` (linhas 84-86) retornam `BigDecimal.ONE` (score perfeito) quando o valor
do `realizado` (ou do `planejado`) é `null`. Uma activity do intervals.icu sem GPS/duração
(summary incompleto) poderia ser auto-vinculada só pela proximidade de data — mesmo com apenas
`temporalScore (peso 0.45) + durationScore-nulo-como-1 (peso 0.35) = 0.80`, já batendo o threshold
de `VINCULADO_AUTOMATICO` sozinho, sem sequer precisar de `distanceScore`. **Não é aceitável tratar
como débito documentado** — é um caminho determinístico para vínculo incorreto.

**Correção (nesta change, dentro do `ReconciliationDecisionExecutor` novo, D4):** guarda explícita
e absoluta, aplicada DEPOIS do cálculo de score e ANTES de aceitar `VINCULADO_AUTOMATICO`: se
`realizado.getDuracaoMin() == null` OU `realizado.getDistanciaKm() == null`, o resultado é rebaixado
para `AMBIGUO` (decisão do coach) **independentemente do score calculado** — não é uma penalização
no score (que poderia ainda somar 0.80 com os outros pesos), é um veto categórico. Esta guarda vale
tanto para o import inline quanto para o scheduler batch (ambos passam pelo mesmo executor). O
`MatchingScoreCalculatorImpl` em si não é alterado (mantém compatibilidade com o comportamento
existente do Strava/`.fit`, fora de escopo desta change) — a correção fica isolada no ponto de
decisão do executor, que é novo nesta change e não existe hoje como componente próprio.

**Correção de implementação (achado do Bloco 2, verificado em código na hora de implementar o
mapper):** `TreinoBase.duracaoMin` é `@Column(name = "duracao_min", nullable = false)`
(`TreinoBase.java:45`) — literal `null` é IMPOSSÍVEL em uma entidade persistida, ao contrário do que
o texto acima assumia. `distanciaKm` (`TreinoBase.java:48-49`) não tem `nullable = false` — esse
lado permanece um `null` literal legítimo. O mapper (D2) usa `Duration.ZERO` como sentinela de
"duração ausente" quando `moving_time` não vem no payload (mesma convenção já usada pelo Strava sync
— `StravaActivityServiceImpl.mergeActivityIntoTreino`, `defaultInt(activity.movingTime())` — não é
uma invenção desta change). A guarda no `ReconciliationDecisionExecutor`, portanto, testa
`Duration.ZERO.equals(realizado.getDuracaoMin())` para o lado duração (não `== null`) e
`realizado.getDistanciaKm() == null` para o lado distância (esse sim, `null` literal). O
**significado de negócio é idêntico** — "essa medida não veio no payload, não confiar nela para
match automático" — só a representação técnica muda para respeitar a constraint de schema
existente, que esta change não teria motivo para alterar (afeta `TreinoPlanejado` também, via a
mesma `@MappedSuperclass`).

**Estensão do veto ao lado `planejado` (2ª revisão, achado do 2º pre-mortem):** a guarda acima, na
1ª rodada, só cobria duração/distância "ausentes" do `realizado` (a activity importada). O mesmo
problema existe do lado `planejado` (o `TreinoPlanejado` candidato ao match): se ele não tiver
duração nem distância cadastrada, `calculateDurationScore`/`calculateDistanceScore` também retornam
`BigDecimal.ONE` (score perfeito) — o código confirmado nas linhas 56-59/84-86 já trata isso de
QUALQUER um dos dois lados dessa forma, não só do `realizado`. A guarda categórica fica, portanto,
estendida: `VINCULADO_AUTOMATICO` é proibido quando `Duration.ZERO.equals(realizado.getDuracaoMin())`
OU `realizado.getDistanciaKm() == null` OU `Duration.ZERO.equals(planejado.getDuracaoMin())` OU
`planejado.getDistanciaKm() == null` — qualquer uma das quatro condições força `AMBIGUO`. O lado
`planejado` usa a mesma sentinela `Duration.ZERO` pelo mesmo motivo de schema (`TreinoPlanejado`
compartilha `TreinoBase`). Mesmo ponto de decisão (o `ReconciliationDecisionExecutor`), mesmo caráter
de veto absoluto (não penalização de score).

Trade-off: refatorar o scheduler tem custo/risco de regressão, mas a alternativa (duplicar a
lógica de seleção+persistência da decisão) cria a segunda e terceira cópia de uma regra crítica de
negócio — pior.

## D5 — Endpoint e segurança

Novo `IntervalsIcuActivityController` (não misturar com o controller `me/` de conexão, que é
self-service do atleta):

```
POST /api/v1/intervals-icu/atletas/{atletaId}/activities/import?activityId={id}
@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")
@RequireTenant(resourceParamIndex = 0)   // valida atletaId no tenant corrente (índice 0, primeiro parâmetro do método)
→ 200 ResponseEntity<TreinoRealizadoOutputDto>
```

- `@Tag(name = "intervals-icu-activities", ...)` (ASCII kebab-case), `@Operation` +
  `@ApiResponses` com 200/403/404/409/422/429 (padrão do repo — 429 é o rate-limit do intervals.icu,
já especificado no fluxo de erros de D3.1, só faltava no Swagger).
- POST porque muta estado (cria treino, TSB, reconciliação) — idempotente por dedup, mas não GET.
- **`activityId` como `@RequestParam String` (query param), NÃO `@PathVariable` (correção
  pós-founder, mais forte que a validação de formato do pre-mortem #3, Média):** o coach cola o
  valor da URL do intervals.icu, que pode incluir o path inteiro
  (`https://intervals.icu/activities/i86400275`). Um valor assim como `@PathVariable` quebraria o
  roteamento (o `/` extra não casa com o segmento único da rota) ou, pior, seria absorvido de forma
  ambígua dependendo do matcher do Spring. Como query param isso não acontece — o valor inteiro
  chega intacto em uma única string, e a normalização/validação (aceitar só o segmento final se vier
  URL completa; rejeitar com 400 valores contendo `/`, `?`, `%` que não sejam um id simples) fica
  inteiramente no service (D3), sem risco de colisão de rota. Padrão espelha
  `StravaAuthController.startAuth`, que já usa `@RequestParam("atletaId")` em vez de path variable
  pelo mesmo motivo de robustez de input.
- **Precondição bloqueante de Strava ativo (substitui o campo de aviso — decisão pós-2º pre-mortem,
  2026-07-16):** o endpoint NÃO retorna mais nenhum campo de aviso na resposta. Em vez disso, o
  serviço de import (D3, passo 1) bloqueia a requisição com 409 quando o atleta tem integração
  Strava ativa (`plataforma=STRAVA`, `ativo=true`) E `autoSyncPausado=false` — ver D5.2 para a
  precondição completa e a exceção de domínio dedicada. `TreinoRealizadoOutputDto` não ganha campo
  novo nesta revisão do design (a versão anterior, com `avisoSyncStravaAtivo`, foi removida).
- Erros novos já mapeados no `GlobalExceptionHandler` (`DomainNotFoundException`,
  `DomainRuleViolationException`, `IntervalsIcuApiException`) — verificar se
  `IntervalsIcuApiException` tem handler; se não, adicionar no mesmo commit do controller.

## D5.1 — Segurança: `externalAthleteId` duplicado no tenant (pre-mortem #14, Alta)

Achado do pre-mortem: nada hoje impede duas conexões `IntegracaoExterna` do mesmo tenant
apontarem para a mesma `externalAthleteId` do intervals.icu (a unique constraint atual é só
`(atleta_id, plataforma)`). Se acontecer — por engano de cadastro, ex. o coach cola a API key do
atleta A no perfil do atleta B — o import validaria `dto.athleteId() == conexao.externalAthleteId`
com sucesso e gravaria a atividade REAL de A como se fosse de B, vazando dado entre atletas.

Mitigação (guard em código, sem alterar constraint de banco): em `conexaoAtiva`/no momento do
import, validar que não existe OUTRA conexão ativa do mesmo tenant com a mesma
`externalAthleteId` antes de prosseguir; se existir, abortar com 409 e logar como alerta de
segurança (não é erro do usuário comum, é sinal de cadastro incorreto). Registrar como débito a
constraint `(tenant_id, plataforma, external_athlete_id)` para uma migration futura — esta change
já traz uma migration aditiva (V54, D5.2), mas uma UNIQUE constraint sobre dado existente exige
validar/limpar duplicatas pré-existentes primeiro (maior raio de impacto que uma coluna nova); o
guard em código já fecha o risco imediato sem essa validação de dados legados.

## D5.2 — Flag de pausa de sincronização Strava por atleta (substitui matching cross-fonte)

**Decisão do founder (blocker do DoR 2026-07-15):** o bloqueador convergente do DoR (spec-reviewer
Claude + pre-mortem Codex) foi a ausência de dedup cross-fonte — a mesma corrida física pode chegar
via Strava sync automático E via import manual do intervals.icu, duplicando TSS/PMC, porque a
constraint `uk_treino_realizado_tenant_fonte_external` (V29) só deduplica DENTRO da mesma fonte
`(tenant, fonte_dados, external_id)`. Detectar essa colisão automaticamente exigiria matching
cross-fonte por heurística de tempo+distância+duração — a mesma classe de problema do
`MatchingScoreCalculator`, mas entre fontes que não compartilham nenhum identificador comum, com
risco alto de falsos positivos (duas corridas parecidas do mesmo atleta em dias próximos) e falsos
negativos (GPS ausente em uma das fontes). Custo/complexidade desproporcional ao MVP.

**Decisão: eliminar a colisão na origem, não detectá-la depois — e eliminar também o passo manual
que podia ser esquecido.** Uma flag por atleta, setada AUTOMATICAMENTE como efeito colateral de
conectar as integrações (não mais um passo manual primário que o coach executa separadamente): ao
conectar o atleta ao intervals.icu tendo Strava já ativo, ou ao conectar/reconectar o Strava tendo
intervals.icu já ativo, a sincronização automática do Strava daquele atleta é pausada. Sem sync
automático do Strava rodando, não há caminho para a mesma corrida entrar duas vezes.
Determinístico, automático, sem heurística — e sem depender de o coach lembrar de um passo
separado (ver subseção "Pausa automática nos dois pontos de conexão" abaixo para os hooks exatos).
Os endpoints `pausar-sync`/`retomar-sync` (abaixo) permanecem como override explícito do coach, não
como o mecanismo primário.

**Campo novo:** `IntegracaoExterna.autoSyncPausado` (`boolean`, coluna `auto_sync_pausado`,
`NOT NULL DEFAULT false`, migration V54 — aditiva). Verificado: `IntegracaoExterna.java` hoje não
tem nenhum campo equivalente (`ativo` é sobre a conexão em si — token válido ou não — não sobre
"sync automático pausado"; são conceitos distintos: uma conexão pode estar `ativo=true` E
`autoSyncPausado=true` ao mesmo tempo). Aplica-se à linha `IntegracaoExterna` com
`plataforma=STRAVA` do atleta — pausar intervals.icu não faz sentido (esta change não tem sync
automático de intervals.icu, só import manual).

### Pausa automática nos dois pontos de conexão (decisão final — substitui o modelo manual-primário)

Decisão do founder (correção da premissa original, 2026-07-16): a versão anterior deste design
descrevia a pausa como um passo que o coach executa manualmente via `pausar-sync`, ao habilitar o
atleta para intervals.icu — um passo separado que ele podia esquecer (esse esquecimento foi
justamente o achado que motivou a precondição bloqueante 409 nas rodadas 2/3 de pre-mortem, ver
"Pre-mortem" abaixo). **Correção: a pausa passa a ser efeito colateral automático de conectar as
integrações, nos dois sentidos** — a invariante é "intervals.icu ativo → Strava off", e cobrir só
um sentido reabriria a mesma classe de brecha que a 3ª rodada de pre-mortem encontrou no webhook
(guard incompleto = invariante quebrada por um caminho não coberto).

1. **`IntervalsIcuConnectionServiceImpl.conectar`**
   (`services/impl/IntervalsIcuConnectionServiceImpl.java`, método `conectar`, linha 55-92): logo
   após `integracao = integracaoRepository.save(integracao);` (linha 88), busca a integração
   STRAVA ativa do mesmo atleta+tenant via
   `integracaoRepository.findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, FonteDados.STRAVA,
   tenantId)` (método já existe, tenant-scoped); se presente e `autoSyncPausado != true`, seta
   `true` e salva. Se o atleta não tem Strava conectado, no-op (nada a pausar).
2. **`StravaOAuthServiceImpl.exchangeCodeForToken`**
   (`services/impl/StravaOAuthServiceImpl.java`, linha 62-76): ANTES do único
   `integracaoExternaRepository.save(integracao)` (linha 75), busca a integração INTERVALS_ICU
   ativa do mesmo atleta+tenant (`atleta.getAssessoria().getId()` já disponível como tenantId
   nesse método); se presente, `integracao.setAutoSyncPausado(true)` no objeto Strava que está
   prestes a ser salvo (um único save, não dois) — o Strava NASCE pausado quando o atleta já usa
   intervals.icu. Sem intervals.icu conectado, comportamento inalterado (`autoSyncPausado` fica no
   default `false` da migration).

Os dois hooks são leituras simples + um `set`/`save` na mesma transação já existente do fluxo de
conexão — nenhuma transação nova, nenhum I/O externo adicional. Os endpoints
`pausar-sync`/`retomar-sync` (abaixo) permanecem disponíveis como **override explícito do coach**
sobre a mesma flag — não são mais o mecanismo primário; `retomar-sync` é o único jeito de o coach
deliberadamente reativar o Strava enquanto intervals.icu segue ativo, aceitando o risco (ver
"Riscos e mitigações" abaixo).

**Os dois hooks são monotônicos — só SETAM `true`, nunca resetam para `false`** (achado do 4º
pre-mortem, decisão do founder): nenhum dos dois hooks jamais escreve `autoSyncPausado=false`. Isso
tem uma consequência direta e intencional em `StravaOAuthServiceImpl.exchangeCodeForToken`, que é
find-or-create (`findByAtletaIdAndPlataforma(...).orElse(new IntegracaoExterna())`, linha 66) — uma
reconexão de Strava reutiliza a linha existente. Se essa linha já tem `autoSyncPausado=true` (seja
de uma pausa automática anterior, seja de uma pausa manual do coach) e o atleta reconecta o Strava
com intervals.icu **já desconectado** nesse momento, a condição do hook 2 (`integracao intervals.icu
presente?`) é falsa e o hook simplesmente não toca no campo — o `true` existente sobrevive
intacto, sem reset acidental para `false`. Este comportamento é o que torna segura a decisão abaixo
sobre `desconectar`.

**`IntervalsIcuConnectionServiceImpl.desconectar` NÃO toca em `autoSyncPausado` (decisão do founder,
4º pre-mortem — "nunca auto-retomar"):** desconectar o intervals.icu nunca reverte a pausa do
Strava automaticamente, mesmo quando a pausa foi setada pelo hook automático (não por
`pausar-sync` manual). Comportamento **conservador por design**: reativar sync automaticamente sem
ação humana explícita — mesmo ao desconectar — arrisca reabrir a colisão cross-fonte para um atleta
cuja pausa, na verdade, o coach queria manter por outro motivo (ex.: pausou manualmente por questão
alheia ao intervals.icu, ou desconectou o intervals.icu por engano e ainda está decidindo o que
fazer). Nunca há como o sistema distinguir com segurança "essa pausa não serve mais para nada"
(era só efeito colateral de uma conexão que acabou de sumir) de "essa pausa continua sendo
intencional" sem introduzir um campo de proveniência (a alternativa cogitada e descartada — rastrear
se a pausa foi automática ou manual — foi avaliada e o founder optou pela regra mais simples:
NUNCA auto-retomar). **Risco residual aceito e documentado:** um atleta cujo intervals.icu foi
desconectado permanece com Strava pausado indefinidamente até o coach chamar `retomar-sync`
manualmente — o mesmo tipo de dependência de memória do coach que esta change existe para eliminar,
mas agora do lado da saída (desconexão) em vez da entrada (conexão). Sem UI nesta change (frontend
fora de escopo) para sinalizar isso ao coach; mitigação mínima: log estruturado no momento do
`desconectar` quando o atleta tinha Strava pausado, para que a ausência de sync fique rastreável em
suporte/observabilidade, mesmo sem alerta proativo.

**Nota (fecha a pergunta simétrica antes que uma rodada futura a levante de novo):** desconectar o
STRAVA em si (`StravaOAuthServiceImpl.disconnect`, seta `ativo=false`) já exclui o atleta dos dois
caminhos automáticos de ingestão (scheduler e webhook) independentemente de `autoSyncPausado` — os
dois guards desta change filtram por `ativo=true` antes mesmo de checar a flag
(`IntegracaoExternaRepository`, métodos `findActiveByAtletaIdAndPlataformaAndTenantId`/
`findActiveByExternalAthleteIdAndPlataforma`). Nenhum hook novo é necessário para esse sentido; é
consequência direta de uma invariante que já existe no código, não algo que esta change precisa
introduzir.

**TOCTOU residual: `retomar-sync` manual vs hook automático em transações concorrentes (achado do
5º pre-mortem, Baixo/Médio, mesma classe dos demais TOCTOUs já aceitos neste design):** não há lock
entre um coach chamando `PATCH .../retomar-sync/{atletaId}` e, na mesma janela de milissegundos, um
dos dois hooks automáticos setando `autoSyncPausado=true` em outra transação (ex.: o atleta
reconecta o Strava exatamente quando o coach está retomando manualmente). Comportamento hoje:
last-write-wins, sem lock distribuído — mesmo padrão já aceito para o TOCTOU do scheduler e do
import manual (ver "Riscos e mitigações" no `proposal.md`). Aceito sem mitigação adicional: é uma
colisão entre duas ações humanas/deliberadas raras, não um caminho automático recorrente; não
justifica lock nesta change.

Agora um **override explícito do coach** sobre a flag setada automaticamente pelos hooks acima —
não mais o mecanismo primário de pausa.

```
PATCH /api/v1/strava/pausar-sync/{atletaId}
PATCH /api/v1/strava/retomar-sync/{atletaId}
@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")
@RequireTenant(resourceParamIndex = 0)
→ 200 ResponseEntity<StravaSyncPauseStatusDto>
```

Retorno tipado (record novo, `dto/output/`), não `Map<String, Object>` — regra "Response Types
(mandatory)" do CLAUDE.md do backend:

```java
public record StravaSyncPauseStatusDto(boolean autoSyncPausado, Instant atualizadoEm) {}
```

- PATCH porque é atualização parcial de um recurso existente (a conexão Strava) — semântica HTTP
  mandatória do CLAUDE.md.
- Pré-condição: precisa existir uma `IntegracaoExterna` STRAVA para o atleta (já conectou ao Strava
  ao menos uma vez) — buscar via `IntegracaoExternaRepository.findByAtletaIdAndPlataformaAndTenantId`
  (já existe, tenant-scoped). Se não existir → `DomainNotFoundException` (404, "atleta não tem
  integração Strava"). Não fabricar uma linha `IntegracaoExterna` vazia só para guardar a flag —
  a linha real é criada pelo fluxo OAuth (`StravaOAuthServiceImpl`), este endpoint só atualiza.
- `pausar-sync`/`retomar-sync` são idempotentes (reaplicar o mesmo valor é no-op seguro), mesmo
  espírito do `desconectar` do `IntervalsIcuConnectionServiceImpl` (`ifPresentOrElse`).

**Guarda no(s) scheduler(s) automático(s) do Strava (CA10) — achado de implementação do Bloco 6
(correção crítica, sobrevive a 5 rodadas de DoR): existem DOIS componentes com nome/formato de
"scheduler" no domínio Strava, e só UM deles insere atividades novas. A correção original do design
(rodadas 1-5) guardava o componente ERRADO como defesa primária.**

1. **`StravaActivitySyncScheduler` (`services/StravaActivitySyncScheduler.java`, SEM sufixo
   `Impl`, `@Scheduled(fixedDelayString = "PT2H")`) — este É o caminho automático real de INSERT
   diário.** `runDailyIncrementalSync()` lista via
   `IntegracaoExternaRepository.findAllActiveByPlataforma(FonteDados.STRAVA)`
   (`IntegracaoExternaRepository.java:56-64`) e, para cada integração, chama
   `stravaActivityService.syncActivities(atletaId)` — que busca atividades novas na API do Strava e
   as persiste via `mergeActivityIntoTreino` + `TreinoDedupHelper.saveIdempotent`
   (`StravaActivityServiceImpl.java:128-144`, mesmo padrão de `syncSingleActivityById` usado pelo
   webhook). **Guard primário:** adicionar `and (i.autoSyncPausado = false or i.autoSyncPausado is
   null)` a `findAllActiveByPlataforma` — o atleta pausado não aparece na lista que este scheduler
   itera. **Late-check (TOCTOU, mesmo raciocínio do achado original do 2º pre-mortem):**
   imediatamente antes de `syncActivities(atletaId)`, revalidar com
   `findByAtletaIdAndPlataformaAndTenantId` fresco; se `autoSyncPausado=true` nesse ponto, pular
   (log INFO, sem exceção) — cobre o coach pausando o atleta ENTRE a listagem inicial e o
   processamento dele dentro do mesmo ciclo.
2. **`DailyActivitySyncSchedulerImpl` (`services/impl/DailyActivitySyncSchedulerImpl.java`, COM
   sufixo `Impl`) — este é RECONCILIAÇÃO-ONLY, não insere nada novo.** Verificado em código
   (`DailyActivitySyncSchedulerImpl.java:104,161-166`): lista atletas via
   `AtletaRepository.findAllWithStravaConnected()`, mas o corpo do loop só busca
   `TreinoRealizado` JÁ existentes com `statusSincronizacao=PENDENTE`
   (`findByAtletaIdAndDataTreinoAndReconciliationStatus`) e decide/persiste a reconciliação contra
   candidatos `TreinoPlanejado` — nunca chama a API do Strava, nunca cria um `TreinoRealizado` novo.
   Guardar `findAllWithStravaConnected` com o mesmo filtro `autoSyncPausado` (já implementado,
   mantido) **não é a defesa primária contra duplicação cross-fonte** — é uma camada de defesa em
   profundidade adicional: evita que este scheduler reconcilie um registro Strava
   `PENDENTE` pré-existente (inserido antes da pausa) contra um planejado, para um atleta cuja fonte
   de verdade migrou para intervals.icu. Sem impacto se removido, mas barato de manter.

**Por que a rodada 1-5 assumiu o componente errado:** `AtletaRepository.findAllWithStravaConnected()`
tem nome genérico o suficiente ("atletas com Strava conectado") para parecer o ponto de entrada
óbvio de "o scheduler que sincroniza o Strava", e o `DailyActivitySyncSchedulerImpl` tem `@Scheduled`
+ nome "DailyActivitySync" — sem ler o corpo do método, a suposição razoável (mas errada) é que ele
busca E insere atividades. Só a leitura completa do corpo (`syncAtletaActivities`, achado do Bloco 6)
revela que ele só reconcilia. Nenhuma das 5 rodadas de DoR (2 Claude + 3 Codex) leu o corpo desse
método linha a linha — todas confiaram no nome + no `@Scheduled` como sinal suficiente.

**Guarda TAMBÉM no webhook Strava (achado da 3ª rodada de pre-mortem, CRÍTICO — não é débito, é
gap real verificado em código):** o scheduler NÃO é o único caminho automático de ingestão do
Strava. Existe um SEGUNDO caminho, em tempo real, que não passa por `findAllWithStravaConnected`
nem pelo scheduler: `StravaWebhookServiceImpl.handleEventAsync` (evento recebido a qualquer
momento do Strava) → `processCreateEvent`/`processUpdateEvent`
(`StravaWebhookServiceImpl.java:70-79`) → `requireIntegration(ownerId)`
(`StravaWebhookServiceImpl.java:89-95`) → `stravaActivityService.syncSingleActivityById(...)` — SEM
checar nenhuma flag hoje. Se a flag `autoSyncPausado` guardar só o scheduler, o coach pausa o
atleta achando que eliminou a colisão, mas um webhook do Strava em tempo real ainda insere a mesma
atividade por esse segundo caminho, reabrindo exatamente o gap de duplicação cross-fonte que a flag
deveria fechar. O contrato semântico da flag ("Strava pausado para este atleta") só é verdadeiro se
cobrir os DOIS pontos de entrada — mesmo o webhook pertencendo originalmente ao domínio Strava, esta
change (`intervals-icu-activity-ingestion`) estende o guard também ali, porque é o consumidor que
depende da garantia de "sem sync automático Strava rodando".

Ponto de correção em `requireIntegration(Long ownerId)`
(`StravaWebhookServiceImpl.java:89-95`): logo após resolver `integracao`, se
`integracao.isAutoSyncPausado()` for `true`, o processamento deve ser pulado SILENCIOSAMENTE — sem
lançar exceção. Isso não pode reusar a exceção 409 de precondição do import manual (D5.2/D3 passo
1): o endpoint HTTP do webhook precisa responder 200 ao Strava independentemente do resultado, por
contrato do webhook — se a chamada lançar, o Strava reenvia o evento (retry infinito de um evento
que nunca vai ser processado). `processCreateEvent` e `processUpdateEvent`
(`StravaWebhookServiceImpl.java:70-79`) são os dois pontos afetados — ambos chamam
`requireIntegration` como primeiro passo. `processDeleteEvent`
(`StravaWebhookServiceImpl.java:82-87`) NÃO precisa do guard: deletar um treino que talvez nem
exista pela pausa é inofensivo/idempotente (`findByExternalIdAndAtletaId(...).ifPresent(...)` já
tolera ausência).

Implementação sugerida (não faz parte desta change implementar, só documentar o ponto de correção
para a change/PR que tocar `requireIntegration`): mover o skip para dentro de `requireIntegration`
faria `processDeleteEvent` também pular — o que é aceitável (idempotente), mas para manter a
intenção explícita, o guard pode ficar no início de `processCreateEvent`/`processUpdateEvent` (após
`requireIntegration` resolver `integracao`) em vez de dentro do método privado. Qualquer uma das
duas opções preserva "sem exceção, sem persistência, webhook responde 200".

**Late-check antes de cada sync (TOCTOU, achado do 2º pre-mortem — correção de alvo no Bloco 6):**
ver o item 1 da lista acima ("Guarda no(s) scheduler(s)") — o late-check real fica em
`StravaActivitySyncScheduler.runDailyIncrementalSync`, imediatamente antes de
`stravaActivityService.syncActivities(atletaId)`, revalidando `autoSyncPausado` com
`findByAtletaIdAndPlataformaAndTenantId` fresco (não reusando o valor lido em
`findAllActiveByPlataforma` na listagem inicial do ciclo). Pula o atleta no MESMO ciclo (log INFO,
sem exceção) quando pausado nesse ponto — não apenas a partir do próximo ciclo.

**Precondição bloqueante no import (substitui o aviso não-bloqueante — correção do 2º pre-mortem,
2026-07-16; ordem ajustada na 3ª rodada de pre-mortem):** o `IntervalsIcuActivityIngestionService`
(D3, passo 1 — roda logo após a guarda de idempotência, passo 0, e ANTES de qualquer outro passo
subsequente do fluxo, inclusive antes de `conexaoAtiva`, passo 2) verifica, via
`IntegracaoExternaRepository.findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA,
tenantId)`, se existe integração Strava ativa (`ativo=true`) com `autoSyncPausado=false`. Se sim,
lança uma exceção de domínio dedicada nova (distinta das demais exceções 409 do fluxo — ver D3.1)
mapeada para HTTP 409 com mensagem curada: *"pause a sincronização Strava deste atleta antes de
importar do intervals.icu"*. Nenhuma persistência ocorre — nem leitura da conexão intervals.icu, nem
chamada ao client. **Este passo só é alcançado se o passo 0 (dedup) não encontrou a activity já
importada** — re-import de activity existente retorna 200 direto no passo 0, sem chegar aqui (CA2,
ver "Achado MÉDIO" na seção "3ª rodada de pre-mortem"). Quando o atleta não tem Strava conectado, ou
tem mas está com `autoSyncPausado=true`, o passo 1 é um no-op e o fluxo segue normalmente a partir
do passo 2.

**Por que substitui a abordagem de matching cross-fonte (custo/benefício):** matching por
heurística teria falsos positivos/negativos e complexidade alta (novo `CrossSourceMatchingService`,
novos thresholds, novos testes de todas as combinações Strava×intervals.icu); a flag é
determinística, sob controle do coach, e a mudança de schema é uma única coluna boolean aditiva.

**Riscos e mitigações (registrado explicitamente, não implícito):**
- **A pausa é automática nos dois pontos de conexão (camada primária) — o import BLOQUEADO com 409
  é o safety net residual, não mais a defesa contra esquecimento** (decisão final, corrige a
  premissa da flag manual-primária das rodadas anteriores). Com os hooks em
  `IntervalsIcuConnectionServiceImpl.conectar` e `StravaOAuthServiceImpl.exchangeCodeForToken`
  (subseção "Pausa automática nos dois pontos de conexão" acima), o cenário "coach esqueceu de
  pausar" praticamente deixa de existir — a pausa acontece no mesmo instante em que a segunda
  integração é conectada, nos dois sentidos. O 409 no import sobrevive como freio para o caso
  residual em que o coach usa `retomar-sync` deliberadamente enquanto o intervals.icu segue ativo
  (aceitando o risco) e tenta importar mesmo assim; a mensagem curada do erro 409 guia essa ação.
  Isso elimina também o cenário histórico em que o PRIMEIRO import duplicava de qualquer forma
  quando a versão de aviso não-bloqueante (1ª revisão) ainda estava em vigor.
- **A flag cobre os DOIS caminhos automáticos do Strava, não só o scheduler de ingestão** (achado
  da 3ª rodada de pre-mortem, ver acima): `StravaActivitySyncScheduler` diário
  (`findAllActiveByPlataforma` + late-check — o scheduler que efetivamente insere, ver achado do
  Bloco 6 acima) E webhook em tempo real (`StravaWebhookServiceImpl.requireIntegration`, guard
  novo). Sem o guard no webhook, pausar o atleta só bloqueava metade do caminho de duplicação — o
  webhook continuaria inserindo a mesma atividade em tempo real, reabrindo o gap que a flag deveria
  fechar.
- **TOCTOU do scheduler concorrente:** o `StravaActivitySyncScheduler` roda em ciclo fixo (`PT2H`);
  se o coach pausar o atleta enquanto o scheduler já está no meio do processamento do lote, o
  late-check (acima) revalida `autoSyncPausado` imediatamente antes de chamar
  `syncActivities(atletaId)` daquele atleta — se pausado nesse ponto, o atleta é pulado no MESMO
  ciclo, não apenas a partir do próximo. Risco residual: milissegundos
  entre a revalidação do late-check e o insert efetivo (mesma classe de qualquer check-then-act sem
  lock distribuído) — aceito, não eliminado; não há lock distribuído nesta change.
- **TOCTOU residual entre a checagem de precondição do import manual e um insert concorrente do
  scheduler:** entre o passo 1 do import (D3) confirmar a precondição (bloqueado ou liberado) e o
  insert efetivo da atividade intervals.icu, o sync automático do Strava pode, em teoria, inserir
  uma atividade concorrente na mesma janela de milissegundos — o passo 1 é uma leitura simples fora
  de transação, sem lock. Aceito e documentado: janela de milissegundos, ação humana (o coach que
  dispara o import), sem lock distribuído nesta change — mesma classe de risco já aceita em outros
  TOCTOUs do design (pre-mortem #9).
- **Guard do webhook Strava (achado da 3ª rodada de pre-mortem, ver seção acima):** sem o guard em
  `StravaWebhookServiceImpl.requireIntegration` (novo, ver "Guarda no scheduler" acima), a flag só
  fecharia metade do caminho de duplicação automática — o webhook do Strava, em tempo real,
  continuaria inserindo atividades independentemente da pausa. Corrigido: guard cobre scheduler
  (listagem + late-check) e webhook (skip silencioso, sem exceção, no `requireIntegration`).
- **Strava permanece pausado indefinidamente após desconectar o intervals.icu (achado convergente do
  4º pre-mortem — Claude spec-reviewer e Codex, independentemente, ver seção "5ª rodada" abaixo):**
  `IntervalsIcuConnectionServiceImpl.desconectar` não tem hook simétrico que reverta a pausa —
  decisão do founder de NUNCA auto-retomar (ver subseção "Pausa automática nos dois pontos de
  conexão" acima para a justificativa completa: um único booleano não distingue pausa automática de
  pausa manual, e auto-retomar sem essa distinção arrisca reabrir sync que o coach queria manter
  pausado por outro motivo). Aceito como risco residual: o coach precisa saber que
  `retomar-sync` existe e chamá-lo manualmente após desconectar o intervals.icu; mitigado apenas por
  log estruturado no momento do `desconectar`, sem alerta proativo (frontend fora de escopo).

## D6 — Validação real (gate de smoke)

Igual à change-mãe: antes de dar a change por concluída, smoke com atleta real conectado —
importar uma activity de corrida verdadeira e verificar: treino no Menthoros com métricas
corretas, reconciliado ao planejado do dia, TSB atualizado. Registrar no `tasks.md` o resultado.
Itens obrigatórios do smoke (expandido pós pre-mortem/product review/decisão do founder):

1. **Formato real do activity id e payload:** confirmar o formato (`i86400275` vs numérico), os
   campos realmente presentes em `GET /api/v1/activity/{id}` (em especial `athlete_id`,
   `average_speed` vs `moving_time`/`distance`, unidade de `average_cadence`, formato de
   `start_date_local`) — travar D2/D3 na realidade, não na suposição. Este item também é o probe do
   gate D4.0 (pareamento push→activity) — rodar junto, mesma activity real.
2. **Cross-tenant/cross-atleta:** tentar importar com a API key de um atleta contra o
   `activityId` de outro (mesma conta intervals.icu vs conta diferente) e confirmar que o
   intervals.icu responde 403/404 como esperado, e que o guard do D5.1 bloqueia antes da chamada
   quando aplicável.
3. **Virada de dia:** activity próxima da meia-noite local do atleta — confirmar que
   `dataTreino` não "vaza" para o dia seguinte por fuso do servidor.
4. **Paridade scheduler vs import inline:** após o refactor do D4, confirmar que o scheduler
   rodando seu ciclo normal de 2h continua reconciliando outros treinos pendentes com a mesma
   decisão que o import inline produziria para um caso equivalente (mesmo `CandidateSelector` +
   `ReconciliationDecisionExecutor` compartilhados — não é um teste novo de comportamento, é a
   confirmação de que a extração não regrediu o batch).
5. **Guarda de pausa Strava (D5.2, CA10) — mecanismo automático (camada primária) primeiro:** com o
   atleta founder já com Strava ativo, conectar o intervals.icu (`IntervalsIcuConnectionServiceImpl
   .conectar`) e confirmar via query direta que `auto_sync_pausado` virou `true` sem nenhuma chamada
   ao endpoint manual; confirmar que o atleta desaparece de `IntegracaoExternaRepository
   .findAllActiveByPlataforma(STRAVA)` — a listagem real do `StravaActivitySyncScheduler` (achado do
   Bloco 6: NÃO é `AtletaRepository.findAllWithStravaConnected`, que só alimenta o scheduler de
   reconciliação) — no próximo ciclo. Repetir no sentido inverso com outro atleta (ou
   desconectar/reconectar o Strava do mesmo): com intervals.icu já ativo, (re)conectar o Strava
   (`StravaOAuthServiceImpl.exchangeCodeForToken`) e confirmar que a linha nasce com
   `auto_sync_pausado=true` desde o primeiro save, sem janela em que fica `false`.
6. **Guarda de pausa Strava — override manual (camada secundária):** com o atleta do item 5 ainda
   pausado, confirmar que um import de intervals.icu prossegue normalmente (200); usar
   `PATCH .../retomar-sync/{atletaId}` para reabrir o Strava deliberadamente e confirmar que um novo
   import é bloqueado com 409 e mensagem curada, sem persistência; usar
   `PATCH .../pausar-sync/{atletaId}` para pausar de novo e confirmar que o atleta volta a
   desaparecer do `StravaActivitySyncScheduler`.
7. **Desconectar o intervals.icu não reativa o Strava (decisão do founder, 5º pre-mortem):** com o
   atleta do item 5 ainda `auto_sync_pausado=true` (setado pelo hook automático), desconectar o
   intervals.icu (`IntervalsIcuConnectionServiceImpl.desconectar`) e confirmar via query direta que
   `auto_sync_pausado` permanece `true` (não reverte); confirmar que o log estruturado de
   `desconectar` foi emitido (tasks.md 6.12); confirmar que o atleta só volta a aparecer para o
   scheduler depois de `retomar-sync` manual.

## Pre-mortem

Cross-model review via Codex (2026-07-15), 15 achados. Os de severidade Alta foram todos
incorporados no design acima (referenciados inline por número); resumo:

| # | Achado | Severidade | Onde foi endereçado |
|---|---|---|---|
| 1 | Formato de `athlete_id` não confirmado | Alta | D6 item 1 (gate de smoke) |
| 2 | 401/403 colapsados em 404 esconde credencial revogada | Alta | D1 |
| 3 | `activityId` sem validação de formato/URL colada | Média | D5 |
| 4 | `start_date_local` sem regra de fuso definida | Alta | D2 |
| 5 | Janela de candidatos inconsistente (mesma data vs D-1..D+1) | Alta | D4 |
| 6 | Nome enganoso do método do repositório; risco de divergência na extração | Alta | D4 (teste de caracterização obrigatório antes do refactor) |
| 7 | `TreinoPlanejado` vinculado sem `save()` explícito | Média | D4 |
| 8 | Dedup helper reconsulta por `(externalId, atletaId)`, não pela chave da constraint | Alta | D3 passo 7 (mitigado indiretamente pelo #14; aceito como comportamento existente fora de escopo alterar) |
| 9 | TOCTOU: conexão pode ser revogada entre passo 2 e o insert | Alta | D3 passo 6 |
| 10 | Ordem de publicação do evento vs commit de TSS/TSB/reconciliação | Média | D3 passo 10 |
| 11 | Pace deveria priorizar `moving_time`/`distance`, não `average_speed` | Alta | D2 |
| 12 | Unidade de cadência não confirmada | Alta | D2, D6 item 1 |
| 13 | Campos nulos podem gerar score perfeito no matching | Média → corrigido (não mais débito) | D4 (guarda absoluta no `ReconciliationDecisionExecutor`) |
| 14 | Nada impede `externalAthleteId` duplicado no tenant (vazamento cross-atleta) | Alta | D5.1 (novo) |
| 15 | `@RequireTenant` valida UUID genérico, não especificamente `Atleta` | Média | D3 passo 2 |

Product review (2026-07-15): veredito **Go com refinamentos** (nenhum bloqueador). Achados e
disposição:
- **Invariante Strava/intervals.icu:** achado confirmado — sem alguma regra, um atleta com ambas
  as integrações tem a mesma atividade do Garmin ingerida em duplicata (fontes diferentes não
  deduplicam entre si). **Resolvido nesta própria change** (não adiado): em vez de desligamento
  *automático* do Strava (que tira o controle do coach), a mitigação é a **flag de pausa por
  atleta** (D5.2, abaixo). **Correção pós-2º pre-mortem (2026-07-16):** import sem a pausa ativa
  agora é BLOQUEADO (409), não mais um aviso não-bloqueante — a versão anterior deixava o primeiro
  import duplicar de qualquer forma quando o coach esquecia de pausar. **Correção final (4ª rodada,
  decisão do founder, 2026-07-16):** a flag em si deixou de ser um passo manual — passa a ser
  setada automaticamente nos dois pontos de conexão (ver subseção "Pausa automática nos dois pontos
  de conexão" em D5.2); os endpoints manuais viram override explícito do coach, e o 409 acima passa
  a ser safety net residual, não mais a defesa primária contra o esquecimento.
- Métrica de sucesso mede construção, não adoção → aceito como métrica de lançamento; adoção real
  (imports/semana por assessoria) fica para acompanhamento pós-merge, fora do escopo desta change.
- Import manual gera fricção vs sync automático do Strava → aceito conscientemente como MVP; a
  proposta já declara listagem/seleção de atividades como evolução futura fora de escopo (seção
  "Fora de escopo" do proposal.md), não como promessa vaga.
- Risco de regressão do scheduler → endereçado por D4 (teste de caracterização + smoke de
  paridade no D6 item 4).
- Loop de aprendizado do `MatchingDecisionEngine`: fora de escopo desta change — o engine hoje não
  aprende de correções do coach independentemente da fonte (Strava, .fit ou intervals.icu); não é
  uma lacuna introduzida por esta change.
- Validação de isolamento de tenant: endereçada por D5.1 e D6 item 2.

### DoR gate 2026-07-15: bloqueador de dedup cross-fonte

Rodada seguinte de DoR (spec-reviewer Claude + pre-mortem Codex, em paralelo) veio **NOT READY**:
achado convergente e não coberto pelos 15 itens acima — nenhuma dedup cross-fonte entre Strava e
intervals.icu (`uk_treino_realizado_tenant_fonte_external` só cobre DENTRO da mesma fonte). Decisão
do founder resolveu com a flag de pausa (D5.2), substituindo a alternativa de matching cross-fonte
por heurística que teria sido necessária. Gaps adicionais do mesmo DoR corrigidos nesta revisão:
gate de pareamento push→activity (D4.0), guarda absoluta de campos nulos no matching (D4, achado
#13 acima — elevado de "débito" para "corrigido"), matriz de erros completa (D3.1), contrato do
endpoint sem `activityId` em path variable (D5), non-goals explícitos de backfill e refresh
(proposal.md). Re-DoR pendente após esta rodada de correções.

### 2ª rodada de pre-mortem (Codex, 2026-07-16): aviso não-bloqueante → precondição bloqueante

Achado: a versão anterior desta seção (aviso não-bloqueante `avisoSyncStravaAtivo`, CA11) deixava o
**primeiro import duplicar de qualquer forma** quando o atleta já tinha Strava conectado e o coach
esquecia de pausar — o aviso era pós-facto (aparecia na resposta do import que JÁ tinha persistido),
não preventivo. **Decisão corrigida:** o import passa a ser bloqueado por precondição — 409 quando
Strava ativo E `autoSyncPausado=false` (D3 passo 1, D5.2); sem Strava ou já pausado, prossegue
normal. `429` fica reservado exclusivamente para rate-limit real do intervals.icu (D3.1). O campo
`avisoSyncStravaAtivo` e toda a lógica de "aviso" foram removidos do design (D5, D5.2). Achados
adicionais da mesma rodada, também incorporados: late-check no scheduler antes de cada persistência
(D5.2, TOCTOU) e extensão do veto de campos nulos no matching para o lado `planejado` além do
`realizado` (D4).

### 3ª rodada de pre-mortem (2026-07-16): guard da flag não cobria o webhook do Strava + ordem entre idempotência e precondição

**Achado CRÍTICO (verificado em código, não é falso positivo):** o design especificava a flag
`autoSyncPausado` guardando apenas `AtletaRepository.findAllWithStravaConnected()`, consumido pelo
`DailyActivitySyncSchedulerImpl` (scheduler diário). Existe um SEGUNDO caminho automático de
ingestão do Strava, em tempo real, que não passa pelo scheduler: o webhook do Strava
(`StravaWebhookServiceImpl.handleEventAsync` → `processCreateEvent`/`processUpdateEvent`
→ `requireIntegration(ownerId)` → `stravaActivityService.syncSingleActivityById(...)`, verificado em
`StravaWebhookServiceImpl.java:69-95`) não checava nenhuma flag. **Decisão corrigida:** o guard
passa a cobrir os DOIS caminhos automáticos do Strava — detalhado em D5.2 (subseção "Guarda TAMBÉM
no webhook Strava"), Bloco 6 do `tasks.md` e novo cenário BDD no `spec.md`.

**Achado MÉDIO:** o fluxo do D3 originalmente checava a precondição de pausa Strava (passo 0, antes
de qualquer outra coisa) ANTES da checagem de idempotência/dedup (originalmente passo 2). Isso
quebrava CA2 no seguinte cenário: activity já importada antes + Strava ficou ativo/não-pausado
depois → um re-import deveria continuar retornando 200 (idempotência, nada novo a persistir), mas
com a ordem antiga seria bloqueado incorretamente com 409. **Decisão corrigida:** a guarda de
idempotência vira o passo 0 do fluxo (dedup por `(tenant, INTERVALS_ICU, externalId)`, leitura pura
sem custo de chamada externa); se a activity já existe, retorna 200 imediatamente, sem checar a
flag Strava. A precondição de pausa Strava só é avaliada quando a activity AINDA NÃO existe — porque
só nesse caso o import vai efetivamente persistir algo novo, e é exatamente esse "algo novo" que a
precondição protege. Ver D3 (fluxo renumerado) e D3.1 (matriz de 409 atualizada) abaixo.

### 4ª rodada (decisão do founder, 2026-07-16): pausa manual-primária corrigida para automática nos dois pontos de conexão

**Correção de premissa:** as rodadas 2/3 de pre-mortem tratavam a pausa (`autoSyncPausado=true`)
como um passo que o coach executa manualmente via `PATCH /api/v1/strava/pausar-sync/{atletaId}` ao
habilitar o atleta para intervals.icu — e a precondição bloqueante 409 no import existia justamente
porque esse passo manual podia ser esquecido. **Decisão do founder: a pausa passa a ser efeito
colateral AUTOMÁTICO de conectar as integrações**, nos dois sentidos
(`IntervalsIcuConnectionServiceImpl.conectar` e `StravaOAuthServiceImpl.exchangeCodeForToken`, ver
subseção "Pausa automática nos dois pontos de conexão" em D5.2) — cobrir só um sentido reabriria a
mesma classe de gap que a 3ª rodada encontrou no webhook (guard incompleto = invariante quebrada
por um caminho não coberto). Os endpoints manuais `pausar-sync`/`retomar-sync` deixam de ser o
mecanismo primário e passam a ser **override explícito do coach**. A precondição bloqueante 409 no
import (D3 passo 1) muda de papel: deixa de ser a defesa contra "o coach esqueceu de pausar" (esse
cenário praticamente deixa de existir) e vira o **safety net residual** para o cenário "coach usou
`retomar-sync` deliberadamente enquanto intervals.icu ainda está ativo, e tenta importar mesmo
assim" — mais o TOCTOU já documentado. Nenhuma mudança na lógica técnica do 409 (D3/D3.1), nem no
late-check do scheduler, nem no guard do webhook — só na narrativa de por que existem. Arquitetura
final em defesa em profundidade: pausa automática (primária) + 409 no import (safety net) +
late-check no scheduler + guard no webhook — cada camada cobre o que a anterior não cobre.

### 5ª rodada — DoR pós-4ª-correção (2026-07-16): ciclo de vida de desconexão do intervals.icu não estava especificado

**Achado convergente (Claude spec-reviewer e Codex pre-mortem, de forma independente, mesma rodada):**
a 4ª rodada especificou os dois hooks de pausa automática (conectar) mas nenhum dos quatro arquivos
definia o que acontece com `autoSyncPausado` quando o intervals.icu é desconectado
(`IntervalsIcuConnectionServiceImpl.desconectar`) enquanto o Strava permanece pausado. Sem essa
definição, um atleta cujo coach desconecta o intervals.icu (troca de relógio, engano de cadastro,
etc.) ficaria com o Strava pausado permanentemente, sem sinal algum — a mesma classe de "invariante
quebrada por um caminho não coberto" das rodadas 3/4, agora no caminho de saída em vez de entrada.

Codex acrescentou uma observação estrutural: como os hooks e os endpoints manuais escrevem o MESMO
campo booleano, não há como o sistema distinguir "pausa automática, efeito colateral de uma conexão
que já não existe mais" de "pausa manual deliberada do coach por outro motivo" — o que bloqueia
qualquer regra de auto-retomada segura sem introduzir um campo de proveniência.

**Decisão do founder: NUNCA auto-retomar** (não introduzir campo de proveniência; `desconectar`
simplesmente não toca em `autoSyncPausado`) — ver justificativa completa e risco residual aceito na
subseção "Pausa automática nos dois pontos de conexão" (D5.2) e no bullet correspondente em "Riscos
e mitigações" acima. Corrigido também, na mesma rodada: métrica de sucesso desatualizada em
`proposal.md` (o contador de 409 ainda descrevia "atletas não pausados", framing da era manual-
primária — corrigido para "uso do override `retomar-sync`"); inconsistência textual `nullable/default
false` vs `NOT NULL DEFAULT false` no Rollback; e cobertura de teste ausente para reconexão do Strava
quando a linha já existe com `autoSyncPausado=true` herdado (achado Codex #4) — os hooks são
monotônicos (só setam `true`, nunca resetam para `false`), o que já torna esse caso seguro por
construção, mas faltava o teste explícito (ver tasks.md 6.11).

### 6ª rodada — achado durante a implementação do Bloco 6 (2026-07-16): guard aplicado no scheduler ERRADO

**Achado CRÍTICO, mais grave que o da 3ª rodada — sobreviveu a 5 rodadas de DoR (2 Claude
spec-reviewer + 3 Codex pre-mortem), nenhuma delas leu o corpo do método linha a linha.** Ao
implementar a task 6.3 (guard na listagem do "scheduler diário"), a leitura completa de
`DailyActivitySyncSchedulerImpl.syncAtletaActivities` revelou que esse componente **não insere
nenhum `TreinoRealizado` novo** — ele só busca registros JÁ persistidos com
`statusSincronizacao=PENDENTE` (`findByAtletaIdAndDataTreinoAndReconciliationStatus`) e decide/grava
a reconciliação contra `TreinoPlanejado` candidatos. É reconciliação pura, não ingestão.

O caminho automático REAL de ingestão diária do Strava — o que efetivamente busca atividades novas
na API e as persiste — é um componente DIFERENTE, com nome parecido mas em pacote diferente:
`StravaActivitySyncScheduler` (`services/StravaActivitySyncScheduler.java`, SEM sufixo `Impl`,
`@Scheduled(fixedDelayString = "PT2H")`) → `IntegracaoExternaRepository
.findAllActiveByPlataforma(FonteDados.STRAVA)` → `stravaActivityService.syncActivities(atletaId)`
(mesmo padrão de persistência de `syncSingleActivityById`, já usado pelo webhook). O guard
implementado nas rodadas 1-5 (`AtletaRepository.findAllWithStravaConnected`, consumido por
`DailyActivitySyncSchedulerImpl`) **nunca bloqueou o caminho automático real de duplicação
cross-fonte pelo lado do scheduler diário** — apenas evitava que um registro Strava já inserido
fosse reconciliado contra um planejado, o que não é a mesma coisa que evitar a duplicação em si.

**Por que passou por 5 rodadas:** os dois nomes são quase idênticos ("`DailyActivitySync...`" vs
"`StravaActivitySync...`"), ambos têm `@Scheduled`, ambos mexem com Strava — sem ler o corpo de
`syncAtletaActivities` linha a linha (algo que nenhuma das reviews textuais fez, incluindo a minha
própria leitura do design em rodadas anteriores), a suposição de que "o scheduler com nome de
sincronização diária é o que insere" é razoável, mas errada. Nenhuma pergunta de pre-mortem chegou a
formular "existe mais de um componente `@Scheduled` relacionado a Strava? qual deles realmente
persiste?" — o tipo de pergunta que só a leitura de código, não da spec, revela.

**Correção aplicada nesta rodada (implementação, não apenas documentação):** guard primário movido
para `IntegracaoExternaRepository.findAllActiveByPlataforma` (filtro `autoSyncPausado`) +
late-check em `StravaActivitySyncScheduler.runDailyIncrementalSync` (revalida antes de
`syncActivities`). O guard original em `AtletaRepository.findAllWithStravaConnected` foi MANTIDO
(não é errado, só insuficiente sozinho) como defesa em profundidade adicional para o scheduler de
reconciliação — evita reconciliar um registro Strava pré-existente `PENDENTE` para um atleta cuja
fonte de verdade migrou para intervals.icu. Ver subseção "Guarda no(s) scheduler(s) automático(s)"
acima para o detalhamento completo. Nenhuma mudança na CA10 do `proposal.md` além de corrigir as
referências de classe/método — o contrato de negócio ("Strava pausado para este atleta" cobre todos
os caminhos automáticos) permanece o mesmo; só a implementação que o cumpre mudou de alvo.
