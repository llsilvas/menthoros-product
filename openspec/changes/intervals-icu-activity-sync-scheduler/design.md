# Design: intervals-icu-activity-sync-scheduler

Espelha `StravaActivitySyncScheduler` (`services/StravaActivitySyncScheduler.java`) e reaproveita o
pipeline de `intervals-icu-activity-ingestion` sem alterá-lo. Nenhuma migration.

## D1 — Client: `listarAtividades` no `IntervalsIcuClient`

Novo método na interface (`services/IntervalsIcuClient.java`) e implementação
(`services/impl/IntervalsIcuClientImpl.java`), no mesmo padrão de `listarEventos`
(`IntervalsIcuClientImpl.java:102-105`):

```java
// IntervalsIcuClient
List<IcuActivityDto> listarAtividades(String apiKey, String externalAthleteId,
                                       LocalDate oldest, LocalDate newest);
```

```java
// IntervalsIcuClientImpl — mesmo padrão de listarEventos
@Override
public List<IcuActivityDto> listarAtividades(String apiKey, String externalAthleteId,
                                              LocalDate oldest, LocalDate newest) {
    return executa(() -> webClient.get()
            .uri(uri -> uri.path("/api/v1/athlete/{id}/activities")
                    .queryParam("oldest", oldest.toString())
                    .queryParam("newest", newest.toString())
                    .build(externalAthleteId))
            .headers(headers -> basic(headers, apiKey))
            .retrieve()
            .bodyToFlux(IcuActivityDto.class)
            .collectList()
            .block(), "listarAtividades");
}
```

`IcuActivityDto` já existe (usado por `buscarAtividade`); o endpoint de listagem retorna o mesmo
formato de summary — reusar o DTO existente, sem novo record. Erros seguem o mesmo `executa`/`traduz`
já usado pelos demais métodos (401/403 → credencial inválida; 429/5xx/timeout →
`IntervalsIcuRateLimitException`; nunca loga API key nem body).

**Nota de tipo:** `oldest`/`newest` são `LocalDate` (igual a `listarEventos`), não `Instant` — o
scheduler converte o cursor `Instant` (`ultimaSincronizacao`) para `LocalDate` via
`.atZone(ZoneOffset.UTC).toLocalDate()` antes de chamar o client, com overlap de segurança (ver D3).

**Gate obrigatório antes de implementar (pre-mortem Codex, achado crítico #2 + suposições não
verificadas):** a doc pública não confirma paginação, tamanho de página, nem se `oldest`/`newest`
filtram por `start_date_local` ou outro campo. **Bloco 0.2 do tasks.md** exige confirmar
empiricamente, contra a API real (atleta founder, mesmo padrão de gate usado em
`intervals-icu-activity-ingestion` D6/gate 3.0), antes de finalizar a implementação de
`listarAtividades`:
- Se a resposta é paginada (headers `Link`, campo `next`, ou tamanho de página fixo observável) →
  D1 precisa de loop de paginação (mesmo padrão de `StravaActivityServiceImpl.java:280-312`, que já
  pagina em loop `page++`), consumindo TODAS as páginas antes de considerar a listagem completa.
- Se não houver paginação (resposta única para a janela pedida) → implementação atual do D1 fica
  como está, mas o teste de contrato do Bloco 1 deve registrar o comportamento observado como
  documentação viva (não assumir silenciosamente).
- Confirmar também: o payload da listagem é o mesmo formato de `buscarAtividade` (summary completo)
  ou um subconjunto menor de campos — se for um subconjunto, `IcuActivityDto` pode precisar de
  `@JsonIgnoreProperties(ignoreUnknown = true)` já cobre isso, mas os campos ausentes na listagem
  não podem ser assumidos como confiáveis para nada além do `id` usado por `importarAtividade`.

## D2 — Scheduler: `IntervalsIcuActivitySyncScheduler`

Nova classe em `services/` (sem sufixo `Impl`, mesmo nível de `StravaActivitySyncScheduler`):

