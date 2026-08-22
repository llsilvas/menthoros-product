# Design: intervals-icu-activity-sync-scheduler

Espelha `StravaActivitySyncScheduler` (`services/StravaActivitySyncScheduler.java`) e reaproveita o
pipeline de `intervals-icu-activity-ingestion` sem alterá-lo. Nenhuma migration.

## D1 — Client: `listarAtividades` no `IntervalsIcuClient`

Novo método na interface (`services/IntervalsIcuClient.java`) e implementação
(`services/impl/IntervalsIcuClientImpl.java`), no mesmo padrão de `listarEventos`
(`IntervalsIcuClientImpl.java:102-105`):

> **Atualizado 2026-08-16 — este método nasce com Bearer, não com Basic.**
> `intervals-icu-oauth2-integration` remove a API key e troca a autenticação do client para
> `Authorization: Bearer`. Escrever `listarAtividades` em Basic seria escrever código para apagar
> na sequência. O parâmetro chama-se `token`, e vem do mesmo `conexao.getAccessToken()` que os
> outros seis call sites já usam — nada mais muda neste design.

```java
// IntervalsIcuClient
List<IcuActivityDto> listarAtividades(String token, String externalAthleteId,
                                       LocalDate oldest, LocalDate newest);
```

```java
// IntervalsIcuClientImpl — mesmo padrão de listarEventos
@Override
public List<IcuActivityDto> listarAtividades(String token, String externalAthleteId,
                                              LocalDate oldest, LocalDate newest) {
    return executa("listar atividades", () -> webClient.get()
            .uri(uri -> uri.path("/api/v1/athlete/{id}/activities")
                    .queryParam("oldest", oldest.toString())
                    .queryParam("newest", newest.toString())
                    .build(externalAthleteId))
            .headers(headers -> bearer(headers, token))
            .retrieve()
            .bodyToFlux(IcuActivityDto.class)
            .collectList()
            .block());
}
```

