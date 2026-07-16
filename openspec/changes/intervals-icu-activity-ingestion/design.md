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
- Strava: `StravaActivityServiceImpl` (`RUN_SPORT_TYPES`, linha 53), `StravaAuthController`
  (`/api/v1/strava/**`, padrão de endpoint coach-only `@RequireTenant(resourceParamIndex = 0)`),
  `AtletaRepository.findAllWithStravaConnected()` (linhas 112-121, JPQL do scheduler),
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
mapear para exceção de domínio dedicada indicando reconexão necessária (409, CA-auth); `status ==
404` → `DomainNotFoundException` (404, CA5). Sem essa distinção no service, um atleta que revogou a
key no intervals.icu recebe silenciosamente "atividade não encontrada" para sempre, sem sinal de
que precisa reconectar.

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

Fluxo:

1. `conexaoAtiva(atletaId, tenantId)` — ausente → `DomainRuleViolationException` (409, CA4).
   Também resolve e valida o `Atleta` via `findByIdAndTenantId` explícito (pre-mortem #15 — não
   confiar apenas no `@RequireTenant` de controller, que valida um UUID genérico contra vários
   repositórios; o service usa a entidade carregada, não o UUID cru, para o resto do fluxo).
2. **Guarda de idempotência ANTES da chamada externa:** busca por
   `(tenant, INTERVALS_ICU, externalId)`; se já existe, retorna o DTO existente (CA2 sem custo de
   rede).
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

### D3.1 — Matriz de erros completa

Espelho do D4 da change-mãe (`intervals-icu-workout-push`), adaptado ao fluxo de leitura:

| Status intervals.icu | Causa | Exceção de domínio | HTTP Menthoros | Ação |
|---|---|---|---|---|
| 401/403 | API key inválida ou revogada | `DomainRuleViolationException` dedicada | 409 | Mensagem curada indicando reconexão; conexão marcada com `lastSyncError` |
| 404 | Activity não encontrada / não pertence ao atleta | `DomainNotFoundException` | 404 | Nada persistido |
| 422 | Modalidade não suportada (filtro D2) ou rejeição do provedor | `DomainRuleViolationException` | 422 | Nada persistido |
| 429 | Rate limit do intervals.icu | `DomainRuleViolationException` transitória | 409 (ou 429 propagado — decidir na implementação, manter consistente com `StravaRateLimitException`) | Mensagem "tente novamente mais tarde"; **sem retry automático** — ação manual do coach |
| 5xx / timeout / falha de transporte (`status` nulo) | Instabilidade do provedor ou rede | `DomainRuleViolationException` transitória | mesmo tratamento de 429 | Idem 429 — sem retry automático nesta change |

Nenhum destes casos aciona retry automático (débito já registrado em `add-external-call-resilience`
para a família de integrações externas como um todo).

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
  `@ApiResponses` com 200/403/404/409/422 (padrão do repo).
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
- **Campo de aviso na resposta:** `TreinoRealizadoOutputDto` ganha um campo novo `Boolean
  avisoSyncStravaAtivo` (nullable, `@JsonInclude(NON_NULL)` já presente na classe — fica omitido em
  todos os outros endpoints que retornam esse DTO). Preenchido `true` apenas quando: atleta tem
  integração Strava ativa (`plataforma=STRAVA`, `ativo=true`) E `autoSyncPausado != true` (ver D5.2).
  Calculado no service (D3) por uma leitura simples de `IntegracaoExterna` — não é matching
  cross-fonte, é só um sinalizador informativo (CA11).
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

**Decisão: eliminar a colisão na origem, não detectá-la depois.** Uma flag por atleta controlada
pelo coach: ao habilitar o atleta para intervals.icu, o coach pausa a sincronização automática do
Strava daquele atleta. Sem sync automático do Strava rodando, não há caminho para a mesma corrida
entrar duas vezes. Determinístico, sob controle do coach, sem heurística.

**Campo novo:** `IntegracaoExterna.autoSyncPausado` (`boolean`, coluna `auto_sync_pausado`,
`NOT NULL DEFAULT false`, migration V54 — aditiva). Verificado: `IntegracaoExterna.java` hoje não
tem nenhum campo equivalente (`ativo` é sobre a conexão em si — token válido ou não — não sobre
"sync automático pausado"; são conceitos distintos: uma conexão pode estar `ativo=true` E
`autoSyncPausado=true` ao mesmo tempo). Aplica-se à linha `IntegracaoExterna` com
`plataforma=STRAVA` do atleta — pausar intervals.icu não faz sentido (esta change não tem sync
automático de intervals.icu, só import manual).

**Endpoints (`StravaAuthController`, mesmo padrão de `status`/`disconnect`):**

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