```java
@Component
@Slf4j
@RequiredArgsConstructor
public class IntervalsIcuActivitySyncScheduler {

    private final IntegracaoExternaRepository integracaoExternaRepository;
    private final TreinoRealizadoRepository treinoRealizadoRepository;
    private final IntervalsIcuClient intervalsIcuClient;
    private final IntervalsIcuActivityIngestionService ingestionService;

    @Value("${intervals-icu.sync-days-back:90}")
    private int syncDaysBack;

    @Value("${intervals-icu.sync-overlap-days:1}")
    private int overlapDays;

    @Scheduled(fixedDelayString = "PT2H", initialDelayString = "PT1M")
    public void runDailyIncrementalSync() {
        List<IntegracaoExterna> integracoes =
                integracaoExternaRepository.findAllActiveByPlataforma(FonteDados.INTERVALS_ICU);

        for (IntegracaoExterna integracao : integracoes) {
            UUID tenantId = integracao.getTenantId();
            try {
                TenantContext.setTenantId(tenantId);

                // late-check TOCTOU — CORRIGIDO (pre-mortem moderado #1): revalida ativo, não só
                // autoSyncPausado
                Optional<IntegracaoExterna> fresca = integracaoExternaRepository
                        .findByAtletaIdAndPlataformaAndTenantId(
                                integracao.getAtleta().getId(), FonteDados.INTERVALS_ICU, tenantId);
                if (fresca.isEmpty() || !fresca.get().isAtivo() || fresca.get().isAutoSyncPausado()) {
                    log.info("Atleta {} pulado — integração inativa/pausada (intervals.icu)",
                            integracao.getAtleta().getId());
                    continue;
                }

                syncAtleta(fresca.get());
            } catch (Exception ex) {
                log.warn("Falha ao sincronizar intervals.icu do atleta {}: {}",
                        integracao.getAtleta().getId(), ex.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
    }

    private void syncAtleta(IntegracaoExterna integracao) {
        UUID atletaId = integracao.getAtleta().getId();
        UUID tenantId = integracao.getTenantId();
        LocalDate oldest = integracao.getUltimaSincronizacao() != null
                ? integracao.getUltimaSincronizacao().atZone(ZoneOffset.UTC).toLocalDate()
                        .minusDays(overlapDays) // overlap de segurança — pre-mortem moderado #5
                : LocalDate.now(ZoneOffset.UTC).minusDays(syncDaysBack);
        LocalDate newest = LocalDate.now(ZoneOffset.UTC);

        // CORRIGIDO (pre-mortem crítico #5): erro em listarAtividades (credencial revogada, rate
        // limit) é falha de ATLETA — grava erro, NÃO avança o cursor, sobe para o catch do loop
        // principal.
        List<IcuActivityDto> atividades = intervalsIcuClient.listarAtividades(
                integracao.getAccessToken(), integracao.getExternalAthleteId(), oldest, newest);

        long antesDoLote = treinoRealizadoRepository
                .countByTenantIdAndAtletaIdAndFonteDados(tenantId, atletaId, FonteDados.INTERVALS_ICU);

        boolean falhaTransitoria = false;
        for (IcuActivityDto atividade : atividades) {
            try {
                ingestionService.importarAtividade(atletaId, atividade.id(), tenantId);
            } catch (IntervalsIcuRateLimitException ex) {
                // CORRIGIDO (pre-mortem moderado #2): rate limit aborta o RESTANTE do lote deste
                // atleta — não adianta insistir nas próximas atividades no mesmo ciclo.
                falhaTransitoria = true;
                log.warn("Rate limit ao importar activity {} do atleta {} — abortando lote do ciclo: {}",
                        atividade.id(), atletaId, ex.getMessage());
                break;
            } catch (DomainConflictException ex) {
                // CORRIGIDO (pre-mortem crítico #5): a precondição Strava-ativo-não-pausado (ou
                // credencial intervals.icu revogada, também DomainConflictException) é falha de
                // ATLETA, não de atividade isolada — abortar o lote e NÃO avançar o cursor, para que
                // o próximo ciclo reavalie a mesma janela quando a colisão cross-fonte for resolvida.
                falhaTransitoria = true;
                log.warn("Conflito ao importar activity {} do atleta {} — abortando lote do ciclo: {}",
                        atividade.id(), atletaId, ex.getMessage());
                break;
            } catch (DomainNotFoundException | DomainRuleViolationException ex) {
                // Falha PERMANENTE desta atividade específica (modalidade não suportada, activity
                // inexistente) — não é retryable, não bloqueia o avanço do cursor. CA4.
                log.warn("Falha permanente ao importar activity {} do atleta {}: {}",
                        atividade.id(), atletaId, ex.getMessage());
            }
        }

        long depoisDoLote = treinoRealizadoRepository
                .countByTenantIdAndAtletaIdAndFonteDados(tenantId, atletaId, FonteDados.INTERVALS_ICU);
        int novasImportadas = (int) (depoisDoLote - antesDoLote); // pre-mortem moderado #4

        // CORRIGIDO (pre-mortem crítico #1 e #3): recarrega a entidade fresca antes de salvar — não
        // reusa a instância capturada no início do ciclo (pode estar stale se o coach desconectou a
        // integração no meio do processamento) — e só avança o cursor se NÃO houve falha transitória.
        Optional<IntegracaoExterna> paraAtualizar = integracaoExternaRepository
                .findByAtletaIdAndPlataformaAndTenantId(atletaId, FonteDados.INTERVALS_ICU, tenantId);
        if (paraAtualizar.isEmpty() || !paraAtualizar.get().isAtivo()) {
            log.info("Atleta {} desconectou o intervals.icu durante o ciclo — cursor não atualizado",
                    atletaId);
            return;
        }
        IntegracaoExterna atual = paraAtualizar.get();
        atual.setSyncActivityCount(
                (atual.getSyncActivityCount() == null ? 0 : atual.getSyncActivityCount())
                        + novasImportadas);
        if (falhaTransitoria) {
            atual.setLastSyncError("Ciclo interrompido por falha transitória — cursor mantido para retry");
            // ultimaSincronizacao NÃO avança — próximo ciclo reprocessa a mesma janela (idempotente)
        } else {
            atual.setUltimaSincronizacao(Instant.now());
            atual.setLastSyncError(null);
        }
        integracaoExternaRepository.save(atual);
    }
}
```