`IcuActivityDto` já existe (usado por `buscarAtividade`); o endpoint de listagem retorna o mesmo
formato de summary — reusar o DTO existente, sem novo record. Erros seguem o mesmo `executa`/`traduz`
já usado pelos demais métodos — **que lança só `IntervalsIcuApiException`** (com o status HTTP, ou
sem status em falha de transporte), nunca logando token nem body. A tradução para
`DomainConflictException`/`IntervalsIcuRateLimitException` **não fica no client**: hoje ela vive
em `IntervalsIcuActivityIngestionServiceImpl.buscarAtividade` (linhas 131-148), e `listarAtividades`
não a replica. O scheduler trata qualquer exceção da listagem como falha do atleta (D5), sem
depender do tipo — o status só entra na mensagem de `lastSyncError`. (Corrigido em 2026-08-22 pelo
DoR: a versão anterior atribuía ao client uma tradução que ele não faz; a assinatura real é
`executa(String operacao, Supplier<T>)` e o helper de auth é `bearer(headers, token)`.)

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

    @Value("${intervals-icu.sync-max-activities-per-cycle:6}")
    private int maxPorCiclo; // D4.1 — teto por contagem, decidido em 2026-08-22

    // DoR rodada 3: com 0 o lote fica vazio, esgotouJanela=false, cursor não move e o atleta
    // relista a mesma janela para sempre SEM erro; negativo estoura no subList. Falhar na carga.
    @PostConstruct
    void validarConfig() {
        if (maxPorCiclo < 1) {
            throw new IllegalStateException(
                    "intervals-icu.sync-max-activities-per-cycle deve ser >= 1 (recebido " + maxPorCiclo + ")");
        }
        if (syncDaysBack < 1 || overlapDays < 0) {
            throw new IllegalStateException("intervals-icu.sync-days-back >= 1 e sync-overlap-days >= 0");
        }
    }

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
                // CA9 — falha de ATLETA (listagem 401/429/timeout, ou erro inesperado): fica
                // visível em lastSyncError. Reload antes de gravar, pela mesma razão de D8.
                log.warn("Falha ao sincronizar intervals.icu do atleta {}: {}",
                        integracao.getAtleta().getId(), ex.getMessage());
                registrarErro(integracao.getAtleta().getId(), tenantId, ex.getMessage());
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

        // D4.1 — da mais antiga para a mais nova: a carga inicial constrói o PMC em ordem
        // cronológica e o cursor pode apontar para "até onde cheguei".
        List<IcuActivityDto> pendentes = atividades.stream()
                .filter(a -> treinoRealizadoRepository
                        .findByTenantIdAndFonteDadosAndExternalId(tenantId, FonteDados.INTERVALS_ICU, a.id())
                        .isEmpty()) // já importada: custa 0 requisições e não conta no teto
                .sorted(Comparator.comparing(IcuActivityDto::startDateLocal))
                .toList();
        boolean esgotouJanela = pendentes.size() <= maxPorCiclo;
        List<IcuActivityDto> lote = pendentes.subList(0, Math.min(maxPorCiclo, pendentes.size()));

        boolean falhaTransitoria = false;
        IcuActivityDto ultimaProcessada = null; // última que consumiu tentativa antes de uma falha transitória
        for (IcuActivityDto atividade : lote) {
            try {
                ingestionService.importarAtividade(atletaId, atividade.id(), tenantId);
                ultimaProcessada = atividade;
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
                // ATLETA, não de atividade isolada — abortar o lote para que o próximo ciclo
                // reavalie a partir daqui quando a colisão cross-fonte for resolvida.
                falhaTransitoria = true;
                log.warn("Conflito ao importar activity {} do atleta {} — abortando lote do ciclo: {}",
                        atividade.id(), atletaId, ex.getMessage());
                break;
            } catch (DomainNotFoundException | DomainRuleViolationException ex) {
                // Falha PERMANENTE desta atividade específica (modalidade não suportada, activity
                // inexistente) — não é retryable; o cursor pode passar por ela. CA4.
                ultimaProcessada = atividade;
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
        // D4.1 / CA10 — o cursor avança até onde o ciclo chegou, nunca além:
        //   - janela esgotada sem falha transitória → now() (regime de cruzeiro)
        //   - lote parcial (teto) ou falha transitória → data da última processada
        //   - falha na primeira atividade → cursor intocado
        if (!falhaTransitoria && esgotouJanela) {
            atual.setUltimaSincronizacao(Instant.now());
            atual.setLastSyncError(null);
        } else if (ultimaProcessada != null) {
            atual.setUltimaSincronizacao(cursorDe(ultimaProcessada));
            atual.setLastSyncError(falhaTransitoria
                    ? "Ciclo interrompido por falha transitória — cursor em " + ultimaProcessada.startDateLocal()
                    : null);
        } else if (falhaTransitoria) {
            atual.setLastSyncError("Ciclo interrompido por falha transitória — cursor mantido para retry");
        }
        integracaoExternaRepository.save(atual);
    }

    private void registrarErro(UUID atletaId, UUID tenantId, String mensagem) {
        integracaoExternaRepository
                .findByAtletaIdAndPlataformaAndTenantId(atletaId, FonteDados.INTERVALS_ICU, tenantId)
                .filter(IntegracaoExterna::isAtivo)
                .ifPresent(i -> { i.setLastSyncError(mensagem); integracaoExternaRepository.save(i); });
    }

    /** start_date_local não tem fuso; o overlap de 1 dia (D3) absorve a imprecisão. */
    private static Instant cursorDe(IcuActivityDto atividade) {
        return LocalDateTime.parse(atividade.startDateLocal()).toInstant(ZoneOffset.UTC);
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
- **Cursor não é incondicional** (achado crítico #1 do pre-mortem, refinado pela D4.1 em
  2026-08-22): avança **até a última atividade processada**, nunca além. Com a janela esgotada e sem
  falha transitória, isso é `now()`; num lote parcial (teto) ou interrompido por rate limit/conflito,
  é a data da última que consumiu tentativa. Uma atividade que ficou **sem tentativa** nunca sai da
  janela — e o progresso feito antes da falha não é descartado. A idempotência do dedup (CA2)
  garante que o overlap de D3 não duplica nada.
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
  sync-max-activities-per-cycle: ${INTERVALS_ICU_SYNC_MAX_ACTIVITIES_PER_CYCLE:6}
```

**Semântica do cursor (ajustada pela D4.1):** `ultimaSincronizacao` passa a significar "até que
momento do histórico do atleta o sync chegou" — em regime de cruzeiro coincide com "quando o último
ciclo rodou" (mesma semântica do Strava), mas durante a carga inicial aponta para a data da última
atividade processada. É o mesmo campo, sem migration; só a leitura muda.

**Cursor em falha transitória (achado crítico #1 do pre-mortem, refinado pela D4.1):** ver D2 —
`ultimaSincronizacao=now()` só quando a janela foi esgotada sem `IntervalsIcuRateLimitException`
nem `DomainConflictException`; caso contrário avança até a última atividade processada. Nenhuma
atividade sem tentativa sai da janela de retry, e o ciclo seguinte não repete o que já foi feito.

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
`intervals-icu-activity-ingestion`.

### D4.1 — Os rate limits foram medidos, e o 1+N tem teto (2026-08-16)

A Open Question original dizia que o rate limit *"não é documentado publicamente"*. Ele está
documentado na tela do app 663:

```
2500 req / 15 min · 8000 req / dia · 100 req / usuário / dia · 10 chamadas/s por IP
```

O limite que morde é **100 requisições por usuário por dia** (default para até 500 usuários). O
limite global (mín. 8000/dia) sobra folgado no pilot; o per-user, não. Com `PT2H` são **12 ciclos/dia**:

| Cenário | Requisições no ciclo | Total no dia | Veredito |
|---|---:|---:|---|
| Regime de cruzeiro (poucas atividades novas/2h) | 1 lista + ~0 | ~12–15 | folgado |
| Primeiro ciclo, atleta de 3 treinos/semana (~39 em 90d) | 1 + 39 = 40 | ~51 | passa |
| Primeiro ciclo, atleta que treina todo dia (~90 em 90d) | 1 + 90 = 91 | **~102** | **estoura** |

**O problema não é estourar uma vez — é o laço.** A CA10 (correta, do pre-mortem) manda **não
avançar o cursor** quando há falha retryable, e 429 é retryable. Um atleta com histórico denso
estoura a cota no primeiro ciclo, o cursor não avança, e o **próximo ciclo repete a mesma janela de
90 dias** — mesmo custo, mesma falha, todo dia, consumindo a cota inteira daquele atleta sem nunca
completar a carga inicial. A proteção contra perda de dado vira, nesse caso, uma proteção contra
progresso.

**DECIDIDO em 2026-08-22 (`/implement init`, founder): teto por contagem.**

- `intervals-icu.sync-max-activities-per-cycle` (default **6**): máximo de atividades **ainda não
  importadas** que um ciclo busca e ingere por atleta. Já importadas (dedup por `externalId`,
  checado antes de qualquer HTTP) não contam nem custam.
- A listagem continua cobrindo a janela inteira (1 requisição); as pendentes são ordenadas por
  `start_date_local` ascendente e só as `N` primeiras entram no lote.
- O cursor avança para a data da última processada (ver D2/D3). Janela esgotada → `now()`.
- Custo máximo por atleta: **P + 6 req/ciclo**, com `P` = páginas da listagem. **Com `P = 1`:
  7 × 12 = 84/dia**, 16 de folga. `P = 1` é premissa — o gate 0.2 é bloqueante para esta conta,
  não só para o client: se a listagem paginar, recalcular `N` default (ou a cadência) antes do
  Bloco 2 e registrar aqui. Folga para o push ao
  relógio e o import manual, que consomem a mesma cota. Carga de 90 dias de um atleta diário termina
  em ~15 ciclos (~30h); de um atleta 3x/semana, em ~7 (~14h). O PMC cresce em ordem cronológica.

**Por que não fatiar por dias (a direção original desta seção):** o custo de um bloco de dias
depende do hábito do atleta — 7 dias de quem treina 2x/dia são 15 requisições — e o teto volta a
ser do provedor. Por contagem, o teto é do Menthoros. Um knob só; dois seriam redundantes.

**Por que não eliminar o refetch (a alternativa complementar) — refutada no código:**
`importarAtividade` chama `buscarAtividade(token, id, comIntervalos=true)`; os laps
(`icu_intervals`) só vêm com `?intervals=true` e a listagem não os traz. Mapear da listagem
perderia os laps de todo treino sincronizado. O 1+N fica, e é por isso que o teto é necessário.

**Residuais aceitos no DoR de 2026-08-22 (Codex), registrados para não serem "descobertos" depois:**

- *Cota compartilhada.* O mesmo token paga a listagem, o fetch, o push ao relógio e o import
  manual. 84/dia deixa 16 de folga, sem budget compartilhado. Se a folga não bastar num dia, o 429
  aborta o lote **com o cursor preservado** — o custo é atraso até o dia seguinte, não laço nem
  perda. O knob `sync-max-activities-per-cycle` permite apertar por env sem deploy. Budget por
  integração seria mecanismo novo; fora de escopo.
- *Falha permanente sem tombstone.* Uma atividade rejeitada (modalidade, 404) não é persistida, então
  reaparece como pendente enquanto estiver dentro do overlap de 1 dia do cursor — custa no máximo
  ~12 fetches (um por ciclo) e some quando o cursor passa. Durante a carga inicial o cursor passa por
  ela no mesmo ciclo (ela conta como processada). Tombstone exige schema; fora de escopo.

**Consequência para a CA7 e a CA10:** reescritas no proposal.md — a CA7 exige o teto e o cursor
parcial; a CA10 passa de "cursor não avança" para "cursor não passa da última processada".

## D5 — Exceções e classificação de erro (revisado pós pre-mortem)

Reusa as exceções já existentes (`IntervalsIcuRateLimitException`, `DomainConflictException`,
`DomainNotFoundException`, `DomainRuleViolationException`) lançadas por `buscarAtividade`/
`importarAtividade`. O scheduler não introduz exceção nova, mas classifica cada uma por se é
**retryable** (bloqueia avanço de cursor) ou **permanente** (isolada, não bloqueia):

| Exceção | Origem | Classificação | Efeito no lote do atleta |
|---|---|---|---|
| `IntervalsIcuRateLimitException` | `listarAtividades` ou `importarAtividade` (429/5xx/timeout) | Retryable | Aborta o restante do lote; cursor fica na última processada |
| `DomainConflictException` | Credencial revogada (401/403) ou precondição Strava-ativo-não-pausado | Retryable (estado pode mudar) | Aborta o restante do lote; cursor fica na última processada |
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
