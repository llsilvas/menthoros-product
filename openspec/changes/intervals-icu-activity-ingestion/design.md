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
  NAO_PLANEJADO; tie-break < 0.10 → AMBIGUO).
- Dedup: constraint `uk_treino_realizado_tenant_fonte_external` (V29) sobre
  `(tenant_id, fonte_dados, external_id)`.

## D1 — Client: `buscarAtividade` + `IcuActivityDto`

Novo método na interface `IntervalsIcuClient`:

```java
/** GET /api/v1/activity/{id} — 404/403 lança IntervalsIcuApiException(NOT_FOUND/FORBIDDEN). */
IcuActivityDto buscarAtividade(String apiKey, String activityId);
```

- `activityId` é `String` opaca (intervals.icu usa ids como `i86400275`); nenhum parse local.
- Mesmo padrão do client atual: Basic Auth por chamada, `traduz(...)` para erro, **nunca** logar
  API key nem body de resposta.
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
como credencial inválida (`IntervalsIcuClientImpl` linha ~50). `buscarAtividade` DEVE preservar
essa distinção: 401/403 → `IntervalsIcuApiException(AUTH_INVALIDA)` (credencial revogada — o
service deve marcar a conexão para atenção, não confundir com "atividade não existe"); 404 puro →
`IntervalsIcuApiException(NOT_FOUND)`. Sem essa distinção, um atleta que revogou a key no
intervals.icu recebe silenciosamente "atividade não encontrada" para sempre, sem sinal de que
precisa reconectar.

## D2 — Mapper `IcuActivityDto` → `TreinoRealizado`

Classe dedicada `IntervalsIcuActivityMapper` (`mapper/` ou `services/helper/`, componente puro,
sem IO), com null-check de entrada (`IllegalArgumentException`) por padrão do repo:

- `fonteDados = INTERVALS_ICU`, `externalId = dto.id()`, `status = REALIZADO`,
  `criadoPor = "INTERVALS_ICU"`, `statusSincronizacao = PENDENTE`, `sincronizadoEm = now`.
- `dataTreino`/hora ← `start_date_local` (a API entrega horário local do atleta; sem conversão de
  zona — mesma semântica usada no push).
- `distanciaKm = distance / 1000`; `duracaoMin = movingTime / 60`; `elapsedTimeSeg` direto.
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
- **Filtro de modalidade:** aceitar apenas `type` ∈ {Run, TrailRun, VirtualRun, Treadmill}
  (espelho do recorte `RUN_SPORT_TYPES` do Strava). Fora disso →
  `DomainRuleViolationException` mapeada para 422.
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

Fluxo:

1. `conexaoAtiva(atletaId, tenantId)` — ausente → `DomainRuleViolationException` (409, CA4).
   Também resolve e valida o `Atleta` via `findByIdAndTenantId` explícito (pre-mortem #15 — não
   confiar apenas no `@RequireTenant` de controller, que valida um UUID genérico contra vários
   repositórios; o service usa a entidade carregada, não o UUID cru, para o resto do fluxo).
2. **Guarda de idempotência ANTES da chamada externa:** busca por
   `(tenant, INTERVALS_ICU, externalId)`; se já existe, retorna o DTO existente (CA2 sem custo de
   rede).
3. `client.buscarAtividade(apiKey, activityId)` — `IntervalsIcuApiException` NOT_FOUND →
   `DomainNotFoundException` (404, CA5); `AUTH_INVALIDA` (D1) → `DomainRuleViolationException`
   dedicada (409, com mensagem indicando reconexão necessária — não confundir com "não existe").
4. **Defesa em profundidade:** `dto.athleteId()` ≠ `conexao.externalAthleteId` → 404 (não vazar
   existência).