Diferenças deliberadas em relação ao `StravaActivitySyncScheduler`:

- O Strava delega toda a lógica de sync (incluindo cursor e persistência de
  `ultimaSincronizacao`/`syncActivityCount`) para `StravaActivityServiceImpl.syncActivities`. Aqui,
  como não existe um `IntervalsIcuActivityService` equivalente hoje (o serviço existente,
  `IntervalsIcuActivityIngestionService`, só sabe importar UMA atividade por id), o scheduler assume
  a orquestração do lote (`syncAtleta`) diretamente, chamando o client + o serviço de ingestão
  individual em loop. Isso é aceito nesta change para não introduzir uma camada nova de serviço só
  para orquestração — reavaliar se a lógica crescer (ex.: quando o webhook chegar e precisar da mesma
  orquestração de lote).
- Isolamento em **duas camadas, com semântica diferente de retry** (revisado pós pre-mortem): por
  atividade (dentro de `syncAtleta`) e por atleta (no loop principal) — mas a linha entre as duas não
  é "toda exceção isola só a atividade": exceções **transitórias/de estado do atleta**
  (`IntervalsIcuRateLimitException`, `DomainConflictException`) abortam o lote inteiro do atleta e
  bloqueiam o avanço do cursor; só exceções **permanentes de uma atividade específica**
  (`DomainNotFoundException`, `DomainRuleViolationException`) são isoladas sem afetar o cursor. O
  Strava só tem a camada por-atleta porque `syncActivities` já processa 1 atividade de cada vez
  internamente com seu próprio isolamento (fora do escopo desta leitura).
