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

**Guarda de matching (pre-mortem #13, Média):** `MatchingScoreCalculatorImpl` trata
duração/distância nulas como score perfeito. Uma activity do intervals.icu sem GPS (esteira sem
distância, ou summary incompleto) poderia ser auto-vinculada só pela data. Não fazer nada novo
aqui além de: cobrir esse caso explicitamente em teste do executor (activity com campos nulos não
deve resultar em `VINCULADO_AUTOMATICO` por essa razão isolada) — se o teste revelar o
comportamento herdado do engine, registrar como débito conhecido (fora do escopo consertar o
`MatchingScoreCalculator` em si nesta change) e ajustar apenas o teste/expectativa.

Trade-off: refatorar o scheduler tem custo/risco de regressão, mas a alternativa (duplicar a
lógica de seleção+persistência da decisão) cria a segunda e terceira cópia de uma regra crítica de
negócio — pior.

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
- `activityId` como `@PathVariable String` (id opaco). **Validação de formato (pre-mortem #3,
  Média):** o coach cola o valor da URL do intervals.icu, que pode incluir o path inteiro
  (`https://intervals.icu/activities/i86400275`). O controller/service DEVE normalizar: aceitar
  apenas o segmento final se vier uma URL completa, e rejeitar (400) valores contendo `/`, `?`,
  `%` que não sejam um id simples — para não montar path inválido no `WebClient` nem repassar
  input não sanitizado à URL externa.
- Erros novos já mapeados no `GlobalExceptionHandler` (`DomainNotFoundException`,
  `DomainRuleViolationException`, `IntervalsIcuApiException`) — verificar se
  `IntervalsIcuApiException` tem handler; se não, adicionar no mesmo commit do controller.

## D5.1 — Segurança: `externalAthleteId` duplicado no tenant (pre-mortem #14, Alta)

Achado do pre-mortem: nada hoje impede duas conexões `IntegracaoExterna` do mesmo tenant
apontarem para a mesma `externalAthleteId` do intervals.icu (a unique constraint atual é só
`(atleta_id, plataforma)`). Se acontecer — por engano de cadastro, ex. o coach cola a API key do
atleta A no perfil do atleta B — o import validaria `dto.athleteId() == conexao.externalAthleteId`
com sucesso e gravaria a atividade REAL de A como se fosse de B, vazando dado entre atletas.

Mitigação (dentro do escopo desta change, sem migration): em `conexaoAtiva`/no momento do import,
validar que não existe OUTRA conexão ativa do mesmo tenant com a mesma `externalAthleteId` antes
de prosseguir; se existir, abortar com 409 e logar como alerta de segurança (não é erro do
usuário comum, é sinal de cadastro incorreto). Registrar como débito a constraint
`(tenant_id, plataforma, external_athlete_id)` para uma migration futura (fora do escopo "zero
migration" desta change, mas o guard em código já fecha o risco imediato).

## D6 — Validação real (gate de smoke)

Igual à change-mãe: antes de dar a change por concluída, smoke com atleta real conectado —
importar uma activity de corrida verdadeira e verificar: treino no Menthoros com métricas
corretas, reconciliado ao planejado do dia, TSB atualizado. Registrar no `tasks.md` o resultado.
Itens obrigatórios do smoke (expandido pós pre-mortem/product review):

1. **Formato real do activity id e payload:** confirmar o formato (`i86400275` vs numérico), os
   campos realmente presentes em `GET /api/v1/activity/{id}` (em especial `athlete_id`,
   `average_speed` vs `moving_time`/`distance`, unidade de `average_cadence`, formato de
   `start_date_local`) — travar D2/D3 na realidade, não na suposição.
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
| 13 | Campos nulos podem gerar score perfeito no matching | Média | D4 |
| 14 | Nada impede `externalAthleteId` duplicado no tenant (vazamento cross-atleta) | Alta | D5.1 (novo) |
| 15 | `@RequireTenant` valida UUID genérico, não especificamente `Atleta` | Média | D3 passo 1 |

Product review (2026-07-15): veredito **Go com refinamentos** (nenhum bloqueador). Achados e
disposição:
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
