# Tasks: intervals-icu-activity-sync-scheduler

Backend `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test` verde.
TDD: teste antes da implementação em cada bloco. Cada task tem uma linha `Verify:`.

Branch: `feature/intervals-icu-activity-sync-scheduler`, base `develop`. Sequência: Bloco 0.2 (gate
de contrato real da API) precede o Bloco 1; Bloco 1 (client) depende do gate; Bloco 2 (scheduler)
depende de 1; Bloco 3 (config) é paralelizável com 1-2; Bloco 4 (smoke/validação real) depende de
1-3; Bloco 5 (QA/entrega) depende de tudo.

## Bloco 0 — Spec / DoR

- [ ] 0.1 DoR (`spec-reviewer`) + pre-mortem cross-model (Codex) sobre proposal.md/design.md.
      Corrigir achados antes de abrir a branch.
      Verify: DoR = READY (com ou sem ressalvas registradas em proposal.md "Status"). **Rodada 1
      (Codex, 2026-07-20) concluída — 5 críticos + 5 moderados + 1 menor, todos corrigidos em
      design.md/proposal.md.**
- [ ] 0.2 **Gate de contrato real da API (achado crítico #2 do pre-mortem)** — antes de implementar
      `listarAtividades`, confirmar contra a API real do intervals.icu (atleta founder, mesmo padrão
      de gate usado em `intervals-icu-activity-ingestion` D6/gate 3.0):
      (a) `GET /api/v1/athlete/{id}/activities?oldest=&newest=` pagina para uma janela com muitas
      atividades (ex.: 90 dias)? Se sim, qual o mecanismo (header `Link`, campo `next`, tamanho fixo
      de página)?
      (b) `oldest`/`newest` filtram por `start_date_local` ou outro campo?
      (c) o payload da listagem tem os mesmos campos de `buscarAtividade` ou é um subconjunto?
      (d) como um 429 é sinalizado (status, headers de retry, escopo do limite)?
      Registrar o resultado em design.md D1 (substituir a suposição por fato observado) ANTES de
      escrever o Bloco 1.
      Verify: nota de gate em design.md D1 com evidência real (payload/headers observados), igual ao
      padrão do gate 3.0 da change anterior.

## Bloco 1 — Client: `listarAtividades` (D1)

- [ ] 1.1 Teste primeiro: `IntervalsIcuClientImplTest#listarAtividades` — sucesso (lista de
      `IcuActivityDto`, incluindo lista vazia), 401/403 (credencial inválida), 429/5xx/timeout
      (`IntervalsIcuRateLimitException`), verificando a URL exata
      (`/api/v1/athlete/{id}/activities?oldest=...&newest=...`) e que a API key nunca aparece em log.
      **Se o gate 0.2 confirmou paginação:** incluir teste de múltiplas páginas sendo consumidas até
      esgotar (mesmo padrão de `StravaActivityServiceImpl.java:280-312`).
      Verify: teste roda e falha (método ainda não existe).
- [ ] 1.2 Adicionar `listarAtividades(String apiKey, String externalAthleteId, LocalDate oldest,
      LocalDate newest)` à interface `IntervalsIcuClient` e implementar em `IntervalsIcuClientImpl`
      no mesmo padrão de `listarEventos` (`IntervalsIcuClientImpl.java:102-105`) — ver design.md D1.
      Se paginado (gate 0.2), implementar o loop de páginas aqui.
      Verify: `IntervalsIcuClientImplTest` do passo 1.1 verde.
- [ ] 1.3 Validação: `./mvnw clean test`.

## Bloco 2 — Scheduler: `IntervalsIcuActivitySyncScheduler` (D2, D3, D4, D5, D6, D7, D8)

- [ ] 2.1 Teste primeiro: late-check revalida `ativo` E `autoSyncPausado` (query fresca) — atleta com
      `ativo=false` OU `autoSyncPausado=true` é pulado, sem chamar o client. Cobre CA3.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.2 Teste primeiro: cursor incremental com overlap — atleta com `ultimaSincronizacao`
      preenchida usa essa data **menos `intervals-icu.sync-overlap-days`** como `oldest`; atleta sem
      `ultimaSincronizacao` usa o fallback `intervals-icu.sync-days-back` (mock do `@Value` ou teste
      de integração com property sobrescrita). Cobre CA6, CA7.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.3 Teste primeiro: isolamento por atividade PERMANENTE — uma `IcuActivityDto` no lote lança
      `DomainNotFoundException`/`DomainRuleViolationException` ao importar, as demais do MESMO atleta
      continuam sendo processadas E o cursor avança normalmente ao final. Cobre CA4.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.4 Teste primeiro: falha TRANSITÓRIA aborta o lote e bloqueia o cursor (achado crítico #1 +
      moderado #2 do pre-mortem) — uma atividade no meio do lote lança `IntervalsIcuRateLimitException`
      ou `DomainConflictException`; as atividades seguintes do MESMO lote NÃO são tentadas,
      `ultimaSincronizacao` não é atualizada, `lastSyncError` é gravado. Cobre CA10, CA12.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.5 Teste primeiro: conflito cross-fonte Strava é falha de atleta, não de atividade (achado
      crítico #5) — `importarAtividade` lança `DomainConflictException` pela precondição
      Strava-ativo-não-pausado; mesmo comportamento do teste 2.4 (aborta lote, cursor não avança).
      Cobre CA10.
      Verify: teste dedicado verde (pode reusar fixture de 2.4 com origem de exceção diferente).
- [ ] 2.6 Teste primeiro: isolamento por atleta — um atleta cuja chamada a `listarAtividades` lança
      exceção não impede o processamento dos demais atletas do ciclo; cursor desse atleta não avança.
      Cobre CA5, CA9.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.7 Teste primeiro: reload antes do save não ressuscita desconexão (achado crítico #3) — atleta
      é desconectado (`ativo=false`) entre o início do processamento do lote e o momento do save
      final; o scheduler não persiste `ultimaSincronizacao`/`syncActivityCount` nem reverte
      `ativo=false`. Cobre CA11.
      Verify: teste falha (classe ainda não existe) — simular via mock do repository retornando
      `ativo=true` na leitura inicial e `ativo=false`/vazio na releitura final.
- [ ] 2.8 Teste primeiro: `syncActivityCount` conta só importações NOVAS (achado moderado #4) —
      atividades já existentes (dedup) processadas no lote não incrementam o contador; usa
      contagem antes/depois no `TreinoRealizadoRepository`, não o número de chamadas bem-sucedidas a
      `importarAtividade`.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.9 Teste primeiro: multi-tenancy — dois atletas de tenants diferentes no mesmo ciclo,
      `TenantContext` correto em cada chamada a `importarAtividade` (spy/captor), limpo ao final.
      Cobre CA8.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.10 Teste primeiro: idempotência do dedup preservada — `importarAtividade` chamado para um
      `externalId` já existente não cria duplicata (reusa o comportamento já testado do serviço,
      apenas confirma que o scheduler não contorna a idempotência). Cobre CA2.
      Verify: teste falha (classe ainda não existe).
- [ ] 2.11 Implementar `IntervalsIcuActivitySyncScheduler` (`services/`) conforme design.md D2/D5/D8:
      método agendado `runDailyIncrementalSync`, loop por `findAllActiveByPlataforma(INTERVALS_ICU)`,
      método privado `syncAtleta` com a orquestração de lote (client → loop classificando exceção
      retryable vs. permanente → reload fresco → atualização condicional de
      `ultimaSincronizacao`/`syncActivityCount`/`lastSyncError`).
      Verify: testes 2.1-2.10 verdes.
- [ ] 2.12 Validação: `./mvnw clean test`.

## Bloco 3 — Configuração (D3)

- [ ] 3.1 Adicionar `intervals-icu.sync-days-back: ${INTERVALS_ICU_SYNC_DAYS_BACK:90}` e
      `intervals-icu.sync-overlap-days: ${INTERVALS_ICU_SYNC_OVERLAP_DAYS:1}` ao `application.yml`,
      espelhando `strava.sync-days-back` (`application.yml:257`).
      Verify: `./mvnw spring-boot:run` (ou teste de contexto) carrega as duas properties sem erro;
      teste de 2.2 usando override de property confirma o binding de ambas.
- [ ] 3.2 Adicionar `countByTenantIdAndAtletaIdAndFonteDados(UUID, UUID, FonteDados)` ao
      `TreinoRealizadoRepository` (query derivada Spring Data, sem migration) — usado pelo scheduler
      para a contagem por delta (design.md D2/D4).
      Verify: teste de repositório (ou uso direto no teste 2.8) confirma a contagem correta.

## Bloco 4 — Gate de validação real (smoke)

- [ ] 4.1 Smoke manual: com um atleta real conectado ao intervals.icu (mesmo atleta founder usado no
      smoke de `intervals-icu-activity-ingestion`), disparar o método agendado manualmente (ex.: via
      endpoint de teste temporário ou invocação direta em ambiente de dev) e confirmar que uma
      atividade nova aparece como `TreinoRealizado` sem ação manual.
      Verify: checklist documentado em proposal.md "Open Questions" ou no PR — pelo menos 1 ciclo
      real executado contra o provedor real, 0 duplicatas, `ultimaSincronizacao` atualizada.
- [ ] 4.2 Confirmar que o guard de `autoSyncPausado` herdado (D7) não quebra com o scheduler ativo —
      atleta com Strava ainda ativo (se houver algum em ambiente de smoke) não gera duplicata
      cross-fonte.
      Verify: inspeção manual dos registros criados (sem duas fontes para o mesmo treino) ou nota de
      "não aplicável" se não houver atleta nessa condição no ambiente de smoke.

## QA / entrega

- [ ] 5.1 `code-reviewer` (Java/Spring, CLAUDE.md do backend).
- [ ] 5.2 `security-reviewer` — foco em multi-tenancy do scheduler (D6) e não-vazamento de API key
      em logs (D1, D5).
- [ ] 5.3 `test-master` — cobertura dos cenários de isolamento e retry (CA4, CA5, CA10, CA12),
      não-ressurreição de desconexão (CA11) e idempotência (CA2).
- [ ] 5.4 Abrir PR (`feature/intervals-icu-activity-sync-scheduler` → `develop`), CI verde.
- [ ] 5.5 Atualizar este `tasks.md` com o que foi entregue vs. adiado antes de arquivar.

**DoD:** CA1–CA12 cobertos por teste; gate 0.2 (contrato real da API) documentado em design.md D1;
`./mvnw clean test` verde; smoke real executado (Bloco 4); PR mergeado em `develop`; change
arquivada em `changes/archive/YYYY-MM/`.