**Guarda no scheduler (`DailyActivitySyncSchedulerImpl`, CA10):** o ponto de entrada é
`AtletaRepository.findAllWithStravaConnected()` — a JPQL atual filtra
`ie.plataforma = 'STRAVA' and ie.ativo = true and ie.accessToken is not null and atl.ativo =
'ATIVO'` (verificado em `AtletaRepository.java:112-121`). Adicionar `and (ie.autoSyncPausado = false
or ie.autoSyncPausado is null)` à mesma query — o atleta pausado simplesmente não aparece na lista
que o scheduler itera, sem precisar de um `if` extra dentro do loop (mais simples e sem
possibilidade de esquecer o guard em um future refactor do método). `is null` cobre linhas
pré-migration antes do backfill de `DEFAULT false` alcançá-las (proteção defensiva; a coluna é
`NOT NULL DEFAULT false`, então na prática não deve haver `null`, mas o guard não custa nada).

**Aviso não-bloqueante no import (CA11, D3/D5):** ver D5 — campo `avisoSyncStravaAtivo` calculado
por uma leitura de `IntegracaoExterna` (plataforma STRAVA, `ativo=true`,
`autoSyncPausado != true`) no `IntervalsIcuActivityIngestionService`. Não bloqueia, não altera o
fluxo de persistência — é só um sinalizador para a resposta.

**Por que substitui a abordagem de matching cross-fonte (custo/benefício):** matching por
heurística teria falsos positivos/negativos e complexidade alta (novo `CrossSourceMatchingService`,
novos thresholds, novos testes de todas as combinações Strava×intervals.icu); a flag é
determinística, sob controle do coach, e a mudança de schema é uma única coluna boolean aditiva.

**Riscos e mitigações (registrado explicitamente, não implícito):**
- **Se o coach não pausar, o sistema NÃO impede duplicidade automaticamente nesta change.** Esta é
  uma limitação conhecida e aceita — não um bug. Mitigação é operacional: o aviso não-bloqueante
  (`avisoSyncStravaAtivo`) ajuda o coach a perceber a situação, mas não impede a ação.
- **TOCTOU do scheduler concorrente:** o scheduler roda em ciclo fixo (`PT2H`); se o coach pausar
  o atleta enquanto o scheduler já está no meio do processamento daquele atleta (leu a lista antes
  da mudança), esse ciclo específico ainda processa o atleta uma última vez. Fora de escopo desta
  change — mitigado pela pausa (efetiva a partir do PRÓXIMO ciclo), não por lock distribuído. Risco
  residual baixo: janela de exposição é no máximo um ciclo de 2h, não indefinida.

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
5. **Guarda de pausa Strava (D5.2, CA10/CA11):** pausar o atleta founder via
   `PATCH .../pausar-sync/{atletaId}` e confirmar que ele desaparece de
   `findAllWithStravaConnected` no próximo ciclo do scheduler (ou via query direta); confirmar que
   um import de intervals.icu para esse atleta NÃO traz `avisoSyncStravaAtivo`; retomar e confirmar
   que o atleta volta a aparecer e o aviso volta a `true`.

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
| 9 | TOCTOU: conexão pode ser revogada entre passo 1 e o insert | Alta | D3 passo 6 |
| 10 | Ordem de publicação do evento vs commit de TSS/TSB/reconciliação | Média | D3 passo 10 |
| 11 | Pace deveria priorizar `moving_time`/`distance`, não `average_speed` | Alta | D2 |
| 12 | Unidade de cadência não confirmada | Alta | D2, D6 item 1 |
| 13 | Campos nulos podem gerar score perfeito no matching | Média → corrigido (não mais débito) | D4 (guarda absoluta no `ReconciliationDecisionExecutor`) |
| 14 | Nada impede `externalAthleteId` duplicado no tenant (vazamento cross-atleta) | Alta | D5.1 (novo) |
| 15 | `@RequireTenant` valida UUID genérico, não especificamente `Atleta` | Média | D3 passo 1 |

Product review (2026-07-15): veredito **Go com refinamentos** (nenhum bloqueador). Achados e
disposição:
- **Invariante Strava/intervals.icu:** achado confirmado — sem alguma regra, um atleta com ambas
  as integrações tem a mesma atividade do Garmin ingerida em duplicata (fontes diferentes não
  deduplicam entre si). **Resolvido nesta própria change** (não adiado): em vez de desligamento
  *automático* do Strava (que tira o controle do coach), a mitigação é a **flag de pausa manual
  por atleta** (D-flag, abaixo) — o coach pausa o sync Strava daquele atleta ao ativar o
  intervals.icu; import sem a pausa ativa gera aviso não-bloqueante, não bloqueio automático.
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