5. Filtro de modalidade (D2) → 422 (CA6).
6. **Reload da conexão dentro da TX de persistência (pre-mortem #9 — TOCTOU, Alta):** entre os
   passos 1 e 6 pode haver tempo suficiente para o atleta desconectar a integração
   (`IntervalsIcuConnectionServiceImpl.desconectar`, outra TX). Antes de persistir, o colaborador
   transacional recarrega `conexaoAtiva` e aborta com 409 se não estiver mais ativa — não usar a
   referência carregada no passo 1 para decidir persistência.
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
transação (nunca segurar conexão de banco durante IO externo — lição da change de hardening).
Implementação: método público não-transacional orquestra; persistência+reconciliação em método
transacional de colaborador (ou self-injection do proxy — preferir colaborador, padrão
`IntervalsIcuPushProcessor`).

## D4 — Reconciliação inline (extração do scheduler)

Problema: `DailyActivitySyncSchedulerImpl` só reconcilia pendentes na janela D-1..D+1 a cada 2h.
Um import de treino antigo ficaria `PENDENTE` para sempre — invisível na fila manual (filtra
`AMBIGUO`/`NAO_PLANEJADO`).

Decisão: extrair o passo de decisão+persistência para um colaborador reutilizável:

- Novo `ReconciliationDecisionExecutor` (`services/helper` ou `services/impl`): recebe o
  `TreinoRealizado` + candidatos (`TreinoPlanejado` do atleta na data), chama
  `MatchingScoreCalculator`/`MatchingDecisionEngine` e grava exatamente o que
  `persistMatchingDecision` grava hoje (status, score, reasonCode, reconciledAt/by="SYSTEM",
  vínculo quando `VINCULADO_AUTOMATICO`, auditoria `TreinoReconciliacao` com
  `RECONCILIACAO_AUTOMATICA`).
- `DailyActivitySyncSchedulerImpl` passa a delegar para o executor (comportamento idêntico,
  cobertura existente permanece verde — CA9).
- O serviço de ingestão chama o executor após o insert, na mesma TX do passo 6-8.
- Sem candidato na data → executor decide `NAO_PLANEJADO` (mesma semântica do engine hoje).

Trade-off: refatorar o scheduler tem custo/risco de regressão, mas a alternativa (duplicar a
lógica de persistência da decisão) cria a segunda cópia de uma regra crítica de negócio — pior.

## D5 — Endpoint e segurança

Novo `IntervalsIcuActivityController` (não misturar com o controller `me/` de conexão, que é
self-service do atleta):

```
POST /api/v1/intervals-icu/atletas/{atletaId}/activities/{activityId}/import
@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")
@RequireTenant(resourceParamIndex = 0)   // valida atletaId no tenant corrente
→ 200 ResponseEntity<TreinoRealizadoOutputDto>
```

- `@Tag(name = "intervals-icu-activities", ...)` (ASCII kebab-case), `@Operation` +
  `@ApiResponses` com 200/403/404/409/422 (padrão do repo).
- POST porque muta estado (cria treino, TSB, reconciliação) — idempotente por dedup, mas não GET.
- `activityId` como `@PathVariable String` (id opaco).
- Erros novos já mapeados no `GlobalExceptionHandler` (`DomainNotFoundException`,
  `DomainRuleViolationException`, `IntervalsIcuApiException`) — verificar se
  `IntervalsIcuApiException` tem handler; se não, adicionar no mesmo commit do controller.

## D6 — Validação real (gate de smoke)

Igual à change-mãe: antes de dar a change por concluída, smoke com atleta real conectado —
importar uma activity de corrida verdadeira e verificar: treino no Menthoros com métricas
corretas, reconciliado ao planejado do dia, TSB atualizado. Registrar no `tasks.md` o resultado
(inclusive o formato real do activity id e a resposta do endpoint `GET /api/v1/activity/{id}`
com key de outro atleta — valida a premissa de acesso).

## Pre-mortem

Seção a preencher com o resultado do `/codex:adversarial-review` (registrar findings e o que foi
incorporado em Riscos/CAs).