- **Cursor não é incondicional** (achado crítico #1 do pre-mortem): só avança quando o lote do atleta
  termina sem falha transitória. Uma atividade antiga que falhar por rate limit/conflito não fica
  "perdida para sempre" fora da janela — o próximo ciclo tenta a mesma janela (mais o overlap de D3),
  e a idempotência do dedup (CA2) garante que atividades já importadas com sucesso no meio do lote
  anterior não duplicam.
- **`syncActivityCount` mede importações NOVAS de verdade** (achado moderado #4): calculado por
  contagem antes/depois no `TreinoRealizadoRepository`, não por incrementar a cada chamada bem-sucedida
  de `importarAtividade` (que também retorna sucesso — idempotente — para atividades já existentes).

## D3 — Cursor incremental e janela de lookback

Reusa `IntegracaoExterna.ultimaSincronizacao` (mesmo campo usado pelo Strava,
`entity/IntegracaoExterna.java:64-65`) — sem campo novo, sem migration. Semântica: "momento em que o
último ciclo de sync rodou com sucesso para este atleta", não "data da atividade mais recente
importada" — mesma semântica já aceita no Strava (`StravaActivityServiceImpl.java:195`).

Fallback de primeiro ciclo: `intervals-icu.sync-days-back` (novo `@Value`, default 90), espelhando
`strava.sync-days-back` (`application.yml:257`). **Overlap de segurança** (novo, achado moderado #5
do pre-mortem): `intervals-icu.sync-overlap-days` (default 1) subtraído do cursor ao calcular
`oldest`, para absorver a perda de precisão de `Instant→LocalDate` (o cursor guarda o momento exato
do último ciclo, mas a API só aceita data, sem hora) — sem esse overlap, uma atividade ocorrida no
mesmo dia do último ciclo, mas depois do horário exato do ciclo, poderia cair fora da janela. O
overlap é seguro porque o dedup (CA2) absorve o reprocessamento de atividades já importadas.
Adicionar ao `application.yml`:

```yaml
intervals-icu:
  sync-days-back: ${INTERVALS_ICU_SYNC_DAYS_BACK:90}
  sync-overlap-days: ${INTERVALS_ICU_SYNC_OVERLAP_DAYS:1}
```

**Cursor não avança em falha transitória (achado crítico #1 do pre-mortem):** ver D2 — só
`ultimaSincronizacao=now()` quando o lote inteiro do atleta processa sem `IntervalsIcuRateLimitException`
nem `DomainConflictException`. Isso evita que uma atividade antiga fique permanentemente fora da
janela de retry só porque o ciclo em que ela apareceu teve uma falha transitória em outra atividade
do mesmo lote.

## D4 — Reaproveitamento do pipeline de ingestão (sem mudança)

`IntervalsIcuActivityIngestionServiceImpl.importarAtividade(UUID atletaId, String activityId, UUID
tenantId)` é chamado tal como está — mesma idempotência (retorno cedo se já importado), mesma
validação de modalidade, mesmo mapeamento, mesmo TSS/TSB, mesma reconciliação inline. Nenhuma
alteração nesse serviço.

**Novo método de repositório (não é migration, é query derivada):**
`TreinoRealizadoRepository.countByTenantIdAndAtletaIdAndFonteDados(UUID tenantId, UUID atletaId,
FonteDados fonteDados)` — usado pelo scheduler para medir importações novas por delta (D2, achado
moderado #4 do pre-mortem), sem tocar no `IntervalsIcuActivityIngestionServiceImpl`.

**Custo aceito:** para cada `IcuActivityDto` retornado por `listarAtividades`, `importarAtividade`
rechama `buscarAtividade` internamente (não usa os dados já trazidos pela listagem) — 1 chamada de
lista + N chamadas individuais por atleta por ciclo. Alternativa descartada: adaptar
`importarAtividade` para aceitar um `IcuActivityDto` já carregado, evitando o refetch — não feito
nesta change para não modificar um serviço já validado/testado por
`intervals-icu-activity-ingestion`; revisitar se rate limit se provar um problema real em produção
(ver proposal.md "Open Questions").

## D5 — Exceções e classificação de erro (revisado pós pre-mortem)

Reusa as exceções já existentes (`IntervalsIcuRateLimitException`, `DomainConflictException`,
`DomainNotFoundException`, `DomainRuleViolationException`) lançadas por `buscarAtividade`/
`importarAtividade`. O scheduler não introduz exceção nova, mas classifica cada uma por se é
**retryable** (bloqueia avanço de cursor) ou **permanente** (isolada, não bloqueia):

| Exceção | Origem | Classificação | Efeito no lote do atleta |
|---|---|---|---|
| `IntervalsIcuRateLimitException` | `listarAtividades` ou `importarAtividade` (429/5xx/timeout) | Retryable | Aborta o restante do lote; cursor NÃO avança |
| `DomainConflictException` | Credencial revogada (401/403) ou precondição Strava-ativo-não-pausado | Retryable (estado pode mudar) | Aborta o restante do lote; cursor NÃO avança |
| `DomainNotFoundException` | Activity não encontrada/de outro atleta | Permanente (desta atividade) | Log e segue para a próxima atividade; cursor pode avançar |
| `DomainRuleViolationException` | Modalidade não suportada | Permanente (desta atividade) | Log e segue para a próxima atividade; cursor pode avançar |

Erro em `listarAtividades` (ex.: 401 por credencial revogada, ou rate limit na própria listagem) é
tratado como falha de **atleta** inteiro (grava `lastSyncError`, cursor não avança) — propagado ao
catch do loop principal em `runDailyIncrementalSync`, sem tentar `syncAtleta` mais além.

## D6 — Multi-tenancy

Mesmo padrão do `StravaActivitySyncScheduler`: `TenantContext.setTenantId` por iteração (try),
`TenantContext.clear()` no finally, nenhuma query nova fora do escopo já coberto por
`findAllActiveByPlataforma` (que já filtra por tenant via `tenantId` da entidade) e
`findByAtletaIdAndPlataformaAndTenantId` (late-check). Sem `@RequireTenant` porque não há endpoint
HTTP nesta change — o isolamento é 100% via `TenantContext` no contexto do job agendado.

## D7 — Cross-fonte Strava + intervals.icu (herdado, corrigido pós pre-mortem)

O guard `autoSyncPausado` (introduzido em `intervals-icu-activity-ingestion`, D5.2 daquela change)
já pausa automaticamente o Strava quando o intervals.icu conecta. Este scheduler não adiciona
lógica de dedup cross-fonte nova — herda a mesma proteção que já vale para o import manual.

**Corrigido (achado crítico #5 do pre-mortem):** a versão original desta seção tratava a
precondição Strava-ativo-não-pausado (`DomainConflictException`) como uma falha isolada de
atividade — swallowed, cursor avançava, erro era limpo no final do lote. Isso significava que,
numa corrida entre os dois schedulers automáticos (Strava ainda ativo via override
`retomar-sync`, intervals.icu tentando importar), o scheduler intervals.icu marcaria o ciclo como
"concluído com sucesso" mesmo bloqueado pela precondição — perdendo silenciosamente a atividade.
Corrigido em D2/D5: `DomainConflictException` agora aborta o lote do atleta e bloqueia o avanço do
cursor, igual a rate limit — o próximo ciclo tenta de novo, e se a colisão cross-fonte for resolvida
(coach pausa o Strava, ou o guard automático volta a valer), a importação acontece no ciclo
seguinte.

O residual já documentado em `intervals-icu-activity-ingestion` (override manual via
`retomar-sync`, TOCTOU sem lock entre a checagem e o `syncActivities`/`importarAtividade`) continua
sendo o mesmo residual, agora com o late-check de D2 revisado (`ativo` + `autoSyncPausado`, ambos
revalidados) reduzindo a janela de exposição.

**Nota sobre `autoSyncPausado` na própria integração INTERVALS_ICU (achado menor do pre-mortem):**
nenhum hook hoje seta essa flag como `true` na integração INTERVALS_ICU (só na STRAVA, pelos dois
hooks de `intervals-icu-activity-ingestion`). O late-check de D2 revalida esse campo por simetria e
extensibilidade futura (ex.: se um endpoint de pausa manual do intervals.icu for adicionado depois),
mas na prática, hoje, esse branch do CA3 é sempre `false` — não é um mecanismo ativo nesta change.

## D8 — Entidade stale e ausência de lock distribuído (achados críticos #3 e #4 do pre-mortem)

**Achado crítico #3 — save de entidade stale pode ressuscitar integração desconectada:** a versão
original mantinha a mesma instância de `IntegracaoExterna` capturada no início do ciclo (antes da
chamada ao provedor, que pode levar segundos) e a salvava no final. Se o coach desconectasse a
integração no meio do processamento (`IntervalsIcuConnectionServiceImpl.desconectar` seta
`ativo=false` e limpa tokens), o `save` final do scheduler sobrescreveria esse estado com a
instância antiga (`ativo=true`, token antigo), efetivamente desfazendo a desconexão do coach.
`IntegracaoExterna` não tem `@Version` (sem optimistic locking).

**Corrigido em D2:** o scheduler recarrega a integração fresca do banco imediatamente antes do save
final; se ela não existir mais ou estiver `ativo=false`, o scheduler não salva nada (loga e
retorna) — nunca ressuscita uma desconexão feita pelo coach durante o ciclo. Isso reduz a janela de
corrida para o intervalo entre o reload final e o save (pequeno, e o pior caso é uma desconexão
feita nesse intervalo específico não ser respeitada até o próximo ciclo — aceito, ver "Riscos e
mitigações" no proposal.md).

**Achado crítico #4 — ausência de lock distribuído subestimada:** o risco de rodar o
`StravaActivitySyncScheduler` sem lock já é aceito em produção, mas o pre-mortem argumenta que para
um job **novo, automático, cross-tenant, para todos os atletas** (não uma ação pontual do coach), o
mesmo risco tem impacto maior: com 2+ instâncias do backend, o mesmo atleta é processado 2x por
ciclo — 2x a chamada de listagem, até 2x N chamadas individuais ao provedor, e uma corrida de save
entre as duas instâncias no final do lote (mitigada pelo reload-antes-do-save de D8, mas ainda
pode haver lost update entre o reload e o save de cada instância).

**Decisão desta change:** não introduzir lock distribuído (ShedLock ou equivalente) agora — mesmo
escopo aceito para o Strava, para não expandir o Tamanho da change. Mitigação parcial: o
reload-antes-do-save (D8 acima) elimina o pior cenário (ressuscitar uma desconexão); a idempotência
do dedup (CA2) garante que não há duplicata de `TreinoRealizado` mesmo com processamento
concorrente. O risco residual aceito é **custo dobrado de chamadas HTTP ao provedor** em ambiente
multi-instância, não perda ou duplicação de dado. Se o backend passar a rodar com mais de uma
instância em produção, revisitar com `ShedLock`/lock por atleta como fast-follow.

## Pre-mortem

**Rodada 1 (Codex, 2026-07-20):** 5 achados críticos, 5 moderados, 1 menor. Achados críticos: (1)
cursor avançava mesmo com falha parcial, perdendo atividade permanentemente da janela de retry —
corrigido em D2/D3 (cursor condicional); (2) paginação da listagem não verificada contra a API real
— gate obrigatório adicionado em D1 (Bloco 0.2 do tasks.md) antes de implementar; (3) save de
entidade stale podia ressuscitar uma desconexão feita pelo coach durante o ciclo — corrigido em D8
(reload antes do save final); (4) ausência de lock distribuído subestimada para job automático
cross-tenant — mantida a decisão de não introduzir lock nesta change, mas resíduo elevado e
documentado explicitamente em D8/proposal.md (antes estava implícito só como "mesmo risco do
Strava"); (5) guard cross-fonte não cobria a corrida entre os dois schedulers automáticos —
corrigido em D2/D5/D7 (`DomainConflictException` agora é falha de atleta, não de atividade).
Achados moderados: late-check não revalidava `ativo` (corrigido em D2); rate limit não abortava o
lote (corrigido em D2/D5); `lastSyncError` era limpo mesmo com falha parcial (corrigido em D2);
`syncActivityCount` contava dedup como importação nova (corrigido em D2, contagem por delta);
semântica `Instant→LocalDate` imprecisa (corrigido em D3, overlap de segurança). Achado menor:
`autoSyncPausado` na integração INTERVALS_ICU não tem operador real hoje — documentado em D7 como
defesa em profundidade sem mecanismo ativo ainda.
